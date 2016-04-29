/* * * * * * * * * * * * * * *
 *          CLIENT           *
 * * * * * * * * * * * * * * */

var NodeParse = (function () {

    var toreturn = {};


    var createVarDecl = function (declarator) {
        return {
            type            : 'VariableDeclaration',
            declarations    : [ declarator ],
            leadingComment  : declarator.leadingComment,
            kind            : 'var'
        };
    };


    var createLiteral = function (name) {
        return {
            type            : 'Literal',
            value           : name
        }
    }
       
    var createIdentifier = function (id) {
        return {
            type            : 'Identifier',
            name            : id
        }
    }

    var createExp = function (exp) {
        return {
            type           : 'ExpressionStatement',
            expression     : exp
        };
    };

     /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt) {
        return {  parsenode : {
                    type: "FunctionExpression",
                    id: null,
                    params: [
                        {
                            type: "Identifier",
                            name: "err"+cnt
                        },
                        {
                            type: "Identifier",
                            name: "res"+cnt
                        }
                    ],
                    defaults: [],
                    body: {
                        type: "BlockStatement",
                        body: []
                    },
                    rest: null,
                    generator: false,
                    expression: false
                  },
                  addBodyStm : function (stm) {
                    this.parsenode.body.body = this.parsenode.body.body.concat(stm);
                  },
                addBodyStms : function (stms) {
                    this.parsenode.body.body = this.parsenode.body.body.concat(stms);
                  },
                  setBody    : function (body) {
                    this.parsenode.body.body = body;
                  },
                  getBody    : function () {
                    return this.parsenode.body.body;
                  },
                  getResPar  : function () {
                    return this.parsenode.params[1];
                  }
         };
    };

    /* Representation of a remote procedurecall from client -> server:
     *   client.rpcCall(fname, args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
        return { parsenode  : 
                        {   callnode  : Pdg.getCallExpression(call),
                            type      : "ExpressionStatement",
                            expression: {
                                type      : "CallExpression",
                                callee    : {
                                    type      : "MemberExpression",
                                    computed  : false,
                                    object    : {
                                        type  : "Identifier",
                                        name  : "client"
                                            },
                                    property  : {
                                        type  : "Identifier",
                                        name  : "rpcCall"
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
        };
    };


    var RPCReturn = function (RPC) {
        return {
                parsenode  : 
                    {   callnode  : RPC.parsenode.callnode,
                        type      : "ReturnStatement",
                        argument  : RPC.parsenode.expression,
                        cont      : RPC.parsenode.cont
                    },
              isRPC     : true,
              addArg    : function (arg) {
                RPC.addArg(arg);
              },
              replaceArg : function (prev, arg) {
                RPC.replaceArg(prev, arg);
              },
              setCallback : function (cb) {
                this.callback = cb;
                RPC.setCallback(cb);
              },
              updateCallback : function (cb) {
                RPC.updateCallback(cb);
              },
              setName : function (name) {
                RPC.setName(name);
              },
              getCallback : function () {
                return RPC.getCallback()
            }
        };
    }

    /* 
     * Representation of an async function (takes an extra argument callback)
     *   
     */

    var asyncFun = function () {
        return  {
                parsenode :  
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
                        },
    

            setBody : function (body) {
                this.parsenode.value.body.body = body 
            }, 

            addParams : function (params) {
                this.parsenode.value.params = this.parsenode.value.params.concat(params);
            },

            setName : function (name) {
                this.parsenode.key.value = name;
            }
        };
    };

    var asyncReplyC = function () {
        return {
            parsenode : {
                type      : "ExpressionStatement",
                expression: {
                    type      : "CallExpression",
                    callee    : {
                        type      : "MemberExpression",
                        computed  : false,
                        object    : {
                            type  : "Identifier",
                            name  : "this"
                                },
                        property  : {
                            type  : "Identifier",
                            name  : "rpcCall"
                        }
                    },
                    arguments : [
                        {
                            type  : "Literal",
                            value : ""
                        }]
                }
            },

            setName : function (name) {
                this.parsenode.expression.arguments[0].value = name;
            },

            addArgs : function (args) {
                this.parsenode.expression.arguments = this.parsenode.expression.arguments.concat(args);
            }
        };
    };


    var broadcast = function () {
        return {
                parsenode :  {
                type: "ExpressionStatement",
                expression: {
                    type: "CallExpression",
                    callee: {
                        type: "MemberExpression",
                        computed: false,
                        object: {
                            type: "Identifier",
                            name: "server"
                        },
                        property: {
                            type: "Identifier",
                            name: "rpc"
                        }
                    },
                    arguments: [
                        {
                            type: "Identifier",
                            name: ""
                        },
                        {
                            type: "ArrayExpression",
                            elements: []
                        }
                    ]
                }
            }, 
 
            addArgs : function (args) {
                this.parsenode.expression.arguments[1].elements = args;
            },

            setName : function (name) {
                this.parsenode.expression.arguments[0].name = name;
            }
        };
    };

    var createReturnStm = function (arg) {
        return {
            type: "ReturnStatement",
            argument: arg
        };
    };

    var createCallCb = function (name, err, res) {
      return {

              type: "CallExpression",
              callee: {
                  type: "Identifier",
                  name: name
              },
              arguments: res ? [
                  err,
                  res
              ] : [ err ]
          };
    };



    var createDataGetter = function (name) {
        return {
            type: "ExpressionStatement",
            expression: {
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    computed: false,
                    object: {
                        type: "Identifier",
                        name: "store"
                    },
                    property: {
                        type: "Identifier",
                        name: "get"
                    }
                },
                arguments: [
                    {
                        type: "Literal",
                        value: name
                    }
                ]
            }
        }
    }

    var createDataSetter = function (name, value) {
        return {
            type: "ExpressionStatement",
            expression: {
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    computed: false,
                    object: {
                        type: "Identifier",
                        name: "store"
                    },
                    property: {
                        type: "Identifier",
                        name: "set"
                    }
                },
                "arguments": [
                    {
                        "type": "Literal",
                        "value": name,
                    },
                    value
                ]
            }
        }
    }

    var createGetterVarDecl = function (name) {
        return {
            "type": "ExpressionStatement",
            "expression": {
                "type": "AssignmentExpression",
                "operator": "=",
                "left": {
                    "type": "Identifier",
                    "name": name
                },
                "right": {
                    "type": "CallExpression",
                    "callee": {
                        "type": "MemberExpression",
                        "computed": false,
                        "object": {
                            "type": "Identifier",
                            "name": "store"
                        },
                        "property": {
                            "type": "Identifier",
                            "name": "get"
                        }
                    },
                    "arguments": [
                        {
                            "type": "Literal",
                            "value": name
                        }
                    ]
                }
            }
        }
    }



    var createServer = function () {
        return esprima.parse('var server = new ServerRpc(serverHttp, {}); var store = new Store(); store.connectServer(server);').body;
    };

    var createClient = function () {
        return esprima.parse("var client = new ClientRpc('http://127.0.0.1:8080');var store = new Store(); store.localStore(localStorage, 'app', true); store.connectClient(client);").body;
    };

    var createServerCloseUp = function () {
        return esprima.parse("server.onConnection(function (client) {store.loop(function (key, value) {server.rpcTo(client.id, 'updateStore', key, value)});})")
    }

    var methodsServer = function () {
        return esprima.parse("server.expose({'updateStore' : function (key, val, cb) {store.set(key, val, false)}, 'retrieveStore' : function (key, val, cb) {var id = this.id; store.loop(function (key, value) {server.rpcTo(id, 'updateStore', key ,value)}); return cb(null, store.data)}})").body[0]; 
    };

    var methodsClient = function () {
        return esprima.parse("client.expose({'updateStore' : function (key, val, cb) {store.set(key, val, true)}})").body[0];
    };


    toreturn.createVarDecl      = createVarDecl;
    toreturn.createLiteral      = createLiteral;
    toreturn.createIdentifier   = createIdentifier
    toreturn.createExp          = createExp;
    toreturn.callback           = callback;
    toreturn.RPC                = RPC;
    toreturn.RPCReturn          = RPCReturn;
    toreturn.asyncFun           = asyncFun;
    toreturn.methodsClient      = methodsClient;
    toreturn.methodsServer      = methodsServer; 
    toreturn.createServer       = createServer;
    toreturn.createClient       = createClient;
    toreturn.createBroadcast    = broadcast;
    toreturn.asyncReplyC        = asyncReplyC;
    toreturn.createReturnStm    = createReturnStm;
    toreturn.createCallCb       = createCallCb;
    toreturn.createDataSetter   = createDataSetter;
    toreturn.createDataGetter   = createDataGetter;
    toreturn.createGetterVarDecl = createGetterVarDecl;
    toreturn.createServerCloseUp = createServerCloseUp;


    if (typeof module !== 'undefined' && module.exports != null) {
        esprima         = require('../lib/esprima.js');
        exports.NodeParse = toreturn;
    }

    return toreturn;

})();