'use strict';

/*jslint white: true, browser: true, debug: true*/
/*global global, exports, module, require, console*/
/*global TimeOutError, FunctionNotFoundError*/

var debug = require('debug')('rpc storage.js');

var _debug = true;
if (!_debug)
	debug = function () {};

//
// Storage Library
//

var Storage = function () {

	this.s = {};
	this.storageAvailable = false;

	if (typeof localStorage !== 'undefined')
		this.storageAvailable = true;

};


Storage.prototype.getItem = function (key) {

	debug('Storage getItem ', key);
	if (this.storageAvailable)
		return localStorage.getItem(key);

	return this.s[key];

};


Storage.prototype.setItem = function (key, val) {

	debug('Storage setItem ', key, val);
	if (this.storageAvailable)
		return localStorage.setItem(key, val);

	this.s[key] = val;

};


module.exports = Storage;