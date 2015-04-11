/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 *          Parse Utilities for target Meteor                                                                  *
 *                                                                                                              *   
 *     Based on JavaScript implementation : https://github.com/ticup/CloudTypes                                 *
 *                                                                                                              *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/

var MeteorParse = (function () {

    var module = {};



    var createVarDecl = function (declarator) {
        return {
            type          : 'VariableDeclaration',
            declarations  : [ declarator ],
            kind          : 'var'
        }
    }

    /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt) {
        return {  parsenode : {
                    type: "FunctionExpression",
                    id: null,
                    params: [
                        {
                            "type": "Identifier",
                            "name": "err"+cnt
                        },
                        {
                            "type": "Identifier",
                            "name": "res"+cnt
                        }
                    ],
                    defaults: [],
                    body: {
                        "type": "BlockStatement",
                        "body": []
                    },
                    rest: null,
                    generator: false,
                    expression: false
                  },
                  addBodyStm : function (stm) {
                    this.parsenode.body.body = this.parsenode.body.body.concat(stm)
                  },
                  setBody    : function (body) {
                    this.parsenode.body.body = body
                  },
                  getBody    : function () {
                    return this.parsenode.body.body;
                  },
                  getResPar  : function () {
                    return this.parsenode.params[1];
                  }
                }
    }

    /* Representation of a remote procedurecall from client -> server:
     *   Meteor.call(fname, args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
        return { parsenode  : 
                        {   callnode  : call,
                            type      : "ExpressionStatement",
                            expression: {
                                type      : "CallExpression",
                                callee    : {
                                    type      : "MemberExpression",
                                    computed  : false,
                                    object    : {
                                        type  : "Identifier",
                                        name  : "Meteor"
                                            },
                                    property  : {
                                        type  : "Identifier",
                                        name  : "call"
                                    }
                                },
                                arguments : [
                                    {
                                        type  : "Literal",
                                        value : fname
                                    }].concat( args ? args : [])
                            }
                        },
                  isRPC     : true,
                  addArg    : function (arg) {
                    this.parsenode.expression.arguments = this.parsenode.expression.arguments.concat(arg)
                  },
                  replaceArg : function (prev, arg) {
                    if (this.parsenode.expression)
                        for (var i = 0; i < this.parsenode.expression.arguments.length; i++) {
                            var current = this.parsenode.expression.arguments[i];
                            if (current === prev) 
                                this.parsenode.expression.arguments[i] = arg;
                        }
                  },
                  setCallback : function (cb) {
                    this.callback = cb;
                  },
                  updateCallback : function (cb) {
                    if(this.parsenode.expression && this.parsenode.expression.arguments) {
                        var argsp = this.parsenode.expression.arguments;
                        argsp[argsp.length-1] = cb.parsenode;
                        this.callback = cb;
                    }
                  },
                  setName : function (name) {
                    this.parsenode.expression.arguments[0].value = name
                  },
                  getCallback : function () {
                    if (this.callback) 
                        return this.callback
                    else if (this.parsenode.expression) {
                        var argsp = this.parsenode.expression.arguments,
                            newcb = callback(0); /*  count does not matter at this point */
                        newcb.parsenode = argsp[argsp.length-1]
                        return newcb
                    }
                  }
                }
    }

    var RPCC = function (fname, args) {
        return {
            parsenode : esprima.parse("Meteor.ClientCall.apply(clientId, 'method', [], function (err,res) { var f = res; })")
        }
    }

    /* 
     * Representation of an async function (takes an extra argument callback)
     *   
     */

    var asyncFun = function () {
        return {
            parsenode :  {
                type: "ObjectExpression",
                properties: [
                    {
                        type: "Property",
                        key: {
                            type: "Literal",
                            // Name must be set by vardecl
                            value: "",
                        },
                        value: {
                            type: "FunctionExpression",
                            id: null,
                            params: [],
                            defaults: [],
                            body: {
                                type: "BlockStatement",
                                body: []
                            },
                            rest: null,
                            generator: false,
                            expression: false
                        },
                        kind: "init"
                    }
                ]
          }, 

            setBody : function (body) {
                this.parsenode.properties[0].value.body.body = body 
            }, 

            addParams : function (params) {
                this.parsenode.properties[0].value.params = params;
            },

            setName : function (name) {
                this.parsenode.properties[0].key.value = name;
            }
        }
    }


    var jsRPCAddCb = function (rpc, cb) {
        rpc.expression.arguments = rpc.expression.arguments.concat(cb)
    } 

    var methodsClient = function () {
        return esprima.parse('Meteor.ClientCall.methods({})').body[0];
    }

    var methodsServer = function () {
        return esprima.parse('Meteor.methods({})').body[0];
    }

    module.createVarDecl = createVarDecl;
    module.callback      = callback;
    module.RPC           = RPC;
    module.asyncFun      = asyncFun;
    module.methodsClient = methodsClient;
    module.methodsServer = methodsServer; 

    return module;

})();



/*


/* RPC from server to client */
/*
var meteor_callbackCP = function () {
    var parsed = esprima.parse("Meteor.ClientCall.apply(clientId, 'method', [], function (err,res) { var f = res; })");
    return parsed.body[0];
}
*/

/* PRIMITIVES TRANSFORMATION    */

/* READ(ID)                    
 * TODO = currently doesn't use Meteor's templating features
 */
var meteor_readP = function (id) {
   return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "read"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ReturnStatement",
                                    "argument": {
                                        "type": "MemberExpression",
                                        "computed": false,
                                        "object": {
                                            "type": "CallExpression",
                                            "callee": {
                                                "type": "MemberExpression",
                                                "computed": false,
                                                "object": {
                                                    "type": "Identifier",
                                                    "name": "document"
                                                },
                                                "property": {
                                                    "type": "Identifier",
                                                    "name": "getElementById"
                                                }
                                            },
                                            "arguments": [
                                                {
                                                    "type": "Identifier",
                                                    "name": "id"
                                                }
                                            ]
                                        },
                                        "property": {
                                            "type": "Identifier",
                                            "name": "innerHTML"
                                        }
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }], 
                "kind": "var"
        }
}

/* PRINT(toprint, id)           */

var meteor_printP = function() {
    return   {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "print"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            },
                            {
                                "type": "Identifier",
                                "name": "str"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "AssignmentExpression",
                                        "operator": "=",
                                        "left": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "CallExpression",
                                                "callee": {
                                                    "type": "MemberExpression",
                                                    "computed": false,
                                                    "object": {
                                                        "type": "Identifier",
                                                        "name": "document"
                                                    },
                                                    "property": {
                                                        "type": "Identifier",
                                                        "name": "getElementById"
                                                    }
                                                },
                                                "arguments": [
                                                    {
                                                        "type": "Identifier",
                                                        "name": "id"
                                                    }
                                                ]
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "innerHTML"
                                            }
                                        },
                                        "right": {
                                            "type": "Identifier",
                                            "name": "str"
                                        }
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }],
                 "kind": "var"
        }
}

/* INSTALLL(id, event, fn) */
var meteor_installLP = function() {
    return     {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "installL"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            },
                            {
                                "type": "Identifier",
                                "name": "event"
                            },
                            {
                                "type": "Identifier",
                                "name": "fn"
                            }
                        ],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "CallExpression",
                                                "callee": {
                                                    "type": "MemberExpression",
                                                    "computed": false,
                                                    "object": {
                                                        "type": "Identifier",
                                                        "name": "document"
                                                    },
                                                    "property": {
                                                        "type": "Identifier",
                                                        "name": "getElementById"
                                                    }
                                                },
                                                "arguments": [
                                                    {
                                                        "type": "Identifier",
                                                        "name": "id"
                                                    }
                                                ]
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "addEventListener"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Literal",
                                                "value": "click"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "fn"
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }],
                 "kind": "var"
        }
}

/* BROADCAST(ID, data)          */
var meteor_broadcastP = function() {
  return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "broadcast"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "stream"
                            },
                            {
                                "type": "Identifier",
                                "name": "msg"
                            },
                            {
                                "type": "Identifier",
                                "name": "data"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "Identifier",
                                                "name": "stream"
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "emit"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Identifier",
                                                "name": "msg"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "data"
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }
            ],
            "kind": "var"
        }
}

var meteor_make_streamP = function(name) {
    return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": name + 'stream'
                    },
                    "init": {
                        "type": "NewExpression",
                        "callee": {
                            "type": "MemberExpression",
                            "computed": false,
                            "object": {
                                "type": "Identifier",
                                "name": "Meteor"
                            },
                            "property": {
                                "type": "Identifier",
                                "name": "Stream"
                            }
                        },
                        "arguments": [
                            {
                                "type": "Literal",
                                "value": name,
                            }
                        ]
                    }
                }
            ],
            "kind": "var"
        }
}

/* SUBSCRIBE(ID, callback)      */
var meteor_subscribeP = function() {
  return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "subscribe"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "stream"
                            },
                            {
                                "type": "Identifier",
                                "name": "msg"
                            },
                            {
                                "type": "Identifier",
                                "name": "fn"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "Identifier",
                                                "name": "stream"
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "on"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Identifier",
                                                "name": "msg"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "fn"
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }
            ],
            "kind": "var"
        }
}


