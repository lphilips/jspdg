var Stip = require('./run.js');
var graphs;
var shared;
var warnings;

function analyse(src) {
    try {
        graphs = Stip.generateGraphs(src, true);
        global.cy = createComponentGraph(graphs.PDG);
        createOfflineReport(graphs);
        return graphs;
    } catch (err) {
        if (err.message == "warnings") {
            var str = "Following problems were encountered: \n";
            warnings.forEach(function (exc) {
                str = str.concat(" - " + exc.name + ": " + exc.message + "\n");
            });
            slicededitor.setValue(str);

        }
        console.log(err.message);
    }
}

function printCode(sources, editor) {
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
        concatCode(escodegen.generate(clientprogram.program));
    }
    else if ($("#includeclient").prop('checked')) {
        concatCode("/* CLIENT */");
        if (shared) concatCode(escodegen.generate(shared));
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

function split(src, editor) {
    try {
        var clientprogram;
        var serverprogram;
        var split;
        editor.setValue("");
        split = Stip.tierSplit(src, true);
        clientprogram = split[0];
        serverprogram = split[1];
        printCode([clientprogram, serverprogram], editor);
        global.cy = createComponentGraph(split[4].PDG);
        createOfflineReport(split[4]);
    } catch (err) {
        console.log(err.stack);
    }
}


function cpstransform(src, editor) {
    try {
        var program;
        editor.setValue("");
        program = Stip.cpsTransform(src);
        editor.setValue(escodegen.generate(program.program));
    } catch (err) {
        console.log(err.stack);
    }
}


function createOfflineReport(graphs) {
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
    clientfs.map(function (r) {
        console.log(r)
    });
    console.log("SERVER FUNCTIONALITIES");
    serverfs.map(function (r) {
        console.log(r)
    });
    clientperc = clientfs.length / (clientfs.length + serverfs.length);
    serverperc = serverfs.length / (clientfs.length + serverfs.length);

    $("#clientbar").width(clientperc * 100 + '%');
    $("#serverbar").width(serverperc * 100 + '%');
    $("#functionalities").empty();
    graphs.PDG.getFunctionalityNodes().map(function (functionality) {
        createFunctionality(functionality);
    })


    function createFunctionality(funcNode) {
        var dataCntC = funcNode.countEdgeTypeFilter(EDGES.REMOTED, function (f) {
            return f.tier == DNODES.CLIENT
        }, -1);
        var dataCntS = funcNode.countEdgeTypeFilter(EDGES.REMOTED, function (f) {
            return f.tier == DNODES.SERVER
        }, -1);
        var callCntC = funcNode.countEdgeTypeFilter(EDGES.REMOTEC, function (f) {
            return f.tier == DNODES.CLIENT
        });
        var callCntS = funcNode.countEdgeTypeFilter(EDGES.REMOTEC, function (f) {
            return f.tier == DNODES.SERVER
        });
        var item = $("<a class='row' style='text-align:center;margin:0;'></a>").addClass("list-group-item");
        var label = (funcNode.tier == DNODES.CLIENT) ? " <span class='label label-info'>client</span>" : " <span class='label label-warning'>server</span>";
        item.append("<h4 class='list-group-item-heading'>" + funcNode.ftype + label + " </h4");
        var divGraphD = $("<div class='col-sm-4' style='height: 130px; width: 140px;' ></div");
        var divGraphC = $("<div class='col-sm-4' style='height: 130px; width: 140px;' ></div");
        var divText = $("<div class='col-sm-5'></div>");
        var divData = $("<div  'style='text-align:left; padding: 5px;'><h6>DATA DEPENDENCIES</h6></div>");
        var divCall = $("<div  'style='text-align:left; padding: 5px;'><h6>CALL DEPENDENCIES</h6></div>");
        divData.append('<p> > Client: ' + dataCntC + ', > Server: ' + dataCntS + '</p>');
        divCall.append('<p> > Client: ' + callCntC + ', > Server: ' + callCntS + '</p>');

        divText.append(divData).append(divCall);
        if (funcNode.tier == DNODES.CLIENT)
            createGauge((dataCntC / (dataCntS + dataCntC)) * 100, 'Data', divGraphD);
        else
            createGauge(0, 'Data', divGraphD);

        if (funcNode.tier == DNODES.CLIENT)
            createGauge((callCntC / (callCntS + callCntC)) * 100, 'Call', divGraphC);
        else {
            createGauge(0, 'Call', divGraphC);
        }

        item.append(divText).append(divGraphD).append(divGraphC);
        $("#functionalities").append(item);
        $(window).trigger('resize');
        window.dispatchEvent(new Event('resize'));
    }

    function createGauge(percentage, title, div) {
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

global.split = split;
global.analyse = analyse;
global.createOfflineReport = createOfflineReport;
global.cpstransform = cpstransform;
global.printCode = printCode;