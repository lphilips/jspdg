var Hoist = (function () {

    var module = {};


    /* Walk function from esprima-walk 
    * https://github.com/jrajav/esprima-walk
    */

    function walk (ast, fn) {

        var stack = [ast], 
            i, j, key, len, node, child;

        for ( i = 0; i < stack.length; i += 1 ) {
            node = stack[i];
            fn(node);
            for (key in node) {
                child = node[key];
                if (child instanceof Array ) {
                    for ( j = 0, len = child.length; j < len; j += 1 ) {
                        stack.push( child[j] );
                    }
                } else if ( child != void 0 && typeof child.type === 'string' ) {
                    stack.push( child );
                }
            }
        }
    };

    //
    // Walk the tree, ignore x-* properties
    //
    function walk2(ast, callback) {
          if (typeof ast !== 'object' || !ast) {
                return;
          }


        if(callback.pre) callback.pre(ast);
          //
          // Store them, they may try to reorder
          //
          var children = [];
          Object.keys(ast).forEach(function (key) {
                if (key.substr(0,2) === 'x-') {
                  return;
                }
                children.push(ast[key]);
          });
          children.forEach(function (node) {
                walk2(node, callback);
          });
        if(callback.post) callback.post(ast);
    }
   

    var createVarDecl = function (name) {
        return {
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
        }
    };

    var createAssignment = function (name, value) {
        return {
                type: "AssignmentExpression",
                operator: "=",
                left: {
                    type: "Identifier",
                    name: name
                },
                right: value
            }
    };

    /* Changes the AST destructively 
     * Optional parameter: tohoist = predicate function.
     * Can be used for example when we want to hoist inside a block with a certain annotation as well.
     * Takes one parameter: ast node. 
     */
    var hoist = function (ast, tohoist) {

        var hoisted = {}, 
            added;

        walk2(ast, {

            pre : function (node) {
                var declmap,
                    names;

                if (esp_isProgram(node) || esp_isFunDecl(node)) {
                    declmap = Ast.functionScopeDeclarations(node);
                    names = Object.keys(declmap);

                    hoisted[node.tag] = names;
                    added = [];

                    names.map(function (name) {
                        var declnode = declmap[name];
                        if (!tohoist(Ast.enclosingBlock(declnode, ast))) {

                            if (esp_isFunDecl(declnode)) {
                                declnode.hoist = true;
                                /* remove from body */
                                if (esp_isProgram(node))
                                    node.body = node.body.remove(declnode);
                                else
                                    node.body.body = node.body.body.remove(declnode);
                                
                                added.push(declnode);
                                

                            }
                            else if (esp_isVarDeclarator(declnode)) {
                                added.push(createVarDecl(name));
                            }
                        }
                    });
                    if (esp_isProgram(node))
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

                        if (esp_isFunDecl(declnode)) {
                            declnode.hoist = true;
                            /* remove from body (TODO currently only for block )*/
                            node.body = node.body.remove(declnode);
                            added.push(declnode);
                            

                        }
                        else if (esp_isVarDeclarator(declnode)) {
                            added.push(createVarDecl(name));
                        }
                    });
                    /* TODO currently only for block */
                    node.body = added.concat(node.body);
                }

                else {

                    var commenti, comment, moved;
                    if (node.leadingComment) {
                        commenti = ast.comments.indexOf(node.leadingComment)
                        if (commenti >= 0) {
                            comment = ast.comments[commenti];
                            moved = ast.toString().indexOf(node.toString()) - node.range[0];
                            comment.range[0] = comment.range[0] + moved;
                            comment.range[1] = comment.range[1] + moved;
                        }
                    } 

                    if (esp_isVarDecl(node) && !node.hoist) {
                        node.declarations.map(function (decl) {
                            var parent = Ast.enclosingFunScope(decl,ast);
                            var range;
                            if (hoisted[parent.tag] && hoisted[parent.tag].indexOf(decl.id.name) >= 0) {
                                node.type = "ExpressionStatement";
                                node.expression = createAssignment(decl.id.name, decl.init);
                                node.expression.range = node.range;

                            }
                        })
                    }
                }
            }

        });

       
        return ast;
    };


    module.hoist = hoist;
    return module;


})();