/*
 * Works on the level of esprima nodes
 */



var Comments = (function () {

    var toreturn = {};

    var beforeHandlers = [];
    var afterHandlers  = [];


    var component_annotation = "@slice"
    var client_annotation    = "@client";
    var server_annotation    = "@server";
    var assumes_annotation   = "@assumes";

    var use_handler_annotation = "@useHandler";
	var define_handler_annotation = "@defineHandlers";

    var reply_annotation     = "@reply";
    var broadcast_annotation = "@broadcast";
    var blocking_annotation  = "@blocking";
    var shared_annotation    = "@shared";
    var generated_annotation = "@generated";
    var placement_annotation = "@tier";
    var config_annotation    = "@config";


    // Client annotations is @client in comment
    var isClientAnnotated = function (comment) {
      return comment.value.indexOf(client_annotation) != -1;
    }

    // Server annotations is @server in comment
    var isServerAnnotated = function (comment) {
      return comment.value.indexOf(server_annotation) != -1;
    }

    var isClientorServerAnnotated = function (node) {
        return node.leadingComment &&
            Aux.isBlockStm(node) &&
            (isClientAnnotated(node.leadingComment) || 
                isServerAnnotated(node.leadingComment));
    }

    var isAssumesAnnotated = function (string) {
    	return string.indexOf(assumes_annotation) != -1;
    }

    var isUseHandlerAnnotated = function (comment) {
		return comment.value.indexOf(use_handler_annotation) != -1;
	};

	var isDefineHandlerAnnotated = function (node) {
		return node.leadingComment && node.leadingComment.value.indexOf(define_handler_annotation) != -1;
	};

    var isReplyAnnotated = function (comment) {
        return comment.value.indexOf(reply_annotation) != -1;
    }

    var isBroadcastAnnotated = function (comment) {
        return comment.value.indexOf(broadcast_annotation) != -1;
    }

    var isBlockingAnnotated = function (comment) {
        return comment.value.indexOf(blocking_annotation) != -1;
    }

    var isSharedAnnotated = function (comment) {
        return comment.value.indexOf(shared_annotation) != -1;
    }

    var isGeneratedAnnotated = function (comment) {
        return comment && comment.value.indexOf(generated_annotation) != -1;
    }

    var isTierAnnotated = function (node) {
        return node.leadingComment &&
               Aux.isBlockStm(node) &&
               node.leadingComment.value.indexOf(placement_annotation) != -1;
    }

    var getTierName = function (comment) {
        var annotation = placement_annotation + " ";
        var length = annotation.length;
        var idx  = comment.value.indexOf(annotation);
        var tier = comment.value.slice(idx+placement_annotation.length);
        tier = tier.replace(/\s+/g, '');
        return tier;
    }

    var isFunctionalityAnnotated = function (node) {
        return node.leadingComment &&
              Aux.isBlockStm(node) &&
              node.leadingComment.value.indexOf(component_annotation) != -1;
    }

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
        tag = tag.replace(/\s+/g, '');
        return tag;
    }

    var isConfigAnnotated = function (comment) {
        return comment.value.indexOf(config_annotation) != -1;
    }

    var registerBeforeHandler = function (handler) {
        beforeHandlers.push(handler)
    }

    var registerAfterHandler = function (handler) {
        afterHandlers.push(handler)
    }
    
    /*  Before handlers are called right before the parsenode is turned into a pdg node */
    var handleBeforeComment = function (comment, parsenode, upnode) {
        beforeHandlers.map(function (handler) {
            handler(comment, parsenode, upnode)
        })
    }

    var handleAfterComment = function (comment, pdgNode, upnode) {
        afterHandlers.map(function (handler) {
            handler(comment, pdgNode, upnode)
        })
    }

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

                    insertNode(upnode, pdgNode, fnode);
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
                    insertNode(upnode,pdgNode, fnode, true);
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
                    if (!Aux.isCallExp(pdgNode.parsenode)) {
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
                    if (!Aux.isCallExp(pdgNode.parsenode)) {
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
    function handleProgramNode (pdgNode, pdg) {
        var comments = pdgNode.parsenode.comments;
        var firstComment, placements, index;
        if (comments.length > 0) {
            firstComment = comments[0];
            if (isConfigAnnotated(firstComment)) {
                index = firstComment.value.indexOf(config_annotation);
                var sliced = firstComment.value.slice(index+config_annotation.length).trim();
                placements = sliced.slice(0, sliced.indexOf("@")).split(/,/);
                placements.forEach(function (placement) {
                    var nametier = placement.split(/:/).map(function (s) {return s.trim()});
                    pdg.placements[nametier[0]] = nametier[1];
                });
            }
        }
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


    toreturn.handleBeforeComment        = handleBeforeComment;
    toreturn.handleAfterComment         = handleAfterComment;
    toreturn.registerBeforeHandler      = registerBeforeHandler;
    toreturn.registerAfterHandler       = registerAfterHandler;
    toreturn.isAssumesAnnotated         = isAssumesAnnotated;
    toreturn.isTierAnnotated            = isTierAnnotated;
    toreturn.isServerAnnotated          = isServerAnnotated;
    toreturn.isClientAnnotated          = isClientAnnotated;
    toreturn.isClientorServerAnnotated  = isClientorServerAnnotated;
    toreturn.isBlockingAnnotated        = isBlockingAnnotated;
    toreturn.isSharedAnnotated          = isSharedAnnotated;
    toreturn.isGeneratedAnnotated       = isGeneratedAnnotated;
    toreturn.isSliceAnnotated           = isFunctionalityAnnotated;
    toreturn.getSliceName               = getFunctionalityName;
    toreturn.getTierName                = getTierName;
    toreturn.handleProgramNode          = handleProgramNode;
    toreturn.isDefineHandlerAnnotated   = isDefineHandlerAnnotated;

    if (typeof module !== 'undefined' && module.exports != null) {
        ARITY = require('./PDG/node.js').ARITY;
        Handler = require('./handler.js').Handler;
        exports.Comments = toreturn;
    }

    return toreturn;

})()

