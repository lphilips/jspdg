/****************************************************************
 *				 TRANSFORMATIONS FOR NODE.JS					*
 *																*
 *		- wait.for library in combination with zerorpc			*
 *																*
 ****************************************************************/


/* Variable Declaration */
var nodeifyVarDecl = function (sliced) {
  	var node 		= sliced.node,
  		slicedn 	= sliced.nodes,
  		entry 		= node.edges_out.filter(function(e) {
			return e.equalsType(EDGES.DATA) &&
	       	e.to.isEntryNode;
		}),
  		call 		= node.edges_out.filter(function(e) {
  			return e.equalsType(EDGES.CONTROL) &&
  			e.to.isCallNode;
  		});
  	/* Outgoing data dependency to entry node? -> function declaration */
	if(entry.length > 0) {
     	var f = toNode(new Sliced(slicedn,entry[0].to));
     	if(f.method) {
     		/* set the name of the method */
     		f.method.key = node.parsenode.declarations[0].id;
     		sliced.methods = sliced.methods.concat(f.method);
     	}
	 	node.parsenode.declarations.init = f.parsednode;
	 	slicedn = f.nodes;
	}
	/* outgoing dependency on call nodes?
	 * -> nodeify every call (possibly rpcs) */
	if(call.length > 0) {
		call.map(function (c) {
			var corig  = c.to.parsenode,
				cnode  = toNode(cloneSliced(sliced, slicedn ,c.to)),
				orig   = escodegen.generate(node.parsenode),
				transf = falafel(orig, function (n) {
					/* transform the original call node
					   if changes to it were made in cnode (rpc call)*/
					if( n.type === 'CallExpression' && 
					 	n.callee.name === c.to.name && 
					 	argumentsEqual(n.arguments, c.to.parsenode.arguments) && 
					 	corig !== cnode.parsednode) 
						n.update(escodegen.generate(cnode.parsednode));
				});
			node.parsenode = esprima.parse(transf.toString());
			slicedn = removeNode(cnode.nodes,c.to);

		})
	}
	sliced.nodes = slicedn;
	sliced.parsednode = node.parsenode;
	return sliced;
}

/* Function expression */
var nodeifyFunExp = function(sliced) {
	/* Formal parameters */
	var node 	  = sliced.node,
		slicedn   = sliced.nodes,
		form_ins  = node.getFormalIn(),
		form_outs = node.getFormalOut(),
	    parsenode = node.parsenode,
	    params    = parsenode.params,
	    scopeInfo = Ast.scopeInfo(parsenode),
	    parent 	  = Ast.hoist(scopeInfo).parent(parsenode, graphs.AST);
	/* Formal in parameters */
	if(form_ins.length > 0) {
		/* Remove parameters that are not in slicednodes */
		for(var i = 0; i < form_ins.length; i++) {
			var fp = form_ins[i],
			     p = params[i];
			if(!slicedContains(slicedn,fp)) {
				params.splice(i,1);
			}
			slicedn = slicedn.remove(fp);
		}
		parsenode.params = params;
	};
	/* Formal out parameters */
	form_outs.map(function(f_out) {
		slicedn = slicedn.remove(f_out)
	})
	/* Body */
	var body = [],
	    bodynodes = node.edges_out.filter(function (e) {
			return e.equalsType(EDGES.CONTROL) &&
			       e.to.isStatementNode || e.to.isCallNode;
	    }).map(function (e) { return e.to });

	/* nodeify every body node */
	bodynodes.map(function (n) {
		var bodynode = toNode(cloneSliced(sliced, slicedn, n));
		if(slicedContains(slicedn,n)) 
			body = body.concat(bodynode.parsednode);
		slicedn = removeNode(bodynode.nodes,n);
	});
	slicedn = slicedn.remove(node);
	parsenode.body.body = body;

	/* Should the function be transformed to rpc function? */ 
	if(node.isServerNode() && node.clientCalls > 0) {
		var method = nodeRemoteProc(),
			func   = escodegen.generate(parent);
		/* Return statement in body should be replaced by callback call */
		func = falafel(func, function (n) {
			// TODO check parent (don't transform return statement in nested function def)
			if (n.type === 'ReturnStatement') 
				/* First argument of callback is error */
				n.update('callback(null, ' + n.argument.source() + ')')
		})
		method.value.body.body = esprima.parse(func.toString()).body[0].expression.right.body.body;
		/* Parameters: callback should be added */
		method.value.params = parsenode.params.addLast({'type' : 'Identifier', 'name' : 'callback'});
		sliced.method = method;
	}

	sliced.nodes = slicedn;
	sliced.parsednode = parsenode;
	return sliced;
}


/*
 * CALL EXPRESSION:
 * 1: function defined on SERVER, called on SERVER -> no transformation
 * 2: function defined on SERVER, called on CLIENT -> transform to Meteor method call
 * 3: function defined on SERVER, called by BOTH   -> combination of previous cases
 * 4: function defined on CLIENT, called on CLIENT -> no transformation
 * 5: function defined on CLIENT, called on SERVER -> transform to Meteor method call (subhog package)
 * 6: function defined on CLIENT, called by BOTH   -> combination of previous cases
 */
var nodeifyCallExp = function (sliced) {
	var node 		= sliced.node,
		slicednodes = sliced.nodes,
		actual_ins  = node.getActualIn(),
		actual_outs = node.getActualOut(),	
		scopeInfo 	= Ast.scopeInfo(node.parsenode),
	    parent 		= Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST),
	    entryNode 	= node.getEntryNode()[0];
	actual_ins.map(function (a_in) {
		slicednodes = slicednodes.remove(a_in)
	})
	actual_outs.map(function (a_out) {
		slicednodes = slicednodes.remove(a_out)
	});

	if(isPrimitiveCall(node)) {
		return nodeifyPrimitive(sliced, actual_ins)
	}

	if (entryNode.isServerNode()) {
		/* CASE 2 */
		if (node.isClientNode()) {
			var parsenode = nodeCallServerf(),
				args	  = parsenode.arguments,
				call_ins  = actual_ins.map(function (a_in) {
								var call = a_in.edges_out.filter(function (e) {
									return e.to.isCallNode
								})
								return call.map(function (e) {return e.to});
							}).flatten();	

			/* Has arguments that are calls? */
			call_ins.map(function (call) {
				if(call) {
					var nodeified = toNode(cloneSliced(sliced, slicednodes, call));
					for(var i = 0; i < node.parsenode.arguments.length; i++) {
						var arg = node.parsenode.arguments[i];
						if(arg === call.parsenode) {
							node.parsenode.arguments[i] = nodeified.parsednode;
						}
					}
					slicednodes = removeNode(nodeified.nodes,call);
				}
			})

			/* Insert function name */
			args[0].value = node.parsenode.callee.name;
			parsenode.arguments = args.concat(node.parsenode.arguments);
			sliced.nodes = slicednodes;
			sliced.parsednode = parsenode;
			return sliced;

		}
	}
	else {
		var parsenode = nodeCallServerf(),
			args	  = parsenode.arguments,
			call_ins  = actual_ins.map(function (a_in) {
				var call = a_in.edges_out.filter(function (e) {
									return e.to.isCallNode
								})
							return call.map(function (e) {return e.to});
							}).flatten();	

			/* Has arguments that are calls? */
			call_ins.map(function (call) {
				if(call) {
					var nodeified = toNode(cloneSliced(sliced, slicednodes, call));
					for(var i = 0; i < node.parsenode.arguments.length; i++) {
						var arg = node.parsenode.arguments[i];
						if(arg === call.parsenode) {
							node.parsenode.arguments[i] = nodeified.parsednode;
						}
					}
					slicednodes = removeNode(nodeified.nodes,call);
				}
			})
	}
	if(parent.type === 'ExpressionStatement')
		sliced.parsednode = parent;
	else
		sliced.parsednode = node.parsenode;
	sliced.nodes = slicednodes;
	return sliced;
}

/* Currently same primitive implementations as meteor */
var nodeifyPrimitive = function (sliced, actual_ins) {
	var node 		= sliced.node,
		name 		= node.name,
		parsenode 	= node.parsenode,
		scopeInfo 	= Ast.scopeInfo(node.parsenode),
	    parent 		= Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST)

	switch (name) {
		case 'print':
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced, 'print'))
				sliced.setup = sliced.setup.concat(meteor_printP());
		case 'read':
			parent.expression = parsenode;
			if(!setUpContains(sliced,'read'))
			sliced.setup = sliced.setup.concat(meteor_readP());
		case 'installL':
				parent.expression = parsenode;
				sliced.parsednode = parent;
				if(!setUpContains(sliced,'installL'))
					sliced.setup = sliced.setup.concat(meteor_installLP());
		return sliced;
	}
}

/* Block statement */
var nodeifyBlockStm = function (sliced) {
	var body 	    = [],
		slicednodes = sliced.nodes,
		node 		= sliced.node,
		parsenode 	= node.parsenode,
	    bodynodes 	= node.edges_out.filter(function (e) {
		  return e.equalsType(EDGES.CONTROL)
			}).map(function (e) { return e.to });
	/* nodeify every body node */
	bodynodes.map(function (n) {
		var toSlice = cloneSliced(sliced, slicednodes, n);
		var bodynode = toNode(toSlice);
		if( slicedContains(slicednodes, n) ) {
				body = body.concat(bodynode.parsednode)
		}
		slicednodes = removeNode(bodynode.nodes,n);	
		sliced.methods = bodynode.methods;
		});
	slicednodes = slicednodes.remove(node);
	parsenode.body = body;
	sliced.nodes = slicednodes;
	sliced.parsednode = parsenode;
	return sliced;
}

/* Aux function: checks if two argument lists are the same */
var argumentsEqual = function (args1, args2) {
	if (args1 && args2) {
		if(args1.length !== args2.length)
			return false
		else 
			for (var i = 0; i < args1.length; i++) {
				if (escodegen.generate(args1[i]) !== escodegen.generate(args2[i]))
					return false
			}
		return true
	}
	else 
		return false
}

/* Main function */
var toNode = function (sliced) {
	var node = sliced.node,
	    scopeInfo = Ast.scopeInfo(node.parsenode),
	    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
	if(parent && parent.type === 'ReturnStatement') {
		node.parsenode = parent
	}
	if(parent && parent.type === 'ExpressionStatement' && node.parsenode.type != 'CallExpression') {
		node.parsenode = parent
	}
	if(node.isActualPNode || node.isFormalNode) {
		sliced.parsednode = undefined;
		return sliced;
	}
	console.log("NODE("+node.parsenode.type+") " + node.parsenode);
	switch (node.parsenode.type) {
      case 'VariableDeclaration': 
		return nodeifyVarDecl(sliced);
	  case 'FunctionExpression':
	    return nodeifyFunExp(sliced);
	  case 'FunctionDeclaration':
	    return nodeifyFunExp(sliced);
	  case 'BlockStatement':
		return nodeifyBlockStm(sliced);
	  case 'CallExpression':
	  	return nodeifyCallExp(sliced);
	  default: 
	  	sliced.parsednode = node.parsenode;
	    return sliced;
    }
}

var nodeify = function (slicednodes, node) {
	return toNode(new Sliced(slicednodes,node))
}

var nodePrimitives = function () {
	return [meteor_readP(), meteor_printP(), meteor_installLP(), meteor_broadcastP(), meteor_subscribeP()];
}