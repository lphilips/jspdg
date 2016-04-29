var Aux = (function () {

      var toreturn = {};

      /* Aux function */
      var contains = function (els, el) {
          return els.filter(function (e) {
              return e.equals(el)         
          }).length >= 1;
      }

      /* Aux functions for esprima */

      var esp_isFunExp = function (node) {
          return node.type === 'FunctionExpression'
      }

      var esp_isFunDecl = function (node) {
        return node.type === 'FunctionDeclaration'
      }

      var esp_isVarDecl = function (node) {
          return node.type === 'VariableDeclaration'
      }

      var esp_isVarDeclarator = function (node) {
          return node.type === 'VariableDeclarator'
      }


      var esp_isIdentifier = function (node) {
          return node.type === 'Identifier'
      }

      var esp_isRetStm = function ( node) {
          return node.type === 'ReturnStatement'
      }

      var esp_isBinExp = function (node) {
          return  node.type === 'BinaryExpression'
      }

      var esp_isLiteral = function (node) {
          return node.type === 'Literal'
      }

      var esp_isCallExp = function (node) {
          return node.type === 'CallExpression'
      }

      var esp_isExpStm = function (node) {
          return node.type === 'ExpressionStatement'
      }

      var esp_isAssignmentExp = function (node) {
          return node.type === 'AssignmentExpression'
      }

      var esp_isBlockStm = function (node) {
          return  node.type === 'BlockStatement'
      }

      var esp_isIfStm = function (node) {
          return  node.type === 'IfStatement'
      }

      var esp_isNewExp = function (node) {
          return node.type === 'NewExpression'
      }

      var esp_isThisExpression = function (node) {
          return node.type === 'ThisExpression'
      }

      var esp_isMemberExpression = function (node) {
          return node.type === 'MemberExpression'
      }

      var esp_isForStm = function (node) {
          return node.type === 'ForStatement'
      }

      var esp_isProperty = function (node) {
          return node.type === 'Property'
      }

      var esp_isObjExp = function (node) {
          return node.type === 'ObjectExpression'
      }

      var esp_isThrowStm = function (node) {
        return node.type === 'ThrowStatement'
      }

      var esp_isTryStm = function (node) {
        return node.type === 'TryStatement'
      }

      var esp_isCatchStm = function (node) {
        return node.type === 'CatchClause'
      }

      var esp_isProgram = function (node) {
        return node.type === 'Program'
      }

      var esp_isArrayExp = function (node) {
        return node.type === 'ArrayExpression'
      }

      var esp_getCalledName = function (callnode) {
          if (esp_isMemberExpression(callnode.callee)) 
              return callnode.callee.property.name
          else
              return callnode.callee.name
      }

      var esp_inTryStatement = function (ast, node) {
        var parent = Ast.parent(node, ast);
        while (!esp_isProgram(parent)) {
          if (esp_isTryStm(parent))
            break;
          parent = Ast.parent(parent, ast)

        }
        return parent
      }

      var esp_hasCallStm = function (node, callnode) {
        var src  = escodegen.generate(node.parsenode),
            call = false,
            calls;
        /* Try catch, because node could be a return statement, which is not a valid program*/
        try {
            walkAst(node, {pre: function (node) {
                if (esp_isCallExp(node)) {
                  if (callnode)
                    call = (src.indexOf(escodegen.generate(callnode)) >= 0);
                  else
                    call = true;
                }
              }})            
            return call;
        } catch (e) {
            calls = node.getOutEdges(EDGES.CONTROL)
                      .filter(function (e) {return e.to})
                      .filter(function (n) {return n.isCallNode})
                      .filter(function (c) {return callnode.equals(c.parsenode)});
            
            return calls.length > 0;
        }
      }


      function getDeclaration (variableDecl) {
        if (esp_isVarDecl(variableDecl)) 
          /* Variable Declaration */
          return variableDecl.declarations[0];
        else
          /* Variable Declarator */
          return variableDecl
      }

      function hasInitValue (variableDecl) {
        var decl = getDeclaration(variableDecl);
        return decl.init !== null;
      }

      //
      // Walk the tree, ignore x-* properties
      //
      function walkAst(ast, callback) {
            if (typeof ast !== 'object' || !ast) {
                  
                  return;
            }


          if (callback.pre) callback.pre(ast);
            //
            // Store them, they may try to reorder
            //
            var children = [], child;
            //Object.keys(ast).forEach(function (key) {
            for (key in ast) {
                  child = ast[key];


                  if (!key.startsWith("_") && key !== 'parent' && key !== '_parent') {
                    if (child instanceof Array ) {
                        for ( j = 0, len = child.length; j < len; j += 1 ) {
                            children.push( child[j] );
                        }
                    } else if ( child != void 0 && typeof child.type === 'string' ) {
                        children.push(child);
                    }
                  }
                  //children.push(ast[key]);
            };
            children.forEach(function (node) {
                /* ignore block comment nodes */
                if (node.type !== 'Block')
                  walkAst(node, callback);
            });
          if (callback.post) callback.post(ast);
      }


      function clone (node) {
          if (Array.isArray(node)) {
              return node.map(clone);
          }
          if ("object" !== typeof node) {
              return node;
          }
          if (node === null) {
              return null;
          }

          var copy = {};
          var forEach = function (xs, fn) {
              if (xs.forEach) return xs.forEach(fn);
              for (var i = 0; i < xs.length; i++) {
                  fn.call(xs, xs[i], i, xs);
              }
          };
          var objectKeys = Object.keys || function (obj) {
              var keys = [];
              for (var key in obj) keys.push(key);
              return keys;
          };


          forEach(objectKeys(node), function(name) {
              // ignore auto generated
              if (name[0] === "$") return;
              if (name[0] === "_") return;

              var value = node[name],
                  cvalue;

              //recursion!
              if (Array.isArray(value)) {
                  cvalue = value.map(clone);
              } else if ("object" === typeof value) {
                  cvalue = clone(value);
              }

              // Note that undefined fields will be visited too, according to
              // the rules associated with node.type, and default field values
              // will be substituted if appropriate.
              copy[name] = cvalue || value;
          });

          // enumerable?
          copy.$cloned = true;

          return copy;
      }

      /* Compares a given declarator node (ast-level)
         with the declaration node of an assignment node (pdg node) */
      function compareDeclarationNodes (declarationNode, pdgnode) {
        var pdgDecl = pdgnode.getInEdges(EDGES.DATA)
                        .map(function (e) {return e.from })
                        .filter( function (n) {
                          return n.isStatementNode &&
                                esp_isVarDeclarator(n.parsenode) &&
                                n.parsenode.declarations[0].equals(declarationNode)
                        })
        return pdgDecl.length > 0
      }


      function parent (node, ast) {
         function findInChildren (cs) {
            return cs.filter(function (c) {return c.tag === node.tag}).length > 0;
         }
         var cs = Ast.children(ast);
          if (findInChildren(cs)){
            return ast;
          }
          var p;
          for (var i = 0; i < cs.length; i++)
          {
            if (p = parent(node, cs[i]))
            {
              return p;
            }
          }
          return false;
      }


      Array.prototype.memberAt =
          function (x)
          {
              for (var i = 0; i < this.length; i++)
              {
                  var el = this[i];
                  if (x.equals(el))
                  {
                      return i;
                  }
              }
              return -1;
          };

      Array.prototype.remove =
        function (x)
        {
          var i = this.memberAt(x);
          if (i === -1)
          {
            return this.slice(0);
          }
          return this.slice(0, i).concat(this.slice(i+1));
        }



    toreturn.contains           = contains;
    toreturn.isFunExp           = esp_isFunExp;
    toreturn.isFunDecl          = esp_isFunDecl;
    toreturn.isVarDecl          = esp_isVarDecl;
    toreturn.isVarDeclarator    = esp_isVarDeclarator;
    toreturn.isIdentifier       = esp_isIdentifier;
    toreturn.isRetStm           = esp_isRetStm;
    toreturn.isBinExp           = esp_isBinExp;
    toreturn.isLiteral          = esp_isLiteral;
    toreturn.isCallExp          = esp_isCallExp;
    toreturn.isExpStm           = esp_isExpStm;
    toreturn.isAssignmentExp    = esp_isAssignmentExp;
    toreturn.isBlockStm         = esp_isBlockStm;
    toreturn.isIfStm            = esp_isIfStm;
    toreturn.isNewExp           = esp_isNewExp;
    toreturn.isThisExpression   = esp_isThisExpression;
    toreturn.isMemberExpression = esp_isMemberExpression;
    toreturn.isForStm           = esp_isForStm;
    toreturn.isProperty         = esp_isProperty;
    toreturn.isObjExp           = esp_isObjExp;
    toreturn.isThrowStm         = esp_isThrowStm;
    toreturn.isTryStm           = esp_isTryStm;
    toreturn.isCatchStm         = esp_isCatchStm;
    toreturn.isProgram          = esp_isProgram;
    toreturn.isArrayExp         = esp_isArrayExp;

    toreturn.getCalledName      = esp_getCalledName;
    toreturn.inTryStatement     = esp_inTryStatement;
    toreturn.hasCallStm         = esp_hasCallStm;
    toreturn.getDeclaration     = getDeclaration;
    toreturn.hasInitValue       = hasInitValue;

    toreturn.clone              = clone;
    toreturn.parent             = parent;
    toreturn.walkAst            = walkAst;


    toreturn.compareDeclarationNodes = compareDeclarationNodes;





    if (typeof module !== 'undefined' && module.exports != null) {
        require('es6-shim');
        var Pdg = require('../jipda-pdg/pdg/pdg.js').Pdg;
        exports.Aux  = toreturn;
    }



    return toreturn;



})();