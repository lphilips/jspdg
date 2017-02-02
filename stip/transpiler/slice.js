var CodeGenerator = (function () {

    var toreturn = {};

    var toCode = function (option, nodes, node, ast) {
        switch (option.target) {
            case 'normal':
                return Transpiler.transpile(Transpiler.createTranspileObject(node, nodes, ast, option, JSify, [], []));
            //return Meteorify.transpile(slicednodes, node, ast)
            case 'node.js':
                return Transpiler.transpile(Transpiler.createTranspileObject(node, nodes, ast, option, Nodeify, [], []));
            case 'redstone':
                return Transpiler.transpile(Transpiler.createTranspileObject(node, nodes, ast, option, Reactify, [], []));
        }
    }


    var addCloseUp = function (option, transpiled) {
        switch (option.target) {
            case 'redstone':
                if (option.tier === 'server')
                    transpiled.closeup = transpiled.closeup.concat(NodeParse.createServerCloseUp());
        }

        return transpiled;
    }

    var addSetUp = function (option, transpiled) {
        switch (option.target) {
            case 'node.js':
                if (option.imports.length > 0) {
                    option.imports.forEach(function (lib) {
                        transpiled.setup.push(NodeParse.createImport(lib));
                    })
                }
            case 'redstone':
                if (option.tier === 'client')
                    transpiled.setup = transpiled.setup.concat(NodeParse.createClient());
                else {
                    transpiled.setup = transpiled.setup.concat(NodeParse.createServer());
                    if (option.imports.length > 0) {
                        option.imports.forEach(function (lib) {
                            transpiled.setup.push(NodeParse.createImport(lib));
                        })
                    }
                }

        }
        if (option.asynccomm === 'callbacks' && option.target === 'node.js') {
            var handlers = [],
                proxies = [],
                totalRpcCount = 0,
                removedHandlers = {},
                definedHandlers;

            Handler.Generate.init();

            //filter out handlers that are not defined
            definedHandlers = option.failurehandlers.reduce(
                function (previousValue, current) {

                    if (removedHandlers[current.getParent()])
                        current.setParent(removedHandlers[current.getParent()]);
                    var parent = current.getParent();

                    if (current.getRpcCount() == 0 && !Handler.Generate.handlerDefinition(current)) {
                        removedHandlers[current.getUniqueName()] = parent;
                    } else {
                        previousValue.push(current);
                    }

                    return previousValue;
                }, []);

            definedHandlers.map(function (el) {

                totalRpcCount = totalRpcCount + el.getRpcCount();
                handlers = handlers.concat(Handler.Generate.handlerNode(el));

                //we only need a leaf if there are calls to this handler.
                if (el.getRpcCount() > 0) {
                    var proxyName = Handler.makeProxyName(el.getId());
                    proxies = proxies.concat(Handler.Generate.proxyDefinition(proxyName, el.getLeafName()));
                }
            });

            //only add handlers if there are RPCs
            if (totalRpcCount > 0) {
                transpiled.setup = transpiled.setup.concat(Handler.Generate.proxySetup(option.tier));

                handlers.map(function (el) {
                    transpiled.setup = transpiled.setup.concat(el);
                });

                proxies.map(function (el) {
                    transpiled.setup = transpiled.setup.concat(el)
                });
            }
        }

        return transpiled;
    }

    /*
     * Transformation needed on the body code
     */
    var transformBody = function (option, transpiled, body, methods) {
        switch (option.target) {
            case 'node.js':
                var methodsDecl;
                var methodsProp;
                if (option.tier === 'client') {
                    methodsDecl = NodeParse.methodsClient();
                    methodsProp = methodsDecl.expression.arguments[0].properties
                    methodsDecl.expression.arguments[0].properties = methodsProp.concat(methods);
                    /* Add cloud types declarations */
                    for (var name in  transpiled.cloudtypes) {
                        if (transpiled.cloudtypes.hasOwnProperty(name)) {
                            var cloudtype = transpiled.cloudtypes[name];
                            body = [cloudtype.declarationC].concat(body);
                        }
                    }

                    return body.concat(methodsDecl);

                }
                else {
                    /* server rpcs + cloudtypes are added */
                    methodsDecl = NodeParse.methodsServer();
                    methodsProp = methodsDecl.expression.arguments[0].properties;
                    methodsDecl.expression.arguments[0].properties = methodsProp.concat(methods);

                    /* Declare cloud types + add their declarations as well (for use on server side as well) */
                    for (var name in transpiled.cloudtypes) {
                        if (transpiled.cloudtypes.hasOwnProperty(name)) {
                            var cloudtype = transpiled.cloudtypes[name];
                            body = [cloudtype.declarationS].concat(cloudtype.declarationC).concat(body);
                        }
                    }

                    return body.concat(methodsDecl);
                }
            case 'meteor':
                if (option.tier === 'server') {
                    /* remote procedure definitions are added */
                    var methodsDecl = MeteorParse.methodsServer();
                    methodsDecl.expression.arguments = methods;

                    return body.concat(methodsDecl);
                }
                if (option.tier === 'client') {
                    /* remote procedure definitions are added */
                    var methodsDecl = MeteorParse.methodsClient();
                    methodsDecl.expression.arguments = methods;

                    return body.concat(methodsDecl);
                }
        }
        return body;
    }

    /*
     * Starting from a set of nodes, create the corresponding transformed code.
     * This function also adds header and footer code, depending on the choosen output
     */
    var constructProgram = function (nodes, option, ast) {
        var createProgram = function (body) {
                return {
                    'type': 'Program',
                    'body': body ? body : []
                };
            },
            program = createProgram(),
            nosetup = createProgram(),
            methods = [],
            transpiled;

        option.failurehandlers = [];

        nodes.map(function (node) {
            if (node.parsenode && node.parsenode.handlersAsync)
                node.parsenode.handlersAsync.map(function (el) {
                    if (option.failurehandlers.indexOf(el) === -1) {
                        option.failurehandlers.push(el)
                    }
                });
        });

        while (nodes.length > 0) {
            var n = nodes.shift();
            if (n.parsenode && !(Aux.isBlockStm(n.parsenode) &&
                (Comments.isSliceAnnotated(n.parsenode) ||
                Comments.isClientorServerAnnotated(n.parsenode)))) {

                transpiled = toCode(option, nodes, n, ast);
                if (transpiled.transpiledNode) {
                    if (transpiled.transpiledNode.leadingComment &&
                        Comments.isBlockingAnnotated(transpiled.transpiledNode.leadingComment)) {
                        program.body = program.body
                            .concat(transpiled.setupNode)
                            .concat(transpiled.transpiledNode.body)
                            .concat(transpiled.closeupNode);
                    }
                    else
                        program.body = program.body.concat(transpiled.getTransformed());
                }
                nodes = transpiled.nodes;
                nodes.remove(n);
                methods = methods.concat(transpiled.methods);
            }

        }


        addSetUp(option, transpiled);
        addCloseUp(option, transpiled);
        program.body = transformBody(option, transpiled, program.body, methods);
        nosetup.body = program.body;
        program.body = transpiled.setup.concat(program.body).concat(transpiled.closeup);
        //console.log(program);


        return {
            program: program,
            setup: createProgram(transpiled.setup),
            nosetup: nosetup,
            warnings: transpiled.warnings
        }
    }


    var prepareNodes = function (clientnodes, servernodes, graphs, options) {
        var cnodes = clientnodes.slice(0),
            snodes = servernodes.slice(0),
            removes = [],
            copydeclarations = [],
            assumes = graphs.assumes,
            assumesnames = assumes.map(function (ass) {
                if (ass.id)
                    return ass.id.name.trim();
                else
                    return ass.declarations[0].id.name.trim()
            }),
            sortFunction = function (n1, n2) {
                return n1.cnt - n2.cnt;
            },
            filterFunction = function (pdgnode) {
                if (pdgnode.parsenode)
                    if (Aux.isFunDecl(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false;
                    }
                    else if (Aux.isVarDeclarator(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false;
                    }
                    else
                        return true;
                else
                    return true;
            },
            remove = function (node) {
                cnodes = cnodes.remove(node);
                snodes = snodes.remove(node);
                if (node.isEntryNode) {
                    var params = node.getFormalIn().concat(node.getFormalOut()),
                        body = node.getBody();
                    params.map(function (param) {
                        cnodes = cnodes.remove(param);
                        snodes = snodes.remove(param)
                    });
                    body.map(function (bodynode) {
                        remove(bodynode);
                    });
                }
                else if (node.isStatementNode) {
                    node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {
                            remove(e.to)
                        });
                    node.getOutEdges(EDGES.DATA)
                        .filter(function (e) {
                            return e.to.isObjectEntry ||
                                e.to.isEntryNode
                        })
                        .map(function (e) {
                            remove(e.to);
                        });
                }
                else if (node.isObjectEntry) {
                    node.getOutEdges(EDGES.OBJMEMBER).map(function (e) {
                        remove(e.to)
                    });
                }
            };
        snodes.sort(sortFunction);
        cnodes.sort(sortFunction);
        /* Filter out nodes that were added by the assumes statement, or default global variables */
        cnodes = cnodes.filter(filterFunction);
        snodes = snodes.filter(filterFunction);
        removes.map(function (node) {
            remove(node);
        });

        /* Copy @copy, @observable, @replicated declarations on server tier to client tier.
         *  Replicated and observable will be transformed during transpilation */
        servernodes.map(function (node) {
            function addControlDepRec(n) {
                n.getOutNodes(EDGES.CONTROL).map(function (n) {
                    copydeclarations.push(n);
                    addControlDepRec(n);
                })
            }

            if (node.isStatementNode) {

                if (Analysis.isRemoteData(options, node)) {

                    if (options.analysis && Aux.isExpStm(node.parsenode)) {
                        var callsTo = node.getOutNodes(EDGES.CONTROL).filter(function (n) {
                            return n.isCallNode
                        }).flatMap(function (n) {
                            return n.getOutNodes(EDGES.CALL);
                        }).filter(function (n) {
                            return n.isEntryNode && n.isConstructor && n.parsenode.leadingComment &&
                                (Comments.isObservableAnnotated(n.parsenode.leadingComment) ||
                                Comments.isReplicatedAnnotated(n.parsenode.leadingComment));
                        });
                        /* Push declaration node as well */
                        var decl = node.getInNodes(EDGES.DATA).filter(function (n) {
                            return n.isStatementNode && n.parsenode &&
                                Aux.isVarDeclarator(n.parsenode)
                        })[0];
                        if (decl && callsTo.length > 0)
                            copydeclarations.push(decl);
                    }

                    copydeclarations.push(node);
                    addControlDepRec(node);
                }


                // if (declarationcomment && (Comments.isCopyAnnotated(declarationcomment) ||
                //     Comments.isObservableAnnotated(declarationcomment) || Comments.isReplicatedAnnotated(declarationcomment))) {
                //     copydeclarations.push(node);
                // }
                // if (Aux.isExpStm(parsenode) && callsTo.length > 0) {
                //     /* Push declaration node as well */
                //     var decl = node.getInNodes(EDGES.DATA).filter(function (n) {
                //         return n.isStatementNode && n.parsenode &&
                //             Aux.isVarDeclarator(n.parsenode)
                //     })[0];
                //     if (decl)
                //         copydeclarations.push(decl);
                //     copydeclarations.push(node);
                // }

            }

            if (node.isEntryNode && node.parsenode && node.parsenode.leadingComment &&
                    node.isConstructor &&
                (Comments.isObservableAnnotated(node.parsenode.leadingComment) || Comments.isReplicatedAnnotated(node.parsenode.leadingComment))) {
                copydeclarations.push(node);
                copydeclarations = copydeclarations.concat(node.getFormalIn()).concat(node.getFormalOut());
            }
        });
        cnodes = copydeclarations.concat(cnodes);

        return [cnodes, snodes];
    }


    toreturn.transpile = constructProgram;
    toreturn.prepareNodes = prepareNodes;

    if (typeof module !== 'undefined' && module.exports != null) {
        Nodeify = require('./Nodeify.js').Nodeify;
        JSify = require('./JSify.js').JSify;
        Reactify = require('./Reactify.js').Reactify;
        Handler = require('../handler.js').Handler;
        Transpiler = require('./transpiler.js').Transpiler;
        exports.CodeGenerator = toreturn;
    }

    return toreturn;


})
();


