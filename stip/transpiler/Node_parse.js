/* * * * * * * * * * * * * * *
 * 			CLIENT 			 *
 * * * * * * * * * * * * * * */

var Nodeify = (function () {

	var module = {};
	   
	 /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt) {
        return {  parsenode : {
                    "type": "FunctionExpression",
                    "id": null,
                    "params": [
                        {
                            "type": "Identifier",
                            "name": "err"+cnt
                        },
                        {
                            "type": "Identifier",
                            "name": "res"+cnt
                        }
                    ],
                    "defaults": [],
                    "body": {
                        "type": "BlockStatement",
                        "body": []
                    },
                    "rest": null,
                    "generator": false,
                    "expression": false
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
     *   client.rpcCall(fname, args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
        return { parsenode  : 
                        {   "callnode"  : call,
                            "type"      : "ExpressionStatement",
                            "expression": {
                                "type"      : "CallExpression",
                                "callee"    : {
                                    "type"      : "MemberExpression",
                                    "computed"  : false,
                                    "object"    : {
                                        "type"  : "Identifier",
                                        "name"  : "client"
                                            },
                                    "property"  : {
                                        "type"  : "Identifier",
                                        "name"  : "rpcCall"
                                    }
                                },
                                "arguments" : [
                                    {
                                        "type"  : "Literal",
                                        "value" : fname
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


 	/* 
     * Representation of an async function (takes an extra argument callback)
     *   
     */

    var asyncFun = function () {
        return {
            parsenode :  {
                "type": "ObjectExpression",
                "properties": [
                    {
                        "type": "Property",
                        "key": {
                            "type": "Literal",
                            // Name must be set by vardecl
                            "value": "",
                        },
                        "value": {
                            "type": "FunctionExpression",
                            "id": null,
                            "params": [],
                            "defaults": [],
                            "body": {
                                "type": "BlockStatement",
                                "body": []
                            },
                            "rest": null,
                            "generator": false,
                            "expression": false
                        },
                        "kind": "init"
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


    var methodsServer = function () {
    	return esprima.parse('{}').body[0]; 
    }

    var methodsClient = function () {
    	return esprima.parse('{}').body[0];
    }

    module.callback      = callback;
    module.RPC           = RPC;
    module.asyncFun      = asyncFun;
    module.methodsClient = methodsClient;
    module.methodsServer = methodsServer; 


	return module;

})();
/* 
 * Requires the zerorpc and wait.for libraries (CLIENT)
 */
var nodeRequiresC = function () {
	var parsed = esprima.parse("var zerorpc = require('zerorpc'), wait = require('wait.for');");
	return parsed.body[0];
}


var nodeHeaderC = function () {
	return nodeRequiresC()
}

/*
 * sets up the fiber for the client side code.
 * Defines a callServer function that can be used to RPC the server
 * (uncomment is an aux function that can make a string of multi-line comment,
 *  this is done for readiblity of this snippet.)
 */
var nodeClientFiber = function () {
	var code  = uncomment (function () {/*
var clientfiber = function() {
  var client = new zerorpc.Client();
  client.connect('tcp://127.0.0.1:8080');
  var callServer = function () {
   var fname = arguments[0],
       args  = Array.prototype.slice.call(arguments),
       fargs = [client, 'invoke', fname].concat(args.slice(1));
   return wait.forMethod.apply(wait, fargs)
  }
}
*/}),
		parsed = esprima.parse(code);
	return parsed.body[0];
}

var nodeClientFiberRun = function () {
	var parsed = esprima.parse("wait.launchFiber(clientfiber);")
	return parsed.body[0];
}

var nodeFooterC = function () {
	return nodeClientFiberRun();
}

var nodeCallServerf = function () {
	return {
		"type": "CallExpression",
		"callee": {
			"type": "Identifier",
			"name": "callServer"
		},
		"arguments": [
		{
			"type": "Literal",
			"value": "",
		}
		]
	}
}


/* * * * * * * * * * * * * * *
 * 			SERVER			 *
 * * * * * * * * * * * * * * */



/* 
 * Requires the zerorpc library (SERVER)
 */
var nodeRequiresS = function () {
	var parsed = esprima.parse("var zerorpc = require('zerorpc');");
	return parsed.body[0];
}

var nodeHeaderS = function () {
	return nodeRequiresS()
}


var nodeServerRun = function () {
	var parsed = esprima.parse("server.bind('tcp://0.0.0.0:8080')");
	return parsed.body[0];
}

var nodeFooterS = function () {
	return nodeServerRun();
}

var nodeCreateServer = function () {
	var parsed = esprima.parse('var server = new zerorpc.Server({})');
	return parsed.body[0]
}

var nodeRemoteProc = function () {
	return  {
        "type": "Property",
        "key": {
            "type": "Identifier",
            "name": ""
        },
        "value": {
			"type": "FunctionExpression",
            "id": null,
            "params": [],
            "defaults": [],
            "body": {
                "type": "BlockStatement",
                "body": []
            },
            "rest": null,
            "generator": false,
            "expression": false
        },
        "kind": "init"
    }
}