var Handler = {

    defined : {},
    handlerCtr : 0,


    Generate : require('./handler-generate.js'),
    Transform : require('./handler-transform.js'),
    Predefined : require('./handler-predefined.js'),


    reservedKeywords : ['id'],
    handlerMethods :
        ['onException', 'onNativeException', 'onLibraryException', 'onApplicationException', 'onNetworkException'],
    callInterface :
        ['callName', 'callArgs', 'callError', 'callResult', 'callRetry', 'retry', 'alternativeCall', 'fail', 'succeed', 'continue', 'proceed', 'hasFailureContinuation', 'isCallErrorType'],
    handlerContext : 'ctxt',
    prioritySign : '+',
    annotationRegExp : /[\,\s]+([+]?[a-zA-Z_$]{1}[a-zA-Z0-9_$]*)([\[]{1}[a-zA-Z0-9_$,:\'\"]*[\]]{1})*/g,
    annotationOverridesRegExp : /[\[]*[,\s]*([a-zA-Z-0-9_]+)[:\s]{1}([0-9a-zA-Z\'\"_\s]+)[\]]*/g,

    makeLeafName : function (name) {
        return name + 'Handler';
    },

    makeProxyName : function (id) {
        return 'Proxy' + id;
    },



    init : function () {
        this.handlerCtr = 0;
        this.defined = {};
        this.reservedKeywords = ['id'];
            this.handlerMethods =
        ['onException', 'onNativeException', 'onLibraryException', 'onApplicationException', 'onNetworkException'];
            this.callInterface =
        ['callName', 'callArgs', 'callError', 'callResult', 'callRetry', 'retry', 'alternativeCall', 'fail', 'succeed', 'continue', 'proceed', 'hasFailureContinuation', 'isCallErrorType'];
            this.handlerContext = 'ctxt',
            this.prioritySign = '+',
            this.handlerUseRegExp = /[\,\s]+([+]?[a-zA-Z_$]{1}[a-zA-Z0-9_$]*)([\[]{1}[a-zA-Z0-9_$,:\'\"]*[\]]{1})*/g;
            this.handlerOverrideRegExp = /[\[]*[,\s]*([a-zA-Z-0-9_]+)[:\s]{1}([0-9a-zA-Z\'\"_\s]+)[\]]*/g;

            this.Predefined.generate(this);
    }

}


module.exports = Handler;
global.Handler = Handler;