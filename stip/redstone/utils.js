/***********/
/* Imports */
/***********/
var util = require('util');
var fs = require("fs");

/***************/
/* Definitions */
/***************/

/**
 * Aid function to return the index of the smallest element of an array,
 * ignorning elements with a certain value (e.g. -1).
 * @param {array} arr The array to search for the smallest value.
 * @param {any} ignores The value that should be ignored.
 * @private
 * @returns {Number} The index of the smallest element in the given array, ignoring
 * certain values. If the array only contains ignored value, or is empty,
 * it will return -1, as it is an invalid index.
 */
var array_indexOfSmallest = function array_indexOfSmallest(arr, ignores) {
    var idx = -1;
    var cmp = null;
    for (var i = 0; i < arr.length; i++) {
        var v = arr[i];
        if (v == ignores) {
            continue;
        }
        if (cmp === null) {
            cmp = v;
            idx = i;
        } else {
            if (cmp > v) {
                cmp = v;
                idx = i;
            }
        }
    }
    return idx;
};

/**
 * Fully writes an object on standard output using console.log.
 * @param {any} obj The object to dump.
 */
var dump = function dump(obj) {
    console.log(util.inspect(obj, {showHidden: false, depth: null}));
};

/**
 * Reads a file into a string.
 * This is a blocking function.
 * @param {String} path The file path (can be relative)
 * @returns {String} The contents of the file.
 */
var readFile = function readFile(path) {
    return fs.readFileSync(path, "utf-8");
};

var DEBUG = true;

/**
 * If DEBUG is equals to true, output a title.
 * @param {String} title The title to display
 */
var head = function head(title) {
    if (!(DEBUG)) {
        return;
    }

    var len = 64;
    var line = "=".repeat(len);
    console.log("");
    console.log(line);
    console.log(" ".repeat((len - title.length) / 2) + title);
    console.log(line);
    console.log("");
};

/**
 * If DEBUG is equals to true, output a subtitle.
 * @param {String} title The title to display
 */
var subhead = function subhead(title) {
    if (!(DEBUG)) {
        return;
    }

    var len = 64;
    var line = "-".repeat(len);
    console.log("");
    console.log(line);
    console.log(" ".repeat((len - title.length) / 2) + title);
    console.log(line);
    console.log("");
};

/**
 * If DEBUG is equals to true, output a title.
 * @param {String} a The text to display
 */
var debugEcho = function debugEcho(a) {
    if (!(DEBUG)) {
        return;
    }

    console.log(a);
};

/**
 * Sets the debug flag
 * @param {Boolean} flag The
 */
var set_debug = function set_debug(flag) {
    DEBUG = flag;
};

/**
 * Writes a file with the given string as contents
 * @param {String} path The location to write
 * @param {String} content The contents to write in the file
 */
var writeFile = function writeFile(path, content) {
    var callback = function () {
    };
    fs.writeFileSync(path, content, 'utf8', callback);
};

/**
 * Explodes a string into multiple bits (just as String.prototype.split), however when a limit is given, the remaining
 * parts are concatenated at the last. Just like PHP's explode()
 * @param {String} delimiter The delimiter to use
 * @param {String} string The string to explode
 * @param {String} (limit) The maximum amount of 'split's that may happen.
 * @see {@link https://github.com/kvz/phpjs/blob/master/functions/strings/explode.js}
 * @returns {Array} Array containing the bits and pieces
 */
var explode = function explode(delimiter, string, limit) {
    if (arguments.length < 2 || typeof delimiter === 'undefined' || typeof string === 'undefined') {
        return null;
    }

    if (delimiter === '' || delimiter === false || delimiter === null) {
        return false;
    }

    if (typeof delimiter === 'function' || typeof delimiter === 'object' || typeof string === 'function' || typeof string === 'object') {
        return [''];
    }

    if (delimiter === true) {
        delimiter = '1';
    }

    // Here we go...
    delimiter += '';
    string += '';

    var s = string.split(delimiter);

    if (typeof limit === 'undefined') {
        return s;
    }

    // Support for limit
    if (limit == 0) {
        limit = 1;
    }

    // Positive limit
    if (limit > 0) {
        if (limit >= s.length) {
            return s;
        }

        return s.slice(0, limit - 1).concat([s.slice(limit - 1).join(delimiter)]);
    }

    // Negative limit
    if (-limit >= s.length) {
        return [];
    } else {
        s.splice(s.length + limit);
        return s;
    }
};

/**
 * Removes all doubles from an array by creating a new array
 * @param a The array to use
 * @returns {Array} Array without doubles
 */
var uniq = function uniq(a) {
    return Array.from(new Set(a));
};


var toreturn = {
    array_indexOfSmallest: array_indexOfSmallest,
    dump: dump,
    readFile: readFile,
    head: head,
    subhead: subhead,
    debugEcho: debugEcho,
    set_debug: set_debug,
    writeFile: writeFile,
    explode: explode,
    uniq: uniq
}

module.exports = toreturn;
global.Utils = toreturn;