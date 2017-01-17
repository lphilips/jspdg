'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/
/*global TimeOutError, FunctionNotFoundError*/

var debug = require('debug')('rpc rpc client.js');

var _debug = true;
if (!_debug)
    debug = function () {};

var io = require('../node_modules/socket.io/node_modules/socket.io-client'),
    RPC     = require('./rpc.js'),
    Storage = require('./storage.js');

require('./lease.js');


//
// RPC library, client side.
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

var getSocketOptions = function (options) {
    //clientside options see:
    //https://github.com/Automattic/socket.io-client/blob/master/lib/manager.js#L32
    var opts                  = {};
    opts.reconnection         = false === options.reconnection ? false : (options.reconnection || true);
    opts.reconnectionAttempts = options.reconnectionAttempts || Infinity;
    opts.reconnectionDelay    = options.reconnectionDelay || 1000;
    opts.reconnectionDelayMax = options.reconnectionDelayMax || 5000;
    opts.randomizationFactor  = options.randomizationFactor || 0.5;
    opts.timeout              = options.timeout || 2000;
    opts.autoConnect          = false === options.autoConnect ? false : (options.autoConnect || true);

    return opts;
};


var getRPCOptions = function (options) {
    var opts               = {};
    opts.defaultRpcTimeout = options.defaultRpcTimeout || Infinity;
    opts.debugMode  = false === options.debugMode ? false : (options.debugMode || true);

    return opts;
};


// CLIENT RPC
var ClientRpc = function (url, opts) {
    opts = opts || {};

    var socket = new io(url, getSocketOptions(opts));
    this._setListeners(socket);
    this.RPC = new RPC(socket, getRPCOptions(opts));

    //this.onConnectionCallback = function () {};
    this.id = null;
    //this.storage = storage || new Storage();
    this.url = url;


};


ClientRpc.prototype._setListeners = function (socket) {
    var self = this;
    socket.on('connect', function () {

        //var originalId = self.storage.getItem('client') || null;
       

        socket.emit('init', {
            'client': self.id,
            'recMsgCounter': self.RPC.recMsgCounter
        });

        socket.once('init-ack', function (data) {
            //self.storage.setItem('client', data.client);
            self.id = data.client;

            self.RPC.sendMsgCounter = Math.max(data.recMsgCounter, self.RPC.sendMsgCounter);

            console.log('New id received: ', self.id, self.RPC.sendMsgCounter);

            //Only now everything is initialized
            self.RPC.init(data.client);
        });

        socket.on('reconnect', function () {
            console.log('reconnect client');
        })

        debug('ID: ', self.id, self.RPC.recMsgCounter);
    });
};

ClientRpc.prototype.simulateDisconnect = function () {
    this.RPC.socket.disconnect();
}

ClientRpc.prototype.simulateConnect = function () {
    this.RPC.socket.connect();
}



//Give library user access to socket io events
ClientRpc.prototype.on = function (event, callback) {

    return this.RPC.socket.on(event, callback);

};


ClientRpc.prototype.once = function (event, callback) {

    return this.RPC.socket.once(event, callback);

};


ClientRpc.prototype._close = function () {

    debug('Closing the connection');
    this.RPC.socket.close();

};


ClientRpc.prototype._open = function () {

    debug('Opening the connection');
    this.RPC.socket.open();

};


ClientRpc.prototype.id = function () {

    return this.socket.io.engine.id;

};


ClientRpc.prototype.expose = function (o) {

    this.RPC.expose(o);

};


ClientRpc.prototype.rpc = function (name) {
    var cb, due, args, actualArgs;
    
    args = Array.prototype.slice.call(arguments);
    actualArgs = args.slice(1, arguments.length);
    if(typeof actualArgs[actualArgs.length-1] === 'function'){
        cb = actualArgs.pop();
    }else if(typeof actualArgs[actualArgs.length-2] === 'function' && typeof actualArgs[actualArgs.length-1] === 'number'){
        due = actualArgs.pop();
        cb = actualArgs.pop();
    }

    this.RPC.rpc(name, actualArgs, cb, due);
};


ClientRpc.prototype.onConnected = function (callback) {

    this.RPC.onConnectedExec(callback);

};


ClientRpc.prototype.onDisconnected = function (callback) {

    this.RPC.onDisconnectedExec(callback);

};


ClientRpc.prototype.onceConnected = function (callback) {

    this.RPC.onceConnectedExec(callback);

};


ClientRpc.prototype.onceDisconnected = function (callback) {

    this.RPC.onceDisconnectedExec(callback);

};


module.exports = ClientRpc;
global.ClientRpc = ClientRpc;