/*
 * Works on the level of esprima nodes
 */


var toreturn = {};

var beforeHandlers = [];
var afterHandlers = [];


var component_annotation = "@slice";
var client_annotation = "@client";
var server_annotation = "@server";
var assumes_annotation = "@assumes";

var remotefunction_annotation = "@remoteFunction";
var remotecall_annotation = "@remoteCall";
var remotedata_annotation = "@remoteData";
var localcall_annotation = "@localCall";
var localfunction_annotation = "@localFunction";
var localdata_annotation = "@localData";


var use_handler_annotation = "@useHandler";
var define_handler_annotation = "@defineHandlers";

var reply_annotation = "@reply";
var broadcast_annotation = "@broadcast";
var blocking_annotation = "@blocking";
var shared_annotation = "@shared";
var generated_annotation = "@generated";
var placement_annotation = "@tier";
var config_annotation = "@config";
var ui_annotation = "@ui";
var css_annotation = "@css";
var import_annotation = "@require";

var dataobservable_annotation = "@observable";
var datarepl_annotation = "@replicate";
var dataread_annotation = "@local";
var datacopy_annotation = "@copy";


// Client annotations is @client in comment
var isClientAnnotated = function (comment) {
    return comment.value.indexOf(client_annotation) != -1;
};

// Server annotations is @server in comment
var isServerAnnotated = function (comment) {
    return comment.value.indexOf(server_annotation) != -1;
};

var isClientorServerAnnotated = function (node) {
    return node.leadingComment &&
        Aux.isBlockStm(node) &&
        (isClientAnnotated(node.leadingComment) ||
        isServerAnnotated(node.leadingComment));
};

var isUiAnnotated = function (node) {
    return node.leadingComment &&
        Aux.isBlockStm(node) &&
        node.leadingComment.value.indexOf(css_annotation) != -1;
};

var isCssAnnotated = function (node) {
    return node.leadingComment &&
        Aux.isBlockStm(node) &&
        node.leadingComment.value.indexOf(css_annotation) != -1;
}

var isImportAnnotated = function (comment) {
    return comment.value.indexOf(import_annotation) != -1;
}

function getImports (comment) {
    var index = comment.value.indexOf(import_annotation);
    var sliced = comment.value.slice(index + import_annotation.length).trim();
    var end = sliced.indexOf('@') > -1 ? sliced.indexOf('@') : sliced.length;
    var imports = sliced.slice(0, end).split(/,/);
    return imports.map(function (imp) {
        return imp.trim();
    })
}

var isRemoteFunctionAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(remotefunction_annotation) != -1;
}

var isRemoteCallAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(remotecall_annotation) != -1;
};

var isRemoteDataAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(remotedata_annotation) != -1;
};

var isLocalFunctionAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(localfunction_annotation) != -1;
};

var isLocalCallAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(localcall_annotation) != -1;
};

var isLocalDataAnnotated = function (node) {
    return node.leadingComment &&
        node.leadingComment.value.indexOf(localdata_annotation) != -1;
};

var isAssumesAnnotated = function (string) {
    return string.indexOf(assumes_annotation) != -1;
};

var isUseHandlerAnnotated = function (comment) {
    return comment.value.indexOf(use_handler_annotation) != -1;
};

var isDefineHandlerAnnotated = function (node) {
    return node.leadingComment && node.leadingComment.value.indexOf(define_handler_annotation) != -1;
};

var isBroadcastAnnotated = function (comment) {
    return comment.value.indexOf(broadcast_annotation) != -1;
};

var isBlockingAnnotated = function (comment) {
    return comment.value.indexOf(blocking_annotation) != -1;
};

var isReplyAnnotated = function (comment) {
    return comment.value.indexOf(reply_annotation) != -1;
};

var isSharedAnnotated = function (comment) {
    return comment.value.indexOf(shared_annotation) != -1;
};

var isGeneratedAnnotated = function (comment) {
    return comment && comment.value.indexOf(generated_annotation) != -1;
};

var isTierAnnotated = function (node) {
    return node.leadingComment &&
        Aux.isBlockStm(node) &&
        node.leadingComment.value.indexOf(placement_annotation) != -1;
};

var isObservableAnnotated = function (comment) {
    return comment.value.indexOf(dataobservable_annotation) != -1;
};

var isReplicatedAnnotated = function (comment) {
    return comment.value.indexOf(datarepl_annotation) != -1;
};

var isTierOnlyAnnotated = function (comment) {
    return comment.value.indexOf(dataread_annotation) != -1;
};

var isCopyAnnotated = function (comment) {
    return comment.value.indexOf(datacopy_annotation) != -1;
};

var getTierName = function (comment) {
    var annotation = placement_annotation + " ";
    var idx = comment.value.indexOf(annotation);
    var tier = comment.value.slice(idx + placement_annotation.length);
    tier = tier.replace(/\s+/g, '');
    return tier;
};

var isFunctionalityAnnotated = function (node) {
    return node.leadingComment &&
        Aux.isBlockStm(node) &&
        node.leadingComment.value.indexOf(component_annotation) != -1;
};

var getFunctionalityName = function (comment) {
    var idxC = comment.value.indexOf(component_annotation);
    var idxT = comment.value.indexOf(placement_annotation);
    var tag;
    if (idxT > -1) {
        tag = comment.value.slice(idxC + component_annotation.length, idxT);
    }
    else {
        tag = comment.value.slice(idxC + component_annotation.length);
    }
    if (tag.indexOf(' @')> -1) {
        tag = tag.slice(0, tag.indexOf(' @'));
    }
    tag = tag.replace(/\s+/g, '');
    return tag;
};

var isConfigAnnotated = function (comment) {
    return comment.value.indexOf(config_annotation) != -1;
};

var getConfigPlacements = function (comment) {
    var index = comment.value.indexOf(config_annotation);
    var sliced = comment.value.slice(index + config_annotation.length).trim();
    var end = sliced.indexOf('@') > -1 ? sliced.indexOf('@') : sliced.length;
    var placements = sliced.slice(0, end).split(/,/);
    var config = {};
    placements.forEach(function (placement) {
        var nametier = placement.split(/:/).map(function (s) {
            return s.trim()
        });
        config[nametier[0]] = nametier[1];
    });
    return config;
};

var configHasServer = function (comment) {
    var placements;
    var configs;
    if (isConfigAnnotated(comment)) {
        configs = getConfigPlacements(comments);
        placements = Object.keys(function (k){return configs[k]});
        return placements.indexOf("server") > -1;
    }
    return false;
};

var configHasClient = function (comment) {
    var placements;
    var configs;
    if (isConfigAnnotated(comment)) {
        configs = getConfigPlacements(comments);
        placements = Object.keys(function (k){return configs[k]});
        return placements.indexOf("client") > -1;
    }
    return false;
};

var registerBeforeHandler = function (handler) {
    beforeHandlers.push(handler)
};

var registerAfterHandler = function (handler) {
    afterHandlers.push(handler)
};

/*  Before handlers are called right before the parsenode is turned into a pdg node */
var handleBeforeComment = function (comment, parsenode, upnode) {
    beforeHandlers.map(function (handler) {
        handler(comment, parsenode, upnode)
    })
};

var handleAfterComment = function (comment, pdgNode, upnode) {
    afterHandlers.map(function (handler) {
        handler(comment, pdgNode, upnode)
    })
};

var handleBlockComment = function (comment, pdgNodes) {
    pdgNodes.map(function (pdgNode) {
        if (Aux.isBlockStm(pdgNode.parsenode)) {
            var upnode = pdgNode.getInNodes(EDGES.CONTROL)[0];
            var cnode, tag, tier;
            /* @client annotation */
            if (isClientAnnotated(comment)) {
                graphs.PDG.addClientStm(pdgNode);
                fnode = graphs.PDG.getFunctionalityNode(DNODES.CLIENT);

                insertNode(upnode, pdgNode, fnode);
            }
            /* @server annotation */
            else if (isServerAnnotated(comment)) {
                graphs.PDG.addServerStm(pdgNode);
                fnode = graphs.PDG.getFunctionalityNode(DNODES.SERVER);
                upnode.removeEdgeOut(pdgNode, EDGES.CONTROL);
                pdgNode.removeEdgeIn(upnode, EDGES.CONTROL);
            }
            else if (isFunctionalityAnnotated(pdgNode.parsenode)) {
                tag = getFunctionalityName(comment);
                fnode = graphs.PDG.getFunctionalityNode(tag);
                if (isTierAnnotated(pdgNode.parsenode)) {
                    tier = getTierName(comment);
                }
                if (!fnode) {
                    fnode = graphs.PDG.createFunctionalityNode(tag, tier);
                }
                insertNode(upnode, pdgNode, fnode, true);
            }
        }
    })
}

var handleUseHandler = function (comment, parsenode, upnode) {
    if (isUseHandlerAnnotated(comment)) {
        var node = parsenode,
            handlerCtr = parsenode.handlersAsync.length,
            lastParent = (handlerCtr === 0) ? undefined : parsenode.handlersAsync[handlerCtr - 1],
            extraHandlers = Handler.Transform.HandlerAnnotation(lastParent, comment.value);

        node.handlersAsync = node.handlersAsync.concat(extraHandlers);
    }
};

var handleReplyComment = function (comment, pdgNodes) {
    pdgNodes.map(function (pdgNode) {
        var callnodes;
        if (isReplyAnnotated(comment)) {
            if (pdgNode.isCallNode)
                pdgNode.arity = ARITY.ONE;
            else {
                callnodes = pdgNode.findCallNodes();
                callnodes.map(function (callNode) {
                    callNode.arity = ARITY.ONE
                })
            }
        }
    })
}

var handleBroadcastComment = function (comment, pdgNodes) {
    pdgNodes.map(function (pdgNode) {
        var callnodes;
        if (isBroadcastAnnotated(comment)) {
            if (pdgNode.isCallNode)
                pdgNode.arity = ARITY.ALL;
            else {
                callnodes = pdgNode.findCallNodes();
                callnodes.map(function (callNode) {
                    callNode.arity = ARITY.ALL;
                })
            }
        }
    })
}

/* Move @blocking annotations to the attached call nodes as well */
var handleBlockingComment = function (comment, pdgNodes) {
    var first;
    if (pdgNodes[0].isEntryNode) {
        pdgNodes.map(function (pdgNode) {
            var callnodes;
            if (isBlockingAnnotated(comment)) {
                if (!Aux.isCallExp(pdgNode.parsenode) && !Aux.isIfStm(pdgNode.parsenode)) {
                    callnodes = pdgNode.findCallNodes();
                    /* Sort on original order */
                    callnodes.sort(function (n1, n2) {
                        return n1.cnt - n2.cnt;
                    })

                    callnodes.map(function (callNode) {
                        if (!first) {
                            callNode.parsenode.leadingComment = comment;
                            first = true;
                        }
                    })
                }
                if (pdgNode.isCallNode && Aux.isExpStm(pdgNode.parsenode) && !first) {
                    pdgNode.parsenode.expression.leadingComment = comment;
                    first = true;
                }
            }
        })
    }

    else {
        pdgNodes.map(function (pdgNode) {
            var callnodes;
            if (isBlockingAnnotated(comment)) {
                if (!Aux.isCallExp(pdgNode.parsenode) && !Aux.isIfStm(pdgNode.parsenode)) {
                    callnodes = pdgNode.findCallNodes();
                    callnodes.map(function (callNode) {
                        callNode.parsenode.leadingComment = comment;
                    })
                }
                if (pdgNode.isCallNode && Aux.isExpStm(pdgNode.parsenode)) {
                    pdgNode.parsenode.expression.leadingComment = comment;
                }
            }
        })
    }
}

/* This handler is called directly from handeProgram in stip.js
 because of the different structure of a program node.
 node.comments = list of comments of whole program.
 Check if first comment is config comment block */
function handleProgramNode(pdgNode, pdg) {
    pdg.placements = getPlacements(pdgNode.parsenode);
}

function getPlacements (parsenode) {
    var comments = parsenode.comments;
    var firstComment, placements, index;
    var placementsObj = {};
    if (comments.length > 0) {
        firstComment = comments[0];
        if (isConfigAnnotated(firstComment)) {
            placements = getConfigPlacements(firstComment);
            Object.keys(placements).forEach(function (value) {
                placementsObj[value] = placements[value];
            });
        }
    }
    return placementsObj;
}


/* Aux function: inserts a node in between two nodes (based on control edges) */
function insertNode(from, to, insert, reconnect) {
    from.removeEdgeOut(to, EDGES.CONTROL);
    to.removeEdgeIn(from, EDGES.CONTROL);
    from.addEdgeOut(insert, EDGES.CONTROL);
    if (reconnect)
        insert.addEdgeOut(to, EDGES.CONTROL);
}


registerBeforeHandler(handleUseHandler);
registerAfterHandler(handleReplyComment);
registerAfterHandler(handleBroadcastComment);
registerAfterHandler(handleBlockingComment);

registerAfterHandler(handleBlockComment);


toreturn.handleBeforeComment = handleBeforeComment;
toreturn.handleAfterComment = handleAfterComment;
toreturn.registerBeforeHandler = registerBeforeHandler;
toreturn.registerAfterHandler = registerAfterHandler;
toreturn.isAssumesAnnotated = isAssumesAnnotated;
toreturn.isTierAnnotated = isTierAnnotated;
toreturn.isServerAnnotated = isServerAnnotated;
toreturn.isClientAnnotated = isClientAnnotated;
toreturn.isUiAnnotated = isUiAnnotated;
toreturn.isCssAnnotated = isCssAnnotated;
toreturn.isRemoteFunctionAnnotated = isRemoteFunctionAnnotated;
toreturn.isRemoteCallAnnotated = isRemoteCallAnnotated;
toreturn.isRemoteDataAnnotated = isRemoteDataAnnotated;
toreturn.isLocalFunctionAnnotated = isLocalFunctionAnnotated;
toreturn.isLocalCallAnnotated = isLocalCallAnnotated;
toreturn.isLocalDataAnnotated = isLocalDataAnnotated;
toreturn.isClientorServerAnnotated = isClientorServerAnnotated;
toreturn.isBlockingAnnotated = isBlockingAnnotated;
toreturn.isReplyAnnotated = isReplyAnnotated;
toreturn.isSharedAnnotated = isSharedAnnotated;
toreturn.isGeneratedAnnotated = isGeneratedAnnotated;
toreturn.isSliceAnnotated = isFunctionalityAnnotated;
toreturn.getSliceName = getFunctionalityName;
toreturn.getTierName = getTierName;
toreturn.handleProgramNode = handleProgramNode;
toreturn.isDefineHandlerAnnotated = isDefineHandlerAnnotated;
toreturn.isObservableAnnotated = isObservableAnnotated;
toreturn.isCopyAnnotated = isCopyAnnotated;
toreturn.isReplicatedAnnotated = isReplicatedAnnotated;
toreturn.isTierOnlyAnnotated = isTierOnlyAnnotated;
toreturn.isImportAnnotated = isImportAnnotated;
toreturn.getImports = getImports;
toreturn.configHasClient = configHasClient;
toreturn.configHasServer = configHasServer;
toreturn.configGetPlacements = getPlacements;

global.Annotations = toreturn;
module.exports = toreturn;

