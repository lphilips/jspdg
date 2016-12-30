var Stip = (function () {

    var interface = {};


    function generateGraphs(source, analysis) {
        var warnings = [],
            ast, preanalysis;
        ast = Ast.createAst(source, {loc: true, owningComments: true, comment: true});
        ast = Hoist.hoist(ast, function (node) {
            return Aux.isBlockStm(node) &&
                (Comments.isClientorServerAnnotated(node) || Comments.isSliceAnnotated(node) ||
                (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
        });

        Handler.init();
        preanalysis = pre_analyse(ast, {callbacks: [], identifiers: []});
        asyncs = preanalysis.asyncs;
        shared = preanalysis.shared;

        graphs = new FlowGraph.Graphs(preanalysis.ast, source, preanalysis.primitives);
        FlowGraph.start(graphs, analysis);
        graphs.PDG.distribute(DefaultPlacementStrategy);
        graphs.warnings = warnings.concat(CheckAnnotations.checkAnnotations(graphs.PDG, {analysis: analysis}));
        graphs.assumes = preanalysis.assumes;
        return graphs;
    }


    function tiersplit(source, analysis) {
        try {
            var graphs = generateGraphs(source, analysis),
                PDG = graphs.PDG;

            var slicedc = PDG.sliceTier(DNODES.CLIENT),
                sliceds = PDG.sliceTier(DNODES.SERVER),
                splitCode = function (nodes, option) {
                    var target = "node.js",
                        asyncomm = "callbacks",
                        program = CodeGenerator.transpile(nodes, {
                            target: target,
                            tier: option,
                            asynccomm: asyncomm,
                            analysis: analysis,
                        }, graphs.AST);
                    return program;
                },
                nodes = CodeGenerator.prepareNodes(slicedc, sliceds, graphs, {analysis: analysis});
            clientprogram = splitCode(nodes[0], "client");
            serverprogram = splitCode(nodes[1], "server");
            return [clientprogram, serverprogram, graphs.warnings];
        } catch (e) {
            return [false, false, [e]];
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


    interface.generateGraphs = generateGraphs;
    interface.tierSplit = tiersplit;
    interface.cpsTransform = cpsTransform;
    interface.generateJavaScript = generateJavaScript;
    interface.slice = slice;

    if (typeof module !== 'undefined' && module.exports != null) {
        CPSTransform = require('./transpiler/CPS_transform.js').CPSTransform;
        FlowGraph = require('./stip.js').FlowGraph;
        Handler = require('./handler.js').Handler;
        pre_analyse = require('./pre-analysis.js').pre_analyse;
        CodeGenerator = require('./transpiler/slice.js').CodeGenerator;
        Hoist = require('./hoist.js').Hoist;
        DefaultPlacementStrategy = require('./placement/default_strategy.js');
        CheckAnnotations = require('./check-annotations.js').CheckAnnotations;
        exports.Stip = interface;
    }

    return interface;


})()