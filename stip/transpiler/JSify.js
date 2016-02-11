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
            var parsenode = Aux.isExpStm(call.parsenode) ? call.parsenode.expression : call.parsenode;
            if (cps)
                if (call.primitive) {
                    return false;
                } 
                else if (Aux.isMemberExpression(parsenode.callee) &&
                    asyncs.indexOf(parsenode.callee.object.name) >= 0) 
                        return true;
                else
                    return cps;

            else
                return false;
            }
        },

        makeTransformer = function (cps, ast) {
        return {  AST        : ast, 
                  transformF : toJavaScript,
                  callbackF  : JSParse.callback, 
                  asyncCallF : function (call) { return JSParse.RPC}, 
                  asyncFuncF : JSParse.asyncFun,
                  parseF     : JSParse,
                  shouldTransform : makeShouldTransform(cps) ,
                  option     : cps
                }
        },
        toreturn = {};

    /* Variable declaration  + Assignment Expression */
    var sliceVarDecl = function (slicednodes, node, cps, ast) {
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
        if (Aux.isVarDeclarator(node.parsenode))
             node.parsenode = JSParse.createVarDecl(node.parsenode);
        /* Outgoing data dependency to entry node? */
        if (entry.length > 0) {
            var f = toJavaScript(slicednodes, entry[0], cps, ast);
            slicednodes = f.nodes;
            slicednodes = slicednodes.remove(entry[0]);
            
            if (Aux.isVarDecl(node.parsenode))
                 if (Aux.isFunDecl(f.parsednode)) {
                    f.parsednode.id = node.parsenode.declarations[0].id;
                    f.nodes = f.nodes.remove(entry[0]);
                    
                    return new Sliced(slicednodes, node, ast, f.parsednode);
                 }
                 else {
                    node.parsenode.declarations[0].init = f.parsednode;
                }
            else if (Aux.isExpStm(node.parsenode) && 
                     Aux.isAssignmentExp(node.parsenode.expression)) {

                        if (Aux.isFunDecl(f.parsednode)) {
                            f.parsednode.id = node.parsenode.expression.left;

                            return new Sliced(slicednodes, node,ast, f.parsednode);
                        }        
                        node.parsenode.expression.right = f.parsednode; 

            }

                

        }
        /* Outgoing data dependency to object entry node? */
        if (object.length > 0 && call.length <= 0) {
            var obj = toJavaScript(slicednodes, object[0], cps, ast);
            
            if (Aux.isVarDecl(node.parsenode))
                node.parsenode.declarations[0].init = obj.parsednode;
            else if (Aux.isExpStm(node.parsenode) && 
                Aux.isAssignmentExp(node.parsenode.expression))
                node.parsenode.right = obj.parsednode; 
            slicednodes = obj.nodes;
        }
        /* Has call nodes in value? */
        if (call.length > 0) {
            var transformer = makeTransformer(cps, ast),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer);
            if (cpsvar[1])
                return new Sliced(cpsvar[0], node, ast,cpsvar[1].parsenode)
            else 
                return new Sliced(slicednodes, node, ast,node.parsenode)
        }
        return new Sliced(slicednodes, node, ast, node.parsenode);
    }


    /* Binary expression */
    var sliceBinExp = function (slicednodes, node, cps, ast) {
        var call = node.getOutEdges(EDGES.CONTROL)
                       .filter(function (e) {
                        return e.to.isCallNode
                    });
        if (call.length > 0) {
            var transformer = makeTransformer(cps, ast),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer)
                return new Sliced(cpsvar[0], node, ast, cpsvar[1].parsenode)
        }
        return new Sliced(slicednodes, node, ast, node.parsenode)
    }

    /* Function Expression */
    var sliceFunExp = function (slicednodes, node, cps, ast) {
        var parent    = Ast.parent(node.parsenode, ast);
        if (node.isObjectEntry) 
            return sliceFunConstructor(slicednodes, node, cps, ast);
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
                slicednodes = slicednodes.remove(f_out);
            });
            var body = [],
                bodynodes = node.getOutEdges(EDGES.CONTROL)
                                .filter(function (e) {
                                  return !e.to.isFormalNode 
                                })
                                .map(function (e) { return e.to });
            bodynodes.map(function (n) {
                var bodynode = toJavaScript(slicednodes, n, cps, ast);
                if(slicedContains(slicednodes, n)) {
                    body = body.concat(bodynode.parsednode);
                }
                slicednodes = removeNode(bodynode.nodes,n);
                });

            parsenode.body.body = body;
            if (cps && !(parsenode.id && parsenode.id.name.startsWith('anonf'))) {
                var transformer = makeTransformer(cps, ast),
                    cpsfun      = CPSTransform.transformFunction(node, slicednodes, transformer);

                if (Aux.isFunDecl(parsenode) && cpsfun[1].setName)
                    cpsfun[1].setName(parsenode.id.name);

                else if (Aux.isProperty(parent)) {
                    return new Sliced(cpsfun[0], node, ast, cpsfun[1].parsenode);
                }

                return new Sliced(cpsfun[0], node, ast, JSParse.createFunDecl(cpsfun[1].parsenode));
            }

            return new Sliced(slicednodes, node,ast,  parsenode);
        }
    }

    var sliceFunConstructor = function (slicednodes, node, cps, ast) {
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
            var propnode = toJavaScript(slicednodes, property, cps, ast);
            body = body.concat(propnode.parsednode);
            slicednodes = removeNode(propnode.nodes, property)
        }
      })
      node.parsenode.body.body = body;
      slicednodes = slicednodes.remove(node);
      slicednodes = slicednodes.remove(constructor);
      
      return new Sliced(slicednodes, node, ast, node.parsenode);
    }

    var sliceCallExp = function (slicednodes, node, cps, ast) {
        var actual_ins  = node.getActualIn(),
            actual_outs = node.getActualOut(),  
            parent      = Ast.parent(node.parsenode, ast);
        actual_ins.map(function (a_in) {
            slicednodes = slicednodes.remove(a_in);
        })
        actual_outs.map(function (a_out) {
            slicednodes = slicednodes.remove(a_out);
        })
        if (cps) {
            var transformer = makeTransformer(cps, ast),
                parsenode   = node.parsenode,
                cpscall     = CPSTransform.transformCall(node, slicednodes, transformer, false, parent);   
            
            if (transformer.shouldTransform(node) && 
                Aux.isMemberExpression(parsenode.callee)) {
                node.parsenode.arguments = cpscall[1].getArguments();
                
                return new Sliced(cpscall[0], node, ast,parent);
            }
           
            else
                
                return new Sliced(cpscall[0], node, ast,cpscall[1].parsenode)
        }
        
        return new Sliced(slicednodes, node,ast, parent)
    }

    var sliceRetStm = function (slicednodes, node, cps, ast) {
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
            var transformer = makeTransformer(cps, ast),
                cpsvar      = CPSTransform.transformExp(node, slicednodes, transformer)
            
            return new Sliced(cpsvar[0], node, ast, cpsvar[1].parsenode)
        }
        
        if (object.length > 0) {
            object.map(function (oe) {
                var formout = oe.getOutEdges(EDGES.DATA)
                                .filter(function (e) {return e.to.isFormalNode});
                var objnode = toJavaScript(slicednodes, oe, cps, ast);
                node.parsenode.argument = objnode.parsednode;
                slicednodes = removeNode(objnode.nodes, oe);
                slicednodes.remove(formout);
            })
        }
        slicednodes = slicednodes.remove(node);
        
        return new Sliced(slicednodes, node, ast,node.parsenode)
    }

    var sliceBlockStm = function (slicednodes, node, cps, ast) {
        var body = [],
            parsenode = node.parsenode,
            bodynodes = node.getOutEdges(EDGES.CONTROL)
                            .map(function (e) {return e.to});
        bodynodes.map(function (n) {
            var bodynode = toJavaScript(slicednodes, n, cps, ast);
            
            if (slicedContains(slicednodes, n)) {
                    body = body.concat(bodynode.parsednode)
            }
            slicednodes = removeNode(bodynode.nodes, n);    
        });
        slicednodes = slicednodes.remove(node);
        parsenode.body = body;
        
        return new Sliced(slicednodes, node, ast, parsenode);
    }


    var sliceIfStm = function (slicednodes, node, cps, ast) {
        var conseq = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === true }) // explicit check necessary
                        .map(function (e) {return e.to}),
            altern = node.getOutEdges(EDGES.CONTROL)
                        .filter(function (e) {return e.label === false})  // explicit check necessary
                        .map(function (e) {return e.to});
        conseq.map(function (consnode) {
            var jsnode = toJavaScript(slicednodes, consnode, cps, ast);
            slicednodes = removeNode(jsnode.nodes, consnode);
            node.parsenode.consequent = jsnode.parsednode;
        })
        altern.map(function (altnode) {
            var jsnode = toJavaScript(slicednodes, altnode, cps, ast);
            slicednodes = removeNode(jsnode.nodes, altnode);
            node.parsenode.alternate = jsnode.parsednode;
        })
        slicednodes = slicednodes.remove(node);
        
        return new Sliced(slicednodes, node, ast,node.parsenode);
    }

    var sliceObjExp = function (slicednodes, node, cps, ast) {
        var prop = node.getOutEdges(EDGES.OBJMEMBER)
                       .map(function (e) {
                            return e.to
                        }),
            properties = [],
            parsenode  = node.parsenode;
        prop.map(function (property) {
            if (slicedContains(slicednodes, property)) {
                var propnode = toJavaScript(slicednodes, property, cps, ast);
                properties = properties.concat(propnode.parsednode);
                slicednodes = removeNode(propnode.nodes, property)
            }
        });
        slicednodes = slicednodes.remove(node);
        parsenode.properties = properties;
        
        return new Sliced(slicednodes, node, ast, parsenode);
    }


    var sliceNewExpression = function (slicednodes, node, cps, ast) {
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
        
        return new Sliced(slicednodes, node, ast, parsenode);
    }

    var sliceProperty = function (slicednodes, node, cps, ast) {
        var entries = node.getOutEdges(EDGES.DATA)
                          .map( function (e) {return e.to})
                          .filter( function (n) { return n.isEntryNode}),
            calls   = node.getOutEdges(EDGES.CONTROL)
                          .map( function (e) { return e.to})
                          .filter( function (n) { return n.isCallNode});
        entries.map(function (entry) {
            var entrynode = toJavaScript(slicednodes, entry, cps, ast);
            node.parsenode.value = entrynode.parsednode;
            slicednodes = removeNode(entrynode.nodes, entry)
        });
        calls.map(function (call) {
            var callnode   = toJavaScript(slicednodes, entry, cps, ast);
            slicednodes = removeNode (callnode.nodes, entry);
        })
        slicednodes = slicednodes.remove(node);
        
        return new Sliced(slicednodes, node, ast,node.parsenode);
    }


    var sliceTryStm = function (slicednodes, node, cps, ast) {
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
                                  Aux.isCatchStm(n.parsenode)});
                        });
        blocknodes.map(function (blocknode) {
            var jsnode = toJavaScript(slicednodes, blocknode, cps, ast);
            slicednodes = removeNode(jsnode.nodes, blocknode);
            block.push(jsnode.parsednode);
        });
        catches.map(function (catchnode) {
            var jsnode = toJavaScript(slicednodes, catchnode, cps, ast);
            slicednodes = removeNode(jsnode.nodes, catchnode);
        })

        node.parsenode.block.body = block;
        slicednodes = slicednodes.remove(node);
        
        return new Sliced(slicednodes, node, ast, node.parsenode);
    }

    var sliceThrowStm = function (slicednodes, node, cps, ast) {
        var excexit = node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {return e.to})
                        .filter(function (n) {return n.isExitNode});
        excexit.map(function (exitnode) {
            var jsnode = toJavaScript(slicednodes, exitnode, cps, ast);
            slicednodes = removeNode(jsnode.nodes, exitnode);
            node.argument = jsnode.parsenode;
        })
        slicednodes = slicednodes.remove(node);
        return new Sliced(slicednodes, node, ast, node.parsenode);
    }

    var removeNode = function (nodes, node, cps) {
        var callnode = false;
        nodes = nodes.remove(node);
            
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
    var toJavaScript = function (slicednodes, node, cps, ast) {
        if(node.isActualPNode || node.isFormalNode || node.isExitNode || !node.parsenode) {
            
            return new Sliced(slicednodes, node, ast, false);
        }
        var parent = Ast.parent(node.parsenode, ast);
        /*if(parent && Aux.isRetStm(parent) && !node.isObjectEntry) {
            node.parsenode = parent
        } */
        if(parent && Aux.isExpStm(parent) && !(Aux.isCallExp(node.parsenode))) {
            node.parsenode = parent
        }
        if (Aux.isExpStm(node.parsenode) && Aux.isCallExp(node.parsenode.expression)) {
            node.parsenode = node.parsenode.expression
        }
        console.log('JSIFY(' + node.parsenode.type + ') ' + node.parsenode);
        switch (node.parsenode.type) {
            case 'VariableDeclaration': 
                return sliceVarDecl(slicednodes, node, cps, ast);
            case 'VariableDeclarator':
                return sliceVarDecl(slicednodes, node, cps, ast);
            case 'FunctionExpression':
                return sliceFunExp(slicednodes, node, cps, ast);
            case 'FunctionDeclaration':
                return sliceFunExp(slicednodes, node, cps, ast);
            case 'BlockStatement':
                return sliceBlockStm(slicednodes, node, cps, ast);
            case 'CallExpression':
                return sliceCallExp(slicednodes, node, cps, ast);
            case 'BinaryExpression':
                return sliceBinExp(slicednodes, node, cps, ast);
            case 'IfStatement':
                return sliceIfStm(slicednodes, node, cps, ast);
            case 'ObjectExpression':
                return sliceObjExp(slicednodes, node, cps, ast);
            case 'Property':
                return sliceProperty(slicednodes, node, cps, ast);
            case 'NewExpression' :
                return sliceNewExpression(slicednodes, node, cps, ast);
            case 'ThrowStatement' :
                return sliceThrowStm(slicednodes, node, cps, ast);
            case 'TryStatement' :
                return sliceTryStm(slicednodes, node, cps, ast);

            default: 
                if (Aux.isRetStm(node.parsenode)// && 
                    /*node.getOutEdges(EDGES.CONTROL).filter(function (e) {
                            return e.to.isCallNode
                        }).length > 0)*/)
                    return sliceRetStm(slicednodes, node, cps, ast)
                
                if (Aux.isExpStm(node.parsenode) && Aux.isAssignmentExp(node.parsenode.expression))
                    return sliceVarDecl(slicednodes, node, cps, ast)
                
                if (Aux.isExpStm(node.parsenode) && Aux.isBinExp(node.parsenode.expression))
                    return sliceBinExp(slicednodes, node, cps, ast)
                
                return new Sliced(slicednodes, node, ast, node.parsenode);
        }
    }

    var Sliced = function (nodes, node, ast, parsednode) {
        this.nodes       = nodes;
        this.node        = node;
        this.parsednode  = parsednode;

        this.setup       = [];
        this.footer      = [];
        
        this.method      = {};
        this.methods     = [];
        this.streams     = [];
        this.AST         = ast;

        this.cloudtypes  = {};
    }

    var cloneSliced = function (sliced, nodes, node) {
        var clone = new Sliced(nodes, node);

        clone.methods    = sliced.methods;
        clone.setup      = sliced.setup;
        clone.streams    = sliced.streams;
        clone.cloudtypes = sliced.cloudtypes;
        clone.option     = sliced.option;
        clone.AST        = sliced.AST;

        return clone;
    }



    toreturn.transpile = toJavaScript;


    if (typeof module !== 'undefined' && module.exports != null) {
        JSParse = require('./JS_parse.js').JSParse;
        exports.JSify  = toreturn;
    }

    return toreturn;
})();