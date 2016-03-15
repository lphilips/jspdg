/*
 * Works on the level of esprima nodes
 */

var Comments = (function () {

    var toreturn = {};

    var beforeHandlers = [];
    var afterHandlers  = [];

    // Client
    var client_annotation    = "@client";
    var server_annotation    = "@server";
    var assumes_annotation   = "@assumes";
    var reply_annotation     = "@reply";
    var broadcast_annotation = "@broadcast";
    var blocking_annotation  = "@blocking";
    var shared_annotation    = "@shared";
    var generated_annotation = "@generated";


    // Client annotations is @client in comment
    var isClientAnnotated = function (comment) {
      return comment.value.indexOf(client_annotation) != -1;
    }

    // Server annotations is @server in comment
    var isServerAnnotated = function (comment) {
      return comment.value.indexOf(server_annotation) != -1;
    }

    var isAssumesAnnotated = function (string) {
    	return string.indexOf(assumes_annotation) != -1;
    }

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
               (isServerAnnotated(node.leadingComment) ||
                isClientAnnotated(node.leadingComment))
    }

    var registerBeforeHandler = function (handler) {
        beforeHandlers.push(handler)
    }

    var registerAfterHandler = function (handler) {
        afterHandlers.push(handler)
    }
    
    /*  Before handlers are called right before the parsenode is turned into a pdg node */
    var handleBeforeComment = function (comment, parsenode) {
        beforeHandlers.map(function (handler) {
            handler(comment, parsenode)
        })
    }

    var handleAfterComment = function (comment, pdgNode) {
        afterHandlers.map(function (handler) {
            handler(comment, pdgNode)
        })
    }

    var handleBlockComment = function (comment, pdgNodes) {
        pdgNodes.map(function (pdgNode) {
            if (Aux.isBlockStm(pdgNode.parsenode)) {
                if (isClientAnnotated(comment)) 
                    graphs.PDG.addClientStm(pdgNode)
                else if (isServerAnnotated(comment))
                    graphs.PDG.addServerStm(pdgNode)
            }
        })
    }

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

    registerAfterHandler(handleReplyComment);
    registerAfterHandler(handleBroadcastComment);
    registerAfterHandler(handleBlockingComment);
   // registerAfterHandler(handleBlockComment);

    toreturn.handleBeforeComment   = handleBeforeComment;
    toreturn.handleAfterComment    = handleAfterComment;
    toreturn.registerBeforeHandler = registerBeforeHandler;
    toreturn.registerAfterHandler  = registerAfterHandler;
    toreturn.isAssumesAnnotated    = isAssumesAnnotated;
    toreturn.isTierAnnotated       = isTierAnnotated;
    toreturn.isServerAnnotated     = isServerAnnotated;
    toreturn.isClientAnnotated     = isClientAnnotated;
    toreturn.isBlockingAnnotated   = isBlockingAnnotated;
    toreturn.isSharedAnnotated     = isSharedAnnotated;
    toreturn.isGeneratedAnnotated  = isGeneratedAnnotated;

    if (typeof module !== 'undefined' && module.exports != null) {
        ARITY = require('./PDG/node.js').ARITY;
        exports.Comments = toreturn;
    }

    return toreturn


})()