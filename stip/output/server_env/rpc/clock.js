var LT = "lt";
var GT = "gt";
var EQ = "eq";
var CONCURRENT = "concurrent";

function Clock () {
    this.vector = {};

    this.increment = function (id) {
        if (! (id in this.vector))
            return this.vector[id] = 1;
        return ++this.vector[id];
    };

    this.compare = function (clock) {
        var allKeys = {}, vec;

        for (var id in this.vector)
            allKeys[id] = true;

        for (var id in clock.vector)
            allKeys[id] = true;

        var counter, otherCounter, mem;

        if (Object.keys(allKeys).length == 0) {
            return EQ;
        }
        for (id in allKeys) {
            counter = this.vector[id] || 0;
            otherCounter = clock.vector[id] || 0;

            if (counter < otherCounter) {
                if (mem == GT)
                    return CONCURRENT;
                mem = LT;
            } else if (counter > otherCounter) {
                if (mem == LT)
                    return CONCURRENT;
                mem = GT;
            } else if (counter == otherCounter) {
                if (mem != LT && mem != GT)
                    mem = EQ;
            }
        }
        return mem;
    };

    this.merge = function (clock) {
        var newClock = new Clock();

        newClock.vector = greedyZip(this.vector, clock.vector, function (a, b) {
            return Math.max(a || 0, b || 0);
        });

        return newClock;
    }



}

// Given 2 Objects a and b, iterate through their keys. For each key, take the
// corresponding value a[k] and the corresponding value b[k], and apply the
// function fn -- i.e., fn(a[k], b[k]). Assign the result to the same key k on
// a new Object we eventually return.
function greedyZip (a, b, fn) {
    var out = {}
        , seen = {};
    for (var k in a) {
        seen[k] = true;
        out[k] = fn(a[k], b[k]);
    }
    for (k in b) {
        if (k in seen) continue;
        out[k] = fn(a[k], b[k]);
    }
    return out;
}

module.exports = {
    LT : LT,
    EQ : EQ,
    GT : GT,
    CONCURRENT : CONCURRENT,
    makeClock : function () {return new Clock()}
}

global.Clock = {
    LT : LT,
    EQ : EQ,
    GT : GT,
    CONCURRENT : CONCURRENT,
    makeClock : function () {return new Clock()}
}

