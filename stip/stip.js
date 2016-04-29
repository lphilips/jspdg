var Stip = (function () {

    var module = {};

    var arrayprims  = ["filter", "count", "push", "search", "length", "map", "append", "concat", "forEach", "slice", "find", "sort"];
    var stringprims = ["startsWith", "charAt", "charCodeAt", "search", "indexOf"];

    var isPrimitive = function (callname) {
        return arrayprims.indexOf(callname) >= 0 || stringprims.indexOf(callname) >= 0
    } 



    /*   _________________________________ PROGRAMS _________________________________
     *
     * https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Programs
     */


    var handleProgram = function (graphs, node) {
        var rootnode = new EntryNode(graphs.PDG.entIndex);
        graphs.PDG.changeEntry(rootnode);
        node.body.map(function (exp) {
            makePDGNode(graphs, exp, rootnode);
        })
        return rootnode;
    }


    /*       _________________________________ DECLARATIONS _________________________________
     *
     *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Declarations
     */

    /* VARIABLE DECLARATION */
    var handleVarDecl = function (graphs, node, upnode) { 
        var stmNodes = [];
        node.declarations.map(function (decl) {
            var stmNode = graphs.PDG.makeStm(decl);
            stmNode.parsenode.leadingComment = node.leadingComment;
            if (upnode) 
                stmNode.dtype = upnode.getdtype();
            stmNode.name = decl.id.name;
            addToPDG(stmNode, upnode, graphs);
            /* Make (if necessary) PDG nodes of init expression */
            if (decl.init !== null)
                makePDGNode(graphs, decl.init, stmNode);
            graphs.ATP.addNodes(decl, stmNode);
            stmNodes.push(stmNode)
        })
        return stmNodes        
    }

    /* FUNCTION DECLARATION creates a new entry node in the DPDG */
    var handleFuncDeclaration = function (graphs, node, upnode) {
        var PDG       = graphs.PDG,
            entry     = new EntryNode(++graphs.PDG.entIndex, node),
            prevEntry = PDG.entryNode;

        if (Pdg.isConstructor(node, graphs.AST)) {
            return handleConstructorFunction(graphs, node, upnode);
        }

        graphs.PDG.changeEntry(entry);
        addToPDG(entry, upnode, graphs);
        graphs.ATP.addNodes(node, entry);
        handleFormalParameters(graphs, node, entry);
        
        if (node.id.name.startsWith('anonf')) {
            if (entry.isServerNode())
                entry.serverCalls = 1;
            if (entry.isClientNode())
                entry.clientCalls = 1;
        }

        /* BODY */
        node.body.body.map(function (exp) {
            makePDGNode(graphs, exp, entry)
        })
        /* Exception Exit nodes added along the way should be connected to formal out */
        entry.getFormalOut().map(function (form_out) {
            var returns = form_out.getInEdges()
                            .map(function (e) {return e.from})
                            .filter(function (n) {return Aux.isRetStm(n.parsenode)});

            returns.map(function (returnnode) {
                  handleFormalOutParameters(graphs, returnnode, entry, false);
            })
        })

        graphs.PDG.reverseEntry(prevEntry);

        return [entry]
    }

    /* ANONYMOUS FUNCTION DECLARATION bound to a variable
     * creates a entry node and data dependency on the variable */
    var handleAnonFuncDeclaration = function (graphs, node, entry) {
        var func_node = Aux.isFunExp(node) ? node : node.declarations[0].init;
        if (entry.parsenode &&
            !Aux.isProperty(entry.parsenode) &&  
            Pdg.isConstructor(func_node, graphs.AST)) {
            return handleConstructorFunction(graphs, node, entry);
        }
        var // Statement node of the variable declaration
            stmNode   = graphs.PDG.makeStm(node),
            // Entry node for the function
            entryNode = new EntryNode(graphs.PDG.entIndex, func_node),
            prev_entry = graphs.PDG.entryNode;

        graphs.PDG.changeEntry(entryNode);
        graphs.ATP.addNodes(func_node, entryNode);
        handleFormalParameters(graphs,node,entryNode);
        if (!Aux.isFunExp(node)) {
            stmNode.addEdgeOut(entryNode, EDGES.DATA);
            graphs.ATP.addNodes(node, stmNode);
            addToPDG(stmNode, entry, graphs);
        } 
        else if (entry.isObjectEntry) {
            entry.addMember(node.paramname, entryNode);
        }
        else if (prev_entry.isObjectEntry && Aux.isProperty(entry.parsenode)) {
            var member = prev_entry.getMember(entry.parsenode.key.name);
            if (member)
                member.addEdgeOut(entryNode, EDGES.DATA);
        }
        else if (Aux.isExpStm(entry.parsenode) &&
                Aux.isAssignmentExp(entry.parsenode.expression)) {
            entry.addEdgeOut(entryNode, EDGES.DATA);
        }
        else if (Aux.isVarDecl(entry)) {
            entry.addEdgeOut(entryNode, EDGES.DATA);
            graphs.ATP.addNodes(node, entry);
        }
        /* BODY */
        func_node.body.body.map(function (exp) {
            makePDGNode(graphs, exp, entryNode);
        })
        /* Exception Exit nodes added along the way should be connected to formal out */
        entryNode.getFormalOut().map(function (form_out) {
            var returns = form_out.getInEdges()
                            .map(function (e) {return e.from})
                            .filter(function (n) {return Aux.isRetStm(n.parsenode)});
            returns.map(function (returnnode) {
                  handleFormalOutParameters(graphs, returnnode, entryNode, false);
            })
        })

        graphs.PDG.reverseEntry(prev_entry);
        return [entryNode];        
    }

    var handleConstructorFunction = function (graphs, node, upnode) {
        var stmNode     = graphs.PDG.makeStm(node),
            next_node   = Aux.isFunExp(node) ? node : node, //TODO
            objectEntry = new ObjectEntryNode(graphs.PDG.entIndex++, next_node),
            entryNode   = new EntryNode(++graphs.PDG.entIndex, next_node ),
            prevEntry   = graphs.PDG.entryNode;
        /* declaration of the form var A = function () {} ? */
        if (Aux.isVarDecl(node)) {
            addToPDG(stmNode, upnode, graphs);
            stmNode.addEdgeOut(objectEntry, EDGES.DATA);
        } else {
            addToPDG(objectEntry, upnode, graphs);
        }
        /* Connect function to object entry as constructor */
        addToPDG(entryNode, objectEntry, graphs);
        entryNode.isConstructor = true;

        graphs.PDG.changeEntry(entryNode);
        handleFormalParameters(graphs, node, entryNode);
        /* TODO functies moeten aparte object members worden, niet in constructor functie */
        next_node.body.body.map(function (prop) {
            var propNode, parsenode;
            prop._objectentry = objectEntry;
            propNode  = makePDGNode(graphs, prop, entryNode)[0];
            parsenode = propNode.parsenode;
            if (Aux.isExpStm(parsenode) && Aux.isAssignmentExp(parsenode.expression)) {
                objectEntry.addMember(propNode.name, propNode)
                if (!Aux.isFunExp(parsenode.expression.right)) {
                    var fout = new FormalPNode(++graphs.PDG.funIndex, parsenode.expression.left.property.name, -1);
                    addDataDep(propNode, fout);
                    addToPDG(fout, entryNode, graphs);
                }
            }
        })
        graphs.PDG.reverseEntry(prevEntry);
        return [objectEntry];
    }

    /* GENERAL FUNCTION for DECLARATIONS */
    var handleDeclarator = function (graphs, node, upnode) {
        var declaratortype = node.type;
        if (!node.declarations || node.declarations[0].init !== null) {
            switch (declaratortype) {
                case 'VariableDeclaration':
                    if (Aux.isFunExp(node.declarations[0].init)) 
                        return handleAnonFuncDeclaration(graphs, node, upnode);
                    else 
                        return handleVarDecl(graphs, node, upnode);
                case 'FunctionDeclaration':
                    return handleFuncDeclaration(graphs, node, upnode);
                case 'FunctionExpression':
                    return handleAnonFuncDeclaration(graphs, node, upnode);
            }
        }
        else
            return handleVarDecl(graphs, node, upnode)
    }

    /*        _________________________________ STATEMENTS _________________________________
     *
     *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Statements
     */


    /* BLOCK STATEMENT:
     * Consists of several statements surrounded by corresponding 
     * push and pop body edges */
    var handleBlockStatement = function (graphs, node, upnode) {
        var PDG       = graphs.PDG,
            old_entry = PDG.entryNode,
            new_entry = new EntryNode(PDG.entIndex, node);

        PDG.entIndex++;
        addToPDG(new_entry, upnode, graphs);
        node.body.map(function (exp) {
            makePDGNode(graphs, exp, new_entry); 
        })

        return [new_entry]
    }

    /* IF STATEMENT */
    var handleIfStatement = function (graphs, node, upnode) {
        var PDG        = graphs.PDG,
            consequent = node.consequent,
            alternate  = node.alternate,
            stmNode    = PDG.makeStm(node);
    
        addToPDG(stmNode, upnode, graphs);
        /* TEST */
        makePDGNode(graphs, node.test, stmNode);
        /* CONSEQUENT */
        makePDGNode(graphs, consequent, stmNode);
        stmNode.getOutEdges(EDGES.CONTROL).filter(function (e) {
            if (e.to.parsenode === consequent)
                e.label = true;
        })
        /* ALTERNATE */
        if (alternate) {
            makePDGNode(graphs, alternate, stmNode)
            stmNode.getOutEdges(EDGES.CONTROL).filter(function (e) {
                if (e.to.parsenode === alternate)
                    e.label = false;
            })
        }
        return [stmNode]
    }


    var handleReturnStatement  = function (graphs, node, upnode) {
        var stmNode = graphs.PDG.makeStm(node),
            formout, pdgnode;

        addToPDG(stmNode, upnode, graphs);

        if (node.argument !== null) {
            pdgnode = makePDGNode(graphs, node.argument, stmNode);
            if (pdgnode) {
                pdgnode = pdgnode[0];
                if (pdgnode.isObjectEntry) {
                    formout = handleFormalOutParameters(graphs, pdgnode, graphs.PDG.entryNode, true);
                    pdgnode.addEdgeOut(formout, EDGES.DATA);
                } 
                else {
                    formout = handleFormalOutParameters(graphs, stmNode, graphs.PDG.entryNode, true);
                    stmNode.addEdgeOut(formout, EDGES.DATA);
                } 
            } 
            else {
                formout = handleFormalOutParameters(graphs, stmNode, graphs.PDG.entryNode, true);
                stmNode.addEdgeOut(formout, EDGES.DATA);
            }

        }
        else {
            formout = handleFormalOutParameters(graphs, stmNode, graphs.PDG.entryNode, true);
            stmNode.addEdgeOut(formout, EDGES.DATA);
        }
        return [stmNode];    
    }


    var handleForStatement = function (graphs, node, upnode) {
        var stmNode = graphs.PDG.makeStm(node);
        addToPDG(stmNode, upnode, graphs);
        stmNode.addEdgeOut(stmNode, EDGES.CONTROL);
        makePDGNode(graphs, node.init, stmNode);
        makePDGNode(graphs, node.test, stmNode);
        makePDGNode(graphs, node.update, stmNode);
        makePDGNode(graphs, node.body, stmNode);
        return [stmNode];
    }

    var handleForInStatement = function (graphs, node, upnode) {
        var stmnode = graphs.PDG.makeStm(node);
        addToPDG(stmNode, upnode, graphs);
        stmNode.addEdgeOut(stmNode, EDGES.CONTROL);
        makePDGNode(graphs, node.left, stmNode);
        makePDGNode(graphs, node.right, stmNode);
        makePDGNode(graphs, node.body, stmNode);
        return [stmNode];
    }

    var handleThrowStatement = function (graphs, node, upnode) {
        var stmNode   = graphs.PDG.makeStm(node),
            entryNode = graphs.PDG.currBodyNode,
            excExit   = graphs.PDG.makeExitNode(node.argument, true);
        upnode.addEdgeOut(stmNode, EDGES.CONTROL);
        stmNode.addEdgeOut(excExit, EDGES.CONTROL);
        entryNode.addExcExit(excExit);
        return [stmNode];
    }

    var handleTryStatement = function (graphs, node, upnode) {
        var stmNode = graphs.PDG.makeStm(node),
            catches = [];
        addToPDG(stmNode, upnode, graphs);
        graphs.ATP.addNodes(node, stmNode);
        /* Catch clause */
        node.handlers.map(function (handler) {
            var catchclause = handleCatchClause(graphs, handler, stmNode, upnode.getdtype());
            catches = catches.concat(catchclause);
        })
        stmNode.catches = catches;
        /* Body of try  */
        node.block.body.map(function (bodynode) {
            makePDGNode(graphs, bodynode, stmNode)
        });
        return [stmNode];
    }


    var handleCatchClause = function (graphs, node, upnode, dtype) {
        var stmNode   = graphs.PDG.makeStm(node);
        stmNode.dtype = dtype;
        node.body.body.map(function (bodynode) {
            makePDGNode(graphs, bodynode, stmNode);
        });
        return [stmNode];
    }

    /*       _________________________________ EXPRESSIONS _________________________________
     *
     *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Expressions
     */

    /* BINARY EXPRESSION  */
    var handleBinExp = function (graphs, node, upnode) {
        var stmNode   = graphs.PDG.makeStm(node),
            parent    = Ast.parent(node, graphs.AST),
            /* returns true for entry node, if stm or for stm as parent */
            hasEntryParent = upnode.isEntryNode ||
                       (upnode.parsenode && (
                       Aux.isForStm(upnode.parsenode) || Aux.isCatchStm(upnode.parsenode) ||
                       Aux.isThrowStm(upnode.parsenode))),
            form_out;

        /* LEFT expression */
        makePDGNode(graphs, node.left, hasEntryParent || upnode.isObjectEntry ? stmNode : upnode);
        /* RIGHT expression */
        makePDGNode(graphs, node.right, hasEntryParent || upnode.isObjectEntry ? stmNode : upnode);
        if (hasEntryParent)
            addToPDG(stmNode, upnode, graphs);
        /* upnode that is object entry : special case */
        if (upnode.isObjectEntry)
            upnode.addMember(node.paramname, stmNode);
        return [stmNode];
    }

    var handleUpdateExp = function (graphs, node, upnode) {
        var stmNode = graphs.PDG.makeStm(node),
            parent  = Ast.parent(node, graphs.AST),
            /* returns true for entry node, if stm or for stm as parent */
            hasEntryParent = upnode.isEntryNode ||
                       (upnode.parsenode && (
                       Aux.isForStm(upnode.parsenode) || Aux.isCatchStm(upnode.parsenode) ||
                       Aux.isThrowStm(upnode.parsenode))),
            form_out;
            /* Argument */
            makePDGNode(graphs, node.argument, hasEntryParent || upnode.isObjectEntry ? stmNode : upnode);
            if (hasEntryParent)
                addToPDG(stmNode, upnode, graphs);
            if (upnode.isObjectEntry)
                upnode.addMember(node.paramname, stmNode);
            return [stmNode];

    }

    var handleNewExp = function (graphs, node, upnode, toadd) {
        var name        = node.callee.name,
            calledf     = Pdg.functionsCalled(node, graphs.AST).values(),
            entry       = graphs.PDG.getEntryNode(calledf[0]),
            objectentry = graphs.PDG.makeObjEntry(node),
            fouts       = entry.getFormalOut(),
            hasEntryParent = upnode.isEntryNode ||
                       (upnode.parsenode && (
                       Aux.isForStm(upnode.parsenode) || Aux.isCatchStm(upnode.parsenode) ||
                       Aux.isThrowStm(upnode.parsenode))),
            protoentry, callnode;
        
        if (!hasEntryParent)
            upnode.addEdgeOut(objectentry, EDGES.DATA);
        if (calledf.length > 1) 
            throw new MultipleFunctionsCalledError(escodegen.generate(node));
        /* Call to constructor function */
        if (calledf.length > 0) {
            protoentry = entry.getInEdges().map(function (e) {return e.from})[0];
            objectentry.addEdgeOut(protoentry, EDGES.PROTOTYPE);
            objectentry.constructorNode = entry;
        }

        callnode = handleCallExpression(graphs, node, upnode);//objectentry);


        
        return [objectentry];
    }

    /* ASSIGNMENT */
    var handleAssignmentExp = function (graphs, node, upnode) {
        var parsenode    = node.expression? node.expression : node,
            getIdent     = function (identifier) {
                                if (Aux.isIdentifier(identifier) || Aux.isThisExpression(identifier))
                                    return identifier;
                                else 
                                    return getIdent(identifier.object);
                            },
            ident        = getIdent(parsenode.left),
            stmNode      = graphs.PDG.makeStm(node),
            declaration  = Aux.isThisExpression(ident) ? false : Pdg.declarationOf(ident, graphs.AST);


        stmNode.name = ident.name;
        addToPDG(stmNode, upnode, graphs);
        
        /* Will add data dependency to declaration node */
        makePDGNode(graphs, parsenode.left, stmNode);
        /* Right-hand side */
        makePDGNode(graphs, parsenode.right, stmNode);
        
        if (declaration) // Can be false when identifier is this-expression
            graphs.ATP.addNodes(declaration, stmNode);
        else if (!Aux.isMemberExpression(parsenode.left)) {
            throw new DeclarationNotFoundError(escodegen.generate(node));
        }
        /* Recheck dependent call nodes for dtype (could be wrong because assign. exp had
           no dtype at that moment ) */
        var calls = stmNode.edges_out.map(function (e) {
            if (e.to.isCallNode && e.equalsType(EDGES.CONTROL))
                e.to.dtype = stmNode.getdtype()
        })
        return [stmNode];
    }

    /* ARRAY EXPRESSION */
    var handleArrayExpression = function (graphs, node, upnode) {
        var stmNode   = graphs.PDG.makeStm(node),
            parent    = Ast.parent(node, graphs.AST),
            /* returns true for entry node, if stm or for stm as parent */
            hasEntryParent = upnode.isEntryNode ||
                       Aux.isIfStm(upnode.parsenode) ||
                       Aux.isForStm(upnode.parsenode),
            form_out;

        /* ELEMENTS */
        node.elements.map(function (el) {
            makePDGNode(graphs, el, hasEntryParent || upnode.isObjectEntry ? stmNode : upnode)
        })
        if (hasEntryParent)
            addToPDG(stmNode, upnode, graphs);
        if (upnode.isObjectEntry)
            upnode.addMember(node.paramname, stmNode)
        return [stmNode];
    }

    /* MEMBER EXPRESSION */
    var handleMemberExpression = function (graphs, node, upnode) {
        var parsenode = node.expression ? node.expression : node,
            object   = parsenode.object, 
            property = parsenode.property,
            stmNode  = graphs.PDG.makeStm(node),
            /* returns true for entry node, if stm or for stm as parent */
            hasEntryParent = upnode.isEntryNode ||
                       Aux.isIfStm(upnode.parsenode) ||
                       Aux.isForStm(upnode.parsenode);
        if (hasEntryParent)
            addToPDG(stmNode, upnode, graphs);
        /* Object : this - reference to object */
        if (Aux.isIdentifier(object)) {
            var decl        = Pdg.declarationOf(object, graphs.AST);
            var inTryStm    = Aux.inTryStatement(graphs.AST, object);
            if (!decl && !Aux.isTryStm(inTryStm)) {
                throw new DeclarationNotFoundError(escodegen.generate(object));
            }
            else if (Aux.isTryStm(inTryStm)) {
                return [stmNode];
            }
            var PDGnode     = graphs.ATP.getNode(decl),
                handle = function (declarationNodes) {
                    declarationNodes.forEach(function (declarationNode) {
                        var objectentry = declarationNode, 
                            member;
                        if (declarationNode)
                            /*if (declarationNode.isStatementNode && 
                                Aux.isVarDeclarator(declarationNode.parsenode)) {*/

                             objectentry = declarationNode.getOutEdges(EDGES.DATA)
                                            .map(function (e) {return e.to})
                                            .filter(function (n) {return n.isObjectEntry})[0]
                           // } 
                            if (!objectentry) {
                                if (!hasEntryParent)
                                    addDataDep(declarationNode, upnode);
                                else
                                    addDataDep(declarationNode, stmNode);
                            }
                            else {
                                if (objectentry.getMember) {
                                    member = objectentry.getMember(property);
                                    if (member)
                                        addDataDep(member, hasEntryParent ? stmNode : upnode);
                                    /* Adding a new member */
                                    else if (Aux.isExpStm(upnode.parsenode) &&
                                            Aux.isAssignmentExp(upnode.parsenode.expression)) {
                                        var left = upnode.parsenode.expression.left;
                                        if (Aux.isIdentifier(left)) {
                                            objectentry.addMember(left.name, upnode);
                                        }
                                        else 
                                            objectentry.addMember(left.property.name, upnode);
                                    }

                                    else {
                                        var protoentry = objectentry.getOutEdges(EDGES.PROTOTYPE)
                                                    .map(function (e) {return e.to})[0],
                                            memberstm    = protoentry.getMember(property);
                                        addDataDep(memberstm, stmNode);
                                    }
                                }
                        }
                    })
                };

            if (PDGnode) {
                handle(PDGnode)
            } else {
                graphs.ATP.installListener(decl, handle);
            }
            

        } else if (Aux.isExpStm(upnode.parsenode) && Aux.isAssignmentExp(upnode.parsenode.expression)) {
            upnode.name = property.name;
            /* Currently handling constructor function */
            if (graphs.PDG.entryNode.isConstructor) {
                var formp = graphs.PDG.entryNode.getFormalIn()
                            .filter( function (f) {
                                return f.name === node.name
                        });
                formp.map(function (f_in) {
                    addDataDep(f_in, upnode)
                })
            }
        }
        else if (Aux.isThisExpression(object)) {
            var objectentry = upnode.enclosingObjectEntry(),
                memberstm   = objectentry ? objectentry.getMember(property) : false;
            if (memberstm) 
                memberstm.addEdgeOut(upnode, EDGES.DATA);
        }
        /* Will add data dependency to declaration node */
        //makePDGNode(graphs, object, hasEntryParent ? stmNode : upnode);
        /* Right-hand side */
        //makePDGNode(graphs, property, hasEntryParent ? stmNode : upnode);
        /* Recheck dependent call nodes for dtype (could be wrong because assign. exp had
           no dtype at that moment ) */
        var calls = stmNode.edges_out.map(function (e) {
            if (e.to.isCallNode && e.equalsType(EDGES.CONTROL))
                e.to.dtype = stmNode.getdtype()
        });
        return [stmNode];
    }

    /* PROPERTY */
    var handleProperty = function (graphs, node, upnode) {
        var stmNode = graphs.PDG.makeStm(node);
        upnode.addMember(node.key.name, stmNode)
        makePDGNode(graphs, node.value, stmNode);
        return [stmNode];
    }


    /* THIS EXPRESSION */
    var handleThisExpression = function (graphs, node, upnode) {
        Ast.enclosingScope;
    }


    var handleObjectExpression = function (graphs, node, upnode) {
        var objectEntry = graphs.PDG.makeObjEntry(node),
            prevEntry   = graphs.PDG.entryNode;
        graphs.PDG.changeEntry(objectEntry);
        if (Aux.isVarDeclarator(upnode.parsenode) ||
            (Aux.isExpStm(upnode.parsenode) && Aux.isAssignmentExp(upnode.parsenode.expression)))
            addDataDep(upnode, objectEntry);
        else
            addToPDG(objectEntry, upnode, graphs);
        node.properties.map(function (prop) {
            makePDGNode(graphs, prop, objectEntry);
        })
        graphs.PDG.reverseEntry(prevEntry);
        return [objectEntry];
    }


    /* CALL EXPRESSION */
    var handleCallExpression = function (graphs, node, upnode) {
        // Handle actual parameters of this call
        var parsenode = node.expression ? node.expression : node,
            primitive = graphs.ATP.isPrimitive(Aux.getCalledName(parsenode)),
            callnode  = graphs.PDG.makeCall(node);
        
        callnode.name = Aux.getCalledName(parsenode);
        if (primitive) {
            upnode.primitive = true;
        }
        // Callee = member expression en de left hand side, declaration = primitive set

        if (Aux.isMemberExpression(parsenode.callee)) { 
            var  getObject = function (member) {
                    if (member.object && Aux.isIdentifier(member.object))
                        return member.object
                    else if (member.callee)
                        return member.callee
                    else
                        return getObject(member.object)
                 },
                 declaration = Pdg.declarationOf(getObject(parsenode.callee), graphs.AST);
            var hasEntryParent = upnode.isEntryNode || (upnode.parsenode && (Aux.isIfStm(upnode.parsenode) ||
                             Aux.isForStm(upnode.parsenode) || Aux.isCatchStm(upnode.parsenode) || Aux.isThrowStm(upnode.parsenode)));
            if (!declaration)
                throw new DeclarationNotFoundError(escodegen.generate(getObject(parsenode.callee)));
            var PDG_node = graphs.ATP.getNode(declaration),
                 handle = function (pdgnode, objectentry) {
                    var calledname = Aux.getCalledName(parsenode);
                    var objectentry = objectentry ? objectentry : pdgnode.getOutEdges(EDGES.DATA)  //TODO : this is for var -> OE, should also work for EntryNode -> Return -> OE
                                            .map(function (e) {return e.to})
                                            .filter(function (n) {return n.isObjectEntry})[0];
                    callnode.name = calledname;
                    if (!objectentry && pdgnode.isEntryNode) {
                        objectentry = pdgnode.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.isStatementNode && Aux.isRetStm(n.parsenode)}).flatMap(function (n) {return n.getOutNodes(EDGES.DATA)}).filter(function (n) {return n.isObjectEntry})[0];
                    }
                    /* If no object entry, we can't connect an OE node with the referred node,
                       e.g. as the result of a map, filter call. Make data ref to declaration node 
                       + add actual out parameter with data ref to upnode*/
                    if (!objectentry && !pdgnode.equals(upnode)) {
                        var actual_out = new ActualPNode(++graphs.PDG.funIndex, -1);
                        addDataDep(pdgnode, callnode);
                        if (callnode.getInNodes(EDGES.CONTROL).filter(function (n) {return n.equals(upnode)}).length <= 0)
                            addToPDG(callnode, upnode, graphs);
                        handleActualParameters(graphs, parsenode, callnode);
                        callnode.primitive = primitive;
                        callnode.addEdgeOut(actual_out, EDGES.CONTROL);

                        if (!hasEntryParent) {
                            actual_out.addEdgeOut(upnode, EDGES.DATA);
                        }
                        else {
                            actual_out.addEdgeOut(callnode, EDGES.DATA);
                        }
                        callnode.getActualIn().map(function (a_in) {
                            var entry = a_in.getInNodes(EDGES.DATA).filter(function (n) {return n.isEntryNode});
                            if (entry.length > 0) {
                                entry[0].getFormalOut().map(function (f_out) {
                                    f_out.addEdgeOut(actual_out, EDGES.DATA);
                                })
                            }
                            a_in.addEdgeOut(actual_out, EDGES.SUMMARY);
                        }) 
                    }
                    else if (!pdgnode.equals(upnode) && !primitive) {
                        /* Get object property */
                        var member = objectentry.getMember(calledname);
                        while(!member) {
                            objectentry = objectentry.getOutEdges(EDGES.PROTOTYPE)
                                                    .map(function (e) {return e.to})[0];
                            if (objectentry)
                                member = objectentry.getMember(calledname);
                            else
                                break;
                        }
                        var entry  = member ? member.getOutEdges(EDGES.DATA)
                                        .map(function (e) {return e.to})
                                        .filter(function (n) {return n.isEntryNode})[0] : false;
                        if (entry)
                            addCallDep(callnode, entry);
                        else if (!entry && primitive) {
                            callnode.primitive = true;
                            addToPDG(callnode, upnode, graphs);
                        }

                        upnode.addEdgeOut(callnode, EDGES.CONTROL);
                        handleActualParameters(graphs, parsenode, callnode);
                        if (entry)
                            entry.getFormalOut().map(function (formal_out) {
                                var actual_out = new ActualPNode(++graphs.PDG.funIndex, -1),

                                    upnodeform = formal_out.getInEdges(EDGES.DATA)
                                                    .map(function (e) {return e.from})
                                                    .filter(function (n) {return n.isObjectEntry});

                                if (!upnode.isEntryNode && !upnode.isObjectEntry)
                                    addDataDep(actual_out, upnode)
                                else if (!upnode.isObjectEntry && !hasEntryParent)
                                    addDataDep(actual_out, callnode)
                                /* Connect upnode to object entry that is returned by function */
                                if (upnodeform.length > 0) {
                                    upnodeform.map(function (objectentry) {
                                        addDataDep(upnode, objectentry)
                                    })
                                }

                                else {
                                    /* Search for object entry that is returned from function call:
                                    From formal_out -> return statement -> object entry */
                                    upnodeform = formal_out.getInEdges(EDGES.DATA)
                                                    .map(function (e) {return e.from})
                                                    .filter(function (n) {return n.isStatementNode && Aux.isRetStm(n.parsenode)})
                                                    .flatMap(function (n) {return n.getOutEdges(EDGES.DATA)})
                                                    .map(function (e) {return e.to})
                                                    .filter(function (n) {return n.isObjectEntry});
                                    upnodeform.map(function (objectentry) {
                                        addDataDep(upnode, objectentry)
                                    })                      
                                }    

                                /* Formal-out parameter -> actual-out parameter */
                                if (formal_out && (!actual_out.equalsdtype(formal_out) || 
                                    !actual_out.isSharedNode() ||
                                    !formal_out.isSharedNode () ))
                                        formal_out.addEdgeOut(actual_out, EDGES.REMOTEPAROUT); 
                                else if (formal_out)
                                    formal_out.addEdgeOut(actual_out, EDGES.PAROUT);
                                callnode.addEdgeOut(actual_out, EDGES.CONTROL);  
                            });

                        if (!hasEntryParent) {
                            pdgnode.addEdgeOut(upnode, EDGES.DATA)
                        } else if (!callnode.equals(pdgnode)) {
                            pdgnode.addEdgeOut(callnode, EDGES.DATA)
                        }

                    }
                    else if (primitive) {
                        addToPDG(callnode, upnode, graphs);
                        handleActualParameters(graphs, parsenode, callnode);
                    }
                graphs.ATP.removeListener(declaration);
                return [callnode];
            }
            /* Recheck primitive with object (e.g. console.log) */
            primitive = graphs.ATP.isPrimitive(Aux.getCalledName(parsenode), parsenode.callee.object);
            callnode.primitive = primitive;
            upnode.primitive = primitive;

            if (PDG_node){
                var res;
                addToPDG(callnode, upnode, graphs);
                for(var i = 0; i < PDG_node.length; i++) {
                    var node = PDG_node[i];
                    if (node.isStatementNode &&
                        Aux.isVarDeclarator(node.parsenode) && 
                        node.parsenode.init &&
                        Aux.isObjExp(node.parsenode.init)) {
                        res = handle(node);
                        break;
                    }
                    if (node.isStatementNode &&
                        Aux.isVarDeclarator(node.parsenode) &&
                        !node.parsenode.init) {
                        addDataDep(node, callnode);
                    }                
                    /* call is of form othercall().thiscall */
                    else if (node.isEntryNode) {
                        var objectentry = node.getOutNodes(EDGES.CONTROL).filter(function (n) {return n.isStatementNode && Aux.isRetStm(n.parsenode)}).flatMap(function (n) {return n.getOutNodes(EDGES.DATA)}).filter(function (n) {return n.isObjectEntry})[0];
                        handle(node, objectentry);
                    }
                    else if (node.isFormalNode) {
                        handle(node);
                        addToPDG(callnode, upnode, graphs);
                    }
                    else if (node.isStatementNode && 
                            Aux.isExpStm(node.parsenode) &&
                            Aux.isAssignmentExp(node.parsenode.expression)) {
                        addDataDep(node, callnode);
                        res = handle(node);
                        break;
                    }
                }
                if (res)
                    return res;
                else {
                    graphs.ATP.installListener(declaration, handle);
                    return [callnode];
                }
            }
        
            else if (primitive) {
                callnode.primitive = true;
                addToPDG(callnode, upnode, graphs);
            }
            else if (Aux.isNewExp(parsenode.callee.object)) {
                var objectentry = makePDGNode(graphs, parsenode.callee.object, upnode);
                addToPDG(objectentry[0], upnode);
                return handle(callnode, objectentry[0]);
            }
            else {
                graphs.ATP.installListener(declaration, handle);
                addToPDG(callnode, upnode, graphs);
                return [callnode];
            }
        }
        var preventry = graphs.PDG.entryNode,
            calledf   = Pdg.functionsCalled(node, graphs.AST).values(),
            entry     = calledf.length > 0 ? graphs.PDG.getEntryNode(calledf[0]) : false, 
            handle    =  function (entrynode) {
                var formals = entrynode.getFormalIn();
                if (Comments.isGeneratedAnnotated(node.leadingComment)) {
                    addCall(callnode, entrynode, true);
                    if (node.clientCalls) 
                        entrynode.clientCalls = node.clientCalls;
                    if (node.serverCalls)
                        entrynode.serverCalls = node.serverCalls;
                    return;
                }

                if (!callnode.name.startsWith('anonf')) {
                    addToPDG(callnode, upnode, graphs);
                    /* Recall comment handlers on upnode in case the entry node is handled later than the call node */
                    if (!entry && upnode.parsenode.leadingComment)
                        Comments.handleAfterComment(upnode.parsenode.leadingComment, [upnode]);
                    addCallDep(callnode, entrynode);

                    /* Bind the actual and formal parameters */
                    for (var i = 0; i < callnode.getActualIn().length; i++) {
                        var a = callnode.getActualIn()[i],
                            f = formals[i];
                        /* actual-in parameter -> formal-in parameter */
                        if (f && (!a.equalsdtype(f) || 
                            !a.isSharedNode() ||
                            !f.isSharedNode()))
                            a.addEdgeOut(f, EDGES.REMOTEPARIN);
                        else if (f)
                            a.addEdgeOut(f, EDGES.PARIN);
                    }

                    /* Actual out parameter */
                    if (entrynode.excExits.length > 0) {
                        /* Call made in try/catch statement? */
                        handleCallwithCatch(graphs, callnode, entrynode, upnode)
                    }
                    entrynode.getFormalOut().map(function (formal_out) {
                        var actual_out = new ActualPNode(++graphs.PDG.funIndex, -1),
                            upnodeform = formal_out.getInEdges(EDGES.DATA)
                                            .map(function (e) {return e.from})
                                            .filter(function (n) {return n.isObjectEntry});
                        if (!upnode.isEntryNode && !upnode.isObjectEntry)
                            addDataDep(actual_out, upnode)
                        else if (!upnode.isObjectEntry)
                            addDataDep(actual_out, callnode)
                        /* Connect upnode to object entry that is returned by function */
                        if (upnodeform.length > 0) {
                            upnodeform.map(function (objectentry) {
                                addDataDep(upnode, objectentry)
                            })
                        }
                        else {
                            /* Search for object entry that is returned from function call:
                            From formal_out -> return statement -> object entry */
                            upnodeform = formal_out.getInEdges(EDGES.DATA)
                                            .map(function (e) {return e.from})
                                            .filter(function (n) {return n.isStatementNode && Aux.isRetStm(n.parsenode)})
                                            .flatMap(function (n) {return n.getOutEdges(EDGES.DATA)})
                                            .map(function (e) {return e.to})
                                            .filter(function (n) {return n.isObjectEntry});
                            upnodeform.map(function (objectentry) {
                                addDataDep(upnode, objectentry);
                            })                      
                        }    

                        /* Formal-out parameter -> actual-out parameter */
                        if (formal_out && (!actual_out.equalsdtype(formal_out) || 
                            !actual_out.isSharedNode() ||
                            !formal_out.isSharedNode () ))
                                formal_out.addEdgeOut(actual_out, EDGES.REMOTEPAROUT); 
                        else if (formal_out)
                            formal_out.addEdgeOut(actual_out, EDGES.PAROUT);
                        callnode.addEdgeOut(actual_out, EDGES.CONTROL);  
                        actual_out.getdtype(true);
                    })

                }
                /* Add summary edges between a_in and a_out */
                handleSummaryEdges(callnode, entrynode);
                postRemoteDep(callnode.getActualIn());

                if(!callnode.name.startsWith('anonf'))
                    entrynode.addCall(callnode);
                return [callnode];
            };
        if (calledf.length > 1) {
            throw new MultipleFunctionsCalledError(escodegen.generate(node));
        }

        /* generated calls should add call info to entry node */
        if (Comments.isGeneratedAnnotated(node.leadingComment)) {
            if (entry) {
                if (node.clientCalls) 
                        entry.clientCalls = node.clientCalls;
                if (node.serverCalls)
                        entry.serverCalls = node.serverCalls;
            }
            return;
        }

        else if (entry && !(Aux.isVarDeclarator(entry.parsenode)) && !entry.parsenode.init) {
            handleActualParameters(graphs, parsenode, callnode);
            return handle(entry);
        }
        else if (primitive) {
            callnode.primitive = true;
            addToPDG(callnode, upnode, graphs);
        }   
        else {
            graphs.ATP.installListener(calledf[0], handle);
            if (!callnode.name.startsWith('anonf')) {
                addToPDG(callnode, upnode, graphs);    
                handleActualParameters(graphs, parsenode, callnode);
            }
            return [callnode];
        }
            
       
    }

    /* ACTUAL PARAMETERS of a function call.
     * All parameters are bundled by operand continuation edges */
    var handleActualParameters = function (graphs, node, callnode) {
        var nr_param   = node.arguments.length,
            params     = node.arguments,
            curr_param = 0,
            a_in;
        while (nr_param != curr_param) {
            a_in = new ActualPNode(graphs.PDG.funIndex, 1);
            graphs.PDG.funIndex++;
            a_in.parsenode = params[curr_param];
            var PDG_node = makePDGNode(graphs, a_in.parsenode, a_in);
            curr_param++;
            callnode.addEdgeOut(a_in, EDGES.CONTROL);
        }
    }

    var handleCallwithCatch = function (graphs, callnode, entrynode, upnode) {
        var excExits   = entrynode.excExits,
            trystm     = Aux.inTryStatement(graphs.AST, callnode.parsenode),
            form_outs  = entrynode.getFormalOut().filter(function (f_out) {
                return f_out.getInEdges().filter(function (e) {
                    return e.from.isExitNode && !e.from.exception
                }).length > 0
            }),
            normalExit = graphs.PDG.makeExitNode(undefined, false),
            toUpnode   = function (actual_out) {
                  if (!upnode.isEntryNode || upnode.isObjectEntry)
                    addDataDep(actual_out, upnode)
                  else
                    addDataDep(actual_out, callnode)
                },
            trynode, a_out;

        excExits.map(function (excExit) {
            var form_out = excExit.getOutEdges()
                            .map(function (e) {return e.to})
                            .filter(function (n) {return n.isFormalNode})[0];
            if (Aux.isTryStm(trystm) && excExit.exception) {
                trynode = graphs.ATP.getNode(trystm)[0];
                if (trynode && trynode.catches) {
                    trynode.catches.map(function (catchnode) {
                        a_out = new ActualPNode(++graphs.PDG.funIndex, -1);
                        addToPDG(catchnode, callnode, graphs);
                        catchnode.addEdgeOut(a_out, EDGES.CONTROL);
                        form_out.addEdgeOut(a_out, EDGES.PAROUT); // TODO remote par out as well
                        toUpnode(a_out);
                    })
                }
            }
        })
        a_out = new ActualPNode(++graphs.PDG.funIndex, -1);
        normalExit.addEdgeOut(a_out, EDGES.CONTROL);
        form_outs[0].addEdgeOut(a_out, EDGES.PAROUT);
        callnode.addEdgeOut(normalExit, EDGES.CONTROL);
        toUpnode(a_out);
    }

    /* FORMAL PARAMETERS of a function definition.
     * This is handled on AST level (parsenode.params) */
    var handleFormalParameters = function (graphs, node, entry) {
        var nr_params = entry.parsenode.params.length,
            PDG       = graphs.PDG,
            params    = entry.parsenode.params;
        for (var i = 0; i < nr_params; i++) {
            var param    = params[i],
                fin_node = graphs.PDG.makeFormalNode(param.name, 1);
            entry.addEdgeOut(fin_node, EDGES.CONTROL); 
            graphs.ATP.addNodes(param, fin_node);
        }
    }

    /* Function is called :
     * 1. When formal_out parameter should be added (e.g. return statement)
     * 2. When function has been evaluated and there were throw statements in there
     *    In this case this function makes the former formal_out parameter a normal exit out parameter.
     */
    var handleFormalOutParameters = function (graphs, stmNode, entry, recheck) {
        var PDG      = graphs.PDG,
            form_out = graphs.PDG.makeFormalNode(stmNode.parsenode, -1),
            normalExit;
        /* If function has throw statements, normal exit node should  be added 
           + formal out for every exception exit node as well */
        if (entry.excExits.length > 0 && !recheck) {
            entry.excExits.map(function (excExit) {
                var form_out = graphs.PDG.makeFormalNode(excExit.parsenode, -1);
                excExit.addEdgeOut(form_out, EDGES.CONTROL);
            })
            /* If recheck, remove old formal_out parameter */
            stmNode.edges_out = stmNode.edges_out.filter(function (e) {
                return e.equalsType(EDGES.CONTROL) && !e.to.isFormalNode 
            })
            normalExit = graphs.PDG.makeExitNode(stmNode.parsenode, false);
            normalExit.addEdgeOut(form_out, EDGES.CONTROL);
            entry.excExits.push(normalExit);
            stmNode.addEdgeOut(normalExit, EDGES.CONTROL);
            entry.edges_out = entry.getOutEdges()
                                .filter(function (e) {
                                    return !(e.to.isFormalNode && e.to.direction < 0)
                                })
        }
        else if (recheck)
            entry.addEdgeOut(form_out, EDGES.CONTROL);
        return form_out;
    }

    /* Formal out nodes in a constructor function represent properties in the object.
       They are not responsible for handling the value expression, but should however
       contain a data dependency to the formal_in parameters if these are being referenced */
    var handleFormalParamObj = function (entry, formalParam) {
        var value = escodegen.generate(formalParam.parsenode),
            fins  = entry.getFormalIn();
        falafel(value, function (node) {
            if (Aux.isIdentifier(node)) {
              fins.map(function (fin) {
                if (fin.name === node.name) 
                    addDataDep(fin, formalParam);
                })
            }
        })
    }

    /* Summary edges are added between actual_in to actual_out parameter if
     * a path between the corresponding formal_in to formal_out exists */
    var handleSummaryEdges = function (callnode, entryNode) {
        var actual_ins = callnode.getActualIn(),
            actual_outs = callnode.getActualOut(),
            formal_ins = entryNode.getFormalIn(),
            formal_outs = entryNode.getFormalOut();
        if(actual_outs && formal_outs) {
            for(var i = 0; i < actual_ins.length; i++) {
                var actual_in  = actual_ins[i],
                    actual_out = actual_outs[i] ? actual_outs[i] : actual_outs[0],
                    formal_in  = formal_ins[i],
                    /* Normal function -> 1 formal out, constructor function -> [0..*] formal outs */
                    formal_out = formal_outs[i] ? formal_outs[i] : formal_outs[0];
                if(formal_in && formal_out && formal_in.pathExistsTo(formal_out)) {
                    actual_in.addEdgeOut(actual_out, EDGES.SUMMARY)
                }
            }
        }
    }

    /* GENERAL FUNCTION for EXPRESSIONS */
    var handleExpressionStatement = function (graphs, node, upnode) {
        var expressiontype = node.expression ? node.expression.type : node.type;
        switch (expressiontype) {
            case 'CallExpression':
                return handleCallExpression(graphs, node, upnode);
            case 'BinaryExpression' :
                return handleBinExp(graphs, node.expression ? node.expression : node, upnode);
            case 'UpdateExpression':
                return handleUpdateExp(graphs, node.expression ? node.expression : node, upnode);
            case 'AssignmentExpression' :
                return handleAssignmentExp(graphs, node, upnode);
            case 'ArrayExpression' :
                return handleArrayExpression(graphs, node, upnode);
            case 'MemberExpression' :
                return handleMemberExpression(graphs, node, upnode);
            case 'ThisExpression' :
                return handleThisExpression(graphs, node, upnode);
            case 'NewExpression' :
                return handleNewExp(graphs, node, upnode);
            case 'Property' :
                return handleProperty(graphs, node, upnode);
            case 'ObjectExpression' :
                return handleObjectExpression(graphs, node, upnode)
         }
    }

    var handleIdentifier = function (graphs, node, upnode) {
        var parent      = Ast.parent(node, graphs.AST),
            formp       = graphs.PDG.entryNode.getFormalIn(),
            isPrimitive = graphs.ATP.isPrimitive(node.name),
            handle      = function (PDG_node) {
                if (upnode) 
                   addDataDep(PDG_node, upnode)
            },
            declaration, PDG_nodes;
        if (!isPrimitive) {
            declaration = Pdg.declarationOf(node, graphs.AST);
            if (declaration) {

                PDG_nodes = graphs.ATP.getNode(declaration);
                if (PDG_nodes)
                    PDG_nodes.map(function (pdgnode) {
                        /* TODO check if exec. can reach the pdg_node before adding data dep */
                        handle(pdgnode)
                    })
                else 
                    graphs.ATP.installListener(declaration, handle);   
            }   
            formp = formp.filter( function (f) {
                return f.name === node.name;
            });
            if (formp.length > 0)
                formp.map(function (f_in) {
                    addDataDep(f_in, upnode)
                })
            /* no declaration, no formal parameter of current function: throw error */
            else if (!declaration)
                throw new DeclarationNotFoundError(escodegen.generate(node));
        }

    }

    var handleLiteral = function (graphs, node, upnode) {
        var parent    = Ast.parent(node, graphs.AST);
        if (parent && Aux.isRetStm(parent)) {
            var stmNode = graphs.PDG.makeStm(parent);
            //upnode.addEdgeOut(stmNode, EDGES.CONTROL);
            return [stmNode];
        }
        if (parent && Aux.isAssignmentExp(parent) && upnode.isObjectEntry) {
            var stmNode = graphs.PDG.makeStm(node);
            upnode.addEdgeOut(stmNode, EDGES.OBJMEMBER);
            upnode.addMember(parent.left.property, stmNode);
            return [stmNode];
        }
    }


    /* Auxiliary Functions to add correct edges to nodes, etc. */
    var addToPDG = function (node, upnode, graphs) {
        var comment;
        if (node.parsenode && 
            Aux.isBlockStm(node.parsenode) && 
            Comments.isTierAnnotated(node.parsenode)) { 

            comment = node.parsenode.leadingComment;
            if (Comments.isClientAnnotated(comment)) 
                graphs.PDG.addClientStm(node, graphs.AST);
            else if (Comments.isServerAnnotated(comment))
                graphs.PDG.addServerStm(node, graphs.AST);
        }

        /* Block with tier annotation is handled separately */
        else {
            if (upnode.isObjectEntry)
                upnode.addEdgeOut(node, EDGES.OBJMEMBER)
            else
                upnode.addEdgeOut(node, EDGES.CONTROL)
        }
    }

    var addCallDep = function (from, to) {
        var dtypef = from.getdtype(),
            dtypet = to.getdtype();
        if (dtypef && dtypet)
            if(dtypef.value === DNODES.SHARED.value ||
                dtypet.value === DNODES.SHARED.value) 
                from.addEdgeOut(to, EDGES.CALL);
            else if (dtypef.value !== dtypet.value) 
                from.addEdgeOut(to, EDGES.REMOTEC);
            else 
                from.addEdgeOut(to, EDGES.CALL);

            if (dtypef.value === DNODES.SERVER &&
                dtypet.value === DNODES.CLIENT)
                to.clientCalls += 1;
            else if (dtypef.value === DNODES.CLIENT &&
                dtypet.value === DNODES.SERVER) 
                to.clientCalls += 1;
        else
            from.addEdgeOut(to, EDGES.CALL)
    }

    var addDataDep = function (from, to) {
        var dtypef = from.getdtype(),
            dtypet = to.getdtype(),
            dupl   = from.getOutEdges(EDGES.REMOTED)
                         .concat(from.getOutEdges(EDGES.DATA))
                         .filter(function (e) {
                            return  e.to.equals(to) });
        if(dupl.length < 1) {
            if(dtypef && dtypet && 
                (dtypef.value !== DNODES.SHARED.value &&
                 dtypet.value !== DNODES.SHARED.value) &&
                 dtypef.value !== dtypet.value) 
                from.addEdgeOut(to, EDGES.REMOTED)
            else
                from.addEdgeOut(to, EDGES.DATA)
        }
    }

    /*
     * Because actual parameters are handled before the actual call node,
     * some dependencies for these parameters can be wrong 
     * (atm of creating them the actual parameters don't know their tier information)
     * This function rechecks them.
     */
    var postRemoteDep = function (params) {
        params.map( function (param) {
            var datadeps = param.getInEdges(EDGES.DATA)
                                .concat(param.getInEdges(EDGES.REMOTED)),
                calldeps = param.getInEdges().filter( function (e) {
                    return e.from.isCallNode  
                }).map( function (e) { return e.from});

            var paramtype = param.getdtype(true);   

            datadeps.map(function (e) {
                var dtypef = e.from.getdtype(true);
                if(dtypef && paramtype && 
                   (dtypef.value !== DNODES.SHARED.value &&
                    paramtype.value !== DNODES.SHARED.value) && 
                    dtypef.value !== paramtype.value)
                    e.type = EDGES.REMOTED;
                else
                    e.type = EDGES.DATA;
            })

            calldeps.map(function (n) {
                 n.getOutEdges(EDGES.CALL).concat(n.getOutEdges(EDGES.REMOTEC))
                  .map( function (e) {
                    var dtypet = e.to.getdtype(true),
                        dtypef = e.from.getdtype(true);
                    if(dtypef && dtypet) {
                        if(dtypef.value === DNODES.SHARED.value ||
                           dtypet.value === DNODES.SHARED.value) 
                              e.type = EDGES.CALL;
                        else if (dtypef.value !== dtypet.value) 
                              e.type = EDGES.REMOTEC;
                        else 
                           e.type =  EDGES.CALL;
                    }
                });

            })
        })
    }

    /* make PDG node out of an AST node:
     * graphs = object containing different graphs,
     * node   = AST node
     * upnode = direct 'upnode' of ent node, e.g. 'return x'-node for the 'x'-node
     */
    var makePDGNode = function (graphs, node, upnode) {
        var PDG = graphs.PDG,
            jtc = graphs.JTC,
            parsetype = node.type,
            pdgnode;

        if (node.leadingComment) {
            if (Comments.isGeneratedAnnotated(node.leadingComment) && 
                !(Aux.isCallExp(node) || Aux.isExpStm(node) && Aux.isCallExp(node.expression)))
                return;
            Comments.handleBeforeComment(node.leadingComment, node)
        }

        switch (parsetype) {
            case 'Program':
                pdgnode = handleProgram(graphs, node);
                break;
            case 'FunctionDeclaration': 
                pdgnode = handleDeclarator(graphs, node, upnode);
                break;
            case 'VariableDeclaration':
                pdgnode = handleDeclarator(graphs, node, upnode);
                break;
            case 'FunctionExpression' :
                pdgnode = handleDeclarator(graphs, node, upnode);
                break;
            case 'BlockStatement' :
                pdgnode = handleBlockStatement(graphs, node, upnode);
                break;
            case 'IfStatement' :
                pdgnode = handleIfStatement(graphs, node, upnode);
                break;
            case 'ForStatement' :
                pdgnode = handleForStatement(graphs, node, upnode);
                break;
            case 'ForInStatement' :
                pdgnode = handleForInStatement(graphs, node, upnode);
                break;
            case 'Identifier' :
                pdgnode = handleIdentifier(graphs, node, upnode);
                break;
            case 'ExpressionStatement' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'BinaryExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'UpdateExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'Literal' :
                pdgnode = handleLiteral(graphs, node, upnode);
                break;
            case 'CallExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'AssignmentExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'ArrayExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'ObjectExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'MemberExpression' :
                pdgnode = handleMemberExpression(graphs, node, upnode);
                break;
            case 'Property' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'ReturnStatement' :
                pdgnode = handleReturnStatement(graphs, node, upnode);
                break;
            case 'ThisExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'NewExpression' :
                pdgnode = handleExpressionStatement(graphs, node, upnode);
                break;
            case 'ThrowStatement' :
                pdgnode = handleThrowStatement(graphs, node, upnode);
                break;
            case 'TryStatement' :
                pdgnode = handleTryStatement(graphs, node, upnode);
                break;
            case 'CatchClause' :
                pdgnode = handleCatchClause(graphs, node, upnode);
                break;
        }


        if (pdgnode && node.leadingComment) {
            Comments.handleAfterComment(node.leadingComment, pdgnode)
        }

        return pdgnode
    }


    /* Graph */
    function ASTToPDGMap () {
        this._nodes = HashMap.empty(131);
        this.listeners = {};
    }

    ASTToPDGMap.prototype.putNodes = function (AstNode, PDGNode) {
        this._nodes = this._nodes.put(AstNode,PDGNode);
    }

    ASTToPDGMap.prototype.addNodes = function (AstNode, PDGNode) {
        var prev = this._nodes.get(AstNode, ArraySet.empty()),
            add  = prev ?  prev.concat(PDGNode) : [PDGNode];
        this._nodes = this._nodes.put(AstNode, add);
        if (this.listeners[AstNode])
            this.listeners[AstNode].map(function (listener) {
                listener(PDGNode)
            })
    }

    ASTToPDGMap.prototype.getNode = function (AstNode) {
        var emptySet = ArraySet.empty(),
            res      = this._nodes.get(AstNode, emptySet);
        return res;
    }

    ASTToPDGMap.prototype.isPrimitive = function (callname, object) {
        return this.primitives.indexOf(callname) >= 0 || 
               isPrimitive(callname) ||
               (object ? this.primitives.indexOf(object.name) >= 0 : false);
    }

    ASTToPDGMap.prototype.installListener = function (AstNode, listener) {
        if (this.listeners[AstNode])
            this.listeners[AstNode].push(listener)
        else 
            this.listeners[AstNode] = [listener]
    }

    ASTToPDGMap.prototype.removeListener = function (AstNode) {
        if (this.listeners[AstNode])
            this.listeners[AstNode] = [];   
    }

    function Graphs (AST, src, primitives) {
        this.AST            = AST;
        this.PDG            = new PDG();
        this.ATP            = new ASTToPDGMap();
        this.src            = src;
        this.ATP.primitives = primitives;
    }

    /* Create the program dependency graph */
    start = function (graphs) {
        makePDGNode(graphs, graphs.AST);
    }

    module.start = start;
    module.Graphs = Graphs;
    return module;

})();


if (typeof module !== 'undefined' && module.exports != null) {
    var pdg_edge        = require('./pdg/edge.js');
    var EDGES           = pdg_edge.EDGES;
    var PDG_Edge        = pdg_edge.PDG_Edge;
    var Parameter_Edge  = Parameter_Edge;

    var node            = require('./pdg/node.js');
    var PDG_Node        = node.PDG_Node;
    var EntryNode       = node.EntryNode;
    var ObjectEntryNode = node.ObjectEntryNode;
    var CallNode        = node.CallNode;
    var StatementNode   = node.StatementNode;
    var FormalPNode     = node.FormalPNode;
    var ActualPNode     = node.ActualPNode;
    var ExitNode        = node.ExitNode;
    var DNODES          = node.DNODES;
    var ARITY           = node.ARITY;
    var DistributedNode = node.DistributedNode;


    var graph           = require('./pdg/graph.js');
    var PDG             = graph.PDG;

    var common          = require('../jipda-pdg/common.js');
    var HashMap         = common.HashMap;
    var ArraySet        = common.ArraySet;
    var Aux = require('./aux.js').Aux;
    var Ast = require('../jipda-pdg/ast.js').Ast;
    var Pdg = require('../jipda-pdg/pdg/pdg.js').Pdg;
    exports.Stip  = Stip;
}
