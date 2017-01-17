'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/
/*global TimeOutError, FunctionNotFoundError*/

var debug = require('debug')('rpc rpc client.js');

var _debug = true;
if (!_debug)
    debug = function () {};

var io = require('../node_modules/socket.io/node_modules/socket.io-client'),
    clientRpc = require ('./rpc-client.js');

require('./lease.js');


//
// RPC library, client side. Extended with shared data objects
//

/*
 CLIENT RPC OPTIONS: (defaults are mentioned)
 - reconnection: true
 auto reconnect.
 - reconnectionAttempts: Infinity
 amount of attempts before giving up.
 - reconnectionDelay: 1000
 how long to wait before reconnect (doubles + randomized by randomizationFactor).
 - reconnectionDelayMax: 5000
 max delay before reconnection.
 - randomizationFactor: 0.5
 for the reconnection attempts.
 - timeout: 2000
 time before connect_error, connect_timeout events.
 - autoConnect: true
 automatically connect.
 - defaultRpcTimeout: Infinity
 default delay before an RPC call should have its reply. Infinity = no timeout.
 - debugMode: true
 Native JS errors are re-thrown on the caller side, all stacktraces are serialized back to caller.
 */


// CLIENT RPC
var ClientData = function (url, opts, newObjectCB, updateCB) {
    var self = this;
    clientRpc.call(this, url, opts);
    this.store = new Store();
    this.updateMethodServer = '__updateFromServer__';
    this.updateMethodClient = '__updateFromClient__';

    this.expose({
        '__updateFromServer__': function (uid, prop, value, clock, cb) {
            var obj = self.store.getObject(uid);
            if (obj && obj.__clock) {
                obj.__updateFromServer__(prop, value, clock);
            }
            else if (obj) {
                obj.__updateFromServer__(prop, value);
            }
        },
        '__rollbackClock__' : function (uid, obj, clock, cb) {
            var obj = self.store.getObject(uid);
            obj.__clock = clock;
            obj.__updateFromServer__(false, obj, clock);
        },
        '__addObjectFromServer__': function (uid, object, clock, cb) {
            var obj = self.store.getObject(uid);
            if (!obj && clock) {
                var replica = ReplicatedObject.makeReplicatedObjectClient(
                    self, self.store, self.updateMethodServer, self.updateMethodClient, object, uid, clock, updateCB);
                self.store.addObject(replica, uid);
                newObjectCB(uid, replica);
            } else if (!obj) {
                var observable = ObservableObject.makeObservableObjectClient(
                    self.updateMethodServer, self.store, object, uid, updateCB);
                self.store.addObject(observable, uid);
                newObjectCB(uid, observable);
            }
            else if (clock) {
                obj.__updateFromServer__(false, object, clock, newObjectCB);
            }
            else {
                obj.__updateFromServer__(false, object, newObjectCB);
            }
        }
    })

};
ClientData.prototype = Object.create(ClientRpc.prototype);
ClientData.prototype.constructor = ClientData;


ClientData.prototype.makeObservableObject = function (name, object, callback) {
    var obs = ObservableObject.makeObservableObjectClient(this.updateMethodServer,
        this.store, object, name, callback);
    return obs;
}


ClientData.prototype.makeReplicatedObject = function (name, object, callback) {
    var clock = Clock.makeClock();
    var repl = ReplicatedObject.makeReplicatedObjectClient(this, this.store,
        this.updateMethodServer, this.updateMethodClient, object, name , clock, callback);
    return repl;
}

module.exports = ClientData;
global.ClientData = ClientData;