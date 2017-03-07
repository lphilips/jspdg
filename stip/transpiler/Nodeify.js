/****************************************************************
 *               TRANSFORMATIONS FOR NODE.JS                    *
 *                                                              *
 *      - wait.for library in combination with zerorpc          *
 *                                                              *
 *  Where possible, falafel.js is used for transformations      *
 *                                                              *
 ****************************************************************/


var JSify = require('./JSify');

var asyncs = require('../pre-analysis').asyncs;
var NodeParse = require('./Node_parse.js');
var CPSTransform = require('./CPS_transform.js');

var transformer = {};


function makeTransformer(transpiler) {
    switch (transpiler.options.asynccomm) {
        case 'callbacks':
            transpiler.parseUtils = {
                createRPC: function (call) {
                    var parsenode = Pdg.getCallExpression(call.parsenode);
                    if (Aux.isMemberExpression(parsenode.callee) &&
                        asyncs.indexOf(parsenode.callee.object.name) >= 0)
                        return JSParse.RPC;
                    else
                        return NodeParse.RPC;

                },
                createCallback: NodeParse.callback,
                shouldTransform: shouldTransform(transpiler.options),
                shouldTransformFunc: shouldTransformFunc(transpiler.options),
                createAsyncFunction: NodeParse.asyncFun,
                createAsyncForEach : NodeParse.createAsyncForEach,
                createCbCall: NodeParse.createCallCb,
                createRPCReturn: NodeParse.RPCReturn,
                createAsyncReplyCall: NodeParse.asyncReplyC
            };
            transpiler.transformCPS = CPSTransform;
    }
}


var shouldTransformFunc = function (options) {
    return function (entry) {
        return Analysis.isRemoteFunction(options, entry);
    }
}


var shouldTransform = function (options) {
    return function (call) {
        var parsenode = Pdg.getCallExpression(call.parsenode);
        if (call.primitive) {
            return false;
        }
        else if (Aux.isMemberExpression(parsenode.callee) &&
            asyncs.indexOf(parsenode.callee.object.name) >= 0)
            return true;

        else if (Analysis.isRemoteCall(options, call)) {
            return (call.isClientNode() || (call.isServerNode() &&
            call.arity && arityEquals(call.arity, ARITY.ONE)))
        }
    }
}

var shouldTransformPrimitive = function (parsenode, pdgnode) {
    var pdgnodes = graphs.ATP.getNode(parsenode);
    var res = false;
    if (pdgnode) {
        return pdgnode.parsenode.leadingComment &&
            Comments.isBlockingAnnotated(pdgnode.parsenode.leadingComment)
    }
    pdgnodes.forEach(function (pdgnode) {
        if (!res)
           res = pdgnode.parsenode.leadingComment &&
                Comments.isBlockingAnnotated(pdgnode.parsenode.leadingComment)
    })
    return res;

}

/* Variable Declaration */
function nodeifyVarDecl(transpiler) {
    var node = transpiler.node,
        entry = node.getOutNodes(EDGES.DATA)
            .filter(function (n) {
                return n.isEntryNode;
            }),
        call = node.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode;
            }),
        objects = node.getOutNodes(EDGES.DATA)
            .filter(function (n) {
                var parent;
                if (n.parsenode)
                    parent = Ast.parent(n.parsenode, transpiler.ast);
                return parent && n.isObjectEntry && !Aux.isRetStm(parent);
            }),
        transpiled;
    makeTransformer(transpiler);
    if (Aux.isVarDeclarator(node.parsenode))
        node.parsenode = NodeParse.createVarDecl(node.parsenode);

    /* Outgoing data dependency to entry node? -> Function Declaration */
    if (entry.length > 0) {
        entry = entry[0];
        /* always 1, if assigned later on, the new one would be attached to assignment node */
        transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, entry));
        if (Analysis.isRemoteFunction(transpiler.options, entry)) {
            /* set the name of the method */
            transpiled.method.setName(node.name);
            transpiler.methods.push(transpiled.method.parsenode);
            transpiled.method = false;
            transpiler.nodes = transpiled.nodes.remove(entry);
            transpiler.transpiledNode = undefined;
            return transpiler;
        }

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
                node.parsenode = Aux.clone(node.parsenode);
                node.parsenode.right = transpiled.transpiledNode;
            }
            transpiled.nodes = transpiled.nodes.remove(object);
            transpiler.nodes = transpiled.nodes;
        });
        if (call.length > 0) {
            call.map(function (call) {
                transpiler.nodes = transpiler.nodes.remove(call);
            })
        }

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

function transformBinaryExp(transpiler) {
    var node = transpiler.node,
        call = node.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode;
            }),
        transpiled;
    if (call.length > 0) {
        makeTransformer(transpiler);
        transpiled = transpiler.transformCPS.transformExp(transpiler);
        transpiler.nodes = transpiled[0];
        transpiler.transpiledNode = transpiled[1].parsenode;

        return transpiler;
    }
    transpiler.transpiledNode = node.parsenode;

    return transpiler;
}

transformer.transformBinaryExp = transformBinaryExp;

function transformUnaryExp(transpiler) {
    var node = transpiler.node,
        call = node.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode;
            }),
        transpiled;
    if (call.length > 0) {
        makeTransformer(transpiler);
        transpiled = transpiler.transformCPS.transformExp(transpiler);
        transpiler.nodes = transpiled[0];
        transpiler.transpiledNode = transpiled[1].parsenode;

        return transpiler;
    }
    transpiler.transpiledNode = node.parsenode;

    return transpiler;
}

transformer.transformUnaryExp = transformUnaryExp;

function transformVariableDeclData(transpiler) {
    var transpiled = nodeifyVarDecl(transpiler),
        node = transpiled.node,
        parsenode = node.parsenode,
        name,
        server,
        comment;
    makeTransformer(transpiler);


    if (node.parsenode.leadingComment) {
        comment = node.parsenode.leadingComment;
        /* @local */
        if (Comments.isTierOnlyAnnotated(comment)) {
            if (node.parsenode.declarations)
                node.parsenode.declarations.map(function (d) {
                    d.leadingComment = false;
                });
            return transpiled;
        }
        /* copy */
        else if (Comments.isCopyAnnotated(comment)) {
            if (node.parsenode.declarations)
                node.parsenode.declarations.map(function (d) {
                    d.leadingComment = false;
                })
            return transpiled;
        }

        /* @observable */
        else if (Comments.isObservableAnnotated(comment)) {
            if (Aux.isExpStm(parsenode) && Aux.isAssignmentExp(parsenode.expression)) {
                name = parsenode.expression.left.name;
                server = transpiler.options.tier == DNODES.SERVER;
                parsenode = Aux.clone(node.parsenode);
                parsenode.expression.right = NodeParse.createObservableObject('"' + name + '"', parsenode.expression.right, server);
                transpiled.transpiledNode = parsenode;
            }
            else if (node.parsenode.declarations)
                node.parsenode.declarations.map(function (d) {
                    d.leadingComment = false;
                })
            return transpiled;
        }

        /* @replicated */
        else if (Comments.isReplicatedAnnotated(comment)) {
            if (Aux.isExpStm(parsenode) && Aux.isAssignmentExp(parsenode.expression)) {
                name = parsenode.expression.left.name;
                server = transpiler.options.tier == DNODES.SERVER;
                parsenode = Aux.clone(node.parsenode);
                parsenode.expression.right = NodeParse.createReplicatedObject('"' + name + '"', parsenode.expression.right, server);
                transpiled.transpiledNode = parsenode;
            }
            else if (node.parsenode.declarations)
                node.parsenode.declarations.map(function (d) {
                    d.leadingComment = false;
                })
            return transpiled;
        }
    }


    return transpiled;
}

transformer.transformVariableDecl = transformVariableDeclData;
transformer.transformAssignmentExp = transformVariableDeclData;


/* Function expression */
function nodeifyFunExp(transpiler) {
    /* Formal parameters */
    var node = transpiler.node,
        form_ins = node.getFormalIn(),
        form_outs = node.getFormalOut(),
        parsenode = node.parsenode,
        localparsenode = Aux.clone(node.parsenode),
        params = parsenode.params,
        parent = Ast.parent(parsenode, transpiler.ast),
        transpiledNode, transpiled;


    makeTransformer(transpiler);
    if (node.isObjectEntry || node.isConstructor) {
        return nodeifyFunConstructor(transpiler);
    }


    /* recheck the calls. This is because anonymous generated functions that are in a slice
     that did not have a tier at the time of construction, won't have a registered call */
    if (node.parsenode.generated) {
        if (node.isServerNode())
            node.serverCallsGen = 1;
        if (node.isClientNode())
            node.clientCallsGen = 1;
    }

    /* Formal in parameters */
    if (form_ins.length > 0) {
        /* Remove parameters that are not in nodes */
        for (var i = 0; i < form_ins.length; i++) {
            var fp = form_ins[i],
                p = params[i];
            if (!nodesContains(transpiler.nodes, fp)) {
                params.splice(i, 1);
            }
            transpiler.nodes = transpiler.nodes.remove(fp);
        }
        parsenode.params = params;
    }


    /* Formal out parameters */
    form_outs.map(function (f_out) {
        transpiler.nodes = transpiler.nodes.remove(f_out);
    });

    /* Body */
    var localbody = [],
        remotebody = [],
        bodynodes = node.getOutEdges(EDGES.CONTROL).filter(function (e) {
            return !e.to.isFormalNode; //e.to.isStatementNode || e.to.isCallNode;
        }).map(function (e) {
            return e.to;
        }).sort(function (n1, n2) {
            return n1.cnt - n2.cnt;
        });

        /* nodeify every body node */
        bodynodes.map(function (n) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, n));
            if (nodesContains(transpiler.nodes, n)) {
                remotebody = remotebody.concat(transpiled.getTransformed());
                /* Separate localbody from exposed method body */
                if (transpiled.localTranspiledNode)
                    localbody.push(transpiled.localTranspiledNode);
                else if (!transpiled.transpiledNode.__transformed)
                    localbody.push(Aux.clone(n.parsenode));
                else if (Aux.isRetStm(n.parsenode) && !transpiled.transpiledNode.__transformed)
                    localbody.push(Aux.clone(n.parsenode));
                else
                    localbody = localbody.concat(transpiled.getTransformed());
            }
            transpiler.nodes = transpiled.nodes.remove(n);
            transpiled.closeupNode = transpiled.setupNode = [];
            Transpiler.copySetups(transpiled, transpiler)
        });


    if (node.parsenode.generated && shouldTransformPrimitive(node.parsenode._generatedFor)) {
        transpiler.nodes = transpiler.nodes.remove(node);
        parsenode.body.body = remotebody;
        return transpiler.transformCPS.transformGeneratedFunction(transpiler)
    }

    transpiler.nodes = transpiler.nodes.remove(node);
    localparsenode.body.body = localbody;
    parsenode.body.body = remotebody;
    transpiledNode = localparsenode;

    /* CASE 2 : Server function that is called by client side +
     * CASE 5  : Client function that is called by server side */
    if (Analysis.isRemoteFunction(transpiler.options, node)) {
        transpiled = transpiler.transformCPS.transformFunction(transpiler);
        transpiler.method = transpiled[1];
        transpiler.transpiledNode = undefined;
        if (node.isServerNode()) {
            NodeParse.addRenameThisStm(transpiled[1]);
        }
    }

    if (Analysis.isLocalFunction(transpiler.options, node) ||
        node.ctype === DNODES.SHARED ||
        node.parsenode.generated) {
        transpiler.nodes = transpiler.nodes.remove(node);
        transpiler.transpiledNode = transpiledNode;
    }

    if (!(Aux.isVarDeclarator(parent) || Aux.isAssignmentExp(parent)) && transpiler.method.setName) {
        transpiler.method.setName(node.parsenode.id.name);
        transpiler.methods.push(transpiler.method.parsenode);
        transpiler.method = false;
    }

    return transpiler;
}

transformer.transformFunctionExp = nodeifyFunExp;
transformer.transformFunctionDecl = nodeifyFunExp;


function nodeifyFunConstructor(transpiler) {
    var node = transpiler.node,
        constructor = transpiler.node.isEntryNode ? transpiler.node : node.getOutNodes(EDGES.OBJMEMBER)
            .filter(function (n) {
                return n.isConstructor;
            })[0],
        properties = node.getOutNodes(EDGES.OBJMEMBER)
            .filter(function (n) {
                return !n.isConstructor;
            }),
        body = [],
        form_ins = constructor.getFormalIn(),
        form_outs = constructor.getFormalOut(),
        parsenode = Aux.clone(node.parsenode),
        params = parsenode.params,
        name = Aux.isFunDecl(parsenode) ? parsenode.id.name : false,
        comment = parsenode.leadingComment,
        server = transpiler.options.tier == DNODES.SERVER,
        transpiled;
    // Formal in parameters
    if (form_ins.length > 0) {
        // Remove parameters that are not in nodes
        for (var i = 0; i < form_ins.length; i++) {
            var fp = form_ins[i],
                p = params[i];
            if (!nodesContains(transpiler.nodes, fp)) {
                params.splice(i, 1);
            }
            transpiler.nodes = transpiler.nodes.remove(fp);
        }
        node.parsenode.params = params;
    }
    ;
    // Formal out parameters
    form_outs.map(function (f_out) {
        transpiler.nodes = transpiler.nodes.remove(f_out);
    })

    properties.map(function (property) {
        if (nodesContains(transpiler.nodes, property)) {
            transpiled = Transpiler.transpile(Transpiler.copyTranspileObject(transpiler, property));
            body.push(transpiled.transpiledNode);
            transpiler.nodes = transpiled.nodes.remove(property);
        }
    });
    parsenode.body.body = body;
    transpiler.nodes = transpiler.nodes.remove(node);
    transpiler.nodes = transpiler.nodes.remove(constructor);
    transpiler.transpiledNode = parsenode;

    if (comment && (Comments.isReplicatedAnnotated(comment) || Comments.isObservableAnnotated(comment))) {
        var newExp, obj;
        newExp = escodegen.generate(NodeParse.createNewExp(name, params));
        if (Comments.isReplicatedAnnotated(comment))
            obj = NodeParse.createReplicatedObject('id', newExp, server);
        if (Comments.isObservableAnnotated(comment))
            obj = NodeParse.createObservableObject('id', newExp, server);
        var returnStm = NodeParse.createReturnStm(obj);
        var clone = Aux.clone(node.parsenode);
        clone.params = [NodeParse.createIdentifier('id')].concat(params);
        clone.body.body = [node.parsenode];
        clone.body.body.push(returnStm);
        transpiler.transpiledNode = clone;
    }


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
function nodeifyCallExp(transpiler) {
    var node = transpiler.node,
        actual_ins = node.getActualIn(),
        actual_outs = node.getActualOut(),
        parent = Ast.parent(node.parsenode, transpiler.ast),
        callargs = 0,
        arguments,
        transpiled;
    makeTransformer(transpiler);

    arguments = actual_ins.filter(function (a_in) {
        return nodesContains(transpiler.nodes, a_in);
    }).map(function (a_in) {
        var transpiled = Transpiler.copyTranspileObject(transpiler, a_in);
        transpiled = Transpiler.transpile(transpiled);
        transpiler.nodes = transpiled.nodes;
        transpiler.nodes = transpiler.nodes.remove(a_in);
        return transpiled.transpiledNode;
    });

    actual_ins.map(function (a_in) {
        transpiler.nodes = transpiler.nodes.remove(a_in);
        a_in.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode
            })
            .map(function (n) {
                callargs++;
                transpiler.nodes = transpiler.nodes.remove(n);
            });
        a_in.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return !n.isCallNode
            })
            .map(function (n) {
                transpiler.nodes = transpiler.nodes.remove(n);
            })
    });
    actual_outs.map(function (a_out) {
        transpiler.nodes = transpiler.nodes.remove(a_out);
    });


    if (node.primitive) {
        if (node.parsenode.leadingComment && Comments.isBlockingAnnotated(node.parsenode.leadingComment)) {
            return transpiler.transformCPS.transformPrimitive(transpiler);
        }
         else {
            transpiler.transpiledNode = Aux.isExpStm(node.parsenode) ? node.parsenode : parent;
            transpiler.transpiledNode.arguments = arguments;
            return transpiler;
        }

    }

    /* No entryNode found : can happen with library functions.
     Just return call in this case */
    // if (!entryNode) {
    //   if (Aux.isExpStm(parent) && Aux.isCallExp(parent.expression)) {
    //     parent = Aux.clone(parent);
    //    transpiler.transpiledNode = parent;
    //}
    //else {
    //  transpiler.transpiledNode = node.parsenode;
    //}
    //return transpiler;
    //}


    if (Analysis.isLocalCall(transpiler.options, node) ||
        (node.parsenode.leadingComment && Comments.isBlockingAnnotated(node.parsenode.leadingComment))) {
        transpiled = transpiler.transformCPS.transformCall(transpiler, false, parent);
        transpiler.nodes = transpiled[0];
        transpiler.transpiledNode = transpiled[1].parsenode;

        return transpiler;
    }

    else if (Analysis.isRemoteCall(transpiler.options, node)) {
        transpiled = transpiler.transformCPS.transformCall(transpiler, false, parent);
        if (node.isClientNode()) {
            transpiler.nodes = transpiled[0];
            transpiler.transpiledNode = transpiled[1].parsenode;
            transpiler.transpiledNode.__transformed = true;
            return transpiler;
        }
        if (node.isServerNode()) {
            if ((node.arity && arityEquals(node.arity, ARITY.ONE))) {
                transpiled = transpiler.transformCPS.transformReplyCall(node, transpiler.nodes, transpiler);
                NodeParse.transformCPSToReply(transpiled[1]);
                transpiler.transpiledNode = transpiled[1].parsenode;
                transpiled = NodeParse.createBroadcast();
                transpiled.setName('"' + node.name + '"');
                transpiled.addArgs(Pdg.getCallExpression(node.parsenode).arguments)
                transpiler.localTranspiledNode = transpiled.parsenode;
                transpiler.transpiledNode.__transformed = true;
                return transpiler;
            }
            else {
                transpiled = NodeParse.createBroadcast();
                transpiled.setName('"' + node.name + '"');
                transpiled.addArgs(Pdg.getCallExpression(node.parsenode).arguments);
            }
            if (node.parsenode.handlersAsync && node.parsenode.handlersAsync.length != 0) {
                var handlerCtr = node.parsenode.handlersAsync.length,
                    lastHandler = node.parsenode.handlersAsync[handlerCtr - 1];

                if (transpiled.setObjectName) {
                    var proxyName = Handler.makeProxyName(lastHandler.getId());
                    transpiled.setObjectName(proxyName);
                }

                lastHandler.incRpcCount();
            }
            transpiler.transpiledNode = transpiled.parsenode;
            transpiler.transpiledNode.__transformed = true;

            return transpiler;
        }
    }


    if (Aux.isExpStm(parent)) {
        transpiler.transpiledNode = parent;
    } else {
        transpiler.transpiledNode = node.parsenode;
    }
    transpiler.nodes = transpiler.nodes.remove(node);

    return transpiler;
}

transformer.transformCallExp = nodeifyCallExp;


/* Return Statement */
function nodeifyReturnStatement(transpiler) {
    var node = transpiler.node,
        calls = node.getOutNodes(EDGES.CONTROL)
            .filter(function (n) {
                return n.isCallNode;
            }),
        sToC = calls.filter(function (call) {
            call.parsenode.leadingComment = node.parsenode.leadingComment;
            return call.isServerNode() && Analysis.isRemoteCall(transpiler.options, call);
        }),
        remoteC = calls.filter(function (call) {
            return Analysis.isRemoteCall(transpiler.options, call);
        })
    if (sToC.length > 0) {
        var oldShouldTransform = transpiler.parseUtils.shouldTransform;
        transpiler.parseUtils.shouldTransform = function (call) {
            var found = false;
            sToC.map(function (c) {
                if (!found && c.equals(call))
                    found = true;
            })
            return found;
        }
        transpiled = transpiler.transformCPS.transformExp(transpiler);
        transpiler.nodes = transpiled[0];
        NodeParse.transformCPSToReply(transpiled[1]);
        transpiler.transpiledNode = transpiled[1].parsenode;
        transpiler.transpiledNode.__upnode = node.parsenode.__upnode;
        transpiler.transpiledNode.__transformed = true;
        transpiler.parseUtils.shouldTransform = oldShouldTransform;
        return transpiler;
    }
    else if (remoteC.length > 0) {
        transpiled = transpiler.transformCPS.transformExp(transpiler);
        transpiler.nodes = transpiled[0];
        transpiler.transpiledNode = transpiled[1].parsenode;
        transpiler.transpiledNode.__upnode = node.parsenode.__upnode;
        transpiler.transpiledNode.__transformed = true;
        return transpiler;
    }
    else {
        return JSify.transformReturnStm(transpiler);
    }
}

transformer.transformReturnStm = nodeifyReturnStatement;


/* If statement */
transformer.transformIfStm = JSify.transformIfStm;

/* For statement */
transformer.transformForStm = JSify.transformForStm;

transformer.transformArrayExpression = JSify.transformArrayExpression;


function nodeifyTryStm(transpiler) {
    var block = [],
        node = transpiler.node,
        blocknodes = node.getOutNodes(EDGES.CONTROL)
            .filter(function (node) {
                return !Aux.isCatchStm(node.parsenode)
            }),
        /* Nodes that are calls are have calls in them */
        callnodes = blocknodes.filter(function (n) {
            return Aux.hasCallStm(n)
        }),
        /* Get the actual calls */
        calls = callnodes.flatMap(function (cn) {
            if (cn.isCallNode)
                return [cn];
            else return cn.findCallNodes();
        }),
        catches = calls.flatMap(function (call) {
            return call.getOutNodes(EDGES.CONTROL)
                .filter(function (n) {
                    return !n.isExitNode &&
                        n.parsenode &&
                        Aux.isCatchStm(n.parsenode)
                })
        }),
        handler;

    blocknodes.map(function (node) {
        if (nodesContains(transpiler.nodes, node)) {
            var toTranspile = Transpiler.copyTranspileObject(transpiler, node);
            var blocknode = Transpiler.transpile(toTranspile);
            transpiler.nodes = blocknode.nodes.remove(node);
            block.push(blocknode.transpiledNode);
        }
    });

    catches.map(function (node) {
        if (nodesContains(transpiler.nodes, node)) {
            var toTranspile = Transpiler.copyTranspileObject(transpiler, node);
            var catchnode = Transpiler.transpile(toTranspile);
            handler = catchnode.transpiledNode;
            transpiler.nodes = catchnode.nodes.remove(node);
        }
    });
    node.parsenode.handler = handler;
    node.parsenode.block.body = block;

    //remote try-catch if all calls are remote
    var allRemotes = block.filter(function (node) {
            return node.callnode && Analysis.isRemoteCall(transpiler.options, node);
        }).length === block.length;

    if (allRemotes) {
        node.parsenode = block;
    }

    transpiler.nodes = transpiler.nodes.remove(node);
    transpiler.transpiledNode = node.parsenode;
    return transpiler;
}

/* Try Statement */
transformer.transformTryStm = nodeifyTryStm;

/* Catch Statement */
transformer.transformCatchClause = JSify.transformCatchClause;

/* Throw Statement */
transformer.transformThrowStm = JSify.transformThrowStm;


/* Block Statement */
transformer.transformBlockStm = JSify.transformBlockStm;


/* Object Expression */
transformer.transformObjectExp = JSify.transformObjectExp;


/* New Expression can be either an expression (call node)
 * or a new expression (inside other statement)   */
function transformNewExp(transpiler) {
    var transpiled = JSify.transformNewExp(transpiler);
    var objectentry = transpiler.node.getOutNodes().filter(function (n) {
        return n.isObjectEntry;
    })[0];
    var parent = transpiler.node.getInNodes(EDGES.DATA).filter(function (n) {
        return n.isStatementNode && Aux.isExpStm(n.parsenode) &&
            Aux.isAssignmentExp(n.parsenode.expression);
    });
    if (transpiler.node.isCallNode) {
        objectentry = transpiler.node.getOutNodes(EDGES.CALL).concat(transpiler.node.getOutNodes(EDGES.REMOTEC))[0];
    }
    var constrComment = objectentry ? objectentry.parsenode.leadingComment : false;
    if (Analysis.isRemoteData(transpiler.options, transpiler.node) ||
        (parent[0] && Analysis.isRemoteData(transpiler.options, parent[0])) ||
        (constrComment && (Comments.isObservableAnnotated(constrComment) || Comments.isReplicatedAnnotated(constrComment)))) {
        var firstArg;
        if (parent.length > 0)
            firstArg = NodeParse.createLiteral(parent[0].name);
        else
            firstArg = NodeParse.createLiteral(false);
        if (Aux.isExpStm(transpiled.transpiledNode))
            transpiled.transpiledNode.expression.arguments = [firstArg].concat(transpiled.transpiledNode.expression.arguments);
        else
            transpiled.transpiledNode.arguments = [firstArg].concat(transpiled.transpiledNode.arguments);
    }
    return transpiled;
}

transformer.transformNewExp = transformNewExp;


/* Object Property */
transformer.transformProperty = JSify.transformProperty;

/* Member expression */
transformer.transformMemberExpression = JSify.transformMemberExpression;

/* Update expression */
transformer.transformUpdateExp = JSify.transformUpdateExp;

function noTransformationDefined(transpiler) {
    transpiler.transpiledNode = false;
    return transpiler;
}

function noTransformation(transpiler) {
    transpiler.transpiledNode = transpiler.node.parsenode;
    return transpiler;
}

function transformActualParameter(transpiler) {
    transpiler.node.getOutNodes(EDGES.CONTROL)
        .map(function (n) {
            var transpiled = Transpiler.copyTranspileObject(transpiler, n);
            transpiled = Transpiler.transpile(transpiled);
            transpiler.nodes = transpiled.nodes;
            transpiler.nodes = transpiler.nodes.remove(n);
        });
    transpiler.transpiledNode = transpiler.node.parsenode;
    return transpiler;
}


transformer.transformActualParameter = transformActualParameter;
transformer.transformFormalParameter = noTransformationDefined;
transformer.transformExitNode = noTransformation;

function nodesContains(nodes, node, cps) {
    return nodes.filter(function (n) {
            return n.id === node.id;
        }).length > 0;
}


module.exports = transformer;
global.Nodeify = transformer;