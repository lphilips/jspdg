var toreturn = {};


var predefined = function (handler) {
    var logHandler,
        bufferHandler,
        retryHandler,
        noOpHandler,
        abortHandler;

    /* Handler for logging exceptions. */
    logHandler = esprima.parse("var log = {\
                propagate: true,\
                msg: '',\
                logger: UniqueLogger.getInstance(),\
                    onException: function (call) {\
                        this.logger.append(this.msg + ' CALL: ' + call.callName + ' ARGS: ' + call.callArgs() + ' ERROR: ' + call.callError);\
                        if(this.propagate) call.proceed();\
                    }, \
                    onNativeException: function (call) {\
                        this.logger.append(this.msg + ' CALL: ' + call.callName + ' ARGS ' + call.callArgs() + ' ERROR: ' + call.callError);\
                        this.logger.append(call.callError.stack);\
                        if(this.propagate) call.proceed();\
                    }\
            }").body[0].declarations[0];


    /* Handler for buffering RPCs on relevant exceptions. */
    bufferHandler = esprima.parse("var buffer = {\
                    due: Infinity,\
                    buffer: UniqueBuffer.getInstance(),\
                    onNetworkException: function (call) {\
                        var buffer = this.buffer,\
                            due = this.due;\
                        buffer.bufferCall(call, due);\
                    }\
                }").body[0].declarations[0];


    /* Handler for not retrying RPC on relevant exceptions. */
    retryHandler = esprima.parse("var retry = {\
                    times: 1,\
                    delay: 0,\
                    onNetworkException: function (call) {\
                        var self = this,\
                            times = this.times--,\
                            delay = this.delay;\
                        if(times > 0){\
                            setTimeout(function(){\
                                self.ctxt.retry();\
                            }, delay);\
                        }else{\
                            call.proceed();\
                        }\
                    }\
                }").body[0].declarations[0];


    /* Handler that does not do a thing. */
    noOpHandler = esprima.parse("var _noOpHandler = {\
                    onException: function (call) {\
                        call.proceed();\
                    }\
                }").body[0].declarations[0];


    /* Handler that halts the computation. */
    abortHandler = esprima.parse("var abort = {\
                    onException: function (call) {\
                    }\
                }").body[0].declarations[0];


    handler.Transform.handlerDefinition(logHandler, handler);
    handler.Transform.handlerDefinition(bufferHandler, handler);
    handler.Transform.handlerDefinition(retryHandler, handler);
    handler.Transform.handlerDefinition(noOpHandler, handler);
    handler.Transform.handlerDefinition(abortHandler, handler);

};

toreturn.generate = predefined;

global.handlerPreDefined = toreturn;
module.exports = toreturn;