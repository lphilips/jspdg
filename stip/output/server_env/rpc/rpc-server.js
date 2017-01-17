'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/
/*global TimeOutError, FunctionNotFoundError, LeaseExpiredError*/

var debug = require('debug')('rpc rpc server.js');

var _debug = true;
if (!_debug)
    debug = function () {};

var Server             = require('socket.io'),
    ServerSingleSocket = require('./rpc-server-single.js');

//
// RPC library, server side.
// 

/*
SERVER RPC OPTIONS: (defaults are mentioned)
    - stateTimeout: 300000
        How long is state kept after a client disconnected.
    - pingTimeout: 8000
        timeout from client to receive new heartbeat from server (value shipped to client).
    - pingInterval: 2500
        timeout when server should send heartbeat to client.
    - defaultRpcTimeout: Infinity
        default delay before an RPC call should have its reply. Infinity = no timeout
    - debugMode: true
        Native JS errors are re-thrown on the caller side, all stacktraces are serialized back to caller.    
*/


// SERVER RPC
var ServerRpc = function (app, port, opts) {
    var self = this;

    port       = port || 3000;
    opts       = opts || {};
    
    var serverHttp = require('http').createServer(app);
    serverHttp.listen(port, function() {
        console.log('Server listening at port %d', port);
    });
    
    this.io                   = new Server(serverHttp, getSocketOptions(opts));
    this.clientChannels       = {};
    this.exposedFunctions     = {};
    this.onConnectionCallback = function () {};

    this.io.on('connection', function (socket) {

        console.log('NEW Connection ', socket.id);
        debug('  self.clientChannels: ', Object.keys(self.clientChannels).length);
        var serverSocket;

        socket.once('init', function (data) {
            var clientId = data.client || self.generateUID();
            var oldClient = self._findById(clientId);

            if (oldClient) {

                oldClient._newSocket(socket);
                oldClient.expose(self.exposedFunctions);
                serverSocket = oldClient;

                console.log('returning client.');

            } else {

                serverSocket = new ServerSingleSocket(socket, opts, self);
                serverSocket.expose(self.exposedFunctions);

                console.log('new client.');
                self.clientChannels[clientId] = serverSocket;


            }
            serverSocket.id = clientId;
            socket.emit('init-ack', {
                'client': clientId,
                'recMsgCounter': serverSocket.RPC.recMsgCounter
            });

            serverSocket.RPC.sendMsgCounter = Math.max(data.recMsgCounter, serverSocket.RPC.sendMsgCounter);

            //Only now everything is initialized
            serverSocket.RPC.init(clientId);
            self.onConnectionCallback(serverSocket);

            debug('  self.clientChannels: ', Object.keys(self.clientChannels).length);

        });

    });
};


var getSocketOptions = function (options) {
    //see server options
    //https://github.com/Automattic/engine.io/blob/master/lib/server.js#L38
    var opts          = {};
    opts.pingTimeout  = options.pingTimeout || 8000;
    opts.pingInterval = options.pingInterval || 2500;

    return opts;
};


ServerRpc.prototype.generateUID = function () {
    var userID = 'client-' + Math.floor((Math.random() * 1000) + 1) + '-' + Math.floor((Math.random() * 1000) + 1);
    var clients = this.clientChannels;

    for (var id in clients) {
        if (clients[id].id === userID) {
            return this.generateUID();
        }
    }

    return userID;
};


ServerRpc.prototype._findById = function (clientId) {
    var clients = this.clientChannels;

    for (var id in clients) {
        if (clients.hasOwnProperty(id)) {

            //find previous socket used
            if (clients[id].id === clientId) {
                return clients[id];
            }
        }
    }

    return false;
};


ServerRpc.prototype.expose = function (o) {
    this.exposedFunctions = o;
};


//broadcast
ServerRpc.prototype.rpc = function (name) {
    var cb, due, args, actualArgs;
    
    args = Array.prototype.slice.call(arguments);
    actualArgs = args.slice(1, arguments.length);
    if(typeof actualArgs[actualArgs.length-1] === 'function'){
        cb = actualArgs.pop();
    }else if(typeof actualArgs[actualArgs.length-2] === 'function' && typeof actualArgs[actualArgs.length-1] === 'number'){
        due = actualArgs.pop();
        cb = actualArgs.pop();
    }

    var clients = this.clientChannels;
    if (Object.keys(clients).length === 0)
        debug('RPC CALL, but no connections.');

    for (var id in clients) {
        if (clients.hasOwnProperty(id)) {
            clients[id].rpc(name, actualArgs, cb, due);
        }
    }
};


//call a specific client
ServerRpc.prototype.rpcTo = function (receiverClient) {
    var cb, due;
    
    var serverSocket = this._findById(receiverClient);
    if(serverSocket){
        var args = Array.prototype.slice.call(arguments);
        args.shift();//client
        var name = args.shift();

        if(typeof args[args.length-1] === 'function'){
            cb = args.pop();
        }else if(typeof args[args.length-2] === 'function' && typeof args[args.length-1] === 'number'){
            due = args.pop();
            cb = args.pop();
        }

        serverSocket.rpc(name, args, cb, due);
    }
};


ServerRpc.prototype.deleteChannel = function (id) {
    debug('deleting ', id);

    delete this.clientChannels[id];
    debug('== self.clientChannels: ', Object.keys(this.clientChannels).length);
};


//Callback will be invoked on every new connection
ServerRpc.prototype.onConnection = function (callback) {
    this.onConnectionCallback = callback;
};



////////////////////////////////////////////////////////////////////////////////////////////

module.exports = ServerRpc;