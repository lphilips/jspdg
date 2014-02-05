// Aux function
var contains = function(els,el) {
	return els.filter(function(e) {
		return e.equals(el)			
	}).length >= 1;
}

// Predicates on type of eval node
var isFunExp = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "FunctionExpression"
}
var isVarDecl = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "VariableDeclaration"
}

var isFunDecl = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "FunctionDeclaration"
}

var isIdentifier = function(graphs,node) {
	return node.type === "eval" &&
	       node.node.type === "Identifier"
}
// Return statements can be an eval state OR
// the eval state can be skipped in the Jipda graph.
// In the latter case, its (ast)parent will be a return statement
var isRetStm = function(graphs,node) {
	var scopeInfo = Ast.scopeInfo(node.node),
	    parent = Ast.hoist(scopeInfo).parent(node.node,graphs.AST);
	return node.node.type === "ReturnStatement"// || 
	    // (parent && parent.type === "ReturnStatement");
}

var isBinExp = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "BinaryExpression"
}

var isLiteral = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "Literal"
}

var isCallExp = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "CallExpression"
}

var isExpStm = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "ExpressionStatement"
}

var isAssignmentExp = function(graphs,node) {
	return node.type === "eval" &&
		   node.node.type === "AssignmentExpression"
}

var isApply = function(graphs,node) {
	return node.type === "apply"
}

var isBlockStm = function(graphs,node) {
	return node.type === "eval" &&
	       node.node.type === "BlockStatement"
}

var isIfStm = function(graphs,node) {
	return node.type === "eval" &&
		node.node.type === "IfStatement"
}


var isOperandKont = function(edge) {
	return edge.g && edge.g.frame && edge.g.frame.node && 
	       edge.g.frame.node.type === "CallExpression" &&
	       edge.g.frame.operandValues;
}



// General pattern for handling a statement:
// Given a set of frames of push edges, we continue until
// the corresponding pop edge is found.
// For every state in between, we make a DPG node and continue
// from where that DPG node ended.
// We return the last state this function looked at.
var handleStm = function(graphs, incoming, node, stm_node, addJtc,toadd) {
	var cont = node,
	    etg = graphs.etg(),
	    jtc = graphs.JTC,
	    out = etg.outgoing(node);
	while(out.length>0) {
		var edge = out.shift(),
		    target = edge.target;
		if(edge.g && edge.g.isPop && contains(incoming, edge.g.frame))
		   break;
		else {
			var PDG_node;
			if(addJtc)
			  	PDG_node = makePDGNode(graphs, target, toadd, addJtc);
			else
				PDG_node = makePDGNode(graphs, target, toadd, stm_node);
			if(PDG_node) {
				if(addJtc)
				  jtc.addNodes(PDG_node[0],addJtc)
				else
				  jtc.addNodes(PDG_node[0], PDG_node[1]);
				if (PDG_node[1] && !PDG_node[1].isCallNode && toadd) {
					  stm_node.add_edge_out(PDG_node[1], EDGES.CONTROL);
					}
				else {
					stm_node.expression = stm_node.expression.concat(PDG_node[1]);
				}
				target = PDG_node[0];
			}
			out = out.concat(etg.outgoing(target));
			cont = target;
		}
	}
	return cont;
}

// VARIABLE DECLARATION is followed by one/more variable declarator(s)
// Edges are marked (+) (-) vrator
var handleVarDecl = function(graphs, node, stm_node,upnode) {
	var etg = graphs.etg(), 
	    jtc = graphs.JTC,
	    out = etg.outgoing(node);
	jtc.addNodes(node,stm_node);
	if(upnode) 
		stm_node.dtype = upnode.getdtype();
	var vrators = out.map(function(e) {
		return e.g.frame;
	});
	var cont = handleStm(graphs, vrators,node,stm_node,stm_node,false);	
	return [cont,node];     
}

// RETURN STATEMENT is either a return eval state, followed by a RetKont edge (+ ret)
// or an eval state with an incoming RetKont edge;
var handleReturnStm = function(graphs,node,stm_node,upnode) {
	var etg = graphs.etg(),
		jtc = graphs.JTC,
		incoming = etg.incoming(node),
		outgoing = etg.outgoing(node);
	jtc.addNodes(node,stm_node);
	if(node.node.type === "ReturnStatement")
		incoming = etg.outgoing(node);
	var returns = incoming.filter(function(e) {
		return e.g && e.g.frame;
	}).map(function(e) { return e.g.frame});
	var cont = handleStm(graphs, returns, node, stm_node,upnode),
	    formout = handleFormalOutParameters(graphs,stm_node);
	stm_node.add_edge_out(formout, EDGES.DATA);
	return [cont,node];
}

// BINARY EXPRESSION has left edges continued by right edges;
// Bundled by body edges
var handleBinExp = function(graphs,node,stm_node,upnode) {
	var etg = graphs.etg(),
	    jtc = graphs.JTC,
	    incoming = etg.incoming(node),
	    outgoing = etg.outgoing(node),
	    bodys = incoming.filter(function(e) {
		          return e.g && e.g.frame
				}).map(function(e) {
				  return e.g.frame;
				}),
		cont = handleStm(graphs, bodys, node, stm_node,upnode);
	jtc.addNodes(node,stm_node);
	return [cont,node];
}

// ASSIGNMENT
var handleAssignmentExp = function(graphs,node,stm_node) {
	var etg = graphs.etg(),
	    jtc = graphs.JTC,
	    incoming = etg.incoming(node),
	    outgoing = etg.outgoing(node),
	    asids = outgoing.filter(function(e) {
			return e.g && e.g.frame
		}).map(function(e) {
			return e.g.frame
		}),
		id = node.node.left,
		cont = handleStm(graphs,asids,node,stm_node);
	node.node = id;
	declarations = graphs.DSG.declarations(node);
	handleIdentifier(graphs,node,stm_node);
	if(declarations)
		jtc.addNodes(declarations[0],stm_node);
	return [cont,node];
}


// IF STATEMENT
var handleIfStatement = function(graphs,node,stm_node,entry) {
	var PDG = graphs.PDG,
		etg = graphs.etg(),
		jtc = graphs.JTC,
		parsenode = node.node,
		consequent = parsenode.consequent,
		alternate = parsenode.alternate,
		outgoing = etg.outgoing(node),
		ifs = outgoing.filter(function(e) {
			return e.g && e.g.frame
		}).map(function (e) {
			return e.g.frame
		}),
		cont = handleStm(graphs,ifs,node,stm_node);
		jtc.addNodes(node,stm_node);
		var nextEval = function(start,n) {
			if (!(start.equals(n)) && n.type === "eval")
				return n
			else {
				next = etg.outgoing(n);
				if (next.length > 0) 
				  	return nextEval(start,next[0].target)
				else 
					return false
			}
		},
			entryHasIf = entry.edges_out.filter(function (e) {
				return e.to.isStatementNode && e.to.parsenode === stm_node.parsenode
			}),
			hasbranch = function(node,branchnode) {
				return stm_node.edges_out.filter(function(e) {
					return e.to.parsenode && e.toparsenode === branchnode;
				}).length > 0;
			},
			next = nextEval(cont,cont);
		if(entryHasIf.length > 0) {
			// Remove all incoming (data) edges to newly created if stm
			var froms = stm_node.edges_in.map(function(e) {return e.from});
			froms.map(function(n) {n.remove_edge_out(stm_node)});
			stm_node.edges_in = [];
			stm_node = entryHasIf[0].to;
		}
		if(next) {
			var contnode = makePDGNode(graphs,next,false,entry); 
			// Add consequent if not already added
			if(next.node === consequent && !(hasbranch(stm_node,consequent))) {
				stm_node.add_edge_out(contnode[1], EDGES.CONTROL, true)
			}
			// Add alternate if not already added
			else if (next.node === alternate && !(hasbranch(stm_node,alternate))) {
				stm_node.add_edge_out(contnode[1], EDGES.CONTROL,false)	
			}
			if(entryHasIf.length > 0) 
				node = false;
			return [contnode[0],node];
		}
		return [cont,node];
}

// BLOCK STATEMENT:
// Consists of several statements surrounded by corresponding 
// push and pop body edges
var handleBlockStatement = function(graphs,node,entry,toadd) {
	var PDG = graphs.PDG,
	    etg = graphs.etg(),
	    parsenode = node.node,
	    old_entry = PDG.entry_node,
	    new_entry = new EntryNode(PDG.ent_index,node.node),
	    outgoing = etg.outgoing(node),
	    bodys = outgoing.filter(function(e) {
			return e.g && e.g.frame
		}).map(function(e) {
			return e.g.frame
		}),
		addUnder = function(n) {
			if (n.isEntryNode)
			  new_entry.add_edge_out(n, EDGES.CONTROL);
		},
		nextEval = function(start,n) {
			if (!(start.equals(n)) && n.type === "eval") 
				return n
			else {
				next = etg.outgoing(n);
				if (next.length > 0) 
				  	return nextEval(start,next[0].target)
				else 
					return false
			}
		};
	if(toadd)
		addToPDG(new_entry);
	PDG.change_entry(new_entry);
	PDG.curr_body_node = old_entry;
	var out = etg.outgoing(node);
    while (out.length>0 ) { 
	    var edge = out.shift(),
	           n = edge.target;
		var pdgnode = makePDGNode(graphs,n,true,new_entry); 
		if (pdgnode) {
			var cont = pdgnode[0];
			var contnode = pdgnode[1];
			addUnder(contnode);
			var next = nextEval(cont,cont);
			if(next) {
				var scopeInfo = Ast.scopeInfo(next.node),
	    			parent = Ast.hoist(scopeInfo).parent(next.node,graphs.AST);
					if (!(parent.type === "BlockStatement" && 
		           	parsenode.body.toString() === parent.body.toString()))
						break;
				out = out.concat(etg.outgoing(cont));
			}
			else 
			  	break; 
		}
		else 
			out = out.concat(etg.outgoing(n));
	}
	PDG.reverse_entry(entry);
	return [cont,new_entry]
}


// ACTUAL PARAMETER of a function call.
// This handles only one parameter. 
// handleActualParameters is used to handle all parameters
// and makes use of this function
var handleActualParameter = function(graphs, node, stm_node) {
	var etg = graphs.etg(),
	    PDG = graphs.PDG,
	    incoming = etg.incoming(node),
	    outgoing = etg.outgoing(node),
	    operands = outgoing.filter(function(e) {
		          return e.g && e.g.frame
				}).map(function(e) {
				  return e.g.frame;
				}),
		cont = node,
		a_in = new ActualPNode(PDG.fun_index,1,stm_node);
	graphs.PDG.fun_index++;
	while(outgoing.length > 0) {
		var edge = outgoing.shift(),
		    target = edge.target;
		if(edge.g && edge.g.isPop && contains(operands,edge.g.frame)) {
		  a_in.value = target.value.prim.cvalue;
		  break;
		}
		else {
			var PDG_node = makePDGNode(graphs,target,false,a_in);
			outgoing = outgoing.concat(etg.outgoing(target));
			cont = target;
		}
	}
	return [cont,a_in];
}


// ACTUAL PARAMETERS of a function call.
// All parameters are bundled by operand continuation edges
var handleActualParameters = function(graphs,node) {
	var nr_param = node.node.arguments.length,
	    etg = graphs.etg(),
	    outgoing = etg.outgoing(node);
	    push = undefined;
	    cont = node,
	    params = [],
	    curr_param = 0;
	while(outgoing.length > 0 && nr_param != curr_param) {
		var edge = outgoing.shift();
		var target = edge.target;
		if(edge.g && edge.g.isPush && isOperandKont(edge)) {
			push = edge.g.frame;
			var param = handleActualParameter(graphs, edge.source,node.node.arguments[curr_param]);
			curr_param++;
			params = params.concat(param[1]);
			target = param[0];
		}
		outgoing = outgoing.concat(etg.outgoing(edge.target));
		cont = target;
	}	
	return [cont,params];
}

// FORMAL PARAMETERS of a function definition.
// This is handled on AST level (parsenode.params)
var handleFormalParameters = function(graphs, node, entry) {
	var nr_params = entry.parsenode.params.length,
	    PDG = graphs.PDG,
	    params = entry.parsenode.params;
	for(var i = 0; i < nr_params; i++) {
		var param = params[i],
		    fin_node = new FormalPNode(PDG.fun_index, param.name, 1);
		PDG.fun_index++;
		entry.add_edge_out(fin_node, EDGES.CONTROL); 
	}
}

var handleFormalOutParameters = function(graphs,stm_node) {
	var PDG = graphs.PDG,
	    entry = PDG.curr_body_node,
	    form_out = new FormalPNode(PDG.fun_index,stm_node.parsenode.toString(), -1);
	PDG.fun_index++;
	entry.add_edge_out(form_out, EDGES.CONTROL);
	return form_out;
}

// Summary edges are added between actual_in to actual_out parameter if
// a path between the corresponding formal_in to formal_out exists
var handleSummaryEdges = function(callnode,entrynode) {
	var actual_ins = callnode.getActualIn(),
	    actual_out = callnode.getActualOut(),
	    formal_ins = entrynode.getFormalIn(),
	    formal_out = entrynode.getFormalOut();
	if(actual_out.length > 0 && formal_out.length > 0) {
		formal_out = formal_out[0];
		actual_out = actual_out[0];
		for(var i = 0; i < actual_ins.length; i++) {
			var actual_in = actual_ins[i],
			    formal_in = formal_ins[i];
			if(formal_in.pathExistsTo(formal_out)) {
				actual_in.add_edge_out(actual_out, EDGES.SUMMARY)
			}
		}
	}
}


// FUNCTION DECLARATION creates a new entry node in the DPDG
var handleFuncDeclaration = function(graphs, node, entry) {
	var PDG = graphs.PDG,
	    jtc = graphs.JTC,
	    entry = new EntryNode(PDG.ent_index, node.node),
	    prev_entry = PDG.entry_node;
	PDG.change_entry(entry);
	handleFormalParameters(graphs,node,entry);
	// Body isn't evaluated, so switch back to previous entry node
	PDG.reverse_entry(prev_entry);
	jtc.addNodes(node,entry);
	return [node,entry];
}

// IDENTIFIER doesn't create a new statement node, but can 
// result in a data edge to the corresponding declaration
// or formal parameter
var handleIdentifier = function(graphs,node,entry) {
	var PDG = graphs.PDG,
	    jtc = graphs.JTC,
	    DSG = graphs.DSG,
        declarations = graphs.DSG.declarations(node),
	    stm = PDG.make_stm(node.node),
	    declarationNode = declarations[0],
		formp = PDG.entry_node.getFormalIn();
	
	formp = formp.filter(function(f) {
		return f.name === node.node.name;
	});
	if(formp.length > 0) 
		addDataDep(formp[0],entry)
	else if (declarationNode) {
		var PDG_nodes = jtc.getNode(declarationNode);
		if (PDG_nodes && PDG_nodes.length > 0 && entry) 
			PDG_nodes.map(function(c) {
				addDataDep(c,entry)
			})
	}
}

// ANONYMOUS FUNCTION DECLARATION bound to a variable
// creates a entry node and data dependency on the variable
var handleAnonFuncDeclaration = function(graphs, node, entry,toadd, successors) {
	var PDG = graphs.PDG,
	    jtc = graphs.JTC,
	    // Statement node of the variable declaration
	    stm_node = PDG.make_stm(node.node),
        next_node = successors[0],
        // Entry node for the function
        entry_node = new EntryNode(PDG.ent_index, next_node.node),
        prev_entry = PDG.entry_node;
	PDG.change_entry(entry_node);
	// Body isn't evaluated, so switch back to previous entry node
    PDG.reverse_entry(prev_entry);
    stm_node.add_edge_out(entry_node, EDGES.DATA);
	jtc.addNodes(node,stm_node);
	jtc.addNodes(next_node, entry_node);
	handleFormalParameters(graphs,node,entry_node);
	if(toadd)
 		addToPDG(stm_node);
	return [next_node,stm_node];
}

var addToPDG = function(node) {
	if(isClientAnnotated(node.parsenode))
	  graphs.PDG.addClientStm(node)
	else if(isServerAnnotated(node.parsenode))
	  graphs.PDG.addServerStm(node)
	else {
	  graphs.PDG.entry_node.add_edge_out(node, EDGES.CONTROL)
	}
}

var addCallDep = function(from,to) {
	var dtypef = from.getdtype(),
	    dtypet = to.getdtype();
	if(dtypef && dtypet && 
	    dtypef.value != dtypet.value) 
		from.add_edge_out(to, EDGES.REMOTEC)
	else
		from.add_edge_out(to, EDGES.CALL)
}

var addDataDep = function(from,to) {
	var dtypef = from.getdtype(),
	    dtypet = to.getdtype();
	if(dtypef && dtypet && 
	    dtypef.value !== dtypet.value) 
		from.add_edge_out(to, EDGES.REMOTED)
	else
		from.add_edge_out(to, EDGES.DATA)
}

var makePDGNode = function(graphs,node,toadd,upnode) {
	var etg = graphs.etg(),
	    PDG = graphs.PDG,
	    jtc = graphs.JTC;
	if(node.type === "eval") {
		var parsetype = node.node.type;
		console.log("PDG(" + parsetype + ")");
		if(parsetype != "Program") {
			var successors = etg.successors(node);
			// Function declaration
			if(isFunDecl(graphs,node)) {
				return handleFuncDeclaration(graphs,node,upnode);
			}			
			// var functionname = function() {}
			else if (isVarDecl(graphs,node) && successors.length > 0 &&
	                 isFunExp(graphs,successors[0])) {
		    	return handleAnonFuncDeclaration(graphs,node,upnode,toadd,successors);
	        }	
			// block
			else if (isBlockStm(graphs,node)) {
				return handleBlockStatement(graphs,node,upnode,toadd)
			}
			// Identifier
			else if(isIdentifier(graphs,node)) {		
				if(isRetStm(graphs,node)) {
					var stm_node = PDG.make_stm(node.node);
					handleIdentifier(graphs,node,stm_node);
					return [node,stm_node]
				}
				handleIdentifier(graphs,node,upnode);
				return
			}
			// Call expression
			else if (isCallExp(graphs,node)) {
				// Handle actual parameters of this call
				var params = handleActualParameters(graphs,node);
				var node = params[0];
				// Move to Jipda node with type apply
				while(node.type !== "apply") {
					node = etg.outgoing(node)[0].target;
				};
				// Create the call node
				// When this is the first time the function is called,
				// it will result in evaluating the body 
				var callnode = makePDGNode(graphs,node,false, upnode);
				var entry = callnode[2];
				var formal = entry.getFormalIn();
				// Bind the actual and formal parameters
				for(var i = 0; i < params[1].length; i++) {
					var a = params[1][i],
					    f = formal[i];
					// Call node -> actual-in parameter
					callnode[1].add_edge_out(a, EDGES.CONTROL);
					// actual-in parameter -> formal-in parameter
					a.add_edge_out(f,EDGES.PARIN);
				}
				// Actual out parameter: connect with formal_out parameters
				// For each actual parameter a that is a variable, rather than an expression
				/*var a_ins = callnode[1].getActualIn(),
				    f_outs = entry.getFormalOut();
				for(var i = 0; i < a_ins.length; i++) {
					var a_in = a_ins[i],
					    f_out = f_outs[i];
					// TODO also expressions with identifier in
					if(a_in.parsenode.type === "Identifier" ) {
						var a_out = new ActualPNode(PDG.fun_index,-1,a_in.parsenode);
						PDG.fun_index++;
						callnode[1].add_edge_out(a_out, EDGES.CONTROL);
						f_out.add_edge_out(a_out, EDGES.PAROUT);
					}
				}*/
				var cont = callnode[0];
			    while(cont.type != "return") {
					out = etg.outgoing(cont);
					if(out.length > 0)
						cont = etg.outgoing(cont)[0].target;
					else {
					   cont = false;
					   break;
					}
				}
				if (cont) {
					callnode[0] = cont;
					var actual_out = new ActualPNode(PDG.fun_index,-1);
					actual_out.value = cont.node.toString();
					PDG.fun_index++;
					// Formal-out parameter -> actual-out parameter
					var formal_out = entry.getFormalOut();
					if(formal_out.length > 0) 
					   formal_out[0].add_edge_out(actual_out, EDGES.PAROUT); 
					callnode[1].add_edge_out(actual_out, EDGES.CONTROL);  
				}
				// Add summary edges between a_in and a_out
				handleSummaryEdges(callnode[1],entry);
				entry.addCall(callnode[1]);
				console.log(entry);
				return callnode;
			}
			// Other types of nodes (Statement Nodes)
			else {
				var stm_node = PDG.make_stm(node.node),
				    cont;
				// Return statement
				if (isRetStm(graphs,node)){
					    cont = handleReturnStm(graphs,node,stm_node)[0];	
				}

				// Literals
				else if (isLiteral(graphs,node)) {
					// TODO: special case
					var scopeInfo = Ast.scopeInfo(node.node),
	    				parent = Ast.hoist(scopeInfo).parent(node.node,graphs.AST);
					if(parent && parent.type === "ReturnStatement" && 
						upnode.parsenode && upnode.parsenode.type !== "ReturnStatement") {
						cont = handleReturnStm(graphs,node,stm_node)[0]	
					}
					else {
						PDG.decr_stm();
						return;
					}
				}
				// Expression statement
				else if (isExpStm(graphs,node)) {
					// Go to the expression
					node.node = node.node.expression;
					return makePDGNode(graphs,node, toadd,upnode);
				}	
				// Variable declaration		
				else if(isVarDecl(graphs,node)) 
				  cont = handleVarDecl(graphs,node,stm_node,upnode)[0];
				// Binary expression
				else if (isBinExp(graphs,node)) 
					cont = handleBinExp(graphs,node,stm_node,upnode)[0]
				// Assignment expression
				else if (isAssignmentExp(graphs,node))
					cont = handleAssignmentExp(graphs,node,stm_node)[0];
				// If statement
				else if (isIfStm(graphs,node))
					cont = handleIfStatement(graphs,node,stm_node,upnode)[0];

				// Everything else
				else 
						return; 
				if(toadd)
					addToPDG(stm_node);
				return [cont,stm_node];
			}
		}
	}
	
	// Apply state
	else if( node.type === "apply") {
		var call_node = PDG.make_cal(node.node);
		jtc.addNodes(node,call_node);
		call_node.name = node.node.callee.name;
		upnode.add_edge_out(call_node, EDGES.CONTROL);
		var entry = PDG.getEntryNode(call_node.name,node);
		var prev_entry = PDG.entry_node;
		PDG.entry_node = entry;
		addCallDep(call_node,entry);
		// Higher order functions: data dependency
		var formalp = prev_entry.getFormalIn().filter(function(fp) {
			return fp.name === call_node.name
		});
		if(formalp.length > 0) {
			formalp[0].add_edge_out(call_node, EDGES.DATA);
		}
		// Function body
		// TODO : currently only 1 outgoing edge
		var edge = etg.outgoing(node)[0];
		var fi =  etg.incoming(node)[0].g.frame;
		console.log("-- START  " + fi);
		var body = entry.hasBody();
		// TODO : currently one node
		// Formal parameters
		var outgoing = etg.outgoing(node);
		while(outgoing.length > 0) {
			var edge = outgoing.shift(),
			    target = edge.target;
			if(edge.g.isPop && fi.equals(edge.g.frame)) {
				console.log("--END  " + edge.g.frame); 
				break;
			}
			else {
					var out = etg.outgoing(node);
					out.map(function(edge) {
						var t = edge.target;
						if(!body) {
						var n = makePDGNode(graphs,t,false,entry);
						// Nested entry nodes don't have a control edge to current entry node
						if (n && (!n[1].isEntryNode || n[1].parsenode.type === "BlockStatement"))  {
							target = n[0];
							// Call expressions already have control edge to their entry node
							if(n[1] && !(n[1].isCallNode || n[1].parsenode.type === "BlockStatement"))
							  entry.add_edge_out(n[1],EDGES.CONTROL)
						}
					}
					})
				
				outgoing = outgoing.concat(etg.outgoing(target));
				node = target;					         
			}
		}
		PDG.reverse_entry(prev_entry);
		return [node,call_node,entry];    
	   	}
}
		
		
function JipdaToPDGMap() {
	this._nodes = HashMap.empty(131);
}

JipdaToPDGMap.prototype.putNodes = function(JipdaNode, PDGNode) {
	this._nodes = this._nodes.put(JipdaNode,PDGNode);
}

JipdaToPDGMap.prototype.addNodes = function(JipdaNode, PDGNode) {
	var prev = this._nodes.get(JipdaNode,ArraySet.empty());
	var add =  prev.length>0 ?  [PDGNode].concat(prev) : [PDGNode];
	this._nodes = this._nodes.put(JipdaNode,add);
}

JipdaToPDGMap.prototype.getNode = function(JipdaNode) {
	var emptySet = ArraySet.empty();
	var res = this._nodes.get(JipdaNode,emptySet);
	return res;
}

function Graphs(DSG,AST, src) {
	this.DSG = DSG;
	this.AST = AST;
	this.PDG = new PDG();
	this.JTC  = new JipdaToPDGMap();
	this.src = src;
}

Graphs.prototype.etg = function() {
	return this.DSG.etg;
}

Graphs.prototype.start = function () {
	this.PDG.change_entry(new EntryNode(this.PDG.ent_index));
  	this.PDG.initial = JSON.parse(JSON.stringify(this.DSG.initial));
  	this.JTC.addNodes(result.initial, this.PDG.entry_node);
  	var node = result.initial;
  	while(this.etg().outgoing(node).length > 0) {
  		var tuple = makePDGNode(this,node,true, this.PDG.entry_node);
    	// TODO : meerdere outgoing
    	if(tuple) {
     		edges = this.etg().outgoing(tuple[0]);
        	if(edges.length > 0)
  				node = edges[0].target;
				else { break;}
			}
     	else {
	   		edges = this.etg().outgoing(node);
       		if(edges.length > 0)
	     		node = edges[0].target;
			else 
				break;
  	}
  }
}

		