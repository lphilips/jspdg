/* represent the percentage for deciding about
 giving advice about splitting up or moving certain parts of the code */
var threshold = 10;


function greaterThanThreshold(x, y) {
    if (x == 0 && y == 0) {
        return false;
    }
    return ((x - y) / ((x + y) / 2)) * 100 >= threshold;
}

function advice(slice, pdg) {
    var tier = slice.getTier();
    var callsRemote = [];
    var advice = {};
    var entries = pdg.nodes.filter(function (n) {
        return n.parsenode && n.isCalled;
    });
    advice.constructorsInRemote = [];
    advice.dataInRemote = [];
    advice.entriesOnlyClient = [];
    advice.entriesOnlyServer = [];
    advice.calls = [];
    advice.duplicatedEntries = [];
    if (tier == DNODES.CLIENT || tier == DNODES.SERVER) {
        /* CALLS */
        var callLocal = countRemoteDependencies(slice, tier, EDGES.REMOTEC, true, false, []) + slice.countEdgeType(EDGES.CALL, true);
        var callRemote = countRemoteDependencies(slice, tier === DNODES.CLIENT ? DNODES.SERVER : DNODES.CLIENT, EDGES.REMOTEC, false, false, callsRemote);

        advice.callRemote = callRemote;
        advice.callLocal = callLocal;
        advice.calls = callsRemote;

        /* DATA */
        if (slice.getTier() == DNODES.SERVER) {
            var nodes = slice.getNodes();
            var datanodes = slice.getOutNodes(EDGES.CONTROL)
                .flatMap(function (entry) {
                    return entry.getOutNodes(EDGES.CONTROL)
                })
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
                    return n.isEntryNode && n.isConstructor &&
                            !(n.parsenode.leadingComment &&
                            (Comments.isReplicatedAnnotated(n.parsenode.leadingComment) ||
                            Comments.isObservableAnnotated(n.parsenode.leadingComment)))
                });

            datanodes.forEach(function (decl) {
                var usesEntries = decl.getOutNodes(EDGES.DATA).concat(decl.getOutNodes(EDGES.REMOTED))
                    .filter(function (n) {
                        var uses = decl.getOutNodes(EDGES.DATA).concat(decl.getOutNodes(EDGES.REMOTED))
                            .filter(function (n) {
                                return n.equalsTier(decl) &&
                                    n.isStatementNode && n.parsenode.leadingComment &&
                                    (Comments.isReplicatedAnnotated(n.parsenode.leadingComment) ||
                                    Comments.isObservableAnnotated(n.parsenode.leadingComment))
                            })
                        return n.equalsTier(decl) && uses.length <= 0
                    })
                    .map(function (n) {
                        return n.enclosingEntry()
                    })
                    .filter(function (n) {
                        return n.isEntryNode && n.parsenode && Aux.isFunDecl(n.parsenode)
                    });
                usesEntries.map(function (entry) {
                    var remotes = entry.getInEdges(EDGES.REMOTEC).filter(function (n) {
                        return n.from.getTier() !== entry.getTier()
                    });
                    if (remotes.length > 0 && advice.dataInRemote.indexOf(decl) < 0) {
                        advice.dataInRemote.push(decl)
                    }
                })

            });

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
                        return n.from.getTier() !== entry.getTier()
                    });
                    if (remotes.length > 0 && advice.constructorsInRemote.indexOf(n)) {
                        advice.constructorsInRemote.push(n)
                    }
                })
            })
        }

        /* Give negative (slice should be moved or divided) or positive advice */
        if (greaterThanThreshold(callRemote, callLocal) || advice.constructorsInRemote.length > 0 ||
            advice.dataInRemote.length > 0) {
            advice.placement = false;
        }
    }

    var entries = slice.getNodes().filter(function (n) {
        return n.isEntryNode && n.isCalled
    });
    if (tier == DNODES.SERVER)
        advice.entriesOnlyClient = entries.filter(function (e) {
            return e.clientCalls() > 0 && e.serverCalls() == 0
        });
    else if (tier == DNODES.CLIENT)
        advice.entriesOnlyServer = entries.filter(function (e) {
            return e.serverCalls() > 0 && e.clientCalls() == 0
        });
    if (advice.entriesOnlyClient.length > 0 || advice.entriesOnlyServer.length > 0)
        advice.placement = false;


    /* Functions that are present on both tiers? */
    entries.forEach(function (e) {
        var entries_ = entries.slice();
        entries_.remove(e);
        var entriesp = entries_.map(function (n) {
            return escodegen.generate(n.parsenode.body)
        });
        if (entriesp.find(function (n) {
                n === escodegen.generate(e.parsenode.body)
            }))
            advice.duplicatedEntries.push(e);
    })

    return advice;
}

function countRemoteDependencies(fnode, tier, type, shared, dir, store) {
    return fnode.countEdgeTypeFilterNode(type, function (n) {
        var filter = (shared ? (n.getTier() === DNODES.SHARED || n.getTier() === tier) : n.getTier() === tier) &&
            /* Not to shared declaration */
            (!( n.isStatementNode && n.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
            Annotations.isObservableAnnotated(n.parsenode.leadingComment))) &&
            /* Not to share function constructors */ !(n.isEntryNode && n.parsenode && n.parsenode.leadingComment &&
            (Annotations.isReplicatedAnnotated(n.parsenode.leadingComment) ||
            Annotations.isObservableAnnotated(n.parsenode.leadingComment))));
        if (filter && store.indexOf(n) < 0)
            store.push(n);
        return filter;

    }, dir);
}


global.placementAdvice = {advice: advice};
module.exports = {advice: advice};