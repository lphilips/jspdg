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
                return Arrays.indexOf(e, edges) < 0 //&& e.equalsType(EDGES.CONTROL);
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
      return {id: edgeId++, source: Arrays.indexOf(edge.from, nodes), target: Arrays.indexOf(edge.to, nodes),
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
      graph.setEdge(edge.source, edge.target, {
         lablineInterpolate: (edge.label === "control" ? 'basis-closed' : 'linear'),
         label: edge.label === 'control' ? '' : edge.label, 
         style: getStyle(edge.label)
      });
    }); 

    return [graph, nodes, edges];
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
      while(sorted.length > 0) {
        var n = sorted.shift();
        if(n.parsenode) {
          var slicing = toCode({target: 'normal'}, sorted, n);
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
  