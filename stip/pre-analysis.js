var pre_analyse = function(src) {
	var anonf_ct = 0;
	var anonf_name = 'anonf';
	var anonfs = [];
	var decl = [];
	var calls = [];

	var function_args = function(callnode) {
		return callnode.arguments.filter(function (arg) {
			return arg.type === "FunctionExpression"
		}) 
	}
 	
 	var createIdentifier = function(id) {
 		return {type:'Identifier', name:id};
 	}
 	var createDeclaration = function(arg, id) {
 		return { type:'VariableDeclaration', 
 				declarations: [{
 					type:'VariableDeclarator',
 					id: createIdentifier(id),
 					init: null
 				}],
 				kind:'var'
 			}
 	}

 	var createFunction = function(arg, id) {
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

 	var createCall = function(id) {
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

	return [falafel(src, function (node) {
		if (node.type === "CallExpression") {
			var anonf = function_args(node);
			if(anonf.length > 0) {
				node.arguments = node.arguments.map(function(arg) {
					if(arg.type === "FunctionExpression") {
						var name = anonf_name + ++anonf_ct;
						anonfs = anonfs.concat(createFunction(arg,name));
						decl = decl.concat(createDeclaration(arg,name));
						calls = calls.concat(createCall(name)); 	
						return createIdentifier(name);

					}
					else 
						return arg
				})
			}
		}
	}), anonfs, decl, calls];
}