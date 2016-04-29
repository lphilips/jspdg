/****************************************************************
 *               TRANSFORMATIONS FOR JAVASCRIPT                 *
 *                                                              *
 *  has no transformations for distributed setting,             *
 *  but is meant to use for slicing only.                       *
 *                                                              *
 *  Supports CPS transformations                                *
 *                                                              *
 ****************************************************************/

var JSify = (function () {
 


    function makeShouldTransform(cps) {
        return function (call) {
            var parsenode = Pdg.getCallExpression(call.parsenode);
            if (cps) {
                if (call.primitive) {
                    return false;
                }
                else if (Aux.isMemberExpression(parsenode.callee) &&
                    asyncs.indexOf(parsenode.callee.object.name) >= 0) {
                        return true;
                    }
                else {
                    return cps;
                }
            }
            else {
                return false;
            }
        };
    }

    function makeTransformer (transpiler) {
        transpiler.parseUtils = {
            createRPC : function (call) { return JSParse.RPC; },
            createCallback : JSParse.callback,
            shouldTransform : makeShouldTransform(transpiler.options.cps),
            createAsyncFunction : JSParse.asyncFun,
            createCbCall : JSParse.createCallCb,
            createRPCReturn : JSParse.createReturnStm,
        };
        transpiler.transformCPS = CPSTransform;


        return {  AST        : transpiler.ast,
                  transformF : transpiler.transpile,
                  callbackF  : JSParse.callback,
                  asyncCallF : function (call) { return JSParse.RPC; },
                  asyncFuncF : JSParse.asyncFun,
                  parseF     : JSParse,
                  shouldTransform : makeShouldTransform(transpiler.options.cps) ,
                  option     : transpiler.options.cps
                };
    }

    var transformer = {};

    /* Variable declaration  + Assignment Expression */
    function transformVariableDecl (transpiler) {
        var node        = transpiler.node,
            parsenode   = Aux.clone(node.parsenode),
            entry       = node.getOutNodes(EDGES.DATA)
                        .filter(function (n) {
                            return n.isEntryNode;
                        }),
            call        = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                            return n.isCallNode;
                       }),
            object      = node.getOutNodes(EDGES.DATA)
                        .filter(function (n) {
                             return n.isObjectEntry;
                        }),
            transpilerDep, transpiled, transpiledNode, transformer;
        /* Make variable declaration of node */
        if (Aux.isVarDeclarator(parsenode)) {
             parsenode = JSParse.createVarDecl(parsenode);
        }
        /* Outgoing data dependency to entry node?
         * function declaration of form var f = function () {}
         */
        if (entry.length > 0) {
            entry           = entry[0]; /* always 1, if assigned later on, the new one would be attached to assignment node */
            transpilerDep   = Transpiler.copyTranspileObject(transpiler, entry);
            transpiled      = Transpiler.transpile(transpilerDep);

            transpiler.nodes = transpiled.nodes.remove(entry);
            transpiledNode   = transpiled.transpiledNode;
            Transpiler.copySetups(transpiled, transpiler);

            /* Variable declaration */
            if (Aux.isVarDecl(parsenode)) {
                 if (Aux.isFunDecl(transpiledNode)) {
                    transpiledNode.id = Aux.getDeclaration(parsenode).id;
                    transpiler.transpiledNode = transpiledNode;

                    return transpiler;
                 }
                 else {
                    Aux.getDeclaration(parsenode).init = transpiledNode;
                }
            }
            /* Assignment */
            else if (Aux.isExpStm(parsenode) &&
                     Aux.isAssignmentExp(parsenode.expression) ||
                     Aux.isAssignmentExp(parsenode)) {

                if (Aux.isFunDecl(transpiledNode)) {
                    transpiledNode.id = parsenode.expression ? parsenode.expression.left : parsenode.left;
                    transpiler.transpiledNode = transpiledNode;

                    return transpiler;
                }
                        //parsenode.expression.right = f.parsednode;
            }
        }
        /* Outgoing data dependency to object entry node? */
        if (object.length > 0 && call.length <= 0) {
            transpilerDep = Transpiler.copyTranspileObject(transpiler, object[0]);
            transpiled    = Transpiler.transpile(transpilerDep);
            transpiler.nodes = transpiled.nodes.remove(object[0]);
            transpiledNode   = transpiled.transpiledNode;
            Transpiler.copySetups(transpiled, transpiler);

            if (Aux.isVarDecl(parsenode)) {
                Aux.getDeclaration(parsenode).init = transpiledNode;
            }
            else if (Aux.isExpStm(parsenode) &&
                Aux.isAssignmentExp(parsenode.expression)) {
                parsenode.expression.right = transpiledNode;
            }
            else if (Aux.isAssignmentExp(parsenode)) {
                parsenode.right = transpiledNode;
            }
        }
        /* Has call nodes in value / right hand side? */
        if (call.length > 0) {
            makeTransformer(transpiler);
            transpiled  = CPSTransform.transformExp(transpiler);
            if (transpiled[1]) {
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;
                return transpiler;
            }
            else {
                transpiler.transpiledNode = parsenode;
            }
        }
        if (!transpiler.transpiledNode)
            transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformVariableDecl = transformVariableDecl;
    transformer.transformAssignmentExp = transformVariableDecl;

    /* Binary expression */
    function transformBinaryExp (transpiler) {
        var node = transpiler.node,
            call = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                        return n.isCallNode;
                    }),
            transpiled;
        if (call.length > 0) {
            makeTransformer(transpiler);
            transpiled  = transpiler.transformCPS.transformExp(transpiler);
            transpiler.nodes = transpiled[0];
            transpiler.transpiledNode = transpiled[1].parsenode;

            return transpiler;
        }
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformBinaryExp = transformBinaryExp;


    /* Function Expression */
    function transformFunctionExp (transpiler) {
        var node = transpiler.node,
            nodes = transpiler.nodes,
            parsenode = node.parsenode,
            parent    = Ast.parent(node.parsenode, transpiler.ast),
            formal_ins, formal_outs, parameters, body, bodynodes, transpiled, i, fp, p;

        if (node.isObjectEntry) {
            return transformFunctionConstructor(transpiler);
        }
        else {
            /*Formal parameters */
            formal_ins  = node.getFormalIn();
            formal_outs = node.getFormalOut();
            parameters  = parsenode.params;
            /* Formal in parameters */
            if (formal_ins.length > 0) {
                // Remove parameters that are not in dnodes
                for (i = 0; i < formal_ins.length; i += 1) {
                    fp = formal_ins[i];
                    p = parameters[i];
                    if(!nodesContains(transpiler.nodes, fp)) {
                        parameters.splice(i, 1);
                    }
                    transpiler.nodes = transpiler.nodes.remove(fp);
                }
                parsenode.params = parameters;
            }
            /* Formal out parameters */
            formal_outs.map(function (f_out) {
                transpiler.nodes = transpiler.nodes.remove(f_out);
            });
            /* Body */
            body = [];
            bodynodes = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {
                            return !n.isFormalNode;
                        });

            bodynodes.map(function (n) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
                if (nodesContains(transpiler.nodes, n)) {
                    body.push(transpiled.transpiledNode);
                }
                transpiler.nodes = transpiled.nodes.remove(n);
            });
            /* Overwrite body of parsenode */
            parsenode.body.body = body;

            if (transpiler.options.cps &&
                !(parsenode.id && parsenode.id.name.startsWith('anonf'))) {
                 transformer = makeTransformer(transpiler);
                 transpiled = CPSTransform.transformFunction(transpiler);

                transpiler.nodes = transpiled[0];

                if (Aux.isFunDecl(parsenode) && transpiled[1].setName) {
                    transpiled[1].setName(parsenode.id.name);
                }

                else if (Aux.isProperty(parent)) {
                    transpiler.transpiledNode = transpiled[1].parsenode;

                    return transpiler;
                }
                transpiler.transpiledNode = JSParse.createFunDecl(transpiled[1].parsenode);

                return transpiler;
            }

            transpiler.transpiledNode = parsenode;

            return transpiler;
        }
    }
    transformer.transformFunctionExp = transformFunctionExp;
    transformer.transformFunctionDecl = transformFunctionExp;


    function transformFunctionConstructor (transpiler) {
        var node        = transpiler.node,
            parsenode   = node.parsenode,
            constructor = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return n.isConstructor; })[0],
            properties  = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return !n.isConstructor; }),
            body        = [],
            formal_ins  = constructor.getFormalIn(),
            formal_outs = constructor.getFormalOut(),
            parameters  = parsenode.params,
            transpiled, transpiledNode, i, fp, p;

        /* Formal in parameters */
        if(formal_ins.length > 0) {
            /* Remove parameters that are not in nodes */
            for (i = 0; i < formal_ins.length; i += 1) {
                fp = formal_ins[i];
                p = parameters[i];

                if(!nodesContains(transpiler.nodes, fp)) {
                    parameters.splice(i,1);
                }
                transpiler.nodes = transpiler.nodes.remove(fp);
            }
            node.parsenode.params = parameters;
        }

        /* Formal out parameters */
        formal_outs.map(function (f_out) {
            transpiler.nodes = transpiler.nodes.remove(f_out);
        });

        properties.map(function (property) {
            var propnode;
            if (nodesContains(transpiler.nodes, property)) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
                transpiledNode = transpiled.transpiledNode;
                body.push(transpiledNode);
                transpiler.nodes = transpiled.nodes.remove(property);
            }
        });
        /* Overwrite body */
        parsenode.body.body = body;
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.nodes = transpiler.nodes.remove(constructor);
        transpiler.transpiledNode = parsenode;
        return transpiler;
    }


    function transformCallExp (transpiler) {
        var node        = transpiler.node,
            parsenode   = node.parsenode,
            actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),
            parent      = Ast.parent(node.parsenode, transpiler.ast),
            callexp     = Aux.clone(Pdg.getCallExpression(node.parsenode)),
            callargs    = 0,
            transformed, transpiled;

        arguments = actual_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in);
        }).map(function (a_in) {
            var transpiled = Transpiler.copyTranspileObject(transpiler, a_in);
            transpiled  = Transpiler.transpile(transpiled);
            transpiler.nodes = transpiled.nodes;
            transpiler.nodes = transpiler.nodes.remove(a_in);
            return transpiled.transpiledNode;
        });
       
        actual_ins.map(function (a_in) {
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) { return n.isCallNode && !n.equals(node)})
                .map(function (n) {
                    callargs++;
                    transpiler.nodes = transpiler.nodes.remove(n);
                });
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {return !n.isCallNode})
                .map(function (n) {transpiler.nodes = transpiler.nodes.remove(n); })    
        });

        actual_outs.map(function (a_out) {
            transpiler.nodes = transpiler.nodes.remove(a_out);
        });

        makeTransformer(transpiler);

        if (transpiler.options.cps) {
            
            transformed = CPSTransform.transformCall(transpiler, false, (Aux.isExpStm(parsenode) && Aux.isCallExp(parsenode.expression)) ? parsenode : parent);
            transpiler.nodes = transformed[0];
            

            if (Aux.isMemberExpression(Pdg.getCallExpression(parsenode).callee) && 
                callargs < 1 && !transpiler.parseUtils.shouldTransform(transpiler.node) &&
                transformed[1].isRPC) {
                
                node.parsenode.arguments = transformed[1].getArguments();

                transpiler.closeupNode = transformed[1].getCallback().getBody();

                if (Aux.isExpStm(parsenode)) {
                    transpiler.transpiledNode = node.parsenode;
                } else 
                    transpiler.transpiledNode = parent;

                return transpiler;
            }

            else {
                transpiler.transpiledNode = transformed[1].parsenode;

                return transpiler;
            }
        }
        else if (callargs > 0) {
            actual_ins.map(function (a_in) {
                a_in.getOutNodes(EDGES.CONTROL)
                    .filter(function (n) { return n.isCallNode && !n.equals(node)})
                    .map(function (n) {
                        var transpiled = Transpiler.copyTranspileObject(transpiler, n);
                        transpiled  = Transpiler.transpile(transpiled);
                        transpiler.nodes = transpiled.nodes;
                    });
            })
        }

        callexp.arguments = arguments;

        if (Aux.isExpStm(parent) && Aux.isCallExp(parent.expression)) {
            parent = Aux.clone(parent);
            parent.expression = callexp;
            transpiler.transpiledNode = parent;
        }
        else {
            node.parsenode.expression = callexp;
            transpiler.transpiledNode = node.parsenode;
        }

        return transpiler;
    }
    transformer.transformCallExp = transformCallExp;


    function transformReturnStm (transpiler) {
        var node = transpiler.node,
            call = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                        return  n.isCallNode
                       }),
            object = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {
                            return n.isObjectEntry
                        }),
            excexits = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {
                            return n.isExitNode;
                        }),
            parsenode = Aux.clone(node.parsenode),
            transpiled;

        makeTransformer(transpiler);
        parsenode.__upnode = getEnclosingFunction(transpiler.node.parsenode, transpiler.ast);

        if (call.length > 0) {
            transpiled = transpiler.transformCPS.transformExp(transpiler);
            transpiler.nodes = transpiled[0];
            transpiler.transpiledNode = transpiled[1].parsenode;
            transpiler.transpiledNode.__upnode = parsenode.__upnode;

            return transpiler;
        }
        if (object.length > 0) {
            object.map(function (oe) {
                var formout = oe.getOutNodes(EDGES.DATA)
                                .filter(function (n) {return n.isFormalNode});
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, oe));
                parsenode.argument = transpiled.transpiledNode;
                transpiler.nodes = transpiled.nodes.remove(oe);
                transpiler.nodes = transpiler.nodes.remove(formout);
            })
        }
        if (excexits.length > 0) {
            excexits.map(function (en) {
                transpiler.nodes = transpiler.nodes.remove(en);
            })
        }   
        //transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }

    transformer.transformReturnStm = transformReturnStm;


    function transformBlockStm (transpiler) {
        var node = transpiler.node,
            body = [],
            parsenode = node.parsenode,
            bodynodes = node.getOutNodes(EDGES.CONTROL),
            transpiled;

        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));

            if (nodesContains(transpiler.nodes, n) && transpiled.transpiledNode) {
                body = body.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            transpiled.closeupNode = transpiled.setupNode = [];
            Transpiler.copySetups(transpiled, transpiler);
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body = body;
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformBlockStm = transformBlockStm;


    function transformForStm (transpiler) {
        var node = transpiler.node,
            body = [],
            parsenode = node.parsenode,
            init = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.parsenode.equals(parsenode.init);}),
            update = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.parsenode.equals(parsenode.update);}),
            test = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.parsenode.equals(parsenode.test);}),
            bodynodes = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) { return n.isEntryNode || n.parsenode.equals(parsenode.body); }),
            transpiled;
    
        init.map(function (initnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, initnode));
            transpiler.nodes = transpiled.nodes.remove(initnode);
            parsenode.init = transpiled.transpiledNode;
        });
        update.map(function (updatenode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, updatenode));
            transpiler.nodes = transpiled.nodes.remove(updatenode);
            parsenode.update = transpiled.transpiledNode;
        });
        test.map(function (testnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, testnode));
            transpiler.nodes = transpiled.nodes.remove(testnode);
            parsenode.test = transpiled.transpiledNode;
        });
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));

            if (nodesContains(transpiler.nodes, n) && transpiled.transpiledNode) {
                body = body.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            transpiled.closeupNode = transpiled.setupNode = [];
            Transpiler.copySetups(transpiled, transpiler);
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body = body[0];
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformForStm = transformForStm;


    function transformForInStm (transpiler) {
        var node = transpiler.node,
            body = [],
            parsenode = node.parsenode,
            left = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.parsenode.equals(parsenode.left);}),
            right = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.parsenode.equals(parsenode.right);}),
            bodynodes = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) { return n.isEntryNode || n.parsenode.equals(parsenode.body); }),
            transpiled;
    
        init.map(function (leftnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, leftnode));
            transpiler.nodes = transpiled.nodes.remove(leftnode);
            parsenode.left= transpiled.transpiledNode;
        });
        update.map(function (rightnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, rightnode));
            transpiler.nodes = transpiled.nodes.remove(rightnode);
            parsenode.right = transpiled.transpiledNode;
        });
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));

            if (nodesContains(transpiler.nodes, n) && transpiled.transpiledNode) {
                body = body.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            transpiled.closeupNode = transpiled.setupNode = [];
            Transpiler.copySetups(transpiled, transpiler);
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body = body[0];
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }

    transformer.transformForInStm = transformForInStm;

    function transformIfStm (transpiler) {
        var node      = transpiler.node,
            parsenode = node.parsenode,
            test      = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) { return e.label !== true && e.label !== false })
                        .map(function (e) { return e.to }),
            conseq    = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === true; }) // explicit check necessary
                        .map(function (e) {return e.to; }),
            altern     = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === false; })  // explicit check necessary
                        .map(function (e) {return e.to;}),
            transpiled;

        test.map(function (testnode) {
            transpiler.nodes = transpiler.nodes.remove(testnode);  /* TODO not just remove them */
        });

        conseq.map(function (consnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, consnode));
            transpiler.nodes = transpiled.nodes.remove(consnode);
            parsenode.consequent = transpiled.transpiledNode;
        });

        altern.map(function (altnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, altnode));
            transpiler.nodes = transpiled.nodes.remove(altnode);
            parsenode.alternate = transpiled.transpiledNode;
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformIfStm = transformIfStm;


    function transformObjectExp (transpiler) {
        var node = transpiler.node,
            prop = node.getOutNodes(EDGES.OBJMEMBER),
            properties = [],
            parsenode  = Aux.clone(node.parsenode),
            transpiled;

        prop.map(function (property) {
            if (nodesContains(transpiler.nodes, property) &&
                !(Aux.isExpStm(property.parsenode) && Aux.isAssignmentExp(property.parsenode.expression))) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
                properties.push(transpiled.transpiledNode);
                transpiler.nodes = transpiled.nodes;
            }
            if (!(Aux.isExpStm(property.parsenode) && Aux.isAssignmentExp(property.parsenode.expression)))
                transpiler.nodes = transpiler.nodes.remove(property);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.properties = properties;
        transpiler.transpiledNode = parsenode;
        return transpiler;
    }
    transformer.transformObjectExp = transformObjectExp;



    function transformNewExp (transpiler) {
        var node        = transpiler.node,
            upnode      = node.getInNodes(EDGES.DATA).concat(node.getInNodes(EDGES.CONTROL).filter(function (n) {return n.isActualPNode}))[0],
            call        = upnode.getOutNodes(EDGES.CONTROL)
                            .filter(function (n) {return n.isCallNode && n.parsenode.equals(node.parsenode) })[0],
            parsenode   = node.parsenode,
            actual_ins  = call.getActualIn(),
            actual_outs = call.getActualOut();

        transpiler.nodes = transpiler.nodes.remove(call);

        actual_outs.map(function (a_out) {
            if (nodesContains(transpiler.nodes, a_out)) {
                transpiler.nodes = transpiler.nodes.remove(a_out);
            }
        });

        actual_ins.map(function (a_in) {
            a_in.getOutNodes(EDGES.CONTROL)
                .map(function (n) {
                    transpiler.nodes = transpiler.nodes.remove(n);
                });   
        });

        parsenode.arguments = actual_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in);
        }).map(function (a_in) { transpiler.nodes = transpiler.nodes.remove(a_in); return a_in.parsenode; });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformNewExp = transformNewExp;

    function transformProperty (transpiler) {
        var node    = transpiler.node,
            entries = node.getOutNodes(EDGES.DATA)
                          .filter( function (n) { return n.isEntryNode}),
            objectentries = node.getOutNodes(EDGES.CONTROL)
                            .filter(function (n) {return n.isObjectEntry}),
            calls   = node.getOutNodes(EDGES.CONTROL)
                          .filter( function (n) { return n.isCallNode; }),
            transpiled;

        entries.map(function (entry) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            node.parsenode.value = transpiled.transpiledNode;
            transpiler.nodes = transpiled.nodes.remove(entry);
        });

        objectentries.map(function (entry) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            node.parsenode.value = transpiled.transpiledNode;
            transpiler.nodes = transpiled.nodes.remove(entry);
        });

        calls.map(function (call) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, call));
            transpiler.nodes = transpiled.nodes.remove(call);
        });

        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformProperty = transformProperty;


    function transformTryStm (transpiler) {
        var block      = [],
            node       = transpiler.node,
            blocknodes = node.getOutNodes(EDGES.CONTROL),
            /* Nodes that are calls are have calls in them */
            callnodes  = blocknodes.filter(function (n) { return Aux.hasCallStm(n)}),
            /* Get the actual calls */
            calls      = callnodes.flatMap(function (cn) { 
                            if (cn.isCallNode) 
                                return [cn];
                            else return cn.findCallNodes();  
                        }),
            catches    = calls.flatMap(function (call) {
                            return call.getOutNodes(EDGES.CONTROL)
                                      .filter(function (n) {
                                         return ! n.isExitNode && 
                                           n.parsenode && 
                                           Aux.isCatchStm(n.parsenode)})
                        }),
            handler, transpiled;

        blocknodes.map(function (node) {
            if (nodesContains(transpiler.nodes, node)) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, node));
                transpiler.nodes = transpiled.nodes.remove(node);
                block = block.concat(transpiled.getTransformed());
            }
        });

        catches.map(function (node) {
            if (nodesContains(transpiler.nodes, node)) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, node));
                handler = transpiled.transpiledNode;
                transpiler.nodes = transpiled.nodes.remove(node);
            }
        })


        node.parsenode.handler = handler;
        node.parsenode.block.body = block;
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformTryStm = transformTryStm;

    function transformCatchStm (transpiler) {
        var node = transpiler.node,
            bodynodes = node.getOutNodes(EDGES.CONTROL)
                        .filter (function (n) {
                            return !n.isActualPNode;
                        }),
            body = [],
            transpiled;

        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if (nodesContains(transpiler.nodes, n)) {
                body = body.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            Transpiler.copySetups(transpiled, transpiler);
        })

        transpiler.nodes = transpiler.nodes.remove(node);
        node.parsenode.body.body = body;
        transpiler.transpiledNode = node.parsenode;
        
        return transpiler;
    }

    transformer.transformCatchClause = transformCatchStm;


    function transformThrowStm (transpiler) {
        var node    = transpiler.node,
            excexit = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {return n.isExitNode; }),
            transpiled;

        excexit.map(function (exitnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, exitnode));
            transpiler.nodes = transpiled.nodes.remove(exitnode);
            node.parsenode.argument = transpiled.transpiledNode;
            Transpiler.copySetups(transpiled, transpiler);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformThrowStm = transformThrowStm;

    function noTransformationDefined (transpiler) {
        transpiler.transpiledNode = false;
        return transpiler;
    }
    
    transformer.transformFormalParameter = noTransformationDefined;

    function noTransformation (transpiler) {
        transpiler.transpiledNode = transpiler.node.parsenode;
        return transpiler;
    }

    transformer.transformExitNode = noTransformation;
    transformer.transformActualParameter = noTransformation;
    transformer.transformMemberExpression = noTransformation;
    transformer.transformUpdateExp = noTransformation;

    function nodesContains (nodes, node, cps) {
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0;
    }

    /* Aux function, returns function (if any) of given statement (parse node) */
    function getEnclosingFunction (parsenode, ast) {
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


    if (typeof module !== 'undefined' && module.exports !== null) {
        JSParse = require('./JS_parse.js').JSParse;
        exports.JSify = transformer;
    }

    return transformer;

})();