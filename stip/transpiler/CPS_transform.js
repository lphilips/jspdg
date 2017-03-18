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


var cps_count = 0,
    toreturn = {};

var InterferenceAnalysis = require('../analysis/InterferenceAnalysis.js');
var arityEquals = require('../PDG/node.js').arityEquals;


function transformCall(transpiler, upnode, esp_exp) {
    var callnode = transpiler.node,
        asyncCall = transpiler.parseUtils.createRPC(callnode)(callnode, callnode.name, []),
        parsenode = Pdg.getCallExpression(callnode.parsenode),
        trystm = Aux.inTryStatement(transpiler.ast, parsenode),
        callback = transpiler.parseUtils.createCallback(cps_count, Aux.isTryStm(trystm) ? trystm : null),
        nodes = transpiler.nodes,
        actual_ins = callnode.getActualIn(),
        parent = Ast.parent(callnode.parsenode, transpiler.ast),
        callargs = actual_ins.flatMap(function (a_in) {
            return a_in.callArgument()
        }),
        orig_esp_exp = esp_exp,
        callbackstms = [],
        datadep = [],
        entry = getEntryNode(callnode),
        calledEntry = callnode.getEntryNode()[0],
        blockingConstruct =  inBlockingConstruct(callnode),
        blockingdeps = [],
        transpiledNode, transformargs, transpiled;


    if (parsenode.handlersAsync && parsenode.handlersAsync.length != 0) {
        var handlerCtr = parsenode.handlersAsync.length,
            lastHandler = parsenode.handlersAsync[handlerCtr - 1];

        if (asyncCall.setObjectName) {
            var proxyName = Handler.makeProxyName(lastHandler.getId());
            asyncCall.setObjectName(proxyName);
        }

        lastHandler.incRpcCount();
    }

    /* Add original arguments to async call */
    actual_ins.map(function (a_in) {
        var calls = a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {
                    return n.isCallNode
                }),
            exps = a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {
                    return !n.isCallNode
                });

        /* do nothing with call arguments at this moment */
        if (calls.length > 0) {
            asyncCall.addArg(a_in.parsenode);
            nodes = nodes.remove(a_in);
        }
        else if (exps.length > 0) {
            exps.map(function (n) {
                transpiler.nodes = nodes;
                var transpiled = Transpiler.copyTranspileObject(transpiler, n);
                transpiled = Transpiler.transpile(transpiled);
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

    /* If the call is annotated with @blocking OR the function has side-effects,
     we take the remainder of the program (or current scope) as its continuation */
    if (isBlockingCall(callnode, transpiler.ast) || !transpiler.options.analysis ||
        ( calledEntry &&
            InterferenceAnalysis.doesInterfere(calledEntry.parsenode, parsenode.arguments, transpiler.ast))) {
        getRemainderStms(callnode).map(function (stm) {
            if (nodesContains(nodes, stm))
                datadep.push(stm);
                blockingdeps.push(stm);
        });
    }
    if (blockingConstruct) {
        getRemainderStms(blockingConstruct).map(function (stm) {
            datadep.push(stm);
            blockingdeps.push(stm);
        });
    }

    /* Upnode is given + of type var decl, assignment, etc */
    if (upnode && upnode.dataDependentNodes) {
        var e_in = upnode.getInNodes(EDGES.CONTROL).filter(function (n) {
            return Aux.isTryStm(n.parsenode)
        });
        upnode.parsenode.inTryBlock = (e_in.length != 0);

        if (!esp_exp) {
            esp_exp = CPSgetExpStm(upnode.parsenode);
        }
        if (transpiler.parseUtils.shouldTransform(callnode))
            esp_exp = transformVar(esp_exp, callnode, cps_count);
        callback.addBodyStm(upnode.parsenode);
        nodes = nodes.remove(upnode)
    }

    function addDependency (node) {
        var nodeEntry = getEntryNode(node);
        if (datadep.indexOf(node) < 0 && nodeEntry.equals(entry)) {
            datadep.push(node);
            return true
        }
        else
            return false
    }

    /* Data dependent nodes */
    function traverseUp (node) {
        var upCONTROL = node.getInNodes(EDGES.CONTROL).filter(function (n) {
            return !(n.isStatementNode && Aux.isCatchStm(n.parsenode))});
        var upOBJMEMBER = node.getInNodes(EDGES.OBJMEMBER)
            .filter(function (n) {
                return n.isObjectEntry
            });
        var upDATA = node.getInNodes(EDGES.DATA)
            .filter(function (n) {
                return n.parsenode &&
                    ( Aux.isVarDecl(n.parsenode) ||
                    Aux.isVarDeclarator(n.parsenode) ||
                    (Aux.isExpStm(n.parsenode) && Aux.isAssignmentExp(n.parsenode.expression)) ||
                    Aux.isProperty(n.parsenode) ||
                    Aux.isAssignmentExp(n.parsenode))
            });

        function rightLevel(n) {
            var found = n.getInNodes(EDGES.CONTROL).filter(function (n) {
                return n.equals(entry) && !(n.isStatementNode && Aux.isCatchStm(n.parsenode));
            });
            return found.length > 0 || n.equals(entry)
        }
        if (rightLevel(node)) {
            return node
        }
        if (upCONTROL.length > 0) {
            return traverseUp(upCONTROL[0])
        }
        if (upOBJMEMBER.length > 0) {
            return traverseUp(upOBJMEMBER[0])
        }
        if (upDATA.length > 0) {
            return traverseUp(upDATA[0])
        }
    }

   if (upnode)
     slice(upnode);

   function slice (node) {
       var nodes = graphs.PDG.forwardslice(node);
       nodes.forEach(function (n) {
           var calldeps = n.getInNodes(EDGES.DATA)
               .filter( function (n) { n.isCallNode && (upnode ? !n.equals(upnode) : true )});
           var vardecls  = n.getInNodes(EDGES.DATA)
               .filter( function (n) {
                   var nodeEntry = getEntryNode(n);
                   return entry.equals(nodeEntry) && n.parsenode &&
                       (upnode ? !n.equals(upnode) : true) &&
                       ( Aux.isVarDecl(n.parsenode) ||
                       Aux.isVarDeclarator(n.parsenode) ||
                       Aux.isAssignmentExp(n.parsenode))
               });
           if (n.isStatementNode && Aux.isCatchStm(n.parsenode)) {
               return
           }
           if (n.isActualPNode) {
               var ups = n.getInNodes(EDGES.DATA).filter(function (data) {
                   return data.isEntryNode &&
                       n.parsenode.name == data.parsenode.id.name
               });
               if (ups.length > 0)
                    ups.forEach(function (n) {
                       if (addDependency(n)) {
                           slice(n)
                       }
                   });
               else {
                   var up = traverseUp(n);
                   if (up && addDependency(up)) {
                       slice(up)
                   }
               }
           }
           else {
               var up = traverseUp(n);
               if (up && addDependency(up)) {
                   slice(up);
               }
           }

           if (calldeps.length > 0) {
               calldeps.forEach(function (c) {
                   var up = traverseUp(c);
                   if (addDependency(up)) {
                       slice(up)
                   }
               })
           }
           else if (vardecls.length > 0) {
               vardecls.forEach(function (d) {
                   if (addDependency(d))
                       slice(d)
               })
           }
       })
   }


    datadep
        .filter(function (n) {
            return !n.equals(upnode) && !n.equals(callnode)
        })
        .sort(function (n1, n2) {
            return n1.cnt - n2.cnt
        })
        .map(function (n) {
            if (n._transpiledNode && blockingConstruct) {
                callbackstms.push(n._transpiledNode);
                transpiled = true;
            }
            else {
                var transpilerDataDep = Transpiler.copyTranspileObject(transpiler, n, nodes);
                var e_in;
                if (nodesContains(nodes, n, callnode) &&
                    transpiler.parseUtils.shouldTransform(callnode)) {
                    if (n.isEntryNode && n.parsenode.__transpiledNode)
                        callbackstms = callbackstms.concat(n.parsenode.__transpiledNode);
                    else if (!n.isEntryNode) {
                        transpiled = Transpiler.transpile(transpilerDataDep);
                        e_in = transpiled.node.getInNodes(EDGES.CONTROL).filter(function (n) {
                            return Aux.isTryStm(n.parsenode)
                        });
                        transpiled.transpiledNode.inTryBlock = (e_in.length != 0);

                        if (n.isEntryNode)
                            n.parsenode.__transpiledNode = transpiled;
                        nodes = transpiled.nodes;
                        transpiled.transpiledNode.cnt = transpiled.node.cnt;
                        callbackstms.push(transpiled);
                        n._transpiledNode = transpiled;
                    }
                }
            }
        });

    /* Add the callback as last argument to the async call. */
    asyncCall.addArg(callback.parsenode);
    asyncCall.setCallback(callback);
    asyncCall.parsenode._callnode = callnode;

    (function (callback) {
        asyncCall.parsenode.cont = function (node) {
            var respar = callback.getResParCnt(),
                arg = this._callnode,
                transf = transformVar(arg.parsenode, callnode, respar);
            if (node.isRPC) {
                node.replaceArg(arg.parsenode, transf);
                node.getCallback().setBody(node.getCallback().getBody().concat(callback.getBody().slice(1)))
                callback.setBody([node.parsenode]);
            } else {
                transf = transformVar(node.parsenode, arg, respar);
                /* did it transform? */
                if (escodegen.generate(transf) !== escodegen.generate(node.parsenode)) {
                    if (Aux.isExpStm(node.parsenode))
                        node.parsenode.expression = transf;
                    else
                        node.parsenode = transf;
                }
                callback.setBody(callback.getBody()
                    .concat(node.parsenode));
            }
        }
    })(callback);

    transpiledNode = asyncCall;
    callargs.forEach(function (callarg) {
        callarg.parsenode.leadingComment = callnode.parsenode.leadingComment;
    });
    transformargs = transformArguments(callargs, transpiledNode, nodes, transpiler, upnode, esp_exp, callnode);
    transpiledNode = transformargs[1];
    nodes = transformargs[0];

    /* transformation of arguments changed esp_exp? */
    if (transformargs[2] && esp_exp === orig_esp_exp)
        esp_exp = transformargs[2];


    if (isBlockingCall(callnode, transpiler.ast)) {
        if (transpiled) {
            callbackstms.map(function (transpiled) {
                /* Prevent data dependencies to be included double in nested callbacks.
                 Does not apply for transformed call statements */
                if (nodesContains(nodes, transpiled.node, callnode) || transpiled.transpiledNode.cont ||
                    transpiled.node.edges_out.filter(function (e) {
                        return e.to.isCallNode
                    }).length > 0) {
                    transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                    asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                    if (transpiled.transpiledNode.cont)
                        asyncCall.parsenode.cont = transpiled.transpiledNode.cont;
                    nodes = removeNode(nodes, transpiled.node, callnode);
                }
            })
        }
        if (transpiledNode !== asyncCall && transpiler.parseUtils.shouldTransform(callnode)) {
            transpiledNode.parsenode.cont(asyncCall);
            transpiledNode.parsenode.cont = asyncCall.parsenode.cont;
            transpiledNode.parsenode._callnode = callnode;
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
            callbackstms.map(function (transpiled) {
                /* Prevent data dependencies to be included double in nested callbacks.
                 Does not apply for transformed call statements or calls
                 in a special blocking construct */
                if (nodesContains(nodes, transpiled.node, callnode) ||
                    blockingConstruct ||
                    transpiled.node.getOutNodes().filter(function (n) {
                        return n.isCallNode
                    }).length > 0) {
                    transpiledNode.getCallback().addBodyStms(transpiled.getTransformed());
                    transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                    nodes = removeNode(nodes, transpiled.node, callnode);
                }
            })
        }

        transpiledNode.parsenode._callnode = callnode;
        return [nodes, transpiledNode, esp_exp];
    }

    else if (transpiler.parseUtils.shouldTransform(callnode) && !transpiledNode ||
        transpiler.parseUtils.shouldTransform(callnode) && callargs.length < 1) {
        if (transpiled) {
            callbackstms.map(function (transpiled) {
                /* Prevent data dependencies to be included double in nested callbacks.
                 Does not apply for transformed call statements or calls
                 in a special blocking construct */
                if (nodesContains(nodes, transpiled.node, callnode) ||
                    blockingConstruct ||
                    transpiled.transpiledNode.cont ||
                    transpiled.node.getOutNodes().filter(function (n) {
                        return n.isCallNode
                    }).length > 0) {
                    asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                    transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                    nodes = removeNode(nodes, transpiled.node, callnode);
                }
            })
        }
        transpiledNode = asyncCall;
        transpiledNode.parsenode._callnode = callnode;
    }


    else {
        /* Add data and call dependencies in returned callback body */
        if (transpiled) {
            callbackstms.map(function (transpiled) {
                /* Prevent data dependencies to be included double in nested callbacks.
                 Does not apply for transformed call statements or calls
                 in a special blocking construct */
                if (nodesContains(nodes, transpiled.node, callnode) ||
                        blockingConstruct || (!transpiled.node.isEntryNode &&
                    transpiled.node.getOutNodes().filter(function (n) {
                        return n.isCallNode
                    }).length > 0)) {
                    asyncCall.getCallback().addBodyStms(transpiled.getTransformed());
                    transpiled.transpiledNode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);
                    nodes = removeNode(nodes, transpiled.node, callnode);
                }
            })
        }
        transpiledNode.parsenode.cont(asyncCall);
        transpiledNode.parsenode.cont = asyncCall.parsenode.cont;
        transpiledNode.parsenode._callnode = callnode;
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
            callnode = transpiler.node.parsenode,
            carguments = Aux.isExpStm(callnode) ? callnode.expression.arguments : callnode.arguments,
            esp_exp;

        callargs.map(function (callarg) {
            cps_count++;
            var transpilerArg = Transpiler.copyTranspileObject(transpiler, callarg, nodes);
            var parent = Ast.parent(callarg.parsenode, transpiler.ast);
            var transpiled = transformCall(transpilerArg, upnode, orig_esp_exp),
                hasCallArg = callarg.getActualIn().flatMap(function (a_in) {
                    return a_in.callArgument()
                }),
                transformcall = transpiled[1],
                transformcallp;
            if (transpiled[2]) {
                transformcallp = transformcall.parsenode;
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
                                replc = transformVar(latestcall.parsenode._callnode.parsenode,
                                    callarg, respar),
                                callb = latestcall.getCallback();
                            if (node.isRPC) {
                                /* Do not replace callarg, but latestcall.callnode, because
                                 it could be that the callarg did not get transformed, but its argument did
                                 e.g. node is of form  rpc(notransform(transform(x))),
                                 transform(x) should be replaced with latest result parameter  */
                                node.replaceArg(latestcall.parsenode._callnode.parsenode, replc);
                                if (callargs.length > carguments.length) {
                                    node.replaceArg(node.parsenode._callnode.parsenode, node.getCallback().getResPar());
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
                        if (call.getActualIn().length > 1) {
                            var body = latestcall.getCallback().getBody().slice(1);
                            body.map(function (stm) {
                                transformcall.getCallback().addBodyStm(stm)
                            })
                        }

                        latestcall.parsenode.cont(transformcall);
                        latestcall.parsenode.cont = function (node) {
                            var callbackb = transformcall.getCallback().getBody().slice(1);
                            if (callbackb.length > 0) {
                                callbackb.map(function (stm) {
                                    node.getCallback().addBodyStm(stm)
                                })
                            }

                            var respar = latestcall.getCallback().getResPar();
                            node.replaceArg(latestcall.parsenode._callnode.parsenode, respar);
                            if (callargs.length > carguments.length) {
                                node.replaceArg(transformcall.parsenode._callnode.parsenode, transformcall.getCallback().getResPar());
                            }
                            transformcall.getCallback().setBody([node.parsenode]);
                        }

                        if (call.getActualIn().length > 1) {
                            var respar = transformcall.getCallback().getResPar(),
                                cont = latestcall.parsenode.cont;
                            latestcall.parsenode.cont = function (node) {
                                node.replaceArg(transformcall.parsenode._callnode.parsenode, respar);
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
    var method = transpiler.parseUtils.createAsyncFunction(),
        func = transpiler.node,
        parsenode = func.parsenode,
        /* Take parent, because falafel can't handle an anonymous function */
        parent = Ast.parent(parsenode, transpiler.ast),
        /* If parsenode is func decl (function foo() {}), then we don't need the parent.
         Only needed for cases var foo = function () {}) */
        funcstr = Aux.isFunDecl(parsenode) ? escodegen.generate(parsenode) : escodegen.generate(parent);

    /* If parent is an object property, transform it into var decl + function (for falafel) */
    if (Aux.isProperty(parent)) {
        funcstr = parent.key.toString() + "=" + parsenode.toString();
    }

    Aux.walkAst(func.parsenode, {
        post: function (node) {
            var enclosingFun = getEnclosingFunction(node, transpiler.ast);
            var errorArg = enclosingFun._transformed ? enclosingFun._errArg : {type: 'Literal', value: null};
            /* Make sure methods like equal, hashcode are defined on the node*/
            if (enclosingFun && !enclosingFun.equals)
                Ast.augmentAst(enclosingFun);
            if (Aux.isRetStm(node) && !node.__returnTransformed && node.__upnode && 
                node.__upnode.equals(func.parsenode)) {
                /* callnode property is added if return statement is already transformed to a cps call
                 No need to wrap it in a callback call again */
                if (node.argument && !node._callnode) {
                    node.argument = transpiler.parseUtils.createCbCall('callback', errorArg, node.argument);
                }
                /* callnode property is added if return statement is already transformed to a cps call
                 No need to wrap it in a callback call again */
                else if (!node._callnode) {
                    node.argument = transpiler.parseUtils.createCbCall('callback', {
                        type: 'Literal',
                        value: null
                    }, node.argument);
                }
            }
            if (Aux.isThrowStm(node)) {
                node.type = "ReturnStatement";
                node.argument = transpiler.parseUtils.createCbCall('callback', node.argument);
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
    method.addParams(parsenode.params.addLast({'type': 'Identifier', 'name': 'callback'}));

    return [transpiler.nodes, method];
}


/* Aux function, returns function (if any) of given statement (parse node) */
var getEnclosingFunction = function (parsenode, ast) {
    var parent = parsenode;
    while (parent && !Aux.isProgram(parent)) {
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
        cont = false,
        passed = false;
    remainder.map(function (remstm) {
        var comment = remstm.parsenode ? remstm.parsenode.leadingComment : false;
        if (comment &&
            Comments.isBlockingAnnotated(comment) && !passed && !cont)
            cont = remstm;
        if (remstm.equals(statement))
            passed = true;
    });
    if (blockComm && Comments.isBlockingAnnotated(blockComm))
        return false;
    else
        return cont;
}


function isBlockAnnotated(node, ast) {
    var parent = node,
        annotation;
    while (!Aux.isProgram(parent)) {
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

function isBlockingCall(callnode, ast) {
    var blockAnnotation = isBlockAnnotated(callnode.parsenode, ast);
    return (blockAnnotation && Comments.isBlockingAnnotated(blockAnnotation)) ||
        (callnode.parsenode.leadingComment &&
        Comments.isBlockingAnnotated(callnode.parsenode.leadingComment))
}

function inBlockingConstruct(node) {
    var ins = node.getInEdges(EDGES.CONTROL)
            .concat(node.getInEdges(EDGES.OBJMEMBER))
            .slice(),
        visited = [],
        found = false,
        criterium = function (node) {
            return node.isStatementNode && Aux.isIfStm(node.parsenode) &&
                    node.parsenode.leadingComment &&
                    Comments.isBlockingAnnotated(node.parsenode.leadingComment)
        };
    if (criterium(node))
        return node;
    while (ins.length > 0) {
        var edge = ins.shift(),
            from = edge.from;
        if (criterium(from)) {
            found = from;
            break;
        } else {
            from.getInEdges(EDGES.CONTROL)
                .concat(from.getInEdges(EDGES.OBJMEMBER))
                .map(function (edge) {
                    if (!(Aux.contains(visited, edge))) {
                        visited.push(edge);
                        ins.push(edge);
                    }
                });
        }
    }
    return found;
}

var getEntryNode = function (node) {
    var ins = node.getInEdges(EDGES.CONTROL)
            .concat(node.getInEdges(EDGES.OBJMEMBER))
            .slice(),
        visited = [],
        entry;
    if (node.isObjectEntry && ins.length == 0)
        return node;
    while (ins.length > 0) {
        var edge = ins.shift(),
            from = edge.from;
        if (from.isEntryNode || from.isDistributedNode ||
            from.isComponentNode || from.isObjectEntry ||
            from.isStatementNode && Aux.isTryStm(from.parsenode)) {
            entry = from;
            break;
        } else {
            from.getInEdges(EDGES.CONTROL)
                .concat(from.getInEdges(EDGES.OBJMEMBER))
                .map(function (edge) {
                    if (!(Aux.contains(visited, edge))) {
                        visited.push(edge);
                        ins.push(edge);
                    }
                });
        }
    }
    return entry;
}

/* Aux function, returns "remainder continuation statements" of current call (depending on where the call is located) */
var getRemainderStms = function (callnode) {
    var ins = callnode.getInEdges(EDGES.CONTROL).slice(),
        visited = [],
        passed = false,
        remainder = [],
        entry = getEntryNode(callnode),
        body, remainder;
    body = entry.getOutNodes(EDGES.CONTROL)
        .filter(function (n) {
            return !n.isFormalNode
        });
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
    var entry = callnode.enclosingEntry(),
        parsenode = Pdg.getCallExpression(callnode.parsenode),
        arity, transformCall;
    if (entry && entry.isServerNode() && Analysis.isRemoteCall(transpiler.options, callnode)) {
        arity = callnode.arity;
        if (arity && arityEquals(arity, ARITY.ONE)) {
            transformCall = transpiler.parseUtils.createAsyncReplyCall();
            transformCall.setName(callnode.name);

            transformCall.addArgs(parsenode.arguments);

            if (callnode.parsenode.handlersAsync && callnode.parsenode.handlersAsync.length != 0) {
                var handlerCtr = callnode.parsenode.handlersAsync.length,
                    lastHandler = callnode.parsenode.handlersAsync[handlerCtr - 1];

                if (transformCall.setObjectName) {
                    var proxyName = Handler.makeProxyName(lastHandler.getId());
                    transformCall.setObjectName(proxyName);
                }
                lastHandler.incRpcCount();
            }
            return [nodes, transformCall]
        }
    }
    return [nodes, callnode]
}


var transformPrimitive = function (transpiler) {
    var node = transpiler.node,
        parsenode = node.parsenode,
        cb = transpiler.parseUtils.createCallback(cps_count),
        name = node.name,
        transpiledNode;
    if (name == "forEach") {
        getRemainderStms(node).forEach(function (n) {
            var transpilerRemainder = Transpiler.copyTranspileObject(transpiler, n, transpiler.nodes);
            var transpiled = Transpiler.transpile(transpilerRemainder);
            cb.addBodyStm(transpiled.transpiledNode);
            transpiler.nodes = transpiled.nodes.remove(n);
        });
        transpiledNode = transpiler.parseUtils.createAsyncForEach();
        transpiledNode.addCollection(parsenode.expression.callee.object);
        transpiledNode.addLoopFunction(parsenode.expression.arguments[0]);
        transpiledNode.addFinishFunction(cb.parsenode);
        transpiledNode.parsenode.__transformed = true;
        transpiler.transpiledNode = transpiledNode.parsenode;
        return transpiler;
    }
}

var transformGeneratedFunction = function (transpiler) {
    var func = transpiler.node.parsenode;
    var cbCalled = false;
    func.params.push({type: "Identifier",name: "callback"});
    Aux.walkAst(func, {
        post: function (node) {
            if (Aux.isRetStm(node) && !node.__returnTransformed) {
                /* callnode property is added if return statement is already transformed to a cps call
                 No need to wrap it in a callback call again */
                if (node.argument && !node._callnode) {
                    node.argument = transpiler.parseUtils.createCbCall('callback', errorArg);
                }
                /* callnode property is added if return statement is already transformed to a cps call
                 No need to wrap it in a callback call again */
                else if (!node._callnode) {
                    node.argument = transpiler.parseUtils.createCbCall('callback', {
                        type: 'Literal',
                        value: null
                    });
                }
                cbCalled = true;
            }
            if (Aux.isThrowStm(node)) {
                node.type = "ReturnStatement";
                node.argument = transpiler.parseUtils.createCbCall('callback', node.argument);
                cbCalled = true;
            }
        }
    })
    if (!cbCalled) {
        var lastStm = func.body.body[func.body.body.length -1];
        /* Transformed call? */
        if (lastStm && lastStm.cont) {
            lastStm.cont({parsenode : {
                    type: "ExpressionStatement",
                    expression: transpiler.parseUtils.createCbCall('callback', {
                        type: 'Literal',
                        value: null
                    })
                }
            })
        } else {
            func.body.body.push({
                type: "ExpressionStatement",
                expression: transpiler.parseUtils.createCbCall('callback', {
                    type: 'Literal',
                    value: null
                })
            });
        }
    }
    transpiler.transpiledNode = func;
    return transpiler;
}

/* Used for expression with calls :
 * variable declarations, assignments, binary expressions
 */

var transformExp = function (transpiler) {
    var node = transpiler.node,
        parsenode = node.parsenode,
        calls = node.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode;
            }),
        local_count = cps_count,
        nodes = transpiler.nodes,
        exps = [],
        resp = [],
        outercps, innercps, exps;

    cps_count = 0;
    calls.map(function (call) {
        cps_count += 1;
        call.parsenode.leadingComment = parsenode.leadingComment;
        if (nodesContains(nodes, call)) {
            var exp = CPSgetExpStm(node.parsenode),
                error = {type: 'Literal', value: null},
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
                    transpiled[1].__transformed = true;
                }
            }

            if (transpiled[2]) {
                node.parsenode = Aux.clone(node.parsenode);
                exps.push(transpiled[2]);
            }
            else
                exps.push(false);
            if (transpiled[1].callback)
                resp.push(transpiled[1].callback.getResPar());
            else
                resp.push(false);
            nodes = transpiled[0].remove(call);

            if (outercps) {
                var callback = outercps.callback;
                if (outercps.parsenode.cont) {
                    if (transpiled[1].getCallback) {
                        transpiled[1].parsenode.cont(outercps);
                        outercps = transpiled[1];
                    }
                }
            }
            /* If transformed, change the outercps */
            else if (transpiled[1].getCallback) {
                outercps = transpiled[1];
            }
        }
    })
    cps_count = local_count;

    if (!Aux.isRetStm(parsenode) &&
        (calls.length == 1 && exps[0]) || calls.length > resp.length && exps[0]) {
        CPSsetExpStm(parsenode, exps[0]);
    }

    else if (Aux.isRetStm(parsenode) && outercps) {
        var returnstm = Aux.clone(parsenode);
        for (var i = 0; i < calls.length; i++) {
            if (resp[i])
                replaceCall(returnstm.argument, calls[i], resp[i]);
        }
        parsenode.argument = transpiler.parseUtils.createCbCall('callback', outercps.callback.getErrPar(), returnstm.argument);
        returnstm.argument = outercps.parsenode.expression;
        returnstm.__returnTransformed = true;
        parsenode.__returnTransformed = true;
        outercps.parsenode = returnstm;
    }
    else {
        for (var i = 0; i < calls.length; i++) {
            if (resp[i])
                replaceCall(parsenode, calls[i], resp[i]);
        }
    }
    if (outercps) {
        outercps.parsenode.__transformed = true;
        return [nodes, outercps];
    }
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

        else if (Aux.isBinExp || Aux.isUnaryExp)
            return exp;
    }

    else if (Aux.isRetStm(parsenode)) {
        return parsenode.argument;
    }
}


var CPSsetExpStm = function (parsenode, newexp, call) {
    // parsenode = Aux.clone(parsenode);
    if (Aux.isVarDecl(parsenode)) {
        newexp.leadingComment = parsenode.declarations[0].leadingComment;
        parsenode.declarations[0].init = newexp;
    }

    else if (Aux.isExpStm(parsenode)) {
        var exp = parsenode.expression;
        if (Aux.isAssignmentExp(exp))
            exp.right = newexp;
        else if (Aux.isBinExp)
            parsenode.expression = newexp;
        else if (Aux.isUnaryExp)
            parsenode.expression = newexp;
    }
    else if (Aux.isRetStm(parsenode)) {
        parsenode.argument = newexp;
    }
    return parsenode;
}

var replaceCall = function (node, call, resexp) {
    Aux.walkAst(node, {
        pre: function (n) {
            if (n.hashCode() == call.parsenode.hashCode()) {
                n.type = "Identifier";
                n.name = resexp.name;
            }
        }
    })
}

/* Aux function : replaces occurence of expression with "resx" paremeter */
var transformVar = function (expression, toreplace, cnt) {
    var e_str = escodegen.generate(expression),
        r_str = escodegen.generate(toreplace.parsenode),
        idx = e_str.indexOf(r_str),
        newexp, parsed;

    if (idx >= 0) {
        newexp = e_str.slice(0, idx) + 'res' + cnt + e_str.slice(idx + r_str.length);
        parsed = esprima.parse(newexp).body[0].expression;

        return parsed;
    }

    else {

        return expression;
    }
}


var hasAsReturnValue = function (entrynode, returnvalue) {
    return entrynode.isEntryNode && entrynode.getFormalOut().filter(function (form_out) {
            return form_out.getInEdges(EDGES.DATA).filter(function (e) {
                return e.from.equals(returnvalue);
            })
        }).length > 0;
}

var nodesContains = function (nodes, node, callnode) {
    if (callnode && inBlockingConstruct(callnode))
        return true;
    else
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0
}

var removeNode = function (nodes, node, callnode) {
    return nodes.remove(node);
}


toreturn.transformCall = transformCall;
toreturn.transformArguments = transformArguments;
toreturn.transformFunction = transformFunction;
toreturn.transformExp = transformExp;
toreturn.setExpStm = CPSsetExpStm;
toreturn.transformReplyCall = transformReplyCall;
toreturn.transformPrimitive = transformPrimitive;
toreturn.transformGeneratedFunction = transformGeneratedFunction;

module.exports = toreturn;
global.CPSTransform = toreturn;