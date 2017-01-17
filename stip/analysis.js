var Analysis = (function () {

    var interface = {};


    function AST_isRemoteFunction(node) {
        return node.leadingComment && Comments.isRemoteFunctionAnnotated(node);
    }

    function PDG_isRemoteFunction(node) {
        return (node.isServerNode() && node.clientCalls() > 0) ||
            (node.isClientNode() && node.serverCalls() > 0)
    }

    function AST_isLocalFunction(node) {
        return !node.leadingComment || (node.leadingComment && !(Comments.isRemoteFunctionAnnotated(node))) ||
            (node.leadingComment && Comments.isLocalFunctionAnnotated(node))
    }

    function PDG_isLocalFunction(node) {
        return (node.isClientNode() && node.clientCalls() > 0) ||
            (node.isServerNode() && node.serverCalls() > 0) ||
            (node.clientCalls() == 0 && node.serverCalls() == 0)
    }

    function isRemoteFunction(options, node) {
        if (options.analysis)
            return PDG_isRemoteFunction(node);
        else
            return AST_isRemoteFunction(node.parsenode);
    }

    function isLocalFunction(options, node) {
        if (options.analysis)
            return PDG_isLocalFunction(node);
        else
            return AST_isLocalFunction(node.parsenode);
    }

    function AST_isRemoteCall(node) {
        return (node.leadingComment ? true : false) && Comments.isRemoteCallAnnotated(node);
    }

    function PDG_isRemoteCall(node) {
        var entryNode = node.getEntryNode()[0];
        if (Comments.isRemoteCallAnnotated(node.parsenode))
            return true;
        if (Comments.isLocalCallAnnotated(node.parsenode))
            return false;
        else if (!entryNode)
            return false;
        else {
            return (node.isServerNode() && entryNode.isClientNode()) ||
                (node.isClientNode() && entryNode.isServerNode())
        }
    }

    function PDG_isLocalCall(node) {
        return !PDG_isRemoteCall(node);
    }

    function AST_isLocalCall(node) {
        return !node.leadingComment || (node.leadingComment && !(Comments.isRemoteCallAnnotated(node))) ||
            (node.leadingComment && Comments.isLocalCallAnnotated(node))
    }


    function isLocalCall(options, node) {
        if (options.analysis)
            return PDG_isLocalCall(node);
        else
            return AST_isLocalCall(node.parsenode);
    }

    function isRemoteCall(options, node) {
        if (options.analysis)
            return PDG_isRemoteCall(node);
        else
            return AST_isRemoteCall(node.parsenode);
    }

    function AST_isRemoteData(node) {
        return (node.leadingComment ? true : false) && Comments.isRemoteDataAnnotated(node);
    }

    function PDG_isRemoteData(node) {
        var parsenode = node.parsenode;
        var upnode = node.getInNodes(EDGES.CONTROL).filter(function (n) {
            var ins = n.getInNodes(EDGES.CONTROL);
            return n.isEntryNode && ins.length == 1 && ins[0].isSliceNode;
        });

        if (upnode && upnode.length != 1)
            return false;

        var callsTo = node.getOutNodes(EDGES.CONTROL).filter(function (n) {
            return n.isCallNode
        }).flatMap(function (n) {
            return n.getOutNodes(EDGES.CALL);
        }).filter(function (n) {
            return n.isEntryNode && n.isConstructor && n.parsenode.leadingComment &&
                (Comments.isObservableAnnotated(n.parsenode.leadingComment) ||
                Comments.isReplicatedAnnotated(n.parsenode.leadingComment));
        });
        return (parsenode.leadingComment && (Comments.isObservableAnnotated(parsenode.leadingComment) ||
            Comments.isReplicatedAnnotated(parsenode.leadingComment) || Comments.isCopyAnnotated(parsenode.leadingComment))) ||
            (Aux.isExpStm(node.parsenode) && callsTo.length > 0);
    }


    function AST_isLocalData(node) {
        return !node.leadingComment || (node.leadingComment && !(Comments.isRemoteCallAnnotated(node))) ||
            (node.leadingComment && Comments.isLocalDataAnnotated(node))
    }


    function PDG_isLocalData(node) {
        return !node.leadingComment || (node.leadingComment && (Comments.isTierOnlyAnnotated(node.leadingComment) ||
            Comments.isCopyAnnotated(node.leadingComment)))
    }

    function isLocalData(options, node) {
        if (options.analysis)
            return PDG_isLocalData(node);
        else
            return AST_isLocalData(node.parsenode);
    }

    function isRemoteData(options, node) {
        if (options.analysis)
            return PDG_isRemoteData(node);
        else
            return AST_isRemoteData(node.parsenode);
    }


    interface.isRemoteFunction = isRemoteFunction;
    interface.isRemoteCall = isRemoteCall;
    interface.isRemoteData = isRemoteData;
    interface.isLocalFunction = isLocalFunction;
    interface.isLocalCall = isLocalCall;
    interface.isLocalData = isLocalData;

    if (typeof module !== 'undefined' && module.exports != null) {
        EDGES = require('./PDG/edge.js').EDGES;
        nodereq = require('./PDG/node.js');
        asyncs = require('./pre-analysis').asyncs;
        DNODES = nodereq.DNODES;
        arityEquals = nodereq.arityEquals;
        fTypeEquals = nodereq.fTypeEquals;
        ARITY = nodereq.ARITY;
        exports.Analysis = interface;
    }
    return interface;

}());