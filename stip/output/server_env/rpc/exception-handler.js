'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require*/
/*global TimeOutError, FunctionNotFoundError, SerializationError*/
/*global DeserializionError, NoConnectionError, TooManyArgumentsError*/

require('./rpc-exception.js');
var Errio = require('errio');
//
// Exceptions
//

/*
Standard, build-in JavaScript errors (usually seen as implicit exceptions):
	– Error 
	– EvalError  
	– RangeError 
	– ReferenceError 
	– SyntaxError 
	– TypeError 
	– URIError 

Explicit exceptions:
	Other throwables (like throw 5) are serialized.

There are some custom RPC exceptions:
	– see ./rpc-exception.js
	These are all subtypes of Javascript Error type.
*/

var nativeJSErrors = [
	EvalError,
	RangeError,
	ReferenceError,
	SyntaxError,
	TypeError,
	URIError
];

var libraryErrors = [
	FunctionNotFoundError,
	SerializationError,
	DeserializionError,
	TooManyArgumentsError
];

var networkErrors = [
	TimeOutError,
	NoConnectionError
];


var ExceptionHandler = function(debugMode){
	this.debugMode = debugMode;

	Errio.setDefaults({stack:this.debugMode});
	Errio.registerAll(nativeJSErrors);
	Errio.registerAll(libraryErrors);
	Errio.registerAll(networkErrors);

};

ExceptionHandler.prototype.serialize = function (exception) {
	try {
		// JS exceptions and library exceptions.
		// e.g. throw new ReferenceError();
		if (this.isOfError(exception) || this.isImplicitException(exception)) {
			return {
				type: 'errio',
				name: exception.name,
				error: Errio.stringify(exception, {stack:this.debugMode})
			};
		}

		// Application / user defined exceptions.
		// e.g. throw new MyCustomException();
		// IMPORTANT: make sure the 'other side' knows about the exception!
		if (exception instanceof Error) {
			return {
				type: 'errio',
				name: exception.name,
				error: Errio.stringify(exception, {stack:this.debugMode})
			};
		}

		// Others.
		// e.g. throw new 5; --> LiteralError.
		return {
			type: 'LiteralError',
			name: 'LiteralError',
			error: JSON.stringify(exception)
		};

	} catch (e) {

		return this.serialize(new SerializationError('Exception serialize error, ' + e.message));

	}
};

ExceptionHandler.prototype.deserialize = function (object) {
	try {
		
		var name = object.name || '',
			error = object.error || '',
			type = object.type,
			ExcFunc,
			exception;


		if(type === 'LiteralError'){
			
			exception = JSON.parse(error);
		
		}else{
			//exception = new ExcFunc(message);
			//exception.stack = stack;

			if (typeof window !== 'undefined' && window[name]) { //browser

				ExcFunc = window[name];
				Errio.register(ExcFunc, {stack:this.debugMode});

			} else if (typeof global !== 'undefined' && global[name]) { //node

				ExcFunc = global[name];
				Errio.register(ExcFunc, {stack:this.debugMode});

			} else {

				return new Error('Exception not defined, ' + error);

			}

			exception = Errio.parse(error);
		}

		return exception;

	} catch (e) {
		
		return new DeserializionError('Exception deserialize error, ' + e.message + e.stack);

	}
};

ExceptionHandler.prototype.isException = function (value) {
	if ((value.name && value.message && value.stack) &&
		(value.name === 'Error' || value instanceof Error))
		return true;

	return false;
};

ExceptionHandler.prototype.isNativeError = function (value) {
	var e =
		nativeJSErrors.some(function (error) {
			if (value instanceof error) {

				return true;
			}

			return false;
		});

	return e;
};

ExceptionHandler.prototype.isLibraryError = function (value) {
	var e =
		libraryErrors.some(function (error) {
			if (value instanceof error) {
				return true;
			}

			return false;
		});

	return e;
};

ExceptionHandler.prototype.isNetworkError = function (value) {
	var e =
		networkErrors.some(function (error) {
			if (value instanceof error) {
				return true;
			}

			return false;
		});

	return e;
};

ExceptionHandler.prototype._filter = function (value, caseRight, caseWrong) {
	if (
		this.isNativeError(value) ||
		this.isLibraryError(value) ||
		this.isNetworkError(value)
	)
		return caseRight;

	//custom exception
	return caseWrong;
};

ExceptionHandler.prototype.isImplicitException = function (value) {
	return this._filter(value, true, false);
};

ExceptionHandler.prototype.isOfError = function (value) {
	return (value instanceof Error);
};
////////////////////////////////////////////////////////////////////////////////////////////


module.exports = ExceptionHandler;