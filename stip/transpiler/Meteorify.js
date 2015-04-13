/****************************************************************
 *				 TRANSFORMATIONS FOR Meteor 					*
 *																*
 *  transformations for distributed setting,					*
 * 																*
 *																*
 *  Supports CPS transformations								*
 *																*
 ****************************************************************/

var Meteorify = (function () {

	var module      = {},
		makeTransformer = function () {
			return {
				AST        : graphs.AST,
				transformF : meteorify,
				callbackF  : MeteorParse.callback,
				asyncCallF : MeteorParse.RPC,
				asyncFuncF : MeteorParse.asyncFun,
				cps        : true,
				shouldTransform : shouldTransform
			}
		};

	var shouldTransform = function (call) {
		var entrynode = call.getEntryNode()[0];
		return !entrynode.equalsdtype(call) && entrynode.getdtype().value !== DNODES.SHARED.value 
	}


	var meteorifyVarDecl = function (sliced) {
	  	// Outgoing data dependency to entry or call node?
	  	var node  = sliced.node,
	  	    name  = node.name,
	  	    entry = node.edges_out.filter(function (e) {
			  return e.equalsType(EDGES.DATA) &&
		         e.to.isEntryNode;
			}),
			call  = node.edges_out.filter(function (e) {
				return e.equalsType(EDGES.CONTROL) &&
					   e.to.isCallNode;
			}),
	        toSlice;
	    if (esp_isVarDeclarator(node.parsenode))
	    	node.parsenode = MeteorParse.createVarDecl(node.parsenode)
	    /* Function declaration */
		if (entry.length > 0) {
			var entry = entry[0].to,
			    toSlice = cloneSliced(sliced, sliced.nodes, entry);
	     	var f = toMeteor(toSlice);
	     	/* Server function that is called by client 
	     	 * Alter the remote function definition with the name of the function */
	     	if (entry.isServerNode() && entry.clientCalls > 0) {
	     		f.method.setName(node.parsenode.declarations[0].id);
		 		sliced.method = {};
				sliced.methods = sliced.methods.concat(f.method.parsenode);
				sliced.nodes = f.nodes;
				if(entry.serverCalls > 0) {
					var parsenode = node.getParsenode();
					sliced.parsednode = parsenode;
				}
				return sliced;
			} else if (entry.isClientNode() && entry.serverCalls > 0) {
				f.method.properties[0].key.value = name;
				sliced.method = {};
				sliced.methods = sliced.methods.concat(f.method);
				sliced.nodes = f.nodes;
				if (entry.clientCalls > 0) {
					var parsenode = node.getParsenode();
					sliced.parsednode = parsenode;
				}
				return sliced;
			}
			else {
				var parsenode = node.getParsenode();
				parsenode.declarations[0].init = f.parsednode;
				sliced.parsednode = parsenode;
				sliced.nodes = f.nodes;
				return sliced;
			}
		}
		/* Variable declaration with call in right-hand side */
		else if (call.length > 0) {
			var cpsvar = CPSTransform.transformExp(node, sliced.nodes, makeTransformer());
			sliced.nodes = cpsvar[0];
			sliced.parsednode = cpsvar[1].parsenode;
			return sliced;
		}
		sliced.parsednode = node.getParsenode();
		return sliced;
	}

	/*
	 * FUNCTION EXPRESSION
	 * 1: function defined on SERVER, called on SERVER -> no transformation
	 * 2: function defined on SERVER, called on CLIENT -> transform to Meteor method definition
	 * 3: function defined on SERVER, called by BOTH   -> combination of previous cases
	 * 4: function defined on CLIENT, called on CLIENT -> no transformation
	 * 5: function defined on CLIENT, called on SERVER -> transform to Meteor method definition (subhog package)
	 * 6: function defined on CLIENT, called by BOTH   -> combination of previous cases
	 * 7: function defined SHARED,    called by SERVER -> copy to server, no transformation
	 * 8: function defined SHARED,    called by CLIENT -> copy to client, no transformation
	 * 9: function defined SHARED,    called by BOTH   -> copy to both.
	 */
	var meteorifyFunExp = function (sliced) {
		var node 	    = sliced.node,
			form_ins    = node.getFormalIn(),
			form_outs   = node.getFormalOut(),
		    parsenode   = node.getParsenode(),
		    params      = parsenode.params,
			entry_out   = node.edges_in.filter( function (e) {
		    	return e.equalsType(EDGES.REMOTEC) && e.to.isClientNode()
		    });
		/* Formal in parameters */
		if(form_ins.length > 0) {
			// Remove parameters that are not in slicednodes
			for(var i = 0; i < form_ins.length; i++) {
				var fp = form_ins[i],
				     p = params[i];
				if(!slicedContains(sliced.nodes,fp)) {
					params.splice(i,1);
				}
				sliced.nodes = sliced.nodes.remove(fp);
			}
		};
		/* Formal out parameters */
		form_outs.map(function (f_out) {
			sliced.nodes = sliced.nodes.remove(f_out)
		})
		/* Body */
		var body = [],
		    bodynodes = node.edges_out.filter(function (e) {
				return e.equalsType(EDGES.CONTROL) &&
				       e.to.isStatementNode || e.to.isCallNode;
		    }).map(function (e) {return e.to});

		bodynodes.map(function (n) {
			var toSlice  = cloneSliced(sliced, sliced.nodes, n),
				bodynode = toMeteor(toSlice);
			if(slicedContains(sliced.nodes, n)) 
				body = body.concat(bodynode.parsednode);
			sliced.nodes    = removeNode(bodynode.nodes,n);
			sliced.methods = bodynode.methods;
			sliced.streams = bodynode.streams;
			sliced.setup   = bodynode.setup;
		});

		/* CASE 2 : Server function that is called by client side */
		if(node.isServerNode() && node.clientCalls > 0) {
			var cpsfun = CPSTransform.transformFunction(node, sliced, makeTransformer());
			sliced.nodes = removeNode(sliced.nodes,node);	
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
	var meteorifyCallExp = function (sliced) {
		var node 		= sliced.node,
			actual_ins  = node.getActualIn(),
			actual_outs = node.getActualOut(),	
		    parent 		= Ast.parent(node.parsenode,graphs.AST),
		    entryNode 	= node.getEntryNode()[0],
		    invardecl 	= false,
		    cpscall, cpsargs;
		/* Remove actual parameters of this call node. */
		actual_ins.map( function (a_in) {
			sliced.nodes = sliced.nodes.remove(a_in);
		})
		actual_outs.map( function (a_out) {
			sliced.nodes = sliced.nodes.remove(a_out)
		})
		
		/* Primitive calls are handled differently */
		if( isPrimitiveCall(node) ) 
			return meteorify_Primitive(sliced, actual_ins);
		/* Replace with meteor call if call from client to server entry node */
		if( entryNode.isServerNode() ) {
			/* CASE 2 : defined on server, called by client */
			if( node.isClientNode() ) {
	        	cpscall = CPSTransform.transformCall(node, sliced.nodes, makeTransformer(), parent);
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
				cpscall = CPSTransform.transformCall(node, sliced.nodes, makeTransformer(), parent);
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
				sliced.parsednode = parent;
			}
			/* Called by server */
			else if (node.isServerNode()) {
				sliced.parsednode = parent;
			}
			sliced.nodes = sliced.nodes.remove(node);
			return sliced;
		}
	}


	var meteorifyPrimitive = function (sliced, actual_ins) {
		var node 	  	= sliced.node,
			name 	  	= node.name,
			parsenode  	= node.getParsenode(),
			slicednodes = sliced.nodes,
		    parent 		= Ast.parent(node.parsenode,graphs.AST);
		
		//sliced.parsednode = parent;
		sliced.nodes = removeNode(slicednodes, node);
		if(name === 'broadcast') {
			var actual_in = actual_ins[0],
				streamname = actual_in.value;
			if(sliced.streams.indexOf(streamname) < 0) {
				sliced.streams = sliced.streams.concat(streamname);
				sliced.setup = sliced.setup.concat(meteor_make_streamP(streamname));
			};
			parsenode.arguments = [{'type' : 'Identifier', 'name' : streamname + 'stream'}].concat(parsenode.arguments);
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced,'broadcast'))
				sliced.setup = sliced.setup.concat(meteor_broadcastP());
		}
		else if(name === 'print') {
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced,'print'))
				sliced.setup = sliced.setup.concat(meteor_printP());
		}
		else if(name === 'read') {
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced,'read'))
				sliced.setup = sliced.setup.concat(meteor_readP());
		}
		else if(name === 'installL') {
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced,'installL'))
				sliced.setup = sliced.setup.concat(meteor_installLP());
		}

		else if(name === 'subscribe') {
			var actual_in = actual_ins[0],
				streamname = actual_in.value;
			if(sliced.streams.indexOf(streamname) < 0) {
				sliced.streams = sliced.streams.concat(streamname);
				sliced.setup = sliced.setup.concat(meteor_make_streamP(streamname));
			};
			parsenode.arguments = [{'type':'Identifier', 'name':streamname+'stream'}].concat(parsenode.arguments);
			parent.expression = parsenode;
			sliced.parsednode = parent;
			if(!setUpContains(sliced,'subscribe'))
				sliced.setup = sliced.setup.concat(meteor_subscribeP());
		}

		return sliced;
	}

	var meteorifyBlockStm = function (sliced) {
		var body 		= [],
			node 		= sliced.node,
			parsenode 	= node.getParsenode(),
		    bodynodes 	= node.edges_out.filter(function (e) {
			  return e.equalsType(EDGES.CONTROL)
				}).map(function (e) {return e.to});

		while(bodynodes.length > 0) {
			var n = bodynodes.shift();
			var toSlice = cloneSliced(sliced, sliced.nodes, n),
				bodynode = toMeteor(toSlice);
			if(slicedContains(sliced.nodes,n) && bodynode.parsednode) {
					body = body.concat(bodynode.parsednode)
			}
			sliced.nodes = removeNode(bodynode.nodes,n);	
			bodynodes.map(function (bn) {
				if(!slicedContains(bodynode.nodes, bn))
					bodynodes = removeNode(bodynodes, bn)
			})
			sliced.methods= bodynode.methods;
			sliced.streams= bodynode.streams;
			sliced.setup = bodynode.setup;
		}
		sliced.nodes = sliced.nodes.remove(node);
		parsenode.body = body;
		sliced.parsednode = parsenode;
		return sliced;
	}

	var meteorifyIfStm = function (sliced) {
		var node 	= sliced.node,
		    conseq  = node.edges_out.filter( function (e) {
		    	return e.label && e.equalsType(EDGES.CONTROL)
		    }),
		    altern 	= node.edges_out.filter( function (e) {
		    	return !e.label && e.equalsType(EDGES.CONTROL)
		    });
		 sliced.parsednode = node.getParsenode();
		if(conseq.length > 0) {
			var cnode = conseq[0].to,
			    csliced = toMeteor(new Sliced(sliced.nodes,cnode));
			sliced.nodes = removeNode(csliced.nodes,cnode);
			return sliced;
		} else if (altern.length > 0) {
			var anode = altern[0].to,
				asliced = toMeteor(asliced.nodes, anode);
			sliced.nodes = removeNode(asliced.nodes,anode);
			return sliced;
		}
		return sliced;
	}


	/* Binary expression */
	var meteorifyBinExp = function (sliced) {
		var call = sliced.node.getOutEdges(EDGES.CONTROL).filter(function (e) {
						return  e.to.isCallNode
				   });
		if (call.length > 0) {
			var transformer = makeTransformer(),
				cpsvar		= CPSTransform.transformExp(sliced.node, sliced.nodes, transformer);
			sliced.nodes = cpsvar[0];
			sliced.parsednode = cpsvar[1].parsenode;
			return sliced;
		}

		return sliced;
	}

	var meteorifyRetStm = function (sliced) {
		var call = sliced.node.getOutEdges(EDGES.CONTROL).filter(function (e) {
						return  e.to.isCallNode
				   });
		if (call.length > 0) {
			var transformer = makeTransformer(),
				cpsvar		= CPSTransform.transformExp(sliced.node, sliced.nodes, transformer);
			sliced.nodes = cpsvar[0];
			sliced.parsednode = cpsvar[1].parsenode;
			return sliced;
		}

		return sliced;
	}

	var removeNode = function (nodes,node) {
		var callnode = false;
		nodes = nodes.remove(node);
		nodes.map(function (n) {
			if(n.parsenode) {
			var parent = Ast.parent(n.parsenode,graphs.AST);
			if(n.isCallNode && (n.parsenode === node.parsenode || parent === node.parsenode)) {
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


	var toMeteor = function (sliced) {
		if(sliced.node.isActualPNode || sliced.node.isFormalNode) {
			sliced.parsednode = undefined;
			return sliced;
		}
		var node = sliced.node,
		    parent = Ast.parent(node.parsenode,graphs.AST);
		if(parent && esp_isRetStm(parent)) {
			node.parsenode = parent
		}
		if(parent && esp_isExpStm(parent) && 
			!(esp_isCallExp(node.parsenode)) &&
			!(esp_isAssignmentExp(node.parsenode))) {
			node.parsenode = parent
		}
		console.log('METEOR('+node.parsenode.type+') ' + node.parsenode);
		switch (node.parsenode.type) {
	      case 'VariableDeclaration': 
			return meteorifyVarDecl(sliced);
		  case 'VariableDeclarator':
		  	return meteorifyVarDecl(sliced);
		  case 'FunctionExpression':
		  	return meteorifyFunExp(sliced);
		  case 'FunctionDeclaration':
		    return meteorifyFunExp(sliced);
		  case 'BlockStatement':
			return meteorifyBlockStm(sliced);
		  case 'CallExpression':
		  	return meteorifyCallExp(sliced);
		  case 'IfStatement':
		   	return meteorifyIfStm(sliced);
		  case 'AssignmentExpression':
		    return meteorifyAssignmentExp(sliced);
		  case 'BinaryExpression':
		  	return meteorifyBinExp(sliced);
		  default: 
		  	if (esp_isRetStm(node.parsenode) && 
		  		node.getOutEdges(EDGES.CONTROL).filter(function (e) {
		  				return e.to.isCallNode
		  			}).length > 0)
		  		return meteorifyRetStm(sliced)
		    sliced.parsednode = node.parsenode;
		    return sliced;
	    }
	}

	var meteorify = function (slicednodes, node) {
		return toMeteor(new Sliced(slicednodes,node))
	}

	var meteorPrimitives = function () {
		return [meteor_readP(), meteor_printP(), meteor_installLP(), meteor_broadcastP(), meteor_subscribeP()];
	}

	module.transpile = meteorify;

	return module;

})();