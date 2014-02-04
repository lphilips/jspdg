var Sliced = function(nodes,node,parsednode) {
	this.nodes = nodes;
	this.node = node;
	this.parsednode  = parsednode;
	this.methods = meteor_methodsP();
     this.method = {};
}


var meteorify_VarDecl = function(sliced) {
  	// Outgoing data dependency to entry or call node?
  	var node = sliced.node,
  	    name = node.parsenode.declarations[0].id.name,
  	    entry = node.edges_out.filter(function(e) {
		  return e.equalsType(EDGES.DATA) &&
	         e.to.isEntryNode;
		}),
		call = node.edges_out.filter(function(e) {
			return e.equalsType(EDGES.CONTROL) &&
				   e.to.isCallNode;
		})
        slicedn = sliced.nodes;    
	if(entry.length > 0) {
		var entry = entry[0].to,
		    toSlice = new Sliced(slicedn, entry);
	    
		toSlice.methods = sliced.methods;
     	var f = toMeteor(toSlice);
     	if(entry.isServerNode() && entry.clientCalls > 0) {
     		f.parsednode["properties"][0]["key"]["value"] = name;
	 		slicedn = f.nodes;
	 		sliced.method = {};
			var prevmethods = sliced.methods["expression"]["arguments"];
			sliced.methods["expression"]["arguments"] = prevmethods.concat([f.parsednode]);
			sliced.parsednode = undefined;
			sliced.nodes = f.nodes;
			if(entry.serverCalls > 0) {
				sliced.parsednode = node.parsenode;
			}
			return sliced;
		} else {
			node.parsenode.declarations.init = f.parsednode;
			sliced.parsednode = node.parsenode;
			sliced.nodes = f.nodes;
			return sliced;
		}
	}
	if(call.length > 0) {
		var csliced;
		// TODO
		call.map(function(c) {
			var toSlice = new Sliced(slicedn, c.to);
			toSlice.methods = sliced.methods;
     		csliced = toMeteor(toSlice);
     		slicedn = csliced.nodes;
			slicedn = removeNode(slicedn,c.to);
		});
		var entry = csliced.node.getEntryNode()[0];
		if(entry.getdtype().value === csliced.node.getdtype().value) {
			csliced.nodes = slicedn;
			csliced.parsednode = node.parsenode;
			return csliced;
		}
		else {
			csliced.nodes = slicedn;
			cslicedargs = csliced.parsednode["expression"]["arguments"];
			meteor_callbackReturnP(cslicedargs[cslicedargs.length-1],node.expression[0],csliced.node);
			return csliced;
		}
	}
	sliced.nodes = slicedn;
	sliced.parsednode = node.parsenode;
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
var meteorify_FunExp = function(sliced) {
	// Formal parameters
	var node = sliced.node,
		form_ins  = node.getFormalIn(),
		form_outs = node.getFormalOut(),
	    parsenode = node.parsenode,
	    params    = parsenode.params,
		slicednodes = sliced.nodes,
		entry_out = node.edges_in.filter( function(e) {
	    	return e.equalsType(EDGES.REMOTEC) && e.to.isClientNode()
	    }),
		parsednode = meteor_functionP();
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
	form_outs.map(function(f_out) {
		slicednodes = slicednodes.remove(f_out)
	})
	if(node.isServerNode()) {
		parsednode["properties"][0]["value"]["params"] = params;
		// Body
		var body = [],
	    bodynodes = node.edges_out.filter(function(e) {
			return e.equalsType(EDGES.CONTROL) &&
			       e.to.isStatementNode || e.to.isCallNode;
	    }).map(function(e) {return e.to});
		bodynodes.map(function(n) {
			var toSlice = new Sliced(slicednodes,n);
			toSlice.methods = sliced.methods;
			var bodynode = toMeteor(toSlice);
			if(slicedContains(slicednodes,n)) {
				body = body.concat(bodynode.parsednode);
			}
			slicednodes = removeNode(bodynode.nodes,n);
		});
		slicednodes = slicednodes.remove(node);
		parsednode["properties"][0]["value"]["body"]["body"]= body;
		sliced.nodes = slicednodes;
		sliced.parsednode = parsednode;
		sliced.method = parsednode;
		return sliced;
	}
	if(node.isClientNode()) {
		// TODO: distinguish cases
		sliced.parsednode = node.parsenode;
		slicednodes = removeNode(slicednodes,node);
		var body = [],
	    	bodynodes = node.edges_out.filter(function(e) {
				return e.equalsType(EDGES.CONTROL) &&
			    	   e.to.isStatementNode || e.to.isCallNode;
	    	}).map(function(e) {return e.to});
		bodynodes.map(function(n) {
			slicednodes = removeNode(slicednodes,n);
		});
		sliced.nodes = slicednodes;
		return sliced;
	}
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
var meteorify_CallExp = function(sliced) {
	var node = sliced.node,
		slicednodes = sliced.nodes,
		actual_ins  = node.getActualIn(),
		actual_outs = node.getActualOut(),	
		scopeInfo = Ast.scopeInfo(node.parsenode),
	    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST),
	    entryNode = node.getEntryNode()[0];
	// Remove actual parameters of this call node.
	actual_ins.map(function(a_in) {
		slicednodes = slicednodes.remove(a_in)
	})
	actual_outs.map(function(a_out) {
		slicednodes = slicednodes.remove(a_out)
	})
	// Replace with meteor call if call from client to server entry node
	if( entryNode.isServerNode()) {
		// Case 2
		if(node.isClientNode()) {
			var parsednode = meteor_callP();
			parsednode["expression"]["arguments"][0]["value"] = node.parsenode.callee.name;
        	var args = parsednode["expression"]["arguments"].splice(0);
        	actual_ins.map(function(a_in) {
        		args = args.concat(a_in.parsenode);
        	});
        	// Search if call is made inside variable declaration
        	var upnodes = node.edges_in.filter(function (e) {
        		return e.equalsType(EDGES.CONTROL) &&
        	    	   e.from.parsenode &&
        	       	   e.from.parsenode.type === "VariableDeclaration"
        	});
        	if(upnodes.length > 0) {
        		// Put it in callback, together with all statements dependent on the variable.
        		var vardecl = upnodes[0].from;
        		var datadeps = vardecl.dataDependentNodes();
        		var callback =  meteor_callbackP();
        		callback["body"]["body"][0]["declarations"][0]["id"]["name"] = vardecl.parsenode.declarations[0].id.name
        		datadeps.map(function(node) {
        			if(!(node.isActualPNode)) {
        				var toSlice = new Sliced(slicednodes,node);
						toSlice.methods = sliced.methods;
						var bodynode = toMeteor(toSlice);
						slicednodes = removeNode(slicednodes,node);
						callback["body"]["body"] = callback["body"]["body"].concat(bodynode.parsednode);
        			}
        		})
        		args=args.concat(callback);
        	}
        	parsednode["expression"]["arguments"] = args;
        	sliced.parsednode = parsednode;
    	}
    	// Case 1 
    	else if(node.isServerNode()) {
    		sliced.parsednode = parent;
    		sliced.nodes = slicednodes;
    	}       
        return sliced;
    }		
	else if (entryNode.isClientNode()) {
		// Case 4
		if(node.isClientNode()) {
			sliced.parsednode = node.parsenode;
			sliced.nodes = slicednodes;
			return sliced;
		}

	}
}

var meteorify_BlockStm = function(sliced) {
	var body = [],
		node = sliced.node,
		slicednodes = sliced.nodes,
		parsenode = node.parsenode,
	    bodynodes = node.edges_out.filter(function(e) {
		  return e.equalsType(EDGES.CONTROL)
			}).map(function(e) {return e.to});
	bodynodes.map(function (n) {
		var toSlice = new Sliced(slicednodes,n);
		toSlice.methods = sliced.methods;
		var bodynode = toMeteor(toSlice);
		if(slicedContains(slicednodes,n) && bodynode.parsednode) {
				body = body.concat(bodynode.parsednode)
		}
		slicednodes = removeNode(bodynode.nodes,n);	
	});
	slicednodes = slicednodes.remove(node);
	parsenode.body = body;
	sliced.parsednode = parsenode;
	sliced.nodes = slicednodes;
	return sliced;
}

var removeNode = function(nodes,node) {
	nodes = nodes.remove(node);
	var callnode = false;
	nodes.map(function(n) {
		if(n.parsenode) {
		var scopeInfo = Ast.scopeInfo(n.parsenode),
		    parent = Ast.hoist(scopeInfo).parent(n.parsenode,graphs.AST);
		if(n.isCallNode && (n.parsenode === node.parsenode || parent === node.parsenode)) {
			callnode = n
		}
	}
	});
	if(callnode) 
	  	return nodes.remove(callnode);
	else
		return nodes;
}

var slicedContains = function(nodes,node) {
 	return nodes.filter(function(n) {
		if(n.isCallNode) {
			return n.parsenode === node.parsenode
		} else
		return n.id === node.id
	}).length > 0
}


var toMeteor = function(sliced) {
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
		var s = meteorify_VarDecl(sliced);
		return s;
	  case "FunctionExpression":
	    return meteorify_FunExp(sliced);
	  case "FunctionDeclaration":
	    return meteorify_FunExp(sliced);
	  case "BlockStatement":
		return meteorify_BlockStm(sliced);
	  case "CallExpression":
	  	return meteorify_CallExp(sliced);
	  default: 
	    sliced.parsednode = node.parsenode;
	    return sliced;
    }
}

var meteorify = function(slicednodes, node) {
	return toMeteor(new Sliced(slicednodes,node))
}
