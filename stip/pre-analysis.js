var pre_analyse = function (src) {
    var anonf_ct    = 0;
    var anonf_name  = 'anonf';
    var primitives  = ["$", "jQuery", "console"];
    var anonfs      = [];
    var decl        = [];
    var calls       = [];
    var assumes     = [];
    var comments    = [];
    var primdefs    = [];
    var primreturns = {};

    var function_args = function (callnode) {
        return callnode.arguments.filter(function (arg) {
            return arg.type === "FunctionExpression"
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
        return {
            type: "VariableDeclaration",
            declarations: [
                {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: id
                    },
                    init: {
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
            ],
            kind: "var"
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
            func    = createFunDecl("$", [], "Obj");
        func.declarations[0].init.body.body[0].argument = primret;
        primreturns[prim] = primret;
        assumes.push(func);
    })

    var src = falafel(src, 
                { comment : true, tokens: true},
                function (node) {
                 
                  if (node.type === "Block" && Comments.isAssumesAnnotated(node.value)) {
                    extractAssumes(node.value)
                  }
                  if (node.primitive) {
                    if (esp_isVarDeclarator(node))
                      primdefs[node.id.name] = node;
                    else if (esp_isAssignmentExp(node))
                      primdefs[node.left.name] = node;
                  }
                  /* TODO : adapt return object */

                  if (esp_isCallExp(node)) {
                    var anonf   = function_args(node);
                    var name    = esp_getCalledName(node);
                    var obj     = esp_isMemberExpression(node.callee) ? node.callee.object.name : false;
                    var primdef = obj ? primdefs[obj] : primdefs[name];
                    if (primitives.indexOf(name) >= 0 ) {
                        node.primitive = true;
                        if (esp_isExpStm(node.parent) || esp_isVarDecl(node.parent) || 
                            esp_isAssignmentExp(node.parent) || esp_isVarDeclarator(node.parent))
                            node.parent.primitive = name;
                    }
                    if (primdef) {
                        var primret = primreturns[primdef.primitive];
                        primret.properties.push( {
                            type : 'Property',
                            key :  name,
                            value : createFunExp([], '')
                        })
                    }
                    if (anonf.length > 0) {
                        node.arguments = node.arguments.map(function (arg) {
                            if (esp_isFunExp(arg)) {
                                var name = anonf_name + ++anonf_ct;
                                anonfs = anonfs.concat(createFunction(arg, name));
                                decl = decl.concat(createDeclaration(name));
                                calls = calls.concat(createCall(name));     
                                return createIdentifier(name);
                            }
                            else 
                                return arg
                        })
                    }
                }
            }).toString();
   

    anonfs.map(function (func) {
        src = escodegen.generate(func).concat(src)
    })

    decl.map(function (decl) {
        src = escodegen.generate(decl).concat(src)
    })

    calls.map(function (call) {
        src = escodegen.generate(call).concat(src)
    })

    assumes.map(function (assume) {
        src = escodegen.generate(assume).concat(src)
    })



    return  { 
        src        :   src,
        assumes    : assumes,
        primitives : primitives
    };
}