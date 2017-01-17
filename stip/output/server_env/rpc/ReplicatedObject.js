var Proxy = require('harmony-proxy');
var Clock = require('./clock.js');
require('./nodeHandling.js');

/* 
 * Makes a replicated object server side.
 * Updates are broadcast to all clients, according to methodS (e.g. '__updateFromServer__').
 * Updates from a client can be integrated using the methodC function (e.g. '__updateFromClient__')
 *
 */

function makeReplicatedHandlerServer (server, methodS, methodC, clock) {
    return {
        get: function (obj, prop, value) {
            if (prop == "__clock") {
                return clock;
            }
            else if (prop == methodC) {
                // Update from client side => compare clocks
                return function () {
                    var args = Array.prototype.slice.call(arguments);
                    // args = object, prop, value, clock
                    var clockD = args[2];
                    /* concurr vector clocks */
                    if (clock.compare(clockD) === Clock.CONCURRENT) {
                        /* rollback */
                        server.rpcTo(args[3], "__rollbackClock__", obj.uid, obj, clock);
                        return false;
                    }
                    /* clock of client is less than server clock */
                    else if (clock.compare(clockD) === Clock.GT) {
                        /* ignore client update */
                        server.rpcTo(args[3], "__rollbackClock__", obj.uid, obj, clock);
                        return false;
                    }
                    /* clock of client more recent */
                    else {
                        obj[args[0]] = args[1];
                        clock = clock.merge(clockD);
                        server.rpc(methodS, obj.uid, args[0], args[1], clock);
                        return true;
                    }
                }
            } else {
                return obj[prop];
            }
        },
        set: function (obj, prop, value) {
            if (prop !== 'uid')
                clock.increment('server');
            /* default behavior */
            obj[prop] = value;
            /* Forward to replica */
            server.rpc(methodS, obj.uid, prop, value, clock);
            return true;
        }
    }
}



/* Make proxy handle for a replicated object on client side.
 *  MethodS is for example '__updateFromServer__' ,
 *  MethodC is for example'__updateFromClient__'
 */
function makeReplicatedHandlerClient (client, methodS, methodC, clock, callback) {
    var id = client.id;
    var node = function () {};
    var fp = makeFailureProxy(client);
    node.flagPriority = false;
    node.toString = function () {return "-node"};
    node.onNetworkException = function () {
        var buffer = this.buffer,
            due = this.due;
        buffer.bufferCall(this.ctxt, due);
    };
    var leaf = function () {
        this.buffer = UniqueBuffer.getInstance();
        this.due = 60000;
    };
    leaf.parent = node;
    leaf.prototype = new HandlerNode();
    leaf.prototype.constructor = leaf;
    leaf.toString = function () {};
    var clientBuffer = fp(leaf);
    client.RPC.onConnectedExec(function () {
        UniqueBuffer.getInstance().flushBuffer();
    })
    return {
        get: function (obj, prop) {
            if (prop == "__clock") {
                return clock;
            }
            else if (prop == methodS) {
                return function () {
                    var args = Array.prototype.slice.call(arguments);
                    var clockS, value, newObjectCB, prop;
                    if (args.length >= 3) {
                        // prop, value, clock, [newObjectCB]
                        prop = args[0];
                        value = args[1];
                        clockS = args[2];
                        newObjectCB = (args.length == 4) ? args[3] : false;
                        clock = clock.merge(clockS);
                        if (!prop) {
                            Object.keys(value).forEach(function (key, index) {
                                obj[key] = value[key];
                            });
                            if (newObjectCB)
                                newObjectCB(obj.uid, obj);
                            else if (callback && prop !== "uid")
                                callback(obj.uid, false, obj);
                        } else {
                            obj[prop] = value;
                            if (newObjectCB)
                                newObjectCB(obj.uid, obj);
                            else if (callback && prop !== "uid")
                                callback(obj.uid, prop, value);
                        }
                        return true;
                    }
                    return false;
                }
            } else {
                return obj[prop];
            }
        },
        set: function (obj, prop, value) {
            if (prop !== 'uid')
                clock.increment(id);
            obj[prop] = value;
            clientBuffer.rpc(methodC, obj.uid, prop, value, clock);
            return true;
        }
    }
}

function makeReplicatedObjectServer (server, store, methodS, methodC, object, name) {
    var clock = Clock.makeClock();
    var replica =  new Proxy(object, makeReplicatedHandlerServer(server, methodS, methodC, clock));
    store.addObject(replica, name);
    server.rpc('__addObjectFromServer__', replica.uid, replica, clock);
    return replica;
}

function makeReplicatedObjectClient (client, store, methodS, methodC, object, name, clock, callback) {
    var clockC = Clock.makeClock();
    if (clock)
        clockC = clockC.merge(clock);
    Object.keys(object).forEach(function (key, index) {
        if (object[key].uid) {
            var replicated = makeReplicatedObjectClient(client, store, methodS, methodC, object[key], object[key].uid, object[key].__clock);
            object[key] = replicated;
        }
    });
    var replica = new Proxy(object, makeReplicatedHandlerClient(client, methodS, methodC, clockC, callback));
    store.addObject(replica, name);
    return replica;
}

module.exports = {
    makeReplicatedObjectClient : makeReplicatedObjectClient,
    makeReplicatedObjectServer : makeReplicatedObjectServer
}

global.ReplicatedObject = {
    makeReplicatedObjectClient : makeReplicatedObjectClient,
    makeReplicatedObjectServer : makeReplicatedObjectServer
}