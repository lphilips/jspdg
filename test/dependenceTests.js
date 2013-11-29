var suiteJipdaDepTests = 

(function () 
{
  var module = new TestSuite("suiteJipdaDepTests");

  function createCesk(cc)
  {
    cc = cc || {};
    return jsCesk({a:cc.a || tagAg, p:cc.p || new Lattice1()});
  }
  
  module.testDeclarations1 =
    function ()
    {
      var src = "var foo=function (){var a=2;var bar=function (x){return x+42};function qux(){var a='BAD'};qux();return bar(a)};foo()";
      var ast = Ast.createAst(src);
      var cesk = createCesk();
      var dsg = new Pushdown().analyze(ast, cesk);
      var ana = new Analysis(dsg);
      var aRef = Ast.nodes(ast).filter(function (node) {return node.name === "a" && Ast.isReferenceIdentifier(node, ast)})[0];
      var aDecl = Ast.nodes(ast).filter(function (node) {return node.type === "VariableDeclarator" && node.id.name === "a"})[0];
      var decls = ana.declarations(aRef);
      assertEquals([aDecl], decls);
    }
      
  module.testDeclarations2 =
    function ()
    {
      var src = "function global(){var a = 1;var b = 2;var foo = function () { return a+b }; return foo()}; global()";
      var ast = Ast.createAst(src);
      var cesk = createCesk();
      var dsg = new Pushdown().analyze(ast, cesk);
      var ana = new Analysis(dsg);
      var aRef = Ast.nodes(ast).filter(function (node) {return node.name === "a" && Ast.isReferenceIdentifier(node, ast)})[0];
      var aDecl = Ast.nodes(ast).filter(function (node) {return node.type === "VariableDeclarator" && node.id.name === "a"})[0];
      var decls = ana.declarations(aRef);
      assertEquals([aDecl], decls);
    }
      
  return module;

})()
