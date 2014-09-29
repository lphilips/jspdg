
/* METEOR REMOTE PROCEDURE CALL */
var meteor_methodsP = function() {
	return {
            "type": "ExpressionStatement",
            "expression": {
                "type": "CallExpression",
                "callee": {
                    "type": "MemberExpression",
                    "computed": false,
                    "object": {
                        "type": "Identifier",
                        "name": "Meteor"
                    },
                    "property": {
                        "type": "Identifier",
                        "name": "methods"
                    }
                },
                "arguments": []
            }
         }
}

var meteor_functionP = function () {
	return  {
                "type": "ObjectExpression",
                "properties": [
                    {
                        "type": "Property",
                        "key": {
                        	"type": "Literal",
                        	// Name must be set by vardecl
                        	"value": "",
                    	},
                		"value": {
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
                	"kind": "init"
                 }
            ]
          };
}

var meteor_callP = function () {
	return  {
            "type": "ExpressionStatement",
            "expression": {
                "type": "CallExpression",
                "callee": {
                    "type": "MemberExpression",
                    "computed": false,
                    "object": {
                        "type": "Identifier",
                        "name": "Meteor"
                    },
                    "property": {
                        "type": "Identifier",
                        "name": "call"
                    }
                },
                "arguments": [
                    {
                        "type": "Literal",
                        "value": ""
                    }]
            }
        };
}

var meteor_callbackP = function() {
	return {
            "type": "FunctionExpression",
             "id": null,
             "params": [
                {
                    "type": "Identifier",
                     "name": "err"
                },
                {
                    "type": "Identifier",
                     "name": "res"
                }
            ],
            "defaults": [],
            "body": {
            	"type": "BlockStatement",
            	"body": [
                	{
                	"type": "VariableDeclaration",
                	"declarations": [
                    	{
                        	"type": "VariableDeclarator",
                        	"id": {
                            	"type": "Identifier",
                            	"name": ""
                    		},
                  			"init": {
                            	"type": "Identifier",
                             	"name": "res"
                        	}
                     	}
             		],
                "kind": "var"
                }
            ]
        }
     };
}

var meteor_callbackReturnP = function (callback, expression, toreplace, originalexp, cnt) {
	// Change expression
	var r_idxs = toreplace.parsenode.range[0],
		r_idxe = toreplace.parsenode.range[1],
		e_idxs = expression.parsenode.range[0],
		e_idxe = expression.parsenode.range[1],
		e_str  = escodegen.generate(expression.parsenode);

    if(originalexp.length !== e_str.length) {
        var diff = originalexp.length - e_str.length;
        r_idxs = r_idxs - diff;
        r_idxe = r_idxe - diff;
    }
	var	newexp = e_str.slice(0,r_idxs-e_idxs) + "res" + cnt + e_str.slice(r_idxe + 1 - e_idxs),
		parsed = esprima.parse(newexp)["body"][0]["expression"];
    parsed.range = [e_idxs, e_idxs + newexp.length];
	// Put the new expression as first statement in body of callback
	callback.body.body[0].declarations[0].init = parsed;
    return parsed;
}


/* PRIMITIVES TRANSFORMATION    */

/* READ(ID)                    
 * TODO = currently doesn't use Meteor's templating features
 */
var meteor_readP = function (id) {
   return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "read"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ReturnStatement",
                                    "argument": {
                                        "type": "MemberExpression",
                                        "computed": false,
                                        "object": {
                                            "type": "CallExpression",
                                            "callee": {
                                                "type": "MemberExpression",
                                                "computed": false,
                                                "object": {
                                                    "type": "Identifier",
                                                    "name": "document"
                                                },
                                                "property": {
                                                    "type": "Identifier",
                                                    "name": "getElementById"
                                                }
                                            },
                                            "arguments": [
                                                {
                                                    "type": "Identifier",
                                                    "name": "id"
                                                }
                                            ]
                                        },
                                        "property": {
                                            "type": "Identifier",
                                            "name": "innerHTML"
                                        }
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }], 
                "kind": "var"
        }
}

/* PRINT(toprint, id)           */

var meteor_printP = function() {
    return   {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "print"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            },
                            {
                                "type": "Identifier",
                                "name": "str"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "AssignmentExpression",
                                        "operator": "=",
                                        "left": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "CallExpression",
                                                "callee": {
                                                    "type": "MemberExpression",
                                                    "computed": false,
                                                    "object": {
                                                        "type": "Identifier",
                                                        "name": "document"
                                                    },
                                                    "property": {
                                                        "type": "Identifier",
                                                        "name": "getElementById"
                                                    }
                                                },
                                                "arguments": [
                                                    {
                                                        "type": "Identifier",
                                                        "name": "id"
                                                    }
                                                ]
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "innerHTML"
                                            }
                                        },
                                        "right": {
                                            "type": "Identifier",
                                            "name": "str"
                                        }
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }],
                 "kind": "var"
        }
}

/* INSTALLL(id, event, fn) */
var meteor_installLP = function() {
    return     {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "installL"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "id"
                            },
                            {
                                "type": "Identifier",
                                "name": "event"
                            },
                            {
                                "type": "Identifier",
                                "name": "fn"
                            }
                        ],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "CallExpression",
                                                "callee": {
                                                    "type": "MemberExpression",
                                                    "computed": false,
                                                    "object": {
                                                        "type": "Identifier",
                                                        "name": "document"
                                                    },
                                                    "property": {
                                                        "type": "Identifier",
                                                        "name": "getElementById"
                                                    }
                                                },
                                                "arguments": [
                                                    {
                                                        "type": "Identifier",
                                                        "name": "id"
                                                    }
                                                ]
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "addEventListener"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Literal",
                                                "value": "click"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "fn"
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }],
                 "kind": "var"
        }
}

/* BROADCAST(ID, data)          */
var meteor_broadcastP = function() {
  return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "broadcast"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "stream"
                            },
                            {
                                "type": "Identifier",
                                "name": "msg"
                            },
                            {
                                "type": "Identifier",
                                "name": "data"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "Identifier",
                                                "name": "stream"
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "emit"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Identifier",
                                                "name": "msg"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "data"
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }
            ],
            "kind": "var"
        }
}

var meteor_make_streamP = function(name) {
    return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": name + 'stream'
                    },
                    "init": {
                        "type": "NewExpression",
                        "callee": {
                            "type": "MemberExpression",
                            "computed": false,
                            "object": {
                                "type": "Identifier",
                                "name": "Meteor"
                            },
                            "property": {
                                "type": "Identifier",
                                "name": "Stream"
                            }
                        },
                        "arguments": [
                            {
                                "type": "Literal",
                                "value": name,
                            }
                        ]
                    }
                }
            ],
            "kind": "var"
        }
}

/* SUBSCRIBE(ID, callback)      */
var meteor_subscribeP = function() {
  return {
            "type": "VariableDeclaration",
            "declarations": [
                {
                    "type": "VariableDeclarator",
                    "id": {
                        "type": "Identifier",
                        "name": "subscribe"
                    },
                    "init": {
                        "type": "FunctionExpression",
                        "id": null,
                        "params": [
                            {
                                "type": "Identifier",
                                "name": "stream"
                            },
                            {
                                "type": "Identifier",
                                "name": "msg"
                            },
                            {
                                "type": "Identifier",
                                "name": "fn"
                            }
                        ],
                        "defaults": [],
                        "body": {
                            "type": "BlockStatement",
                            "body": [
                                {
                                    "type": "ExpressionStatement",
                                    "expression": {
                                        "type": "CallExpression",
                                        "callee": {
                                            "type": "MemberExpression",
                                            "computed": false,
                                            "object": {
                                                "type": "Identifier",
                                                "name": "stream"
                                            },
                                            "property": {
                                                "type": "Identifier",
                                                "name": "on"
                                            }
                                        },
                                        "arguments": [
                                            {
                                                "type": "Identifier",
                                                "name": "msg"
                                            },
                                            {
                                                "type": "Identifier",
                                                "name": "fn"
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                        "rest": null,
                        "generator": false,
                        "expression": false
                    }
                }
            ],
            "kind": "var"
        }
}


