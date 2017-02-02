/* * * * * * * * * * * * * * *
 *          CLIENT           *
 * * * * * * * * * * * * * * */

var NodeParse = (function () {

    var toreturn = {};

    var context = undefined;

    var setContext = function setContext(newcontext) {
        context = newcontext;
    };


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

    var createReturnStm = function (arg) {
        return {
            type: "ReturnStatement",
            argument: arg
        };
    };


    var createNewExpression = function (fname, args) {
        return {
            type: "NewExpression",
            callee: {
                type: "Identifier",
                name: fname
            },
            arguments: args
        }
    }

     /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt, syncHandler) {
        var body = [];
        if(syncHandler){
            body = [{
                "type": "TryStatement",
                "block": {
                    "type": "BlockStatement",
                    "body": [
                        {
                            "type": "IfStatement",
                            "test": {
                                "type": "Identifier",
                                "name": "err"+cnt
                            },
                            "consequent": {
                                "type": "ThrowStatement",
                                "argument": {
                                    "type": "Identifier",
                                    "name": "err"+cnt
                                }
                            },
                            "alternate": null
                        }
                        ]
                },
                "guardedHandlers": [],
                "handlers": syncHandler.handlers.slice(),
                //"handler": syncHandler.handlers,
                "finalizer": syncHandler.finalizer
            }];
        }   

        return {  parsenode :{
                    "type": "FunctionExpression",
                    "id": null,
                    "params": [
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
                        body: body
                    },
                    _transformed : true,
                    _errArg : {
                        type: "Identifier",
                        name: "err"+cnt
                    },
                    rest: null,
                    generator: false,
                    expression: false
                  },
                  addBodyStm : function (stm, upfront) {
                      if (!upfront) {
                          if (syncHandler && stm.inTryBlock) {
                              this.parsenode.body.body[0].block.body = this.parsenode.body.body[0].block.body.concat(stm);
                          } else {
                              this.parsenode.body.body = this.parsenode.body.body.concat(stm);
                          }
                      } else {
                          if (syncHandler && stm.inTryBlock) {
                              this.parsenode.body.body[0].block.body = [stm].concat(this.parsenode.body.body[0].block.body);
                          } else {
                              this.parsenode.body.body = [stm].concat(this.parsenode.body.body);
                          }
                      }
                  },
                  addBodyStms : function (stms) {
                    var self = this;
                    stms.forEach(function (stm) {
                        self.addBodyStm(stm);
                    });
                  },
                  setBody    : function (body) {
                    if(syncHandler){
                        var throwS = {
                            "type": "IfStatement",
                            "test": this.getErrPar(),
                            "consequent": {
                                "type": "ThrowStatement",
                                "argument": this.getErrPar()
                            },
                            "alternate": null
                        };
                       this.parsenode.body.body[0].block.body = [throwS].concat(body); 
                    }else{
                        this.parsenode.body.body = body
                    }
                  },
                  getBody    : function () {
                    if(syncHandler){
                        var inTryBody = this.parsenode.body.body[0].block.body.slice(1);
                        return inTryBody.concat(this.parsenode.body.body.slice(1)); 
                    }else{
                        return this.parsenode.body.body;
                    }
                  },
                  getResPar  : function () {
                    return this.parsenode.params[1];
                  },
                  getResParCnt : function () {
                    return cnt;
                  },
                  getErrPar  : function () {
                    return this.parsenode.params[0];
                  }
         };
    };

    /* Representation of a remote procedurecall from client -> server:
     *   client.rpc(fname, args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
        return { parsenode  : 
                        {   _callnode  : Pdg.getCallExpression(call),
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
                                    "property"  : {
                                        "type"  : "Identifier",
                                        "name"  : "rpcCall"
                                    }
                                },
                                arguments : [
                                    {
                                        type  : "Literal",
                                        value : fname
                                    }].concat( args ? args : [])
                            },
                            __transformed : true
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
                  setObjectName: function (name) {
                     this.parsenode.expression.callee.object.name = name
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
                    {   _callnode  : RPC.parsenode.callnode,
                        type      : "ReturnStatement",
                        argument  : RPC.parsenode.expression,
                        cont      : RPC.parsenode.cont,
                        __transformed : true
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
            getBody : function (body) {
                return this.parsenode.value.body.body;
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
                            type  : "ThisExpression"
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
                },
                __transformed : true
            },

            setName : function (name) {
                this.parsenode.expression.arguments[0].value = name;
            },

            addArgs : function (args) {
                this.parsenode.expression.arguments = this.parsenode.expression.arguments.concat(args);
            },

            setObjectName: function (name) {
                this.parsenode.expression.callee.object.name = name
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
            },

            setObjectName: function (name) {
                this.parsenode.expression.callee.object.name = name
            }
        };
    };




    var addRenameThisStm = function (fn) {
        fn.setBody([{
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: "self"
                    },
                    init: {
                        type: "ThisExpression"
                    }
                }
            ],
            kind: "var"
        }].concat(fn.getBody()))
    }

    var transformCPStoReturn = function (cps) {
        Aux.walkAst(cps.parsenode, {
            post: function (node) {
                if (Aux.isCallExp(node) && Aux.isMemberExpression(node.callee)) {
                    if ( Aux.isIdentifier(node.callee.object) && node.callee.object.name === "client" || node.callee.object.name === "server") {
                        node.callee.object.name= "self";
                    }
                    else if (Aux.isThisExpression((node.callee.object))) {
                        node.callee.object = {
                            type: 'Identifier',
                            name: "self"
                        }
                    }
                }
            }
        })
    }


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

    var createObservableObject = function (name, object, server) {
        if (server)
            return esprima.parse('server.makeObservableObject(' + name + ', ' + object + ')').body[0].expression;
        else
            return esprima.parse('client.makeObservableObject(' + name + ', ' + object + ')').body[0].expression;
    }

    var createAnonymousObservableObject = function (object, server) {
        return createObservableObject(false, object, server)
    }

    var createReplicatedObject = function (name, object, server) {
        if (server)
            return esprima.parse('server.makeReplicatedObject(' + name + ', ' + object + ')').body[0].expression;
        else
            return esprima.parse('client.makeReplicatedObject(' + name + ', ' + object + ')').body[0].expression;
    }

    var createAnonymousReplicatedObject = function (object, server) {
        return createReplicatedObject(false, object, server);
    }


    var createServer = function () {
        var port = 3000;

        if (context !== undefined) {
            port = context.options.server_port;
        }
        return esprima.parse('var express = require("express"), app = express(); var ServerData = require("./rpc/data-server.js");var server = new ServerData(app,'+ port +');\n'+
            'app.use("/client", express.static(__dirname + "/../client_env/js"));app.use("/", express.static(__dirname + "/../client_env"));').body;
    };

    var createClient = function () {
        var host = "localhost";
        var port = 3000;
        var has_server = true;
        var objectcb = "function (name, object) {if (typeof ractive !== 'undefined') ractive.update()}";
        var updatecb = "function (id,prop,value) {if (typeof ractive !== 'undefined') ractive.update()}"

        if (context !== undefined) {
            host = context.options.server_hostname;
            port = context.options.server_port;
            has_server = context.has_server;
        }

        var pre_init;

        if (!has_server) {
            pre_init =
                "var client = new REDSTONE.DUMMYCLIENT();\n"
        } else {
            pre_init =
                "var client = new ClientData('http://" + host + ":" + port + "',{},"+objectcb +","+updatecb +")";
        }

        return esprima.parse(
            pre_init + "\n" +
            "client.onConnected(function() {\n" +
            "REDSTONE.onConnected();\n" +
            "});\n" +
            "client.onDisconnected(function() {\n" +
            "REDSTONE.onDisconnected();" +
            "});\n"
        ).body;
    };

    var createImport = function (lib) {
        return esprima.parse("var "+lib+" = require('"+lib+"')").body[0];
    }
    var createServerCloseUp = function () {
        return esprima.parse("");
    }

    var methodsServer = function () {
        return esprima.parse("server.expose({})").body[0];
    };

    var methodsClient = function () {
        return esprima.parse("client.expose({})").body[0];
    };


    toreturn.createVarDecl      = createVarDecl;
    toreturn.createLiteral      = createLiteral;
    toreturn.createIdentifier   = createIdentifier;
    toreturn.createExp          = createExp;
    toreturn.createReturnStm    = createReturnStm;
    toreturn.createNewExp       = createNewExpression;
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
    toreturn.createServerCloseUp = createServerCloseUp;
    toreturn.transformCPSToReply = transformCPStoReturn;
    toreturn.addRenameThisStm   = addRenameThisStm;
    toreturn.createObservableObject = createObservableObject;
    toreturn.createAnonymousObservableObject = createAnonymousObservableObject;
    toreturn.createReplicatedObject = createReplicatedObject;
    toreturn.createAnonymousReplicatedObject = createAnonymousReplicatedObject;
    toreturn.setContext         = setContext;
    toreturn.createImport       = createImport;


    if (typeof module !== 'undefined' && module.exports != null) {
        esprima         = require('../lib/esprima.js');
        exports.NodeParse = toreturn;
    }

    return toreturn;

})();