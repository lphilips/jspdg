/* Gets the ast and an array of strings, which represent names of functions
   that are used as callback functions on the client side.
   Calls for these functions are automatically added in the client side block.
*/
var pre_analyse = function (ast, toGenerate) {

    var Ast = require('../jipda-pdg/ast.js').Ast;
    var Aux = require('./aux.js');
    var node  = require('./pdg/node.js');
    var Comments = require('./annotations.js');
    var estraverse = require('./lib/estraverse.js');
    var Handler = require('./handler.js').Handler;

    var js_libs = require('./jslibs.js');
    var DNODES  = node.DNODES;


    var anonf_ct    = 0;
    var anonf_name  = 'anonf';
    var primitives  = ["$", "console", "window", "Math"];
    var asyncs      = ["https", "dns", "fs", "proxy"];
    var arrayprims  = ["filter", "count", "push", "search", "length", "map", "append", "concat", "forEach", "slice", "find", "sort"];
    var anonfSh     = [];
    var callSh      = [];
    var imports     = [];
    var importsAdd  = {};
    var fundefs     = [];
    var sharedblock;
    var generatedIdentifiers = {};
    var callbacksadded = false;


    function function_args (callnode) {
        return callnode.arguments.filter(function (arg) {
            return Aux.isFunExp(arg) ||
                   (Aux.isIdentifier(arg) && fundefs[arg.name]);
        });
    }

    function createIdentifier (id) {
        var identifier = {type:'Identifier', name:id};
        Ast.augmentAst(identifier);
        return identifier;
    }

    function createDeclaration  (id) {
        return { type:'VariableDeclaration',
                declarations: [{
                    type:'VariableDeclarator',
                    id: createIdentifier(id),
                    init: null
                }],
                kind:'var'
            };
    }

    function createAssignment  (id, value) {
        return {
            type: 'ExpressionStatement',
            expression : {
                type : 'AssignmentExpression',
                operator : '=',
                left : id,
                right : value
            }
        };
    }

    function createFunction  (arg, id) {
        return {
            type:"ExpressionStatement",
            expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: createIdentifier(id),
                right: arg
            }
        };
    }

    function createReturnValue  (type) {
        switch (type) {
            case "Num":
                return  {
                            type: "Literal",
                            value: 0
                        };
            case "String":
                return  {
                            type: "Literal",
                            value: ""
                        };
            case "Bool":
                return  {
                            type: "Literal",
                            value: true
                        };
            case "Obj":
                return {
                            type: "ObjectExpression",
                            properties: []
                       };
            default:
                return null;
            }

    }

    function createFunExp  (args, returntype) {
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

    function createFunDecl (id, args, returntype) {
        var fundecl =  {
            type: "FunctionDeclaration",
            id: {
                type: "Identifier",
                name: id
            },
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
        Ast.augmentAst(fundecl);
        return fundecl;
    }

    function createCall (id) {
        var call = {
            type: "ExpressionStatement",
            expression: {
                type: "CallExpression",
                callee: createIdentifier(id),
                arguments: [],
                isPreAnalyse: true
            }
        };
        Ast.augmentAst(call);
        return call;
    }




    function createObjectArgument () {
        var object = {type: "ObjectExpression", properties: []};
        Ast.augmentAst(object);
        return {
            object : object,
            addProperty : function (identifier, value) {
                if (!object.properties.find(function (p) {return p.key.name === identifier.name}))
                    object.properties.push({
                        type: "Property",
                        key: identifier,
                        value: value,
                        computed: false,
                        kind: "init"
                    })
            },
            hasProperties : function () {
                return object.properties.length > 0;
            }
        }
    }

    /* Gets annotation of form '@require [library library]' */
    function extractImports (string) {
        var regexp = /\[.*?\]/,
            assumesS, assumesA;
        if (string.search(regexp) >= 0) {
            assumesS = string.match(regexp)[0].slice(1,-1);
            assumesA = assumesS.split(" ");
            return assumesA;
        }
    };


    var comments;
    function getComments (node) {
        if (!comments) {
            var parent = node;
            while (!Aux.isProgram(parent)) {
                parent = Ast.parent(parent, ast);
            }
            comments =  parent.comments;
        }
        return comments;
    }

    function isBlockAnnotated (node) {
       var parent = node,
            annotation;
        while(!Aux.isProgram(parent)) {
            if (Aux.isBlockStm(parent) && parent.leadingComment) {
                break;
            }
            parent = Ast.parent(parent, ast);
        }
        if (Aux.isBlockStm(parent)) {
            return parent.leadingComment;
        }
        return;
    }

    function getCurrentBlock (node) {
        var parent = node;
        while(!Aux.isProgram(parent)) {
            if (Aux.isBlockStm(parent)) {
                break;
            }
            parent = Ast.parent(parent, ast);
        }
        return parent;
    }


    function generateCallbackCalls() {
        var calls = [];
        toGenerate.methodCalls.map(function (cb) {
            var call = createCall(cb);
            var func = fundefs[cb];
            var objectarg = createObjectArgument();


            call.leadingComment = {type: "Block", value:"@generated", range: [0,16]};
            call.clientCalls = 1;

            if (func) {
                func.params.map(function (param) {
                    Aux.walkAst(func.body, {
                        pre: function (node) {
                            var parent = Ast.parent(node, ast);
                            if (Aux.isCallExp(node) && Aux.isMemberExpression(node.callee) &&
                                Aux.isIdentifier(node.callee.object) && param.name == node.callee.object.name) {
                                objectarg.addProperty(node.callee.property, createFunExp([], false));
                            }
                            else if (Aux.isMemberExpression(node) && Aux.isIdentifier(node.property) &&
                                !(Aux.isCallExp(parent) && parent.callee.equals(node))) {
                                objectarg.addProperty(node.property, {type: "Literal",value: null});
                            }
                        }
                    });
                    if (objectarg.hasProperties()) {
                        Ast.augmentAst(objectarg.object);
                        call.expression.arguments.push(objectarg.object);
                        objectarg = createObjectArgument();
                    }


                    else
                        call.expression.arguments = call.expression.arguments.concat({
                            type: "Literal",
                            value: null
                        });
                });
                Ast.augmentAst(call);
                calls.push(call);
            }
        });

        return calls;
    }


    function generateIdentifiers() {
        var identifiers = [];
        toGenerate.identifiers.map(function (name) {
            var id = createIdentifier(name);
            id.leadingComment = {type: "Block", value:"@generated", range: [0,16]};
            Ast.augmentAst(id);
            generatedIdentifiers[name] = id;
            identifiers.push(id);
        });
        return identifiers;
    }


    estraverse.replace(ast, {
        enter: function (node, parent) {

            if (Aux.isVarDecl(node) && Comments.isDefineHandlerAnnotated(parent)) {

                node.declarations.map(function (el) {
                    if (Aux.isObjExp(el.init)) {
                        Handler.Transform.handlerDefinition(el);
                    }
                });

                this.remove();
            }

        },
        leave: function (node, parent) {
            
            if (Aux.isBlockStm(node) && Comments.isDefineHandlerAnnotated(node))
                this.remove();
        }
    });   


    Aux.walkAst(ast, {

        pre: function (node) {
            /* Needs to be done upfront */
            if (Aux.isFunDecl(node)) {
                var block = getCurrentBlock(node);
                var comment = block.leadingComment;
               // if (comment && Comments.isClientAnnotated(comment)) {
                    fundefs[node.id.name] = node;
                /*}
                if (comment && Comments.isSliceAnnotated(block) &&
                    Comments.getSliceName(comment) === DNODES.CLIENT ) {
                    fundefs[node.id.name] = node;
                }*/

            }
        },

        post: function (node) {

            getComments(node);


            /* @import annotation */
            if (node.leadingComment && Comments.isImportAnnotated(node.leadingComment)) {
                imports = extractImports(node.leadingComment.value);
            }

            /* If a block has updateFirst and/or updateLast property,
               these statements should be added in the beginning / ending of the block */
            if (Aux.isBlockStm(node) || Aux.isProgram(node)) {
                var comment = node.leadingComment;

                if (comment && Comments.isSharedAnnotated(comment)) {
                    sharedblock = node;
                    return;
                }

                if (node.updateFirst) {
                    node.body = node.body.slice(0, node.latestHoistIndex-1)
                                .concat(node.updateFirst)
                                .concat(node.body.slice(node.latestHoistIndex-1));
                }
                if (node.updateLast) {
                    node.body = node.body.concat(node.updateLast);
                }

                if (comment && Comments.isClientAnnotated(comment)) {
                    node.body = node.body.concat(generateCallbackCalls());
                    node.body = node.body.concat(generateIdentifiers());
                    callbacksadded = true;
                }
            }

            /* If a node is tagged as primitive, add it to the primitive definitions.
               This causes later accesses to the primitive (such as element.jquerymethod())
               to be added to e.g. the jquery primitive */
           /* if (node.primitive) {
                if (Aux.isVarDeclarator(node)) {
                  primdefs[node.id.name] = node;
                }
                else if (Aux.isAssignmentExp(node)) {
                  primdefs[node.left.name] = node;
                }
            }*/

            if (Aux.isMemberExpression(node) && !node.primitive &&
              !Aux.isThisExpression(node.object)) {

                var objname;
                name = node.property.name;
                if (Aux.isCallExp(node.object)) {
                    objname = node.object.callee.name;
                }
                else {
                    objname = node.object.name;
                }
                if (imports[objname]) {
                    importsAdd[objname] ? importsAdd[objname].push(name) : importsAdd[objname] = [name] ;

                }
            }


            if (Aux.isCallExp(node)) {

                var name    = Aux.getCalledName(node);
                var anonf   = function_args(node);
                var obj     = Aux.isMemberExpression(node.callee) ? node.callee.object.name : false;

                if (primitives.indexOf(name) >= 0 ) {
                    node.primitive = true;
                    node._parent = Ast.parent(node, ast);
                    if (Aux.isExpStm(node._parent) || Aux.isVarDecl(node._parent) ||
                        Aux.isAssignmentExp(node._parent) || Aux.isVarDeclarator(node._parent)) {
                        node._parent.primitive = name;
                    }

                }
                if (anonf.length > 0) {
                    var enclBlock  = getCurrentBlock(node);
                    var bodyFirst  = [];
                    var bodyLast   = [];
                    comment = isBlockAnnotated(node);
                    node.arguments = node.arguments.map(function (arg) {
                        comment = isBlockAnnotated(arg);
                        var objectarg = createObjectArgument();
                        if (Aux.isFunExp(arg)) {
                            name = anonf_name + ++anonf_ct;
                            var func = createFunDecl(name, arg.params);
                            var call = createCall(name);

                            func.generated = true;
                            func._generatedFor = node;

                            call.leadingComment = {type: "Block", value:"@generated", range: [0,16]};
                            if (comment && Comments.isClientAnnotated(comment)) {
                                call.clientCalls = 1;
                            }
                            else if (comment && Comments.isServerAnnotated(comment)) {
                                call.serverCalls = 1;
                            }
                            func.body = arg.body;
                            func.params.map(function (param) {
                                /* Are parameters used in body as object? 
                                   Call it with an object literal that has those properties */
                                Aux.walkAst(func.body, {
                                    pre: function (node) {
                                        var parent = Ast.parent(node, ast);
                                        if (Aux.isCallExp(node) && Aux.isMemberExpression(node.callee) &&
                                            Aux.isIdentifier(node.callee.object) && param.name == node.callee.object.name) {
                                            objectarg.addProperty(node.callee.property, createFunExp([], false));
                                        }
                                        else if (Aux.isMemberExpression(node) && Aux.isIdentifier(node.property) &&
                                            !(Aux.isCallExp(parent) && parent.callee.equals(node))) {
                                            objectarg.addProperty(node.property, {type: "Literal",value: null});
                                        }
                                    }
                                });
                                if (objectarg.hasProperties()) {
                                    Ast.augmentAst(objectarg.object);
                                    call.expression.arguments.push(objectarg.object);
                                    objectarg = createObjectArgument();
                                }
                                else {
                                    call.expression.arguments = call.expression.arguments.concat({
                                        type: "Literal",
                                        value: null
                                    });
                                }
                            });

                            Ast.augmentAst(func);
                            bodyFirst.push(func);
                           // if (arrayprims.indexOf(Aux.getCalledName(node)) < 0)
                                bodyLast.push(call);
                            return createIdentifier(name);
                        }
                        else if (Aux.isIdentifier(arg) && fundefs[arg.name]) {
                            call = createCall(arg.name);
                            func = fundefs[arg.name];
                            if (func)
                                Aux.walkAst(func.body, {
                                    pre: function (node) {
                                        var parent = Ast.parent(node, ast);
                                        if (Aux.isCallExp(node) && Aux.isMemberExpression(node.callee) &&
                                            Aux.isIdentifier(node.callee.object) && arg.name == node.callee.object.name) {
                                            objectarg.addProperty(node.callee.property, createFunExp([], false));
                                        }
                                        else if (Aux.isMemberExpression(node) && Aux.isIdentifier(node.property) &&
                                            !(Aux.isCallExp(parent) && parent.callee.equals(node))) {
                                            objectarg.addProperty(node.property, {type: "Literal",value: null});
                                        }
                                    }
                                });
                            if (objectarg.hasProperties()) {
                                Ast.augmentAst(objectarg.object);
                                call.expression.arguments.push(objectarg.object);
                                objectarg = createObjectArgument();
                            }
                            else {
                                call.expression.arguments = call.expression.arguments.concat({
                                    type: "Literal",
                                    value: null
                                });
                            }

                            call.leadingComment = {type: "Block", value:"@generated"};
                            if (comment && Comments.isClientAnnotated(comment)) {
                                call.clientCalls = 1;
                            }
                            else if (comment && Comments.isServerAnnotated(comment)) {
                                call.serverCalls = 1;
                            }
                            if (arrayprims.indexOf(Aux.getCalledName(node)) < 0);
                                bodyLast = bodyLast.concat(call);
                            return arg;
                        }
                        else {
                            return arg;
                        }
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

    if (toGenerate.methodCalls.length > 0 && !callbacksadded) {
        var slice = {type: "BlockStatement", body: []};
        slice.body = slice.body.concat(generateCallbackCalls());
        slice.body = slice.body.concat(generateIdentifiers());
        slice.leadingComment = {type: "Block", value:"@slice generated"};
        Ast.augmentAst(slice);
        ast.body.push(slice);
    }


    return  {
        ast         : ast,
        assumes     : js_libs.getLibraries(),
        shared      : sharedblock,
        imports     : imports,
        primitives  : primitives,
        asyncs      :  asyncs,
        identifiers : generatedIdentifiers
    };
};


exports.pre_analyse = pre_analyse;
exports.asyncs      = ["https", "dns", "fs", "proxy"];
global.pre_analyse = pre_analyse;
global.asyncs = ["https", "dns", "fs", "proxy"];