/****************************************************************
 *               TRANSFORMATIONS FOR NODE.JS                    *
 *                                                              *
 *      - wait.for library in combination with zerorpc          *
 *                                                              *
 *  Where possible, falafel.js is used for transformations      *
 *                                                              *
 ****************************************************************/


var Nodeify = (function () {


    var module = {};
    
    var makeTransformer = function (option) {
        switch (option.asynccomm) {
        case 'callbacks':
            return {
                AST         : graphs.AST,
                transformF  : nodeify,
                callbackF   : NodeParse.callback,
                asyncCallF  : NodeParse.RPC,
                asyncFuncF  : NodeParse.asyncFun,
                asyncReplyC : NodeParse.asyncReplyC,
                cps         : true,
                shouldTransform : shouldTransform,
                option      : option,
                transform   : CPSTransform
            }
        case 'promises':
            return {
                AST         : graphs.AST,
                transformF  : nodeify,
                callbackF   : NodeParse.callback,
                asyncCallF  : NodeParse.RPC,
                asyncFuncF  : NodeParse.asyncFun,
                asyncReplyC : NodeParse.asyncReplyC,
                cps         : true,
                shouldTransform : shouldTransform,
                option      : option,
                transform   : PromiseTransform
            }
        }
    }

    var shouldTransform = function (call) {
        var entrynode,   
            entrydtype,  
            calldtype;  
        if (call.primitive) {
            return false;
        } else {
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
    var nodeifyVarDecl = function (sliced) {
        var node    = sliced.node,
            slicedn = sliced.nodes,
            entry   = node.getOutEdges(EDGES.DATA)
                          .map(function (e) {return e.to})
                          .filter(function (n) {
                            return n.isEntryNode;
                    }),
            call    = node.getOutEdges(EDGES.CONTROL)
                          .map(function (e) {return e.to})
                          .filter(function (n) {
                            return n.isCallNode;
                    }),
            objects  = node.getOutEdges(EDGES.DATA)
                        .filter(function (e) {
                             var parent = Ast.parent(e.to.parsenode, graphs.AST);
                             return e.to.isObjectEntry && !esp_isRetStm(parent);
                        })
                        .map(function (e) {return e.to}),
            transformer = makeTransformer(sliced.option);
        if (esp_isVarDeclarator(node.parsenode))
            node.parsenode = NodeParse.createVarDecl(node.parsenode);
        
        /* Outgoing data dependency to entry node? -> Function Declaration */
        if (entry.length > 0) {
            var entry = entry[0],
                f     = toNode(cloneSliced(sliced, slicedn, entry));
            if (entry.isServerNode() && entry.clientCalls > 0 ||
                entry.isClientNode() && entry.serverCalls > 0) {
                /* set the name of the method */
                f.method.setName(node.parsenode.declarations[0].id);
                sliced.method = {};
                sliced.methods = sliced.methods.concat(f.method.parsenode);
            }
            node.parsenode.declarations.init = f.parsednode;
            slicedn = f.nodes;
        }
        
        /* Outgoing data dependency to object entry node? */
        if (objects.length > 0) {
            var elements = [];
            objects.map(function (object) {
                var obj = toNode(cloneSliced(sliced, slicedn, object));
                if (esp_isArrayExp(node.parsenode.declarations[0].init)) {
                    elements.push(obj.parsednode);
                    
                } 
                else if (esp_isVarDecl(node.parsenode))
                    node.parsenode.declarations[0].init = obj.parsednode;
                else if (esp_isExpStm(node.parsenode) && 
                    esp_isAssignmentExp(node.parsenode.expression))
                    node.parsenode.right = obj.parsednode;
                slicedn = obj.nodes;
            })
            if (esp_isArrayExp(node.parsenode.declarations[0].init)) {
                node.parsenode.declarations[0].init.elements = elements
            } 
        }

        /* Outgoing dependency on call nodes?
         * -> nodeify every call (possibly rpcs) */
        else if (call.length > 0) {
            /* 1 call and not transforming? */
            /*if (call.length === 1 && !shouldTransform(call[0])) {
                var c = toNode(cloneSliced(sliced, slicedn, call[0]));
                node.parsenode.declarations[0].init = esp_isExpStm(c.parsednode) ? c.parsednode.expression : c.parsednode;
                sliced.parsednode = node.parsenode;
                sliced.nodes = c.nodes.remove(call[0])
                return sliced;
            }*/
            var cpsvar = transformer.transform.transformExp(node, sliced.nodes, transformer);
            sliced.nodes = cpsvar[0];
            sliced.parsednode = cpsvar[1].parsenode;
            return sliced;
        }
        /* Cloud types */
        /*else if (CTTransform.shouldTransform(node)) {
            if (CTTransform.hasSameType(node)) {
                var ctype  = CTTransform.transformExpression(node);
                if(ctype) {
                    if (sliced.tier === 'client')
                        sliced.parsednode = ctype.setIfEmpty(escodegen.generate(node.parsenode.declarations[0].init));//ctype.declarationS;
                    else 
                        sliced.parsednode = undefined;
                    sliced.cloudtypes[node.name] = ctype;
                    return sliced;
                }
            }
        } else { */
            /* Transform the right hand side expression */
            /*CTTransform.transformExpression(node, sliced.cloudtypes)
        }*/

        sliced.nodes = slicedn;
        sliced.parsednode = node.parsenode;
        return sliced;
    }

    /* Binary Expression */
    var nodeifyBinExp = function (sliced) {
        var node = sliced.node,
            call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                        return e.to.isCallNode
                       });
        if (call.length > 0) {
            var transformer = makeTransformer(sliced.option),
                cpsvar       = CPSTransform.transformExp(node, sliced.nodes, transformer);
            sliced.parsednode = cpsvar[1].parsenode;
            sliced.nodes = cpsvar[0];
            return sliced;
        }
        sliced.parsednode = node.parsenode;
        return sliced
    }

    /* Function expression */
    var nodeifyFunExp = function (sliced) {
        /* Formal parameters */
        var node      = sliced.node,
            form_ins  = node.getFormalIn(),
            form_outs = node.getFormalOut(),
            parsenode = node.parsenode,
            params    = parsenode.params,
            parent    = Ast.parent(parsenode, graphs.AST),
            transformer = makeTransformer(sliced.option);
        /* Formal in parameters */
        if(form_ins.length > 0) {
            /* Remove parameters that are not in slicednodes */
            for(var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!slicedContains(sliced.nodes,fp)) {
                    params.splice(i,1);
                }
                sliced.nodes = sliced.nodes.remove(fp);
            }
            parsenode.params = params;
        };

        /* Formal out parameters */
        form_outs.map(function (f_out) {
            sliced.nodes = sliced.nodes.remove(f_out)
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
            var bodynode = toNode(cloneSliced(sliced, sliced.nodes, n));
            if(slicedContains(sliced.nodes, n)) 
                body = body.concat(bodynode.parsednode);
            sliced.nodes = removeNode(bodynode.nodes, n);
        });
        sliced.nodes = sliced.nodes.remove(node);
        parsenode.body.body = body;

        /* CASE 2 : Server function that is called by client side */
        if(node.isServerNode() && node.clientCalls > 0) {
            var cpsfun = transformer.transform.transformFunction(node, sliced, transformer);    
            sliced.method     = cpsfun[1];
        }

        /* CASE 5 : Client function that is called by server side */ 
        if (node.isClientNode() && node.serverCalls > 0) {
            var func = NodeParse.asyncFun();
            sliced.nodes = sliced.nodes.remove(node);
            func.setBody(body);
            func.addParams(parsenode.params);
            func.addParams({'type' : 'Identifier', 'name' : 'callback'});
            func.setName();
            sliced.parsednode = node.parsenode;
            sliced.method     = func;
        }

        if ((node.isClientNode() && node.serverCalls === 0) || 
            (node.isServerNode() && node.clientCalls === 0) || 
            node.dtype === DNODES.SHARED) {
            sliced.nodes = removeNode(sliced.nodes,node);
            sliced.parsednode  = parsenode;
            sliced.parsednode.body.body = body;
        }

        if (! esp_isVarDeclarator(parent) && sliced.method.setName) {
            sliced.method.setName(node.parsenode.id.name);
            sliced.methods = sliced.methods.concat(sliced.method.parsenode);
            sliced.method = {};

        }
        return sliced;
    }

    var nodeifyFunConstructor = function (sliced) {
      var node        = sliced.node,
          constructor = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isConstructor})[0],
          properties  = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return !n.isConstructor}),
          body        = [],
          form_ins    = constructor.getFormalIn(),
          form_outs   = constructor.getFormalOut(),
          parsenode   = node.parsenode,
          params      = parsenode.params;
        // Formal in parameters
        if(form_ins.length > 0) {
            // Remove parameters that are not in slicednodes
            for (var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!slicedContains(sliced.nodes,fp)) {
                    params.splice(i,1);
                }
                sliced.nodes = sliced.nodes.remove(fp);
            }
            node.parsenode.params = params;
        };
        // Formal out parameters
        form_outs.map(function (f_out) {
            sliced.nodes = sliced.nodes.remove(f_out)
        })

      properties.map(function (property) {
        var propnode;
        if (slicedContains(slicednodes, property)) {
            var propnode = toNode(cloneSliced(sliced, sliced.nodes, property));
            body = body.concat(propnode.parsednode);
            sliced.nodes = removeNode(propnode.nodes, property)
        }
      })
      node.parsenode.body.body = body;
      sliced.nodes = slicednodes.remove(node);
      sliced.nodes = slicednodes.remove(constructor);
      sliced.parsednode = node.parsenode;
      return new sliced;
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
    var nodeifyCallExp = function (sliced) {
        var node        = sliced.node,
            actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),  
            parent      = Ast.parent(node.parsenode,graphs.AST),
            entryNode   = node.getEntryNode()[0],
            transformer = makeTransformer(sliced.option), cpscall;
        actual_ins.map(function (a_in) {
            sliced.nodes = sliced.nodes.remove(a_in)
        });
        actual_outs.map(function (a_out) {
            sliced.nodes = sliced.nodes.remove(a_out)
        });

        if (node.primitive) {
            sliced.parsednode = parent;
            return sliced;
        }

        /* Perform cloud types transformations on arguments */
        //node.parsenode.arguments = CTTransform.transformArguments(node.parsenode.arguments, sliced.cloudtypes);
        if (entryNode.isServerNode()) {
            /* CASE 2 */
            if (node.isClientNode()) {
                cpscall = transformer.transform.transformCall(node, sliced.nodes, transformer , parent);
                sliced.nodes = cpscall[0];
                sliced.parsednode = cpscall[1].parsenode;

                return sliced;
            }
            /* CASE 1 : defined on server, called by server */
            else if(node.isServerNode()) {
                sliced.parsednode = parent;
            }       

            return sliced;
        }
        else if (entryNode.isClientNode()) {
            /* CASE  4 : defined on client, called by client */
            if(node.isClientNode()) {
                cpscall = transformer.transform.transformCall(node, sliced.nodes, transformer, parent);
                sliced.nodes = cpscall[0];
                sliced.parsednode = cpscall[1].parsenode;

                return sliced;
            }
            else {
                /* CASE 5 : defined on client, called by server */
                if (node.arity && arityEquals(node.arity, ARITY.ONE)) {
                    cpscall = transformer.transform.transformReplyCall(node, sliced.nodes, transformer);
                    sliced.parsednode = cpscall[1].parsenode;
                    return sliced;
                }
                cpscall = NodeParse.createBroadcast();
                cpscall.setName('"' + node.name + '"');
                cpscall.addArgs(node.parsenode.arguments);
                sliced.parsednode = cpscall.parsenode;

                return sliced;
            }
        }
        /* Shared function */
        else if (entryNode.isSharedNode()) {
            if (node.parsenode.leadingComment && Comments.isBlockingAnnotated(node.parsenode.leadingComment)) {
                cpscall = transformer.transform.transformCall(node, sliced.nodes, transformer, parent);
                sliced.nodes = cpscall[0];
                sliced.parsednode = cpscall[1].parsenode;
            }
            /* Called by client */
            else if (node.isClientNode() && !esp_isVarDeclarator(parent)) {
                sliced.parsednode = parent;
            }
            /* Called by server */
            else if (node.isServerNode() && !esp_isVarDeclarator(parent)) {
                sliced.parsednode = parent;
            } else {
                sliced.parsednode = node.parsenode;
            }

            return sliced;
        }
    }

    var nodeifyRetStm = function (sliced) {
        var node = sliced.node,
            call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                        return  e.to.isCallNode
                       }),
            object = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to})
                        .filter(function (n) {
                            return n.isObjectEntry
                        });
        if (call.length > 0) {
            var transformer = makeTransformer(sliced.option),
                cpsvar      = CPSTransform.transformExp(node, sliced.nodes, transformer)
            return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
        }
        if (object.length > 0) {
            object.map(function (oe) {
                var formout = oe.getOutEdges(EDGES.DATA)
                                .filter(function (e) {return e.to.isFormalNode});
                var objnode = toNode(cloneSliced(sliced, sliced.nodes, oe));
                node.parsenode.argument = objnode.parsednode;
                sliced.nodes = removeNode(objnode.nodes, oe);
                sliced.nodes.remove(formout);
            })
        }
        sliced.nodes = sliced.nodes.remove(node);
        sliced.parsednode = node.parsenode;
        return sliced;
    }

    var nodeifyIfStm = function (sliced) {
        var node   = sliced.node,
            conseq = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label})
                        .map(function (e) {return e.to}),
            altern = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return !e.label})
                        .map(function (e) {return e.to});

        conseq.map(function (consnode) {
            var toSlice = cloneSliced(sliced, sliced.nodes, consnode);
            var jsnode = toNode(toSlice);
            sliced.nodes = removeNode(jsnode.nodes, consnode);
            node.parsenode.consequent = jsnode.parsednode;
        })

        altern.map(function (altnode) {
            var toSlice = cloneSliced(sliced, sliced.nodes, altnode);
            var jsnode = toNode(toSlice);
            sliced.nodes = removeNode(jsnode.nodes, altnode);
            node.parsenode.alternate = jsnode.parsednode;
        })
        sliced.nodes = sliced.nodes.remove(node);

        return new Sliced(sliced.nodes, node, node.parsenode); 
    }



    var nodeifyTryStm = function (sliced) {
        var block      = [],
            node       = sliced.node,
            blocknodes = node.getOutEdges(EDGES.CONTROL)
                             .map(function (e) {return e.to}),
            /* Nodes that are calls are have calls in them */
            callnodes  = blocknodes.filter(function (n) { return esp_hasCallStm(n.parsenode)}),
            /* Get the actual calls */
            calls      = callnodes.flatMap(function (cn) { 
                            if (cn.isCallNode) 
                                return [cn];
                            else return cn.findCallNodes();  }),
            catches    = calls.flatMap(function (call) {
                            return call.getOutEdges(EDGES.CONTROL)
                                      .map(function (e) {return e.to})
                                      .filter(function (n) {
                                         return ! n.isExitNode && 
                                           n.parsenode && 
                                           esp_isCatchStm(n.parsenode)})
                        }),
            handler;

        blocknodes.map(function (node) {
            if (slicedContains(sliced.nodes, node)) {
                var toSlice = cloneSliced(sliced, sliced.nodes, node);
                var blocknode = toNode(toSlice);
                sliced.nodes = removeNode(blocknode.nodes, node);
                block.push(blocknode.parsednode);
            }
        });

        catches.map(function (node) {
            if (slicedContains(sliced.nodes, node)) {
                var toSlice = cloneSliced(sliced, sliced.nodes, node);
                var catchnode = toNode(toSlice);
                handler = catchnode.parsednode;
                sliced.nodes = removeNode(catchnode.nodes, node);
            }
        })


        node.parsenode.handler = handler;
        node.parsenode.block.body = block;
        sliced.nodes = sliced.nodes.remove(node);

        return new Sliced(sliced.nodes, node, node.parsenode);
    }

    var nodeifyCatchStm = function (sliced) {
        var node      = sliced.node,
            bodynodes = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {
                            return e.to
                        }).filter( function (n) {
                            return  !n.isActualPNode
                        }),
            body      = [];

        bodynodes.map(function (n) {
            var toSlice = cloneSliced(sliced, sliced.nodes, n);
            var bodynode = toNode(toSlice);
            if( slicedContains(sliced.nodes, n) ) {
                    body.push(bodynode.parsednode)
            }
            sliced.nodes = removeNode(bodynode.nodes,n);    
            sliced.methods = bodynode.methods;
        })

        sliced.nodes = sliced.nodes.remove(node);
        node.parsenode.body.body = body;

        return new Sliced(sliced.nodes, node, node.parsenode)
    }


    var nodeifyThrowStm = function (sliced) {
        var node    = sliced.node,
            excexit = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isExitNode});
        excexit.map(function (node) {
            var toSlice = cloneSliced(sliced, sliced.nodes, node);
            var exitnode = toNode(toSlice);
            node.parsenode.argument = exitnode.parsednode;
            sliced.nodes = removeNode(exitnode.nodes,node);    
            sliced.methods = exitnode.methods;
        }) 
        sliced.nodes = sliced.nodes.remove(node);

        return new Sliced(sliced.nodes, node, node.parsenode);
    }


    /* Currently same primitive implementations as meteor */
    var nodeifyPrimitive = function (sliced, actual_ins) {
        var node        = sliced.node,
            name        = node.name,
            parsenode   = node.parsenode,
            parent      = Ast.parent(node.parsenode,graphs.AST)

        switch (name) {
            case 'print':
                parent.expression = parsenode;
                sliced.parsednode = parent;
                if(!setUpContains(sliced, 'print'))
                    sliced.setup = sliced.setup.concat(meteor_printP());
            case 'read':
                parent.expression = parsenode;
                if(!setUpContains(sliced,'read'))
                sliced.setup = sliced.setup.concat(meteor_readP());
            case 'installL':
                    parent.expression = parsenode;
                    sliced.parsednode = parent;
                    if(!setUpContains(sliced,'installL'))
                        sliced.setup = sliced.setup.concat(meteor_installLP());

            return sliced;
        }
    }

    /* Block statement */
    var nodeifyBlockStm = function (sliced) {
        var body        = [],
            node        = sliced.node,
            parsenode   = node.parsenode,
            bodynodes   = node.edges_out.filter(function (e) {
              return e.equalsType(EDGES.CONTROL)
                }).map(function (e) { return e.to });
        /* nodeify every body node */
        bodynodes.map(function (n) {
            var toSlice = cloneSliced(sliced, sliced.nodes, n);
            var bodynode = toNode(toSlice);
            if( slicedContains(sliced.nodes, n) && bodynode.parsednode) {
                    body = body.concat(bodynode.parsednode)
            }
            sliced.nodes = removeNode(bodynode.nodes,n);    
            sliced.methods = bodynode.methods;
            });
        sliced.nodes = sliced.nodes.remove(node);
        parsenode.body = body;
        sliced.parsednode = parsenode;

        return sliced;
    }


    var nodeifyObjExpression = function (sliced) {
        var node = sliced.node,
            prop = node.getOutEdges(EDGES.OBJMEMBER)
                       .map(function (e) {
                            return e.to
                        }),
            properties = [],
            parsenode  = node.parsenode;

        prop.map(function (property) {
            //if (slicedContains(sliced.nodes, property)) {
                var propnode = toNode(cloneSliced(sliced, sliced.nodes, property));
                properties = properties.concat(propnode.parsednode);
                slicednodes = removeNode(propnode.nodes, property)
            //}
        });

        sliced.nodes = sliced.nodes.remove(node);
        parsenode.properties = properties;
        sliced.parsednode = parsenode;
        return sliced;
    }

    var nodeifyNewExpression = function (sliced) {
        var node      = sliced.node,
            call      = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isCallNode})[0],
            parsenode = node.parsenode,
            a_ins     = call.getActualIn(),
            a_outs    = call.getActualOut();
        
        sliced.nodes = removeNode(sliced.nodes, call);
        a_outs.map(function (a_out) {
            if (slicedContains(sliced.nodes, a_out)) 
              sliced.nodes = removeNode(sliced.nodes, a_out)
        });
        parsenode.arguments = a_ins.filter(function (a_in) {
            return slicedContains(sliced.nodes, a_in)    
        }).map(function (a_in) {return a_in.parsenode});

        sliced.nodes = sliced.nodes.remove(node);
        sliced.parsednode = parsenode;

        return sliced;
    }

    var nodeifyProperty = function (sliced) {
        var node    = sliced.node,
            entries = node.getOutEdges(EDGES.DATA)
                          .map( function (e) {return e.to})
                          .filter( function (n) { return n.isEntryNode}),
            calls   = node.getOutEdges(EDGES.CONTROL)
                          .map( function (e) { return e.to})
                          .filter( function (n) { return n.isCallNode});

        entries.map(function (entry) {
            var entrynode = toNode(cloneSliced(sliced, sliced.nodes, entry));
            node.parsenode.value = entrynode.parsednode;
            sliced.nodes = removeNode(entrynode.nodes, entry)
        });
        calls.map(function (call) {
            var callnode   = toNode(cloneSliced(sliced, sliced.nodes, entry));
            sliced.nodes = removeNode (callnode.nodes, entry);
        })

        sliced.nodes = sliced.nodes.remove(node);
        sliced.parsednode = node.parsenode;
        return sliced;
    }


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

    var removeNode = function (nodes,node) {
        var callnode = false;
        nodes = nodes.remove(node);
        nodes.map(function (n) {
            if(n.parsenode) {
            var parent = Ast.parent(n.parsenode,graphs.AST);
            if( n.isCallNode && 
               (n.parsenode === node.parsenode || parent === node.parsenode)) {
                callnode = n
            }
        }
        });
        return nodes;
    }

    var slicedContains = function (nodes, node) {
        return nodes.filter(function (n) {
            if(n.isCallNode) {
                return n.parsenode === node.parsenode
            } else
            return n.id === node.id
        }).length > 0
    }

    /* Main function */
    var toNode = function (sliced) {
        var node = sliced.node, 
            parent;
        if(node.isActualPNode || node.isFormalNode || node.isExitNode || !node.parsenode) {
            sliced.parsednode = false;
            return sliced;
        }
        
        parent = Ast.parent(node.parsenode, graphs.AST);
        
        if(parent && esp_isExpStm(parent) && 
            !(esp_isCallExp(node.parsenode)) &&
            !(esp_isAssignmentExp(node.parsenode))) {
            node.parsenode = parent
        }
        if (esp_isExpStm(node.parsenode) && esp_isCallExp(node.parsenode.expression)) {
            node.parsenode = node.parsenode.expression
        }
        console.log("NODE("+node.parsenode.type+") " + node.parsenode);
        switch (node.parsenode.type) {
          case 'VariableDeclarator': 
            return nodeifyVarDecl(sliced);
          case 'VariableDeclaration':
            return nodeifyVarDecl(sliced);
          case 'FunctionExpression':
            return nodeifyFunExp(sliced);
          case 'FunctionDeclaration':
            return nodeifyFunExp(sliced);
          case 'BlockStatement':
            return nodeifyBlockStm(sliced);
          case 'CallExpression':
            return nodeifyCallExp(sliced);
          case 'IfStatement':
            return nodeifyIfStm(sliced);
          case 'ThrowStatement' :
            return nodeifyThrowStm(sliced);
          case 'TryStatement' :
            return nodeifyTryStm(sliced);
          case 'CatchClause' :
            return nodeifyCatchStm(sliced);
          case 'ObjectExpression' :
            return nodeifyObjExpression(sliced);
          case 'Property' :
            return nodeifyProperty(sliced);
          case 'NewExpression' :
            return nodeifyNewExpression(sliced);
          default: 
            if (esp_isRetStm(node.parsenode)// && 
                    /*node.getOutEdges(EDGES.CONTROL).filter(function (e) {
                            return e.to.isCallNode
                        }).length > 0)*/)
                return nodeifyRetStm(sliced)
            if(esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
                return nodeifyVarDecl(sliced)
            if(esp_isExpStm(node.parsenode) && esp_isBinExp(node.parsenode.expression))
                return nodeifyBinExp(sliced)
            //if (esp_isExpStm(node.parsenode) && esp_isCallExp(node.parsenode.expression)) {
             //   sliced.node.parsenode = node.parsenode.expression;
              //  return nodeifyCallExp(sliced);
           // }
            //CTTransform.transformExpression(node, sliced.cloudtypes)
            sliced.parsednode = node.parsenode;
            return sliced;
          
        }
    }

    var nodeify = function (slicednodes, node, option) {
        var sliced = new Sliced(slicednodes, node);
        sliced.option = option;
        return toNode(sliced)
    }

    var nodePrimitives = function () {
        return [meteor_readP(), meteor_printP(), meteor_installLP(), meteor_broadcastP(), meteor_subscribeP()];
    }

    module.transpile = nodeify

    return module


})()