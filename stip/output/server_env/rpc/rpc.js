'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/
/*global TimeOutError, FunctionNotFoundError, LeaseExpiredError, NoConnectionError, MsgOutOfOrderError, TooManyArgumentsError*/

var debug = require('debug')('rpc rpc.js');

var _debug = true;
if (!_debug)
    debug = function () {};

var ExceptionHandler = require('./exception-handler.js');

//
// RPC library (Client + Server)
//

//RPC Constructor
var RPC = function (socket, options) {
    debug('NEW RPC created', options);

    this.socket            = socket;
    this.defaultRpcTimeout = options.defaultRpcTimeout;
    this.debugMode         = options.debugMode;

    this.exceptionHandler = new ExceptionHandler(this.debugMode);
    this.exposedFunctions = {};
    this.openCalls        = [];
    this.currentCall      = null;
    this.sendMsgCounter   = 1;
    this.recMsgCounter    = 1;
    this.lastResults      = {};

    this.error       = null;
    this.connected   = false;

    this.onConnected      = [];
    this.onDisconnected   = [];
    this.onceConnected    = [];
    this.onceDisconnected = [];

    this._initListeners(socket);
};

RPC.prototype.newSocket = function (socket) {
    this.socket           = socket;
    this.error            = null;
    this.connected        = false;
    this.exposedFunctions = {};

    this._initListeners(socket);
};

RPC.prototype._initListeners = function (socket) {
    var self = this;
    socket.on('connect', function () {
        debug('Connect');
        self.connected = true;
    });

    socket.on('disconnect', function () {
        debug('Disconnect');
        self.connected = false;
        self.failOpenCalls();

        self._executeEvents(self.onDisconnected);
        self._executeEvents(self.onceDisconnected);
        self.onceDisconnected = [];
    });

    socket.on('error', function (o) {
        console.error(o.stack);
        self.error = o;
    });
};

RPC.prototype.init = function (id) {
    debug('RPC INIT');
    this.connected = true;
    this.initialized = true;
    this.id = id;
    this._executeEvents(this.onConnected);
    this._executeEvents(this.onceConnected);
    this.onceConnected = [];

    //We can now start sending
    this._doSend();
};

//Expose functions to be called as RPCs
RPC.prototype.expose = function (o) {
    var self = this;
    var prop;

    for (prop in o) {
        if (!o.hasOwnProperty(prop)) {
            continue;
        }
        this._exposeFunction(prop, o[prop]);
    }

    //incoming function call
    this.socket.on('CALL', function (data) {
        debug('INCOMING DATA', data);

        var saved = self.exposedFunctions[data.name];
        
        if (!data.name || !data.args || !saved) {

            var exception = new FunctionNotFoundError('Function not found.');
            self.socket.emit(data.reply, {
                error: self.exceptionHandler.serialize(exception)
            });

            self.recMsgCounter++;
        } else if(data.args.length > saved.arity){
            
            var exception = new TooManyArgumentsError('Expected at most ' + saved.arity + ' arguments for \'' + data.name + '\'.');
            self.socket.emit(data.reply, {
                error: self.exceptionHandler.serialize(exception)
            });

            self.recMsgCounter++;
        } else {
            while(data.args.length < saved.arity){
                data.args.push(undefined);
            }
            //lookup and apply
            saved.closure(data.args, data.reply, data.msgId);

        }

    });
};

//Generate a 'random' ID
RPC.prototype.generateID = function (name) {

    return name + Math.floor((Math.random() * 1000000) + 1);

};

RPC.prototype.emit = function (ev, data) {

    this.socket.emit(ev, data);

};

//Expose a certain function
RPC.prototype._exposeFunction = function (name, func) {
    var self = this;

    var closure = function (args, replyId, recMsgCounter) {
        debug('msg', replyId, recMsgCounter);
        var oldMsg = self.lastResults[recMsgCounter];

        //we received a counter for which we already computed the result.
        //we have to be sure it is for the same function though, hence
        //their replyId's must match as well.
        //This corner case can happen when client sends an RPC, does not get the result (no msgCtr++)
        //decides not to try again but perform another RPC later with the same msgCtr.
        if (oldMsg) {
            if (oldMsg.replyId === replyId) {
                debug('REPLY OLD RESULT', replyId);

                self.socket.emit(replyId, oldMsg.outcome);

                //todo remove old results
                return;
            }
            //this case should not occur.
            debug('REPLY UPDATED OLD');
            self.recMsgCounter--;
        }

        if (recMsgCounter > self.recMsgCounter) {
            //We have missed a couple of RPCs.
            debug('Expected ' + self.recMsgCounter + ' received' + recMsgCounter);
            self.recMsgCounter = recMsgCounter;
        }

        var cbInvoked = false;
        var sendReply = function(err, res){
            cbInvoked = true;
            
            var rpcReply;
            if(err){
                rpcReply = {
                    error: self.exceptionHandler.serialize(err),
                };
                debug('REPLY NORMAL ERROR', replyId, err);
            }else{
                rpcReply = {
                    result: res
                };
                debug('REPLY NORMAL RESULT', replyId, res);
            }
            self.socket.emit(replyId, rpcReply);

            //save result for possible later retransmission (Omission failures).
            self.lastResults[recMsgCounter] = {
                replyId: replyId,
                outcome: rpcReply
            };

            self.recMsgCounter++;
            
        };

        args.push(sendReply);

        var error;
        try {
            //Call and reply
            func.apply(self, args);

            if(!cbInvoked){
                sendReply(null);
            }

        } catch (e) {
            error = e;
            sendReply(e);
        }

        //for debugging, rethrow native exceptions like ReferenceError, SyntaxError etc,
        if (error && self.debugMode && self.exceptionHandler.isNativeError(error)){
            throw error;
        }

    };

    if (this.exposedFunctions[name])
        throw new Error('No function overloading, overwriting previous ', name);

    //save the closure
    this.exposedFunctions[name] = {
        name: name,
        arity: func.length-1,
        closure: closure
    };
};

//Do the actual RPC
RPC.prototype._doSend = function () {
    if (!this.currentCall) {

        this.currentCall = true;
        var nextCall = this.openCalls[0];
        //todo maybe pick the one with the lowest sendCounter

        if (nextCall) {
            var toSend = {
                name:  nextCall.functionName,
                args:  nextCall.actualParameters,
                reply: nextCall.replyId,
                msgId: nextCall.msgCtr
            };

            
            if (!this.connected) {
                debug('FAIL CALL', toSend, this.socket.id);

                this.openCalls.shift();
                nextCall.removeListener();

                nextCall.continuation(new NoConnectionError('No connection error: (disconnected).'), undefined, this._retryRPC(nextCall));
                this.currentCall = false;
                return;
            }

            debug('SEND CALL', toSend, this.socket.id);

            this.socket.emit('CALL', toSend);
        } else {
            //nothing to send atm, indicate that we are waiting for new RPCs.
            this.currentCall = false;

        }
    }

};

//Perform a Remote Procedure Call optionally take callback and due
RPC.prototype.rpc = function (name, args, callback, due, replyId, msgCtr) {
    var self = this;
    var listener, timer;

    args     = (args instanceof Array) ? args : [args];
    callback = callback || function () {};
    due      = due || this.defaultRpcTimeout;
    replyId  = replyId || this.generateID(name);

    debug('rpc', this.socket.id);

    //New transmissions don't have a message counter yet.
    if (!msgCtr) {
        msgCtr = this.sendMsgCounter;
        this.sendMsgCounter++;
    }

    if (!name) throw new Error('Undefined function name');


    var removeOpenCall = function (replyId) {
        var callsWaiting = self.openCalls;
        for (var i in callsWaiting) {
            if (replyId === callsWaiting[i].replyId) {
                debug(' REMOVING call replyId: ', callsWaiting[i].replyId);
                return callsWaiting.splice(i, 1)[0];
            }
        }
    };


    if (due !== Infinity)
        timer = setTimeout(function () {
            var err = new TimeOutError(name + ' ' + args + ' call timed out.');
            var thunk = removeOpenCall(replyId);

            thunk.removeListener();
            callback(err, undefined, self._retryRPC(thunk)); //Timed out
            self.currentCall = false;
            self._doSend();
        }, due);

    listener =
        function (data) {
            return function (result, replyId) {
                var err = result.error,
                    res = result.result;

                debug('REPLY LISTENER ', res, replyId);

                var thunk = removeOpenCall(replyId);
                if (timer) clearTimeout(timer);

                if (!err) {

                    callback(null, res); //Regular return, everything ok 

                } else {

                    callback(self.exceptionHandler.deserialize(err), undefined, self._retryRPC(thunk)); //Remote exception

                }

                //continue sending

                self.currentCall = false;
                self._doSend();
            }(data, replyId);
        };

    //wait for reply
    this.socket.once(replyId, listener);

    var thunk = {
        listener:         listener,
        functionName:     name,
        actualParameters: args,
        continuation:     callback,
        due:              due,
        replyId:          replyId,
        msgCtr:           msgCtr, //can be undefined ATM.
        removeListener:   function () {
            self.socket.removeListener(replyId, this.listener);
        }
    };

    this.openCalls.push(thunk);
    debug('SAVING call', thunk.functionName, thunk.replyId);

    //try sending.
    if (!this.currentCall && this.initialized)
        self._doSend();
};

RPC.prototype._retryRPC = function (thunk) {
    var self = this;

    //We let the user change the callback but not the other parameters.
    //Because even though we are performing a retry the original call can already be 
    //executed on the callee, hence we must use same arguments / name.
    //The CB stays local so it may change.
    return function (newContinuation) {
        var savedContinuation = thunk.continuation;

        if (newContinuation) {
            thunk.continuation = newContinuation(savedContinuation);
        }

        self._rpcFromThunk(thunk);
    };
};


RPC.prototype._rpcFromThunk = function (thunk) {
    return this.rpc(thunk.functionName, thunk.actualParameters,
        thunk.continuation, thunk.due, thunk.replyId, thunk.msgCtr);
};


RPC.prototype.failOpenCalls = function () {
    var currentCalls = this.openCalls;

    debug('failing open calls', this.openCalls.length, this.openCalls);

    while (currentCalls.length !== 0) {
        var thunk = currentCalls.shift();
        var err = new NoConnectionError('No connection error: (heartbeat).');
        thunk.removeListener();
        thunk.continuation(err, undefined, this._retryRPC(thunk));
    }

    this.currentCall = false;

};


RPC.prototype.onConnectedExec = function (callback) {
    this.onConnected.push(callback);
};


RPC.prototype.onDisconnectedExec = function (callback) {
    this.onDisconnected.push(callback);
};


RPC.prototype.onceConnectedExec = function (callback) {
    this.onceConnected.push(callback);
};


RPC.prototype.onceDisconnectedExec = function (callback) {
    this.onceDisconnected.push(callback);
};


RPC.prototype._executeEvents = function (callbackList) {
    if (callbackList.length === 0) debug('empty callbackList');

    for (var i in callbackList) {
        callbackList[i]();
    }
};
////////////////////////////////////////////////////////////////////////////////////////////

module.exports = RPC;