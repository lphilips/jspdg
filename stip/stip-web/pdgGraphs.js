"use strict";   

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
      removes.map(function (node) {
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
      })

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
        })
    var edgeId = 0;
    var transitions = edges.map(function (edge) {
      var g = edge.type.name;
      var label = "";
      label += g;
      if (edge.label === false) label += " (false)";
      return {id: edgeId++, source: Arrays.indexOf(edge.from, graphnodes), target: Arrays.indexOf(edge.to, graphnodes),
        label: label, orig: edge}
    });

    var graph = new dagreD3.graphlib.Graph().setGraph({});
    var getStyle = function (label) {
      if (label === 'data')
        return 'stroke-dasharray: 5,5'
      if (label === 'call')
        return 'stroke-width: 2px;'
      if (label === 'remote call')
        return 'stroke: #a4e; stroke-width:2px;'
      if (label === 'object member')
        return 'stroke-dasharray:2,2'
      if (label === 'par-out' || label === 'par-in')
        return 'stroke-width=0.5px; stroke-dasharray:1,1'
      if (label === 'remote par-in' || label === 'remote par-out') 
        return 'stroke: #a4e;stroke-width=0.5px; stroke-dasharray:1,1'
    };
    states.forEach(function (node) {
      graph.setNode(node.id, {label: node.label, description : node.description})
    });
    transitions.forEach(function (edge) {
      if (edge.source > -1 && edge.target > -1)
        graph.setEdge(edge.source, edge.target, {
           lablineInterpolate: (edge.label === "control" ? 'basis-closed' : 'linear'),
           label: edge.label === 'control' ? '' : edge.label, 
           style: getStyle(edge.label)
        });
    }); 

    return [graph, graphnodes, edges];
   }
   
   function drawPDGGraph (graph, states, transitions) {

      var render = new dagreD3.render();

      var svg = d3.select("svg g");
      svg.selectAll("*").remove();
      svg.attr('width', 500);

      graph.graph().nodeSep = 5;
      graph.graph().edgeSep = 5;
      graph.graph().rankSep = 15;
      render(svg, graph);

      $("g.node").each(function (n)
          {

            var state = states[this.__data__ ];

            $(this).attr("class", "node enter " + state.cssclass)
              .attr("title" ,  state.parsenode ? state.parsenode.toString() : "")
              .on("mouseover", function () {
                  var tooltip = d3.selectAll(".tooltip:not(.css)");
                  var HTMLfixedTip = d3.select("div.tooltip.fixed");
                  tooltip.style("opacity", "1");
                
                  if (state.parsenode) {
                    console.log(escodegen.generate(state.parsenode));
                    tooltip.text(escodegen.generate(state.parsenode));
                  }
                  var matrix = this.getScreenCTM()
                          .translate(+this.getAttribute("cx"),
                                   +this.getAttribute("cy"));
                  HTMLfixedTip 
                      .style("left", 
                             (matrix.e) + "px")
                      .style("top",
                             (matrix.f + 3) + "px");
             })
            .on("mouseout", function () {
              var tooltip = d3.selectAll(".tooltip:not(.css)");
              return tooltip.style("opacity", "0");
            })
            .dblclick(function(e) {
                e.stopPropagation();
                dblclickedOnState(this.__data__, graph, states);
            })
       })   
      $("g.edgePath").each(function ()
          {
            var transition = transitions[this.__data__.w];
            if (transition)
             $(this).attr("class", "edge " + transition.type.name);
      });
      var svg = d3.select("svg")
        //.attr("width", layout.graph().width + 40)
        //.attr("height", layout.graph().height + 40)
        .call(d3.behavior.zoom().on("zoom", function() {
          var ev = d3.event;
          svg.select("g")
            .attr("transform", "translate(" + ev.translate + ") scale(" + ev.scale + ")");
          }));
   }


   
   function dblclickedOnState(i, graph, states) {
      var node = states[i];
      slicededitor.setValue("");
      var sliced = graphs.PDG.slice(node);
      var sorted = sliced.slice(0);
      sorted.sort(function (n1, n2) { 
          return n1.cnt - n2.cnt;
      });
      var program = CodeGenerator.transpile(sorted, {target : 'normal'}, graphs.AST);
      slicededitor.setValue(escodegen.generate(program.program));

      sliced.map(function (node) {
        $("g.node").each(function (n)
          {

            var state = states[this.__data__];
            if (state.id === node.id) {
               $(this).attr("class", $(this).attr("class").concat(" sliced"));
            }
          })
      })
  }   
   function sanitize(str)
   {
     var result = "";
     for (var i = 0; i < str.length; i++)
     {
       var code = str.charCodeAt(i); 
       if (code < 256)
       {
         result += str.charAt(i); 
       }
       else
       {
         result += "\n";
       }
     }
     return result;
   }
   
   function clear()
   {
     $("#output").empty();
     return []; // avoids "undefined" as return value, currently prints nothing (?)
   }   
  