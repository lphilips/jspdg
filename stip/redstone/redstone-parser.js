/***********/
/* Imports */
/***********/
var Tag = require("./redstone-types.js").Tag;
var ExposedValue = require("./redstone-types.js").ExposedValue;
var DynamicExpression = require("./redstone-types.js").DynamicExpression;
var DynamicIfBlock = require("./redstone-types.js").DynamicIfBlock;
var DynamicUnlessBlock = require("./redstone-types.js").DynamicUnlessBlock;
var DynamicEachBlock = require("./redstone-types.js").DynamicEachBlock;
var DynamicWithBlock = require("./redstone-types.js").DynamicWithBlock;

var explode = require("./utils.js").explode;

    /* Fields */
    /**********/

    var NextBlockType = {
        "BLOCK": 1,
        "TEXT": 2,
        "EXTENDED_TEXT": 3
    };

    var lines = [];

    /***************/
    /* Definitions */
    /***************/

    /**
     * Sets the lines to use.
     * @param {Array} newlines Array containing the lines to parse
     * @private
     */
    var set_lines = function set_lines(newlines) {
        lines = newlines;
    };

    /**
     * Splits a line in an indentation level, and the content.
     * @param {String} line The line to split into a level, and the content.
     * @private
     * @returns {Object} The indentation level (key: indentation) and the remaning
     * contents (key: data).
     */
    var parse_line_indentation = function parse_line_indentation(line) {
        var level = 0;
        var length = line.length;
        var data = "";

        for (var i = 0; i < length; i++) {
            var ch = line[i];

            if (ch == "\t") {
                level++;
            } else {
                data = line.substring(i, length);
                break;
            }
        }
        return {"indentation": level, "data": data};
    };

    /**
     * Splits a tagline into tagdata, contents, and whether the next lines
     * should be handled as text blocks or not.
     * @param {String} data The contents of a line that should be splitted.
     * @private
     * @returns {Object} Object containing the tagdata (key: data), the remaning
     * content (key: content), and whether the next blocks are text or not
     * (key: next_type).
     */
    var parse_tagline = function parse_tagline(data) {
        var n = data.indexOf(" ");
        var newdata = "";

        if (n == -1) { // No space
            var next_text = (data[data.length - 1] == ".");
            if (next_text) {
                var extended = (data[data.length - 2] == ".");
                if (extended) {
                    // Truncate the dots
                    newdata = data.substring(0, data.length - 2);
                    return {
                        "data": newdata,
                        "content": "",
                        "next_type": NextBlockType.EXTENDED_TEXT
                    };
                } else {
                    // Truncate the dot
                    newdata = data.substring(0, data.length - 1);
                    return {
                        "data": newdata,
                        "content": "",
                        "next_type": NextBlockType.TEXT
                    };
                }
            } else {
                return {
                    "data": data,
                    "content": "",
                    "next_type": NextBlockType.BLOCK
                };
            }
        } else {
            newdata = data.substring(0, n);
            var content = data.substring(n + 1, data.length);
            return {
                "data": newdata,
                "content": content,
                "next_type": NextBlockType.BLOCK
            };
        }
    };

    /**
     * Returns whether the given string has length one (a character), and the
     * character is a letter (both uppercase and lowercase)
     * @param {String} str The string to check whether it is a letter.
     * @returns {Boolean} Whether the given string is a letter.
     */
    var isLetter = function isLetter(str) {
        return str.length === 1 && str.match(/[a-z]/i);
    };

    /**
     * Returns whether the given string has length one (a character), and the
     * character is a number.
     * @param {String} str The string to check whether it is a number.
     * @returns {Boolean} Whether the given string is a number.
     */
    var isNumber = function isNumber(str) {
        return (str.length === 1) && str.match(/[0-9]/);
    };

    /**
     * Parses the contents of an exposed expression in an argument definition
     * @param {String} data The data containing the tag definition
     * @param {Number} idx The index in the data string
     * @returns {{next_idx: *, expression: string}} Object containing next index, and the parsed expression
     */
    var parse_exposed_expression_in_argument = function parse_exposed_expression_in_argument(data, idx) {
        idx++;
        var buffer = "";

        while (idx < data.length) {
            var c = data[idx];

            if (c === "}") {
                var next_idx = idx + 1;
                var next_c = data[next_idx];

                if (next_c === "}") {
                    return {
                        "next_idx": next_idx,
                        "expression": buffer
                    };
                }
            }

            buffer += c;
            idx++;
        }

        throw "Exposed value definition did not end";
    };

    /**
     * Reads a string, starting from a certain index, and finds the attribute value (until the first ] that is not in a
     * {{..}}).
     * @param {String} data The string to use to find an attribute name/value.
     * @param {Number} idx The index the opening character ('[') starts on.
     * @returns {Object} Object with the resulting token (key: token) and the
     * next index to continue parsing (key: next_idx).
     */
    var parse_tagdata_attribute_value = function parse_tagdata_attribute_value(data, idx) {
        idx++;

        var result = [];
        var buffer = "";

        // Sends whatever is in buffer to result.
        var to_buffer = function to_buffer() {
            if (buffer.length > 0) {
                result.push(buffer);
                buffer = "";
            }
        };

        while (idx < data.length) {
            var c = data[idx];

            if (c === "{") {
                var next_idx = idx + 1;
                var next_c = data[next_idx];

                if (c !== "{") {
                    throw "Did not expect single { in '" + data + "'.";
                }

                to_buffer();

                var parsedExposed = parse_exposed_expression_in_argument(data, next_idx);
                idx = parsedExposed.next_idx;
                result.push(new RedstoneTypes.DynamicExpression(parsedExposed.expression));

            } else if (c === "]") {
                to_buffer();
                return {
                    next_idx: idx,
                    value: result
                };
            } else {
                buffer += c;
            }

            idx++;
        }

        throw "Did not find ] to end attribute definition: '" + data + "'";
    };

    /**
     * Reads a string, starting from a certain index, and finds the attribute
     * name and the attribute value, until it finds a ].
     * @param {String} data The string to use to find an attribute name/value.
     * @param {Number} idx The index the opening character ('[') starts on.
     * @returns {Object} Object with the resulting token (key: token) and the
     * next index to continue parsing (key: next_idx).
     */
    var parse_tagdata_attribute = function parse_tagdata_attribute(data, idx) {
        idx++;
        var name = "";
        var read_value = false;
        var buffer = "";

        while (idx < data.length) {
            var c = data[idx];

            if (c === "]") {
                name = buffer;
                return {
                    token: {
                        type: "attributevalue",
                        name: name.trim(),
                        value: []
                    },
                    "next_idx": idx
                };
            } else if (c === "=") {
                name = buffer;
                var parsedValue = parse_tagdata_attribute_value(data, idx);

                return {
                    token: {
                        type: "attributevalue",
                        name: name,
                        value: parsedValue.value
                    },
                    "next_idx": parsedValue.next_idx
                };
            } else if (isNumber(c)) {
                if ((!(read_value)) && (buffer === "")) {
                    throw "Attribute name can't start with a number.";
                }
                buffer += c;
            } else {
                buffer += c;
            }

            idx++;
        }

        throw "Did not find ] to end attribute definition";
    };

    /**
     * Reads a tagdata string and makes a tokenized version.
     * @param {String} data The string to tokenize.
     * @returns {Array} List of all the tokens that were found in this string.
     */
    var parse_tagdata_to_tokens = function parse_tagdata_to_tokens(data) {
        var result = [];
        var buffer = "";

        var idx = 0;
        var stop = false;

        while ((idx < data.length) && (!stop)) {
            var c = data[idx];
            if ((c === "#") || (c === ".") || (c === "[")) {
                if (buffer !== "") {
                    result.push({type: "string", data: buffer});
                    buffer = "";
                }
                if (c === "[") {
                    var res = parse_tagdata_attribute(data, idx);
                    idx = res.next_idx;
                    result.push(res.token);
                } else {
                    result.push({type: "seperator", "data": c});
                }
            } else if (isLetter(c)) {
                buffer += c;
            } else if ((isNumber(c)) || (c === "-") || (c === "_")) {
                if (buffer === "") {
                    throw "Tagname, or attribute, can't start with '" + c + "'";
                }
                buffer += c;
            } else if (c === " ") {
                stop = true;
            } else {
                throw "Unknown character '" + c + "', parsing '" + data + "'.";
            }

            idx++;
        }

        // Store last token
        if (buffer !== "") {
            result.push({type: "string", data: buffer});
        }

        result.push({type: "end", "idx": idx});

        return result;
    };

    /**
     * Parses a tag definition (both the sora definitions, and the tagname),
     * and creates a new Tag (with empty contents).
     * @param {String} data The tag definition.
     * @private
     * @returns {{tag: (any), rest: string, next_type: number}} The tag with id, classes and attributes filled in.
     */
    var parse_tagdata = function parse_tagdata(data) {
        var tokens = parse_tagdata_to_tokens(data);
        var next_type = NextBlockType.BLOCK;

        if (tokens[0].type !== "string") {
            throw "Tagdata should start with type of tag.";
        }

        var tagname = tokens[0].data;
        var id = null;
        var classes = [];
        var attributes = {};

        var idx = 1;

        var stop = false;

        while ((idx < tokens.length) && (!stop)) {
            var token = tokens[idx];
            var type = token.type;

            switch (type) {
                case "string":
                    throw "Unable to apply string on position '" + idx + "' with tagdata '" + data + "'.";

                case "seperator":
                    if (idx + 1 >= tokens.length) {
                        throw "Token overflow on " + data + ".";
                    }

                    var sepchar = token.data;
                    var nexttoken = tokens[idx + 1];

                    if (nexttoken.type !== "string") {
                        if (nexttoken.type === "end") {
                            next_type = NextBlockType.TEXT;
                            stop = true;
                            break;
                        }

                        if (nexttoken.type === "seperator") {
                            var nextnexttoken = tokens[idx + 2];
                            if (nextnexttoken.type === "end") {
                                next_type = NextBlockType.EXTENDED_TEXT;
                                stop = true;
                                break;
                            } else {
                                throw "Did not expect '..', but not at the end in '" + data + "'";
                            }
                        }

                        throw "Next token is not a string.";
                    }

                    switch (sepchar) {
                        case ".":
                            classes.push(nexttoken.data);
                            break;

                        case "#":
                            if (id !== null) {
                                throw "double id given";
                            }
                            id = nexttoken.data;
                            break;

                        default:
                            throw "Unknown seperator type.";
                    }

                    // Extra fast-forward, as we are parsing 2 tokens here
                    idx++;
                    break;

                case "attributevalue":
                    if (attributes.hasOwnProperty(token.name)) {
                        throw "attribute already used";
                    }

                    attributes[token.name] = token.value;
                    break;
            }

            idx++;
        }

        // Now copy remaining (should be normal content)
        var rest_idx = tokens[tokens.length - 1].idx;
        var rest = data.substring(rest_idx);

        return {
            tag: new RedstoneTypes.Tag(tagname, id, classes, attributes),
            rest: rest,
            next_type: next_type
        };
    };

    /**
     * Transforms a text, replacing {{expression}} with DynamicExpressions. The result
     * of this function is an array containing all segments.
     * @param {String} input The input string.
     * @private
     * @return {Array} Array, alternating between text and DynamidSegments.
     */
    var parse_text = function parse_text(input) {
        var n_open = input.indexOf("{{");
        if (n_open == -1) {
            return [input];
        }
        var n_close = input.indexOf("}}");
        if (n_open > n_close) {
            throw "}} before {{";
        }
        var first = input.substring(0, n_open);
        var expression = input.substring(n_open + 2, n_close);
        var rest = input.substring(n_close + 2, input.length);

        var dsegment = new RedstoneTypes.DynamicExpression(expression);
        return [first, dsegment].concat(parse_text(rest));
    };

    /**
     * Adds the given textual content to content of a tag.
     * @param {Tag} tag The tag to add new content to.
     * @param {String} content The raw contents.
     * @private
     */
    var add_text_content_to_tag = function add_text_content_to_tag(tag, content) {
        var parsed_text = parse_text(content);
        // Do not use concat, as it creates a new array.
        parsed_text.forEach(function (segment) {
            tag.content.push(segment);
        });
    };

    /**
     * Parses all the blocks starting at a certain indentation, and adds the result
     * as the content of the given tag.
     * @param {Tag} tag The tag to add the new blocks to.
     * @param {Number} idx The index in the lines array to start parsing.
     * @param {Number} indentation The indentation level of the prior block.
     * @private
     * @returns {Object} Object with the next index to use for parsing the next
     * block (key: next_idx), and the final tag.
     */
    var parse_subblocks = function parse_subblocks(tag, idx, indentation) {
        var next_idx = idx;
        var has_next = (next_idx < lines.length);

        while (has_next) {
            idx = next_idx;
            var next = parse_line_indentation(lines[idx]);

            if (next.indentation > indentation) {
                var a = parse_block(idx);
                next_idx = a.next_idx;
                tag.content.push(a.result);
            } else {
                break;
            }

            has_next = (next_idx < lines.length);
        }

        return {"next_idx": next_idx, "result": tag};
    };

    /**
     * Parses all the blocks starting at a certain indentation, and adds the result
     * as the content of the given tag. Expects all the following blocks to be
     * textual blocks. Unless they have an higher indentation of the first block.
     * @param {Tag} tag The tag to add the new blocks to.
     * @param {Number} idx The index in the lines array to start parsing.
     * @param {Number} indentation The indentation level of the prior block.
     * @private
     * @returns {Object} Object with the next index to use for parsing the next
     * block (key: next_idx), and the final tag.
     */
    var parse_textblocks = function parse_textblocks(tag, idx, indentation) {
        var next_idx = idx;
        var has_next = (next_idx < lines.length);

        // Identation of text blocks: if larger, parse as normal blocks again.
        var cmp_indentation = -1;
        while (has_next) {
            idx = next_idx;
            var next = parse_line_indentation(lines[idx]);
            var next_indentation = next.indentation;

            if (next_indentation > indentation) {
                if ((cmp_indentation === -1) ||
                    (cmp_indentation == next_indentation)) {
                    add_text_content_to_tag(tag, next.data);

                    cmp_indentation = next_indentation;
                    next_idx = idx + 1;
                } else {
                    var a = parse_block(idx);
                    next_idx = a.next_idx;
                    tag.content.push(a.result);
                }
            } else {
                break;
            }

            has_next = (next_idx < lines.length);
        }

        return {"next_idx": next_idx, "result": tag};
    };

    /**
     * Removes indentation from a string.
     * @param {Number} indentation The indentation level.
     * @param {String} str The string to delete indentation from.
     * @private
     */
    var remove_indent = function remove_indent(indentation, str) {
        return str.substring(indentation, str.length);
    };

    /**
     * Parses all the blocks starting at a certain indentation, and adds the result
     * as the content of the given tag. Expects all the following blocks to be
     * textual blocks. Unless they have an higher indentation of the first block.
     * @param {Tag} tag The tag to add the new blocks to.
     * @param {Number} idx The index in the lines array to start parsing.
     * @param {Number} indentation The indentation level of the prior block.
     * @private
     * @returns {Object} Object with the next index to use for parsing the next
     * block (key: next_idx), and the final tag.
     */
    var parse_extended_textblocks = function parse_extended_textblocks(tag, idx, indentation) {
        var next_idx = idx;
        var has_next = (next_idx < lines.length);

        while (has_next) {
            idx = next_idx;
            var next_raw = lines[idx];
            var next = parse_line_indentation(next_raw);
            var next_indentation = next.indentation;

            if (next_indentation > indentation) {
                var content = remove_indent(indentation, next_raw);
                add_text_content_to_tag(tag, content);
                next_idx = idx + 1;
            } else {
                break;
            }

            has_next = (next_idx < lines.length);
        }

        return {"next_idx": next_idx, "result": tag};
    };

    /**
     * Returns the correct parse_... method, depending on the type of the next lines.
     * @private
     * @param {NextBlockType} type The type.
     */
    var get_method_of_next_type = function get_method_of_next_type(type) {
        switch (type) {
            case NextBlockType.BLOCK:
                return parse_subblocks;

            case NextBlockType.TEXT:
                return parse_textblocks;

            case NextBlockType.EXTENDED_TEXT:
                return parse_extended_textblocks;

            default:
                throw "Unsupported value.";
        }
    };

    /**
     * Returns whether the given line contains a definition for a dynamic block.
     * @param {String} str The string to check if it contains a dynamic block definition
     * @private
     * @returns {Boolean} true if the given string contains a dynamic block definition, false otherwise.
     */
    var is_dynamicblock = function is_dynamicblock(str) {
        var checkstr = "{{#";
        return (str.indexOf(checkstr) === 0);
    };

    /**
     * Parses the keyword and the argument(s) of a dynamic block definition.
     * @param {String} data The string containing the dynamic block definition.
     * @private
     * @returns Object containing the keyword (key: keyword) and the arguments (key: rest).
     */
    var parse_dynamicblock_tag = function parse_dynamicblock_tag(data) {
        var rest = data.substring(3, data.length);
        var endStr = rest.substring(rest.length - 2, rest.length);

        if (endStr !== "}}") {
            throw "Dynamic Block should end with '}}'";
        }

        rest = rest.substring(0, rest.length - 2);
        var rests = Utils.explode(" ", rest, 2);

        return {"keyword": rests[0], "rest": rests[1]};
    };

    /**
     * Parses a dynamic if block, and the matching else block
     * @param {Number} indentation The indentation of the block
     * @param {Object} parsed_tag Object containing information about the tag (result of parse_dynamicblock_tag).
     * @param {Number} idx The current index we are reading
     * @private
     * @returns {Object} containing the dynamic if block (key: result) and the next index to read (key: next_idx)
     */
    var parse_dynamicblock_if = function parse_dynamicblock_if(indentation, parsed_tag, idx) {
        var expression = parsed_tag.rest;
        var result = new RedstoneTypes.DynamicIfBlock(expression);

        // Parse the first block
        var true_branch = parse_block(idx + 1);
        result.true_branch.push(true_branch.result);
        var next_idx = true_branch.next_idx;

        // Prepare the read more...
        var at_true_branch = true;
        var parsedBlock;

        // While there is more to read
        while (next_idx < lines.length) {
            var next = parse_line_indentation(lines[next_idx]);

            // More in current branch
            if (next.indentation > indentation) {
                parsedBlock = parse_block(next_idx);

                if (at_true_branch) {
                    result.true_branch.push(parsedBlock.result);
                } else {
                    result.false_branch.push(parsedBlock.result);
                }

                next_idx = parsedBlock.next_idx;
            } else {
                // Possible {{#else}}
                if (is_dynamicblock(next.data)) {
                    var parsed_next_tag = parse_dynamicblock_tag(next.data);
                    if (parsed_next_tag.keyword === "else") {
                        if (!at_true_branch) {
                            throw "already at else branch, can't have multiple instances of else in same if block";
                        }


                        if ((parsed_next_tag.rest !== "") &&
                            (parsed_next_tag.rest !== undefined)) {
                            throw "else expects no arguments. Found '" + parsed_next_tag.rest + "'";
                        }

                        var false_branch = parse_block(next_idx + 1);
                        result.false_branch.push(false_branch.result);
                        next_idx = false_branch.next_idx;

                        at_true_branch = false;
                    }
                } else {
                    break;
                }
            }
        }

        return {"next_idx": next_idx, "result": result};
    };

    /**
     * Parses a dynamic if block, and the matching else block
     * @param {Number} indentation The indentation of the block
     * @param {Object} parsed_tag Object containing information about the tag (result of parse_dynamicblock_tag).
     * @param {Number} idx The current index we are reading
     * @private
     * @returns {Object} containing the dynamic if block (key: result) and the next index to read (key: next_idx)
     */
    var parse_dynamicblock_unless = function parse_dynamicblock_unless(indentation, parsed_tag, idx) {
        var expression = parsed_tag.rest;
        var result = new RedstoneTypes.DynamicUnlessBlock(expression);

        // Parse the first block
        var true_branch = parse_block(idx + 1);
        result.true_branch.push(true_branch.result);
        var next_idx = true_branch.next_idx;

        // Prepare the read more...
        var parsedBlock;

        // While there is more to read
        while (next_idx < lines.length) {
            var next = parse_line_indentation(lines[next_idx]);

            // More in current branch
            if (next.indentation > indentation) {
                parsedBlock = parse_block(next_idx);
                result.true_branch.push(parsedBlock.result);
                next_idx = parsedBlock.next_idx;
            } else {
                break;
            }
        }

        return {"next_idx": next_idx, "result": result};
    };

    /**
     * Parses a dynamic each block, and the matching else block
     * @param {Number} indentation The indentation of the block
     * @param {Object} parsed_tag Object containing information about the tag (result of parse_dynamicblock_tag).
     * @param {Number} idx The current index we are reading
     * @private
     * @returns Object containing the dynamic each block (key: result) and the next index to read (key: next_idx)
     */
    var parse_dynamicblock_each = function parse_dynamicblock_each(indentation, parsed_tag, idx) {
        var expression = parsed_tag.rest;
        var result = new RedstoneTypes.DynamicEachBlock(expression);

        var body = parse_block(idx + 1);
        var next_idx = body.next_idx;

        var totalBody = [body.result];

        // While there is more to read
        while (next_idx < lines.length) {
            var next = parse_line_indentation(lines[next_idx]);

            if (next.indentation > indentation) {
                var parsedblock = parse_block(next_idx);
                totalBody.push(parsedblock.result);
                next_idx = parsedblock.next_idx;
            } else {
                break;
            }
        }

        result.body = totalBody;
        result.object = expression;

        return {"next_idx": next_idx, "result": result};
    };

    /**
     * Parses a dynamic with block, and the matching else block
     * @param {Number} indentation The indentation of the block
     * @param {Object} parsed_tag Object containing information about the tag (result of parse_dynamicblock_tag).
     * @param {Number} idx The current index we are reading
     * @private
     * @returns Object containing the dynamic each block (key: result) and the next index to read (key: next_idx)
     */
    var parse_dynamicblock_with = function parse_dynamicblock_with(indentation, parsed_tag, idx) {
        var expression = parsed_tag.rest;
        var result = new RedstoneTypes.DynamicWithBlock(expression);

        var body = parse_block(idx + 1);
        var next_idx = body.next_idx;

        var totalBody = [body.result];

        // While there is more to read
        while (next_idx < lines.length) {
            var next = parse_line_indentation(lines[next_idx]);

            if (next.indentation > indentation) {
                var parsedblock = parse_block(next_idx);
                totalBody.push(parsedblock.result);
                next_idx = parsedblock.next_idx;
            } else {
                break;
            }
        }

        result.body = totalBody;
        result.object = expression;

        return {"next_idx": next_idx, "result": result};
    };

    /**
     * Parses a dynamic block.
     * @param {Number} idx The current line that should be parsed
     * @private
     * @returns Object containing the dynamic each block (key: result) and the next index to read (key: next_idx)
     */
    var parse_dynamicblock = function parse_dynamicblock(idx) {
        var current = parse_line_indentation(lines[idx]);
        var indentation = current.indentation;
        var data = current.data;
        var parsed_tag = parse_dynamicblock_tag(data);
        var keyword = parsed_tag.keyword;

        switch (keyword) {
            case "if":
                return parse_dynamicblock_if(indentation, parsed_tag, idx);

            case "unless":
                return parse_dynamicblock_unless(indentation, parsed_tag, idx);

            case "else":
                throw "Standalone else is not allowed.";

            case "each":
                return parse_dynamicblock_each(indentation, parsed_tag, idx);

            case "with":
                return parse_dynamicblock_with(indentation, parsed_tag, idx);

            default:
                throw "Unknown type of Dynamic Block '" + keyword + "'.";
        }
    };

    /**
     * Checks whether the given lineData denotes a comment
     * @param lineData The line to parse
     * @returns {boolean} true if the given lineData is a comment, false otherwise
     */
    var is_comment = function is_comment(lineData) {
        return ( (lineData.indexOf("{{- ") === 0) || (lineData.indexOf("{{/ ") === 0) );
    };

    /**
     * Parses a comment, at the start of a block
     * @param idx The line to scan
     * @returns {{next_idx: number, result: (DynamicExpression)}} Object containing the next position (key: next_idx) and
     * the scanned block (key: result)
     */
    var parse_comment = function parse_comment(idx) {
        var lineData = parse_line_indentation(lines[idx]).data;

        var endPos = lineData.indexOf("}}");
        var comment = lineData.substring(2, endPos); // Will be identified as comment later
        // Only supply part of comment (+ type of comment), dirty, but otherwise there is code duplication

        return {
            "next_idx": idx + 1,
            "result": new RedstoneTypes.DynamicExpression(comment)
        };
    };

    /**
     * Parses a block by creating a new tag, and reading the next blocks with an
     * higher indentation level, and adding it to the contents of this tag.
     * @private
     * @returns {Object} Object with the next index to use for parsing the next
     * block (key: next_idx), and the final tag.
     */
    var parse_block = function parse_block(idx) {
        var current = parse_line_indentation(lines[idx]);
        var indentation = current.indentation;
        var lineData = current.data;

        if (is_dynamicblock(lineData)) {
            return parse_dynamicblock(idx);
        }

        if (is_comment(lineData)) {
            return parse_comment(idx);
        }

        var parsedTag = parse_tagdata(lineData);
        var tag = parsedTag.tag;
        var content = parsedTag.rest;
        var next_type = parsedTag.next_type;
        var next_idx = idx + 1;

        if (content.length > 0) {
            add_text_content_to_tag(tag, content);
        }

        var method = get_method_of_next_type(next_type);
        return method(tag, next_idx, indentation);
    };

    /**
     * Parses an input string, and returns a list of trees (Tags).
     * @param {String} input The complete input string.
     * @public
     * @returns {Array} Array containing trees starting at the top level.
     */
    var parse = function parse(input) {
        var read_lines = input.split("\n");
        set_lines(read_lines);

        // Filter out blank lines
        lines = lines.filter(function (line) {
            var no_whitespace = line.replace(/\s/g, "");
            return (no_whitespace !== "");
        });

        var result = [];
        var idx = 0;
        var has_next = (idx < lines.length);

        while (has_next) {
            var blockresult = parse_block(idx);
            result.push(blockresult.result);
            idx = blockresult.next_idx;
            has_next = (idx < lines.length);
        }

        return result;
    };

module.exports = {parse:parse};
global.RedstoneParser = {parse: parse};