'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/

//
// RPC Exceptions
//


/*
    NetworkError
*/
var NetworkError = function (message) {
    this.name = 'NetworkError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

NetworkError.prototype             = Object.create(Error.prototype);
NetworkError.prototype.constructor = NetworkError;



/*
    NoConnectionError
*/
var NoConnectionError = function (message) {
    this.name = 'NoConnectionError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

NoConnectionError.prototype             = Object.create(NetworkError.prototype);
NoConnectionError.prototype.constructor = NoConnectionError;



/*
    TimeOutError
*/
var TimeOutError = function (message) {
    this.name = 'TimeOutError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

TimeOutError.prototype             = Object.create(NetworkError.prototype);
TimeOutError.prototype.constructor = TimeOutError;



/*
    LibraryError
*/
var LibraryError = function (message) {
    this.name = 'LibraryError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

LibraryError.prototype             = Object.create(Error.prototype);
LibraryError.prototype.constructor = LibraryError;



/*
	FunctionNotFoundError: used when performing an RPC but the function is not found.
*/
var FunctionNotFoundError = function (message) {
    this.name = 'FunctionNotFoundError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

FunctionNotFoundError.prototype             = Object.create(LibraryError.prototype);
FunctionNotFoundError.prototype.constructor = FunctionNotFoundError;



/*
    TooManyArgumentsError: used when performing an RPC but the function is applied with too many arguments.
*/
var TooManyArgumentsError = function (message) {
    this.name = 'TooManyArgumentsError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

TooManyArgumentsError.prototype             = Object.create(LibraryError.prototype);
TooManyArgumentsError.prototype.constructor = TooManyArgumentsError;



/*
	SerializationError
*/
var SerializationError = function (message) {
    this.name = 'SerializationError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

SerializationError.prototype             = Object.create(LibraryError.prototype);
SerializationError.prototype.constructor = SerializationError;



/*
	DeserializeError
*/
var DeserializionError = function (message) {
    this.name = 'DeserializionError';
    this.message = (message || '');
    this.stack = (new Error()).stack;
};

DeserializionError.prototype             = Object.create(LibraryError.prototype);
DeserializionError.prototype.constructor = DeserializionError;



/*
    ApplicationLiteralError
*/
var ApplicationLiteralError = function (message) {
    this.name = 'ApplicationLiteralError';
    this.message = (message || '');
};

ApplicationLiteralError.prototype             = Object.create(Error.prototype);
ApplicationLiteralError.prototype.constructor = ApplicationLiteralError;

//Sadly we have to pollute the global environment with these Errors to make them accessible in the clientside program
global.NetworkError           = NetworkError;
global.NoConnectionError      = NoConnectionError;
global.LibraryError           = LibraryError;
global.TimeOutError           = TimeOutError;
global.FunctionNotFoundError  = FunctionNotFoundError;
global.TooManyArgumentsError  = TooManyArgumentsError;
global.SerializationError     = SerializationError;
global.DeserializionError     = DeserializionError;
global.ApplicationLiteralError = ApplicationLiteralError;