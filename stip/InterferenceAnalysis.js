var InterferenceAnalysis = (function () {

    var module = {};



    /* Basic implementation on AST level,
     * checks on assignments outside of called function scope,
     * descends into calls.
     * Also checks function expressions passed as arguments to the call.  
     */

    function doesInterfereAST (fn, args, program, checked) {
      var localass = false;
      var todo = function (f) {return checked.indexOf(f) < 0}
      if (!checked)
        var checked = [];
      checked.push(fn);
      walkAst(fn, {
        pre: function (node) {
          var declaration, enclosingFun, same;
          var functions;
          if (esp_isAssignmentExp(node)) {
            if (esp_isMemberExpression(node.left)) {
              localass = true;
            }
            else {
              declaration  = Pdg.declarationOf(node.left, program);
              enclosingFun = Ast.enclosingFunScope(declaration, program);
              same = enclosingFun === fn;
              if (!localass) 
                localass = !same;
            }
          }
          if (esp_isCallExp(node)) {
            functions = Pdg.functionsCalled(node, program);
            functions.map(function (f) {
              var nonlocal;
              if (f !== fn && todo(f)) {
                nonlocal = doesInterfereAST(f, node.arguments, program, checked);
                if (!localass)
                  localass = nonlocal;
              }
            });
            node.arguments.map(function (arg) {
                var declaration; 
                if (esp_isFunExp(arg)) {
                  if (!localass)
                    localass = doesInterfereAST(arg, [], program, checked );
                } else if (esp_isIdentifier(arg)) {
                  declaration = Pdg.declarationOf(arg, program);
                  if (esp_isFunDecl(declaration) && todo(declaration)) 
                    if (!localass)
                      localass = doesInterfereAST(declaration, [], program, checked);
                  }
            });
          }
        }
      });
      args.map(function (arg) {
        var declaration; 
        if (esp_isFunExp(arg)) {
          if (!localass)
            localass = doesInterfereAST(arg, [], program, checked );
        } else if (esp_isIdentifier(arg)) {
          declaration = Pdg.declarationOf(arg, program);
          if (esp_isFunDecl(declaration) && todo(declaration)) 
            if (!localass)
              localass = doesInterfereAST(declaration, [], program, checked);
          }
      });

      return localass;

    }


    module.doesInterfere = doesInterfereAST;

    return module;

})();