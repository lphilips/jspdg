function jipdaIt() {
    $("#eval").attr("disabled", true);
    $("#lattice").attr("disabled", true);
    $("#alloc").attr("disabled", true);
    $("#sg").empty();
    var src = editor.getSession().getValue();
    localStorage.protopuritySrc = src;
    ast = Ast.createAst(src, {loc:true});
    var ag = eval($("#alloc").val());
    var lat = eval($("#lattice").val());
    var gc = true;
    //cesk = jsCesk({a:ag, l:lat, gc: gc});
    cesk = jsCesk({a:createConcAg(), l: new ConcLattice(), gc: gc, ae: false})
    //logOutput("analysis", "a " + ag + ", l " + lat + ", gc " + gc);
    //var profileName = (function (date) {return date.getHours() + ":" + date.getMinutes()})(new Date());
    //console.profile(profileName);
    var start = Date.now();
    var system = cesk.explore(ast);
    var time = Date.now() - start;
    //console.profileEnd(profileName);
    var graph = system.graph;
    var initial = system.initial;
    states = system.states;
    transitions = graph.edges();
    var statusText = graph + " " + time;
    console.log("done", statusText);
    logOutput("analysis", statusText);
    var resultValue = statesResult(states);
    logOutput("result", resultValue);
    astNodes = [];
    Ast.nodes(ast).forEach(function (n) {astNodes[n.tag] = n});
    if (states.length > 2048) {
      console.log("no graph (too many states)");
      return;
    }
    var g = createDagreGraph(states, transitions);

    drawDagreGraph(g, states, transitions)


}