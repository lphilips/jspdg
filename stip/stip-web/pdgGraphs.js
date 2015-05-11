"use strict";   

function createPDGGraph (PDG)
   {
      var edges = [];
      var nodes = [];
      PDG.nodes.map(function (node) {
        var to_nodes = [],
            add = function(n) {
              var sourceIndex = Arrays.indexOf(n, nodes);
              if (sourceIndex < 0) {
                sourceIndex = nodes.length;
                nodes[sourceIndex] = n;
              }
            },
            addEdges = function (n) {
              var to_edges = n.getOutEdges().filter(function (e) {
                return Arrays.indexOf(e, edges) < 0;
              });
              edges = edges.concat(to_edges);
              to_nodes = to_nodes.concat(to_edges.map(function (e) {return e.to}));
            };
          add(node);
          if (node.getOutEdges().length)
            addEdges(node)
          while (to_nodes.length) {
            var n = to_nodes.shift();
            add(n);
            addEdges(n)
          }
      })

      var states = nodes.map( function (node, id) {
          var label    = node.id,
              parsed   = node.parsenode,
              dtype    = node.getdtype && node.getdtype() ? node.getdtype().name : false,
              tooltip  = parsed ? parsed.toString() :  "",
              cssclass = label.slice(0,1) + " " + dtype;
          if(node.isActualPNode) 
            node.value ? label += " " + node.value : label;
          if(node.isFormalNode)
            label += " " + node.name
          if(dtype === "server")
            label += "[S]"
          if(dtype === "client")
            label += "[C]"
          if(dtype === "shared")
            label += "[Sh]"
          if(node.parsenode) 
              label += " " + ((parsed && parsed.toString().length > 10) ? parsed.toString().slice(0,10)+"..." : parsed) ;
          if (node.isStatementNode && 
            (esp_isThrowStm(node.parsenode) ||
              esp_isTryStm(node.parsenode) ||
              esp_isCatchStm(node.parsenode))) {
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
      var edge;
      var label = "";
      label += g;
      if (!edge.label) label += " (false)";
      return {id: edgeId++, source: Arrays.indexOf(edge.from, nodes), target: Arrays.indexOf(edge.to, nodes),
        label: label}
    });

    var graph = new dagreD3.Digraph({compound: true});

    states.forEach(function (node) {
      graph.addNode(node.id, {label: node.label, description : node.description})
    });
    transitions.forEach(function (edge) {
      graph.addEdge(edge.id, edge.source, edge.target, {label: edge.label})
    }); 
    return [graph, nodes, edges];
   }
   
   function drawPDGGraph (graph, states, transitions) {

      var renderer = new dagreD3.Renderer();
      var l = dagreD3.layout();
      renderer.layout(l);

      var svg = d3.select("svg g");
      svg.selectAll("*").remove();
      svg.attr('width', 500);
      var layout = dagreD3.layout()
                    .nodeSep(4)
                    .edgeSep(5)
                    .rankSep(15)
                   // .rankDir("LR");
      renderer.layout(layout);

      renderer.run(graph, svg);


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
            var transition = transitions[this.__data__];
            //if (transition)
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
      sorted.sort(function(n1,n2) { 
          return n1.cnt - n2.cnt;
      });
      while(sorted.length > 0) {
        var n = sorted.shift();
        if(n.parsenode) {
          var slicing = toCode({target: 'normal'},sorted,n);
          if(slicing.parsednode) {
            var parsed = escodegen.generate(slicing.parsednode);
            slicededitor.setValue(slicededitor.getValue() + parsed + "\n");
          }
          sorted = slicing.nodes;
        }
      };
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
  