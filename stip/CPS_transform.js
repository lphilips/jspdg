/*
 * CPS_transform takes a Call Node (PDG node), that must
 * be transformed to CPS style call. 
 * @param call  		: the call node
 * @param nodes 		: nodes that are selected in the current program (slice)
 * @param transform     : object that contains
 * 							- transformF  : function used to transform nodes (e.g. to JavaScript, to Meteor, etc.)
 * 							- callbackF	  : function that creates a new callback function
 * 							- asyncCallF  : function that creates a new async call (e.g. normal with extra callback param, rpc, etc.)  
 *							- AST
 *							- cps         : boolean indicating whether cps transformations should happen
 */

var CPSTransform = (function () {

	var cps_count = 0,
		module = {};

	function transformCall(call, nodes, transform, upnode, esp_exp) {
		var asyncCall 	= transform.asyncCallF(),
			callback  	= transform.callbackF(cps_count),
			slicednodes = nodes,
			actual_ins  = call.getActualIn(),
			scopeInfo 	= Ast.scopeInfo(call.parsenode),
		    parent 		= Ast.hoist(scopeInfo).parent(call.parsenode, transform.AST),
		    callargs    = actual_ins.flatMap(function (a_in) {
							return a_in.callArgument()		
						}),
		    orig_esp_exp = esp_exp,
		    callbackstms = [],
		   	datadep = [],
		    datadeps, calldeps, vardecls, parsednode, transformargs, bodynode;

		/* Add original arguments to async call */
		actual_ins.map(function(a_in) {
			asyncCall.addArg(a_in.parsenode);
		})
		asyncCall.setName(call.name);

		/* Upnode is given + of type var decl, assignment, etc */
		if(upnode && upnode.dataDependentNodes) {
			/* Put it in callback, together with all statements dependent on the variable */
			datadeps = upnode.dataDependentNodes();
			if (!esp_exp) {
				esp_exp = CPSgetExpStm(upnode.parsenode)
			}
			if(transform.shouldTransform(call))
				/* Replace call by result parameter of callback (therefore we need the original expression,
				   stored in expression field ) */
				esp_exp = transformVar(esp_exp, call, escodegen.generate(upnode.expression[0].parsenode) , cps_count);
			callback.addBodyStm(upnode.parsenode);
			slicednodes = removeNode(slicednodes, upnode);
			/* Data depentent nodes */
			datadeps.map(function (node) {
				if(!(node.isActualPNode)) {
					/* Has the node other outgoing dependencies on call nodes/ var decls? 
					   If so, transform the dependence and add it to callback body */
					calldeps = node.edges_in.filter(function (e) {
	        					return  e.equalsType(EDGES.DATA) && 
	        							e.from.isCallNode && 
	        							e.from.cnt !== upnode.cnt
	        				}).map(function (e) { return e.from });
	        		vardecls  = node.edges_in.filter(function (e) {
	        					return  e.equalsType(EDGES.DATA) && e.from.parsenode && 
	        							e.from.cnt !== upnode.cnt &&
	        							esp_isVarDecl(e.from.parsenode) //TODO : assignment?
	        				}).map(function (e) { return e.from });

						datadep = datadep.concat(calldeps);
						datadep = datadep.concat(vardecls);
						datadep = datadep.concat(node); 
					datadep.map( function (n) {
					if (slicedContains(slicednodes, n)) {
	    				bodynode = transform.transformF(slicednodes, n, upnode); 
						slicednodes = bodynode.nodes;
						callbackstms = callbackstms.concat(bodynode);}
					})
				}
			})
		}
		/* Add the callback as last argument to the async call. */
		asyncCall.addArg(callback.parsenode)
		asyncCall.setCallback(callback);
		if(!(transform.shouldTransform(call))) { 
			if (upnode) 
				asyncCall.parsenode = upnode.parsenode ? upnode.parsenode : upnode;
			asyncCall.getCallback = false;
		}
		else {
			asyncCall.parsenode.cont = function (stm) {
				callback.setBody([stm].concat(callback.getBody().slice(1)))
			}
		}
		parsednode = asyncCall;
		transformargs = transformArguments(callargs, parsednode, slicednodes, transform, upnode, esp_exp, call);
		parsednode = transformargs[1];
		slicednodes = transformargs[0];
		/* transformation of arguments changed esp_exp? */
		if (transformargs[2] && esp_exp === orig_esp_exp) 
			esp_exp = transformargs[2];
		/* if argument is call that should not be transformed (but it has transformed arguments itself) 
		    replace it at the current callback */
		if (parsednode.upcall && parsednode.parsenode.orig) {
			asyncCall.replaceArg(parsednode.parsenode.orig.expression[0], parsednode.parsenode.orig.parsenode)
		}

		/* Add data and call dependencies in returned callback body */
		if (parsednode.getCallback && bodynode) {
			callbackstms.map(function (node) {
				/* Prevent data dependencies to be included double in nested callbacks.
				   Does not apply for transformed call statements */
				if (node.parsednode.cont || slicedContains(slicednodes, node.node)) {
					parsednode.getCallback().addBodyStm(node.parsednode)
					slicednodes = removeNode(slicednodes, node.node)
				}
			})
		}
		return [slicednodes, parsednode, esp_exp]
	}

	/*
	 * Walks over arguments of a call. If any (or more) of the arguments is a call,
	 * they should be transformed as well.
	 * The resulting transformation is inside out => c1(c2(c3(c4))) will be transformed to
	 * first c4, then c3 with the result of c4, then c2 with the result of c3, then c1 with
	 * the result of c2.
	 */
	var transformArguments = function (callargs, parsednode, slicednodes, transform, upnode, orig_esp_exp, call) {
		/* Call node has arguments that are calls? */
		if (callargs.length > 0) {
			var latestcall = parsednode,
				esp_exp;
			callargs.map(function (callarg) {
					cps_count++;
					var cnode          = transformCall(callarg, slicednodes, transform, upnode), //transform.transformF(slicednodes, callarg, transform.cps),
					    hasCallArg     = callarg.getActualIn().flatMap(function (a_in) {
											return a_in.callArgument()		
										}),
					    callbackbody   = cnode[1].getCallback ? cnode[1].getCallback().getBody().slice(1) : [],
					    transformcall  = cnode[1].parsenode,
					    transformrpc   = transform.asyncCallF(),
					    transformcallb = transform.callbackF(cps_count);
					
					/* Call transformation resulted in change in esprima expression? */
					if (cnode[2] && cnode[2] !== orig_esp_exp) {
						esp_exp = cnode[2];
						CPSsetExpStm(upnode.parsenode, cnode[2]);
					}

					if (!transform.shouldTransform(call) && cnode[1].getCallback) {
						/* Respar is {type : 'identifier', name : 'resx'} */
						var respar = transformcall.respar ? transformcall.respar : cnode[1].getCallback().getResPar();
						var	transf = transformVar(call.parsenode, callarg, escodegen.generate(call.expression[0]), respar.name.slice(-1));
						transformrpc.upcall = transf;
						call.parsenode = transf;
					} else if (cnode[1].upcall) {
						transformrpc.upcall = cnode[1].upcall;
					}
					/* Has transformed call arguments itself? */
					if (hasCallArg.length > 0) {
						if(transformcall.cont && latestcall.getCallback) 
							transformcall.cont(latestcall.parsenode);

						transformrpc.parsenode = transformcall;
						transformrpc.parsenode.cont = transformcall.cont;

						if (transform.shouldTransform(callarg)) {
							/* Replace original call argument with the result parameter of its rpc callback */
							if (latestcall.replaceArg) {
								latestcall.replaceArg(callarg.parsenode, cnode[1].parsenode.respar);
							}
						} else {
							call.parsenode = transformSubExp(call.parsenode, callarg.expression[0], callarg.parsenode, call.expression[0])
						}

						latestcall = transformrpc;

					} else {
						(function (lc) { /* wrap in function to get ref to current latestcall, not to latestcall when calling the cont function*/
							var cont = function (stm) {
								if (lc.parsenode.cont)
		 							lc.parsenode.cont(stm)
		 						else if (lc.getCallback)
		 							lc.getCallback().setBody([stm])
		 						/* latest call from this moment was not transformed, take a look at latestcall when function will be called */
		 						else if (latestcall.getCallback)
		 							latestcall.getCallback().setBody([stm]);
							}
							transformcall.cont = cont;
							if(lc.getCallback && lc.getCallback())
								transformcall.respar = lc.getCallback().getResPar()
							else
								transformcall.respar = transformcallb.getResPar();
						})(latestcall);

						if (transform.shouldTransform(callarg)) {
							transformrpc.parsenode = transformcall;
							transformcallb.addBodyStm(latestcall.parsenode);
							callbackbody.map(function (parsenode) {
								transformcallb.addBodyStm(parsenode)
							})
							transformrpc.updateCallback(transformcallb);
							/* Latest call got transformed? */
							if (latestcall.getCallback) {
								/* Replace original call argument with the result parameter of its rpc callback */
								if (latestcall.replaceArg) {
									latestcall.replaceArg(callarg.parsenode, transformcallb.getResPar());
								}
							}
							//else {
								/* If not transformed, we must replace the current call with the res+x parameter in the 
								   original call expression (parameter call) */
							//	var transf = transformVar(call.parsenode, callarg.expression[0], escodegen.generate(call.parsenode), cps_count)
							//	transformrpc.parsenode.respar = transf;
							//}

							latestcall = transformrpc;

							latestcall.parsenode.orig = call;
						}
					}
					slicednodes = removeNode(cnode[0], callarg);
				})
				parsednode = latestcall;
		}
		return [slicednodes, parsednode, esp_exp];

	}

	var transformFunction = function (func, nodes, transform) {
		var method    = transform.asyncFuncF(),
			parsenode = func.parsenode,
			scopeInfo = Ast.scopeInfo(parsenode),
		    parent 	  = Ast.hoist(scopeInfo).parent(parsenode, transform.AST),
			funcstr   = escodegen.generate(parent);
			
			/* Return statement in body should be replaced by callback call */
			func = falafel(funcstr, function (n) {
				// TODO check parent (don't transform return statement in nested function def)
				if (esp_isRetStm(n)) 
					/* First argument of callback is error */
					n.update('callback(null, ' + n.argument.source() + ')')
			})
			method.setBody(esprima.parse(func.toString()).body[0].expression.right.body.body);
			/* Parameters: callback should be added */
			method.addParams(parsenode.params.addLast({'type' : 'Identifier', 'name' : 'callback'}));
			return [nodes, method]
	}

	/* Used for expression with calls :
	 * variable declarations, assignments, binary expressions (currently supported by Jipda) 
	 */

	var transformExp = function (node, nodes, transform) {
		var parsenode = node.parsenode,
			calls 	  = node.edges_out.filter(function (e) {
							return  e.equalsType(EDGES.CONTROL) &&
									e.to.isCallNode
						}),
			local_count = cps_count,
			outercps, innercps;
		cps_count = 0;
		calls.map( function (edge) {
			var call = edge.to;
			cps_count += 1;
			if (slicedContains(nodes, call)) {
				var exp = CPSgetExpStm(parsenode),
					cps = transformCall(call, nodes, transform, node, exp);
					if (cps[2]) CPSsetExpStm(parsenode, cps[2]);
	  				nodes = removeNode(cps[0], call);
	  				if (outercps) {
	  					var callback = outercps.callback;
	  					if(innercps) {
	   						var body = innercps.callback.getBody();
	  						cps[1].callback.setBody(cps[1].callback.getBody().concat(body.slice(1)));
	  						innercps.callback.setBody([cps[1].parsenode]);
	  						innercps = cps[1];
	  					}
	  					else {
	  						var body     = callback ? callback.getBody() : false,
	  						    /* First statement from previous callback should be transformed var decl,
	  							   where previous call is replaced by resx. */
	  						    firstStm = body ? (body.length > 0 ? body[0] : false) : node.parsenode;
	  						if (outercps.parsenode.cont) {
	  							if( cps[1].getCallback)
	  								outercps.parsenode.cont(cps[1].parsenode)
	  						}	  					
	  					}
	  				} 
	  				/* If transformed, change the outercps */
	  				else if (cps[1].getCallback)
	  					outercps =  cps[1];
	  			}
	  		})
	  	cps_count = local_count;
	  	if (outercps)
	  		return [nodes, outercps]
	  	else
	  		return [nodes, node]
	}


	var CPSgetExpStm = function (parsenode) {
		if(esp_isVarDecl(parsenode))
	      	return parsenode.declarations[0].init

	    else if (esp_isExpStm(parsenode)) {
	    	var exp = parsenode.expression;
	    	if (esp_isAssignmentExp(exp)) 
	    		return exp.right 
	    	else if (esp_isBinExp) 
	    		return exp
	    }
	}


	var CPSsetExpStm = function (parsenode, newexp) {
		if(esp_isVarDecl(parsenode))
	      	parsenode.declarations[0].init = newexp

	    else if (esp_isExpStm(parsenode)) {
	    	var exp = parsenode.expression;
	    	if (esp_isAssignmentExp(exp)) 
	    		exp.right = newexp
	    	else if (esp_isBinExp) 
	    		parsenode.expression = newexp
	    }
	}


	/* Aux function : replaces occurence of expression with "resx" paremeter */
	var transformVar = function (expression, toreplace, originalexp, cnt) {
		// Change expression
		/*var r_idxs = toreplace.parsenode.range[0],
			r_idxe = toreplace.parsenode.range[1],
			e_idxs = expression.range[0],
			e_idxe = expression.range[1],
			e_str  = escodegen.generate(expression);

	    if(originalexp.length !== e_str.length) {
	        var diff = originalexp.length - e_str.length;
	        r_idxs = r_idxs - diff;
	        r_idxe = r_idxe - diff;
	    }
		var	newexp = e_str.slice(0,r_idxs-e_idxs) + 'res' + cnt + e_str.slice(r_idxe + 1 - e_idxs),
			parsed = esprima.parse(newexp).body[0].expression;*/
	    //parsed.range = [e_idxs, e_idxs + newexp.length];
	    //parsed.range = toreplace.parsenode.range;
	    var e_str = escodegen.generate(expression),
	        r_str = escodegen.generate(toreplace.parsenode),
	        idx   = e_str.indexOf(r_str),
	        newexp, parsed;
	    if (idx > 0) {
	    	newexp = e_str.slice(0,idx) + 'res' + cnt + e_str.slice(idx + r_str.length);
	    	parsed = esprima.parse(newexp).body[0].expression;
	 	   return parsed;
		}
		else {
			return expression;
		}
	}


	var transformSubExp = function (expression, toreplace, newsubexp, originalexp) {
		var r_idxs = toreplace.range[0],
			r_idxe = toreplace.range[1],
			e_idxs = expression.range[0],
			e_idxe = expression.range[1],
			e_str  = escodegen.generate(expression),
			orig   = escodegen.generate(originalexp);
		if(orig.length !== e_str.length) {
	        var diff = orig.length - e_str.length;
	        r_idxs = r_idxs - diff;
	        r_idxe = r_idxe - diff;
	    }
	    var newexp = e_str.slice(0, r_idxs-e_idxs) + escodegen.generate(newsubexp) + e_str.slice(r_idxe + 1 - e_idxs),
	    	parsed = esprima.parse(newexp).body[0].expression;
	    parsed.range = toreplace.range;
	    return parsed;
	}

	var slicedContains = function (nodes,node) {
	 	return nodes.filter(function (n) {
			if(n.isCallNode) {
				return n.parsenode === node.parsenode
			} else
			return n.id === node.id
		}).length > 0
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


	module.transformCall      = transformCall;
	module.transformArguments = transformArguments;
	module.transformFunction  = transformFunction;
	module.transformExp       = transformExp;
	module.setExpStm          = CPSsetExpStm;

	return module;

})();
