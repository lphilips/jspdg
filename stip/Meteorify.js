var meteorify_VarDecl = function (sliced) {
  	// Outgoing data dependency to entry or call node?
  	var node  = sliced.node,
  	    name  = node.parsenode.declarations[0].id.name,
  	    entry = node.edges_out.filter(function (e) {
		  return e.equalsType(EDGES.DATA) &&
	         e.to.isEntryNode;
		}),
		call  = node.edges_out.filter(function (e) {
			return e.equalsType(EDGES.CONTROL) &&
				   e.to.isCallNode;
		}),
        slicedn = sliced.nodes;
    /* Function declaration */
	if (entry.length > 0) {
		var entry = entry[0].to,
		    toSlice = cloneSliced(sliced, slicedn, entry);
     	var f = toMeteor(toSlice);
     	if (entry.isServerNode() && entry.clientCalls > 0) {
     		f.method.properties[0].key.value = name;
	 		slicedn = f.nodes;
	 		sliced.method = {};
			sliced.methods = sliced.methods.concat([f.method]);
			sliced.nodes = f.nodes;
			if(entry.serverCalls > 0) {
				// TODO, niet gewoon node.parsenode, maar ook meteorify'en
				var parsenode = node.getParsenode();
				//parsenode.declarations[0].init = f.parsednode;
				sliced.parsednode = parsenode;
			}
			return sliced;
		} else {
			var parsenode = node.getParsenode();
			parsenode.declarations[0].init = f.parsednode;
			sliced.parsednode = parsenode;
			sliced.nodes = f.nodes;
			return sliced;
		}
	}
	else if (call.length > 0) {
		var csliced, exp, firstcallback,
			originalexp = escodegen.generate(node.expression[0].parsenode),
			cnt = 0;
		call.map(function (c) {
			var toSlice = cloneSliced(sliced, slicedn, c.to);
			if(csliced && csliced.parsednode.type === "ExpressionStatement" &&
				csliced.parsednode.expression.type === "CallExpression") {
				toSlice.prevCallback = csliced.parsednode;
				if(!firstcallback) 
					firstcallback = csliced.parsednode;
			} else if (csliced) {
				toSlice.prevCallback = csliced.prevCallback;
			}
     		csliced = toMeteor(toSlice);
     		slicedn = csliced.nodes;
			slicedn = removeNode(slicedn, c.to);
			sliced.methods = csliced.methods;

			var entry = csliced.node.getEntryNode()[0];
			if (entry.equalsdtype(csliced.node)) {
				csliced.nodes = slicedn;
				csliced.parsednode = node.parsenode;
			}
			else {
				/* Nesting of callbacks */
				var cslicedargs = csliced.parsednode.expression.arguments,
					callback = cslicedargs[cslicedargs.length-1];
				csliced.nodes = slicedn;
				if (exp) node.expression[0].parsenode = exp;
				/* Add cnt to result and error variable of callback 
				   such that each nesting has its own variables (res0, res1, etc.)
				*/
				callback.params[0].name += cnt;
				callback.params[1].name += cnt;
				exp = meteor_callbackReturnP(callback, node.expression[0], csliced.node, originalexp, cnt);
				cnt++;
				if(csliced.prevCallback) {
					var prevarg = csliced.prevCallback.expression.arguments,
						prevcallback = prevarg[prevarg.length -1];
					callback.body.body = [callback.body.body[0]].concat(prevcallback.body.body.slice(1));
					prevcallback.body.body = [];
					prevcallback.body.body[0] = csliced.parsednode;
				}
				
			}
		});
		/*var entry = csliced.node.getEntryNode()[0];
		if (entry.equalsdtype(csliced.node)) {
			csliced.nodes = slicedn;
			csliced.parsednode = node.parsenode;
			return csliced;
		}
		else {
			var cslicedargs = csliced.parsednode.expression.arguments;
			csliced.nodes = slicedn;
			meteor_callbackReturnP(cslicedargs[cslicedargs.length-1],node.expression[0],csliced.node);
			console.log(escodegen.generate(csliced.parsednode));
			return csliced;
		}*/
		if(firstcallback ) csliced.parsednode = firstcallback;
		if(csliced.cont) {
			return csliced.cont(csliced);
		}
		return csliced;
	}
	sliced.nodes = slicedn;
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
 */
var meteorify_FunExp = function (sliced) {
	// Formal parameters
	var node 	    = sliced.node,
		form_ins    = node.getFormalIn(),
		form_outs   = node.getFormalOut(),
	    parsenode   = node.getParsenode(),
	    params      = parsenode.params,
		slicednodes = sliced.nodes,
		entry_out   = node.edges_in.filter( function (e) {
	    	return e.equalsType(EDGES.REMOTEC) && e.to.isClientNode()
	    }),
		parsednode  = meteor_functionP();
	// Formal in parameters
	if(form_ins.length > 0) {
		// Remove parameters that are not in slicednodes
		for(var i = 0; i < form_ins.length; i++) {
			var fp = form_ins[i],
			     p = params[i];
			if(!slicedContains(slicednodes,fp)) {
				params.splice(i,1);
			}
			slicednodes = slicednodes.remove(fp);
		}
	};
	// Formal out parameters
	form_outs.map(function (f_out) {
		slicednodes = slicednodes.remove(f_out)
	})
	var slicednodesc = slicednodes.slice(0);
	/* Server function that is called by client side */
	if(node.isServerNode() && node.clientCalls > 0) {
		parsednode.properties[0].value.params = params;
		/* Body */
		var body = [],
	    bodynodes = node.edges_out.filter(function (e) {
			return e.equalsType(EDGES.CONTROL) &&
			       e.to.isStatementNode || e.to.isCallNode;
	    }).map(function (e) {return e.to});

		bodynodes.map(function (n) {
			var toSlice  = cloneSliced(sliced, slicednodes, n),
				bodynode = toMeteor(toSlice);
			if(slicedContains(slicednodes, n)) 
				body = body.concat(bodynode.parsednode);
			slicednodes    = removeNode(bodynode.nodes,n);
			sliced.methods = bodynode.methods;
			sliced.streams = bodynode.streams;
			sliced.setup   = bodynode.setup;
		});

		slicednodes = slicednodes.remove(node);
		parsednode.properties[0].value.body.body= body;
		sliced.nodes      = slicednodes;
		sliced.parsednode = parsednode;
		sliced.method     = parsednode;
	}
	if(node.isClientNode() || (node.isServerNode() && node.clientCalls === 0)) {
		// TODO: distinguish cases
		slicednodes = slicednodesc;
		slicednodes = removeNode(slicednodes,node);
		var body = [],
	    	bodynodes = node.edges_out.filter(function (e) {
				return e.equalsType(EDGES.CONTROL) &&
			    	   e.to.isStatementNode || e.to.isCallNode;
	    	}).map(function (e) {return e.to});

		bodynodes.map(function (n) {
			var toSlice = cloneSliced(sliced, slicednodes, n),
			    bodynode = toMeteor(toSlice);
			if(slicedContains(slicednodes,n)) 
				body = body.concat(bodynode.parsednode);
			slicednodes    = removeNode(bodynode.nodes, n);
			sliced.methods = bodynode.methods;
			sliced.streams = bodynode.streams;
			sliced.setup   = bodynode.setup;
		});
		sliced.nodes       = slicednodes;
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
var meteorify_CallExp = function (sliced) {
	var node 		= sliced.node,
		slicednodes = sliced.nodes,
		actual_ins  = node.getActualIn(),
		actual_outs = node.getActualOut(),	
		scopeInfo 	= Ast.scopeInfo(node.parsenode),
	    parent 		= Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST),
	    entryNode 	= node.getEntryNode()[0],
	    invardecl 	= false;
	/* Remove actual parameters of this call node. */
	actual_ins.map( function (a_in) {
		slicednodes = slicednodes.remove(a_in);
	})
	actual_outs.map( function (a_out) {
		slicednodes = slicednodes.remove(a_out)
	})
	
	/* Primitive calls are handled differently */
	if( isPrimitiveCall(node) ) {
		sliced.nodes = slicednodes;
		return meteorify_Primitive(sliced, actual_ins);
	}
	/* Replace with meteor call if call from client to server entry node */
	if( entryNode.isServerNode() ) {
		// Case 2
		if( node.isClientNode() ) {
			var parsednode = meteor_callP();
			parsednode.expression.arguments[0].value = node.parsenode.callee.name;
        	var args = parsednode.expression.arguments.slice(0);
        	actual_ins.map(function(a_in) {
        		args = args.concat(a_in.parsenode);
        	});
        	/* Search if call is made inside variable declaration */
        	var upnodes = node.edges_in.filter(function (e) {
        					return  e.equalsType(EDGES.CONTROL) &&
        	    	    			e.from.parsenode &&
        	       	    			e.from.parsenode.type === "VariableDeclaration" 
        				}),
        		asArg   = node.edges_in.filter(function (e) {
        					return e.equalsType(EDGES.CONTROL) &&
        						   e.from.isActualPNode;
        				});
        	if(upnodes.length > 0) {
        		/* Put it in callback, together with all statements dependent on the variable */
        		var vardecl  = upnodes[0].from,
        		 	datadeps = vardecl.dataDependentNodes(),
        			callback =  meteor_callbackP();
        		invardecl = true;
        		callback.body.body[0].declarations[0].id.name = vardecl.parsenode.declarations[0].id.name;
        		datadeps.map(function(node) {
        			if(!(node.isActualPNode)) {
        				/* Has the node other outgoing dependencies on call nodes? 
        				   If so, meteorify the call and add it to the current callback body */
        				var calldeps = node.edges_in.filter(function (e) {
        					return  e.equalsType(EDGES.DATA) && e.from.cnt !== vardecl.cnt &&
        							slicedContains(slicednodes, e.from)
        				}),/*.flatMap(function (e) { return e.from.edges_out}).filter(function (e) {
        					return e.to.isCallNode && !(slicedContains(slicednodes, e.to))
        				});*/
        					vardecls  = node.edges_in.filter(function (e) {
        						return  e.equalsType(EDGES.CONTROL) &&
        								e.from.parsenode.type === "VariableDeclaration"
        					});
        				if(calldeps.length > 0) {
        					var call = calldeps[0].from;
        					if(slicedContains(slicednodes, call)) {
        						// Remove this node 
		    					slicednodes = removeNode(slicednodes, vardecl);
	        					var toSlice  = cloneSliced(sliced, slicednodes, call),
									bodynode = toMeteor(toSlice);
								slicednodes = removeNode(bodynode.nodes, call);
								callback.body.body = callback.body.body.concat(bodynode.parsednode);
							}
        				} else if (vardecls.length > 0) {
        					vardecl = vardecls[0].from;
        					if(slicedContains(slicednodes, vardecl)) {
	        					var toSlice = cloneSliced(sliced, slicednodes, vardecl),
									bodynode = toMeteor(toSlice);
								slicednodes = removeNode(bodynode.nodes, vardecl);
								callback.body.body = callback.body.body.concat(bodynode.parsednode);
							}
        				} 
        				else {
	        				var toSlice = cloneSliced(sliced, slicednodes, node),
								bodynode = toMeteor(toSlice);
							slicednodes = removeNode(bodynode.nodes, node);
							callback.body.body = callback.body.body.concat(bodynode.parsednode);
						}
        			}
        		})
        		args = args.concat(callback);
        	}
        	parsednode.expression.arguments = args;
        	if (invardecl || asArg.length > 0) 
        		sliced.parsednode = parsednode;
        		
        	else {
        		parent.expression = parsednode;
        		sliced.parsednode = parent;
        	}
        		
        	sliced.nodes = slicednodes;
			actual_ins.map( function (a_in) {
				sliced = meteorify_argument(sliced, node, a_in)
			})
			//sliced.nodes = slicednodes;
        	return sliced;
    	}
    	// Case 1 
    	else if(node.isServerNode()) {
    		sliced.parsednode = parent;
    		sliced.nodes = slicednodes;
    	   	actual_ins.map( function (a_in) {
    	   		//sliced.nodes = slicednodes;
				sliced = meteorify_argument(sliced, node, a_in)
			});
    		//sliced.nodes = slicednodes;
    	}       
        return sliced;
    }		
	else if (entryNode.isClientNode()) {
		// Case 4
		if(node.isClientNode()) {
			//sliced.parsednode = parent;
			var upnodes = node.edges_in.filter(function (e) {
        					return  e.equalsType(EDGES.CONTROL) &&
        	    	    			e.from.parsenode &&
        	       	    			e.from.parsenode.type === "VariableDeclaration" 
        				});
			if (upnodes.length > 0) // || asArg.length > 0) 
        		sliced.parsednode = node.parsenode;
        		
        	else {
        		parent.expression = node.parsednode;
        		sliced.parsednode = parent;
        	}
        	sliced.nodes = slicednodes;
			actual_ins.map( function (a_in) {
				sliced = meteorify_argument(sliced, node, a_in)
			});
			//sliced.nodes = slicednodes;
			return sliced;
		}

	}
}


/*
 * This function Meteorifies arguments of a call.
 * These arguments can be a (remote) call itself.
 */
var meteorify_argument = function (sliced, callnode, arg) {
	var slicedn   = sliced.nodes,
		callnodes = arg.callArgument(),
		entrynode = callnode.getEntryNode()[0],
		upnodes   = callnode.edges_in.filter(function (e) {
        					return  e.equalsType(EDGES.CONTROL) &&
        	    	    			e.from.parsenode &&
        	       	    			e.from.parsenode.type === "VariableDeclaration" 
        			});
	/* Call nodes connected to an actual parameter must be removed 
	   and transformed */
	if(callnodes && callnodes.length > 0) {
		var callarg  = callnodes[0],
			argentry = callarg.getEntryNode()[0];
		/* Call from server argument to client function */
		if( callarg.isServerNode() && argentry.isClientNode() ) {
			console.log(callarg);
			console.log('CASE 1');
		}
		/* Call from client argument to serverfunction */
		else if (callarg.isClientNode() && argentry.isServerNode() ) {
			var cont = function (sliced ) {
				var parsenode  = sliced.parsednode,
					meteorcall = meteor_callP(),
					callback   = meteor_callbackP(),
					args       = [],
					body       = [];
				/* Replace argument from previous call with custom argument */
				// TODO NAME
				if (parsenode.expression) {
					parsenode.expression.arguments[1] = {type: 'Identifier', name: 'resarg'};
					/* Wrap previous call inside new meteor call, with resarg as result */
					meteorcall.expression.arguments[0].value = callarg.name; 
					callarg.getActualIn().map( function (a_in) {
						args = args.concat(a_in.parsenode) 
					});
					callback.params[1].name = 'resarg';
					callback.body.body[0] = parsenode;
					args = args.concat(callback);
					meteorcall.expression.arguments = meteorcall.expression.arguments.concat(args);
					sliced.parsednode = meteorcall;
					return sliced;
				}
				else if (parsenode.type === "VariableDeclaration" && sliced.node.isCallNode) {
					var actual_ins = sliced.node.getActualIn();
					// Prepare meteor call
					meteorcall.expression.arguments[0].value = callarg.name;
					callarg.getActualIn().map( function (a_in) {
						args = args.concat(a_in.parsenode) 
					});
					// Change orginal parsenode, replace call arg with result of callback
					for(var i = 0; i < actual_ins.length; i++) {
						var a_in = actual_ins[i],
							ca   = a_in.callArgument();
						if(ca && ca.length > 0 && ca[0].id === callarg.id) {
							break;
						} 
					}
					parsenode.declarations[0].init.arguments[i] = {type: 'Identifier', name: 'res'};
					body = body.concat(parsenode);
					if(upnodes.length>0) {
						var vardecl  = upnodes[0].from,
							datadeps = vardecl.dataDependentNodes();
						datadeps.map(function (n) {
							var toSlice  = cloneSliced(sliced, sliced.nodes,n),
								bodynode = toMeteor(toSlice);
							sliced.nodes = removeNode(bodynode.nodes,n);
							body = body.concat(bodynode.parsednode);
						})
					}
				
					callback.body.body = body;
					args = args.concat(callback);
					meteorcall.expression.arguments = meteorcall.expression.arguments.concat(args);
					sliced.parsednode = meteorcall;
					return sliced;
				}

				else
					return sliced;
			}
			sliced.cont = cont;
		}
		slicedn = removeNode(slicedn, callarg);
		var toSlice = cloneSliced(sliced, slicedn, callarg),
			callnode = toMeteor(toSlice);
		if(sliced.cont) {
			var prev = sliced.cont;
			sliced.cont = function (sliced) {
				var inner = prev(sliced);
				if(callnode.cont) {
					var outer =  callnode.cont(inner);
					outer.nodes = sliced.nodes;
					return outer;
				}
				inner.nodes = sliced.nodes;
				return inner;
			}
		} 
		else if (callnode.cont) {
			sliced.cont = function (sliced) {
				var inner = callnode.cont(sliced);
				inner.nodes = sliced.nodes;
				return inner;
			}
		}
		slicedn = callnode.nodes;
		
	}
	sliced.nodes = slicedn;
	return sliced;
}

var meteorify_Primitive = function (sliced, actual_ins) {
	var node 	  	= sliced.node,
		name 	  	= node.name,
		parsenode  	= node.getParsenode(),
		slicednodes = sliced.nodes,
		scopeInfo 	= Ast.scopeInfo(node.parsenode),
	    parent 		= Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
	
	//sliced.parsednode = parent;
	sliced.nodes = removeNode(slicednodes, node);
	if(name === 'broadcast') {
		var actual_in = actual_ins[0],
			streamname = actual_in.value;
		if(sliced.streams.indexOf(streamname) < 0) {
			sliced.streams = sliced.streams.concat(streamname);
			sliced.setup = sliced.setup.concat(meteor_make_streamP(streamname));
		};
		parsenode.arguments = [{'type':'Identifier', 'name':streamname+'stream'}].concat(parsenode.arguments);
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

var meteorify_BlockStm = function (sliced) {
	var body 		= [],
		node 		= sliced.node,
		slicednodes = sliced.nodes,
		parsenode 	= node.getParsenode(),
	    bodynodes 	= node.edges_out.filter(function (e) {
		  return e.equalsType(EDGES.CONTROL)
			}).map(function (e) {return e.to});
	while(bodynodes.length > 0) {
		var n = bodynodes.shift();
		var toSlice = cloneSliced(sliced, slicednodes, n),
			bodynode = toMeteor(toSlice);
		if(slicedContains(slicednodes,n) && bodynode.parsednode) {
				body = body.concat(bodynode.parsednode)
		}
		slicednodes = removeNode(bodynode.nodes,n);	
		bodynodes.map(function (bn) {
			if(!slicedContains(bodynode.nodes, bn))
				bodynodes = removeNode(bodynodes, bn)
		})
		sliced.methods= bodynode.methods;
		sliced.streams= bodynode.streams;
		sliced.setup = bodynode.setup;
	}
	slicednodes = slicednodes.remove(node);
	parsenode.body = body;
	sliced.parsednode = parsenode;
	sliced.nodes = slicednodes;
	return sliced;
}

var meteorify_IfStm = function (sliced) {
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


var removeNode = function (nodes,node) {
	nodes = nodes.remove(node);
	var callnode = false;
	nodes.map(function (n) {
		if(n.parsenode) {
		var scopeInfo = Ast.scopeInfo(n.parsenode),
		    parent = Ast.hoist(scopeInfo).parent(n.parsenode,graphs.AST);
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
	var node = sliced.node,
	    scopeInfo = Ast.scopeInfo(node.parsenode),
	    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
	if(parent && parent.type === "ReturnStatement") {
		node.parsenode = parent
	}
	if(parent && parent.type === "ExpressionStatement" && node.parsenode.type != "CallExpression") {
		node.parsenode = parent
	}
	if(node.isActualPNode || node.isFormalNode) {
		sliced.parsednode = undefined;
		return sliced;
	}
	console.log("METEOR("+node.parsenode.type+") " + node.parsenode);
	switch (node.parsenode.type) {
      case "VariableDeclaration": 
		return meteorify_VarDecl(sliced);
	  case "FunctionExpression":
	  	return meteorify_FunExp(sliced);
	  case "FunctionDeclaration":
	    return meteorify_FunExp(sliced);
	  case "BlockStatement":
		return meteorify_BlockStm(sliced);
	  case "CallExpression":
	  	return meteorify_CallExp(sliced);
	  case "IfStatement":
	   	return meteorify_IfStm(sliced);
	  default: 
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
