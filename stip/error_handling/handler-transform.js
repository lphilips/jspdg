var estraverse = require('estraverse');

var toreturn = {};

var renameIdentifier = function (identifier, string) {
    return identifier + "_" + string;
};

var createBlockStatement = function (body) {
    return {
        type: 'BlockStatement',
        body: body
    }
};

var createIdentifier = function (name) {
    return {
        "type": "Identifier",
        "name": name
    }
}

var createField = function (fieldName, rhs) {
    return function (name) {
        var newName = renameIdentifier(fieldName, name) || fieldName;
        return {
            'type': 'ExpressionStatement',
            'expression': {
                'type': 'AssignmentExpression',
                'operator': '=',
                'left': {
                    'type': 'MemberExpression',
                    'computed': false,
                    'object': {
                        'type': 'ThisExpression'
                    },
                    'property': {
                        'type': 'Identifier',
                        'name': newName
                    }
                },
                'right': JSON.parse(JSON.stringify(rhs))
            }
        }
    };
};

var createMethod = function (methodName, functionExpressionNode) {
    return function (objectName) {
        return {
            'type': 'ExpressionStatement',
            'expression': {
                'type': 'AssignmentExpression',
                'operator': '=',
                'left': {
                    'type': 'MemberExpression',
                    'computed': false,
                    'object': {
                        'type': 'Identifier',
                        'name': objectName
                    },
                    'property': {
                        'type': 'Identifier',
                        'name': methodName
                    }
                },
                'right': JSON.parse(JSON.stringify(functionExpressionNode))
            }
        }
    };
};

var createConstructor = function (constructorName, bodyNode) {
    return {
        'type': 'VariableDeclaration',
        'declarations': [{
            'type': 'VariableDeclarator',
            'id': {
                'type': 'Identifier',
                'name': constructorName
            },
            'init': {
                'type': 'FunctionExpression',
                'id': null,
                'params': [],
                'defaults': [],
                'body': {
                    'type': 'BlockStatement',
                    'body': JSON.parse(JSON.stringify(bodyNode))
                },
                'generator': false,
                'expression': false
            }
        }],
        'kind': 'var'
    }
};

var createSuperMethod = function (objectName, parentNodeName) {
    return {
        "type": "ExpressionStatement",
        "expression": {
            "type": "AssignmentExpression",
            "operator": "=",
            "left": {
                "type": "MemberExpression",
                "computed": false,
                "object": {
                    "type": "Identifier",
                    "name": objectName
                },
                "property": {
                    "type": "Identifier",
                    "name": "parent"
                }
            },
            "right": {
                "type": "Identifier",
                "name": parentNodeName
            }
        }
    }
};

var createHandlerIdentifier = function (objectName, id) {
    return {
        'type': 'ExpressionStatement',
        'expression': {
            'type': 'AssignmentExpression',
            'operator': '=',
            'left': {
                'type': 'MemberExpression',
                'computed': false,
                'object': {
                    'type': 'Identifier',
                    'name': objectName
                },
                'property': {
                    'type': 'Identifier',
                    'name': 'id'
                }
            },
            'right': {
                'type': 'Literal',
                'value': id,
                'raw': id.toString()
            }
        }
    }
};

// var createPriorityMethod = function (objectName, hasPriority) {
//  return {
//      'type': 'ExpressionStatement',
//      'expression': {
//          'type': 'AssignmentExpression',
//          'operator': '=',
//          'left': {
//              'type': 'MemberExpression',
//              'computed': false,
//              'object': {
//                  'type': 'Identifier',
//                  'name': objectName
//              },
//              'property': {
//                  'type': 'Identifier',
//                  'name': 'flagPriority'
//              }
//          },
//          'right': {
//              'type': 'Literal',
//              'value': hasPriority,
//              'raw': hasPriority.toString()
//          }
//      }
//  }
// };

var createSetPrototype = function (objectName) {
    return {
        'type': 'ExpressionStatement',
        'expression': {
            'type': 'AssignmentExpression',
            'operator': '=',
            'left': {
                'type': 'MemberExpression',
                'computed': false,
                'object': {
                    'type': 'Identifier',
                    'name': objectName
                },
                'property': {
                    'type': 'Identifier',
                    'name': 'prototype'
                }
            },
            'right': {
                'type': 'NewExpression',
                'callee': {
                    'type': 'Identifier',
                    'name': 'HandlerNode'
                },
                'arguments': []
            }
        }
    }
};

var createSetConstructor = function (objectName) {
    return {
        'type': 'ExpressionStatement',
        'expression': {
            'type': 'AssignmentExpression',
            'operator': '=',
            'left': {
                'type': 'MemberExpression',
                'computed': false,
                'object': {
                    'type': 'MemberExpression',
                    'computed': false,
                    'object': {
                        'type': 'Identifier',
                        'name': objectName
                    },
                    'property': {
                        'type': 'Identifier',
                        'name': 'prototype'
                    }
                },
                'property': {
                    'type': 'Identifier',
                    'name': 'constructor'
                }
            },
            'right': {
                'type': 'Identifier',
                'name': objectName
            }
        }
    }
};

var createToStringMethod = function (objectName) {
    return {
        "type": "ExpressionStatement",
        "expression": {
            "type": "AssignmentExpression",
            "operator": "=",
            "left": {
                "type": "MemberExpression",
                "computed": false,
                "object": {
                    "type": "Identifier",
                    "name": objectName
                },
                "property": {
                    "type": "Identifier",
                    "name": "toString"
                }
            },
            "right": {
                "type": "FunctionExpression",
                "id": null,
                "params": [],
                "defaults": [],
                "body": {
                    "type": "BlockStatement",
                    "body": [
                        {
                            "type": "ReturnStatement",
                            "argument": {
                                "type": "Literal",
                                'value': ' -' + objectName,
                                'raw': ' - ' + objectName
                            }
                        }
                    ]
                },
                "generator": false,
                "expression": false
            }
        }
    };
};

var makeHandler = function (handlerMethods, constructorBody, identifiers) {
    identifiers = identifiers || [];


    var renameSelfIdentifiers = function (parsenode, string, handlerName) {
        estraverse.replace(parsenode, {
            enter: function (node, upnode) {

                if (Aux.isMemberExpression(node) && Aux.isThisExpression(node.object) && Aux.isIdentifier(node.property)) {
                    var fieldToRename = node.property.name;

                    //self method -> handler class method
                    if (identifiers.filter(function (e) {
                            return e.key === fieldToRename && e.classIdentifier
                        }).length !== 0) {

                        node.object = createIdentifier(handlerName);
                    } else if (identifiers.filter(function (e) { //other identifiers that have to be renamed to avoid nameclashes.
                            return e.key === fieldToRename && !e.classIdentifier
                        }).length !== 0) {

                        node.property.name = renameIdentifier(fieldToRename, string);

                    }
                }
            }
        });
    }

    var doAnnotOverride = function (parsenode, handlerName, annotOverrides) {
        estraverse.replace(parsenode, {
            enter: function (node, upnode) {

                if (Aux.isAssignmentExp(node) && Aux.isMemberExpression(node.left) && Aux.isIdentifier(node.left.property)) {
                    var name = node.left.property.name;

                    var override = annotOverrides.filter(function (e) {
                        return name === renameIdentifier(e.field, handlerName)
                    });

                    if (override.length >= 1) {

                        var newValue = override[override.length - 1];
                        node.right = newValue.value;
                    }

                }

            }
        });
    }


    return {
        handlerMethods: function () {
            return handlerMethods.slice();
        },
        constructorBody: function (name, annotationOverrides) {
            return constructorBody.slice().map(function (e) {
                var stm = e(name);
                doAnnotOverride(stm, name, annotationOverrides);
                renameSelfIdentifiers(stm, name, name);
                return stm;
            });
        },
        //keep the current handler info accessible as annotations in code will decide where
        //constructorBody and the methods will end up.
        newHandler: function (id, handlerName, parentNodeName, hasPriority, methods, body) {
            var handler = [];


            // Add a constructor.
            handler.push(createConstructor(handlerName, body));

            //
            if (parentNodeName)
                handler.push(createSuperMethod(handlerName, parentNodeName));

            //handler.push(createPriorityMethod(handlerName, hasPriority));
            if (!id) {

                handler.push(createSetPrototype(handlerName));
                handler.push(createSetConstructor(handlerName));

            } else {

                handler.push(createHandlerIdentifier(handlerName, id));

            }

            handler.push(createToStringMethod(handlerName));

            methods.map(function (method) {
                handler.push(method(handlerName));
            });


            var result = createBlockStatement(handler);
            //rename all identifiers that have to be renamed and are not yet renamed.
            renameSelfIdentifiers(result, (body.length === 0) ? handlerName : parentNodeName, handlerName);

            return result;
        }
    }
};

var isSpecialHandlerProperty = function (node, handler) {
    return handler.handlerMethods.indexOf(node.key.name) != -1;
};

/*
 Takes a handler in JS object literal notation and performs the necessary transformations.
 */
var extractHandlerObject = function (node, handler) {
    var name = node.id.name;
    var methods = [];
    var constructorBody = [];
    var identifiersRename = [];
    var hasHandlerMethod = false;

    function makeRenameObject(key, classIdentifier) {
        return {
            key: key,
            classIdentifier: classIdentifier
        }
    }

    //Perform renames and warn about inconsistencies
    estraverse.replace(node, {
        enter: function (node, parent) {

            //Remove any reserved
            if (Aux.isProperty(node) && Aux.isIdentifier(node.key) && handler.reservedKeywords.indexOf(node.key.name) != -1) {
                console.log('Warning ' + node.key.name + " is a reserved keyword, consider renaming it.");
                this.remove();
            }

            //replace first arg of special handler methods by field access.
            if (Aux.isProperty(node) && Aux.isIdentifier(node.key) && isSpecialHandlerProperty(node, handler)) {
                hasHandlerMethod = true;
                if (node.value.params.length && Aux.isIdentifier(node.value.params[0])) { //first arg
                    var argName = node.value.params[0].name;
                    node.value.params = [];

                    //only in the body of the method
                    var body = node.value.body;
                    estraverse.replace(body, {
                        enter: function (node, parent) {
                            if (Aux.isIdentifier(node) && node.name === argName) {

                                if (parent.property && parent.property.name && handler.callInterface.indexOf(parent.property.name) === -1)
                                    throw new Error('Error: identifier \'' + parent.property.name + '\' does not appear in call interface in ' + name + '.');

                                return {
                                    'type': 'MemberExpression',
                                    'computed': false,
                                    'object': {
                                        'type': 'ThisExpression'
                                    },
                                    'property': {
                                        'type': 'Identifier',
                                        'name': handler.handlerContext
                                    }
                                };
                            }
                        }
                    });
                }
            }

            //Take the field identifiers in: var obj = {field:...} for renaming.
            if (Aux.isProperty(node) && Aux.isIdentifier(node.key)) {
                var fieldToRename = node.key.name;

                if (Aux.isFunExp(node.value)) {
                    identifiersRename.push(makeRenameObject(fieldToRename, true));
                    return;
                }

                identifiersRename.push(makeRenameObject(fieldToRename, false));
            }
        }
    });

    handler.reservedKeywords.map(function (e) {
        identifiersRename.push(makeRenameObject(e, true));
    })

    if (!hasHandlerMethod) {
        console.log('Handler ' + name + ' does not have one of the required handler methods. Consider adding one of: ' + Handler.handlerMethods.toString() + ".")
    }

    //Transform object properties.
    estraverse.traverse(node, {
        enter: function (node) {
            if (Aux.isProperty(node) && Aux.isIdentifier(node.key)) {
                var methodName = node.key.name;

                //only special handler methods will stay
                if (Aux.isFunExp(node.value)) {
                    methods.push(createMethod(methodName, node.value));
                } else {
                    //other methods and fields, will become fields in constructor
                    constructorBody.push(createField(methodName, node.value));
                }
            }
        }
    });

    if (handler.defined[name])
        console.log('Warning overriding handler \'' + name + '\'.');

    handler.defined[name] = makeHandler(methods, constructorBody, identifiersRename);
};


var makeHandlerAnnotation = function (parent, uniqueName, handler, priority, id, fieldOverrides) {
    return {
        _parent: parent,
        _uniqueName: uniqueName,
        _handler: handler,
        _rpcCount: 0,
        _priority: priority,
        _leafName: Handler.makeLeafName(uniqueName),
        _id: id,
        _fieldOverrides: fieldOverrides,

        getParent: function () {
            return this._parent;
        },
        setParent: function (parent) {
            this._parent = parent;
        },

        getUniqueName: function () {
            return this._uniqueName;
        },
        setUniqueName: function (uniqueName) {
            this._uniqueName = uniqueName;
        },

        getHandler: function () {
            return this._handler;
        },
        setHandler: function (handler) {
            this._handler = handler;
        },

        getRpcCount: function () {
            return this._rpcCount;
        },
        setRpcCount: function (rpcCount) {
            this._rpcCount = rpcCount;
        },
        incRpcCount: function () {
            this._rpcCount++;
        },

        getPriority: function () {
            return this._priority;
        },
        setPriority: function (priority) {
            this._priority = priority;
        },

        getId: function () {
            return this._id;
        },
        setId: function (id) {
            this._id = id;
        },

        getLeafName: function () {
            return this._leafName;
        },
        setLeafName: function (leafName) {
            this._leafName = leafName;
        },

        isTopNode: function () {
            return this._uniqueName === this._parent;
        },

        getFieldOverrides: function () {
            return this._fieldOverrides;
        },
        setFieldOverrides: function (val) {
            this._fieldOverrides = val;
        }
    }
};

/*
 Take a use handler JS object annotation.
 */
var extractUseHandlerAnnotation = function (lastParent, comment) {
    var regexp = Handler.handlerUseRegExp,
        regexpOverride = Handler.handlerOverrideRegExp,
        annotations = [],
        currentOverrides = [],
        match,
        annotName,
        overrides,
        overridesMatch,
        parsedVal;

    if (comment.search(regexp) >= 0) {
        match = regexp.exec(comment);
        while (match != null) {

            Handler.handlerCtr++;

            annotName = match[1];
            overrides = match[2];
            currentOverrides = [];

            if (overrides) {
                overridesMatch = regexpOverride.exec(overrides);

                while (overridesMatch != null) {

                    try {

                        var parsedVal = esprima.parse(overridesMatch[2]).body[0].expression;
                        currentOverrides.push(
                            {
                                field: overridesMatch[1],
                                value: parsedVal
                            });

                    } catch (e) {
                        console.log('Warning: failed to parse ' + overridesMatch[1] + ', value ignored.')
                    }

                    overridesMatch = regexpOverride.exec(overrides);
                }
            }


            var priority = false;
            if (annotName.substr(0, 1) === Handler.prioritySign) {
                priority = true;
                annotName = annotName.substr(1, annotName.length);
            }

            var currentName = annotName + Handler.handlerCtr;
            var annotationInfo = makeHandlerAnnotation(currentName, currentName, annotName, priority, Handler.handlerCtr, currentOverrides);

            if (lastParent) {
                //last one added is our parent
                annotationInfo.setParent(lastParent.getUniqueName());
            }

            annotations.push(annotationInfo);
            lastParent = annotationInfo;
            match = regexp.exec(comment);
        }
    }

    return annotations;
};

toreturn.handlerDefinition = extractHandlerObject;
toreturn.HandlerAnnotation = extractUseHandlerAnnotation;

module.exports = toreturn;
global.handlerTransform = toreturn;
