
function advice(slice, pdg) {
    var tier = slice.tier;
    var callsRemote = [];
    var advice = {};

    /* CALLS */
    var callLocal = countRemoteDependencies(slice, tier, EDGES.REMOTEC, true, false, []) + slice.countEdgeType(EDGES.CALL, true);
    var callRemote = countRemoteDependencies(slice, tier === DNODES.CLIENT ? DNODES.SERVER : DNODES.CLIENT, EDGES.REMOTEC, false, false, callsRemote);

    advice.callRemote = callRemote;
    advice.callLocal = callLocal;
    advice.calls = callsRemote;


    /* DATA */
    advice.constructorsInRemote = [];
    advice.dataInRemote = [];
        if (slice.tier == DNODES.SERVER) {
            var nodes = slice.getNodes();
            var datanodes = slice.getOutNodes(EDGES.CONTROL)
                .flatMap(function (entry) {return entry.getOutNodes(EDGES.CONTROL)})
                .filter(function (n) {
                return n.isStatementNode && Aux.isVarDecl(n.parsenode)
            });
            var constructornodes = nodes.filter(function (n) {
                return n.isObjectEntry
            })
                .flatMap(function (n) {
                    return n.getOutNodes(EDGES.OBJMEMBER)
                })
                .filter(function (n) {
                    return n.isEntryNode && n.isConstructor
                });

            datanodes.forEach(function (decl) {
                var usesEntries = decl.getOutNodes(EDGES.DATA).concat(decl.getOutNodes(EDGES.REMOTED))
                    .filter(function (n) {
                        return n.equalsTier(decl)
                    })
                    .map(function (n) {
                        return n.enclosingEntry()
                    })
                    .filter(function (n) {
                        return n.isEntryNode && n.parsenode && Aux.isFunDecl(n.parsenode)
                    });
                usesEntries.map(function (entry) {
                    var remotes = entry.getInEdges(EDGES.REMOTEC).filter(function (n) {
                        return n.from.tier !== entry.tier
                    });
                    if (remotes.length > 0 && advice.dataInRemote.indexOf(decl) < 0) {
                        advice.dataInRemote.push(decl)
                    }
                })

            })

            constructornodes.forEach(function (n) {
                var callEntries = n.getInNodes(EDGES.CALL).concat(n.getInNodes(EDGES.REMOTEC))
                    .filter(function (c) {
                        return c.equalsTier(n)
                    })
                    .map(function (c) {
                        return c.enclosingEntry()
                    })
                    .filter(function (n) {
                        return n.isEntryNode && n.parsenode && Aux.isFunDecl(n.parsenode)
                    });
                callEntries.forEach(function (entry) {
                    var remotes = entry.getInEdges(EDGES.REMOTEC).filter(function (n) {
                        return n.from.tier !== entry.tier
                    })
                    if (remotes.length > 0 && advice.constructorsInRemote.indexOf(n)) {
                        advice.constructorsInRemote.push(n)
                    }
                })
            })
        }

    /* Give negative (slice should be moved or divided) or positive advice */
    if (callRemote > callLocal || advice.constructorsInRemote.length > 0 ||
    advice.dataInRemote.length > 0) {
        advice.placement = false;
    }
     else {
        advice.placement = true;
    }

    return advice;
}

function countRemoteDependencies (fnode, tier, type, shared,  dir, store) {
    return fnode.countEdgeTypeFilterNode(type, function (n) {
        var filter = (shared ? (n.tier === DNODES.SHARED || n.tier === tier) : n.tier === tier) &&
            !( n.isStatementNode && n.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
            Annotations.isObservableAnnotated(n.parsenode.leadingComment)));
        if (filter && store.indexOf(n) < 0)
            store.push(n);
        return filter;

    }, dir);
}


global.placementAdvice = {advice: advice};
module.exports = {advice: advice};