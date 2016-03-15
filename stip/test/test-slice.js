/* single file: mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');



/* Libraries */
var esprima         = require('../lib/esprima.js');
var escodegen       = require('../lib/escodegen.js');

/* Jipda */
var Ast             = require('../../jipda-pdg/ast.js').Ast;


/* Stip - constructing pdg */

var Aux             = require('../aux.js').Aux;
var pre_analyse     = require('../pre-analysis.js').pre_analyse;
var Hoist           = require('../hoist.js').Hoist;
var Stip            = require('../stip.js').Stip;

/* Transpiler */
var CodeGenerator       = require('../transpiler/slice.js').CodeGenerator;

function getNodeForSrc(statementsrc, nodes) {
    var node;
    nodes.forEach(function (n) {
        if (n.parsenode &&
            !n.isActualPNode &&
            !n.isFormalNode ) {
                try {
                    if (escodegen.generate(n.parsenode) === statementsrc) {
                        node = n;
                    }
                } catch (error) {

                }
        }
    });

    return node;
}

function slice (src, statementsrc) {
    var ast = Ast.createAst(src, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) && Comments.isTierAnnotated(node)
    });
    var pre_analysis = pre_analyse(ast, {callabcks: [], identifiers: []}),
        genast       = pre_analysis.ast,
        assumes      = pre_analysis.assumes,
        shared       = pre_analysis.shared,
        asyncs       = pre_analysis.asyncs,
        graphs       = new Stip.Graphs(ast, src, pre_analysis.primitives);

    Stip.start(graphs);

    var PDG          = graphs.PDG,
        nodes        = PDG.getAllNodes(),
        assumesnames = assumes.map(function (ass) {
                                    if (ass.id)
                                        return ass.id.name.trim();
                                    else
                                        return ass.declarations[0].id.name.trim()}),
                removes = [],
                remove    = function (node) {
                    nodes = nodes.remove(node);
                    if (node.isEntryNode) {
                        var params = node.getFormalIn().concat(node.getFormalOut()),
                        body   = node.getBody();
                        params.map(function (param) {nodes = nodes.remove(param)});
                        body.map(function (bodynode) { remove(bodynode)}); //nodes = nodes.remove(bodynode);});
                    }
                    else if (node.isStatementNode) {
                        node.getOutEdges(EDGES.CONTROL)
                            .map(function (e) {remove(e.to)});
                        node.getOutEdges(EDGES.DATA)
                            .filter(function (e) {
                                return e.to.isObjectEntry ||
                                    e.to.isEntryNode;})
                            .map(function (e) {
                                remove(e.to)});
                    }
                    else if (node.isObjectEntry) {
                        node.getOutEdges(EDGES.OBJMEMBER).map(function (e) {
                            remove(e.to)
                        });
                    }
                },
                program, node;


            nodes.map(function (pdgnode) {
                if (pdgnode.parsenode)
                    if (Aux.isFunDecl(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false
                    } 
                    else if (Aux.isVarDeclarator(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false;
                    }
                    else
                        return true
                else
                    return true
            });

            removes.map(function (node) {
               remove(node);
            });
            node  = getNodeForSrc(statementsrc, nodes);
            nodes = graphs.PDG.slice(node);
            nodes.sort(function (n1, n2) {
                return n1.cnt - n2.cnt;
            });
            program = CodeGenerator.transpile(nodes, {target: 'normal', cps : false}, graphs.AST);

            return program;
}


suite('Slicing', function () {
    
    test('variables', function () {
        var ast = slice('var a = 1; var b = 2; var c = a + b; var d = 34;', 'c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });    

    test('function parameters', function () {
        var ast = slice('function foo (x, y) {return x * 2;} foo(42, 4);', 'return x * 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return  x * 2;} foo(42);',
             { varPattern: /_v\d_/ }) 
    });

    test('call argument', function () {
        var ast = slice('var y = 10; function foo(x) {return x+y;} foo(foo(42));', 'foo(42)');
        compareAst(escodegen.generate(ast.nosetup),
            'var y; function foo(x) {return x + y;} y = 10; foo(foo(42));',
            {varPattern: /_v\d_/ })
    });

    test('assignments', function () {
        var ast = slice('var sum = 10; function foo(x) {sum = sum + 1; return sum + x;} foo(2); sum = 3;', 'foo(2);');
        compareAst(escodegen.generate(ast.nosetup),
            'var sum; function foo(x) {sum = sum + 1; return sum + x;} sum = 10; foo(2);',
            {varPattern: /_v\d_/ })
    });

    test('object literal', function () {
        var ast = slice('var p = {x:0, y:1, z: 2}; var d = p.x * p.y; var f = p.z + p.y;', 'd = p.x * p.y;');
        compareAst(escodegen.generate(ast.nosetup),
            'var p; var d; p = { x : 0, y : 1}; d = p.x * p.y;',
            {varPattern: /_v\d_/ })
    });

    test('property as argument', function () {
        var ast = slice('function f (x) { return x; } var p = {x :0, y:0, z:2}; var d = f(p.x);' , 'd = f(p.x);');
        compareAst(escodegen.generate(ast.nosetup),
            'function f (x) {return x;} var p; var d; p = {x:0}; d = f(p.x)',
            {varPattern: /_v\d_/ })
    });

    test('adding property', function () {
        var ast = slice('var z = {y : 1}; z.x = 2; var d = z.x * 2;', 'd = z.x * 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'var z; var d; z = {}; z.x = 2; d = z.x * 2;')
    })

});
