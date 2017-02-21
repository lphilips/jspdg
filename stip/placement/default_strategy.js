var ARITY = require('../PDG/node.js').ARITY;

var toreturn = {};

/* Aux function : count outgoing  dependencies on data
   that is not observable or replicated annotated
 */
function countRemoteDependencies (fnode, func, type, dir) {
    return fnode.countEdgeTypeFilterNode(type, function (n) {
        return n.getFunctionality().equals(func) &&
               !( n.isStatementNode && n.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
                Annotations.isObservableAnnotated(n.parsenode.leadingComment)))
    }, dir);
}

function addPlacementTag(fnode, pdg) {
    var fnodes = pdg.getFunctionalityNodes();
    var clientfuncs = fnodes.filter(function (func) {
        return func.tier == DNODES.CLIENT
    });
    var serverfuncs = fnodes.filter(function (func) {
        return func.tier == DNODES.SERVER
    });

    var dataOutC, dataOutS, callOutS, callOutC, dataInC, dataInS, callInS, callInC
    dataOutC = dataOutS = callOutS = callOutC = dataInC = dataInS = callInS =callInC = 0;


    clientfuncs.map(function (func) {
        callOutC += fnode.countEdgeTypeTo(EDGES.REMOTEC, func.ftype);
        callInC += fnode.countEdgeTypeTo(EDGES.REMOTEC, func.ftype, true);
        dataOutC += fnode.countEdgeTypeTo(EDGES.REMOTED, func.ftype);
        dataInC += fnode.countEdgeTypeTo(EDGES.REMOTED, func.ftype, true);
    });

    serverfuncs.map(function (func) {
        callOutS += countRemoteDependencies(fnode, func, EDGES.REMOTEC);
        callInS += countRemoteDependencies(fnode, func, EDGES.REMOTEC, true);
        dataOutS += countRemoteDependencies(fnode, func, EDGES.REMOTED);
        dataInS += countRemoteDependencies(fnode, func, EDGES.REMOTED, true);
    });

    /* Standalone slice: only incoming dependencies */
    if (callOutC + dataOutC + callOutS + dataOutS == 0) {
        if (callInC > 0 && callInS > 0) {
            fnode.tier = DNODES.SHARED;
        }
        else if (callInC > 0) {
            fnode.tier = DNODES.CLIENT;
        }
        else {
            fnode.tier = DNODES.SERVER
        }
    }

    if (callOutC + dataOutC > callOutS + dataOutS) {
        fnode.tier = DNODES.CLIENT;
    }
    else if (callOutC + dataOutC < callOutS + dataOutS) {
        fnode.tier = DNODES.SERVER;
    }
    else {
        fnode.tier = DNODES.CLIENT;
    }
}


function addPlacementTags (graph) {
    var statistics = {};
    graph.getFunctionalityNodes().forEach(function (node) {
        statistics[node.ftype] = {
            depends : node.getFNodes(EDGES.REMOTEC).concat(node.getFNodes(EDGES.REMOTED, true)),
            supports : node.getFNodes(EDGES.REMOTEC, true).concat(node.getFNodes(EDGES.REMOTED)),
        }
    });
    /* Sort slice nodes */
    var fnodes = graph.getFunctionalityNodes().sort(function (f1, f2) {
        if (f1.tier)
            return -1;
        else if (f2.tier) {
            return 1;
        }
        else {
            return statistics[f1.ftype].depends.length - statistics[f2.ftype].depends.length
        }
    });

    fnodes.forEach(function (fnode) {
        var stats = statistics[fnode.ftype];
        if( !fnode.tier) {
            if (stats.depends.length == 0)
                fnode.tier = DNODES.SHARED;
            else
                addPlacementTag(fnode, graph);
        }
    })
}

toreturn.addPlacementTags = addPlacementTags;


global.DefaultPlacementStrategy = toreturn;
module.exports = toreturn;