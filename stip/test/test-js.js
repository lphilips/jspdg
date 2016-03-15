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

function jsify (src) {
    var ast = Ast.createAst(src, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) && Comments.isTierAnnotated(node)
    });
    var pre_analysis = pre_analyse(ast, {callbacks: [], identifiers: []}),
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
                program;

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
            program = CodeGenerator.transpile(nodes, {target: 'normal', cps : false}, graphs.AST);
            return program;
}


suite('JSify', function () {
    
    test('variables', function () {
        var ast = jsify('var a = 1; var b = 2; var c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });    

    test('function', function () {
        var ast = jsify('function foo (x) {return x * 2} foo(42);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return  x * 2;} foo(42);',
             { varPattern: /_v\d_/ }) 
    });

    test('call argument', function () {
        var ast = jsify('function foo(x) {return x} foo(foo(42));');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x) {return x} foo(foo(42));',
            {varPattern: /_v\d_/ })
    });

    test('nested functions', function () {
        var ast = jsify('function foo(x) {function bar(y) {return x + y * 2;} return bar(5);} foo(2); foo(3);');
        compareAst(escodegen.generate(ast.nosetup), 
            'function foo(x) {function bar(y) {return x + y * 2;} return bar(5);} foo(2); foo(3);')
    });

    test('higher order', function () {
        var ast = jsify('function square(x) {return x * x;} function sum(a, b, term) {if (a == b) return term(b); else return term(a) + sum(a + 1, b, term)} sum(1, 5, square);');
        compareAst(escodegen.generate(ast.nosetup),
            'function square(x) {return x * x;} function sum(a, b, term) {if (a == b) return term(b); else return term(a) + sum(a + 1, b, term)} sum(1, 5, square);')
    });

});
