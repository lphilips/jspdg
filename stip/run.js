global.warnings;
var Stip = (function () {

    var interface = {};


    function generateGraphs(source) {
        var ast, preanalysis, warnings;

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

        graphs = new Analysis.Graphs(preanalysis.ast, source, preanalysis.primitives);
        Analysis.start(graphs);
        graphs.PDG.distribute(DefaultPlacementStrategy);
        graphs.warnings = CheckAnnotations.checkAnnotations(graphs.PDG);
        graphs.assumes = preanalysis.assumes;
        return graphs;
    }


    function tiersplit(source) {

        var graphs = generateGraphs(source),
            PDG = graphs.PDG;

        var slicedc = PDG.sliceTier(DNODES.CLIENT),
            sliceds = PDG.sliceTier(DNODES.SERVER),
            splitCode = function (nodes, option) {
                var target = "node.js",
                    asyncomm = "callbacks",
                    program = CodeGenerator.transpile(nodes, {
                        target: target,
                        tier: option,
                        asynccomm: asyncomm
                    }, graphs.AST);
                return program;
            },
            nodes = CodeGenerator.prepareNodes(slicedc, sliceds, graphs);
        clientprogram = splitCode(nodes[0], "client");
        serverprogram = splitCode(nodes[1], "server");
        return [clientprogram, serverprogram, graphs.warnings];
    }

    function cpsTransform(source) {
        var graphs = generateGraphs(source),
            nodes = graphs.PDG.getAllNodes();

        nodes = CodeGenerator.prepareNodes([], nodes, graphs);
        program = CodeGenerator.transpile(nodes[1], {target: 'normal', cps: true}, graphs.AST);
        return program;
    }


    function generateJavaScript(source) {
        var graphs = generateGraphs(source),
            nodes = graphs.PDG.getAllNodes();
        nodes = CodeGenerator.prepareNodes([], nodes, graphs);
        program = CodeGenerator.transpile(nodes[1], {target: 'normal', cps: false}, graphs.AST);
        return program;
    }

    function slice(source, sliceStm) {
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

        var graphs = generateGraphs(source),
            nodes = graphs.PDG.getAllNodes(),
            node;

        nodes = CodeGenerator.prepareNodes([], nodes, graphs)[1];
        node = getNodeForSrc(sliceStm, nodes);
        nodes = graphs.PDG.slice(node);
        nodes.sort(function (n1, n2) {
            return n1.cnt - n2.cnt;
        });
        program = CodeGenerator.transpile(nodes, {target: 'normal', cps: false}, graphs.AST);

        return program;
    }


    interface.generateGraph = generateGraphs;
    interface.tierSplit = tiersplit;
    interface.cpsTransform = cpsTransform;
    interface.generateJavaScript = generateJavaScript;
    interface.slice = slice;
    
    if (typeof module !== 'undefined' && module.exports != null) {
        CPSTransform = require('./transpiler/CPS_transform.js').CPSTransform;
        Analysis = require('./stip.js').Analysis;
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