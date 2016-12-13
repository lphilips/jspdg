/* mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');
var assert = require('assert');


/* Libraries */
var esprima = require('../lib/esprima.js');
var escodegen = require('../lib/escodegen.js');



/* Stip - constructing pdg */


var Exceptions = require('../exceptions.js');
var Stip = require('../run.js').Stip;



function tiersplit(src) {
    var program;

        program = Stip.tierSplit(src);
        clientprogram = program[0];
        serverprogram = program[1];
        return [program[0], program[1], program[2].concat(clientprogram.warnings.concat(serverprogram.warnings))];

}


suite('Tier split - exceptions', function () {

    test('@reply outside function', function () {
        var res = tiersplit('/* @server */ {/* @reply */ foo(); } /* @client */ {function foo() {return 42}}');
        var warnings = res[2];
        assert.equal(1, warnings.length);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    /* @reply in a function that is only called locally (server) */
    test('@reply in non-transformed function', function () {
        var res = tiersplit('/* @server */ {function foo() {/* @reply */ bar()} foo(); }  /* @client */ { function bar () {} }');
        var warnings = res[2];
        assert.equal(2, warnings.length);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
        assert.equal(warnings[1].name, Exceptions.ReplyAnnotationLocation.name);

    });

    test('correct @reply', function () {
        var res = tiersplit('/* @server */ {function foo() {/* @reply */ bar()} foo();} /* @client */ {function bar() {} foo();}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        var warnings = res[2];
        compareAst(escodegen.generate(ast0),
            'client.rpcCall("foo", function (_v0_, _v1_) {}); client.expose({"bar": function (callback) {}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function foo() {server.rpc("bar", [])} foo(); server.expose({"foo": function (callback) {var self=this;self.rpcCall("bar")}})',
            {varPattern: /_v\d_/});
        assert.equal(1, warnings.length);
        assert.equal(warnings[0].name, Exceptions.ReplyAnnotationLocation.name);
    });

    test('local declaration used in other tier', function () {
        var res = tiersplit('/* @server */ {/* @local */ var a = 22; var b = a * 3; } /* @client */ {var d = a * 2;}');
        var warnings = res[2];
        assert.equal(1, warnings.length);
        assert.equal(warnings[0].name, Exceptions.LocalUsedByOtherTier.name);
    });




});



