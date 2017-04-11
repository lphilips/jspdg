var Stip = require('./run.js');
var graphs;
var shared;
var warnings;
var splitResult;


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
        editor.setValue(slicededitor.getValue() + code + "\n")
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
        editor.setValue("");
        splitResult = Stip.tierSplit(src, true);
        clientprogram = splitResult.clientprogram;
        serverprogram = splitResult.serverprogram;
        printCode([clientprogram, serverprogram], editor);
        global.cy = createComponentGraph(splitResult.graphs.PDG);
        createOfflineReport();
    } catch (err) {
        console.log(err.stack);
    }
}


function cpstransform(src, editor) {
    try {
        var program;
        editor.setValue("");
        program = Stip.cpsTransform(src, true);
        editor.setValue(escodegen.generate(program.program));
    } catch (err) {
        console.log(err.stack);
    }
}


function createOfflineReport() {
    if (splitResult) {
        var PDG = splitResult.graphs.PDG;

        /* Placement strategy report */
        var clientfs = [];
        var serverfs = [];
        PDG.getFunctionalityNodes().map(function (f) {
            if (f.tier === DNODES.SERVER)
                serverfs.push(f.ftype);
            if (f.tier === DNODES.CLIENT)
                clientfs.push(f.ftype);
            if (f.tier === DNODES.SHARED) {
                clientfs.push(f.ftype);
                serverfs.push(f.ftype);
            }

        });

        var clientperc = (clientfs.length / (clientfs.length + serverfs.length)) * 100;
        var serverperc = (serverfs.length / (clientfs.length + serverfs.length)) * 100;
        var offlineperc = Math.floor(splitResult.placementinfo.fitness * 100)
        var divGraphD = $("#offlinelevel");
        createGauge(offlineperc, "Offline score", divGraphD);


        $("#clientbar").width(clientperc + '%');
        $("#serverbar").width(serverperc + '%');

        var divGraphC = $("<div class='col-sm-6'><h5>Client slices</h5></div");
        var divGraphS = $("<div class='col-sm-6'' ><h5>Server slices</h5></div");
        var ulClientS = $("<ul class='list-group'></ul>");
        var ulServerS = $("<ul class='list-group'></ul>");

        clientfs.forEach(function (s) {
            ulClientS.append($("<li class='list-group-item'>" + s + "</li>"));
        })
        serverfs.forEach(function (s) {
            ulServerS.append($("<li class='list-group-item'>" + s + "</li>"));
        })
        $("#functionalities").empty();
        divGraphC.append(ulClientS);
        divGraphS.append(ulServerS);


        $("#functionalities").append(divGraphC);
        $("#functionalities").append(divGraphS);


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
