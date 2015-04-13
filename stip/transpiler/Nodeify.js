/****************************************************************
 *				 TRANSFORMATIONS FOR NODE.JS					*
 *																*
 *		- wait.for library in combination with zerorpc			*
 * 																*
 *  Where possible, falafel.js is used for transformations 		*
 *																*
 ****************************************************************/


var Nodeify = (function () {


	var module = {};
	
	var makeTransformer = function (option) {
		switch (option.asynccomm) {
		case 'callbacks':
			return {
				AST        : graphs.AST,
				transformF : nodeify,
				callbackF  : NodeParse.callback,
				asyncCallF : NodeParse.RPC,
				asyncFuncF : NodeParse.asyncFun,
				cps        : true,
				shouldTransform : shouldTransform,
				option     : option,
				transform  : CPSTransform
			}
		case 'promises':
			return {
				AST        : graphs.AST,
				transformF : nodeify,
				callbackF  : NodeParse.callback,
				asyncCallF : NodeParse.RPC,
				asyncFuncF : NodeParse.asyncFun,
				cps        : true,
				shouldTransform : shouldTransform,
				option     : option,
				transform  : PromiseTransform
			}
		}
	}

	var shouldTransform = function (call) {
		var entrynode = call.getEntryNode()[0];
		return !entrynode.equalsdtype(call) && entrynode.getdtype().value !== DNODES.SHARED.value 
	}

	/* Variable Declaration */
	var nodeifyVarDecl = function (sliced) {
	  	var node 	= sliced.node,
	  		slicedn = sliced.nodes,
	  		entry 	= node.getOutEdges(EDGES.DATA)
	  		              .filter(function (e) {
							return e.to.isEntryNode;
					}),
	  		call 	= node.getOutEdges(EDGES.CONTROL)
	  		              .filter(function (e) {
	  						return e.to.isCallNode;
	  				}),
	  		transformer = makeTransformer(sliced.option);
	  	if (esp_isVarDeclarator(node.parsenode))
	  		node.parsenode = NodeParse.createVarDecl(node.parsenode);
	  	/* Outgoing data dependency to entry node? -> Function Declaration */
		if (entry.length > 0) {
			var entry = entry[0].to,
	     	    f     = toNode(cloneSliced(sliced, slicedn, entry));
	     	if (entry.isServerNode() && entry.clientCalls > 0) {
	     		/* set the name of the method */
	     		f.method.setName(node.parsenode.declarations[0].id);
	     		sliced.method = {};
	     		sliced.methods = sliced.methods.concat(f.method.parsenode);
	     	}
		 	node.parsenode.declarations.init = f.parsednode;
		 	slicedn = f.nodes;
		}
		/* Outgoing dependency on call nodes?
		 * -> nodeify every call (possibly rpcs) */
		else if(call.length > 0) {
			var cpsvar = transformer.transform.transformExp(node, sliced.nodes, transformer);
			sliced.nodes = cpsvar[0];
			sliced.parsednode = cpsvar[1].parsenode;
			return sliced;
		}
		/* Cloud types */
		/*else if (CTTransform.shouldTransform(node)) {
			if (CTTransform.hasSameType(node)) {
				var ctype  = CTTransform.transformExpression(node);
				if(ctype) {
					if (sliced.tier === 'client')
						sliced.parsednode = ctype.setIfEmpty(escodegen.generate(node.parsenode.declarations[0].init));//ctype.declarationS;
					else 
						sliced.parsednode = undefined;
					sliced.cloudtypes[node.name] = ctype;
					return sliced;
				}
			}
		} else { */
			/* Transform the right hand side expression */
			/*CTTransform.transformExpression(node, sliced.cloudtypes)
		}*/

		sliced.nodes = slicedn;
		sliced.parsednode = node.parsenode;
		return sliced;
	}

	/* Function expression */
	var nodeifyFunExp = function (sliced) {
		/* Formal parameters */
		var node 	  = sliced.node,
			form_ins  = node.getFormalIn(),
			form_outs = node.getFormalOut(),
		    parsenode = node.parsenode,
		    params    = parsenode.params,
		    parent 	  = Ast.parent(parsenode, graphs.AST),
		    transformer = makeTransformer(sliced.option);
		/* Formal in parameters */
		if(form_ins.length > 0) {
			/* Remove parameters that are not in slicednodes */
			for(var i = 0; i < form_ins.length; i++) {
				var fp = form_ins[i],
				     p = params[i];
				if(!slicedContains(sliced.nodes,fp)) {
					params.splice(i,1);
				}
				sliced.nodes = sliced.nodes.remove(fp);
			}
			parsenode.params = params;
		};
		/* Formal out parameters */
		form_outs.map(function (f_out) {
			sliced.nodes = sliced.nodes.remove(f_out)
		})
		/* Body */
		var body = [],
		    bodynodes = node.getOutEdges(EDGES.CONTROL).filter(function (e) {
				return e.to.isStatementNode || e.to.isCallNode;
		    }).map(function (e) { return e.to });

		/* nodeify every body node */
		bodynodes.map(function (n) {
			var bodynode = toNode(cloneSliced(sliced, sliced.nodes, n));
			if(slicedContains(sliced.nodes,n)) 
				body = body.concat(bodynode.parsednode);
			sliced.nodes = removeNode(bodynode.nodes,n);
		});
		sliced.nodes = sliced.nodes.remove(node);
		parsenode.body.body = body;

		/* CASE 2 : Server function that is called by client side */
		if(node.isServerNode() && node.clientCalls > 0) {
			var cpsfun = transformer.transform.transformFunction(node, sliced, transformer);	
			sliced.method     = cpsfun[1] 
		}
		/* CASE 5 : Client function that is called by server side */ 
		if (node.isClientNode() && node.serverCalls > 0) {
			sliced.nodes = sliced.nodes.remove(node);
			parsednode.properties[0].value.body.body = body;
			sliced.parsednode = parsednode;
			sliced.method     = parsednode;		
		}
		if (node.isClientNode() || (node.isServerNode() && node.clientCalls === 0) || node.dtype === DNODES.SHARED) {
			sliced.nodes = removeNode(sliced.nodes,node);
			sliced.parsednode  = node.getParsenode();
			sliced.parsednode.body.body = body;
		}
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
			actual_ins  = node.getActualIn(),
			actual_outs = node.getActualOut(),	
		    parent 		= Ast.parent(node.parsenode,graphs.AST),
		    entryNode 	= node.getEntryNode()[0],
		    transformer = makeTransformer(sliced.option);
		actual_ins.map(function (a_in) {
			sliced.nodes = sliced.nodes.remove(a_in)
		})
		actual_outs.map(function (a_out) {
			sliced.nodes = sliced.nodes.remove(a_out)
		});

		if(isPrimitiveCall(node)) {
			return nodeifyPrimitive(sliced, actual_ins)
		}
		/* Perform cloud types transformations on arguments */
		//node.parsenode.arguments = CTTransform.transformArguments(node.parsenode.arguments, sliced.cloudtypes);
		if (entryNode.isServerNode()) {
			/* CASE 2 */
			if (node.isClientNode()) {
				cpscall = transformer.transform.transformCall(node, sliced.nodes, transformer , parent);
	        	sliced.nodes = cpscall[0];
	        	sliced.parsednode = cpscall[1].parsenode;
	        	return sliced;
			}
			/* CASE 1 : defined on server, called by server */
	    	else if(node.isServerNode()) {
	    		sliced.parsednode = parent;
	    	}       
	        return sliced;
		}
		else if (entryNode.isClientNode()) {
			/* CASE  4 : defined on client, called by client */
			if(node.isClientNode()) {
				cpscall = transformer.transform.transformCall(node, sliced.nodes, transformer, parent);
	        	sliced.nodes = cpscall[0];
	        	sliced.parsednode = cpscall[1].parsenode;
	        	return sliced;
			}
			else {
				/* CASE 5 : defined on client, called by server */
				1
			}
		}
		/* Shared function */
		else if (entryNode.isSharedNode()) {
			/* Called by client */
			if(node.isClientNode()) {
				sliced.nodes = slicednodes;
				sliced.parsednode = parent;
			}
			/* Called by server */
			else if (node.isServerNode()) {
				sliced.nodes = slicednodes;
				sliced.parsednode = parent;
			}
			return sliced;
		}
	}

	/* Currently same primitive implementations as meteor */
	var nodeifyPrimitive = function (sliced, actual_ins) {
		var node 		= sliced.node,
			name 		= node.name,
			parsenode 	= node.parsenode,
		    parent 		= Ast.parent(node.parsenode,graphs.AST)

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
			node 		= sliced.node,
			parsenode 	= node.parsenode,
		    bodynodes 	= node.edges_out.filter(function (e) {
			  return e.equalsType(EDGES.CONTROL)
				}).map(function (e) { return e.to });
		/* nodeify every body node */
		bodynodes.map(function (n) {
			var toSlice = cloneSliced(sliced, sliced.nodes, n);
			var bodynode = toNode(toSlice);
			if( slicedContains(sliced.nodes, n) ) {
					body = body.concat(bodynode.parsednode)
			}
			sliced.nodes = removeNode(bodynode.nodes,n);	
			sliced.methods = bodynode.methods;
			});
		sliced.nodes = sliced.nodes.remove(node);
		parsenode.body = body;
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

	var removeNode = function (nodes,node) {
		var callnode = false;
		nodes = nodes.remove(node);
		nodes.map(function (n) {
			if(n.parsenode) {
			var parent = Ast.parent(n.parsenode,graphs.AST);
			if( n.isCallNode && 
			   (n.parsenode === node.parsenode || parent === node.parsenode)) {
				callnode = n
			}
		}
		});
		return nodes;
	}

	var slicedContains = function (nodes,node) {
	 	return nodes.filter(function (n) {
			if(n.isCallNode) {
				return n.parsenode === node.parsenode
			} else
			return n.id === node.id
		}).length > 0
	}

	/* Main function */
	var toNode = function (sliced) {
		var node = sliced.node,
		    parent = Ast.parent(node.parsenode, graphs.AST);
		if(parent && esp_isRetStm(parent)) {
			node.parsenode = parent
		}
		if(parent && esp_isExpStm(parent) && 
			!(esp_isCallExp(node.parsenode)) &&
			!(esp_isAssignmentExp(node.parsenode))) {
			node.parsenode = parent
		}
		if(node.isActualPNode || node.isFormalNode) {
			sliced.parsednode = undefined;
			return sliced;
		}
		console.log("NODE("+node.parsenode.type+") " + node.parsenode);
		switch (node.parsenode.type) {
	      case 'VariableDeclarator': 
			return nodeifyVarDecl(sliced);
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
		  	if(esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
		  		return nodeifyVarDecl(sliced)
		  	if(esp_isExpStm(node.parsenode) && esp_isBinExp(node.parsenode.expression))
				return nodeifyBinExp(sliced)
			//CTTransform.transformExpression(node, sliced.cloudtypes)
			sliced.parsednode = node.parsenode;
		    return sliced;
		  
	    }
	}

	var nodeify = function (slicednodes, node, option) {
		var sliced = new Sliced(slicednodes, node);
		sliced.option = option;
		return toNode(sliced)
	}

	var nodePrimitives = function () {
		return [meteor_readP(), meteor_printP(), meteor_installLP(), meteor_broadcastP(), meteor_subscribeP()];
	}

	module.transpile = nodeify

	return module


})()