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


    var makeShouldTransform = function (cps) {
        return function (call) {
                if (call.name === 'createServer')
                    return false;
                return cps
            }
        },

        makeTransformer = function (cps) {
        return {  AST        : graphs.AST, 
                  transformF : toJavaScript,
                  callbackF  : JSParse.callback, 
                  asyncCallF : JSParse.RPC, 
                  asyncFuncF : JSParse.asyncFun,
                  shouldTransform : makeShouldTransform(cps) ,
                  option     : cps
                }
        },
        module = {};

    /* Variable declaration  + Assignment Expression */
    var sliceVarDecl = function (slicednodes, node, cps) {
        var entry = node.getOutEdges(EDGES.DATA)
                        .filter(function (e) {
                            return e.to.isEntryNode;
                        })
                        .map(function (e) { return e.to }),
            call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                            return e.to.isCallNode;
                       })
                       .map(function (e) { return e.to }),
            object = node.getOutEdges(EDGES.DATA)
                        .filter(function (e) {
                             return e.to.isObjectEntry;
                        })
                        .map(function (e) {return e.to});
        if (esp_isVarDeclarator(node.parsenode))
             node.parsenode = JSParse.createVarDecl(node.parsenode);
        /* Outgoing data dependency to entry node? */
        if (entry.length > 0) {
            var f = toJavaScript(slicednodes, entry[0], cps);
            if (esp_isVarDecl(node.parsenode))
                 node.parsenode.declarations[0].init = f.parsednode;
            else if (esp_isExpStm(node.parsenode) && 
                     esp_isAssignmentExp(node.parsenode.expression))
                node.parsenode.right = f.parsednode; 
            slicednodes = f.nodes;
        }
        /* Outgoing data dependency to object entry node? */
        if (object.length > 0) {
            var obj = toJavaScript(slicednodes, object[0], cps);
            if (esp_isVarDecl(node.parsenode))
                node.parsenode.declarations[0].init = obj.parsednode;
            else if (esp_isExpStm(node.parsenode) && 
                esp_isAssignmentExp(node.parsenode.expression))
                node.parsenode.right = obj.parsednode; 
            slicednodes = obj.nodes;
        }
        /* Has call nodes in value? */
        if (call.length > 0) {
            var transformer = makeTransformer(cps),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer);
            if (cpsvar[1])
                return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
            else 
                return new Sliced(slicednodes, node, node.parsenode)
        }
        return new Sliced(slicednodes, node, node.parsenode);
    }


    /* Binary expression */
    var sliceBinExp = function (slicednodes, node, cps) {
        var call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                        return e.to.isCallNode
                    });
        if (call.length > 0) {
            var transformer = makeTransformer(cps),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer)
                return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
        }
        return new Sliced(slicednodes, node, node.parsenode)
    }

    /* Function Expression */
    var sliceFunExp = function (slicednodes, node, cps) {
        var parent    = Ast.parent(parsenode, graphs.AST);
        if (node.isObjectEntry) {
            return sliceFunConstructor(slicednodes, node, cps)
        }
        else {// Body
             // Formal parameters
             var form_ins  = node.getFormalIn(),
                 form_outs = node.getFormalOut(),
                 parsenode = node.parsenode,
                 params    = parsenode.params;
            // Formal in parameters
            if(form_ins.length > 0) {
                // Remove parameters that are not in slicednodes
                for(var i = 0; i < form_ins.length; i++) {
                    var fp = form_ins[i],
                         p = params[i];
                    if(!slicedContains(slicednodes,fp)) {
                        params.splice(i,1);
                    }
                    slicednodes = slicednodes.remove(fp);
                }
                parsenode.params = params;
            };
            // Formal out parameters
            form_outs.map(function (f_out) {
                slicednodes = slicednodes.remove(f_out)
            })
            var body = [],
                bodynodes = node.getOutEdges(EDGES.CONTROL)
                                .filter(function (e) {
                                  return e.to.isStatementNode || e.to.isCallNode;
                                })
                                .map(function (e) { return e.to });
            bodynodes.map(function (n) {
                var bodynode = toJavaScript(slicednodes, n, cps);
                if(slicedContains(slicednodes, n)) {
                    body = body.concat(bodynode.parsednode);
                }
                slicednodes = removeNode(bodynode.nodes,n);
                
                });
            slicednodes = slicednodes.remove(node);
            parsenode.body.body = body;
            if (cps && !(parsenode.id && parsenode.id.name.startsWith('anonf'))) {
                var transformer = makeTransformer(cps),
                    cpsfun      = CPSTransform.transformFunction(node, slicednodes, transformer);
                if (esp_isFunDecl(parsenode) && cpsfun[1].setName) {
                    cpsfun[1].setName(parsenode.id.name);
                }
                return new Sliced(cpsfun[0], node, JSParse.createFunDecl(cpsfun[1].parsenode))
            }
            return new Sliced(slicednodes, node, parsenode);
        }
    }

    var sliceFunConstructor = function (slicednodes, node, cps) {
      var constructor = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isConstructor})[0],
          properties  = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return !n.isConstructor}),
          body        = [],
          form_ins  = constructor.getFormalIn(),
          form_outs = constructor.getFormalOut(),
          parsenode = node.parsenode,
          params    = parsenode.params;
        // Formal in parameters
        if(form_ins.length > 0) {
            // Remove parameters that are not in slicednodes
            for (var i = 0; i < form_ins.length; i++) {
                var fp = form_ins[i],
                     p = params[i];
                if(!slicedContains(slicednodes,fp)) {
                    params.splice(i,1);
                }
                slicednodes = slicednodes.remove(fp);
            }
            node.parsenode.params = params;
        };
        // Formal out parameters
        form_outs.map(function (f_out) {
            slicednodes = slicednodes.remove(f_out)
        })

      properties.map(function (property) {
        var propnode;
        if (slicedContains(slicednodes, property)) {
            var propnode = toJavaScript(slicednodes, property, cps);
            body = body.concat(propnode.parsednode);
            slicednodes = removeNode(propnode.nodes, property)
        }
      })
      node.parsenode.body.body = body;
      slicednodes = slicednodes.remove(node);
      slicednodes = slicednodes.remove(constructor);
      return new Sliced(slicednodes, node, node.parsenode);
    }

    var sliceCallExp = function (slicednodes, node, cps) {
        var actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),  
            parent      = Ast.parent(node.parsenode,graphs.AST);
        actual_ins.map(function (a_in) {
            slicednodes = slicednodes.remove(a_in)
        })
        actual_outs.map(function (a_out) {
            slicednodes = slicednodes.remove(a_out)
        })
        if (cps) {
            var transformer = makeTransformer(cps),
                cpscall     = CPSTransform.transformCall(node, slicednodes, transformer);
            return new Sliced(cpscall[0], node, cpscall[1].parsenode)
        }
        return new Sliced(slicednodes, node, parent)
    }

    var sliceRetStm = function (slicednodes, node, cps) {
        var call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                        return  e.to.isCallNode
                       }),
            object = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to})
                        .filter(function (n) {
                            return n.isObjectEntry
                        });
        if (call.length > 0) {
            var transformer = makeTransformer(cps),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer)
            return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
        }
        if (object.length > 0) {
            object.map(function (oe) {
                var formout = oe.getOutEdges(EDGES.DATA)
                                .filter(function (e) {return e.to.isFormalNode});
                var objnode = toJavaScript(slicednodes, oe, cps);
                node.parsenode.argument = objnode.parsednode;
                slicednodes = removeNode(objnode.nodes, oe);
                slicednodes.remove(formout);
            })
        }
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, node.parsenode)
    }

    var sliceBlockStm = function (slicednodes, node, cps) {
        var body = [],
            parsenode = node.parsenode,
            bodynodes = node.getOutEdges(EDGES.CONTROL)
                            .map(function (e) {return e.to});
        bodynodes.map(function (n) {
            var bodynode = toJavaScript(slicednodes, n, cps);
            if (slicedContains(slicednodes, n)) {
                    body = body.concat(bodynode.parsednode)
            }
            slicednodes = removeNode(bodynode.nodes, n);    
        });
        slicednodes = slicednodes.remove(node);
        parsenode.body = body;
        return new Sliced(slicednodes, node, parsenode);
    }


    var sliceIfStm = function (slicednodes, node, cps) {
        var conseq = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label})
                        .map(function (e) {return e.to}),
            altern = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return !e.label})
                        .map(function (e) {return e.to});
        conseq.map(function (consnode) {
            var jsnode = toJavaScript(slicednodes, consnode, cps);
            slicednodes = removeNode(jsnode.nodes, consnode);
            node.parsenode.consequent = jsnode.parsednode;
        })
        altern.map(function (altnode) {
            var jsnode = toJavaScript(slicednodes, altnode, cps);
            slicednodes = removeNode(jsnode.nodes, altnode);
            node.parsenode.alternate = jsnode.parsednode;
        })
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, node.parsenode);
    }

    var sliceObjExp = function (slicednodes, node, cps) {
        var prop = node.getOutEdges(EDGES.OBJMEMBER)
                       .map(function (e) {
                            return e.to
                        }),
            properties = [],
            parsenode  = node.parsenode;
        prop.map(function (property) {
            if (slicedContains(slicednodes, property)) {
                var propnode = toJavaScript(slicednodes, property, cps);
                properties = properties.concat(propnode.parsednode);
                slicednodes = removeNode(propnode.nodes, property)
            }
        });
        slicednodes = slicednodes.remove(node);
        parsenode.properties = properties;
        return new Sliced(slicednodes, node, parsenode);
    }


    var sliceNewExpression = function (slicednodes, node, cps) {
        var call   = node.getOutEdges(EDGES.OBJMEMBER)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isCallNode})[0],
            parsenode = node.parsenode,
            a_ins     = call.getActualIn(),
            a_outs    = call.getActualOut();
        
        slicednodes = removeNode(slicednodes, call);
        a_outs.map(function (a_out) {
            if (slicedContains(slicednodes, a_out)) 
              slicednodes = removeNode(slicednodes, a_out)
        })
        parsenode.arguments = a_ins.filter(function (a_in) {
            return slicedContains(slicednodes, a_in)    
        }).map(function (a_in) {return a_in.parsenode});
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, parsenode);
    }

    var sliceProperty = function (slicednodes, node, cps) {
        var entries = node.getOutEdges(EDGES.DATA)
                          .map( function (e) {return e.to})
                          .filter( function (n) { return n.isEntryNode}),
            calls   = node.getOutEdges(EDGES.CONTROL)
                          .map( function (e) { return e.to})
                          .filter( function (n) { return n.isCallNode});
        entries.map(function (entry) {
            var entrynode = toJavaScript(slicednodes, entry, cps);
            node.parsenode.value = entrynode.parsednode;
            slicednodes = removeNode(entrynode.nodes, entry)
        });
        calls.map(function (call) {
            var callnode   = toJavaScript(slicednodes, entry, cps);
            slicednodes = removeNode (callnode.nodes, entry);
        })
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, node.parsenode);
    }


    var sliceTryStm = function (slicednodes, node, cps) {
        var block      = [],
            handlers   = [],
            blocknodes = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to});
            calls      = blocknodes.filter(function (n) { return n.isCallNode}),
            catches    = calls.flatMap(function (call) {
                         return call.getOutEdges(EDGES.CONTROL)
                            .map(function (e) {return e.to})
                            .filter(function (n) {
                                return ! n.isExitNode && 
                                  n.parsenode && 
                                  esp_isCatchStm(n.parsenode)});
                        });
        blocknodes.map(function (blocknode) {
            var jsnode = toJavaScript(slicednodes, blocknode, cps);
            slicednodes = removeNode(jsnode.nodes, blocknode);
            block.push(jsnode.parsednode);
        });
        catches.map(function (catchnode) {
            var jsnode = toJavaScript(slicednodes, catchnode, cps);
            slicednodes = removeNode(jsnode.nodes, catchnode);
        })

        node.parsenode.block.body = block;
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, node.parsenode);
    }

    var sliceThrowStm = function (slicednodes, node, cps) {
        var excexit = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isExitNode});
        excexit.map(function (exitnode) {
            var jsnode = toJavaScript(slicednodes, exitnode, cps);
            slicednodes = removeNode(jsnode.nodes, exitnode);
            node.argument = jsnode.parsenode;
        })
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, node.parsenode);
    }

    var removeNode = function (nodes, node, cps) {
        var callnode = false;
        nodes = nodes.remove(node);
        /*nodes.map(function (n) {
            if(n.parsenode) {
            var parent = Ast.parent(n.parsenode,graphs.AST);
            if(n.isCallNode && (n.parsenode === node.parsenode || parent === node.parsenode)) {
                callnode = n
            }
        }
        });
        if(callnode) 
            return nodes.remove(callnode);
        else*/
            return nodes;
    }

    var slicedContains = function (nodes, node, cps) {
        return nodes.filter(function (n) {
            if(n.isCallNode) {
                return n.parsenode === node.parsenode
            } else
            return n.id === node.id
        }).length > 0
    }


    // Non distributed version.
    var toJavaScript = function (slicednodes, node, cps) {
        if(node.isActualPNode || node.isFormalNode || node.isExitNode || !node.parsenode) {
            return new Sliced(slicednodes, node, false);
        }
        var parent = Ast.parent(node.parsenode,graphs.AST);
        /*if(parent && esp_isRetStm(parent) && !node.isObjectEntry) {
            node.parsenode = parent
        } */
        if(parent && esp_isExpStm(parent) && !(esp_isCallExp(node.parsenode))) {
            node.parsenode = parent
        }
        if (esp_isExpStm(node.parsenode) && esp_isCallExp(node.parsenode.expression)) {
            node.parsenode = node.parsenode.expression
        }
        console.log('SLICE(' + node.parsenode.type + ') ' + node.parsenode);
        switch (node.parsenode.type) {
            case 'VariableDeclaration': 
                return sliceVarDecl(slicednodes, node, cps);
            case 'VariableDeclarator':
                return sliceVarDecl(slicednodes, node, cps);
            case 'FunctionExpression':
                return sliceFunExp(slicednodes, node, cps);
            case 'FunctionDeclaration':
                return sliceFunExp(slicednodes, node, cps);
            case 'BlockStatement':
                return sliceBlockStm(slicednodes, node, cps);
            case 'CallExpression':
                return sliceCallExp(slicednodes, node, cps);
            case 'BinaryExpression':
                return sliceBinExp(slicednodes, node, cps);
            case 'IfStatement':
                return sliceIfStm(slicednodes, node, cps);
            case 'ObjectExpression':
                return sliceObjExp(slicednodes, node, cps);
            case 'Property':
                return sliceProperty(slicednodes, node, cps);
            case 'NewExpression' :
                return sliceNewExpression(slicednodes, node, cps);
            case 'ThrowStatement' :
                return sliceThrowStm(slicednodes, node, cps);
            case 'TryStatement' :
                return sliceTryStm(slicednodes, node, cps);

            default: 
                if (esp_isRetStm(node.parsenode)// && 
                    /*node.getOutEdges(EDGES.CONTROL).filter(function (e) {
                            return e.to.isCallNode
                        }).length > 0)*/)
                    return sliceRetStm(slicednodes, node, cps)
                if (esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
                    return sliceVarDecl(slicednodes, node, cps)
                if (esp_isExpStm(node.parsenode) && esp_isBinExp(node.parsenode.expression))
                    return sliceBinExp(slicednodes, node, cps)
                return new Sliced(slicednodes, node, node.parsenode);
        }
    }

    module.transpile = toJavaScript;

    return module;
})();