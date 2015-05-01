var PromiseTransform = (function () {

    var cps_count = 0,
        module = {};


    function transformCall(call, nodes, transform, upnode, esp_exp) {
        var asyncCall   = transform.asyncCallF(call, call.name, []),
            callback    = transform.callbackF(cps_count),
            slicednodes = nodes,
            actual_ins  = call.getActualIn(),
            scopeInfo   = Ast.scopeInfo(call.parsenode),
            parent      = Ast.hoist(scopeInfo).parent(call.parsenode, transform.AST),
            callargs    = actual_ins.flatMap(function (a_in) {
                            return a_in.callArgument()      
                        }),
            orig_esp_exp = esp_exp,
            callbackstms = [],
            datadep = [],
            datadeps, calldeps, vardecls, parsednode, transformargs, bodynode;

        /* Add original arguments to async call */
        actual_ins.map(function(a_in) {
            asyncCall.addArg(a_in.parsenode);
        })


        /* Upnode is given + of type var decl, assignment, etc */
        if(upnode && upnode.dataDependentNodes) {
            /* Put it in callback, together with all statements dependent on the variable */
            datadeps = upnode.dataDependentNodes(false, true);
            if (!esp_exp) {
                esp_exp = CPSgetExpStm(upnode.parsenode)
            }
            if (transform.shouldTransform(call))
                esp_exp = transformVar(esp_exp, call, cps_count);
            callback.addBodyStm(upnode.parsenode);
            slicednodes = removeNode(slicednodes, upnode);
            /* Data depentent nodes */
            datadeps.map(function (node) {
                if(!(node.isActualPNode)) {
                    /* Has the node other outgoing dependencies on call nodes/ var decls? 
                       If so, transform the dependence and add it to callback body */
                    calldeps = node.edges_in.filter(function (e) {
                                return  e.equalsType(EDGES.DATA) && 
                                        e.from.isCallNode && 
                                        e.from.cnt !== upnode.cnt
                            }).map(function (e) { return e.from });
                    vardecls  = node.edges_in.filter(function (e) {
                                return  e.equalsType(EDGES.DATA) && e.from.parsenode && 
                                        e.from.cnt !== upnode.cnt &&
                                        esp_isVarDecl(e.from.parsenode) //TODO : assignment?
                            }).map(function (e) { return e.from });

                    datadep = datadep.concat(calldeps);
                    datadep = datadep.concat(vardecls);
                    datadep = datadep.concat(node);             
                }
                else {
                    var callnode = node.getCall()[0],
                        stm  = callnode.getStmNode();
                    if (stm.length > 0)
                        datadep = datadep.concat(stm)
                    else 
                        datadep = datadep.concat(callnode)
                }
                datadep.map( function (n) {
                    if (slicedContains(slicednodes, n) && transform.shouldTransform(call)) {
                        bodynode = transform.transformF(slicednodes, n, transform.option); 
                        slicednodes = bodynode.nodes;
                        callbackstms = callbackstms.concat(bodynode);}
                })

            })
        }
        /* Add the callback as last argument to the async call. */
        asyncCall.addArg(callback.parsenode)
        asyncCall.setCallback(callback);
        (function (callback) {
            asyncCall.parsenode.cont = function (node) {
                var respar = callback.getResPar(),
                    arg    = this.callnode,
                    transf = transformVar(arg.parsenode, call, respar.name.slice(-1));
                node.replaceArg(arg.expression[0], transf);
                callback.setBody([node.parsenode].concat(callback.getBody().slice(1)))
            }
        })(callback)
        parsednode = asyncCall;
        transformargs = transformArguments(callargs, parsednode, slicednodes, transform, upnode, esp_exp, call);
        parsednode = transformargs[1];
        slicednodes = transformargs[0];
        /* transformation of arguments changed esp_exp? */
        if (transformargs[2] && esp_exp === orig_esp_exp) 
            esp_exp = transformargs[2];


        if (callargs.length < 1 && !transform.shouldTransform(call)) {
            return [slicednodes, call, false]
        }

        if (!transform.shouldTransform(call) && !parsednode) {
            return [slicednodes, call, false]
        }

        if (!transform.shouldTransform(call) && parsednode) {
            if (bodynode) {
                callbackstms.map(function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (node.parsednode.cont || slicedContains(slicednodes, node.node) ||
                        node.node.edges_out.filter(function (e) {return e.to.isCallNode}).length > 0) {
                        parsednode.getCallback().addBodyStm(node.parsednode)
                        slicednodes = removeNode(slicednodes, node.node)
                    }
                })
            }
            parsednode.parsenode.callnode = call;
            return [slicednodes, parsednode, esp_exp]
        }

        if (transform.shouldTransform(call) && !parsednode ||
            transform.shouldTransform(call) && callargs.length < 1) {
            if (bodynode) {
                callbackstms.map(function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (node.parsednode.cont || slicedContains(slicednodes, node.node)||
                        node.node.edges_out.filter(function (e) {return e.to.isCallNode}).length > 0) {
                        asyncCall.getCallback().addBodyStm(node.parsednode)
                        slicednodes = removeNode(slicednodes, node.node)
                    }
                })
            }
            parsednode = asyncCall
        }
        else {
            /* Add data and call dependencies in returned callback body */
            if (bodynode) {
                callbackstms.map(function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (node.parsednode.cont || slicedContains(slicednodes, node.node)||
                        node.node.edges_out.filter(function (e) {return e.to.isCallNode}).length>0) {
                        asyncCall.getCallback().addBodyStm(node.parsednode)
                        slicednodes = removeNode(slicednodes, node.node)
                    }
                })
            }
            parsednode.parsenode.cont(asyncCall)
            parsednode.parsenode.cont = asyncCall.parsenode.cont
            parsednode.parsenode.callnode = call;
        }
        return [slicednodes, parsednode, esp_exp]
    }

    /*
     * Walks over arguments of a call. If any (or more) of the arguments is a call,
     * they should be transformed as well.
     * The resulting transformation is inside out => c1(c2(c3(c4))) will be transformed to
     * first c4, then c3 with the result of c4, then c2 with the result of c3, then c1 with
     * the result of c2.
     */
    var transformArguments = function (callargs, parsednode, slicednodes, transform, upnode, orig_esp_exp, call) {
        /* Call node has arguments that are calls? */
        if (callargs.length > 0) {
            var latestcall = false,
                esp_exp;
            callargs.map(function (callarg) {
                    cps_count++;
                    var cnode          = transformCall(callarg, slicednodes, transform, upnode), //transform.transformF(slicednodes, callarg, transform.cps),
                        hasCallArg     = callarg.getActualIn().flatMap(function (a_in) {
                                            return a_in.callArgument()      
                                        }),
                        transformcall  = cnode[1],
                        transformcallp;
                    if (cnode[2]) {
                        transformcallp  = transformcall.parsenode;
                        esp_exp = cnode[2];
                        /* Has transformed call arguments itself? */
                        if (hasCallArg.length > 0) {
                            if (!latestcall) 
                                latestcall = transformcall

                        } else {
                            if (!latestcall) {
                                latestcall = transformcall;
                                transformcallp.cont = function (node) {
                                    var respar = latestcall.getCallback().getResPar(),
                                        replc = transformVar(latestcall.parsenode.callnode.parsenode, callarg , respar.name.slice(-1))// cps_count);
                                    /* Do not replace callarg, but latestcall.callnode, because
                                       it could be that the callarg did not get transformed, but its argument did 
                                       e.g. node is of form  rpc(notransform(transform(x))),
                                       transform(x) should be replaced with latest result parameter  */
                                    node.replaceArg(latestcall.parsenode.callnode.parsenode, replc)
                                    latestcall.getCallback().setBody([node.parsenode]);
                                }
                            }
                            else { 
                                /* If this arguments is part of a call with 
                                    multiple call arguments, we must add data and call dep statements
                                   from callback of latestcall to new callback */
                                if(call.getActualIn().length > 1) {
                                    var body = latestcall.getCallback().getBody().slice(1);
                                    body.map(function (stm) {
                                        transformcall.getCallback().addBodyStm(stm)
                                    })
                                }
                                latestcall.parsenode.cont(transformcall);
                                latestcall.parsenode.cont = function (node) {
                                    var callbackb = transformcall.getCallback().getBody().slice(1);
                                    if(callbackb.length > 0) {
                                        callbackb.map(function (stm) {
                                            node.getCallback().addBodyStm(stm)
                                        })
                                    }
                                    var respar = latestcall.getCallback().getResPar();
                                    node.replaceArg(latestcall.parsenode.callnode.parsenode, respar);
                                    transformcall.getCallback().setBody([node.parsenode]);
                                }
                                if(call.getActualIn().length > 1) {
                                    var respar = transformcall.getCallback().getResPar(),
                                        cont   = latestcall.parsenode.cont;
                                    latestcall.parsenode.cont = function (node) {
                                        node.replaceArg(transformcall.parsenode.callnode.parsenode, respar);
                                        cont(node);
                                    }
                                }
                            }
                        }
                    }
                    else {
                        if (latestcall && !latestcall.isRPC)
                            latestcall = false;
                    }
                slicednodes = removeNode(cnode[0], callarg);
                })
            parsednode = latestcall;
        }
        return [slicednodes, parsednode, esp_exp];

    }

    var transformFunction = function (func, nodes, transform) {
        var method    = transform.asyncFuncF(),
            parsenode = func.parsenode,
            scopeInfo = Ast.scopeInfo(parsenode),
            parent    = Ast.hoist(scopeInfo).parent(parsenode, transform.AST),
            funcstr   = escodegen.generate(parent);
            
            /* Return statement in body should be replaced by callback call */
            func = falafel(funcstr, function (n) {
                // TODO check parent (don't transform return statement in nested function def)
                if (esp_isRetStm(n)) 
                    n.update('return new Promise(function (fulfill, reject) {fulfill( ' + n.argument.source() + ')})')
            })
            method.setBody(esprima.parse(func.toString()).body[0].expression.right.body.body);
            method.addParams(parsenode.params);
            return [nodes, method]
    }

    /* Used for expression with calls :
     * variable declarations, assignments, binary expressions (currently supported by Jipda) 
     */

    var transformExp = function (node, nodes, transform) {
        var parsenode = node.parsenode,
            calls     = node.edges_out.filter(function (e) {
                            return  e.equalsType(EDGES.CONTROL) &&
                                    e.to.isCallNode
                        }),
            local_count = cps_count,
            outercps, innercps;
        cps_count = 0;
        calls.map( function (edge) {
            var call = edge.to;
            cps_count += 1;
            if (slicedContains(nodes, call)) {
                var exp = CPSgetExpStm(parsenode),
                    cps = transformCall(call, nodes, transform, node, exp);
                    if (cps[2]) CPSsetExpStm(parsenode, cps[2]);
                    nodes = removeNode(cps[0], call);
                    if (outercps) {
                        var callback = outercps.callback;
                        if (outercps.parsenode.cont) {
                            if( cps[1].getCallback) {
                                cps[1].parsenode.cont(outercps)
                                outercps = cps[1] 
                            }           
                        }                       
                    }
                    /* If transformed, change the outercps */
                    else if (cps[1].getCallback) {
                        outercps =  cps[1];
                    }
                }
            })
        cps_count = local_count;
        if (outercps)
            return [nodes, outercps]
        else
            return [nodes, node]
    }


    var CPSgetExpStm = function (parsenode) {
        if(esp_isVarDecl(parsenode))
            return parsenode.declarations[0].init

        else if (esp_isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (esp_isAssignmentExp(exp)) 
                return exp.right 
            else if (esp_isBinExp) 
                return exp
        }
    }


    var CPSsetExpStm = function (parsenode, newexp) {
        if(esp_isVarDecl(parsenode))
            parsenode.declarations[0].init = newexp

        else if (esp_isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (esp_isAssignmentExp(exp)) 
                exp.right = newexp
            else if (esp_isBinExp) 
                parsenode.expression = newexp
        }
    }


    /* Aux function : replaces occurence of expression with "resx" paremeter */
    var transformVar = function (expression, toreplace, cnt) {
        var e_str = escodegen.generate(expression),
            r_str = escodegen.generate(toreplace.parsenode),
            idx   = e_str.indexOf(r_str),
            newexp, parsed;
        if (idx >= 0) {
            newexp = e_str.slice(0,idx) + 'res' + cnt + e_str.slice(idx + r_str.length);
            parsed = esprima.parse(newexp).body[0].expression;
           return parsed;
        }
        else {
            return expression;
        }
    }


    var transformSubExp = function (expression, toreplace, newsubexp, originalexp) {
        var r_idxs = toreplace.range[0],
            r_idxe = toreplace.range[1],
            e_idxs = expression.range[0],
            e_idxe = expression.range[1],
            e_str  = escodegen.generate(expression),
            orig   = escodegen.generate(originalexp);
        if(orig.length !== e_str.length) {
            var diff = orig.length - e_str.length;
            r_idxs = r_idxs - diff;
            r_idxe = r_idxe - diff;
        }
        var newexp = e_str.slice(0, r_idxs-e_idxs) + escodegen.generate(newsubexp) + e_str.slice(r_idxe + 1 - e_idxs),
            parsed = esprima.parse(newexp).body[0].expression;
        parsed.range = toreplace.range;
        return parsed;
    }


    var slicedContains = function (nodes,node) {
        return nodes.filter(function (n) {
            if(n.isCallNode) {
                return n.parsenode === node.parsenode
            } else
            return n.id === node.id
        }).length > 0
    }

    var removeNode = function (nodes,node) {
        nodes = nodes.remove(node);
        var callnode = false;
        nodes.map(function (n) {
            if(n.parsenode) {
            var scopeInfo = Ast.scopeInfo(n.parsenode),
                parent = Ast.hoist(scopeInfo).parent(n.parsenode,graphs.AST);
            if(n.isCallNode && (n.parsenode === node.parsenode || parent === node.parsenode)) {
                callnode = n
            }
        }
        });
        return nodes;
    }



    module.transformCall      = transformCall;
    module.transformArguments = transformArguments;
    module.transformFunction  = transformFunction;
    module.transformExp       = transformExp;
    module.setExpStm          = CPSsetExpStm;

    return module;

})();