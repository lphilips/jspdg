/* single file: mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');



/* Libraries */
var esprima         = require('../lib/esprima.js');
var escodegen       = require('../lib/escodegen.js');
var estraverse      = require('../lib/estraverse.js');


/* Stip - constructing pdg */

var Stip  = require('../run.js').Stip;




suite('JSify', function () {

    function generateJavaScript (src) {
        return Stip.generateJavaScript(src,true);
    }

    test('variables', function () {
        var ast = generateJavaScript('var a = 1; var b = 2; var c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });    

    test('function', function () {
        var ast = generateJavaScript('function foo (x) {return x * 2} foo(42);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return  x * 2;} foo(42);',
             { varPattern: /_v\d_/ }) 
    });

    test('call argument', function () {
        var ast = generateJavaScript('function foo(x) {return x} foo(foo(42));');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return x} foo(foo(42));',
            {varPattern: /_v\d_/ })
    });

    test('nested functions', function () {
        var ast = generateJavaScript('function foo(x) {function bar(y) {return x + y * 2;} return bar(5);} foo(2); foo(3);');
        compareAst(escodegen.generate(ast.nosetup), 
            'function foo(x) {function bar(y) {return x + y * 2;} return bar(5);} foo(2); foo(3);')
    });

    test('higher order', function () {
        var ast = generateJavaScript('function square(x) {return x * x;} function sum(a, b, term) {if (a == b) return term(b); else return term(a) + sum(a + 1, b, term)} sum(1, 5, square);');
        compareAst(escodegen.generate(ast.nosetup),
            'function square(x) {return x * x;} function sum(a, b, term) {if (a == b) return term(b); else return term(a) + sum(a + 1, b, term)} sum(1, 5, square);')
    });

});
