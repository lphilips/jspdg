function drawLinks (PDG, element, ww,slicededitor) {
  var edges = [];
  var nodes = [];
  for (var i = 0; i < PDG.nodes.length; i++) {
    var node = PDG.nodes[i];
    var to_nodes = [];
    var add = function(n) {
      var sourceIndex = Arrays.indexOf(n, nodes);
      if (sourceIndex < 0)
      {
        sourceIndex = nodes.length;
        nodes[sourceIndex] = n;
      }
    };
    var add_edges = function(n) {
      if(n.edges_out) {
        var to_edges = n.edges_out.filter(function(e) {
         return Arrays.indexOf(e, edges) < 0;
       });
        edges = edges.concat(to_edges);
        to_nodes = to_nodes.concat(to_edges.map(function(e) {
          return e.to;
        }))
      }};
      add(node);
      if(node.edges_out.length) {
        add_edges(node);
      }
      while(to_nodes.length) {
       var n = to_nodes[0];
       add(n);
       add_edges(n); 
       to_nodes = to_nodes.slice(1);
     }  
   };

   var dot = "digraph PDG { graph[center=true, margin=0.2, nodesep=0.1, ranksep=0.3] //rankdir=LR;\n";
   nodes.forEach(
    function (node, i) {
      var label   = node.id,
          parsed  = node.parsenode,
          dtype   = node.getdtype && node.getdtype() ? node.getdtype().name : false,
          tooltip = parsed ? parsed.toString() : " ";
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
       		label += " " + ((parsed && parsed.toString().length > 10) ? parsed.toString().slice(0,10)+"..." : parsed) ;//+ " " + node.parsenode.type;

      if (node.isEntryNode)
          dot += node.id + "[ label=\"" + label +"\", tooltip=\"" + tooltip + "\", penwidth=\"2.5\",color=\"#72777A\"];\n";  
      if (node.isDistributedNode)
          dot += node.id + "[ label=\"" + label +"\", tooltip=\"" + tooltip + "\", style=\"filled\",fillcolor=\"#F56105\"];\n";
      else
          dot += node.id + " [label=\"" + label +  "\", tooltip=\"" + tooltip + "\",];\n";
      });
   edges.forEach(
    function (edge) {
      var label = String(edge.type.name);
      dot += edge.from.id + " -> " + edge.to.id;
      if (edge.equalsType(EDGES.DATA) )
        dot +=  " [style=\"dotted\"]; \n";
      else if (edge.equalsType(EDGES.REMOTED) || edge.equalsType(EDGES.REMOTEC))
        dot += " [style=\"dashed\", color=\"#F56105\"];\n";
      else if (edge.equalsType(EDGES.REMOTEPARIN) || edge.equalsType(EDGES.REMOTEPAROUT))
        dot += " [color=\"#F56105\"];\n";
      else if (edge.equalsType(EDGES.SUMMARY))
        dot += " [style=\"dashed\", color=\"#0E62CF\"];\n";
      else if (edge.equalsType(EDGES.CONTROL)) {
        if(edge.label === false)
          dot += " [label=\"" + edge.label.toString() + "\"];\n";
        else
          dot += " [label=\" \"];\n";
      }
      else 
        dot += " [label=\"" + label.toString() + "\"];\n";        
    });
    dot += "}";


  var svg = Viz(dot, 'svg');
  element.append(svg);
  var $parent = $('#graphcont');
  var $stip = $('#stip');
  $('.panzoom').panzoom({
    $zoomRange: $stip.find(".zoom-range"),
    startTransform: 'scale(0.9)',
    maxScale: 0.9,
    increment: 0.1
  })



  $("g.node", ww.document).each(
    function ()
    {
      var $this = $(this);
      var $editor = ww.document.getElementById("slicededitor");
      var nodeIndex = $("title", $this).text();
      var node = nodes.filter(function (n) {return n.id === nodeIndex})[0];
      $this.dblclick(function () {
        slicededitor.setValue("");
        var sliced = PDG.slice(node);
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
        sliced.map(function(n) {
         var id = n.id;
         $("g.node",ww.document).each(function () {
          var $this = $(this);
          var nodeIndex = $("title", $this).text();
          if(nodeIndex === id) 
           $this.attr("class", "node EvalState");
       })
       });
      });
    }); 
}
