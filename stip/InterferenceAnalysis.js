var InterferenceAnalysis = (function () {

    var toreturn = {};



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
      Aux.walkAst(fn, {

        pre: function (node) {

          var declaration, enclosingFun, same;
          var functions;

          if (Aux.isAssignmentExp(node)) {
            if (Aux.isMemberExpression(node.left)) {
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

          if (Aux.isCallExp(node)) {
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
                if (Aux.isFunExp(arg)) {
                  if (!localass)
                    localass = doesInterfereAST(arg, [], program, checked );
                } else if (Aux.isIdentifier(arg)) {
                  declaration = Pdg.declarationOf(arg, program);
                  if (Aux.isFunDecl(declaration) && todo(declaration)) 
                    if (!localass)
                      localass = doesInterfereAST(declaration, [], program, checked);
                  }
            });
          }
        }
      });

      args.map(function (arg) {
        var declaration; 
        if (Aux.isFunExp(arg)) {
          if (!localass)
            localass = doesInterfereAST(arg, [], program, checked );
        } else if (Aux.isIdentifier(arg)) {
          declaration = Pdg.declarationOf(arg, program);
          if (Aux.isFunDecl(declaration) && todo(declaration)) 
            if (!localass)
              localass = doesInterfereAST(declaration, [], program, checked);
          }
      });

      return localass;

    }


    toreturn.doesInterfere = doesInterfereAST;

    if (typeof module !== 'undefined' && module.exports != null) {
        Pdg = require('../jipda-pdg/pdg/pdg.js').Pdg;
        exports.InterferenceAnalysis   = toreturn;
    }


    return toreturn;

})();