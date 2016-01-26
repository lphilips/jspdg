var pre_analyse = function (ast) {
    var anonf_ct    = 0;
    var anonf_name  = 'anonf';
    var primitives  = ["$", "console", "window"]; 
    var asyncs      = ["https", "dns", "fs", "proxy"];
    var anonfC      = [];
    var anonfS      = [];
    var anonfSh     = [];
    var decl        = [];
    var callS       = [];
    var callC       = [];
    var callSh      = [];
    var assumes     = [];
    var primdefs    = {};
    var primreturns = {};
    var primtoadd   = {};
    var fundefsC    = [];
    var sharedblock;

    var function_args = function (callnode) {
        return callnode.arguments.filter(function (arg) {
            return esp_isFunExp(arg) ||
                   (esp_isIdentifier(arg) && fundefsC[arg.name])
        }) 
    }
    
    var createIdentifier = function (id) {
        return {type:'Identifier', name:id};
    }

    var createDeclaration = function (id) {
        return { type:'VariableDeclaration', 
                declarations: [{
                    type:'VariableDeclarator',
                    id: createIdentifier(id),
                    init: null
                }],
                kind:'var'
            }
    }

    var createAssignment = function (id, value) {
        return {
            type: 'ExpressionStatement',
            expression : {
                type : 'AssignmentExpression',
                operator : '=',
                left : id,
                right : value
            }
        }
    }

    var createFunction = function (arg, id) {
        return {    
            type:"ExpressionStatement",
            expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: createIdentifier(id),
                right: arg
            }
        }
    }

    var createReturnValue = function (type) {
        switch (type) {
            case "Num": 
                return  {
                            "type": "Literal",
                            "value": 0
                        }
            case "String":
                return  {
                            "type": "Literal",
                            "value": ""
                        }
            case "Bool":
                return  {
                            "type": "Literal",
                            "value": true,
                        }
            case "Obj":
                return {
                            "type": "ObjectExpression",
                            "properties": []
                       }
            default:
                return null
            }

    }

    var createFunExp = function (args, returntype) {
        var funexp =  {
                    type: "FunctionExpression",
                    id: null,
                    params: args,
                    defaults: [],
                    body: {
                        type: "BlockStatement",
                        body: [
                            {
                                type: "ReturnStatement",
                                argument: createReturnValue(returntype)
                            }
                        ]
                    },
                    generator: false,
                    expression: false
            };
        Ast.augmentAst(funexp);
        return funexp;
    }

    var createFunDecl = function (id, args, returntype) {
        var fundecl =  {
            "type": "FunctionDeclaration",
            "id": {
                "type": "Identifier",
                "name": id
            },
            "params": args,
            "defaults": [],
            "body": {
                "type": "BlockStatement",
                "body": [
                    {
                        "type": "ReturnStatement",
                        "argument": createReturnValue(returntype)
                    }
                ]
            },
            "generator": false,
            "expression": false
        };
        Ast.augmentAst(fundecl);
        return fundecl;
    }

    var createCall = function (id) {
        var call = {
            type:"ExpressionStatement",
            expression: {
                type:"CallExpression",
                callee: createIdentifier(id),
                arguments:[],
                isPreAnalyse: true
            }
        };
        Ast.augmentAst(call);        
        return call;
    }


    /* Gets annotation of form '@assumes [variable, function(x)]' */
    var extractAssumes = function (string) {
        var regexp = /\[.*?\]/,
            assumesS, assumesA;
        if (string.search(regexp >= 0)) {
            assumesS = string.match(regexp)[0].slice(1,-1);
            assumesA = assumesS.split(";");
            assumesA.map(function (assume) {
                var type, args, name;
                regexp = /\:.*/;
                type = assume.match(regexp)[0].slice(1);
                regexp = /\(.*?\)/;
                if (assume.search(regexp) > 0) {
                    args = assume.match(regexp)[0].slice(1,-1).split(",");
                    args = args.map(function (arg) { return createIdentifier(arg)});
                    name = assume.slice(0, assume.indexOf("("));
                    assumes.push(createFunDecl(name, args, type));
                } else {
                    assumes.push(createDeclaration(assume))
                }
            })
        }
    }

    var comments;
    var getComments = function (node) {
        if (!comments) {
            var parent = node;
            while (!esp_isProgram(parent)) {
                parent = Ast.parent(parent, ast);
            }
            comments =  parent.comments;
        }
        return comments;
    }

    var isBlockAnnotated = function (node) {
       var parent = node,
            annotation;
        while(!esp_isProgram(parent)) {
            if (esp_isBlockStm(parent) && parent.leadingComment) {
                break;
            } else {
                parent = Ast.parent(parent, ast);
            }
        }
        if (esp_isBlockStm(parent)) {
            return parent.leadingComment;
        }
        return;
    }

    var getCurrentBlock = function (node) {
        var parent = node;
        while(!esp_isProgram(parent)) {
            if (esp_isBlockStm(parent)) {
                break;
            } else {
                parent = Ast.parent(parent, ast);
            }
        }
        return parent;
    }


    walkAst(ast, {

        pre: function (node) {
            /* Needs to be done upfront */
            if (esp_isFunDecl(node)) {
                var comment = isBlockAnnotated(node);
                if (comment && Comments.isClientAnnotated(comment)) 
                    fundefsC[node.id.name] = node;
            }
        },

        post: function (node) {

            getComments(node);


            /* @assumes annotation */
            if (node.leadingComment && Comments.isAssumesAnnotated(node.leadingComment.value)) {
                extractAssumes(node.leadingComment.value);
            }

            /* If a block has updateFirst and/or updateLast property, 
               these statements should be added in the beginning / ending of the block */
            if (esp_isBlockStm(node) || esp_isProgram(node)) {
                var comment = node.leadingComment;

                if (comment && Comments.isSharedAnnotated(comment)) {
                    sharedblock = node;
                    return;
                }

                if (node.updateFirst) {
                    node.body = node.updateFirst.concat(node.body);
                }
                if (node.updateLast) {
                    node.body = node.body.concat(node.updateLast)
                }
                   
            }

            /* If a node is tagged as primitive, add it to the primitive definitions.
               This causes later accesses to the primitive (such as element.jquerymethod()) 
               to be added to e.g. the jquery primitive */
            if (node.primitive) {
                if (esp_isVarDeclarator(node))
                  primdefs[node.id.name] = node;
                else if (esp_isAssignmentExp(node))
                  primdefs[node.left.name] = node;
            }

            if (esp_isMemberExpression(node) && !node.primitive &&
              !esp_isThisExpression(node.object)) {
                var name = node.property.name;
                var objname;
                if (esp_isCallExp(node.object)) {
                    objname = node.object.callee.name;
                }
                else { 
                    objname = node.object.name;
                }
                
                primtoadd[objname] ? primtoadd[objname].push(name) : primtoadd[objname] = [name] ;
            }


            if (esp_isCallExp(node)) {

                var name    = esp_getCalledName(node);
                var anonf   = function_args(node);
                var obj     = esp_isMemberExpression(node.callee) ? node.callee.object.name : false;
                var primdef = obj ? primdefs[obj] : primdefs[name];

                if (primitives.indexOf(name) >= 0 ) {
                    node.primitive = true;
                    node.parent = Ast.parent(node, ast);
                    if (esp_isExpStm(node.parent) || esp_isVarDecl(node.parent) || 
                        esp_isAssignmentExp(node.parent) || esp_isVarDeclarator(node.parent))
                        node.parent.primitive = name;
                }
                if (primdef) {
                    var primret = primreturns[primdef.primitive],
                        present = primret.properties.filter(function (prop) {
                            return prop.key.name === name
                        });
                    if (present.length <= 0)
                        primret.properties.push( {
                            type : 'Property',
                            key :  {
                                        "type": "Identifier",
                                        "name": name
                                    },
                            value : createFunExp([], '')
                        });
                        Ast.augmentAst(primret);
                }
                if (anonf.length > 0) {
                    var comment    = isBlockAnnotated(node);
                    var enclBlock  = getCurrentBlock(node);
                    var bodyFirst  = [];
                    var bodyLast   = [];
                    node.arguments = node.arguments.map(function (arg) {
                        if (esp_isFunExp(arg)) {
                            var name = anonf_name + ++anonf_ct;
                            var func = createFunDecl(name, arg.params);
                            var call = createCall(name);
                            call.leadingComment = {type: "Block", value:"@generated", range: [0,16]};
                            func.body = arg.body;
                            func.params.map(function (param) {
                                call.expression.arguments = call.expression.arguments.concat({
                                        "type": "Literal",
                                        "value": null
                                    });
                            });
                            Ast.augmentAst(func);
                            bodyFirst.push(func);
                            bodyLast.push(call);
                            return createIdentifier(name);
                        }
                        else if (esp_isIdentifier(arg) && fundefsC[arg.name]) {
                            call = createCall(arg.name);
                            call.leadingComment = {type: "Block", value:"@generated"};
                            bodyLast = bodyLast.concat(call);
                            return arg;
                        }
                        else
                            return arg;
                    });

                    if (!enclBlock.updateFirst) {
                        enclBlock.updateFirst = [];
                        enclBlock.updateLast = [];
                    }
                    enclBlock.updateFirst = enclBlock.updateFirst.concat(bodyFirst);
                    enclBlock.updateLast = enclBlock.updateLast.concat(bodyLast);

                }
            }

        }
    })

    ast.body = js_libs.getLibraries().concat(anonfSh).concat(callSh).concat(ast.body);

    return  { 
        ast        : ast,
        assumes    : js_libs.getLibraries().concat(assumes),
        shared     : sharedblock,
        primitives : primitives,
        asyncs     : asyncs
    };
}