load("lib/esprima.js");

var console = {log:print}

function b()
{
  load("common.js");
  load("store.js");
  load("agc.js");
  load("test.js");
  load("lattice.js");
  load("lattice1.js");
  load("setLattice.js");
  load("cpLattice.js");
  load("address.js");
  load("graph.js");
  load("pushdown.js");
  load("jsEsprima.js");
  load("jsCesk.js");
  load("tagAg.js");
  load("concreteAg.js");
  load("defaultBenv.js");
  load("analysis.js");
  load("jipda.js");
  
//  load("test/astTests.js");
//  load("test/benvTests.js");
  load("test/concreteTests.js");
  load("test/jipdaTests.js");
  load("test/dependenceTests.js");  
//  load("test/coverageTests.js");
//  load("test/latticeTests.js");  
}

b();