"use strict"

//copied

function createPDGGraph (PDG, assumes)
{
    var edges = [];
    var nodes = [];
    var graphnodes = [];
    var removes = [];
    var removed = [];
    var assumesnames = assumes.map(function (ass) {
        if (ass.id)
            return ass.id.name.trim();
        else
            return ass.declarations[0].id.name.trim()});
    var remove = function (node) {
        nodes = nodes.remove(node);
        removed.push(node);
        if (node.isEntryNode) {
            var params = node.getFormalIn().concat(node.getFormalOut()),
                body   = node.getBody();
            params.map(function (param) {nodes = nodes.remove(param); removed.push(param);});
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
            node.getOutNodes(EDGES.DATA).filter(function (n) {return n.isFormalNode})
                .map(function (n) {remove(n)});
        }
    };
    nodes = PDG.nodes.filter(function (pdgnode) {
        if (pdgnode.parsenode)
            if (Aux.isFunDecl(pdgnode.parsenode) &&
                assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                removes.push(pdgnode);
                return false;
            }
            else if (Aux.isVarDeclarator(pdgnode.parsenode) &&
                assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                removes.push(pdgnode);
                return false;
            }
            else if (Aux.isObjExp(pdgnode.parsenode)) {
                var decl = pdgnode.getInNodes(EDGES.DATA)
                    .filter(function (n) {return n.name && assumesnames.indexOf(n.name) > -1});
                if (decl.length > 0) {
                    removes.push(decl[0]);
                }
            }
            else
                return true;
        else
            return true;
    });

    removes.map(function(node) {
        remove(node);
    });

    nodes.map(function (node) {
        var to_nodes = [],
            add = function (n) {
                var sourceIndex = Arrays.indexOf(n, graphnodes);
                if (sourceIndex < 0) {
                    if (!(removed.indexOf(n) > -1))
                        graphnodes.push(n)
                }
            },
            addEdges = function (n) {
                var to_edges = n.getOutEdges().filter(function (e) {
                    return Arrays.indexOf(e, edges) < 0 //&& e.equalsType(EDGES.CONTROL);
                });
                edges = edges.concat(to_edges);
                to_nodes = to_nodes.concat(to_edges.map(function (e) {return e.to}));
            };

        if (!(removed.indexOf(node) > -1)) {
            add(node);
            if (node.getOutEdges().length)
                addEdges(node)
            while (to_nodes.length) {
                var n = to_nodes.shift();
                add(n);
                addEdges(n)
            }
        }
    });

    var states = graphnodes.map( function (node, id) {
            var label    = node.id,
                parsed   = node.parsenode,
                dtype    = node.getdtype && node.getdtype() ? node.getdtype().name : false,
                tooltip  = parsed ? parsed.toString() :  "",
                cssclass = label.slice(0,1) + " " + dtype;
            if(node.isActualPNode)
                node.value ? label += " " + node.value.slice(0,10) : label;
            if(node.isFormalNode)
                label += " " + node.name.slice(0,10);
            if(dtype === "server")
                label += "[S]"
            if(dtype === "client")
                label += "[C]"
            if(dtype === "shared")
                label += "[Sh]"
            if(node.parsenode)
                label += " " + ((parsed && parsed.toString().length > 10) ? parsed.toString().slice(0,10)+"..." : parsed) ;
            if (node.isStatementNode &&
                (Aux.isThrowStm(node.parsenode) ||
                Aux.isTryStm(node.parsenode) ||
                Aux.isCatchStm(node.parsenode))) {
                cssclass += " error"
            }
            node.cssclass = cssclass;
            return {
                id: id,
                label: label,
                description: node.parsenode ? node.parsenode.toString() : ""}
        }
    );

    var edgeId = 0;
    var transitions = edges.map(function (edge) {
        var g = edge.type.name;
        var label = "";
        label += g;
        if (edge.label === false) label += " (false)";
        return {
            id: edgeId++,
            source: Arrays.indexOf(edge.from, graphnodes),
            target: Arrays.indexOf(edge.to, graphnodes),
            label: label,
            orig: edge
        }
    });


    var ids = [];
    var edgeId = 0;


    var pdgGraph = function(n, e){

        var cy;
        var eles = {
            nodes: n,
            edges: e
        };

        $(function(){ // on dom ready

            cy = cytoscape({
                container: $('#cy')[0],

                style: cytoscape.stylesheet()
                    .selector('node.pdg')
                    .css({
                        'content': 'data(id)',
                        'text-opacity': 0.5,
                        'text-valign': 'center',
                        'text-halign': 'right',
                        'background-color': function(ele) { return ele.data('bg'); }//'#11479e' should be memoized
                    })
                    .selector('node.hidden')
                    .css({
                        width:8,
                        height:8
                    })
                    .selector('node.collapsed')
                    .css({
                        opacity: 0
                    })
                    .selector('$node > node')
                    .css({
                        'padding-top': '10px',
                        'padding-left': '10px',
                        'padding-bottom': '10px',
                        'padding-right': '10px',
                        'text-valign': 'top',
                        'text-halign': 'center',
                        'background-color': '#bbb'
                    })
                    .selector('edge.pdg')
                    .css({
                        'target-arrow-shape': 'triangle',
                        'line-color': function(ele) { return ele.data('c'); },
                        'target-arrow-color': function(ele) { return ele.data('c'); },
                        'label': function(ele) { return ele.data('l'); },
                        'font-size': 12,
                        'z-index' : 3
                        /*'curve-style': 'segments',
                         'segment-distances': '40 40',
                         'segment-weights': '0.25 0.75'*/
                    })
                    .selector('edge.segementedEdge')
                    .css({
                        'curve-style': 'segments',
                        'segment-distances': '20 40 20'
                    })
                    .selector('edge.dividedEdge')
                    .css({
                        'line-color': function(ele) { return ele.data('c'); },
                        'label': function(ele) { return ele.data('l'); },
                        'font-size': 12
                    })
                    .selector('edge.selectedEdge')
                    .css({
                        'background-color': 'black',
                        'line-color': 'black',
                        'target-arrow-color': 'black',
                        'source-arrow-color': 'black',
                        'text-outline-color': 'black',
                        'z-index' : 4
                    })
                    .selector('edge.collapsed')
                    .css({
                        opacity: 0
                    })
                    .selector(':selected')
                    .css({
                        'background-color': 'black',
                        'line-color': 'black',
                        'target-arrow-color': 'black',
                        'source-arrow-color': 'black',
                        'text-outline-color': 'black'
                    }),
                layout: {
                    name: 'dagre'
                },
                elements: eles,

            });

            cy.on('click', function(e){
                var ele = e.cyTarget;
                function hasHiddenNode(ele) {
                    var filtered = ele.connectedNodes().filter(function(i, ele) {
                        return ele.hasClass('hidden');
                    });
                    return filtered.size() > 0;
                }
                function highlight(ele) {
                    var id = ele.id();
                    var slicedId = id.slice(0,id.length-1);
                    for(var i = 1; i<4; i++) {
                        var cyElm = cy.getElementById(slicedId + i);
                        cyElm.flashClass('selectedEdge', 2500);
                        cyElm.select();
                    }
                }
                if(ele.isNode()) {
                    if(ele.isExpandable()) {
                        ele.expand({fisheye: false, animate:false, cueEnabled:false});
                    } else {
                        ele.collapse({fisheye: false, animate:false, cueEnabled:false});
                    }
                } else if(ele.isEdge()) {
                    ele.connectedNodes().each(function(i, node) {
                        if(node.hasClass('hidden')) {
                            highlight(ele);
                        }
                    });
                    ele.flashClass('selectedEdge', 2500);
                }
            });
        }); // on dom ready

        return cy
    };



    var graph = pdgGraph(states, edges);
    graph.listeners = {};

    function fire(e, args){
        var listeners = pdgGraph.listeners[e];

        for( var i = 0; listeners && i < listeners.length; i++ ){
            var fn = listeners[i];
            fn.apply( fn, args );
        }
    }

    function listen(e, fn){
        var listeners = pdgGraph.listeners[e] = pdgGraph.listeners[e] || [];
        listeners.push(fn);
    }

    graph.initNodes = [
        {data: {id:'serverParent'}},
        {data: {id:'clientParent'}},
        {data: {id:'sharedParent'}}
    ];

    graph.options = {};

    graph.setEdgeOption = function(option) {
        pdgGraph.options.edge = option;
    }

    graph.setLayoutOption = function(option) {
        pdgGraph.options.layout = option;
    }

    graph.rememberPositions = function(positions) {
        pdgGraph.options.positions = positions;
    }

    graph.retrievePositions = function() {
        return pdgGraph.options.positions;
    }

    graph.addNodes = function(nodes) {
        cy.add(nodes);
        cy.layout({name:'dagre'});
        return cy.ready(function (event) { console.log(event); });
    };

    graph.addNodesWithEdges = function(nodes, edges) {
        //remove all
        cy.remove(cy.elements());

        //cy.add(pdgGraph.initNodes);

        var optionEdge = pdgGraph.options.edge.id;
        var optionLayout = pdgGraph.options.layout.id;
        var controlEdges = edges.filter(function(e) { return e.isType(EDGES.CONTROL); });
        var dataEdges = edges.filter(function(e) {
            return e.isType(EDGES.DATA) || e.isType(EDGES.REMOTED);
        });
        var callEdges = edges.filter(function(e) {
            return e.isType(EDGES.CALL) || e.isType(EDGES.REMOTEC);
        });
        var parameterEdges = edges.filter(function(e) {
            return e.isType(EDGES.PARIN) || e.isType(EDGES.PAROUT)
                || e.isType(EDGES.REMOTEPARIN) || e.isType(EDGES.REMOTEPAROUT);
        });

        if(optionLayout == 1) {
            cy.add(nodes).addClass('pdg');
            cy.add(controlEdges).addClass('pdg');

            if(optionEdge >= 2) {
                cy.add(dataEdges).addClass('pdg');
            }
            if(optionEdge >= 3) {
                cy.add(callEdges).addClass('pdg');
            }
            if(optionEdge >= 4) {
                cy.add(parameterEdges).addClass('pdg');
            }

            var layout = cy.elements().makeLayout({name:'dagre'});

            return layout.run();
        }
        if(optionLayout >= 2) {

            var updatedNodes = nodes;

            if(optionLayout == 3) {
                var colData = collapsible.create(nodes);
                var colMap = colData.colMap;
                cy.add(colData.toAdd);
                updatedNodes = nodes.map(function(n) {
                    var colObj = colMap.find(n.content.id);
                    if(colObj) {
                        n.data.parent = colObj.par;
                    }
                    return n;
                });
            }

            cy.add(updatedNodes).addClass('pdg');
            cy.add(controlEdges).addClass('pdg');
            //draw this
            var controlLayout = cy.elements().makeLayout({name:'dagre', minLen: function( edge ){ return 2; }});
            controlLayout.run();

            var updatedDataEdges = [];
            var updatedCallEdges = [];
            var updatedParameterEdges = [];

            var idx = 0;
            if(optionEdge >= 2) {
                dataEdges.forEach(function(e) {
                    var source = cy.getElementById(e.getSource());
                    var target = cy.getElementById(e.getTarget());
                    idx++;
                    var toAdd = e.divideDataEdge(e, idx, source, target);
                    idx++;
                    updatedDataEdges = updatedDataEdges.concat(toAdd);
                });
            }
            if(optionEdge >= 3) {
                callEdges.forEach(function(e) {
                    var source = cy.getElementById(e.getSource());
                    var target = cy.getElementById(e.getTarget());
                    idx ++;
                    var toAdd = e.divideCallEdge(e, idx, source, target);
                    idx ++;
                    updatedCallEdges = updatedCallEdges.concat(toAdd);
                });
            }
            if(optionEdge >= 4) {
                parameterEdges.forEach(function(e) {
                    var source = cy.getElementById(e.getSource());
                    var target = cy.getElementById(e.getTarget());
                    idx ++;
                    var toAdd = e.divideParameterEdge(e, idx, source, target);
                    idx ++;
                    updatedParameterEdges = updatedParameterEdges.concat(toAdd);
                });
            }

            cy.add(updatedCallEdges);
            cy.add(updatedParameterEdges);
            cy.add(updatedDataEdges);

            var restLayout = cy.collection(updatedCallEdges + updatedDataEdges + updatedParameterEdges).makeLayout({name:'dagre'});

            cy.nodes().on("beforeCollapse", function() {
                pdgGraph.rememberPositions(cy.nodes().positions());
            });

            cy.nodes().on("afterExpand", function() {
                cy.nodes().positions(pdgGraph.retrievePositions());
            });

            return restLayout.run();
        }
        //return secondLayout.run();
        //return cy.ready(function (event) {console.log(event);});
    };

    graphnodes.map (function (n) {
        ids.push(n.id);
        return cyNode.create(n);});

    edges.map (function (e) {
            edgeId ++;
            return cyEdge.create(e, edgeId); });

    //graph.addNodesWithEdges(graphnodes, edges);

}
