/***********/
/* Imports */
/***********/

var Tag = require("./redstone-types.js").Tag;
var escodegen = require("escodegen");

var uniq = require("./utils.js").uniq;


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
 * Generates code that generates a function to update variables from ui layer to client layer, and installs it to
 * client redstone.js
 * @returns {Object} The generated AST for handling this part of the application
 */
var generate_update_gui_vars = function generate_update_gui_vars() {
    var result = [];

    var create_updatevar = function create_updatevar(name) {
        var param_name = ((name === "newvalue") ? "newv" : "newvalue");
        return {
            "type": "Program",
            "body": [
                {
                    "type": "ExpressionStatement",
                    "expression": {
                        "type": "AssignmentExpression",
                        "operator": "=",
                        "left": {
                            "type": "MemberExpression",
                            "computed": true,
                            "object": {
                                "type": "MemberExpression",
                                "computed": false,
                                "object": {
                                    "type": "Identifier",
                                    "name": "REDSTONE"
                                },
                                "property": {
                                    "type": "Identifier",
                                    "name": "UPDATECLIENTVAR"
                                }
                            },
                            "property": {
                                "type": "Literal",
                                "value": name,
                                "raw": "\"" + name + "\""
                            }
                        },
                        "right": {
                            "type": "FunctionExpression",
                            "id": null,
                            "params": [
                                {
                                    "type": "Identifier",
                                    "name": param_name
                                }
                            ],
                            "defaults": [],
                            "body": {
                                "type": "BlockStatement",
                                "body": [
                                    {
                                        "type": "ExpressionStatement",
                                        "expression": {
                                            "type": "AssignmentExpression",
                                            "operator": "=",
                                            "left": {
                                                "type": "Identifier",
                                                "name": name
                                            },
                                            "right": {
                                                "type": "Identifier",
                                                "name": param_name
                                            }
                                        }
                                    }
                                ]
                            },
                            "generator": false,
                            "expression": false
                        }
                    }
                }
            ],
            "sourceType": "script"
        };
    };
    
    var varnames = [];
    
    context.exposedValues.forEach(function (exposedValue) {
        var crumb = exposedValue.crumb;
        if (crumb !== null) {
            varnames = varnames.concat(crumb.variableNames);
        }
    });

    context.shared_variables.forEach(function (varname) {
        varnames = varnames.concat(varname);
    });

    varnames = uniq(varnames);

    varnames.forEach(function (varname) {
        result.push(create_updatevar(varname));
    });

    return result;
};

/**
 * Generates the final clientside Javascript code, wrapped in a jQuery $(document).ready(...)
 * @private
 * @returns {String} The final client js code
 */
var generate_innerjs = function generate_innerjs() {
    var js = context.js.reverse();
    var clientJS = context.clientJS;
    var result = "";

    // Open $(document).ready()
    result += "$(document).ready(function() {\n// --> Begin generated";

    result += "\n" + clientJS;

    // Create function to update GUI variables
    var updateClientVars = generate_update_gui_vars();

    updateClientVars.forEach(function (ast) {
        result += "\n" + escodegen.generate(ast);
    });

    // Expose methods used by callbacks and functions used in crumbs
    var exposed_functions = uniq(context.functionNames);
    context.callbacks.forEach(function (event) {
        var name = event.name;
        if (exposed_functions.indexOf(name) != -1) {
            return;
        }
        exposed_functions.push(name);
    });

    exposed_functions.forEach(function(functionName) {
        result += "\nREDSTONE.registerMethod(\"" + functionName + "\", " + functionName + ");";
    });

    // Add remaining Javascript
    js.forEach(function(block) {
        result += "\n" + block;
    });

    // Add call to initialize GUI
    result += "\nREDSTONE.init();";

    // Close $(document).ready()
    result += "\n// <-- End generated\n});";

    return result;
};

/**
 * Generates esprima AST for the part of the code that starts the Ractivity container.
 * @private
 * @returns {Object} AST program containing the boot code for the Ractivity container.
 */
var generate_reactivity = function generate_reactivity() {
    var result = {
        "type": "Program",
        "body": [
            {
                "type": "VariableDeclaration",
                "declarations": [
                    {
                        "type": "VariableDeclarator",
                        "id": {
                            "type": "Identifier",
                            "name": "ractive"
                        },
                        "init": {
                            "type": "NewExpression",
                            "callee": {
                                "type": "Identifier",
                                "name": "Ractive"
                            },
                            "arguments": [
                                {
                                    "type": "ObjectExpression",
                                    "properties": [
                                        {
                                            "type": "Property",
                                            "key": {
                                                "type": "Identifier",
                                                "name": "el"
                                            },
                                            "computed": false,
                                            "value": {
                                                "type": "Literal",
                                                "value": "#render-target",
                                                "raw": "'#render-target'"
                                            },
                                            "kind": "init",
                                            "method": false,
                                            "shorthand": false
                                        },
                                        {
                                            "type": "Property",
                                            "key": {
                                                "type": "Identifier",
                                                "name": "template"
                                            },
                                            "computed": false,
                                            "value": {
                                                "type": "Literal",
                                                "value": "#main-template",
                                                "raw": "'#main-template'"
                                            },
                                            "kind": "init",
                                            "method": false,
                                            "shorthand": false
                                        },
                                        {
                                            "type": "Property",
                                            "key": {
                                                "type": "Identifier",
                                                "name": "data"
                                            },
                                            "computed": false,
                                            "value": {
                                                "type": "ObjectExpression",
                                                "properties": []
                                            },
                                            "kind": "init",
                                            "method": false,
                                            "shorthand": false
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ],
                "kind": "var"
            }
        ],
        "sourceType": "script"
    };

    var properties = result.body[0].declarations[0].init.arguments[0].properties[2].value.properties;

    var push_kv = function push_kv(key, value) {
        properties.push({
            "type": "Property",
            "key": {
                "type": "Identifier",
                "name": key
            },
            "computed": false,
            "value": value,
            "kind": "init",
            "method": false,
            "shorthand": false
        });
    };

    // Add all crumbs with a currently undefined value.
    context.crumbs.forEach(function (crumb) {
        var defaultValue = crumb.defaultValue;
        var value;

        if (defaultValue === undefined) {
            value = {
                "type": "Identifier",
                "value": "undefined"
            };
        } else if (typeof defaultValue === "string") {
            value = {
                "type": "Literal",
                "value": defaultValue,
                "raw": "\"" + defaultValue + "\""
            };
        } else {
            throw "Unknown type of default value for crumb " + defaultValue;
        }

        push_kv(crumb.idName, value);
    });

    context.functionsInWith.forEach(function (id) {
        push_kv(id.name, id)
    });

    return result;
};

/**
 * Creates a new object (mapping) containing all the crumb information, from a given crumbs array.
 * @param {Array} crumbs Array containing all crumbs.
 * @private
 * @returns {Object} Object containing mapping from idNames of crumbs to their on_update information
 */
var crumbs_to_mapping = function crumbs_to_mapping(crumbs) {
    var newobj = {};

    crumbs.forEach(function (crumb) {
        newobj[crumb.idName] = crumb;
    });

    return newobj;
};

/**
 * Creates a mapping from variable names to crumb identifiers
 * @param {Array} crumbs Array containing all crumbs.
 * @private
 * @returns {Object} Object containing mapping from variable names to crumb idNames.
 */
var crumbs_to_varnamemapping = function crumbs_to_varnamemapping(crumbs) {
    var newobj = {};

    crumbs.forEach(function (crumb) {
        var randomId = crumb.idName;
        crumb.variableNames.forEach(function (varname) {
            if (!newobj.hasOwnProperty(varname)) {
                newobj[varname] = [];
            }
            newobj[varname].push(randomId);
        });
    });

    return newobj;
};

/**
 * Generates Javascript code with information about the crumbs, stored in a CRUMBS variable.
 * @private
 * @returns {String} Javascript code so the client can read information about crumbs.
 */
var generate_crumbsjs = function generate_crumbsjs() {
    var result = "";
    result += "REDSTONE.CRUMBS = " +  JSON.stringify(crumbs_to_mapping(context.crumbs)) + ";\n";
    result += "REDSTONE.VARTOCRUMBID = " + JSON.stringify(crumbs_to_varnamemapping(context.crumbs)) + ";\n";
    result += "REDSTONE.EXPOSEDVALUES  = " + JSON.stringify(context.exposedValues) + ";\n";
    result += "REDSTONE.EVENTS = " + JSON.stringify(context.callbacks) + ";\n";
    return result;
};

/**
 * Generates all the new head tags so they can be applied to the HEAD tag
 * @returns {Array} Array containing the head tags that need to be added
 */
var generate_head_content = function generate_head_content() {
    var result = [];

    // Add UTF-8 encoding
    var charset = new Tag("meta");
    charset.attributes.charset = "UTF-8";
    result.push(charset);

    // Add jQuery
    var jquery = new Tag("script");
    jquery.attributes.src = "js/jquery-2.2.1.min.js";
    result.push(jquery);

    // Add Client RPC library
    var clientrpc = new Tag("script");
    clientrpc.attributes.src = "js/rpc.js";
    result.push(clientrpc);

    // Add Client RPC + data library
    var clientdata = new Tag("script");
    clientdata.attributes.src = "js/rpc-data.js";
    result.push(clientdata);

    // Add Ractive (Reactive library)
    var ractive = new Tag("script");
    ractive.attributes.src = "js/ractive-0.7.3.js";
    result.push(ractive);

    // Add Watch.js
    var watchjs = new Tag("script");
    watchjs.attributes.src = "js/watch.js";
    result.push(watchjs);

    // Add Objspy
    var objspy = new Tag("script");
    objspy.attributes.src = "js/objspy.js";
    result.push(objspy);

    // Add esprima syntax definitions
    var esprimaSyntax = new Tag("script");
    esprimaSyntax.attributes.src = "js/esprima-syntax.js";
    result.push(esprimaSyntax);

    // Add own function definitions (redstone.js);
    var redstoneJS = new Tag("script");
    redstoneJS.attributes.src = "js/redstone.js";
    result.push(redstoneJS);


    // Add crumb information
    var crumbs = new Tag("script");
    var crumbsJs = generate_crumbsjs();
    crumbs.content.push(crumbsJs + "\n");
    result.push(crumbs);


    // Add generated Javascript
    var clientTag = new Tag("script");
    clientTag.attributes.src = "js/client.js";
    result.push(clientTag);
    var scripttag = new Tag("script");
    var innerJs = generate_innerjs();
    scripttag.content.push(innerJs + "\n");
    result.push(scripttag);


    // Add CSS style (if supplied)
    if (context.css) {
        var css = new Tag("style");
        css.content.push(context.css);
        result.push(css);
    }

    // Add loading css
    var loadingCSS = new Tag("link");
    loadingCSS.attributes.rel = "stylesheet";
    loadingCSS.attributes.type = "text/css";
    loadingCSS.attributes.href = "css/loading.css";
    result.push(loadingCSS);

    return result;
};

/**
 * Does some magic tricks on the head tag
 * @param {Tag} head The head tag to process
 */
var applyHead = function applyHead(head) {
    var newTags = generate_head_content();
    var first = head.content.slice(0,1);
    var rest = head.content.slice(1);

    newTags.forEach(function(t) {
         first.push(t);
    });
    head.content = first.concat(rest);
    return head.content;
};

/**
 * Adds a title to a just generated head tag
 * @returns {Tag} head the head tag to prcoess
 */
var applyDefaultHead = function applyDefaultHead(head) {
    var title = new Tag("title");
    title.content.push("Redstone App");
    head.content.push(title);
};

/**
 * Generates the HTML tree responsible for the loading overlay
 * @returns {Tag} The HTML tree containing the elements needed for the loading overlay
 */
var generate_loading_html = function generate_loading_html() {
    var loading = new Tag("div", "loading");
    var loadingCircle = new Tag("div");
    loadingCircle.classes.push("loader");
    loading.content.push(loadingCircle);

    return loading;
};

/**
 * Does some magic tricks on the body tag
 * @param {Tag} body The body tag to process
 */
var applyBody = function applyBody(body) {
    var temp = body.content;
    body.content = [];

    // Add loading
    body.content.push(generate_loading_html());

    var render_target = new Tag("div");
    render_target.id = "render-target";
    body.content.push(render_target);

    var main_template = new Tag("script");
    main_template.id = "main-template";
    main_template.attributes.type = "text/ractive";
    main_template.content = temp;
    body.content.push(main_template);

    var reactivity = new Tag("script");
    reactivity.content.push("\n" + escodegen.generate(generate_reactivity()) + "\n");
    body.content.push(reactivity);
};

/**
 * Includes Javascript rules and external libraries into the HTML trees.
 * @param {Array} input Array of HTML trees.
 * @param {ConverterContext} newContext The context to use.
 */
var applyContext = function applyContext(input, newContext) {
    set_context(newContext);

    var seenHead = false;
    var seenBody = false;

    // Find specific elements in the tree
    input.forEach(function(tree) {
        switch (tree.tagname) {
            case "head":
                if (seenHead) {
                    throw "head already seen!";
                }
                seenHead = true;
                applyHead(tree);
                break;

            case "body":
                if (seenBody) {
                    throw "body already seen!";
                }
                seenBody = true;
                applyBody(tree);
                break;
        }
    });

    var newHead, newBody;

    // If neither head nor body was seen, generate body with contents
    if ( (!seenBody) && (!seenHead) ) {
        newBody = new Tag("body");
        newBody.content = input;
        applyBody(newBody);

        newHead = new Tag("head");
        applyDefaultHead(newHead);
        applyHead(newHead);

        input = [newHead, newBody];
    } else {
        // If head was not seen, add it
        if (!seenHead) {
            newHead = new Tag("head");
            applyDefaultHead(newHead);
            applyHead(newHead);
            input.push(newHead);
        }

        // If body was not seen, add it
        if (!seenBody) {
            newBody = new Tag("body");
            applyBody(newBody);
            input.push(newBody);
        }
    }

    return input;
};


/***********/
/* Exports */
/***********/

exports.applyContext = applyContext;