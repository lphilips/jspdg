'use strict';

var debug = require('debug')('handler buffer');

var UniqueBuffer = (function () {
    var instance;

    function createInstance() {
        return new BufferSingleton();
    };

    return {
        getInstance: function () {
            if (!instance) {
                instance = createInstance();
            }
            return instance;
        }
    }
})();


var BufferSingleton = function () {
    this.buffer = [];
    this.flushInstalled = false;
    this.waitForResult = false;
    this.counter = 0;
};

BufferSingleton.prototype.bufferCall = function (call, timeout) {
    var self = this,
        currentId = this.counter++,
        removeCall;

    debug('Buffering call for max ', timeout, ' ms.');

    if(timeout !== Infinity)
        removeCall=setTimeout(function(){
            var thunk = self._removeCall(currentId);
            debug('Call removed from buffer');
            thunk.call.proceed();
            }, timeout);

    var thunk = {
        id:currentId,
        removeCall:removeCall,
        call:call
    };
    
    this.buffer.push(thunk);
    debug('Buffer call', call, ' for max ', timeout, ' ms. ('+currentId+') Calls buffered: ', this.buffer.length);

    this._prepareFlush(call.stub);
    //call.hasFailureContinuation();
};

BufferSingleton.prototype.flushBuffer = function () {
    var self = this;
    var buffer = this.buffer;

    debug('Flush buffer', buffer, this.waitForResult);
    if (!buffer.length) {
        this.flushInstalled = false;
        return;
    }

    if (this.waitForResult) return;
    this.waitForResult = true;

    var thunk = buffer.shift();
    clearTimeout(thunk.removeCall);

    //only continue with next call if the previous is entirely finished.
    thunk.call._doOnResolved(function () {
        self.waitForResult = false;
        self.flushBuffer();
    });

    thunk.call.retry();
};

BufferSingleton.prototype._prepareFlush = function (stub) {
    var self = this;
    if (this.flushInstalled) return;
    this.flushInstalled = true;

    stub.onceConnected(function () {
        self.flushBuffer();
    });
};

BufferSingleton.prototype._removeCall = function (id) {
    var pos, result;

    this.buffer.map(function(e, i){
        if(e.id === id)
            pos = i;
    });

    if(pos >= 0)
        result = this.buffer.splice(pos,1)[0];

    return result;

};

global.UniqueBuffer = UniqueBuffer;
