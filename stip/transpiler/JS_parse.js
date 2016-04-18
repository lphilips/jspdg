/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 *          Parse Utilities for target JavaScript                                                               *
 *                                                                                                              *   
 *                                                                                                              *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/

var JSParse = (function () {

    var toreturn = {};

    var createVarDecl = function (declarator) {
        return {
            type            : 'VariableDeclaration',
            declarations    : [ declarator ],
            leadingComment  : declarator.leadingComment,
            kind            : 'var'
        };
    };


    /*  Representation of a callback function :
     *    callback(errx, resx) {}
     */
    var callback = function (cnt) {
        return {  parsenode : {
                    type: "FunctionExpression",
                    id: null,
                    params: [
                        {
                            type: "Identifier",
                            name: "err"+cnt
                        },
                        {
                            type: "Identifier",
                            name: "res"+cnt
                        }
                    ],
                    defaults: [],
                    body: {
                        type: "BlockStatement",
                        body: []
                    },
                    rest: null,
                    generator: false,
                    expression: false
                  },
                  addBodyStm : function (stm) {
                    this.parsenode.body.body.push(stm);
                  },
                  addBodyStms : function (stms) {
                    this.parsenode.body.body = this.parsenode.body.body.concat(stms);
                  },
                  setBody    : function (body) {
                    this.parsenode.body.body = body
                  },
                  getBody    : function () {
                    return this.parsenode.body.body;
                  },
                  getResPar  : function () {
                    return this.parsenode.params[1];
                  },
                  getResParCnt : function () {
                    return cnt;
                  }
              };
    };

    /* Representation of a remote procedurecall:
     *   fname(args, callback(err, res) {})
     */

    var RPC = function (call, fname, args) {
      var callnode = Pdg.getCallExpression(call.parsenode),
          parsenode,
          callee;
      if (Aux.isMemberExpression(callnode.callee)) 
        callee =  callnode.callee;
      else
        callee = {
                  type: "Identifier",
                  name: fname
        };
      parsenode = {
                        callnode  : call,
                        type      : "ExpressionStatement",
                        expression: {
                            type: "CallExpression",
                            callee: callee,
                            arguments: args ? args : []
                        }
                    };
      Ast.augmentAst(parsenode);
      return {    parsenode  : parsenode,
                  addArg    : function (arg) {
                    this.parsenode.expression.arguments = this.parsenode.expression.arguments.concat(arg)
                  },
                  replaceArg : function (prev, arg) {
                    for (var i = 0; i < this.parsenode.expression.arguments.length; i++) {
                        var current = this.parsenode.expression.arguments[i];
                        if (current === prev) 
                            this.parsenode.expression.arguments[i] = arg;
                        else {
                          Aux.walkAst(current, {
                            pre : function (node) {
                              var parent = Ast.parent(node, parsenode);
                              
                              if (parent) {
                                Ast.augmentAst(parent); Ast.augmentAst(current);
                                if (parent.equals(current)) {
                                  if (Aux.isBinExp(parent) && parent.left.equals(prev)) {
                                    parent.left = arg;
                                  }
                                  else if (Aux.isBinExp(parent) && parent.right.equals(prev)) {
                                    parent.right = arg;
                                  }
                                }
                              }
                            }
                          })
                        }
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
                },
                getArguments : function () {
                    return this.parsenode.expression.arguments;
                }
            };
    };

    var RPCReturn = function (RPC) {
         return {
                parsenode  : 
                    {   callnode  : RPC.parsenode.callnode,
                        type      : "ReturnStatement",
                        argument  : RPC.parsenode.expression,
                        cont      : RPC.parsenode.cont 
                    },
              isRPC     : true,
              addArg    : function (arg) {
                RPC.addArg(arg);
              },
              replaceArg : function (prev, arg) {
                RPC.replaceArg(prev, arg);
              },
              setCallback : function (cb) {
                this.callback = cb;
                RPC.setCallback(cb);
              },
              updateCallback : function (cb) {
                RPC.updateCallback(cb);
              },
              setName : function (name) {
                RPC.setName(name);
              },
              getCallback : function () {
                return RPC.getCallback()
            }
        };
    };

    /* 
     * Representation of an async function (takes an extra argument callback)
     *   
     */

    var asyncFun = function () {
        return {
            parsenode :  {
                            type: "FunctionExpression",
                            id: null,
                            params: [],
                            defaults: [],
                            body: {
                                type: "BlockStatement",
                                body: []
                            },
                            rest: null,
                            generator: false,
                            expression: false
            }, 

            setBody : function (body) {
                this.parsenode.body.body = body 
            }, 

            addParams : function (params) {
                this.parsenode.params = params;
            },

            setName : function (name) {
              this.parsenode.id = {
                                "type": "Identifier",
                                "name": name
                            }
            }
        };
    };

    var funDecl = function (f) {
      return {
          type: "FunctionDeclaration",
          id: f.id,
          params: f.params,
          defaults: [],
          body: f.body,
          generator: false,
          expression: false
        };
    };

    var jsRPCAddCb = function (rpc, cb) {
        rpc.expression.arguments = rpc.expression.arguments.concat(cb)
    };

    var createReturnStm = function (arg) {
        return {
            type: "ReturnStatement",
            argument: arg
        };
    };

    var createCallCb = function (name, err, res) {
      return {

              type: "CallExpression",
              callee: {
                    type: "Identifier",
                    name: name
                },
              arguments: res ? [
                    err,
                    res
                ] : [ err ]
            }
    };


    toreturn.callback        = callback;
    toreturn.RPC             = RPC;
    toreturn.RPCReturn       = RPCReturn;
    toreturn.asyncFun        = asyncFun;
    toreturn.createVarDecl   = createVarDecl;
    toreturn.createFunDecl   = funDecl;
    toreturn.createReturnStm = createReturnStm;
    toreturn.createCallCb    = createCallCb;

    if (typeof module !== 'undefined' && module.exports != null) {
        esprima         = require('../lib/esprima.js');
        Aux             = require('../aux.js').Aux;
        exports.JSParse = toreturn;
    }

    return toreturn;

})();