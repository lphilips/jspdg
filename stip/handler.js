
var Handler = (function () {
    var toreturn    = {};
    var defined    = {};
    var handlerCtr = 0;


    if (typeof module !== 'undefined' && module.exports !== null) {
        handlerGenerate = require('./handler-generate.js').handlerGenerate;
        handlerTransform = require('./handler-transform.js').handlerTransform;
        handlerPreDefined = require('./handler-predefined.js').handlerPreDefined;

    }

    var reservedKeywords = ['id'];
    var handlerMethods =
        ['onException', 'onNativeException', 'onLibraryException', 'onApplicationException', 'onNetworkException'];
    var callInterface =
        ['callName', 'callArgs', 'callError', 'callResult', 'callRetry', 'retry', 'alternativeCall', 'fail', 'succeed', 'continue', 'proceed', 'hasFailureContinuation', 'isCallErrorType'];
    var handlerContext   = 'ctxt';
    var prioritySign     = '+';
    var annotationRegExp = /[\,\s]+([+]?[a-zA-Z_$]{1}[a-zA-Z0-9_$]*)([\[]{1}[a-zA-Z0-9_$,:\'\"]*[\]]{1})*/g;
    var annotationOverridesRegExp = /[\[]*[,\s]*([a-zA-Z-0-9_]+)[:\s]{1}([0-9a-zA-Z\'\"_\s]+)[\]]*/g;

    var makeLeafName = function (name) {
        return name + 'Handler';
    };

    var makeProxyName = function (id) {
        return 'Proxy' + id;
    };

    var generate   = handlerGenerate;
    var transform  = handlerTransform;
    var predefined = handlerPreDefined;
    


    var init = function () {
        Handler.handlerCtr = 0;
        Handler.defined = {};
        Handler.Predefined.generate();

    };

    toreturn.defined    = defined;
    toreturn.handlerCtr = handlerCtr;
    toreturn.init       = init;

    toreturn.reservedKeywords    = reservedKeywords;
    toreturn.handlerMethods   = handlerMethods;
    toreturn.callInterface    = callInterface;
    toreturn.prioritySign     = prioritySign;
    toreturn.handlerUseRegExp = annotationRegExp;
    toreturn.handlerOverrideRegExp = annotationOverridesRegExp;
    toreturn.handlerContext = handlerContext;

    toreturn.makeLeafName  = makeLeafName;
    toreturn.makeProxyName = makeProxyName;

    toreturn.Generate   = generate;
    toreturn.Transform  = transform;
    toreturn.Predefined = predefined;

    if (typeof module !== 'undefined' && module.exports !== null) {
        exports.Handler = toreturn;
    }


    return toreturn;
})();