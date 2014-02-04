var sliceVarDecl = function(slicednodes,node) {
  	// Outgoing data dependency to entry node?
  	var entry = node.edges_out.filter(function(e) {
			return e.equalsType(EDGES.DATA) &&
	       	e.to.isEntryNode;
		}),
  		call = node.edges_out.filter(function(e) {
  			return e.equalsType(EDGES.CONTROL) &&
  			e.to.isCallNode;
  		})
        slicedn = slicednodes;
	if(entry.length > 0) {
     	var f = toJavaScript(slicednodes,entry[0].to);
	 	node.parsenode.declarations.init = f.parsednode;
	 	slicedn = f.nodes;
	}
	if(call.length > 0) {
		call.map(function(c) {
			var cnode = toJavaScript(slicedn,c.to);
			slicedn = removeNode(cnode.nodes,c.to);
		})
	}
	return new Sliced(slicedn,node,node.parsenode);
}

var sliceFunExp = function(slicednodes,node) {
	// Formal parameters
	var form_ins  = node.getFormalIn(),
		form_outs = node.getFormalOut(),
	    parsenode = node.parsenode,
	    params    = parsenode.params,
		sliced    = slicednodes;
	// Formal in parameters
	if(form_ins.length > 0) {
		// Remove parameters that are not in slicednodes
		for(var i = 0; i < form_ins.length; i++) {
			var fp = form_ins[i],
			     p = params[i];
			if(!slicedContains(slicednodes,fp)) {
				params.splice(i,1);
			}
			sliced = sliced.remove(fp);
		}
		parsenode.params = params;
	};
	// Formal out parameters
	form_outs.map(function(f_out) {
		sliced = sliced.remove(f_out)
	})
	// Body
	var body = [],
	    bodynodes = node.edges_out.filter(function(e) {
			return e.equalsType(EDGES.CONTROL) &&
			       e.to.isStatementNode || e.to.isCallNode;
	    }).map(function(e) {return e.to});
	bodynodes.map(function(n) {
		var bodynode = toJavaScript(sliced,n);
		if(slicedContains(sliced,n)) {
			body = body.concat(bodynode.parsednode);
		}
		sliced = removeNode(bodynode.nodes,n);
		
		});
	sliced = sliced.remove(node);
	parsenode.body.body = body;
	return new Sliced(sliced,node,parsenode);
}

var sliceCallExp = function(slicednodes,node) {
	var actual_ins  = node.getActualIn(),
		actual_outs = node.getActualOut(),	
		scopeInfo = Ast.scopeInfo(node.parsenode),
	    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
	actual_ins.map(function(a_in) {
		slicednodes = slicednodes.remove(a_in)
	})
	actual_outs.map(function(a_out) {
		slicednodes = slicednodes.remove(a_out)
	})
	return new Sliced(slicednodes, node,parent)
}

var sliceBlockStm = function(slicednodes,node) {
	var body = [],
		sliced = slicednodes,
		parsenode = node.parsenode,
	    bodynodes = node.edges_out.filter(function(e) {
		  return e.equalsType(EDGES.CONTROL)
			}).map(function(e) {return e.to});
	bodynodes.map(function (n) {
		var bodynode = toJavaScript(sliced,n);
		if(slicedContains(sliced,n)) {
				body = body.concat(bodynode.parsednode)
		}
		sliced = removeNode(bodynode.nodes,n);	
		});
	sliced = sliced.remove(node);
	parsenode.body = body;
	return new Sliced(sliced, node, parsenode);
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


// Not distributed version.
var toJavaScript = function(slicednodes,node) {
	var scopeInfo = Ast.scopeInfo(node.parsenode),
	    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
	if(parent && parent.type === "ReturnStatement") {
		node.parsenode = parent
	}
	if(parent && parent.type === "ExpressionStatement" && node.parsenode.type != "CallExpression") {
		node.parsenode = parent
	}
	console.log("SLICE("+node.parsenode.type+") " + node.parsenode);
	switch (node.parsenode.type) {
      case "VariableDeclaration": 
		return sliceVarDecl(slicednodes,node);
	  case "FunctionExpression":
	    return sliceFunExp(slicednodes,node);
	  case "FunctionDeclaration":
	    return sliceFunExp(slicednodes,node);
	  case "BlockStatement":
		return sliceBlockStm(slicednodes,node);
	  case "CallExpression":
	  	return sliceCallExp(slicednodes,node);
	  default: 
	    return new Sliced(slicednodes,node,node.parsenode);
    }
}

