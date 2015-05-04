/*
 * Works on the level of esprima nodes
 */

var Comments = (function () {

    var module = {};

    var handlers = [];

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

    var registerHandler = function (handler) {
        handlers.push(handler)
    }
    
    var handleComment = function (comment, pdgNode) {
        handlers.map(function (handler) {
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

    registerHandler(handleBlockComment);

    module.handleComment      = handleComment;
    module.registerHandler    = registerHandler;
    module.isAssumesAnnotated = isAssumesAnnotated;
    module.isTierAnnotated    = isTierAnnotated;

    return module


})()