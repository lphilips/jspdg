var asyncs;
var graphs;
var shared;
var cy;
var clientprogram;
var serverprogram;
function doIt (src) {
    var ast, preanalysis;
        try {

            ast = Ast.createAst(src, {loc:true, owningComments: true, comment: true});
            ast = Hoist.hoist(ast, function (node) {
                    return Aux.isBlockStm(node) && 
                        (Comments.isClientorServerAnnotated(node) || Comments.isSliceAnnotated(node) || 
                            (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
                });

            Handler.init();
            preanalysis = pre_analyse(ast, {callbacks: [], identifiers: []});
            asyncs = preanalysis.asyncs;
            shared = preanalysis.shared;

            graphs = new Stip.Graphs(preanalysis.ast, src, preanalysis.primitives);
            Stip.start(graphs);
            graphs.PDG.distribute(DefaultPlacementStrategy);
            cy = createComponentGraph(graphs.PDG);
            createOfflineReport(graphs);
            graphs.assumes = preanalysis.assumes;
            return graphs; 
        } catch (err) {
            console.log(err.message);
        }
      }

      function printCode (sources, editor) {
            var concatCode = function (code) {
                editor.setValue(slicededitor.getValue() +
                    code + "\n")
            };
            var clientprogram = sources[0];
            var serverprogram = sources[1];
            editor.setValue('');
            if ($("#includeclient").prop('checked') && $("#includesetup").prop('checked')) {
                concatCode("/* CLIENT */"); 
                if (shared) concatCode(escodegen.generate(shared)); 
                concatCode(escodegen.generate(clientprogram.program)) ;
            }
            else if ($("#includeclient").prop('checked')) {
                concatCode("/* CLIENT */");
                if (shared) concatCode(escodegen.generate(shared)) ;
                concatCode(escodegen.generate(clientprogram.nosetup));
            }
            else if ($("#includesetup").prop('checked')) {
                concatCode("/* CLIENT */");
                if (shared) concatCode(escodegen.generate(shared)); 
                concatCode(escodegen.generate(clientprogram.setup));
            }
            if ($("#includeserver").prop('checked') && $("#includesetup").prop('checked')) {
                concatCode("/* SERVER */");
                if (shared) concatCode(escodegen.generate(shared)); 
                concatCode(escodegen.generate(serverprogram.program));
            }
            else if ($("#includeserver").prop('checked')) {
                concatCode("/* SERVER */");
                if (shared) concatCode(escodegen.generate(shared)); 
                concatCode(escodegen.generate(serverprogram.nosetup));
            }
            else if ($("#includesetup").prop('checked')) {
                concatCode("/* SERVER */");
                if (shared) concatCode(escodegen.generate(shared)); 
                concatCode(escodegen.generate(serverprogram.setup));
            }
      }

      function split (src, editor) { 
        try {
            var graphs  = doIt(src),
                assumes = graphs.assumes,
                PDG     = graphs.PDG;
            PDGg = graphs;
            editor.setValue("");
 
            var slicedc      = PDG.sliceTier(DNODES.CLIENT),
                sliceds      = PDG.sliceTier(DNODES.SERVER),
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
                    var target   = "node.js",
                        asyncomm = "callbacks",
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
                };
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
                        removes = removes.concat(pdgnode)
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
            printCode([clientprogram, serverprogram], editor);
        } catch (err) {
            console.log(err.stack);
        }
      }


      function cpstransform (src, editor) {
        try {
            editor.setValue("");
            var graphs  = doIt(src),
                assumes = graphs.assumes,
                PDG     = graphs.PDG,
                nodes   = PDG.getAllNodes(),
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
            editor.setValue(escodegen.generate(program.program));
        } catch (err) {
            console.log(err.stack);
        }
      }


  function createOfflineReport (graphs) {
    var PDG = graphs.PDG;
    var clientfs = [];
    var serverfs = [];
    var clientperc = 0;
    var serverperc = 0;
    PDG.getFunctionalityNodes().map(function (f) {
        if (f.tier === DNODES.SERVER) 
            serverfs.push(f.ftype)
        if (f.tier === DNODES.CLIENT)
            clientfs.push(f.ftype)
    });
    console.log("CLIENT FUNCTIONALITIES");
    clientfs.map(function (r) {console.log(r)});
    console.log("SERVER FUNCTIONALITIES");
    serverfs.map(function (r) {console.log(r)});
    clientperc = clientfs.length / (clientfs.length + serverfs.length);
    serverperc = serverfs.length / (clientfs.length + serverfs.length);

    $("#clientbar").width(clientperc*100+'%');
    $("#serverbar").width(serverperc*100+'%');
    $("#functionalities").empty();
    graphs.PDG.getFunctionalityNodes().map(function (functionality) {
        createFunctionality(functionality);
    })

    
    function createFunctionality(funcNode) {
        var dataCntC = funcNode.countEdgeTypeFilter(EDGES.REMOTED, function (f) {return f.tier == DNODES.CLIENT}, -1);
        var dataCntS = funcNode.countEdgeTypeFilter(EDGES.REMOTED, function (f) {return f.tier == DNODES.SERVER}, -1);
        var callCntC = funcNode.countEdgeTypeFilter(EDGES.REMOTEC, function (f) {return f.tier == DNODES.CLIENT});
        var callCntS = funcNode.countEdgeTypeFilter(EDGES.REMOTEC, function (f) {return f.tier == DNODES.SERVER});
        var item = $("<a class='row' style='text-align:center;margin:0;'></a>").addClass("list-group-item");
        var label = (funcNode.tier == DNODES.CLIENT) ? " <span class='label label-info'>client</span>" : " <span class='label label-warning'>server</span>";
        item.append("<h4 class='list-group-item-heading'>"+ funcNode.ftype + label +" </h4");
        var divGraphD = $("<div class='col-sm-4' style='height: 130px; width: 140px;' ></div");
        var divGraphC = $("<div class='col-sm-4' style='height: 130px; width: 140px;' ></div");
        var divText = $("<div class='col-sm-5'></div>");
        var divData = $("<div  'style='text-align:left; padding: 5px;'><h6>DATA DEPENDENCIES</h6></div>");
        var divCall = $("<div  'style='text-align:left; padding: 5px;'><h6>CALL DEPENDENCIES</h6></div>");
        divData.append('<p> > Client: '+ dataCntC + ', > Server: '+ dataCntS +'</p>' );
        divCall.append('<p> > Client: '+ callCntC + ', > Server: '+ callCntS +'</p>');

        divText.append(divData).append(divCall);
        if (funcNode.tier == DNODES.CLIENT)
            createGauge((dataCntC / (dataCntS + dataCntC))*100,'Data', divGraphD);
        else
            createGauge(0, 'Data', divGraphD);

        if (funcNode.tier == DNODES.CLIENT)
            createGauge((callCntC / (callCntS + callCntC))*100,'Call', divGraphC);
        else {
            createGauge(0, 'Call', divGraphC);
        }

        item.append(divText).append(divGraphD).append(divGraphC);
        $("#functionalities").append(item);
        $(window).trigger('resize');
        window.dispatchEvent(new Event('resize'));
    }

    function createGauge (percentage, title, div) {
           var gaugeOptions = {

            chart: {
                type: 'solidgauge'
            },

            title: null,

            pane: {
                center: ['50%', '55%'],
                size: '80%',
                startAngle: -90,
                endAngle: 90,
                background: {
                    backgroundColor: '#EEE',
                    innerRadius: '60%',
                    outerRadius: '100%',
                    shape: 'arc'
                }
            },

            tooltip: {
                enabled: false
            },

            // the value axis
            yAxis: {
                stops: [
                    [0.1, '#DF5353'], // red
                    [0.3, '#DDDF0D'], // yellow
                    [0.6, '#55BF3B'] // green
                ],
                lineWidth: 0,
                minorTickInterval: null,
                tickPixelInterval: 400,
                tickWidth: 0,
                title: {
                    y: -35
                },
                labels: {
                    y: 15
                }
            },

            plotOptions: {
                solidgauge: {
                    dataLabels: {
                        y: -25,
                        borderWidth: 0,
                        useHTML: true
                    }
                }
            }
        };

        // The speed gauge
        div.highcharts(Highcharts.merge(gaugeOptions, {
            yAxis: {
                min: 0,
                max: 100,
                title: {
                    text: title
                }
            },

            credits: {
                enabled: false
            },

            series: [{
                name: title,
                data: [Math.round(percentage)],
                dataLabels: {
                    format: '<div style="text-align:center"><span style="font-size:18px;color:' +
                        ((Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black') + '">{y}</span><br/></div>'
                },
               
            }]

        }));

    }
}