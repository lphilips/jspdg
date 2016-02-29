var Stipjs = (function ()  {

var compareAst = require('compare-ast');

/* Libraries */
var esprima         = require('./lib/esprima.js');
var escodegen       = require('./lib/escodegen.js');

/* Jipda */
var Ast             = require('./../jipda-pdg/ast.js').Ast;


/* Stip - constructing pdg */

var Aux             = require('./aux.js').Aux;
var pre_analyse     = require('./pre-analysis.js').pre_analyse;
var Hoist           = require('./hoist.js').Hoist;
var Stip            = require('./stip.js').Stip;

/* Transpiler */
var Transpiler       = require('./transpiler/slice.js').Transpiler;


function tiersplit (src) {
    var ast = Ast.createAst(src, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) && Comments.isTierAnnotated(node)
    });
    
    var pre_analysis = pre_analyse(ast),
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
                    program  = Transpiler.transpile(nodes, {target: target, tier: option, asynccomm : asyncomm}, graphs.AST);
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

    exports.tiersplit = tiersplit;

})();