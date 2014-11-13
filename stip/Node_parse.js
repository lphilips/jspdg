/* * * * * * * * * * * * * * *
 * 			CLIENT 			 *
 * * * * * * * * * * * * * * */


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