var Hoist = (function () {

    var toreturn = {};


    //
    // Walk the tree, ignore x-* properties
    //
    function walk(ast, callback) {
          if (typeof ast !== 'object' || !ast) {
                return;
          }


        if(callback.pre) callback.pre(ast);
          //
          // Store them, they may try to reorder
          //
          var children = [], child;
          //Object.keys(ast).forEach(function (key) {
          for (key in ast) {
                child = ast[key];
                //if (key.substr(0,2) === 'x-') {
                 // return;
                //}
                if (child instanceof Array ) {
                    for ( j = 0, len = child.length; j < len; j += 1 ) {
                        children.push( child[j] );
                    }
                } else if ( child != void 0 && typeof child.type === 'string' ) {
                    children.push(child);
                }
                //children.push(ast[key]);
          };
          children.forEach(function (node) {
                walk(node, callback);
          });
        if(callback.post) callback.post(ast);
    }
   

    var createVarDecl = function (name) {
        var decl = {
            type : "VariableDeclaration",
            declarations : [{
                type : "VariableDeclarator",
                id   : {
                    type : "Identifier",
                    name : name
                },
                init : null
            }],
            kind : "var",
            hoist: true,
        };
        Ast.augmentAst(decl);
        return decl;
    };

    var createAssignment = function (name, value) {
        var ass = {
                type: "AssignmentExpression",
                operator: "=",
                left: {
                    type: "Identifier",
                    name: name
                },
                right: value
        };
        Ast.augmentAst(ass);
        return ass;
    };

    var getParent = function (node, ast, tohoist) {
        var parent = Ast.parent(node, ast);
        if (tohoist && tohoist(parent))
            return parent
        else
            return Ast.enclosingFunScope(node, ast)
    };


    /* Changes the AST destructively 
     * Optional parameter: tohoist = predicate function.
     * Can be used for example when we want to hoist inside a block with a certain annotation as well.
     * Takes one parameter: ast node. 
     */
    var hoist = function (ast, tohoist) {

        var hoisted = {}, 
            added;

        walk(ast, {

            pre : function (node) {
                var declmap,
                    names;

                if (Aux.isProgram(node) || 
                    Aux.isFunDecl(node) || 
                    Aux.isFunExp(node)) {
                    declmap = Ast.functionScopeDeclarations(node);
                    names = Object.keys(declmap);

                    hoisted[node.tag] = names;
                    added = [];

                    names.map(function (name) {
                        var declnode = declmap[name];
                        if (!tohoist(Ast.enclosingBlock(declnode, ast))) {

                            if (Aux.isFunDecl(declnode)) {
                                declnode.hoist = true;
                                /* remove from body */
                                if (Aux.isProgram(node))
                                    node.body = node.body.remove(declnode);
                                else
                                    node.body.body = node.body.body.remove(declnode);
                                
                                added.push(declnode);
                                

                            }
                            else if (Aux.isVarDeclarator(declnode)) {
                                added.push(createVarDecl(name));
                            }
                        }
                    });
                    if (Aux.isProgram(node))
                        node.body = added.concat(node.body);
                    else
                        node.body.body = added.concat(node.body.body);
                }

                else if (tohoist && tohoist(node)) {
                    declmap = Ast.functionScopeDeclarations(node);
                    names = Object.keys(declmap);

                    hoisted[node.tag] = names;
                    added = [];

                    names.map(function (name) {
                        var declnode = declmap[name];

                        if (Aux.isFunDecl(declnode)) {
                            declnode.hoist = true;
                            /* remove from body (TODO currently only for block )*/
                            node.body = node.body.remove(declnode);
                            added.push(declnode);
                            

                        }
                        else if (Aux.isVarDeclarator(declnode)) {
                            added.push(createVarDecl(name));
                        }
                    });
                    /* TODO currently only for block */
                    node.body = added.concat(node.body);
                }

                else {

                    if (Aux.isVarDecl(node) && !node.hoist) {
                        var parent = getParent(node, ast, tohoist);
                        var astparent = Ast.parent(node, ast);
                        var body = Aux.isFunDecl(parent) || Aux.isFunExp(parent) ? parent.body.body : parent.body;
                        var index = body.indexOf(node);
                        node.declarations.map(function (decl) {
                            if (hoisted[parent.tag] && hoisted[parent.tag].indexOf(decl.id.name) >= 0 && decl.init) {
                                var exp = {type: "ExpressionStatement", expression : createAssignment(decl.id.name, decl.init)};
                                Ast.augmentAst(exp);
                                exp.leadingComment = node.leadingComment;
                                if (Aux.isForStm(astparent) && Aux.isVarDecl(astparent.init) && node.equals(astparent.init)) {
                                    astparent.init = exp.expression;
                                }
                                else {
                                    body.splice(index, 0, exp);
                                }
                            }
                        });
                        astparent.latestHoistIndex = index;

                        if (Aux.isTryStm(astparent) || Aux.isCatchStm(astparent) ||
                            Aux.isBlockStm(astparent) && Aux.isTryStm(Ast.parent(astparent, ast)) ||
                            Aux.isBlockStm(astparent) && Aux.isCatchStm(Ast.parent(astparent, ast))) {
                            astparent.body = astparent.body.remove(node);
                        }
                        else if (Aux.isFunDecl(parent) || Aux.isFunExp(parent)) 
                            parent.body.body = body.remove(node)
                        else
                            parent.body = body.remove(node);
                    }
                }
            }

        });

       
        return ast;
    };


    toreturn.hoist = hoist;
    if (typeof module !== 'undefined' && module.exports != null) {
            Aux = require('./aux.js').Aux;
            Ast = require('../jipda-pdg/ast.js').Ast;

            exports.Hoist            = toreturn;
    }



    return toreturn;



})();