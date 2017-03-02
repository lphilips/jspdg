var FlowGraph = require('./stip.js');
Handler = require('./handler.js');
pre_analyse = require('./pre-analysis.js').pre_analyse;
CodeGenerator = require('./transpiler/slice.js');
Hoist = require('./hoist.js');
DefaultPlacementStrategy = require('./placement/default_strategy.js');
Comments = require('./annotations.js');
CheckAnnotations = require('./check-annotations.js');
RedStone = require('./redstone/redstone.js');
Ast = require('../jipda-pdg/ast.js').Ast;
Aux = require('./aux.js');
DNODES = require('./PDG/node.js').DNODES;
Pdg = require('../jipda-pdg/pdg/pdg.js').Pdg;
escodegen = require('escodegen');
esprima = require('esprima');
Analysis = require('./analysis.js');
EDGES = require('./PDG/edge.js').EDGES;
ARITY = require('./PDG/node.js').ARITY;
arityEquals = require('./PDG/node.js').arityEquals;
Advice = require('./placement/advice.js');


function generateGraphs(source, analysis, toGenerate) {
    var warnings = [],
        ast, preanalysis;
    ast = Ast.createAst(source, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) &&
            (Comments.isClientorServerAnnotated(node) || Comments.isSliceAnnotated(node) ||
            (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
    });

    Handler.init();
    preanalysis = pre_analyse(ast, (toGenerate ? toGenerate : {methodCalls: [], identifiers: []}));
    asyncs = preanalysis.asyncs;
    shared = preanalysis.shared;
    graphs = new FlowGraph.Graphs(preanalysis.ast, source, preanalysis.primitives);
    FlowGraph.start(graphs, analysis);
    graphs.PDG.distribute(DefaultPlacementStrategy);
    graphs.warnings = warnings.concat(CheckAnnotations.checkAnnotations(graphs.PDG, {analysis: analysis}));
    graphs.assumes = preanalysis.assumes;
    graphs.imports = preanalysis.imports;
    graphs.genAST = preanalysis.ast;
    graphs.identifiers = preanalysis.identifiers;
    return graphs;
}

function tiersplit(source, analysis) {
    try {
        var extract = RedStone.generate(source);
        var toGenerate = extract.context.toGenerate;
        var storeDeclNode = extract.storeDeclNode;
        var graphs = generateGraphs(extract.inputJS, analysis, toGenerate),
            PDG = graphs.PDG;

        extract.context.stip.generatedAST = graphs.genAST;
        extract.context.stip.generatedIdentifiers = graphs.identifiers;
        // Find declaration nodes for the reactive variables
        for (var varname in graphs.identifiers) {
            if (graphs.identifiers.hasOwnProperty(varname)) {
                if (storeDeclNode !== undefined) {
                    var declNode = Pdg.declarationOf(graphs.identifiers[varname], graphs.genAST);
                    storeDeclNode(varname, declNode);
                }
            }
        }


        var slicedc = PDG.sliceTier(DNODES.CLIENT),
            sliceds = PDG.sliceTier(DNODES.SERVER),
            splitCode = function (nodes, option) {
                var target = extract.hasUI ? "redstone" : "node.js",
                    asyncomm = "callbacks",
                    program = CodeGenerator.transpile(nodes, {
                        target: target,
                        tier: option,
                        asynccomm: asyncomm,
                        imports: graphs.imports,
                        analysis: analysis,
                    }, graphs.AST);
                return program;
            },
            nodes = CodeGenerator.prepareNodes(slicedc, sliceds, graphs, {analysis: analysis});
        clientprogram = splitCode(nodes[0], "client");
        serverprogram = splitCode(nodes[1], "server");
        return [clientprogram, serverprogram, extract.html, graphs.warnings, graphs];
    } catch (e) {
        return [false, false, false, [e], graphs];
    }
}

function cpsTransform(source, analysis) {
    var graphs = generateGraphs(source, analysis),
        nodes = graphs.PDG.getAllNodes();

    nodes = CodeGenerator.prepareNodes([], nodes, graphs, {analysis: analysis});
    program = CodeGenerator.transpile(nodes[1], {target: 'normal', cps: true, analysis: analysis}, graphs.AST);
    return program;
}


function generateJavaScript(source, analysis) {
    var graphs = generateGraphs(source, analysis),
        nodes = graphs.PDG.getAllNodes();
    nodes = CodeGenerator.prepareNodes([], nodes, graphs, {analysis: analysis});
    program = CodeGenerator.transpile(nodes[1], {target: 'normal', cps: false, analysis: analysis}, graphs.AST);
    return program;
}

function slice(source, sliceStm, analysis) {
    function getNodeForSrc(statementsrc, nodes) {
        var node;
        nodes.forEach(function (n) {
            if (n.parsenode && !n.isActualPNode && !n.isFormalNode) {
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

    var graphs = generateGraphs(source, analysis),
        nodes = graphs.PDG.getAllNodes(),
        node;

    nodes = CodeGenerator.prepareNodes([], nodes, graphs, {analysis: analysis})[1];
    node = getNodeForSrc(sliceStm, nodes);
    nodes = graphs.PDG.slice(node);
    nodes.sort(function (n1, n2) {
        return n1.cnt - n2.cnt;
    });
    program = CodeGenerator.transpile(nodes, {target: 'normal', cps: false, analysis: analysis}, graphs.AST);

    return program;
}

var Stip = {
    generateGraphs: generateGraphs,
    tierSplit: tiersplit,
    cpsTransform: cpsTransform,
    generateJavaScript: generateJavaScript,
    slice: slice
}

module.exports = Stip;
global.Stip = Stip;

