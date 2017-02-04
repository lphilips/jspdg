var RedstoneSplitter = require("./redstone-splitter.js");
var RedstoneParser = require("./redstone-parser.js");
var RedstoneGenerator = require("./redstone-generator.js");
var RedstonePreparer = require("./redstone-preparer.js");
var RedstoneApplier = require("./redstone-applier.js");
var RedstoneTypes = require("./redstone-types");



/**
 * Fills in the default values for an settings object. It will create (and
 * return) an empty settings object with all default settings, if an invalid
 * one is given.
 * @param {Object} options Object containing settings.
 * @returns {Object} Settings object
 */
var preprocess_settings = function preprocess_settings(options) {
    if (typeof options !== "object") {
        options = {};
    }
    if (!options.hasOwnProperty("random_length")) {
        options.random_length = 32;
    }
    if (!options.hasOwnProperty("selfclosing_backslash")) {
        options.selfclosing_backslash = false;
    }
    if (!options.hasOwnProperty("server_hostname")) {
        options.server_hostname = "localhost";
    }
    if (!options.hasOwnProperty("server_port")) {
        options.server_port = 3000;
    }
    if (!options.hasOwnProperty("include_source")) {
        options.include_source = true;
    }

    return options;
};

/**
 * Builds the Javascript code from the chunks
 * @param {Array} chunks Chunks object containing all chunks.
 * @returns {string} The compound Javascript code for Stip.js
 */
var build_js = function build_js(chunks) {
    var output = "";
    var slices = [];

    output += chunks.unknown;

    for (prop in chunks) {
        if (prop !== "client" && prop !== "server" && prop !== "comments" &&
            prop !== "ui" && prop !== "css" && prop !== "settings" && prop !== "unknown") {
            slices.push(prop)
        }
    }

    if (chunks.slice.length > 0) {
        for (var i = chunks.slice.length - 1; i >= 0; i--) {
            var slice = [chunks.slice[i]];
            var comments = chunks.comments["slice"][i];
            output += comments;
            output += slice.join("\n") + "\n";
        }
    }
    else {
        output += chunks.comments.server;

        if (chunks.server.length > 0) {
            output += chunks.server.join("\n") + "\n";
        } else {
            output += "{}";
        }

        output += chunks.comments.client;
        if (chunks.client.length > 0) {
            output += chunks.client.join("\n") + "\n";
        } else {
            output += "{}";
        }
    }

    return output;
};

/**
 * Scans top-level variable definitions given a parsed expression
 * @param expressions Expressions parsed by Esprima to look for variable declarations.
 * @returns {Array} Array containing variable names
 */
var scan_toplevel_variables = function scan_toplevel_variables(expressions) {
    var result = [];

    expressions.forEach(function (expression) {
        if (expression.type == esprima.Syntax.VariableDeclaration) {
            var declarations = expression.declarations;

            declarations.forEach(function (declarator) {
                if (declarator.id.type == esprima.Syntax.Identifier) {
                    result.push(declarator.id.name);
                }
            });
        }
    });

    return result;
};

/**
 * Returns the shared variables given an 'unknown' block.
 * @param {String} unknown The unknown block
 * @returns {Array} Array containing shared variables
 */
var get_shared_variables = function get_shared_variables(unknown) {
    var parsed = esprima.parse(unknown);
    return scan_toplevel_variables(parsed.body);
};

/**
 * Builds the CSS code from the chunks
 * @param {Array} chunks Chunks object containing all chunks.
 * @returns {string} The final CSS code
 */
var build_css = function build_css(chunks) {
    var output = "";

    if (chunks.css.length > 0) {
        output += chunks.css.join("\n");
    }

    return output;
};

/**
 * Builds the settings string from the chunks.
 * @param {Array} chunks Chunks object containing all chunks.
 * @returns {string} The final settings object, as a string
 */
var build_settings = function build_settings(chunks) {
    if (chunks.settings.length == 1) {
        return chunks.settings[0];
    } else if (chunks.settings != 0) {
        throw "Only one @settings block allowed";
    } else {
        return "{}";
    }
};

/**
 * Builds the User Interface string from the chunks
 * @param {Array} chunks Chunks object containing all chunks.
 * @returns {string} The final User Interface definitions
 */
var build_ui = function build_ui(chunks) {
    return chunks.ui.join("\n");
};

/**
 * Generates the object that is going to be passed to STiP of variables, callbacks and shared variables that are going
 * to be generated.
 * @param context The context to use
 * @returns {{methodCalls, identifiers, shared_variables: *}} Object containing variables/expressions that need to be
 * generated in STiP during pre-analysis.
 */
var generate_toGenerate = function generate_toGenerate(context) {
    // Generate list of all identifiers that should be generated
    var toGenerateCallbacks = [];
    var toGenerateIdentifiers = [];
    var toGenerateMethods = context.functionNames;

    // Add callbacks from callbacks
    context.callbacks.forEach(function (callback) {
        toGenerateCallbacks.push(callback.name);
    });

    // Add identifiers from crumbs
    context.crumbs.forEach(function (crumb) {
        crumb.variableNames.forEach(function (varname) {
            toGenerateIdentifiers.push(varname);
        });
    });

    // Aid function, so the list with identifiers are unique
    var uniq = function uniq(a) {
        return Array.from(new Set(a));
    };

    // Join them in one object
    var toGenerate = {
        methodCalls: uniq(toGenerateCallbacks.concat(toGenerateMethods)),
        identifiers: uniq(toGenerateIdentifiers),
        shared_variables: context.shared_variables
    };

    return toGenerate;
};


/**
 * Runs the redstone tool on the given input
 * @param {String} input The text input file
 * @returns {Object} Object containing the client HTML code (key: client), server Javascript code (key: server) and the
 * final context with extra information (key: context).
 */
var generate = function generate(input) {
    // Split input into Redstone, and Javascript
    var chunks = RedstoneSplitter.split(input);
    var ui = build_ui(chunks);
    var js = build_js(chunks),
        css = build_css(chunks),
        options = build_settings(chunks);

    //Utils.head("Raw chunks");
    //Utils.dump(chunks);

    //Utils.head("Parsed input");
    //Utils.subhead("UI");
    //Utils.debugEcho(ui);
    //Utils.subhead("Javascript");
    //Utils.debugEcho(js);
    //Utils.subhead("CSS");
    //Utils.debugEcho(css ? css : "none");
    //Utils.subhead("Settings");
    //Utils.dump(options);

    // Pre-process the settings, by supplying the default values
    options = JSON.parse(options);
    options = preprocess_settings(options);
    var context = new RedstoneTypes.ConverterContext(options);
    context.css = css;

    // Store raw_input in context
    context.raw_source = input;

    // Parse the tree
    var result_parse = RedstoneParser.parse(ui);
    Utils.head("Parse result");
    //Utils.dump(result_parse);

    // Install callbacks and crumbs for dynamic content
    RedstonePreparer.prepare(result_parse, context);
    // Utils.head("Pre-process result");
    // Utils.subhead("Trees");
    // Utils.dump(result_parse);
    // Utils.subhead("Context");
    // Utils.dump(context);

    // Calculate shared variables from unknown chunks block
    var shared_variables = get_shared_variables(chunks.unknown);
    context.shared_variables = shared_variables;

    // Disable server creation context if no shared variables, and no server tier defined
    var has_server = !((shared_variables.length == 0) && (chunks.server.length == 0));
    context.has_server = has_server;

    // Pass context to Reactify transpiler before starting Stip, so it has access to the crumbs
    require("../transpiler/Reactify.js").setContext(context);
    require("../transpiler/Node_parse.js").setContext(context);
    var storeInContext = function (a) {
        context.stip = a;
    };
    var storeDeclNode = function (name, declNode) {
        context.varname2declNode[name] = declNode;
    };
    var toGenerate = generate_toGenerate(context);

    // Parse Javascript code using Stip.js
    //head("Running Stip");
    //var stip_result = tiersplit(js, 'redstone', toGenerate, storeInContext, storeDeclNode); // Passes context for callbacks and reactive information
    //var clientJS = escodegen.generate(stip_result[0].program);
    //var serverJS = (has_server ? escodegen.generate(stip_result[1].program) : "none");

    //head("Stip result");
    //subhead("Client");
    //debugEcho(clientJS);
    //subhead("Server");
    //debugEcho(serverJS);

    // Add client code to <head> in result tree
    //context.clientJS = clientJS;

    // Apply changes, "cached" in context
    result_parse = RedstoneApplier.applyContext(result_parse, context);

    // Generate the resulting HTML
    var result_html = RedstoneGenerator.generate(result_parse, context);

    // Output result
    // Utils.head("Result");
    // Utils.subhead("Resulting HTML");
    // Utils.debugEcho(result_html);
    //subhead("Resulting Server code (Node)");
    //debugEcho(serverJS);

    context.toGenerate = toGenerate;
    // Return result
    return {
        hasUI: ui.length > 0,
        html: result_html,
        inputJS: js,
        //	server: (has_server ? serverJS : false),
        context: context,
        storeDeclNode: storeDeclNode,
    };
};


module.exports = {generate: generate};
global.Redstone = {generate: generate};