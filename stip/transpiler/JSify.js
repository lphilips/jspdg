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
            var parsenode = Aux.isExpStm(call.parsenode) ? call.parsenode.expression : call.parsenode;
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
            parsenode   = node.parsenode,
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
                     Aux.isAssignmentExp(parsenode.expression)) {

                        if (Aux.isFunDecl(transpiledNode)) {
                            transpiledNode.id = parsenode.expression.left;
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
            transpiled.nodes = transpiled.nodes.remove(object[0]);
            transpiledNode   = transpiled.transpiledNode;
            Transpiler.copySetups(transpiled, transpiler);

            if (Aux.isVarDecl(parsenode)) {
                Aux.getDeclaration(parsenode).init = transpiledNode;
            }
            else if (Aux.isExpStm(parsenode) &&
                Aux.isAssignmentExp(parsenode.expression)) {
                parsenode.right = transpiledNode;
            }

        }
        /* Has call nodes in value / right hand side? */
        if (call.length > 0) {
            transformer = makeTransformer(transpiler);
            transpiled  = CPSTransform.transformExp(node, transpiler.nodes, transformer);
            if (transpiled[1]) {
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;
            }
            else {
                transpiler.transpiledNode = parsenode;
            }
        }
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformVariableDecl = transformVariableDecl;
    transformer.transformAssignmentExp = transformVariableDecl;

    /* Binary expression */
    function transformBinaryExp (transpiler) {
        var call = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                        return n.isCallNode;
                    }),
            node = transpiler.node,
            nodes = transpiler.nodes,
            transpiled, transformer;
        if (call.length > 0) {
            transformer = makeTransformer(transpiler);
            transpiled  = CPSTransform.transformExp(node, nodes, transformer);
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
                if (nodesContains(nodes, n)) {
                    body.push(transpiled.transpiledNode);
                }
                transpiler.nodes = transpiled.nodes.remove(n);
            });
            /* Overwrite body of parsenode */
            parsenode.body.body = body;

            if (transpiler.options.cps &&
                !(parsenode.id && parsenode.id.name.startsWith('anonf'))) {
                var transformer = makeTransformer(transpiler),
                    transformed = CPSTransform.transformFunction(node, transpiler.nodes, transformer);

                transpiler.nodes = transformed[0];

                if (Aux.isFunDecl(parsenode) && transformed[1].setName) {
                    transformed[1].setName(parsenode.id.name);
                }

                else if (Aux.isProperty(parent)) {
                    transpiler.transpiledNode = transformed[1].parsenode;

                    return transpiler;
                }
                transpiler.transpiledNode = JSParse.createFunDecl(transformed[1].parsenode);

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

                if(!nodesContains(nodes, fp)) {
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
            if (nodesContains(nodes, property)) {
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
            parent      = Ast.parent(node.parsenode, transpiler.ast);

        arguments = actual_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in);
        }).map(function (a_in) {
            return a_in.parsenode;
        });
       
        actual_ins.map(function (a_in) {
            transpiler.nodes = transpiler.nodes.remove(a_in);
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {
                    return n.isCallNode
                })
                .map(function (n) {
                    transpiler.nodes = transpiler.nodes.remove(n)
                })
        });
        actual_outs.map(function (a_out) {
            transpiler.nodes = transpiler.nodes.remove(a_out);
        });

        if (transpiler.options.cps) {
            var transformer = makeTransformer(transpiler),
                parsenode   = node.parsenode,
                transformed = CPSTransform.transformCall(node, transpiler.nodes, transformer, false, parent);

            transpiler.nodes = transformed[0];

            if (transformer.shouldTransform(node) &&
                Aux.isMemberExpression(parsenode.callee)) {
                node.parsenode.arguments = transformed[1].getArguments();

                transpiler.transformedNode = parent;

                return transpiler;
            }

            else {
                transpiler.transpiledNode = transformed[1].parsenode;

                return transpiler;
            }
        }
        
        Pdg.getCallExpression(node.parsenode).arguments = arguments;
        if (Aux.isExpStm(parent) && Aux.isCallExp(parent.expression)) {
            transpiler.transpiledNode = parent;
        }
        else {
            transpiler.transpiledNode = node.parsenode;
        }

        transpiler.nodes = transpiler.nodes;
        return transpiler;
    }
    transformer.transformCallExp = transformCallExp;


    function transformReturnStm (transpiler) {
        var node      = transpiler.node,
            parsenode = node.parsenode,
            call      = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                        return n.isCallNode;
                       }),
            object    = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {
                            return n.isObjectEntry;
                        });

        if (call.length > 0) {
            var transformer = makeTransformer(transpiler),
                transformed = CPSTransform.transformExp(node, transpiler.nodes, transformer);

            transpiler.nodes = transformed[0];
            transpiler.transpiledNode = transformed[1].parsenode;

            return transpiler;
        }

        if (object.length > 0) {

            object.map(function (oe) {
                var formout    = oe.getOutNodes(EDGES.DATA)
                                .filter(function (n) {return n.isFormalNode; });
                var transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, oe));
                parsenode.argument = transpiled.transpiledNode;
                transpiler.nodes = transpiled.nodes.remove(oe);
                transpiler.nodes = transpiled.nodes.remove(formout);
            });
        }

        transpiler.nodes = transpiler.nodes.remove(node);
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

            if (nodesContains(transpiler.nodes, n)) {
                    body.push(transpiled.transpiledNode);
            }
            transpiler.nodes = transpiled.nodes.remove(n);
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body = body;
        transpiler.transpiledNode = parsenode;
        return transpiled;
    }
    transformer.transformBlockStm = transformBlockStm;


    function transformIfStm (transpiler) {
        var node      = transpiler.node,
            parsenode = node.parsenode,
            conseq    = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === true; }) // explicit check necessary
                        .map(function (e) {return e.to; }),
            altern     = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === false; })  // explicit check necessary
                        .map(function (e) {return e.to;}),
            transpiled;

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
            parsenode  = node.parsenode,
            transpiled;

        prop.map(function (property) {
            if (nodesContains(transpiler.nodes, property)) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
                properties.push(transpiled.transpiledNode);
                transpiler.nodes = transpiled.nodes.remove(property);
            }
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.properties = properties;
        transpiler.transpiledNode = parsenode;
        return transpiler;
    }
    transformer.transformObjectExp = transformObjectExp;



    function transformNewExp (transpiler) {
        var node        = transpiler.node,
            call        = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return n.isCallNode; })[0],
            parsenode   = node.parsenode,
            actual_ins  = call.getActualIn(),
            actual_outs = call.getActualOut();

        transpiler.nodes = transpiler.nodes.remove(call);
        actual_outs.map(function (a_out) {
            if (nodesContains(transpiler.nodes, a_out)) {
                transpiler.nodes = transpiler.nodes.remove(a_out);
            }
        });

        parsenode.arguments = actual_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in);
        }).map(function (a_in) { return a_in.parsenode; });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformNewExp = transformNewExp;

    function transformProperty (transpiler) {
        var node    = transpiler.node,
            entries = node.getOutNodes(EDGES.DATA)
                          .filter( function (n) { return n.isEntryNode; }),
            calls   = node.getOutNodes(EDGES.CONTROL)
                          .filter( function (n) { return n.isCallNode; }),
            transpiled;

        entries.map(function (entry) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            node.parsenode.value = transpiled.transpiledNode;
            transpiler.nodes = transpiled.nodes.remove(entry);
        });

        calls.map(function (call) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            transpiler.nodes = transpiled.nodes.remove(call);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformProperty = transformProperty;


    function transformTryStm (transpiler) {
        var node       = transpiler.node,
            block      = [],
            handlers   = [],
            blocknodes = node.getOutNodes(EDGES.CONTROL),
            calls      = blocknodes.filter(function (n) { return n.isCallNode; }),
            catches    = calls.flatMap(function (call) {
                         return call.getOutNodes(EDGES.CONTROL)
                            .filter(function (n) {
                                return !n.isExitNode &&
                                  n.parsenode &&
                                  Aux.isCatchStm(n.parsenode);});
                        }),
            transpiled;

        blocknodes.map(function (blocknode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, blocknode));
            transpiler.nodes = transpiled.nodes.remove(blocknode);
            block.push(transpiled.transpiledNode);
        });

        catches.map(function (catchnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpile, catchnode));
            transpiler.nodes = transpiled.nodes.remove(catchnode);
        });

        node.parsenode.block.body = block;
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformTryStm = transformTryStm;


    function transformThrowStm (transpiler) {
        var node    = transpiler.node,
            excexit = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {return n.isExitNode; }),
            transpiled;

        excexit.map(function (exitnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, exitnode));
            transpiler.nodes = transpiled.nodes.remove(exitnode);
            node.parsenode.argument = transpiled.transpiledNode;
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformThrowStm = transformThrowStm;

    function noTransformation (transpiler) {
        transpiler.transpiledNode = false;
        return transpiler;
    }
    transformer.transformActualParameter = noTransformation;
    transformer.transformFormalParameter = noTransformation;
    transformer.transforEcitNode = noTransformation;

    function nodesContains (nodes, node, cps) {
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0;
    }


    if (typeof module !== 'undefined' && module.exports !== null) {
        JSParse = require('./JS_parse.js').JSParse;
        exports.JSify = transformer;
    }

    return transformer;

})();