var transitions, states;
function jipdaIt() {
    

    function postComputeGraph(initial) {
        states = [];
      transitions = [];
      var todo = [initial];
      while (todo.length > 0)
      {
        var s = todo.pop();
        states[s._id] = s;
        s._successors.forEach(
         function (t)
          {
            if (isFinite(t._id))
            {
              return;
            }
            t._id = transitions.push(t) - 1;
            todo.push(t.state);
          });  
        }
      }    


    $("#eval").attr("disabled", true);
    $("#lattice").attr("disabled", true);
    $("#alloc").attr("disabled", true);
    $("#sg").empty();
    var src = editor.getSession().getValue();
    localStorage.protopuritySrc = src;
    var ast = Ast.createAst(src, {loc:true});
    astNodes = [];
    Ast.nodes(ast).forEach(function (n) {astNodes[n.tag] = n});
      print(astNodes.length, "nodes in ast");
    eval($("#config").val());
    var errors = $("#errors").is(":checked"); 
    var gc = true;
      cesk = jsCesk({a:createTagAg(), l:new JipdaLattice()});
      
      //logOutput("analysis", "a " + ag + ", l " + lat + ", gc " + gc + ", errors " + errors);
      
    var profileName = (function (date) {return date.getHours() + ":" + date.getMinutes()})(new Date()); 
    console.profile(profileName);
    var start = Date.now();
    var system = cesk.explore(ast);
    var time = Date.now() - start;
    console.profileEnd(profileName);
    var initial = system.initial;
    var result = system.result;
    var contexts = system.contexts;   
    console.log("analysis took " + time + " ms");
    console.log(system.states.count() + " states; " + result.count() + " results; " + contexts.count() + " contexts");
    var result = computeResultValue(system.result);
    var resultValue = result.value;
    console.log("result value " + resultValue);
    if (errors)
    {
      console.log(result.msgs.join("\n"));
      result.msgs.forEach(function (msg) {logOutput("error", msg)});
    }

    if (system.states.count() > 2048)
    {
      console.log("no graph (too many states)");
      return;
    }
    
    postComputeGraph(initial);
    console.log(transitions.length + " transitions");
    logOutput("analysis", states.length + "/" + transitions.length + " " + time);
    logOutput("result", resultValue);
    var g = createDagreGraph(states, transitions);

    drawDagreGraph(g, states, transitions)


}