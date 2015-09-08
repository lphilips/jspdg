/*
 * CPS_transform takes a Call Node (PDG node), that must
 * be transformed to CPS style call. 
 * @param call          : the call node
 * @param nodes         : nodes that are selected in the current program (slice)
 * @param transform     : object that contains
 *                          - transformF  : function used to transform nodes (e.g. to JavaScript, to Meteor, etc.)
 *                          - callbackF   : function that creates a new callback function
 *                          - asyncCallF  : function that creates a new async call (e.g. normal with extra callback param, rpc, etc.)  
 *                          - AST
 *                          - cps         : boolean indicating whether cps transformations should happen
 */

var CPSTransform = (function () {

    var cps_count = 0,
        module = {};

    function transformCall(call, nodes, transform, upnode, esp_exp) {
        var asyncCall   = transform.asyncCallF(call, call.name, []),
            callback    = transform.callbackF(cps_count),
            slicednodes = nodes,
            actual_ins  = call.getActualIn(),
            parent      = Ast.parent(call.parsenode, transform.AST),
            callargs    = actual_ins.flatMap(function (a_in) {
                            return a_in.callArgument()      
                        }),
            orig_esp_exp = esp_exp,
            callbackstms = [],
            datadep = [],
            datadeps = [],
            calldeps, vardecls, parsednode, transformargs, bodynode, nextcont;

        /* Add original arguments to async call */
        actual_ins.map(function(a_in) {
            asyncCall.addArg(a_in.parsenode);
        });

        /* Upnode is given + of type var decl, assignment, etc */
        if(upnode && upnode.dataDependentNodes) {
            /* Put it in callback, together with all statements dependent on the variable */
            datadeps = upnode.dataDependentNodes(false, true);
        }

        if (isBlockingCall(call)) {
            getRemainderStms(call).map(function (stm) {
                if (slicedContains(slicednodes, stm)) {
                   // if (upnode && upnode.dataDependentNodes && 
                    //    datadeps.length > 0) {
                        datadeps.push(stm);
                    //} else {
                      //  bodynode = transform.transformF(slicednodes, stm, transform.option); 
                      //  slicednodes = bodynode.nodes;
                      //  callbackstms = callbackstms.concat(bodynode);
                   // }
                    
                }
            });
        }


        /* Upnode is given + of type var decl, assignment, etc */
        if(upnode && upnode.dataDependentNodes) {
            /* Put it in callback, together with all statements dependent on the variable */
            // datadeps = datadeps.concat(upnode.dataDependentNodes(false, true));
            if (!esp_exp) {
                esp_exp = CPSgetExpStm(upnode.parsenode);
            }
            if (transform.shouldTransform(call))
                esp_exp = transformVar(esp_exp, call, cps_count);
            callback.addBodyStm(upnode.parsenode);
            slicednodes = removeNode(slicednodes, upnode);
        }
            /* Data depentent nodes */
            datadeps.map( function (node) {
                var incont = insideContinuation(call, node);

                if (incont && !nextcont && 
                    slicedContains(slicednodes, incont)) {
                        nextcont = incont;
                        datadep.push(nextcont);
                }

                else if(!(node.isActualPNode)) {
                    /* Has the node other outgoing dependencies on call nodes/ var decls? 
                       If so, transform the dependence and add it to callback body */
                    calldeps = node.edges_in.filter( function (e) {
                                return  e.equalsType(EDGES.DATA) && 
                                        e.from.isCallNode && 
                                        e.from.cnt !== upnode.cnt
                            }).map( function (e) { return e.from });
                    vardecls  = node.edges_in.filter( function (e) {
                                return  e.equalsType(EDGES.DATA) && e.from.parsenode && 
                                        (upnode ? e.from.cnt !== upnode.cnt : true) &&
                                        ( esp_isVarDecl(e.from.parsenode) ||
                                          esp_isVarDeclarator(e.from.parsenode) ||
                                          esp_isAssignmentExp(e.from.parsenode)) 
                            }).map( function (e) { return e.from });

                    datadep = datadep.concat(calldeps);
                    datadep = datadep.concat(vardecls);
                    datadep = datadep.concat(node);             
                }

                else {
                    var callnode = node.getCall()[0],
                        stm  = callnode.getStmNode();
                    if (stm.length > 0)
                        datadep = datadep.concat(stm);
                    else 
                        datadep = datadep.concat(callnode);
                }



            });
        

        datadep.map( function (n) {
                    if (slicedContains(slicednodes, n) && 
                        transform.shouldTransform(call)) {
                        bodynode = transform.transformF(slicednodes, n, transform.option); 
                        slicednodes = bodynode.nodes;
                        callbackstms = callbackstms.concat(bodynode);
                    }
        });

        /* Add the callback as last argument to the async call. */
        asyncCall.addArg(callback.parsenode);
        asyncCall.setCallback(callback);

        (function (callback) {
            asyncCall.parsenode.cont = function (node) {
                var respar = callback.getResPar(),
                    arg    = this.callnode,
                    transf = transformVar(arg.parsenode, call, respar.name.slice(-1));
                node.replaceArg(arg.expression[0], transf);
                callback.setBody([node.parsenode].concat(callback.getBody().slice(1)));
            }
        })(callback);

        parsednode = asyncCall;
        transformargs = transformArguments(callargs, parsednode, slicednodes, transform, upnode, esp_exp, call);
        parsednode = transformargs[1];
        slicednodes = transformargs[0];

        /* transformation of arguments changed esp_exp? */
        if (transformargs[2] && esp_exp === orig_esp_exp) 
            esp_exp = transformargs[2];

        

        if (isBlockingCall(call)) {
            if (bodynode) {
                callbackstms.map(function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (slicedContains(slicednodes, node.node) || node.parsednode.cont || 
                        node.node.edges_out.filter(function (e) {return e.to.isCallNode}).length > 0) {
                        asyncCall.getCallback().addBodyStm(node.parsednode)
                        slicednodes = removeNode(slicednodes, node.node)
                    }
                })
            }
            parsednode = asyncCall;
        }


        else if (callargs.length < 1 && !transform.shouldTransform(call)) {
            if (esp_isExpStm(parent)) {
                parent.expression = call.parsenode;
                call.parsenode = parent;
            }
            return [slicednodes, call, false]
        }

        else if (!transform.shouldTransform(call) && !parsednode) {
            return [slicednodes, call, false]
        }

        else if (!transform.shouldTransform(call) && parsednode) {
            if (bodynode) {
                callbackstms.map( function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (node.parsednode.cont || slicedContains(slicednodes, node.node) ||
                        node.node.edges_out.filter( function (e) {return e.to.isCallNode}).length > 0) {
                        parsednode.getCallback().addBodyStm(node.parsednode)
                        slicednodes = removeNode(slicednodes, node.node)
                    }
                })
            }
            parsednode.parsenode.callnode = call;
            return [slicednodes, parsednode, esp_exp]
        }

        else if (transform.shouldTransform(call) && !parsednode ||
            transform.shouldTransform(call) && callargs.length < 1) {
            if (bodynode) {
                callbackstms.map(function (node) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (slicedContains(slicednodes, node.node) || node.parsednode.cont || 
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
                    if (slicedContains(slicednodes, node.node)|| node.parsednode.cont || 
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
                    var cnode          = transformCall(callarg, slicednodes, transform, upnode),
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
                                        replc  = transformVar(latestcall.parsenode.callnode.parsenode, 
                                                               callarg, respar.name.slice(-1)),
                                        callb  = latestcall.getCallback();
                                    /* Do not replace callarg, but latestcall.callnode, because
                                       it could be that the callarg did not get transformed, but its argument did 
                                       e.g. node is of form  rpc(notransform(transform(x))),
                                       transform(x) should be replaced with latest result parameter  */
                                    node.replaceArg(latestcall.parsenode.callnode.parsenode, replc);
                                    node.callback.setBody(node.callback.getBody().concat(callb.getBody().slice(1)));
                                    callb.setBody([node.parsenode]);
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
            /* Take parent, because falafel can't handle an anonymous function */
            parent    = Ast.parent(parsenode, transform.AST),
            /* If parsenode is func decl (function foo() {}), then we don't need the parent.
               Only needed for cases var foo = function () {}) */
            funcstr   = esp_isFunDecl(parsenode) ? escodegen.generate(parsenode) : escodegen.generate(parent);
        
            /* If parent is an object property, transform it into var decl + function (for falafel) */
            if (esp_isProperty(parent)) {
                funcstr = parent.key.toString() + "=" + parsenode.toString();
            }

            /* Return statement in body should be replaced by callback call */
            func = falafel(funcstr, function (n) {
                var enclosingFun = getEnclosingFunction(n),
                    enclosingFunStr = escodegen.generate(enclosingFun);
                /* Don't transform return statements of nested function declarations / expressions */
                if (esp_isRetStm(n) && enclosingFunStr === escodegen.generate(func.parsenode)) 
                    /* First argument of callback is error */
                    if (n.argument)
                        n.update('return callback(null, ' + n.argument.source() + ')');
                    else
                        n.update('return callback(null)');
            })

            if (esp_isFunDecl(parsenode)) {
                method.setBody(esprima.parse(func.toString()).body[0].body.body);
            }
            else {
                method.setBody(esprima.parse(func.toString()).body[0].expression.right.body.body);
            }
            /* Parameters: callback should be added */
            method.addParams(parsenode.params.addLast({'type' : 'Identifier', 'name' : 'callback'}));

            return [nodes, method]
    }


    /* Aux function, returns function (if any) of given statement (parse node) */
    var getEnclosingFunction = function (parsenode) {
        var parent = parsenode;
        while(!esp_isProgram(parent)) {
            if (esp_isFunDecl(parent) || esp_isFunExp(parent)) {
                break;
            } else {
                parent = parent.parent;
            }
        }
        return parent; 
    }

    /* Aux function, indicating whether a statement is inside the continuation of a call annotated with @blocking */
    var insideContinuation = function (startingpoint, statement) {
        var remainder = getRemainderStms(startingpoint),
            cont      = false,
            passed    = false;
        remainder.map(function (remstm) {
            var comment = remstm.parsenode.leadingComment;
            if (comment && 
                Comments.isBlockingAnnotated(comment) &&
                !passed && !cont)
                cont = remstm;
            if (remstm.equals(statement))
                passed = true;
        })
        return cont;
    }


    /* Aux function, returns "remainder continuation statements" of current call (depending on where the call is located) */
    var getRemainderStms = function (callnode) {
        var ins     = callnode.getInEdges(EDGES.CONTROL).slice(),
            visited = [],
            passed = false,
            remainder = [],
            entry, body, remainder;
        while (ins.length > 0) {
            var edge = ins.shift(),
                from = edge.from;
            if (from.isEntryNode) {
                entry = from;
                break;
            }  
            else if (from.isDistributedNode) {
                entry = from;
                break;
            }
            else if (from.isStatementNode && esp_isTryStm(from.parsenode)) {
                entry = from;
                break;
            }
            else {
                from.getInEdges(EDGES.CONTROL).map(function (edge) {
                    if (!(contains(visited, edge))) {
                        visited.push(edge);
                        ins.push(edge);
                    }   
                })
            }
        };   
        body = entry.getOutEdges(EDGES.CONTROL)
            .map(function (e) {return e.to})
            .filter(function (n) {return !n.isFormalNode});
        body.map(function (bodynode) {
            if (bodynode.equals(callnode) || 
                esp_hasCallStm(bodynode, callnode.parsenode)) {
                passed = true;
            }
            else if (passed) {
                remainder.push(bodynode)
            }
        });
        return remainder;
    }

    /* Used to transform to a cps-form from server-> one client */
    var transformReplyCall = function (callnode, nodes, transform) {
        var entry     = callnode.enclosingEntry(),
            callentry = callnode.getEntryNode()[0],
            arity, transformCall;
        if (entry && entry.isServerNode() && callentry.isClientNode()) {
            arity = callnode.arity;
            if (arity && arityEquals(arity, ARITY.ONE)) {
                transformCall = transform.asyncReplyC();
                transformCall.setName(callnode.name);
                transformCall.addArgs(callnode.parsenode.arguments);
                return [nodes, transformCall]
            }
        }
        return [nodes, callnode.parsenode]
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
        if (esp_isVarDecl(parsenode))
            return parsenode.declarations[0].init

        else if (esp_isVarDeclarator(parsenode)) {
            return parsenode.init
        }

        else if (esp_isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (esp_isAssignmentExp(exp)) 
                return exp.right 

            else if (esp_isBinExp) 
                return exp
        }

        else if (esp_isRetStm(parsenode)) {
            return parsenode.argument
        }
    }


    var CPSsetExpStm = function (parsenode, newexp) {
        if(esp_isVarDecl(parsenode)) {
            newexp.leadingComment = parsenode.declarations[0].leadingComment;
            parsenode.declarations[0].init = newexp
        }

        else if (esp_isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (esp_isAssignmentExp(exp)) 
                exp.right = newexp
            else if (esp_isBinExp) 
                parsenode.expression = newexp
        }
        else if (esp_isRetStm(parsenode)) {
            parsenode.argument = newexp
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

        if (orig.length !== e_str.length) {
            var diff = orig.length - e_str.length;
            r_idxs = r_idxs - diff;
            r_idxe = r_idxe - diff;
        }

        var newexp = e_str.slice(0, r_idxs-e_idxs) + escodegen.generate(newsubexp) + e_str.slice(r_idxe + 1 - e_idxs),
            parsed = esprima.parse(newexp).body[0].expression;
        parsed.range = toreplace.range;

        return parsed;
    }

    var  isBlockingCall = function (callnode) {
        return callnode.parsenode.leadingComment && Comments.isBlockingAnnotated(callnode.parsenode.leadingComment)
    }

    var slicedContains = function (nodes,node) {
        return nodes.filter(function (n) {

            if (n.isCallNode) {

                return n.parsenode === node.parsenode

            } else

                return n.id === node.id

        }).length > 0
    }

    var removeNode = function (nodes,node) {
        var callnode = false;

        nodes = nodes.remove(node);
        nodes.map(function (n) {

            if(n.parsenode) {
                var parent = Ast.parent(n.parsenode,graphs.AST);
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
    module.transformReplyCall = transformReplyCall;

    return module;

})();
