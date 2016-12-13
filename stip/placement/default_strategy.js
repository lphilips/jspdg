var DefaultPlacementStrategy = (function () {

    var toreturn = {};


    function addPlacementTag(fnode, pdg) {
        var fnodes = pdg.getFunctionalityNodes();
        var clientfuncs = fnodes.filter(function (func) {return func.tier == DNODES.CLIENT});
        var serverfuncs = fnodes.filter(function (func) {return func.tier == DNODES.SERVER});

        var datadepsC = 0;
        var datadepsS = 0;
        var calldepsS = 0;
        var calldepsC = 0;

        clientfuncs.map(function (func) {
            calldepsC += fnode.countEdgeTypeTo(EDGES.REMOTEC, func.ctype);
            datadepsC += fnode.countEdgeTypeTo(EDGES.REMOTED, func.ctype);
        });

        serverfuncs.map(function (func) {
            calldepsS += fnode.countEdgeTypeTo(EDGES.REMOTEC, func.ctype);
            datadepsS += fnode.countEdgeTypeTo(EDGES.REMOTED, func.ctype, -1);
        });

        if (calldepsC + datadepsC > calldepsS + datadepsS) {
            fnode.tier = DNODES.CLIENT;
        }
        else if (calldepsC + datadepsC < calldepsS + datadepsS) {
            fnode.tier = DNODES.SERVER;
        }
        else {
            fnode.tier = DNODES.CLIENT;
        }
    }


    toreturn.addPlacementTag = addPlacementTag;


    if (typeof module !== 'undefined' && module.exports != null) {
        ARITY = require('../PDG/node.js').ARITY;
        exports.DefaultPlacementStrategy = toreturn;
    }

    return toreturn;


})()