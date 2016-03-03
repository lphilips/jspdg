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
        toreturn = {};

    function transformCall(transpiler, upnode, esp_exp) {
        var callnode     = transpiler.node,
            asyncCall    = transpiler.parseUtils.createRPC(callnode)(callnode, callnode.name, []),
            parsenode    = Pdg.getCallExpression(callnode.parsenode),
            callback     = transpiler.parseUtils.createCallback(cps_count),
            nodes        = transpiler.nodes,
            actual_ins   = callnode.getActualIn(),
            parent       = Ast.parent(callnode.parsenode, transpiler.ast),
            callargs     = actual_ins.flatMap(function (a_in) {
                            return a_in.callArgument()      
                           }),
            orig_esp_exp = esp_exp,
            callbackstms = [],
            datadep      = [],
            datadeps     = [],
            entry        = getEntryNode(callnode),
            calledEntry  = callnode.getEntryNode()[0],
            calldeps, vardecls, transpiledNode, transformargs, transpiled, nextcont;

        /* Add original arguments to async call */
        actual_ins.map(function(a_in) {
            asyncCall.addArg(a_in.parsenode);
        });

        /* Upnode is given + of type var decl, assignment, etc */
        if(upnode && upnode.dataDependentNodes) {
            /* Put it in callback, together with all statements dependent on the variable */
            datadeps = upnode.dataDependentNodes(false, true);
        }


        /* If the call is annotated with @blocking OR the function has side-effects, 
           we take the remainder of the program (or current scope) as its continuation */
        if (isBlockingCall(callnode) || 
            ( calledEntry && 
            InterferenceAnalysis.doesInterfere(calledEntry.parsenode, parsenode.arguments, transpiler.ast))) {
            getRemainderStms(callnode).map(function (stm) {
                if (nodesContains(nodes, stm))
                     datadeps.push(stm);
            });
        }


        /* Upnode is given + of type var decl, assignment, etc */
        if(upnode && upnode.dataDependentNodes) {
            /* Put it in callback, together with all statements dependent on the variable */
            // datadeps = datadeps.concat(upnode.dataDependentNodes(false, true));
            if (!esp_exp) {
                esp_exp = CPSgetExpStm(upnode.parsenode);
            }
            if (transpiler.parseUtils.shouldTransform(callnode))
                esp_exp = transformVar(esp_exp, callnode, cps_count);
            callback.addBodyStm(upnode.parsenode);
            nodes = nodes.remove(upnode);
        }
        /* Data dependent nodes */
        datadeps.map( function (node) {
            var incont = insideContinuation(callnode, node),
                dataentry = getEntryNode(node),
                datanodes;

            if (incont && !nextcont && 
                nodesContains(nodes, incont)) {
                    nextcont = incont;
                    datadep.push(nextcont);
            }

            else if (node.isCallNode) {
                node.getActualIn().map(function (a_in) {
                    a_in.getInNodes(EDGES.DATA).map(function (n) {
                        datadep.push(n);
                    });
                });

                if (!nodesContains(datadep, node)) {
                        datadep.push(node);
                        if (node.dataDependentNodes)  {
                            datanodes = node.dataDependentNodes();
                            datanodes.map(function (n) {
                                if (!nodesContains(datadep, n) && !n.isActualPNode)
                                    datadep.push(n);
                            })
                        }

                    }
            }

            else if(!node.isActualPNode) {
                /* Has the node other outgoing dependencies on call nodes/ var decls? 
                   If so, transform the dependence and add it to callback body */
                calldeps = node.getInNodes(EDGES.DATA)
                                .filter( function (n) {
                                    n.isCallNode && 
                                    n.cnt !== upnode.cnt
                        });
                vardecls  = node.getInNodes(EDGES.DATA)
                                .filter( function (n) {
                                    return n.parsenode && 
                                    (upnode ? n.cnt !== upnode.cnt : true) &&
                                    ( Aux.isVarDecl(n.parsenode) ||
                                      Aux.isVarDeclarator(n.parsenode) ||
                                      Aux.isAssignmentExp(n.parsenode)) 
                        });

                calldeps.concat(vardecls).map(function (node) {
                    var nodeEntry = getEntryNode(node),
                        datas;
                    if (!nodeEntry.equals(entry)) {
                        /* TODO datadep nodeEntry ook meenemen */
                        if (!nodesContains(datadep, nodeEntry)) {
                            datadep.push(nodeEntry);
                            datadep = datadep.concat(nodeEntry.getCalls());
                        }
                    } else  if (!nodesContains(datadep, node)) {
                        datadep.push(node);
                        if (node.dataDependentNodes)  {
                            datas = node.dataDependentNodes();
                            datas.map(function (n) {
                                if (!nodesContains(datadep, n) && !n.isActualPNode)
                                    datadep.push(n);
                            })
                        }

                    }
                });

                if (!dataentry.equals(entry) && (calledEntry ? !calledEntry.equals(dataentry) : true) &&
                    !hasAsReturnValue(dataentry, node)) {
                    if (!nodesContains(datadep, dataentry)) {
                        datadep.push(dataentry);
                        if (dataentry.getCalls)
                            datadep = datadep.concat(dataentry.getCalls());
                    }
                }
                /* Do not add in continuation if node was already in datadep or 
                   as the node is an object entry that is the result of a function call  */
                else if (!nodesContains(datadep, node) && !(node.isObjectEntry && hasAsReturnValue(dataentry, node)))
                    datadep.push(node);             
            }

            else {
                var nodecall = node.getCall()[0],
                    stm  = nodecall.getStmNode();
                if (stm.length > 0)
                    datadep = datadep.concat(stm);
                else 
                    datadep = datadep.concat(nodecall);
            }



        });
        
        /* Sort on original order */
        datadep.sort(function (n1, n2) {
                        return n1.cnt - n2.cnt;
        })

        datadep.map( function (n) {
            var transpilerDataDep = Transpiler.copyTranspileObject(transpiler, n, nodes);
            if (nodesContains(nodes, n) && 
                transpiler.parseUtils.shouldTransform(callnode)) {
                transpiled = Transpiler.transpile(transpilerDataDep);
                nodes = transpiled.nodes;
                callbackstms = callbackstms.concat(transpiled);
            }
        });

        /* Add the callback as last argument to the async call. */
        asyncCall.addArg(callback.parsenode);
        asyncCall.setCallback(callback);

        (function (callback) {
            asyncCall.parsenode.cont = function (node) {
                var respar = callback.getResPar(),
                    arg    = this.callnode,
                    transf = transformVar(arg.parsenode, callnode, respar.name.slice(-1));
                node.replaceArg(arg.parsenode, transf);
                callback.setBody([node.parsenode].concat(callback.getBody().slice(1)));
            }
        })(callback);

        transpiledNode = asyncCall;
        transformargs = transformArguments(callargs, transpiledNode, nodes, transpiler, upnode, esp_exp, callnode);
        transpiledNode = transformargs[1];
        nodes = transformargs[0];

        /* transformation of arguments changed esp_exp? */
        if (transformargs[2] && esp_exp === orig_esp_exp) 
            esp_exp = transformargs[2];


        if (isBlockingCall(callnode)) {
            if (transpiled) {
                callbackstms.map(function (transpiled) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (nodesContains(nodes, transpiled.node) || transpiled.transpiledNode.cont || 
                        transpiled.node.edges_out.filter(function (e) {return e.to.isCallNode}).length > 0) {

                        asyncCall.getCallback().addBodyStm(transpiled.transpiledNode);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode = asyncCall;
        }


        else if (callargs.length < 1 && !transpiler.parseUtils.shouldTransform(callnode)) {
            if (Aux.isExpStm(parent)) {
                parent.expression = callnode.parsenode;
                callnode.parsenode = parent;
            }
            return [nodes, callnode, false];
        }

        else if (!transpiler.parseUtils.shouldTransform(callnode) && !transpiledNode) {
            return [nodes, callnode, false];
        }

        else if (!transpiler.parseUtils.shouldTransform(callnode) && transpiledNode) {
            if (transpiled) {
                callbackstms.map( function (transpiled) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (transpiled.transpiledNode.cont || nodesContains(nodes, transpiled.node) ||
                        transpiled.node.edges_out.filter( function (e) {return e.to.isCallNode}).length > 0) {
                        transpiledNode.getCallback().addBodyStm(transpiled.transpiledNode);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode.parsenode.callnode = callnode;//transpiledNode;
            return [nodes, transpiledNode, esp_exp];
        }

        else if (transpiler.parseUtils.shouldTransform(callnode) && !transpiledNode ||
            transpiler.parseUtils.shouldTransform(callnode) && callargs.length < 1) {
            if (transpiled) {
                callbackstms.map(function (transpiled) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (nodesContains(nodes, transpiled.node) || transpiled.transpiledNode.cont || 
                        transpiled.node.edges_out.filter(function (e) {return e.to.isCallNode}).length > 0) {
                        asyncCall.getCallback().addBodyStm(transpiled.transpiledNode);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode = asyncCall;
        }



        else {
            /* Add data and call dependencies in returned callback body */
            if (transpiled) {
                callbackstms.map(function (transpiled) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (nodesContains(nodes, transpiled.node)|| transpiled.transpiledNode.cont || 
                        transpiled.node.edges_out.filter(function (e) {return e.to.isCallNode}).length>0) {
                        asyncCall.getCallback().addBodyStm(transpiled.transpiledNode);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode.parsenode.cont(asyncCall);
            transpiledNode.parsenode.cont = asyncCall.parsenode.cont;
            transpiledNode.parsenode.callnode = callnode;
        }
        return [nodes, transpiledNode, esp_exp]
    }

    /*
     * Walks over arguments of a call. If any (or more) of the arguments is a call,
     * they should be transformed as well.
     * The resulting transformation is inside out => c1(c2(c3(c4))) will be transformed to
     * first c4, then c3 with the result of c4, then c2 with the result of c3, then c1 with
     * the result of c2.
     */
    var transformArguments = function (callargs, transpiledNode, nodes, transpiler, upnode, orig_esp_exp, call) {
        /* Call node has arguments that are calls? */
        if (callargs.length > 0) {
            var latestcall = false,
                esp_exp;

            callargs.map(function (callarg) {
                    cps_count++;
                    var transpilerArg  = Transpiler.copyTranspileObject(transpiler, callarg, nodes); 
                    var transpiled     = transformCall(transpilerArg, upnode, orig_esp_exp), 
                        hasCallArg     = callarg.getActualIn().flatMap(function (a_in) {
                                            return a_in.callArgument()      
                                        }),
                        transformcall  = transpiled[1],
                        transformcallp;
                    if (transpiled[2]) {
                        transformcallp  = transformcall.parsenode;
                        esp_exp = transpiled[2];
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

                nodes = transpiled[0].remove(callarg);
                })

            transpiledNode = latestcall;
        }

        return [nodes, transpiledNode, esp_exp];

    }

    var transformFunction = function (transpiler) {
        var method    = transpiler.parseUtils.createAsyncFunction(),
            func      = transpiler.node,
            parsenode = func.parsenode,
            /* Take parent, because falafel can't handle an anonymous function */
            parent    = Ast.parent(parsenode, transpiler.ast),
            /* If parsenode is func decl (function foo() {}), then we don't need the parent.
               Only needed for cases var foo = function () {}) */
            funcstr   = Aux.isFunDecl(parsenode) ? escodegen.generate(parsenode) : escodegen.generate(parent);
        
            /* If parent is an object property, transform it into var decl + function (for falafel) */
            if (Aux.isProperty(parent)) {
                funcstr = parent.key.toString() + "=" + parsenode.toString();
            }

            Aux.walkAst(func.parsenode, {
                post : function (node) {
                    var enclosingFun = getEnclosingFunction(node, transpiler.ast);
                    if (enclosingFun)
                        Ast.augmentAst(enclosingFun);
                    if (enclosingFun && 
                        Aux.isRetStm(node) && 
                        enclosingFun.equals(func.parsenode)) {
                            /* Make sure methods like equal, hashcode are defined on the node*/
                            Ast.augmentAst(enclosingFun);
                            /* callnode property is added if return statement is already transformed to a cps call 
                               No need to wrap it in a callback call again */
                            if (node.argument && !node.callnode) {
                                node.type = "ReturnStatement";
                                node.argument = transpiler.parseUtils.createCbCall('callback', {type: 'Literal', value: null}, node.argument);
                            }
                            /* callnode property is added if return statement is already transformed to a cps call 
                               No need to wrap it in a callback call again */
                            else if (!node.callnode) {
                                node.type = "ReturnStatement";
                                node.argument = transpiler.parseUtils.createCbCall('callback', {type: 'Literal', value: null}, node.argument);
                            }
                    }
                }
            })

            if (Aux.isFunDecl(parsenode) || Aux.isFunExp(parsenode)) {
                method.setBody(func.parsenode.body.body);
            }
            else if (Aux.isProperty(parent)) {
                method.setBody(func.parsenode.body.body);
            }

            else {
                method.setBody(func.parsenode.body[0].expression.right.body.body);
            }
            /* Parameters: callback should be added */
            method.addParams(parsenode.params.addLast({'type' : 'Identifier', 'name' : 'callback'}));

            return [transpiler.nodes, method];
    }


    /* Aux function, returns function (if any) of given statement (parse node) */
    var getEnclosingFunction = function (parsenode, ast) {
        var parent = parsenode;
        while(parent && !Aux.isProgram(parent)) {
            if (Aux.isFunDecl(parent) || Aux.isFunExp(parent)) {
                break;
            } else {
                parent = Ast.parent(parent, ast);
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


    var getEntryNode = function (node) {
        var ins = node.getInEdges(EDGES.CONTROL)
                .concat(node.getInEdges(EDGES.OBJMEMBER))
                .slice(),
            visited = [],
            entry;
        if (node.isObjectEntry && ins.length == 0) 
            return node
        while (ins.length > 0) {
            var edge = ins.shift(),
                from = edge.from;
            if (from.isEntryNode || from.isDistributedNode || 
                from.isObjectEntry ||
                from.isStatementNode && Aux.isTryStm(from.parsenode)) {
                entry = from;
                break;
            } else {
                from.getInEdges(EDGES.CONTROL)
                    .map(function (edge) {
                        if (!(Aux.contains(visited, edge))) {
                            visited.push(edge);
                            ins.push(edge);
                        }   
                })
            }
        }
        return entry;
    }

    /* Aux function, returns "remainder continuation statements" of current call (depending on where the call is located) */
    var getRemainderStms = function (callnode) {
        var ins       = callnode.getInEdges(EDGES.CONTROL).slice(),
            visited   = [],
            passed    = false,
            remainder = [],
            entry     = getEntryNode(callnode), 
            body, remainder; 
        body = entry.getOutEdges(EDGES.CONTROL)
            .map(function (e) {return e.to})
            .filter(function (n) {return !n.isFormalNode});
        body.map(function (bodynode) {
            if (bodynode.equals(callnode) || 
                Aux.hasCallStm(bodynode, callnode.parsenode)) {
                passed = true;
            }
            else if (passed) {
                remainder.push(bodynode)
            }
        });
        return remainder;
    }

    /* Used to transform to a cps-form from server-> one client */
    var transformReplyCall = function (callnode, nodes, transpiler) {
        var entry     = callnode.enclosingEntry(),
            callentry = callnode.getEntryNode()[0],
            parsenode = Pdg.getCallExpression(callnode.parsenode),
            arity, transformCall;
        if (entry && entry.isServerNode() && callentry.isClientNode()) {
            arity = callnode.arity;
            if (arity && arityEquals(arity, ARITY.ONE)) {
                transformCall = transpiler.parseUtils.createAsyncReplyCall();
                transformCall.setName(callnode.name);
                transformCall.addArgs(parsenode.arguments);
                return [nodes, transformCall];
            }
        }
        return [nodes, callnode.parsenode]
    }

    /* Used for expression with calls :
     * variable declarations, assignments, binary expressions  
     */

    var transformExp = function (transpiler) {
        var node      = transpiler.node,
            parsenode = node.parsenode,
            calls     = node.getOutNodes(EDGES.CONTROL)
                            .filter(function (n) {
                                return  n.isCallNode;
                        }),
            local_count = cps_count,
            nodes     = transpiler.nodes,
            outercps, innercps;

        cps_count = 0;
        calls.map( function (call) {
            cps_count += 1;

            if (nodesContains(nodes, call)) {
                var exp = CPSgetExpStm(parsenode),
                    error  = {type : 'Literal', value:  null},
                    transpilerCall = Transpiler.copyTranspileObject(transpiler, call, nodes),
                    transpiled = transformCall(transpilerCall, node, exp);

                    if (Aux.isRetStm(parsenode) && transpiled[1].isRPC) {
                        if (parsenode.argument) {
                            /* If already transformed (for example binary exp c1 + c2)
                               Then do not make a nested callback call of it */
                            if (!Aux.isCallExp(transpiled[2]))
                                transpiled[2] = transpiler.parseUtils.createCbCall('callback', error, transpiled[2]);
                            transpiled[1] = transpiler.parseUtils.createRPCReturn(transpiled[1])
                        }
                        else {
                            /* If already transformed (for example binary exp c1 + c2)
                               Then do not make a nested callback call of it */
                            if (!Aux.isCallExp(transpiled[2]))
                                transpiled[2] = transpiler.parseUtils.createCbCall('callback', error);
                            transpiled[1] = transpiler.parseUtils.createRPCReturn(transpiled[1]);
                        }
                    }

                    if (transpiled[2]) CPSsetExpStm(parsenode, transpiled[2]);
                    nodes = transpiled[0].remove(call);

                    if (outercps) {
                        var callback = outercps.callback;
                        if (outercps.parsenode.cont) {
                            if( transpiled[1].getCallback) {
                                transpiled[1].parsenode.cont(outercps)
                                outercps = transpiled[1] 
                            }           
                        }                       
                    }
                    /* If transformed, change the outercps */
                    else if (transpiled[1].getCallback) {
                        outercps =  transpiled[1];
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
        if (Aux.isVarDecl(parsenode))
            return parsenode.declarations[0].init

        else if (Aux.isVarDeclarator(parsenode)) {
            return parsenode.init
        }

        else if (Aux.isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (Aux.isAssignmentExp(exp)) 
                return exp.right 

            else if (Aux.isBinExp) 
                return exp
        }

        else if (Aux.isRetStm(parsenode)) {
            return parsenode.argument
        }
    }


    var CPSsetExpStm = function (parsenode, newexp) {
        if(Aux.isVarDecl(parsenode)) {
            newexp.leadingComment = parsenode.declarations[0].leadingComment;
            parsenode.declarations[0].init = newexp
        }

        else if (Aux.isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (Aux.isAssignmentExp(exp)) 
                exp.right = newexp
            else if (Aux.isBinExp) 
                parsenode.expression = newexp
        }
        else if (Aux.isRetStm(parsenode)) {
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

    var hasAsReturnValue = function (entrynode, returnvalue) {
        return entrynode.isEntryNode && entrynode.getFormalOut().filter(function (form_out) {
            return form_out.getInEdges(EDGES.DATA).filter(function (e) {
                return e.from.equals(returnvalue);
            })
        }).length > 0;
    }

    var nodesContains = function (nodes,node) {
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0
    }

 
    toreturn.transformCall      = transformCall;
    toreturn.transformArguments = transformArguments;
    toreturn.transformFunction  = transformFunction;
    toreturn.transformExp       = transformExp;
    toreturn.setExpStm          = CPSsetExpStm;
    toreturn.transformReplyCall = transformReplyCall;

    if (typeof module !== 'undefined' && module.exports != null) {
        InterferenceAnalysis = require('../InterferenceAnalysis.js').InterferenceAnalysis;

        exports.CPSTransform = toreturn;
    }

    return toreturn;

})();
