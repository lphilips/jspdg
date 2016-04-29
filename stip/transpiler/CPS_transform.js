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
            calldeps, vardecls, objects, transpiledNode, transformargs, transpiled, nextcont;

        /* Add original arguments to async call */
        actual_ins.map(function(a_in) {
            var calls = a_in.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) { return n.isCallNode }),
                exps  = a_in.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {return !n.isCallNode});

            /* do nothing with call arguments at this moment */
            if (calls.length > 0) {
                asyncCall.addArg(a_in.parsenode);
                nodes = nodes.remove(a_in);
            }
           else if (exps.length > 0) {
                exps.map(function (n) {
                    transpiler.nodes = nodes;
                    var transpiled = Transpiler.copyTranspileObject(transpiler, n);
                    transpiled  = Transpiler.transpile(transpiled);
                    nodes = transpiled.nodes.remove(n);
                    asyncCall.addArg(transpiled.transpiledNode);
                    nodes = nodes.remove(a_in);
                });
            }
            else {
                asyncCall.addArg(a_in.parsenode);
                nodes = nodes.remove(a_in);
            } 
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
            var incont = insideContinuation(callnode, node, transpiler),
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
                objects  = node.getInNodes(EDGES.OBJMEMBER)
                                .filter( function (n) {
                                   return n.isObjectEntry &&
                                    n.cnt !== upnode.cnt
                                });

                /* Objects inside other statement? (decl, ass, return, ...) */
                objects.map(function (n) {
                    n.getInNodes(EDGES.DATA)
                    .map(function (up) {
                        if (up.parsenode &&
                            (Aux.isVarDecl(up.parsenode) ||
                            Aux.isVarDeclarator(up.parsenode) ||
                            Aux.isAssignmentExp(up.parsenode) ||
                            (Aux.isExpStm(up.parsenode) && Aux.isAssignmentExp(up.parsenode.expression))))
                        vardecls.push(up);
                    });
                    n.getInNodes(EDGES.CONTROL)
                     .filter(function (n) { return n.isStatementNode && Aux.isRetStm(n.parsenode);  })
                     .map( function (n) {vardecls.push(n); });

                    n.getOutNodes(EDGES.OBJMEMBER)
                     .filter(function (prop) { return !prop.equals(node); })
                     .map(function (prop) {
                        prop.getInNodes(EDGES.DATA)
                            .map(function (up) {
                                if (up.parsenode &&
                                (Aux.isVarDecl(up.parsenode) ||
                                Aux.isVarDeclarator(up.parsenode) ||
                                Aux.isAssignmentExp(up.parsenode) ||
                                Aux.isRetStm(up.parsenode) ||
                                (Aux.isExpStm(up.parsenode) && Aux.isAssignmentExp(up.parsenode.expression))))
                            vardecls.push(up);
                            })
                     })
                })

                calldeps.concat(vardecls).concat(objects).map(function (node) {
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
                transpiled.transpiledNode.cnt = transpiled.node.cnt;
                callbackstms = callbackstms.concat(transpiled);
            }
        });

        /* Add the callback as last argument to the async call. */
        asyncCall.addArg(callback.parsenode);
        asyncCall.setCallback(callback);

        (function (callback) {
            asyncCall.parsenode.cont = function (node) {
                var respar = callback.getResParCnt(),
                    arg    = this.callnode,
                    transf = transformVar(arg.parsenode, callnode, respar);
                    if (node.isRPC) {
                        node.replaceArg(arg.parsenode, transf);
                        node.getCallback().setBody(node.getCallback().getBody().concat(callback.getBody().slice(1)))
                        callback.setBody([node.parsenode]);
                    } else {
                        transf = transformVar(node.parsenode, arg, respar);
                        if (Aux.isExpStm(node.parsenode))
                            node.parsenode.expression = transf;
                        else
                            node.parsenode = transf;
                        callback.setBody(callback.getBody()
                            .concat(node.parsenode));
                    }
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
                         transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                        asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            if (transpiledNode !== asyncCall && transpiler.parseUtils.shouldTransform(callnode)) {
                transpiledNode.parsenode.cont(asyncCall);
                transpiledNode.parsenode.cont = asyncCall.parsenode.cont;
                transpiledNode.parsenode.callnode = callnode;
            } 
            else if (transpiler.parseUtils.shouldTransform(callnode))
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
                        transpiledNode.getCallback().addBodyStms(transpiled.getTransformed());
                        transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode.parsenode.cont(callnode);
            transpiledNode.parsenode.cont = asyncCall.parsenode.cont;
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
                        asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                        transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                        nodes = nodes.remove(transpiled.node);
                    }
                })
            }
            transpiledNode = asyncCall;
            transpiledNode.parsenode.callnode = callnode;
        }



        else {
            /* Add data and call dependencies in returned callback body */
            if (transpiled) {
                callbackstms.map(function (transpiled) {
                    /* Prevent data dependencies to be included double in nested callbacks.
                       Does not apply for transformed call statements */
                    if (nodesContains(nodes, transpiled.node)|| transpiled.transpiledNode.cont || 
                        transpiled.node.edges_out.filter(function (e) {return e.to.isCallNode}).length>0) {
                        asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                        transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
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
                callnode   = transpiler.node.parsenode,
                carguments = Aux.isExpStm(callnode) ? callnode.expression.arguments : callnode.arguments,
                esp_exp;

            callargs.map(function (callarg) {
                    cps_count++;
                    var transpilerArg  = Transpiler.copyTranspileObject(transpiler, callarg, nodes); 
                    var parent         = Ast.parent(callarg.parsenode, transpiler.ast);
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
                            if (!latestcall) {
                                latestcall = transformcall;

                            }


                        } else {
                            if (!latestcall) {
                                latestcall = transformcall;
                                transformcallp.cont = function (node) {
                                    var respar = latestcall.getCallback().getResParCnt(),
                                        replc  = transformVar(latestcall.parsenode.callnode.parsenode, 
                                                               callarg, respar),
                                        callb  = latestcall.getCallback();
                                    if (node.isRPC) {
                                        /* Do not replace callarg, but latestcall.callnode, because
                                           it could be that the callarg did not get transformed, but its argument did 
                                           e.g. node is of form  rpc(notransform(transform(x))),
                                           transform(x) should be replaced with latest result parameter  */
                                        node.replaceArg(latestcall.parsenode.callnode.parsenode, replc);
                                        if (callargs.length > carguments.length) {
                                            node.replaceArg(node.parsenode.callnode.parsenode, node.getCallback().getResPar());
                                        }
                                        node.callback.setBody(node.callback.getBody()
                                                .concat(callb.getBody().slice(1))
                                                .sort(function (n1, n2) {
                                                    return n1.cnt - n2.cnt;
                                                }));
                                        callb.setBody([node.parsenode]);
                                    } else {
                                        replc = transformVar(Aux.clone(node.parsenode), callarg, respar);
                                        var parsenode = Aux.clone(node.parsenode);
                                        if (Aux.isExpStm(parsenode))
                                            parsenode.expression = replc;
                                        else
                                            parsenode = replc;
                                        latestcall.callback.setBody(latestcall.callback.getBody()
                                            .concat(parsenode));
                                    }
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
                                    if (callargs.length > carguments.length) {
                                            node.replaceArg(transformcall.parsenode.callnode.parsenode, transformcall.getCallback().getResPar());
                                    }
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
                    if (
                        Aux.isRetStm(node) && 
                        node.__upnode.equals(func.parsenode)) {
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

    /* Aux function, indicating whether a statement is inside the continuation of a call annotated with @blocking
       Could be that call is in @blocking block */
    var insideContinuation = function (startingpoint, statement, transpiler) {
        var remainder = getRemainderStms(startingpoint),
            blockComm = isBlockAnnotated(startingpoint.parsenode, transpiler.ast),
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
        });
        if (blockComm && Comments.isBlockingAnnotated(blockComm))
            return false;
        else
            return cont;
    }


    function isBlockAnnotated (node, ast) {
       var parent = node,
            annotation;
        while(!Aux.isProgram(parent)) {
            if (Aux.isBlockStm(parent) && parent.leadingComment) {
                break;
            }
            parent = Aux.parent(parent, ast);
        }
        if (Aux.isBlockStm(parent)) {
            return parent.leadingComment;
        }
        return;
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
                        };
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
        body = entry.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {return !n.isFormalNode});
        body.map(function (bodynode) {
            if (bodynode.equals(callnode) ||
                Aux.hasCallStm(bodynode, callnode.parsenode)) {
                passed = true;
            }
            else if (passed) {
                remainder.push(bodynode);
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
        //node.parsenode = Aux.clone(parsenode);
        calls.map( function (call) {
            cps_count += 1;

            if (nodesContains(nodes, call)) {
                var exp = CPSgetExpStm(node.parsenode),
                    error  = {type : 'Literal', value:  null},
                    transpilerCall = Transpiler.copyTranspileObject(transpiler, call, nodes),
                    transpiled = transformCall(transpilerCall, node, exp);

                    if (Aux.isRetStm(parsenode) && transpiled[1].isRPC) {
                        if (node.parsenode.argument) {
                            /* If already transformed (for example binary exp c1 + c2)
                               Then do not make a nested callback call of it */
                            node.parsenode.__upnode = getEnclosingFunction(node.parsenode, transpiler.ast);
                        }
                        else {
                            /* If already transformed (for example binary exp c1 + c2)
                               Then do not make a nested callback call of it */
                            if (!Aux.isCallExp(transpiled[2]))
                                transpiled[2] = transpiler.parseUtils.createCbCall('callback', error);
                            transpiled[1] = transpiler.parseUtils.createRPCReturn(transpiled[1]);
                            transpiled[1].__upnode = getEnclosingFunction(node.parsenode, transpiler.ast);
                        }
                    }

                    if (transpiled[2]) {
                        node.parsenode = Aux.clone(node.parsenode); 
                        CPSsetExpStm(parsenode, transpiled[2]);}
                    nodes = transpiled[0].remove(call);

                    if (outercps) {
                        var callback = outercps.callback;
                        if (outercps.parsenode.cont) {
                            if( transpiled[1].getCallback) {
                                transpiled[1].parsenode.cont(outercps);
                                outercps = transpiled[1];
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

            return [nodes, outercps];
        else

            return [nodes, node];
    }


    var CPSgetExpStm = function (parsenode) {
        if (Aux.isVarDecl(parsenode))
            return parsenode.declarations[0].init;

        else if (Aux.isVarDeclarator(parsenode)) {
            return parsenode.init;
        }

        else if (Aux.isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (Aux.isAssignmentExp(exp))
                return exp.right;

            else if (Aux.isBinExp)
                return exp;
        }

        else if (Aux.isRetStm(parsenode)) {
            return parsenode.argument;
        }
    }


    var CPSsetExpStm = function (parsenode, newexp) {
       // parsenode = Aux.clone(parsenode);
        if(Aux.isVarDecl(parsenode)) {
            newexp.leadingComment = parsenode.declarations[0].leadingComment;
            parsenode.declarations[0].init = newexp;
        }

        else if (Aux.isExpStm(parsenode)) {
            var exp = parsenode.expression;
            if (Aux.isAssignmentExp(exp))
                exp.right = newexp;
            else if (Aux.isBinExp)
                parsenode.expression = newexp;
        }
        else if (Aux.isRetStm(parsenode)) {
            parsenode.argument = newexp;
        }
        return parsenode;
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
