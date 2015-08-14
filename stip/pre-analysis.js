var pre_analyse = function (src) {
    var anonf_ct    = 0;
    var anonf_name  = 'anonf';
    var primitives  = ["$", "proxy"];
    var anonfC      = [];
    var anonfS      = [];
    var anonfSh     = [];
    var decl        = [];
    var callS       = [];
    var callC       = [];
    var callSh      = [];
    var assumes     = [];
    var primdefs    = [];
    var primreturns = {};
    var fundefsC    = [];

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
        return {
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
                }
    }

    var createFunDecl = function (id, args, returntype) {
        return  {
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
        }
    }

    var createCall = function (id) {
        return {
            type:"ExpressionStatement",
            expression: {
                type:"CallExpression",
                callee: createIdentifier(id),
                arguments:[],
                isPreAnalyse: true
            }
        }
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

    primitives.map(function (prim) {
        var primret = {type: 'ObjectExpression', properties : []},
            func    = createFunDecl(prim, [], "Obj");
        func.body.body[0].argument = primret;
        primreturns[prim] = primret;
        assumes.push(func);
    })


    var comments;
    var getComments = function (node) {
        if (!comments) {
            var parent = node;
            while (!esp_isProgram(parent)) {
                parent = parent.parent;
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
                parent = parent.parent;
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
                parent = parent.parent;
            }
        }
        return parent;
    }

    var isAnnotated = function (node) {
       /* var annotation;
        getComments(node);
        comments.map(function (comment) {
            var commentEnd = comment.loc.end.line,
                nodeStart  = node.loc.start.line;
            if (nodeStart - commentEnd === 1) {
                annotation = comment
            }
        })
        return annotation; */
    }



    var src = falafel(src, 
                { comment : true, tokens: true, loc: true, owningComments: true},
                function (node) {
                  getComments(node);

                  if (esp_isProgram(node)) {
                    1;
                  }

                  if (node.type === "Block" && Comments.isAssumesAnnotated(node.value)) {
                    extractAssumes(node.value)
                  }

                  if (esp_isBlockStm(node)) {
                    var comment = node.leadingComment,
                        bodystr = node.source().slice(1, -1);

                    if (node.updatestrF) {
                        node.updatestrF.map(function (str) {
                            bodystr = str.concat(bodystr)
                            node.body = esprima.parse(str).body.concat(node.body);
                        })
                        node.updatestrL.map(function (str) {
                            bodystr = bodystr.concat(str);
                            node.body = node.body.concat(esprima.parse(str).body);
                        })
                    }

                    node.update("{" + bodystr + "}");

                    
                  }

                  if (node.primitive) {
                    if (esp_isVarDeclarator(node))
                      primdefs[node.id.name] = node;
                    else if (esp_isAssignmentExp(node))
                      primdefs[node.left.name] = node;
                  }

                  if (esp_isFunDecl(node)) {
                    var comment = isBlockAnnotated(node);
                    if (Comments.isClientAnnotated(comment)) 
                        fundefsC[node.id.name] = node;
                  }

                  if (esp_isCallExp(node)) {
                    var name    = esp_getCalledName(node);
                    var anonf   = function_args(node);
                    var obj     = esp_isMemberExpression(node.callee) ? node.callee.object.name : false;
                    var primdef = obj ? primdefs[obj] : primdefs[name];
                    if (primitives.indexOf(name) >= 0 ) {
                        node.primitive = true;
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
                            })
                    }
                    if (anonf.length > 0) {
                        var comment = isBlockAnnotated(node);
                        var enclBlock = getCurrentBlock(node);
                        var bodystrF = "";
                        var bodystrL = "";
                        node.arguments = node.arguments.map(function (arg) {
                            if (esp_isFunExp(arg)) {
                                var name = anonf_name + ++anonf_ct;
                                var func = createFunDecl(name, arg.params);
                                
                                var call = createCall(name);
                                func.body = arg.body;
                                func.params.map(function (param) {
                                    call.expression.arguments = call.expression.arguments.concat({
                                            "type": "Literal",
                                            "value": null
                                        });
                                });
                                if (comment && Comments.isClientAnnotated(comment)) {
                                    bodystrF = escodegen.generate(func).concat(escodegen.generate(call)).concat(bodystrF);
                                }
                                else if (comment && Comments.isServerAnnotated(comment)) {
                                     
                                     bodystrF = escodegen.generate(func).concat(escodegen.generate(call)).concat(bodystrF);
                                } else {
                                    anonfSh = anonfSh.concat(func);
                                    callSh = callSh.concat(call);
                                    
                                }
                                return createIdentifier(name);
                                
                            }
                            else if (esp_isIdentifier(arg) && fundefsC[arg.name]) {
                                bodystrL = bodystrL.concat(escodegen.generate(createCall(arg.name)));
                                return arg
                            }
                            else
                                return arg
                        });
                        node.update(escodegen.generate(node));
                        if (!enclBlock.updatestrF) {
                            enclBlock.updatestrF = [];
                            enclBlock.updatestrL = [];
                        }
                        enclBlock.updatestrF.push(bodystrF);
                        enclBlock.updatestrL.push(bodystrL);

                    }
                }
           
            });

    src = src.toString();
   
    assumes.map(function (assume) {
        src = escodegen.generate(assume).concat(src)
    })
    anonfSh.map(function (func) {
        src = src.concat(escodegen.generate(func))
    })
    callSh.map(function (call) {
        src = src.concat(escodegen.generate(call))
    })




    return  { 
        src        :   src,
        assumes    : assumes,
        primitives : primitives
    };
}