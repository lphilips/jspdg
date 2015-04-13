// restrict GC to function exit?
// manual reachable addresses in state
// dL linear during pushDown
// sprouted edges need less checking somehow

function displayTime(ms)
{
  var min = Math.floor(ms / 60000);
  var sec = Math.floor((ms % 60000) / 1000);
  return min + "'" + (sec < 10 ? "0" : "") + sec + "\"";
}

function runBenchmarks()
{
  var bprefix = "test/resources/";
  var benchmarks = ["octane/navier-stokes.js", "octane/richards.js", "octane/splay.js"];
  return benchmarks.map(
    function (benchmark)
    {
      print("=======================");
      print(benchmark);
      var src = read(bprefix + benchmark);
      var ast = Ast.createAst(src, {loc:true});
      var cesk = jsCesk({a:createTagAg(), l:new JipdaLattice(), gc:true});
      
      var sgStart = Date.now();
      var sg = new Pushdown().analyze(ast, cesk);
      var sgTime = Date.now() - sgStart;
      print("sgTime", displayTime(sgTime), sg.etg.nodes().length + "/" + sg.etg.edges().length);

      var deStart = Date.now();
      var pa = new PurityAnalysis(sg.etg, sg.ecg, sg.initial);
      var deTime = Date.now() - deStart;
      
      print("deTime", displayTime(deTime));
      var fs = pa.functions();
      
      var paStart = Date.now()
      var fresults = fs.map(
        function (f, i)
        {
          print("checking", (i+1)+"/"+fs.length, String(f).substring(0,20), "tag", f.tag, "line", f.loc.start.line);
          var fStart = Date.now();
          var fresult = {f:f, pure:pa.isPure(f)};
          var fTime = Date.now() - fStart;
          print("time", displayTime(fTime), "pure?", fresult.pure);
          return fresult;
        });
      var paTime = Date.now() - paStart;
      print("paTime", displayTime(paTime));
      
      var result = {};
      print(result);
      print();
      return result;
    });
}

function r()
{
  b();
  return runBenchmarks();
}

function concEval(src)
{
  var ast = Ast.createAst(src);
  var cesk = jsCesk({a:createConcAg(), l: new ConcLattice()});
  var s = cesk.concExplore(ast);
  print(s.value);
}

function repl(cc)
{
  cc = cc || {};
  var name = cc.name || "protopurity";
  var cesk = jsCesk({a:cc.a || createTagAg(), l:cc.l || new JipdaLattice()});
  var src = "'I am Jipda!'";
  var store = cesk.store;
  var driver = new Pushdown();
  while (src !== ":q")
  {
    var ast = Ast.createAst(src);
    try
    {
      var result = driver.analyze(ast, cesk, {store:store});
      print("(states " + result.etg.nodes().length + " edges " + result.etg.edges().length + ")");
      var resultStates = result.stepFwOver(result.initial);
      resultStates.forEach(function (haltState) {print(haltState.q.value)});
      store = resultStates.map(function (haltState) {return haltState.q.store}).reduce(Lattice.join, BOT);
    }
    catch (e)
    {
      print(e.stack);
    }
    write(name + "> ");
    src = readline();
  }
  print("Bye!");
}

function concRepl()
{
  return repl({name: "conc", p:new CpLattice(), a:concreteAg});
}
