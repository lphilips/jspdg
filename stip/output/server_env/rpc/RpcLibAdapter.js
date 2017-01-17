'use strict';
//   Adapter for RPC lib
//   https://github.com/dielc/rpc

/*
stub.rpc('remoteFunction', a, b, c, function(err, res, retry) {}, 1000);
*/


var adapter = function(makeRPCObject, makeContinuationObject){
	
	/*
		Helper functions.
	*/

	var rpcExtractFromArgs = function(args){
		var actualArgs, cb, due, name;

		if(args.length === 0)
			throw new Error('Need at least function name.');
		
		actualArgs = args.slice();
		name = actualArgs.shift();

	    if(typeof actualArgs[actualArgs.length-1] === 'function'){
	        cb = actualArgs.pop();
	    }else if(
	    	typeof actualArgs[actualArgs.length-2] === 'function' && 
	    	typeof actualArgs[actualArgs.length-1] === 'number'){
	        due = actualArgs.pop();
	        cb = actualArgs.pop();
	    }

	    return makeRPCObject(name,actualArgs,cb,due);
	};

	var rpcBuildToArgs = function(rpcObject){
		var args = [];

		if(!rpcObject.functionName)
			throw new Error('Need at least function name.');

		args.push(rpcObject.functionName);
		args = args.concat(rpcObject.args);
		if(rpcObject.continuation)
			args.push(rpcObject.continuation);
		if(rpcObject.due)
			args.push(rpcObject.due);
		return args;
	};

	var contExtractFromArgs = function(args){
		return makeContinuationObject(args[0], args[1], args[2]);
	};

	var contBuildToArgs = function(contObject){
		var args = [];
		
		args.push(contObject.error);
		args.push(contObject.result);
		if(contObject.retry){
			args.push(contObject.retry);
		}else{
			args.push(function(){});
		}
		
		return args;
	};



	/*
		Interface.
	*/

	return {
		stubMethodName: 'rpc',

		asRpc: function(args){
			return rpcExtractFromArgs(args);
		},

		asContinuation: function(args){
			return contExtractFromArgs(args);
		},

		getRpcFunctionName: function (args) {
			var rpcObject = rpcExtractFromArgs(args);
			return rpcObject.functionName;
		},

		setRpcFunctionName: function (methodArgs, name) {
			var rpcObject = rpcExtractFromArgs(methodArgs);
			rpcObject.functionName = name;
			return rpcBuildToArgs(rpcObject);
		},

		getRpcArgs: function (args) {
			var rpcObject = rpcExtractFromArgs(args);
			return rpcObject.args;
		},

		setRpcArgs: function (methodArgs, rpcArgs) {
			var rpcObject = rpcExtractFromArgs(methodArgs);
			rpcObject.args = rpcArgs;
			return rpcBuildToArgs(rpcObject);
		},

		getRpcContinuation: function (args) {
			var rpcObject = rpcExtractFromArgs(args);
			return rpcObject.continuation;
		},

		setRpcContinuation: function (methodArgs, continuation) {
			var rpcObject = rpcExtractFromArgs(methodArgs);
			rpcObject.continuation = continuation;
			return rpcBuildToArgs(rpcObject);
		},

		getContinuationError: function (continuationArgs) {
			var contObject = contExtractFromArgs(continuationArgs);
			return contObject.error;
		},

		setContinuationError: function (continuationArgs, val) {
			var contObject = contExtractFromArgs(continuationArgs);
			contObject.error = val;
			return contBuildToArgs(contObject);
		},

		getContinuationResult: function (continuationArgs) {
			var contObject = contExtractFromArgs(continuationArgs);
			return contObject.result;
		},

		setContinuationResult: function (continuationArgs, val) {
			var contObject = contExtractFromArgs(continuationArgs);
			contObject.result = val;
			return contBuildToArgs(contObject);
		},

		getContinuationRetry: function (continuationArgs) {
			var contObject = contExtractFromArgs(continuationArgs);
			return contObject.retry;
		},

		setContinuationRetry: function (continuationArgs, val) {
			var contObject = contExtractFromArgs(continuationArgs);
			contObject.retry = val;
			return contBuildToArgs(contObject);
		},

		buildNewRpcArgs: function (functionName, args, continuation) {
			var rpcObject = makeRPCObject(functionName, args, continuation);
			return rpcBuildToArgs(rpcObject);
		},

		buildNewContinuationArgs: function (err, res, retry) {
			var contObject = makeContinuationObject(err, res, retry);
			return contBuildToArgs(contObject);
		}
	};
};	

module.exports = adapter;
