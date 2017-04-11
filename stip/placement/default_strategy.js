var ARITY = require('../PDG/node.js').ARITY;
var Genetic = require('genetic-js');
var toreturn = {};


/* This placement strategy uses a genetic search algorithm on the unplaced slices
 and tries to maximize the offline availability of the application
 */


/* Options for the genetic search */
var genetic = Genetic.create();

genetic.optimize = Genetic.Optimize.Maximize;
genetic.select1 =  function (pop) {
    var n = pop.length;
    var a = pop[Math.floor(Math.random()*n)];
    var b = pop[Math.floor(Math.random()*n)];

    while(!this.userData.correct(a.entity) && !this.userData.correct(b.entity)) {
        a.fitness = 0;
        b.fitness = 0;
        a = pop[Math.floor(Math.random()*n)];
        b = pop[Math.floor(Math.random()*n)];
    }
    return this.optimize(a.fitness, b.fitness) ? a.entity : b.entity;
}
genetic.select2 = function (pop) {
    function randomSlice () {
        var idx = Math.floor(Math.random() * pop.length);
        var entity = pop[idx];
        while (!this.userData.correct(entity.entity)) {
            idx = Math.floor(Math.random() * pop.length);
            entity.fitness = 0;
            entity = pop[idx];
        }
        return entity.entity;
    }
    return [genetic.select1.call(this, pop), randomSlice.call(this, pop)];
}

var config = {
    iterations: 300,
    size: 30,
    crossover: 0.6,
    mutation: 0.6,
    webWorkers: false // strange behavior if true
}


var PDG;
var placementinfo;

/* Main function, start the genetic search */
function addPlacementTags(graph) {
    PDG = graph;
    var slices = graph.getFunctionalityNodes().map(function (slice) {
        var obj = {
            name: slice.ftype,
            calls: {},
            remotecalls: {},
            supports: {},
            datasupports: {}
        };
        if (slice.tier == DNODES.SHARED)
            obj.tier = 0;
        else if (slice.tier == DNODES.CLIENT)
            obj.tier = 1;
        else if (slice.tier == DNODES.SERVER)
            obj.tier = 2;
        slice.getFNodes(EDGES.CALL, false, function (edge) {
            var toSlice = edge.to.getFunctionality();
            if (toSlice && obj.calls[toSlice.ftype]) {
                obj.calls[toSlice.ftype]++
            } else if (toSlice) {
                obj.calls[toSlice.ftype] = 1
            }
        });
        slice.getFNodes(EDGES.REMOTEC, false, function (edge) {
            var to = edge.to;
            var toSlice = to.getFunctionality();
            if (!(to.parsenode && to.parsenode.leadingComment &&
            (Comments.isReplicatedAnnotated(to.parsenode.leadingComment) ||
            Comments.isObservableAnnotated(to.parsenode.leadingComment)))) {
                if (toSlice && obj.remotecalls[toSlice.ftype]) {
                    obj.remotecalls[toSlice.ftype]++
                }
                else if (toSlice) {
                    obj.remotecalls[toSlice.ftype] = 1;
                }
            }
        });
        obj.supports = slice.getFNodes(EDGES.REMOTEC, true, function (edge) {
            var from = edge.from;
            return !(from.parsenode && from.parsenode.leadingComment &&
                (Comments.isReplicatedAnnotated(from.parsenode.leadingComment) ||
                Comments.isObservableAnnotated(from.parsenode.leadingComment)))
        }).map(function (n) {
            return n.ftype
        });
        obj.datasupports =slice.getFNodes(EDGES.REMOTED, false, function (edge) {
            var to = edge.to;
            return !(to.parsenode && to.parsenode.leadingComment &&
            (Comments.isReplicatedAnnotated(to.parsenode.leadingComment) ||
            Comments.isObservableAnnotated(to.parsenode.leadingComment)))
        }).map(function (n) {
            return n.ftype
        });
        return obj;
    })
    unplaced = slices.filter(function (slice) {
        return !slice.tier
    })
    genetic.evolve(config,
        {
            slices: slices,
            unplaced: unplaced,
            placement: {
                shared: 0,
                client: 1,
                server: 2
            },
            getTier: function (data, slicename) {
                if (data[slicename] !== undefined)
                    return data[slicename];
                else {
                    return this.slices.filter(function (s) {return s.name == slicename})[0].tier;
                }
            },
            correct: function (data) {
                var correct = true;
                var self = this;
                this.unplaced.forEach(function (slice) {
                    var tier = self.getTier(data,slice.name);
                    slice.supports.forEach(function (slicename) {
                        var depTier = self.getTier(data, slicename);
                        if (depTier == self.placement.server && tier == self.placement.client) {
                            correct = false;
                        }
                    });
                    slice.datasupports.forEach(function (slicename) {
                        var depTier = self.getTier(data, slicename);
                        if (tier == self.placement.server &&
                            (depTier == self.placement.client || depTier == self.placement.shared))
                            correct = false;
                        if (tier == self.placement.client &&
                            depTier == self.placement.shared)
                            correct = false;
                    })

                })
                return correct;
            }
        })
    return placementinfo;
}

genetic.notification = function (pop, generation, stats, isFinished) {
    if (isFinished) {
        placementinfo = {};
        placementinfo.fitness = pop[0].fitness;
        placementinfo.stats = stats;
        placementinfo.generation = generation;
        PDG.getFunctionalityNodes().forEach(function (slice) {
            var place;
            if (!slice.tier) {
                place = pop[0].entity[slice.ftype];
                if (place == 0)
                    slice.tier = DNODES.SHARED;
                else if (place == 1)
                    slice.tier = DNODES.CLIENT;
                else
                    slice.tier = DNODES.SERVER;
            }
        })
    }
}

genetic.generation = function (pop, generation, stats) {
    return pop[0].fitness !== 1;
}

/* Generate a random solution:
 place each unplaced slice on a random tier.
 Solution data maps name of the slice -> tier.
 */

genetic.seed = function () {
    var data = {};
    var unplaced = this.userData.unplaced;
    function place() {
        for (var i = 0; i < unplaced.length; i++) {
            var tier = Math.floor(Math.random() * 3);
            data[unplaced[i].name] = tier;
        }
    }
    place();
    while(!this.userData.correct(data)) {
        place();
    }
    return data;
}

genetic.crossover = function (mother, father) {
    var len = this.userData.unplaced.length;
    var ca = Math.floor(Math.random()*len);
    var cb = Math.floor(Math.random()* len);
    var son = {};
    var daughter = {};
    if (ca > cb) {
        var tmp = cb;
        cb = ca;
        ca = tmp;
    }
    var keys = Object.keys(father);
    for(var i = 0; i < len; i++) {
        var key = keys[i];
        if (i < ca) {
            daughter[key] = mother[key];
            son[key] = father[key];
        }
        else if (i >= ca && i < cb - ca) {
            daughter[key] = father[key];
            son[key] = mother[key];
        } else {
            daughter[key] = mother[key];
            son[key] = father[key];
        }
    }

    return [son, daughter]
}

/* Return the fitness of a solution */
genetic.fitness = function (entity) {
    var slices = this.userData.slices;
    var placement = this.userData.placement;
    function getTier(slicename) {
        if (entity[slicename] !== undefined)
            return entity[slicename];
        else {
            return slices.filter(function (s) {
                return s.name == slicename;
            })[0].tier;
        }
    }

    var fitness = 0;
    var nrOfCalls = 0;

    slices.forEach(function (slice) {
        var clientC = 0;
        var serverC = 0;
        var sharedC = 0;
        var tier = getTier(slice.name);

        Object.keys(slice.remotecalls).forEach(function (slicename) {
            var toTier = getTier(slicename);
            var calls = slice.remotecalls[slicename];

            if (toTier == placement.client)
                clientC += calls;
            else if (toTier == placement.server)
                serverC += calls;
            else if (toTier == placement.shared)
                sharedC += calls;

        });

        Object.keys(slice.calls).forEach(function (slicename) {
            var toTier = getTier(slicename);
            var calls = slice.calls[slicename];

            if (toTier == placement.client)
                clientC += calls;
            else if (toTier == placement.server)
                serverC += calls;
            else if (toTier == placement.shared)
                sharedC += calls;
        });


        var totalCalls = clientC + serverC + sharedC;
        var offline = (clientC + sharedC) / totalCalls;
        if (clientC + sharedC == 0) {
            fitness += 0;
            nrOfCalls += totalCalls;
        }
        else if (tier == placement.client || tier == placement.shared) {
            fitness += offline * totalCalls;
            nrOfCalls += totalCalls;
        }
    });
    if (nrOfCalls == 0) {
        return 1;
    }
    else if (fitness == 0) {
        return 0;
    }
    return fitness / nrOfCalls;
}


/* Mutate function: place a random unplaced slice on a random tier
 * It is adviced to return a copy of the solution
 * */
genetic.mutate = function (entity) {
    var data = {};
    var keys = Object.keys(entity);
    var unplaced = this.userData.unplaced;
    keys.forEach(function (key, index) {
        data[key] = entity[key];
    });
    var random = Math.floor(Math.random() * keys.length);
    var tier = Math.floor(Math.random() * 3);
    if (keys.length > 0) {
        data[unplaced[random].name] = tier;
        while (!this.userData.correct(data)) {
            random = Math.floor(Math.random() * keys.length);
            tier = Math.floor(Math.random() * 3);
            data[unplaced[random].name] = tier;
    }
}
    return data;
}


toreturn.addPlacementTags = addPlacementTags;
global.DefaultPlacementStrategy = toreturn;
module.exports = toreturn;