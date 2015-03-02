/****************************************************************
 *				 TRANSFORMATIONS FOR JAVASCRIPT					*
 *																*
 *  has no transformations for distributed setting,				*
 * 	but is meant to use for slicing only.						*
 *																*
 *  Supports CPS transformations								*
 *																*
 ****************************************************************/

var JSify = (function () {


	var makeShouldTransform = function (cps) {
			return function (call) {
				return cps
			}
		},

		makeTransformer = function (cps) {
		return {  AST        : graphs.AST, 
				  transformF : toJavaScript, 
				  callbackF  : JSParse.callback, 
				  asyncCallF : JSParse.RPC, 
				  asyncFuncF : JSParse.asyncFun,
				  shouldTransform : makeShouldTransform(cps) 
				}
	},
		module = {};

	/* Variable declaration  + Assignment Expression */
	var sliceVarDecl = function (slicednodes, node, cps) {
	  	var entry = node.edges_out.filter(function (e) {
				return e.equalsType(EDGES.DATA) &&
		       	e.to.isEntryNode;
			}),
	  		call = node.edges_out.filter(function (e) {
	  			return e.equalsType(EDGES.CONTROL) &&
	  			e.to.isCallNode;
	  		}),
	        slicedn = slicednodes;
	    /* Outgoing data dependency to entry node? */
		if(entry.length > 0) {
	     	var f = toJavaScript(slicednodes,entry[0].to, cps);
	     	if (esp_isVarDecl(node.parsenode))
		 		node.parsenode.declarations[0].init = f.parsednode;
		 	else if (esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
		 		node.parsenode.right = f.parsednode; 
		 	slicedn = f.nodes;
		}
		/* Has call nodes in value? */
		if(call.length > 0) {
			var transformer = makeTransformer(cps),
				cpsvar		= CPSTransform.transformExp(node, slicedn, transformer)
			if (cpsvar[1])
				return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
			else 
				return new Sliced(slicedn, node, node.parsenode)
		}
		return new Sliced(slicedn, node, node.parsenode);
	}


	/* Binary expression */
	var sliceBinExp = function (slicednodes, node, cps) {
		var call = node.edges_out.filter(function (e) {
						return  e.equalsType(EDGES.CONTROL) &&
								e.to.isCallNode
				   });
		if (call.length > 0) {
			var transformer = makeTransformer(cps),
				cpsvar		= CPSTransform.transformExp(node, slicednodes, transformer)
			return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
		}

		return new Sliced(slicednodes, node, node.parsenode)
	}

	/* Function Expression */
	var sliceFunExp = function (slicednodes, node, cps) {
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
		form_outs.map(function (f_out) {
			sliced = sliced.remove(f_out)
		})
		// Body
		var body = [],
		    bodynodes = node.edges_out.filter(function (e) {
				return e.equalsType(EDGES.CONTROL) &&
				       e.to.isStatementNode || e.to.isCallNode;
		    }).map(function (e) {return e.to});
		bodynodes.map(function (n) {
			var bodynode = toJavaScript(sliced, n, cps);
			if(slicedContains(sliced,n)) {
				body = body.concat(bodynode.parsednode);
			}
			sliced = removeNode(bodynode.nodes,n);
			
			});
		sliced = sliced.remove(node);
		parsenode.body.body = body;
		if (cps) {
			var transformer = makeTransformer(cps),
				cpsfun      = CPSTransform.transformFunction(node, sliced, transformer);
			return new Sliced(cpsfun[0], node, cpsfun[1].parsenode)
		}
		return new Sliced(sliced, node, parsenode);
	}

	var sliceCallExp = function (slicednodes, node, cps) {
		var actual_ins  = node.getActualIn(),
			actual_outs = node.getActualOut(),	
			scopeInfo 	= Ast.scopeInfo(node.parsenode),
		    parent 		= Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
		actual_ins.map(function (a_in) {
			slicednodes = slicednodes.remove(a_in)
		})
		actual_outs.map(function (a_out) {
			slicednodes = slicednodes.remove(a_out)
		})
		if (cps) {
			var transformer = makeTransformer(cps),
				cpscall		= CPSTransform.transformCall(node, slicednodes, transformer);
			return new Sliced(cpscall[0], node, cpscall[1].parsenode)
		}
		return new Sliced(slicednodes, node, parent)
	}

	var sliceBlockStm = function (slicednodes, node, cps) {
		var body = [],
			sliced = slicednodes,
			parsenode = node.parsenode,
		    bodynodes = node.edges_out.filter(function (e) {
			  return e.equalsType(EDGES.CONTROL)
				}).map(function (e) {return e.to});
		bodynodes.map(function (n) {
			var bodynode = toJavaScript(sliced,n, cps);
			if(slicedContains(sliced,n)) {
					body = body.concat(bodynode.parsednode)
			}
			sliced = removeNode(bodynode.nodes,n);	
			});
		sliced = sliced.remove(node);
		parsenode.body = body;
		return new Sliced(sliced, node, parsenode);
	}

	var removeNode = function (nodes, node, cps) {
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
		if(callnode) 
		  	return nodes.remove(callnode);
		else
			return nodes;
	}

	var slicedContains = function (nodes, node, cps) {
	 	return nodes.filter(function (n) {
			if(n.isCallNode) {
				return n.parsenode === node.parsenode
			} else
			return n.id === node.id
		}).length > 0
	}


	// Non distributed version.
	var toJavaScript = function (slicednodes, node, cps) {
		if(node.isActualPNode || node.isFormalNode) {
			return new Sliced(slicednodes, node, false);
		}
		var scopeInfo = Ast.scopeInfo(node.parsenode),
		    parent = Ast.hoist(scopeInfo).parent(node.parsenode,graphs.AST);
		if(parent && esp_isRetStm(parent)) {
			node.parsenode = parent
		}
		if(parent && esp_isExpStm(parent) && !(esp_isCallExp(node.parsenode))) {
			node.parsenode = parent
		}
		console.log('SLICE(' + node.parsenode.type + ') ' + node.parsenode);
		switch (node.parsenode.type) {
	      case 'VariableDeclaration': 
			return sliceVarDecl(slicednodes, node, cps);
		  case 'VariableDeclarator':
		    return sliceVarDecl(slicednodes, node, cps);
		  case 'FunctionExpression':
		    return sliceFunExp(slicednodes, node, cps);
		  case 'FunctionDeclaration':
		    return sliceFunExp(slicednodes, node, cps);
		  case 'BlockStatement':
			return sliceBlockStm(slicednodes, node, cps);
		  case 'CallExpression':
		  	return sliceCallExp(slicednodes, node, cps);
		  case 'BinaryExpression':
		  	return sliceBinExp(slicednodes, node, cps);
		  default: 
		  	if(esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
		  		return sliceVarDecl(slicednodes, node, cps)
		  	if(esp_isExpStm(node.parsenode) && esp_isBinExp(node.parsenode.expression))
				return sliceBinExp(slicednodes, node, cps)
		    return new Sliced(slicednodes, node, node.parsenode);
	    }
	}

	module.transpile = toJavaScript;

	return module;
})();