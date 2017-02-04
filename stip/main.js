/************************************/
/* Command line version of Stip     */
/************************************/

var stip     = require("./run.js");
var fs       = require("fs");
var path     = require("path");
var utils    = require("./redstone/utils.js");
var escodegen = require("escodegen");


// Load given file as argument from CLI
var inputFile = process.argv[2];

if (inputFile === undefined) {
    console.log("No input file given.");
    process.exit(1);
}

// Read the file from disk
try {
     fs.statSync(inputFile);
} catch (e) {
    console.log("Could not read file!");
    process.exit(1);
}

// Run Stip tool
var input = utils.readFile(inputFile);
var result = stip.tierSplit(input, true);
var client = result[0];
var server = result[1];
var html   = result[2];
var warnings = result[3];

if (warnings.length > 0) {
    console.log(">> ERRORS ENCOUNTERED: ")
    warnings.map(function (e) {
        console.log("  " + e.name + " : " + e);
        console.log(e.stack);
    })
}

// Output the result in files

if (server) {
    utils.writeFile("output/server_env/server.js", escodegen.generate(server.program));
} else {
    console.log("!! No server!");
}

if (client) {
    utils.writeFile("output/client_env/js/client.js", escodegen.generate(client.program));
} else {
    console.log("!! no client!");
}

if (html) {
    utils.writeFile("output/client_env/index.html", html);
}
// Exit
process.exit(0);