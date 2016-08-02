var handlerGenerate = (function () {

    var toreturn = {};

    var handlerProxySetup = function (target) {
        target = target || 'client';
        return esprima.parse('var fp = makeFailureProxy(' + target + ');').body[0];
    };

    var handlerProxyDefinition = function (name, handler) {
        return {
            'type': 'VariableDeclaration',
            'declarations': [{
                'type': 'VariableDeclarator',
                'id': {
                    'type': 'Identifier',
                    'name': name
                },
                'init': {
                    'type': 'CallExpression',
                    'callee': {
                        'type': 'Identifier',
                        'name': 'fp'
                    },
                    'arguments': [{
                        'type': 'Identifier',
                        'name': handler
                    }]
                }
            }],
            'kind': 'var'
        }
    };



    var getHandlerDefinition = function (current) {
        var handlerName = current.getHandler(),
            uniqueName        = current.getUniqueName(),
            parent            = current.getParent(),
            handlerDefinition = Handler.defined[handlerName];

        if (!handlerDefinition) {
            handlerDefinition = false;

            console.log('Warning: Handler definition \'' + handlerName + '\' not found.');

            if (current.isTopNode()) {

                handlerDefinition = Handler.defined._noOpHandler;
            }
        }

        return handlerDefinition;
    };


    var handlerState = {}; // building state for leaves
    var makeHandlerNode = function (current) {
        var handlerName = current.getHandler(),
            uniqueName = current.getUniqueName(),
            leafName   = current.getLeafName(),
            parent     = current.getParent(),
            priority   = current.getPriority(),
            rpcCount   = current.getRpcCount(),
            id         = current.getId(),
            overrides  = current.getFieldOverrides();

        if (current.isTopNode()) { //top node
            parent = undefined;
        }

        var handlerDefinition = getHandlerDefinition(current);

        if (!handlerDefinition) {
            console.log('Warning: Handler definition \'' + handlerName + '\' not found.');
            handlerDefinition = Handler.defined._noOpHandler; //use the predefined no-operation handler
        }

        var handlerMethods = handlerDefinition.handlerMethods();
        //make sure the new state identifiers have correct name
        handlerState[uniqueName] = handlerDefinition.constructorBody(uniqueName, overrides);

        if (handlerState[parent]) //also take the parent' state
            handlerState[uniqueName] = handlerState[uniqueName].concat(handlerState[parent].slice());

        var generatedhandlers = [];
        //make handler
        generatedhandlers.push(handlerDefinition.newHandler(id, uniqueName, parent, priority, handlerMethods, []));

        if (rpcCount > 0) //make its corresponding leaf
            generatedhandlers.push(handlerDefinition.newHandler(null, leafName, uniqueName, false, [], handlerState[uniqueName]));

        return generatedhandlers;
    };

    var init = function () {
        handlerState = {};
    };

    toreturn.proxySetup        = handlerProxySetup;
    toreturn.proxyDefinition   = handlerProxyDefinition;
    toreturn.handlerDefinition = getHandlerDefinition;
    toreturn.handlerNode       = makeHandlerNode;
    toreturn.init              = init;

    if (typeof module !== 'undefined' && module.exports !== null) {
        exports.handlerGenerate = toreturn;
    }


    return toreturn;
})();