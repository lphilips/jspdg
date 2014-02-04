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

var meteor_callbackReturnP = function(callback,expression,toreplace) {
	// Change expression
	var r_idxs = toreplace.parsenode.range[0],
		r_idxe = toreplace.parsenode.range[1],
		e_idxs = expression.parsenode.range[0],
		e_idxe = expression.parsenode.range[1],
		e_str = expression.parsenode.toString(),
		newexp = e_str.slice(0,r_idxs-e_idxs) + "res" + e_str.slice(r_idxe+1 - e_idxs),
		parsed = esprima.parse(newexp)["body"][0]["expression"];
	// Put the new expression as first statement in body of callback
	callback["body"]["body"][0]["declarations"][0]["init"] = parsed;
}