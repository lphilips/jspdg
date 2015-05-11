/*
 * Works on the level of esprima nodes
 */

var Comments = (function () {

    var module = {};

    var beforeHandlers = [];
    var afterHandlers  = [];

    // Client
    var client_annotation = "@client";
    var server_annotation = "@server";
    var assumes_annotation = "@assumes"


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


    var isTierAnnotated = function (node) {
        return node.leadingComment &&
               esp_isBlockStm(node) &&
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
            if (esp_isBlockStm(pdgNode.parsenode)) {
                if (isClientAnnotated(comment)) 
                    graphs.PDG.addClientStm(pdgNode)
                else if (isServerAnnotated(comment))
                    graphs.PDG.addServerStm(pdgNode)
            }
        })
    }

   // registerAfterHandler(handleBlockComment);

    module.handleBeforeComment   = handleBeforeComment;
    module.handleAfterComment    = handleAfterComment;
    module.registerBeforeHandler = registerBeforeHandler;
    module.registerAfterHandler  = registerAfterHandler;
    module.isAssumesAnnotated    = isAssumesAnnotated;
    module.isTierAnnotated       = isTierAnnotated;
    module.isServerAnnotated     = isServerAnnotated;
    module.isClientAnnotated     = isClientAnnotated;

    return module


})()