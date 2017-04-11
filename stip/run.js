var FlowGraph = require('./analysis/stip.js');
Handler = require('./error_handling/handler.js');
pre_analyse = require('./analysis/pre-analysis.js').pre_analyse;
CodeGenerator = require('./transpiler/slice.js');
Hoist = require('./analysis/hoist.js');
DefaultPlacementStrategy = require('./placement/default_strategy.js');
Comments = require('./annotations/annotations.js');
CheckAnnotations = require('./annotations/check-annotations.js');
RedStone = require('./redstone/redstone.js');
Ast = require('../jipda-pdg/ast.js').Ast;
Aux = require('./aux/aux.js');
DNODES = require('./PDG/node.js').DNODES;
Pdg = require('../jipda-pdg/pdg/pdg.js').Pdg;
escodegen = require('escodegen');
esprima = require('esprima');
estraverse = require('estraverse');
Analysis = require('./analysis/analysis.js');
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
    })

    Handler.init();
    preanalysis = pre_analyse(ast, (toGenerate ? toGenerate : {methodCalls: [], identifiers: []}));
    asyncs = preanalysis.asyncs;
    shared = preanalysis.shared;
    graphs = new FlowGraph.Graphs(preanalysis.ast, source, preanalysis.primitives);
    FlowGraph.start(graphs, analysis);
    graphs.placementinfo = graphs.PDG.distribute(DefaultPlacementStrategy);
    graphs.warnings = warnings.concat(CheckAnnotations.checkAnnotations(graphs.PDG, {analysis: analysis}));
    graphs.assumes = preanalysis.assumes;
    graphs.imports = preanalysis.imports;
    graphs.genAST = preanalysis.ast;
    graphs.identifiers = preanalysis.identifiers;
    return graphs;
}

function evalPlacement(source, analysis, nr) {
    var extract = RedStone.generate(source);
    var toGenerate = extract.context.toGenerate;
    var storeDeclNode = extract.storeDeclNode;
    var runs = 0;
    var warnings = [];
    var placements, originalAst, ast, preanalysis;
    ast = Ast.createAst(extract.inputJS, {loc: true, owningComments: true, comment: true});

    var body = [];
    var idx = 0;
    function createSlice(stm) {
        idx++;
        var node = {
            type: "BlockStatement",
            body : [stm],
            leadingComment: {
                value: "@slice s"+idx,
                type: "Block"
            }
        };
        Ast.augmentAst(node);
        return node;
    }

    function adapt(ast, datadecl, fundecl) {
        function search(coll, node) {
            var found = false;
            var i = 0;
            while (!found && i < coll.length) {
               if (Aux.isVarDecl(node) && Aux.isVarDecl(coll[i]))
                    found = (node.declarations[0].id.name === coll[i].declarations[0].id.name);
               if (Aux.isFunDecl(node) && Aux.isFunDecl(coll[i]))
                   found = (node.id.name === coll[i].id.name);
                i++;
            }
            return found;
        }
        Aux.walkAst(ast, {
            post: function (node) {
                var parent = Aux.parent(node, ast);
                if (parent.leadingComment && Comments.isSliceAnnotated(parent)) {
                    if (search(datadecl , node))  {
                        node.leadingComment = {
                            value: "@replicated",
                            type: "Block"
                        }
                    }
                    else if (search(fundecl, node)) {
                        ast.body.push(createSlice(node));
                        parent.body = parent.body.remove(node);
                    }
                }
            }
        });
        originalAst = Aux.clone(ast);
        return ast;
    }

    function generatePDG () {
        ast = Hoist.hoist(ast, function (node) {
            return Aux.isBlockStm(node) &&
                (Comments.isClientorServerAnnotated(node) || Comments.isSliceAnnotated(node) ||
                (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
        });
        Handler.init();
        preanalysis = pre_analyse(ast, (toGenerate ? toGenerate : {methodCalls: [], identifiers: []}));
        graphs = new FlowGraph.Graphs(preanalysis.ast, extract.inputJS, preanalysis.primitives);
        FlowGraph.start(graphs, analysis);
        graphs.placementinfo = graphs.PDG.distribute(DefaultPlacementStrategy);
        graphs.warnings = warnings.concat(CheckAnnotations.checkAnnotations(graphs.PDG, {analysis: analysis}));
        graphs.assumes = preanalysis.assumes;
        graphs.imports = preanalysis.imports;
        graphs.genAST = preanalysis.ast;
        graphs.identifiers = preanalysis.identifiers;
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
        var slicedc = graphs.PDG.sliceTier(DNODES.CLIENT),
            sliceds = graphs.PDG.sliceTier(DNODES.SERVER),
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
            };
         var nodes = CodeGenerator.prepareNodes(slicedc, sliceds, graphs, {analysis: analysis});
        clientprogram = splitCode(nodes[0], "client");
        serverprogram = splitCode(nodes[1], "server");
    }

    originalAst = Aux.clone(ast);

    while (runs < nr) {
        generatePDG();
        var unplaced = graphs.PDG.getFunctionalityNodes().filter(function (slice) {
            var placement = graphs.PDG.placements[slice.ftype];
            return !slice.tier && !placement
        });
        var nrSlices = graphs.PDG.getFunctionalityNodes().length;
        runs++;
        unplaced.forEach(function (slice) {
            slice.tier = false;
        })
        var placementinfo = graphs.PDG.distribute(DefaultPlacementStrategy);
        var serverplaced = 0;
        var clientplaced = 0;
        var bothplaced = 0;

        var dataAdvice = 0;
        var functionAdvice = 0;
        var datadecls = [];
        var fundecls = [];

        function addToCollection (coll, pdgnodes) {
            pdgnodes.forEach(function (pdgnode) {
                if (coll.indexOf(pdgnode) < 0)
                    coll.push(pdgnode);
            })
        }

        graphs.PDG.getFunctionalityNodes().forEach(function (slice) {
            var advice = Advice.advice(slice, graphs.PDG);

            addToCollection(datadecls, advice.constructorsInRemote);
            addToCollection(datadecls, advice.dataInRemote);
            addToCollection(fundecls, advice.calls);
            addToCollection(fundecls, advice.entriesOnlyClient);
            addToCollection(fundecls, advice.entriesOnlyServer);


            if (slice.tier == DNODES.SHARED)
                bothplaced++;
            if (slice.tier == DNODES.CLIENT)
                clientplaced++;
            if (slice.tier == DNODES.SERVER)
                serverplaced++;
        });
        var output = runs + ", " + nrSlices + ", " + (placementinfo.generation+1) + ", " + placementinfo.fitness;
        output+= ", " +bothplaced + ", "+ clientplaced + ", " + serverplaced;
        output+= ", " + datadecls.length+ ", " + fundecls.length;
        console.log(output);
        ast = adapt(originalAst, datadecls.map(function (n) {return n.parsenode}), fundecls.map(function (n) {return n.parsenode}));
    }
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
        return {
            clientprogram: clientprogram,
            serverprogram: serverprogram,
            html: extract.html,
            placementinfo: graphs.placementinfo,
            errors: graphs.warnings,
            graphs: graphs
        };
    } catch (e) {
        return {
            clientprogram: false,
            serverprogram: false,
            html: false,
            placementinfo: false,
            errors: [e],
            graphs: false
        };
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
    slice: slice,
    evalPlacement: evalPlacement
}

module.exports = Stip;
global.Stip = Stip;

