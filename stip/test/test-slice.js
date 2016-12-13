/* single file: mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');



/* Libraries */
var esprima         = require('../lib/esprima.js');
var escodegen       = require('../lib/escodegen.js');



/* Stip - constructing pdg */
var Stip   = require('../run.js').Stip;




suite('Slicing', function () {
    
    test('variables', function () {
        var ast = Stip.slice('var a = 1; var b = 2; var c = a + b; var d = 34;', 'c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });    

    test('function parameters', function () {
        var ast = Stip.slice('function foo (x, y) {return x * 2;} foo(42, 4);', 'return x * 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return  x * 2;} foo(42);',
             { varPattern: /_v\d_/ }) 
    });

    test('call argument', function () {
        var ast = Stip.slice('var y = 10; function foo(x) {return x+y;} foo(foo(42));', 'foo(42)');
        compareAst(escodegen.generate(ast.nosetup),
            'var y; function foo(x) {return x + y;} y = 10; foo(foo(42));',
            {varPattern: /_v\d_/ })
    });

    test('assignments', function () {
        var ast = Stip.slice('var sum = 10; function foo(x) {sum = sum + 1; return sum + x;} foo(2); sum = 3;', 'foo(2);');
        compareAst(escodegen.generate(ast.nosetup),
            'var sum; function foo(x) {sum = sum + 1; return sum + x;} sum = 10; foo(2);',
            {varPattern: /_v\d_/ })
    });

    test('object literal', function () {
        var ast = Stip.slice('var p = {x:0, y:1, z: 2}; var d = p.x * p.y; var f = p.z + p.y;', 'd = p.x * p.y;');
        compareAst(escodegen.generate(ast.nosetup),
            'var p; var d; p = { x : 0, y : 1}; d = p.x * p.y;',
            {varPattern: /_v\d_/ })
    });

    test('property as argument', function () {
        var ast = Stip.slice('function f (x) { return x; } var p = {x :0, y:0, z:2}; var d = f(p.x);' , 'd = f(p.x);');
        compareAst(escodegen.generate(ast.nosetup),
            'function f (x) {return x;} var p; var d; p = {x:0}; d = f(p.x)',
            {varPattern: /_v\d_/ })
    });

    test('adding property', function () {
        var ast = Stip.slice('var z = {y : 1}; z.x = 2; var d = z.x * 2;', 'd = z.x * 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'var z; var d; z = {}; z.x = 2; d = z.x * 2;')
    })

});
