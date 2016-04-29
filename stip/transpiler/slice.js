var CodeGenerator = (function () {

        var toreturn = {};

        var toCode = function (option, nodes, node, ast) {
            switch (option.target) {
                case 'normal':
                    return Transpiler.transpile(Transpiler.createTranspileObject(node, nodes, ast, option, JSify, [], []));
                    //return Meteorify.transpile(slicednodes, node, ast)
                case 'node.js':
                    return Transpiler.transpile(Transpiler.createTranspileObject(node, nodes, ast, option, Nodeify, [], []));
            }
        }

        var addPrimitives = function (option) {
            switch (option) {
                case 'normal':
                    // TODO'
                    return [];
                case 'meteor':
                    return meteorPrimitives();
            }
        }

        var addCloseUp = function (option, transpiled) {
            switch (option.target) {
                case 'node.js':
                    if(option.tier === 'server')
                        transpiled.closeup = transpiled.closeup.concat(NodeParse.createServerCloseUp());
            }
            return transpiled;
        }

        var addSetUp = function (option, transpiled) {
            switch (option.target) {
                case 'node.js':
                    if(option.tier === 'client')
                        transpiled.setup = transpiled.setup.concat(NodeParse.createClient());
                    else
                        transpiled.setup = transpiled.setup.concat(NodeParse.createServer());
            }
            return transpiled;
        }

        /*
         * Transformation needed on the body code
         */
        var transformBody = function (option, transpiled, body, methods) {
            switch (option.target) {
                case 'node.js':
                    var methodsDecl;
                    var methodsProp;
                    if (option.tier === 'client') {
                        methodsDecl = NodeParse.methodsClient();
                        methodsProp = methodsDecl.expression.arguments[0].properties
                        methodsDecl.expression.arguments[0].properties = methodsProp.concat(methods);
                        /* Add cloud types declarations */
                        for(var name in  transpiled.cloudtypes) {
                            if(transpiled.cloudtypes.hasOwnProperty(name)) {
                                var cloudtype = transpiled.cloudtypes[name];
                                body = [cloudtype.declarationC].concat(body);
                            }
                        }

                        return body.concat(methodsDecl);
                    }
                    else {
                        /* server rpcs + cloudtypes are added */
                        methodsDecl = NodeParse.methodsServer();
                        methodsProp = methodsDecl.expression.arguments[0].properties;
                        methodsDecl.expression.arguments[0].properties = methodsProp.concat(methods);

                        /* Declare cloud types + add their declarations as well (for use on server side as well) */
                        for(var name in transpiled.cloudtypes) {
                            if(transpiled.cloudtypes.hasOwnProperty(name)) {
                                var cloudtype = transpiled.cloudtypes[name];
                                body = [cloudtype.declarationS].concat(cloudtype.declarationC).concat(body);
                            }
                        }

                        return body.concat(methodsDecl);
                    }
                case 'meteor':
                    if (option.tier === 'server') {
                        /* remote procedure definitions are added */
                        var methodsDecl = MeteorParse.methodsServer();
                        methodsDecl.expression.arguments = methods;

                        return body.concat(methodsDecl);
                    }
                    if (option.tier === 'client') {
                        /* remote procedure definitions are added */
                        var methodsDecl = MeteorParse.methodsClient();
                        methodsDecl.expression.arguments = methods;

                        return body.concat(methodsDecl);
                    }
            }
            return body;
        }

        /* 
         * Starting from a set of nodes, create the corresponding transformed code.
         * This function also adds header and footer code, depending on the choosen output
         */
        var constructProgram = function (nodes, option, ast) {
            var createProgram = function (body) { 
                    return {
                        'type' : 'Program',
                        'body' : body ? body : [] 
                        };
                    },
                program = createProgram(),
                nosetup = createProgram(),
                methods = [],
                transpiled;

            //program.body = addPrimitives(option);
            while (nodes.length > 0) {
                var n = nodes.shift();
                if(n.parsenode) {
                    transpiled = toCode(option, nodes, n, ast);
                    if(transpiled.transpiledNode) {
                        if (Aux.isBlockStm(transpiled.transpiledNode) &&
                            (Comments.isTierAnnotated(transpiled.transpiledNode) ||
                                transpiled.transpiledNode.leadingComment && Comments.isBlockingAnnotated(transpiled.transpiledNode.leadingComment)))

                            program.body = program.body
                                        .concat(transpiled.setupNode)
                                        .concat(transpiled.transpiledNode.body)
                                        .concat(transpiled.closeupNode);
                        else
                            program.body = program.body.concat(transpiled.getTransformed());
                    }
                    nodes = transpiled.nodes;  
                    nodes.remove(n);
                    option.cloudtypes = transpiled.cloudtypes;
                    methods = methods.concat(transpiled.methods);
                }
            };

            addSetUp(option, transpiled);
            addCloseUp(option, transpiled);
            program.body = transformBody(option, transpiled, program.body, methods);
            nosetup.body = program.body;
            program.body = transpiled.setup.concat(program.body).concat(transpiled.closeup);
            //console.log(program);

            if (option.tier === 'client') {
                program.cloudtypes = transpiled.cloudtypes;
            }

            return {
                program : program,
                setup   : createProgram(transpiled.setup),
                nosetup : nosetup
            }
        }

        var setUpContains = function (sliced, name) {

            return sliced.setup.filter(function (pars) {
                
                return pars.type === "VariableDeclaration" &&
                    pars.declarations[0].id.name === name;
            }).length > 0;
        };


        toreturn.transpile = constructProgram;

        if (typeof module !== 'undefined' && module.exports != null) {
            Nodeify = require('./Nodeify.js').Nodeify;
            JSify   = require('./JSify.js').JSify;
            Transpiler = require('./transpiler.js').Transpiler;
            exports.CodeGenerator = toreturn;
        }

        return toreturn;



})();
