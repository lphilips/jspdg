/***********/
/* Imports */
/***********/

var DynamicExpression  = require("./redstone-types.js").DynamicExpression;
var DynamicIfBlock     = require("./redstone-types.js").DynamicIfBlock;
var DynamicUnlessBlock = require("./redstone-types.js").DynamicUnlessBlock;
var DynamicEachBlock   = require("./redstone-types.js").DynamicEachBlock;
var DynamicWithBlock   = require("./redstone-types.js").DynamicWithBlock;
var Tag                = require("./redstone-types.js").Tag;
var ExposedValue       = require("./redstone-types.js").ExposedValue;


/**********/
/* Fields */
/**********/

var context = {};


/***************/
/* Definitions */
/***************/

/**
 * Sets the context to use to get information from.
 * @param {ConverterContext} newContext The context to use
 * @private
 */
var set_context = function set_context(newContext) {
    context = newContext;
};

/**
 * Creates a string for indentation.
 * @param {Number} indentation The indentation level.
 * @param {String} [str] The string to use for indentation (default: "\t")
 * @private
 */
var create_indent = function create_indent(indentation, str) {
    if (str === undefined) {
        str = "\t";
    }
    return str.repeat(indentation);
};

/**
 * Generates HTML for all elements inside another element.
 * @param {Array} content The contents of a higher tag.
 * @param {Number} indent The indentation level to use.
 */
var generate_innerHTML = function generate_innerHTML(content, indent) {
    if (content.length > 0) {
        var first = content[0];
        // If only size 1, and type is text: do not use newlines.
        if ( (content.length == 1) && (typeof first == "string") ) {
            return first;
        } else {
            var hasTagInside = false;
            var innerHTML = content.map(function(sub) {
                if (sub instanceof Tag) {
                    hasTagInside = true;
                }
                return generate_tree(sub, indent + 1);
            }).join(hasTagInside ? "\n" : "");

            if (!hasTagInside) {
                innerHTML = create_indent(indent + 1) + innerHTML;
            }

            return "\n" + innerHTML + "\n" + create_indent(indent);
        }
    }
    return "";
};

/**
 * Generates the value for a certain attribute
 * @param value The attribute
 * @returns {String} The value of the attribute value
 */
var generate_attribute_value = function generate_attribute_value(value) {
    // If string, convert it to a singleton array
    if (typeof value === 'string') {
        value = [value];
    }

    return value.map(function (part) {
        if (part instanceof ExposedValue) {
            return "{{" + part.crumb.idName + "}}";
        }

        if (part instanceof DynamicExpression) {
            return generate_dynamic_expression(part, 0);
        }

        if (typeof part === "string") {
            return part;
        }

        throw "Unknown type of part '" + part + "'.";
    }).join("");
};

/**
 * Generates a single attribute definition
 * @param name The name of the attribute
 * @param value The value of the attribute
 * @returns {String} The attribute definition in HTML5
 */
var generate_attribute = function generate_attribute(name, value) {
    if (name[0] === "@") {
        return "";
    }

    var html = "";

    html += " " + name;

    if (value.length > 0) {
        html += "=\"" + generate_attribute_value(value) + "\"";
    }

    return html;
};

/**
 * Generate attribute definitions for HTML.
 * @param {Tag} tag The tag to get id, classes and attributes for.
 * @returns {String} String containing the attribute definitions in HTML.
 */
var generate_attributes = function generate_attributes(tag) {
    var resultHTML = "";

    // Add attributes
    var attributes = tag.attributes;
    for (var name in attributes) {
        if (attributes.hasOwnProperty(name)) {
            resultHTML += generate_attribute(name, attributes[name]);
        }
    }

    // Add classes
    var classes = tag.classes;
    if (classes.length > 0) {
        resultHTML += " class=\"" + classes.join(" ") + "\"";
    }

    // Add id
    var id = tag.id;
    if (typeof id === "string") {
        resultHTML += " id=\"" + id + "\"";
    }

    // Add events
    tag.events.forEach(function (event) {
        switch (event.type) {
            case "click":
                resultHTML += " on-click=\"" + event.idName + "\"";
        }
    });

    return resultHTML;
};

/**
 * Generate the opening tag, including the attribute definitions.
 * @param {Tag} tag The tag to get id, classes and attributes for.
 * @param {Boolean} [selfclosing] Whether this tag is a self-closing tag.
 * @returns {String} String containing the opening tag for the given tag.
 */
var generate_opentag = function generate_opentag(tag, selfclosing) {
    var tagname = tag.tagname;

    var resultHTML = "<" + tagname + generate_attributes(tag);
    if ( (selfclosing === true) && (context.options.selfclosing_backslash) ) {
        resultHTML += " /";
    }
    resultHTML += ">";

    return resultHTML;
};

/**
 * Generate the closing tag.
 * @param {Tag} tag The tag to get id, classes and attributes for.
 * @returns {String} String containing the closing tag for the given tag.
 */
var generate_closetag = function generate_closetag(tag) {
    var tagname = tag.tagname;

    return "</" + tagname + ">";
};

/**
 * Preprocesses a tag by changing some values, if none are given, by their
 * default values, or by taking the content, and using it as an attribute.
 * @param {Tag} tag The tag to preprocess.
 * @private
 */
var preprocess_tag = function preprocess_tag(tag) {
    var tagname = tag.tagname;

    switch (tagname) {
        case "img":
        case "iframe":
            if (tag.content.length == 1) {
                if (tag.attributes.hasOwnProperty("src")) {
                    throw "src attribute already given";
                }
                tag.attributes.src = tag.content[0];
            }
            break;
    }
};

/**
 * Generates HTML for a generic tag name, with an innerHTML and no limitations
 * on classes, idNames or attributes.
 * @param {Tag} tag The tag to generate HTML code for.
 * @param {Number} indent The indentation level to use.
 * @private
 * @returns HTML for the given tag.
 */
var generate_generic = function generate_generic(tag, indent) {
    preprocess_tag(tag);

    var content = tag.content;
    var resultHTML = create_indent(indent);

    // Generate opening tag
    resultHTML += generate_opentag(tag);

    // Add innerHTML
    resultHTML += generate_innerHTML(content, indent);

    // Generate closing tag
    resultHTML += generate_closetag(tag);

    return resultHTML;
};

/**
 * Generates HTML for a generic tag name, without any innerHTML and no
 * limitations on classes, idNames or attributes. E.g. br, img...
 * @param {Tag} tag The tag to generate HTML code for.
 * @param {Number} indentation The indentation level to use.
 * @private
 * @returns HTML for the given tag.
 */
var generate_selfclosing = function generate_selfclosing(tag, indentation) {
    preprocess_tag(tag);

    var resultHTML = create_indent(indentation);
    resultHTML += generate_opentag(tag, true);
    return resultHTML;
};

/**
 * Generates HTML for a comment.
 * @param {DynamicExpression} dynamic The comment to generate code for.
 * @param {Number} indentation The indentation level of the given segment.
 * @private
 * @returns {String} HTML for the tag.
 */
var generate_dynamic_expression_is_comment = function generate_dynamic_expression_is_comment(dynamic, indentation) {
    if (dynamic.isHiddenComment) {
        return "";
    } else {
        return create_indent(indentation) + "<!-- " + dynamic.expression + " -->";
    }
};

/**
 * Generates HTML for a dynamic segment.
 * @param {DynamicExpression} dynamic The segment to generate code for.
 * @param {Number} indentation The indentation level of the given segment.
 * @private
 * @returns {String} HTML for the given tag.
 */
var generate_dynamic_expression = function generate_dynamic_expression(dynamic, indentation) {
    if (dynamic.isComment) {
        return generate_dynamic_expression_is_comment(dynamic, indentation);
    }

    if (dynamic.crumb !== null) {
        var randomId = dynamic.crumb.idName;
        return "{{" + randomId + "}}";
    } else {
        var expression = dynamic.expression;
        return "{{" + expression + "}}";
    }
};

/**
 * Generates a dynamic if block.
 * @param {DynamicIfBlock} dynamic The dynamic block to generate HTML code for.
 * @param {Number} indent The current indentation level
 * @private
 * @returns {String} HTML for the given tag.
 */
var generate_dynamic_if_block = function generate_dynamic_if_block(dynamic, indent) {
    var has_crumb = (dynamic.crumb !== null);
    var html = "";

    html += create_indent(indent) + "{{#if " + (has_crumb ? dynamic.crumb.idName : dynamic.predicateExpression) + "}}\n";
    html += generate_list(dynamic.true_branch, indent + 1);
    html += "\n";

    if (dynamic.false_branch.length > 0) {
        html += create_indent(indent) + "{{else}}\n";
        html += generate_list(dynamic.false_branch, indent + 1);
        html += "\n";
    }

    html += create_indent(indent) + "{{/if}}\n";

    return html;
};

/**
 * Generates a dynamic unless block.
 * @param {DynamicUnlessBlock} dynamic The dynamic block to generate HTML code for.
 * @param {Number} indent The current indentation level
 * @private
 * @returns {String} HTML for the given tag.
 */
var generate_dynamic_unless_block = function generate_dynamic_unless_block(dynamic, indent) {
    var has_crumb = (dynamic.crumb !== null);
    var html = "";

    html += create_indent(indent) + "{{#unless " + (has_crumb ? dynamic.crumb.idName : dynamic.predicateExpression) + "}}\n";
    html += generate_list(dynamic.true_branch, indent + 1);
    html += "\n";

    html += create_indent(indent) + "{{/unless}}\n";

    return html;
};

/**
 * Generates a dynamic each block.
 * @param {DynamicEachBlock} dynamic The dynamic block to generate HTML code for.
 * @param {Number} indent The current indentation level
 * @private
 * @returns {String} HTML for the given tag.
 */
var generate_dynamic_each_block = function generate_dynamic_each_block(dynamic, indent) {
    var has_crumb = (dynamic.crumb !== null);
    var html = "";

    html += create_indent(indent) + "{{#each " + (has_crumb ? (dynamic.crumb.idName + ":__idx__") : dynamic.objectExpression) + "}}\n";
    html += generate_list(dynamic.body, indent + 1);
    html += create_indent(indent) + "{{/each}}\n";

    return html;
};

/**
 * Generates a dynamic with block.
 * @param {DynamicWithBlock} dynamic The dynamic block to generate HTML code for.
 * @param {Number} indent The current indentation level
 * @private
 * @returns {String} HTML for the given tag.
 */
var generate_dynamic_with_block = function generate_dynamic_with_block(dynamic, indent) {
    var has_crumb = (dynamic.crumb !== null);
    var html = "";

    html += create_indent(indent) + "{{#with " + (has_crumb ? dynamic.crumb.idName : dynamic.objectExpression) + "}}\n";
    html += generate_list(dynamic.body, indent + 1);
    html += create_indent(indent) + "{{/with}}\n";

    return html;
};

/**
 * Returns the correct generator, given a tagname.
 * @param {String} tagname The tagname to find a generator for.
 * @private
 */
var find_generator = function find_generator(tagname) {
    switch (tagname) {
        case "img":
        case "br":
        case "hr":
        case "input":
        case "link":
        case "embed":
        case "meta":
            return generate_selfclosing
                ;
        default:
            return generate_generic;
    }
};


/**
 * Generates for a given tree (Tag).
 * @param {Tag|DynamicExpression|DynamicIfBlock|DynamicEachBlock|String|DynamicWithBlock|DynamicUnlessBlock} tree The root of the tree.
 * @param {Number} (indent) The indentation level to use.
 * @private
 * @returns {String} HTML for the entire tree.
 */
var generate_tree = function generate_tree(tree, indent) {
    if (indent === undefined) {
        indent = 0;
    }

    if (typeof tree == "string") {
        return tree;
    }

    if (tree instanceof DynamicExpression) {
        return generate_dynamic_expression(tree, indent);
    }

    if (tree instanceof DynamicIfBlock) {
        return generate_dynamic_if_block(tree, indent);
    }

    if (tree instanceof DynamicEachBlock) {
        return generate_dynamic_each_block(tree, indent);
    }

    if (tree instanceof DynamicWithBlock) {
        return generate_dynamic_with_block(tree, indent);
    }

    if (tree instanceof DynamicUnlessBlock) {
        return generate_dynamic_unless_block(tree, indent);
    }

    var tag = tree;
    var tagname = tag.tagname;
    var generator = find_generator(tagname);
    return generator(tag, indent);
};

/**
 * Generates HTML code for all the elements in the given array.
 * @param {Array} input The array to generate HTML for.
 * @param {Number} indentation The indentation level to use. If none given, defaults to 0.
 * @private
 * @returns {String} HTML for the given array.
 */
var generate_list = function generate_list(input, indentation) {
    // Set default value
    if (indentation === undefined) {
        indentation = 0;
    }

    return input.map(function (tree) {
        return generate_tree(tree, indentation);
    }).join("\n");
};

/**
 * Generates the head for the generated tree
 * @param {Array} input The input array containing all the top-level tags
 * @returns {string} The final output HTML for the head
 */
var generate_head = function generate_head(input) {
    var resultHTML = "";
    
    input.forEach(function (tag) {
         if (tag.tagname === "head") {
             resultHTML = generate_tree(tag, 1);
         }
    });

    return resultHTML;
};

/**
 * Generates the body for the generated tree
 * @param {Array} input The input array containing all the top-level tags
 * @returns {string} The final output HTML for the body
 */
var generate_body = function generate_body(input) {
    var resultHTML = "";

    input.forEach(function (tag) {
        if (tag.tagname === "body") {
            resultHTML = generate_tree(tag, 1);
        }
    });

    return resultHTML;
};

/**
 * Generates HTML for given list
 * @param {Array} input The parsed document
 * @param {ConverterContext} newContext The context to use
 * @returns {String} HTML code for the given tree.
 */
var generate = function generate(input, newContext) {
    set_context(newContext);
    
    var html = "";
    html += "<!DOCTYPE html>\n";
    html += "<html>\n";
    html += generate_head(input) + "\n";
    html += generate_body(input) + "\n";
    html += "\n</html>";

    if (context.options.include_source) {
        html += "\n<!--\n";
        html += context.raw_source;
        html += "\n-->\n";
    }

    return html;
};


/***********/
/* Exports */
/***********/

exports.generate = generate;