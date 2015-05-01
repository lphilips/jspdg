/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 *          Parse Utilities for target JavaScript                                                               *
 *                                                                                                              *   
 *                                                                                                              *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/

var JSParse = (function () {

    var module = {};

    var createVarDecl = function (declarator) {
        return {
            type            : 'VariableDeclaration',
            declarations    : [ declarator ],
            kind            : 'var'
        }
    }


    /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt) {
        return {  parsenode : {
                    "type": "FunctionExpression",
                    "id": null,
                    "params": [
                        {
                            "type": "Identifier",
                            "name": "err"+cnt
                        },
                        {
                            "type": "Identifier",
                            "name": "res"+cnt
                        }
                    ],
                    "defaults": [],
                    "body": {
                        "type": "BlockStatement",
                        "body": []
                    },
                    "rest": null,
                    "generator": false,
                    "expression": false
                  },
                  addBodyStm : function (stm) {
                    this.parsenode.body.body = this.parsenode.body.body.concat(stm)
                  },
                  setBody    : function (body) {
                    this.parsenode.body.body = body
                  },
                  getBody    : function () {
                    return this.parsenode.body.body;
                  },
                  getResPar  : function () {
                    return this.parsenode.params[1];
                  }
                }
    }

    /* Representation of a remote procedurecall:
     *   fname(args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
        return { parsenode  : {
                        "callnode"  : call,
                        "type"      : "ExpressionStatement",
                        "expression": {
                            "type": "CallExpression",
                            "callee": {
                                "type": "Identifier",
                                "name": fname
                            },
                            "arguments": args ? args : []
                        }
                    },
                  addArg    : function (arg) {
                    this.parsenode.expression.arguments = this.parsenode.expression.arguments.concat(arg)
                  },
                  replaceArg : function (prev, arg) {
                    for (var i = 0; i < this.parsenode.expression.arguments.length; i++) {
                        var current = this.parsenode.expression.arguments[i];
                        if (current === prev) 
                            this.parsenode.expression.arguments[i] = arg;
                    }
                  },
                  isRPC     : true,
                  setCallback : function (cb) {
                    this.callback = cb;
                  },
                  updateCallback : function (cb) {
                    var argsp = this.parsenode.expression.arguments;
                    argsp[argsp.length-1] = cb.parsenode;
                    this.callback = cb;
                  },
                  setName : function (name) {
                    this.parsenode.expression.callee.name = name
                  },
                  getCallback : function () {
                    if (this.callback) 
                        return this.callback
                    else {
                        var argsp = this.parsenode.expression.arguments,
                            newcb = callback(0); /*  count does not matter */
                        newcb.parsenode = argsp[argsp.length-1]
                        return newcb
                    }
                  }
                }
    }

    /* 
     * Representation of an async function (takes an extra argument callback)
     *   
     */

    var asyncFun = function () {
        return {
            parsenode :  {
                            "type": "FunctionExpression",
                            "id": null,
                            "params": [],
                            "defaults": [],
                            "body": {
                                "type": "BlockStatement",
                                "body": []
                            },
                            "rest": null,
                            "generator": false,
                            "expression": false
            }, 

            setBody : function (body) {
                this.parsenode.body.body = body 
            }, 

            addParams : function (params) {
                this.parsenode.params = params;
            }
        }
    }


    var jsRPCAddCb = function (rpc, cb) {
        rpc.expression.arguments = rpc.expression.arguments.concat(cb)
    } 


    module.callback        = callback;
    module.RPC             = RPC;
    module.asyncFun        = asyncFun;
    module.createVarDecl   = createVarDecl;

    return module;

})();