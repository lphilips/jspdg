/* mocha --ui tdd tests/test.js  */

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
var Exceptions      = require('../exceptions.js');
var Stip            = require('../stip.js').Stip;

/* Transpiler */
var CodeGenerator       = require('../transpiler/slice.js').CodeGenerator;




function tiersplit (src) {
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
        slicedc      = PDG.sliceDistributedNode(PDG.dclient),
        sliceds      = PDG.sliceDistributedNode(PDG.dserver),
        sortedc      = slicedc.slice(0),
        sorteds      = sliceds.slice(0),
        removes      = [],
        assumesnames = assumes.map(function (ass) {
                                if (ass.id)
                                    return ass.id.name.trim();
                                else
                                    return ass.declarations[0].id.name.trim()}),
            program,
            splitCode = function (nodes, option) {
                nodes.sort(function (n1, n2) {
                    return n1.cnt - n2.cnt;
                })
                var target   = 'node.js',
                    asyncomm = 'callbacks',
                    program  = CodeGenerator.transpile(nodes, {target: target, tier: option, asynccomm : asyncomm}, graphs.AST);
                return program;
            },
            remove    = function (node) {
                sorteds = sorteds.remove(node);
                sortedc = sortedc.remove(node);
                if (node.isEntryNode) {
                    var params = node.getFormalIn().concat(node.getFormalOut()),
                    body   = node.getBody();
                    params.map(function (param) {sorteds = sorteds.remove(param); sortedc = sortedc.remove(param)});
                    body.map(function (bodynode) {remove(bodynode); });
                }
                else if (node.isStatementNode) {
                    node.getOutEdges(EDGES.CONTROL)
                        .map(function (e) {remove(e.to)});
                    node.getOutEdges(EDGES.DATA)
                        .filter(function (e) {
                            return e.to.isObjectEntry ||
                                    e.to.isEntryNode})
                        .map(function (e) {
                            remove(e.to);});
                }
                else if (node.isObjectEntry) {
                    node.getOutEdges(EDGES.OBJMEMBER).map(function (e) {
                        remove(e.to)
                    });
                }
            }
        sortedc.sort(function (n1, n2) { 
            return n1.cnt - n2.cnt;
        }); 
        sorteds.sort(function (n1, n2) { 
            return n1.cnt - n2.cnt;
        });
        /* Filter out nodes that were added by the assumes statement, or default global variables */
        sortedc = sortedc.filter(function (pdgnode) {
            if (pdgnode.parsenode)
                if (Aux.isFunDecl(pdgnode.parsenode) &&
                    assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                    removes = removes.concat(pdgnode);
                    return false;
                } 
                else if (Aux.isVarDeclarator(pdgnode.parsenode) &&
                    assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                    removes = removes.concat(pdgnode);
                    return false;
                }
                else
                    return true;
            else
                return true;
        });
        sorteds = sorteds.filter(function (pdgnode) {
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
        })
        clientprogram =  splitCode(sortedc, "client");
        serverprogram = splitCode(sorteds, "server");
        return [clientprogram, serverprogram];
}


function cpstransform (src) {
    var ast = Ast.createAst(src, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) && 
                        (Comments.isTierAnnotated(node) || 
                            (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
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
            program = CodeGenerator.transpile(nodes, {target: 'normal', cps : true}, graphs.AST);
            return program;
}

suite('Tier split - basic', function () {

    test('variables', function () {
        var res = tiersplit('/* @server */ {var a = 1; var b = 2; var c = a + b;} /* @client */ {var a = 1; var b = 2; var c = a + b;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast0), 'var a; var b; var c; a = 1;store.set("a", a); b = 2; store.set("b", b);c = a + b;store.set("c", c); client.expose({});');
        compareAst(escodegen.generate(ast1), 'var a; var b; var c; a = 1; store.set("a", a); b = 2; store.set("b", b); c = a + b; store.set("c", c);server.expose({});');
    });

    test('functionclienttoserver', function () {
        var res = tiersplit('/* @server */ {function foo (x) {return x}} /* @client */ {var a = foo(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {return callback(null, x)}})');
        compareAst(escodegen.generate(ast0), 
                'var a; client.rpcCall("foo", 42, function (_v1_, _v2_) {a = _v2_;}); client.expose({});', 
                { varPattern: /_v\d_/ });
    });

    test('functionservertoclient_broadcast', function () {
        var res = tiersplit('/* @client */ {function clientf (x) { return x; }} /* @server */ {/* @all */ clientf(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast0), 
            'client.expose({"clientf" : function (x, callback) {return callback(null, x)}});');
        compareAst(escodegen.generate(ast1), 
            'server.rpc("clientf", [42]); server.expose({});');
    });

    test('functionservertoclient_reply', function () {
        var res = tiersplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {return 42+y;} foo();}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast0), 
                    'client.rpcCall("foo", function (_v1_, _v2_) {}); client.expose({"bar" : function (y,callback) {return callback(null,42+y)}})',
                    { varPattern: /_v\d_/ });
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (callback) {this.rpcCall("bar", 3)}})');
    })

   
});

suite('CPS transform', function () {
    
    test('variables', function () {
        var ast = cpstransform('var a = 1; var b = 2; var c = a + b;');
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });    

    test('function', function () {
        var ast = cpstransform('function foo (x) {return x * 2} foo(42);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x * 2)} foo(42, function (_v2_, _v3_) {})',
             { varPattern: /_v\d_/ }) 
    });

    test('call argument', function () {
        var ast = cpstransform('function foo(x) {return x} foo(foo(42));');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} foo(42, function (_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {})})',
            {varPattern: /_v\d_/ })
    })

    test('blocking annotation', function () {
        var ast = cpstransform('function foo(x) {return x} /* @blocking */ foo(42); var a = 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;})',
            {varPattern: /_v\d_/ })
    })

    test('without blocking annotation', function () {
        var ast = cpstransform('function foo(x) {return x} foo(42); var a = 2;');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {}); a = 2;',
            {varPattern: /_v\d_/ })
    })

    test('blocking delimited block', function () {
        var ast = cpstransform('function foo(x) {return x} /* @blocking */ { foo(42); var a = 2;} foo(4);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;}); foo(4, function (_v4_, _v5_){});',
            {varPattern: /_v\d_/ })        
    })

    test('blocking delimited block2', function () {
        var ast = cpstransform('function foo(x) {return x} /* @blocking */ { var z = foo(foo(42)); var a = z + 101;} foo(4);');
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var z; var a; foo(42, function(_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {z = _v5_; a = z + 101;});}); foo(4, function (_v6_, _v7_){});',
            {varPattern: /_v\d_/ })        
    })


});
