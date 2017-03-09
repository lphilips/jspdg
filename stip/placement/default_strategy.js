var ARITY = require('../PDG/node.js').ARITY;

var toreturn = {};
/* represent the percentage for deciding whether slice is placed on client / server / both */
var threshold = 7;


function greaterThanThreshold (x, y) {
    if (x == 0 && y == 0) {
        return false;
    }
    return (Math.abs(x - y) / ((x + y) / 2)) * 100 >= threshold;
}

function addPlacementTag(fnode, pdg, stats) {
    var depends = stats[fnode.ftype].depends,
        supports = stats[fnode.ftype].supports,
        clientDepends = depends.filter(function (s) {
            return s.isClientNode();
        }).length,
        serverDepends = depends.filter(function (s) {
            return s.isServerNode();
        }).length,
        clientSupports = supports.filter(function (s) {
            return s.isClientNode();
        }).length,
        serverSupports = supports.filter(function (s) {
            return s.isServerNode();
        }).length;

        if (clientSupports > 0 && serverSupports > 0) {
            fnode.tier = DNODES.SHARED;
        }
        else if (greaterThanThreshold(clientDepends+clientSupports, serverDepends+serverSupports)) {
            fnode.tier = DNODES.CLIENT;
        }
        else if (greaterThanThreshold(serverSupports+serverDepends, clientSupports+clientDepends)) {
            fnode.tier = DNODES.SERVER;
        }
        else if (greaterThanThreshold(clientDepends, serverDepends)) {
            fnode.tier = DNODES.CLIENT;
        }
        else if (greaterThanThreshold(serverDepends, clientDepends)) {
            fnode.tier = DNODES.SERVER;
        }
        /* Try to maximize offline availability : put on client */
        else {
            fnode.tier = DNODES.CLIENT;
        }
}


function dependsOn(fnode) {
    var remoteC = fnode.getFNodes(EDGES.REMOTEC, false, function (e) {
            var n = e.to;
            return !(n.isEntryNode && n.parsenode && n.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
            Annotations.isObservableAnnotated(n.parsenode.leadingComment)));
        }),
        remoteD = fnode.getFNodes(EDGES.REMOTED, true, function (e) {
            var from = e.from;
            var to = e.to;
            return !( to.isStatementNode && to.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(to.parsenode.leadingComment) ||
            Annotations.isObservableAnnotated(to.parsenode.leadingComment))) &&
                    !(to.isObjectEntry);
        });
    return union(remoteC.concat(remoteD));
}

function supports(fnode) {
    var remoteC = fnode.getFNodes(EDGES.REMOTEC, true, function (e) {
            var n = e.from;
            var orig = n.getOutNodes(EDGES.REMOTEC);
            var res = true;
            orig.forEach(function (n) {
                if (res)
                    res = !(n.isEntryNode && n.parsenode && n.parsenode.leadingComment &&
                        (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
                        Annotations.isObservableAnnotated(n.parsenode.leadingComment)))
            })
            return res;
        }),
        remoteD = fnode.getFNodes(EDGES.REMOTED, false, function (e) {
            var n = e.to;
            var orig = n.getInNodes(EDGES.REMOTED);
            var res = true;
            orig.forEach(function (n) {
                if (res)
                    res = !( n.isStatementNode && n.parsenode.leadingComment &&
                    (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
                    Annotations.isObservableAnnotated(n.parsenode.leadingComment)));
            })
            return res;
        });
    return union(remoteC.concat(remoteD));
}

function addPlacementTags (graph) {
    var statistics = {};
    var shared = [];
    graph.getFunctionalityNodes().forEach(function (node) {
        statistics[node.ftype] = {
            depends : dependsOn(node),
            supports : supports(node),
        }
    });
    /* Sort slice nodes */
    var fnodes = graph.getFunctionalityNodes().sort(function (f1, f2) {
        if (f1.tier)
            return -1;
        else if (f2.tier)
            return 1;
        else
            return statistics[f1.ftype].depends.length - statistics[f2.ftype].depends.length
    });

    /* Add placement tag to every slice.
        Slices that depend on nothing are placed shared
     */
    fnodes.forEach(function (fnode) {
        var stats = statistics[fnode.ftype];
        if( !fnode.tier) {
            if (stats.depends.length == 0) {
                fnode.tier = DNODES.SHARED;
                shared.push(fnode);
            }
            else
                addPlacementTag(fnode, graph, statistics);
        }
    })

    /* After giving every slice a placement:
        make sure the shared slices are put where they are needed.
     */
    shared.forEach(function (fnode) {
        var stats = statistics[fnode.ftype];
        var client = stats.supports.filter(function (s) {return s.isClientNode()}).length;
        var server = stats.supports.filter(function (s) {return s.isServerNode()}).length;
        if (client > 0 && server == 0) {
            fnode.tier = DNODES.CLIENT;
        }
        else if (server > 0 && client == 0) {
            fnode.tier == DNODES.SERVER;
        }
        /* else: keep it shared */
    })
    
    return statistics;
}

var union = function (array) {
    var a = array.concat();
    for (var i = 0; i < a.length; ++i) {
        for(var j = i + 1; j < a.length; ++j) {
            if(a[i].equals(a[j]))
                a.splice(j--, 1);
        }
    }
    return a
}

toreturn.addPlacementTags = addPlacementTags;


global.DefaultPlacementStrategy = toreturn;
module.exports = toreturn;