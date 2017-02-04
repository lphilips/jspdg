/**
 * Dirty scanner function to split a .redstone file and "split" it into
 * both Javascript (@client and @server) code, and the UI code (@ui).
 * While not perfect, it should be able to handle the job well for now.
 */

var Utils = require("./utils.js");

/***************/
/* Definitions */
/***************/


/**
 * The default blocks known when parsing
 * @type {string[]}
 */
var defaultBlocks = ["server", "client", "ui", "css", "settings", "slice"];

/**
 * The current blocks known when parsing
 * @type {string[]|null}
 */
var currentBlocks = null;

/**
 * Splits a string document, by using tagged comment blocks. Internal version, without post-processing
 * @param {String} input The input file
 * @param {Array} [blocks] Array of strings of the different blocks.
 * @private
 * @returns {Object} Object containing key pairs of the different blocks, with
 * its values arrays of the different blocks.
 */
var split = function split(input, blocks) {
    currentBlocks = (blocks === undefined) ? defaultBlocks : blocks;
    var result = splitInternal(input);

    // Add empty for non-existing blocks
    currentBlocks.forEach(function (block) {
        if (!(block in result)) {
            result[block] = [];
        }
    });

    return result;
};

/**
 * Splits a string document, by using tagged comment blocks. Internal version, without post-processing
 * @param {String} input The input file
 * @param {Array} [blocks] Array of strings of the different blocks.
 * @private
 * @returns {Object} Object containing key pairs of the different blocks, with
 * its values arrays of the different blocks.
 */
var splitInternal = function splitInternal(input) {

    var blockcomments = currentBlocks.map(function (val) {
        return new RegExp("\\/\\*[^\\*\\/]*\\@\\b" + val + "\\b[\\s\\S]*?\\*\\/", 'g')
    });
    var positions = blockcomments.map(function (val) {
        return input.search(val);
    });
    var smallestidx = Utils.array_indexOfSmallest(positions, -1);

    if (smallestidx === -1) {
        return {"unknown": [input], "comments": {}};
    }

    var smallestpos = positions[smallestidx];
    var smallestblock = currentBlocks[smallestidx];
    var comment = input.match(blockcomments[smallestidx])[0];

    // Generate input without /* @... */, to find end of block.
    /*if (smallestblock == "slice") {
     var annotation = "@slice ";
     var idx = comment.indexOf(annotation);
     var name = comment.slice(idx+annotation.length);
     smallestblock = name.replace( /\n/g, " " ).split( " " )[0];
     }*/

    var first_input = input.substring(0, smallestpos);
    var start = smallestpos + comment.length;
    var last_input = input.substring(start, input.length);

    var rest = splitInternal(last_input);
    var unknown = rest.unknown.splice(rest.unknown.length - 1, 1)[0];

    if (rest.hasOwnProperty(smallestblock)) {
        rest[smallestblock].push(unknown);
        rest.comments[smallestblock].push(comment);
    } else {
        rest[smallestblock] = [unknown];
        if (!rest.comments.hasOwnProperty(smallestblock)) {
            rest.comments[smallestblock] = []
        }
        rest.comments[smallestblock].push(comment);
    }

    rest.unknown.push(first_input);

    return rest;
};

module.exports = {split: split};
global.RedstoneSplitter = {split: split};