'use strict';

var debug = require('debug')('handler logger');

var UniqueLogger = (function () {
	var instance;

	return {
		getInstance: function () {
			if (!instance) {
				instance = new LogObject();
			}
			return instance;
		}
	};
})();

var LogObject = function () {
	this.textLog = [];
};

LogObject.prototype.append = function (newData) {
	debug('Logging', newData);
	this.textLog.push(newData);

};

LogObject.prototype.printLog = function () {

	for (var i in this.textLog) {
		console.log(this.textLog[i]);
	}
};


global.UniqueLogger = UniqueLogger;
