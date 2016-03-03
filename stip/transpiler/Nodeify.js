/****************************************************************
 *               TRANSFORMATIONS FOR NODE.JS                    *
 *                                                              *
 *      - wait.for library in combination with zerorpc          *
 *                                                              *
 *  Where possible, falafel.js is used for transformations      *
 *                                                              *
 ****************************************************************/


var Nodeify = (function () {


    var transformer = {};
    
    function makeTransformer (transpiler) {
        switch (transpiler.options.asynccomm) {
        case 'callbacks':
            transpiler.parseUtils = {
                createRPC  : function (call) {
                        var parsenode = Pdg.getCallExpression(call.parsenode);
                        if (Aux.isMemberExpression(parsenode.callee) &&
                            asyncs.indexOf(parsenode.callee.object.name) >= 0) 
                            return JSParse.RPC;
                        else 
                            return NodeParse.RPC; 

                    },
                createCallback : NodeParse.callback,
                shouldTransform : shouldTransform,
                createAsyncFunction : NodeParse.asyncFun,
                createCbCall : NodeParse.createCallCb,
                createRPCReturn : NodeParse.RPCReturn,
                createAsyncReplyCall : NodeParse.asyncReplyC
            };
            transpiler.transformCPS = CPSTransform;
        }
    }

    var shouldTransform = function (call) {
        var parsenode = Pdg.getCallExpression(call.parsenode),
            entrynode,   
            entrydtype,  
            calldtype;  
        if (call.primitive) {
            return false;
        } 
        else if (Aux.isMemberExpression(parsenode.callee) &&
            asyncs.indexOf(parsenode.callee.object.name) >= 0) 
            return true;

        else {
            entrynode  = call.getEntryNode()[0],
            entrydtype = entrynode.getdtype(),
            calldtype  = call.getdtype(); 
            /* Only client->server calls should be transformed by CPS module */
            return !(entrydtype.value === DNODES.CLIENT.value  && 
                     calldtype.value  === DNODES.SERVER.value) &&
                    (entrydtype.value === DNODES.SERVER.value  &&
                     calldtype.value  === DNODES.CLIENT.value) && 
                    entrydtype.value  !== DNODES.SHARED.value 
            }
    }

    /* Variable Declaration */
    function nodeifyVarDecl (transpiler) {
        var node    = transpiler.node,
            entry   = node.getOutNodes(EDGES.DATA)
                          .filter(function (n) {
                            return n.isEntryNode;
                    }),
            call    = node.getOutNodes(EDGES.CONTROL)
                          .filter(function (n) {
                            return n.isCallNode;
                    }),
            objects  = node.getOutNodes(EDGES.DATA)
                        .filter(function (n) {
                             var parent = Ast.parent(n.parsenode, transpiler.ast);
                             return n.isObjectEntry && !Aux.isRetStm(parent);
                     }),
            transpiled;
        makeTransformer(transpiler);
        if (Aux.isVarDeclarator(node.parsenode))
            node.parsenode = NodeParse.createVarDecl(node.parsenode);
        
        /* Outgoing data dependency to entry node? -> Function Declaration */
        if (entry.length > 0) {
            entry = entry[0]; /* always 1, if assigned later on, the new one would be attached to assignment node */
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            if (entry.isServerNode() && entry.clientCalls > 0 ||
                entry.isClientNode() && entry.serverCalls > 0) {
                /* set the name of the method */
                transpiled.method.setName(Aux.getDeclaration(node.parsenode).id);
                transpiler.methods.push(transpiled.method.parsenode);
                transpiled.method = false;
                transpiler.nodes = transpiled.nodes.remove(entry);
            }
            node.parsenode.declarations.init = transpiler.parsednode;
            transpiler.nodes = transpiled.nodes;
            
        }
        
        /* Outgoing data dependency to object entry node? */
        if (objects.length > 0) {
            var elements = [];

            objects.map(function (object) {
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, object));

                if (Aux.isVarDecl(node.parsenode) && 
                    Aux.isArrayExp(node.parsenode.declarations[0].init)) {
                    elements.push(transpiled.transpiledNode);
                    
                } 
                else if (Aux.isVarDecl(node.parsenode)) {
                    Aux.getDeclaration(node.parsenode).init = transpiled.transpiledNode;
                }

                else if (Aux.isExpStm(node.parsenode) && 
                    Aux.isAssignmentExp(node.parsenode.expression)) {
                    node.parsenode.right = transpiled.transpiledNode;
                }

                transpiler.nodes = transpiled.nodes;
            });

            if (Aux.isVarDecl(node.parsenode) && 
                Aux.isArrayExp(Aux.getDeclaration(node.parsenode).init)) {
                Aux.getDeclaration(node.parsenode).init.elements = elements;
            } 
        }

        /* Outgoing dependency on call nodes?
         * -> nodeify every call (possibly rpcs) */
        else if (call.length > 0) {
            transpiled = transpiler.transformCPS.transformExp(transpiler);
            transpiler.nodes = transpiled[0];
            transpiler.transpiledNode = transpiled[1].parsenode;

            return transpiler;
        }

        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformVariableDecl = nodeifyVarDecl;
    transformer.transformAssignmentExp = nodeifyVarDecl;

    /* Binary Expression */
    function nodeifyBinExp (transpiler) {
        var node = transpiler.node,
            call = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                            return n.isCallNode
                       }),
            transpiled;
        makeTransformer(transpiler);
        if (call.length > 0) {
            transpiled = transpiler.transformCPS.transformExp(transpiler);
            transpiler.transpiledNode = transpiled[1].parsenode;
            transpiler.nodes = transpiled[0];

            return transpiler;
        }
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformBinaryExp = nodeifyBinExp;


    /* Function expression */
    function nodeifyFunExp (transpiler) {
        /* Formal parameters */
        var node      = transpiler.node,
            form_ins  = node.getFormalIn(),
            form_outs = node.getFormalOut(),
            parsenode = node.parsenode,
            params    = parsenode.params,
            parent    = Ast.parent(parsenode, transpiler.ast),
            transpiled;


        makeTransformer(transpiler);
        if (node.isObjectEntry) {
            return nodeifyFunConstructor(transpiler);
        }

        /* Formal in parameters */
        if(form_ins.length > 0) {
            /* Remove parameters that are not in nodes */
            for(var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!nodesContains(transpiler.nodes,fp)) {
                    params.splice(i, 1);
                }
                transpiler.nodes = transpiler.nodes.remove(fp);
            }
            parsenode.params = params;
        };

        /* Formal out parameters */
        form_outs.map(function (f_out) {
            transpiler.nodes = transpiler.nodes.remove(f_out);
        })

        /* Body */
        var body = [],
            bodynodes = node.getOutEdges(EDGES.CONTROL).filter(function (e) {
                return !e.to.isFormalNode //e.to.isStatementNode || e.to.isCallNode;
            }).map(function (e) { return e.to }).sort(function (n1, n2) { 
                return n1.cnt - n2.cnt;
            }); 

        /* nodeify every body node */
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if(nodesContains(transpiler.nodes, n)) 
                body.push(transpiled.transpiledNode);
            transpiler.nodes = transpiled.nodes.remove(n);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body.body = body;

        /* CASE 2 : Server function that is called by client side */
        if(node.isServerNode() && node.clientCalls > 0) {
            transpiled = transpiler.transformCPS.transformFunction(transpiler);    
            transpiler.method = transpiled[1];
        }

        /* CASE 5 : Client function that is called by server side */ 
        if (node.isClientNode() && node.serverCalls > 0) {
            transpiled = transpiler.transformCPS.transformFunction(transpiler);    
            transpiler.method = transpiled[1];
        }

        if ((node.isClientNode() && node.clientCalls > 0) || 
            (node.isServerNode() && node.serverCalls > 0) || 
            node.dtype === DNODES.SHARED) {
            transpiler.nodes = transpiler.nodes.remove(node);
            transpiler.transpiledNode  = parsenode;
            transpiler.transpiledNode.body.body = body;
        }

        if (! Aux.isVarDeclarator(parent) && transpiler.method.setName) {
            transpiler.method.setName(node.parsenode.id.name);
            transpiler.methods.push(transpiler.method.parsenode);
            transpiler.method = false;
        }

        return transpiler;
    }
    transformer.transformFunctionExp = nodeifyFunExp;
    transformer.transformFunctionDecl = nodeifyFunExp;



    function nodeifyFunConstructor (transpiler) {
      var node        = transpiler.node,
          constructor = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return n.isConstructor; })[0],
          properties  = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return !n.isConstructor; }),
          body        = [],
          form_ins    = constructor.getFormalIn(),
          form_outs   = constructor.getFormalOut(),
          parsenode   = node.parsenode,
          params      = parsenode.params,
          transpiled;
        // Formal in parameters
        if(form_ins.length > 0) {
            // Remove parameters that are not in nodes
            for (var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!nodesContains(transpiler.nodes,fp)) {
                    params.splice(i,1);
                }
                transpiler.nodes = transpiler.nodes.remove(fp);
            }
            node.parsenode.params = params;
        };
        // Formal out parameters
        form_outs.map(function (f_out) {
            transpiler.nodes = transpiler.nodes.remove(f_out);
        })

      properties.map(function (property) {
        var propnode;
        if (nodesContains(transpiler.nodes, property)) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
            body.push(transpiled.transpiledNode);
            transpiler.nodes = transpiled.nodes.remove(property);
        }
      })
      node.parsenode.body.body = body;
      transpiler.nodes = transpiler.nodes.remove(node);
      transpiler.nodes = transpiler.nodes.remove(constructor);
      transpiler.transpiledNode = node.parsenode;

      return transpiler;
    }


    /*
     * CALL EXPRESSION:
     * 1: function defined on SERVER, called on SERVER -> no transformation
     * 2: function defined on SERVER, called on CLIENT -> transform to Meteor method call
     * 3: function defined on SERVER, called by BOTH   -> combination of previous cases
     * 4: function defined on CLIENT, called on CLIENT -> no transformation
     * 5: function defined on CLIENT, called on SERVER -> transform to Meteor method call (subhog package)
     * 6: function defined on CLIENT, called by BOTH   -> combination of previous cases
     */
    function nodeifyCallExp (transpiler) {
        var node        = transpiler.node,
            actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),  
            parent      = Ast.parent(node.parsenode, transpiler.ast),
            entryNode   = node.getEntryNode()[0],
            transpiled;
        makeTransformer(transpiler);

        actual_ins.map(function (a_in) {
            a_in.getOutNodes(EDGES.CONTROL)
                .map(function (n) {
                    /* TODO: parsenode */
                    transpiler.nodes = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n)).nodes;
                })
            transpiler.nodes = transpiler.nodes.remove(a_in);
            a_in.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {
                    return n.isCallNode;
                })
                .map(function (n) {
                    transpiler.nodes = transpiler.nodes.remove(n);
                })
        });
        actual_outs.map(function (a_out) {
            transpiler.nodes = transpiler.nodes.remove(a_out);
        });

        if (node.primitive) {
            transpiler.transpiledNode = Aux.isExpStm(node.parsenode) ? node.parsenode : parent;
            return transpiler;
        }
        
        /* No entryNode found : can happen with library functions. 
           Just return call in this case ( TODO !)*/
        if (!entryNode) {
            transpiler.transpiledNode = parent;
            return transpiler;
        }
        /* Perform cloud types transformations on arguments */
        if (entryNode.isServerNode()) {
            /* CASE 2 */
            if (node.isClientNode()) {
                transpiled = transpiler.transformCPS.transformCall(transpiler, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;

                return transpiler;
            }
            /* CASE 1 : defined on server, called by server */
            else if(node.isServerNode()) {
                transpiler.transpiledNode = parent;
            }       

            return transpiler;
        }
        else if (entryNode.isClientNode()) {
            /* CASE  4 : defined on client, called by client */
            if(node.isClientNode()) {
                transpiled = transpiler.transformCPS.transformCall(node, transpiler.nodes, transformer, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode= transpiled[1].parsenode;

                return transpiler;
            }
            else {
                /* CASE 5 : defined on client, called by server */
                if (node.arity && arityEquals(node.arity, ARITY.ONE)) {
                    transpiled = transpiler.transformCPS.transformReplyCall(node, transpiler.nodes, transpiler);
                    transpiler.transpiledNode = transpiled[1].parsenode;
                    return transpiler;
                }
                transpiled = NodeParse.createBroadcast();
                transpiled.setName('"' + node.name + '"');
                transpiled.addArgs(Pdg.getCallExpression(node.parsenode).arguments);
                transpiler.transpiledNode= transpiled.parsenode;

                return transpiler;
            }
        }
        /* Shared function */
        else if (entryNode.isSharedNode()) {
            if (node.parsenode.leadingComment && Comments.isBlockingAnnotated(node.parsenode.leadingComment)) {
                transpiled = transformer.transformCPS.transformCall(node, transpiler.nodes, transformer, parent);
                transpiler.nodes = transpiled[0];
                transpiler.transpiledNode = transpiled[1].parsenode;
            }
            /* Called by client */
            else if (node.isClientNode() && Aux.isExpStm(parent)) {
                transpiler.transpiledNode = parent;
                transpiler.nodes = transpiler.nodes.remove(node);
            }
            /* Called by server */
            else if (node.isServerNode() && Aux.isExpStm(parent)) {
                transpiler.transpiledNode = parent;
                transpiler.nodes = transpiler.nodes.remove(node);
            } else {
                transpiler.transpiledNode= node.parsenode;
            }
            return transpiler;
        }
    }
    transformer.transformCallExp = nodeifyCallExp;


    function nodeifyRetStm (transpiler) {
        var node = transpiler.node,
            call = node.getOutNodes(EDGES.CONTROL)
                       .filter(function (n) {
                        return  n.isCallNode
                       }),
            object = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {
                            return n.isObjectEntry
                        }),
            transpiled;
            makeTransformer(transpiler);

        if (call.length > 0) {
            transpiled = transpiler.transformCPS.transformExp(transpiler);
            transpiler.nodes = transpiled[0];
            transpiled.transpiledNode = transpiled[1].parsenode;

            return transpiler;
        }
        if (object.length > 0) {
            object.map(function (oe) {
                var formout = oe.getOutNodes(EDGES.DATA)
                                .filter(function (n) {return n.isFormalNode});
                transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, oe));
                node.parsenode.argument = transpiled.transpiledNode;
                transpiler.nodes = transpiled.nodes.remove(oe);
                transpiler.nodes = transpiler.nodes.remove(formout);
            })
        }
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformReturnStm = nodeifyRetStm;



    function nodeifyIfStm (transpiler) {
        var node   = transpiler.node,
            test   = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) { return e.label !== true && e.label !== false })
                        .map(function (e) { return e.to }),   /* TODO not just remove them */
            conseq = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === true}) // explicit check necessary
                        .map(function (e) {return e.to}),
            altern = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === false}) // explicit check necessary
                        .map(function (e) {return e.to}),
            transpiled;
        
        test.map(function (testnode) {
            transpiler.nodes = transpiler.nodes.remove(testnode);  /* TODO not just remove them */
        });

        conseq.map(function (consnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, consnode));
            transpiler.nodes = transpiled.nodes.remove(consnode);
            node.parsenode.consequent = transpiled.transpiledNode;
        });

        altern.map(function (altnode) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, altnode));
            transpiler.nodes = transpiled.nodes.remove(altnode);
            node.parsenode.alternate = transpiled.transpiledNode;
        });
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformIfStm = nodeifyIfStm;


    function nodeifyTryStm (transpiler) {
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
                block.push(transpiled.transpiledNode);
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
    transformer.transformTryStm = nodeifyTryStm;


    function nodeifyCatchStm (transpiler) {
        var node      = transpiler.node,
            bodynodes = node.getOutNodes(EDGES.CONTROL)
                        .filter( function (n) {
                            return !n.isActualPNode;
                        }),
            body      = [],
            transpiled;

        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if(nodesContains(transpiler.nodes, n) ) {
                body.push(transpiled.transpiledNode);
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            Transpiler.copySetups(transpiled, transpiler);
        })

        transpiler.nodes = transpiler.nodes.remove(node);
        node.parsenode.body.body = body;
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformCatchClause = nodeifyCatchStm;


    function nodeifyThrowStm (transpiler) {
        var node    = transpiler.node,
            excexit = node.getOutNodes(EDGES.CONTROL)
                        .filter(function (n) {return n.isExitNode; }),
            transpiled;
        excexit.map(function (node) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, node));
            node.parsenode.argument = transpiled.transpiledNode;
            transpiler.nodes = transpiled.nodes.remove(node);
            Transpiler.copySetups(transpiled, transpiler);
        }) 
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformThrowStm = nodeifyThrowStm;


    /* Block statement */
    function nodeifyBlockStm (transpiler) {
        var body        = [],
            node        = transpiler.node,
            parsenode   = node.parsenode,
            bodynodes   = node.edges_out.filter(function (e) {
              return e.equalsType(EDGES.CONTROL)
                }).map(function (e) { return e.to }),
            transpiled;
        /* nodeify every body node */
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if( nodesContains(transpiler.nodes, n) && transpiled.transpiledNode) {
                    body.push(transpiled.transpiledNode);
            }
            transpiler.nodes = transpiled.nodes.remove(n);   
            Transpiler.copySetups(transpiled, transpiler)
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body = body;
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformBlockStm = nodeifyBlockStm;


    function nodeifyObjExpression (transpiler) {
        var node = transpiler.node,
            prop = node.getOutNodes(EDGES.OBJMEMBER),
            properties = [],
            parsenode  = node.parsenode,
            transpiled;

        prop.map(function (property) {
            //if (nodesContains(sliced.nodes, property)) {
                transpiled = Transpiler.transpiler(Transpiler.copyTranspileObject(transpiler, property));
                properties = properties.concat(transpiled.transpiledNode);
                transpiler.nodes = transpiled.nodes.remove(property);
            //}
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.properties = properties;
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformObjectExp = nodeifyObjExpression;


    function nodeifyNewExpression (transpiler) {
        var node      = transpiler.node,
            call      = node.getOutNodes(EDGES.OBJMEMBER)
                        .filter(function (n) {return n.isCallNode})[0],
            parsenode = node.parsenode,
            a_ins     = call.getActualIn(),
            a_outs    = call.getActualOut();
        
        transpiler.nodes = transpiler.nodes.remove(call);
        a_outs.map(function (a_out) {
            if (nodesContains(transpiler.nodes, a_out)) 
              transpiler.nodes = transpiler.nodes.remove(a_out);
        });
        parsenode.arguments = a_ins.filter(function (a_in) {
            return nodesContains(transpiler.nodes, a_in)    
        }).map(function (a_in) {return a_in.parsenode});

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = parsenode;

        return transpiler;
    }
    transformer.transformNewExp = nodeifyNewExpression;


    function nodeifyProperty (transpiler) {
        var node    = transpiler.node,
            entries = node.getOutNodes(EDGES.DATA)
                          .filter( function (n) { return n.isEntryNode}),
            calls   = node.getOutNodes(EDGES.CONTROL)
                          .filter( function (n) { return n.isCallNode}),
            transpiled;

        entries.map(function (entry) {
            transpiled =  Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
            node.parsenode.value = transpiled.transpiledNode;
            transpiler.nodes = transpiled.nodes.remove(entry);
        });

        calls.map(function (call) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, call));
            transpiler.nodes = transpiled.nodes.remove(call);
        });

        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = node.parsenode;

        return transpiler;
    }
    transformer.transformProperty = nodeifyProperty;

    
    function noTransformation (transpiler) {
        transpiler.transpiledNode = false;
        return transpiler;
    }
    transformer.transformActualParameter = noTransformation;
    transformer.transformFormalParameter = noTransformation;
    transformer.transformExitNode = noTransformation;

    /* Aux function: checks if two argument lists are the same */
    var argumentsEqual = function (args1, args2) {
        if (args1 && args2) {
            if(args1.length !== args2.length)
                return false
            else 
                for (var i = 0; i < args1.length; i++) {
                    if (escodegen.generate(args1[i]) !== escodegen.generate(args2[i]))
                        return false
                }
            return true
        }
        else 
            return false
    }


    function nodesContains (nodes, node, cps) {
        return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0;
    }

    if (typeof module !== 'undefined' && module.exports != null) {
        EDGES = require('../PDG/edge.js').EDGES;
        nodereq = require('../PDG/node.js');
        DNODES = nodereq.DNODES;
        arityEquals = nodereq.arityEquals;
        ARITY = nodereq.ARITY;
        NodeParse = require('./Node_parse.js').NodeParse;
        CPSTransform = require('./CPS_transform.js').CPSTransform;
        exports.Nodeify  = transformer;
    }

    return transformer


})()