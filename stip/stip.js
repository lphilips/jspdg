
/* General pattern for handling a statement:
 * Given a set of frames of push edges, we continue until
 * the corresponding pop edge is found.
 * For every state in between, we make a DPG node and continue
 * from where that DPG node ended.
 * We return the last state this function looked at.*/

var handleStm = function (graphs, kontnode, node, stm_node, addJtc, toadd) {
	var cont        = node,
		jtc         = graphs.JTC,
		successors  = graphs.JG.successors(node),
		successor, PDG_node, cont;
	while(successors.length > 0) {
		successor   = successors.shift();
		if(successor.equals(kontnode))
			break;
		else {
			if(addJtc)
				PDG_node = makePDGNode(graphs, successor, toadd, addJtc);
			else
				PDG_node = makePDGNode(graphs,  successor, toadd, stm_node);
			if(PDG_node && PDG_node[1]) {
				if(addJtc)
					jtc.addNodes(PDG_node[0], addJtc)
				else
					jtc.addNodes(PDG_node[0], PDG_node[1]);
				if (PDG_node[1] && !PDG_node[1].isCallNode && toadd) {
					stm_node.addEdgeOut(PDG_node[1], EDGES.CONTROL);
				}
				else {
					stm_node.expression = stm_node.expression.concat(PDG_node[1]);
				}
				successor = PDG_node[0];
			}
			successors = successors.concat(graphs.JG.successors(successor));
			cont = successor;
		}
	}
	return cont
}


/* Get corresponding kont-node of an eval-node */
var getKont = function (JG, node) {
	var successors = JG.successors(node),
	    successor, kont;
	while (successors.length > 0) {
		successor = successors.shift();
		if (isKont(successor) && successor.kont.equals(node.kont) &&
			successor.lkont.equals(node.lkont)) {
			kont = successor;
			break;
		} else 
			successors = successors.concat(JG.successors(successor))
	}
	return kont;
}


/*       _________________________________ DECLARATIONS _________________________________
 *
 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Declarations
 */

/* VARIABLE DECLARATION is followed by one/more variable declarator(s)
 * Edges are marked (+) (-) vrator */
var handleVarDecl = function (graphs, node, upnode) { 
	/* Search for corresponding kont-node to obtain type info */
	var	kontnode = getKont(graphs.JG, node),
		stm_node = graphs.PDG.makeStm(node.node),
		cont;

	graphs.JTC.addNodes(node, stm_node);
	stm_node.konts = [kontnode];
	if (upnode) 
		stm_node.dtype = upnode.getdtype();
	cont = handleStm(graphs, kontnode, node, stm_node, stm_node, false);	
	stm_node.name = node.node.declarations[0].id.name;
	return [cont, stm_node];     
}

/* FUNCTION DECLARATION creates a new entry node in the DPDG */
var handleFuncDeclaration = function (graphs, node, entry) {
	var PDG 	   = graphs.PDG,
		jtc 	   = graphs.JTC,
		entry 	   = new EntryNode(PDG.ent_index, node.node),
		prev_entry = PDG.entry_node;
	PDG.changeEntry(entry);
	handleFormalParameters(graphs,node,entry);
	// Body isn't evaluated, so switch back to previous entry node
	PDG.reverseEntry(prev_entry);
	jtc.addNodes(node,entry);
	return [node, entry];
}

/* ANONYMOUS FUNCTION DECLARATION bound to a variable
 * creates a entry node and data dependency on the variable */
var handleAnonFuncDeclaration = function (graphs, node, entry, toadd) {
	var successors = graphs.JG.successors(node),
	    // Statement node of the variable declaration
	    stm_node   = graphs.PDG.makeStm(node.node),
	    next_node  = esp_isFunExp(node.node) ? node : successors[0],
        // Entry node for the function
        entry_node = new EntryNode(graphs.PDG.ent_index, next_node.node),
        prev_entry = graphs.PDG.entry_node;
    graphs.PDG.changeEntry(entry_node);
	// Body isn't evaluated, so switch back to previous entry node
	graphs.PDG.reverseEntry(prev_entry);
	graphs.JTC.addNodes(next_node, entry_node);
	if(entry_node.parsenode)
		handleFormalParameters(graphs,node,entry_node);
	if (esp_isFunExp(node.node))
		return [next_node, entry_node]
	else {
		stm_node.addEdgeOut(entry_node, EDGES.DATA);
		graphs.JTC.addNodes(node,stm_node);
		return [next_node, stm_node];
	}
	
}


/* GENERAL FUNCTION for DECLARATIONS */
var handleDeclarator = function (graphs, node, upnode, toadd) {
	var declaratortype = node.node.type,
		scopeInfo      = Ast.scopeInfo(node.node),
		parent         = Ast.hoist(scopeInfo).parent(node.node,graphs.AST),
	    handled;
	switch (declaratortype) {
		case 'VariableDeclaration':
			var successor = graphs.JG.successors(node)[0];
			if (successor && isFunExp(graphs, successor)) 
				handled = handleAnonFuncDeclaration(graphs, node, upnode, toadd);
			else 
				handled = handleVarDecl(graphs, node, upnode);
			break;
		case 'FunctionDeclaration':
			handled = handleFuncDeclaration(graphs, node, upnode);
			break;
		case 'FunctionExpression':
			if (upnode.parsenode === parent)
				handled = handleAnonFuncDeclaration(graphs, node, upnode, toadd)
			/* TODO JIPDA : case where 1 function defined in block */
			else if (esp_isVarDeclarator(parent)) {
				/* Get the variable declaration node (parent of parent) */
				scopeInfo = Ast.scopeInfo(parent);
				parent = Ast.hoist(scopeInfo).parent(parent, graphs.AST);
				var stm_node = graphs.PDG.makeStm(parent);
				handled = handleAnonFuncDeclaration(graphs, node, parent, toadd);
				stm_node.addEdgeOut(handled[1], EDGES.DATA);
				handled[1] = stm_node
			}

	}
	if (handled && toadd) {
    	addToPDG(handled[1])
    } 
    return handled;
}

/*        _________________________________ STATEMENTS _________________________________
 *
 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Statements
 */


/* BLOCK STATEMENT:
 * Consists of several statements surrounded by corresponding 
 * push and pop body edges */
var handleBlockStatement = function (graphs, node, entry, toadd) {
	var PDG 	  = graphs.PDG,
		parsenode = node.node,
		old_entry = PDG.entry_node,
		new_entry = new EntryNode(PDG.ent_index,node.node),
		kontnode  = getKont(graphs.JG, node),
		addUnder   = function (n) {
			if (n.isEntryNode) 
				new_entry.addEdgeOut(n, EDGES.CONTROL);
		},
		nextEval   = function (start, n) {
			if (!(start.equals(n)) && isEval(n)) 
				return n
			else {
				var successors = graphs.JG.successors(n);
				if (successors.length > 0) 
					return nextEval(start, successors[0])
				else 
					return false
			}
		};
	if (toadd) {
		addToPDG(new_entry);
		PDG.changeEntry(new_entry);
		PDG.curr_body_node = old_entry;
	} else
		new_entry = entry;

	var successors = graphs.JG.successors(node);
	while (successors.length > 0 ) { 
		var succ = successors.shift();
		if (succ.equals(kontnode))
			break;
		else {
			var pdgnode = makePDGNode(graphs, succ, true, new_entry); 
			if (pdgnode) {
				var cont = pdgnode[0];
				var contnode = pdgnode[1];
				if (toadd)
					addUnder(contnode);
				successors = successors.concat(graphs.JG.successors(cont));
			}
			else 
				successors = successors.concat(graphs.JG.successors(succ));
		}
	}
	PDG.reverseEntry(entry.isEntryNode ? entry : old_entry);
	return [kontnode, new_entry]
}

/* IF STATEMENT */
var handleIfStatement = function (graphs, node, stm_node, entry) {
	var PDG 	   = graphs.PDG,
		jtc 	   = graphs.JTC,
		parsenode  = node.node,
		consequent = parsenode.consequent,
		alternate  = parsenode.alternate,
		kontnode   = getKont(graphs.JG, node),
		cont 	   = handleStm(graphs, kontnode, node, stm_node),
		nextEval   = function (start, n) {
			if (!(start.equals(n)) && isEval(n)) 
				return n
			else {
				var successors = graphs.JG.successors(n);
				if (successors.length > 0) 
					return nextEval(start, successors[0])
				else 
					return false
			}
		},
		hasbranch = function (node, branchnode) {
			return stm_node.getOutEdges().filter(function (e) {
				return e.to.parsenode && e.toparsenode === branchnode;
			}).length > 0;
		},
		entryHasIf = entry.getOutEdges().filter(function (e) {
			return e.to.isStatementNode && e.to.parsenode === stm_node.parsenode
		});
	
	jtc.addNodes(node, stm_node);
	next = nextEval(cont, cont);
	if (entryHasIf.length > 0) {
			// Remove all incoming (data) edges to newly created if stm
			var froms = stm_node.edges_in.map(function (e) { return e.from });
			froms.map(function (n) { n.removeEdgeOut(stm_node) });
			stm_node.edges_in = [];
			stm_node = entryHasIf[0].to;
	}
	if (next) {
		var contnode = makePDGNode(graphs, next, false, entry); 
		// Add consequent if not already added
		if (next.node === consequent && !(hasbranch(stm_node, consequent))) {
			stm_node.addEdgeOut(contnode[1], EDGES.CONTROL, true)
		}
		// Add alternate if not already added
		else if (next.node === alternate && !(hasbranch(stm_node, alternate))) {
			stm_node.addEdgeOut(contnode[1], EDGES.CONTROL, false)	
		}
		if (entryHasIf.length > 0) 
			// TODO
		node = false;
		return [contnode[0], stm_node];
	}
	return [cont,node];
}


/* RETURN STATEMENT is either a return eval state, followed by a RetKont edge (+ ret)
 *  or an eval state with an incoming RetKont edge; */
var handleReturnStm = function (graphs, node, stm_node, upnode) {
	var kontnode = getKont(graphs.JG, node);
	var cont 	= handleStm(graphs, kontnode, node, stm_node,upnode),
		formout = handleFormalOutParameters(graphs, stm_node);
	stm_node.addEdgeOut(formout, EDGES.DATA);
	graphs.JTC.addNodes(node, stm_node);
	return [cont, node];
}


/*       _________________________________ EXPRESSIONS _________________________________
 *
 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Expressions
 */

/* BINARY EXPRESSION has left edges continued by right edges;
 * Bundled by body edges */
var handleBinExp = function (graphs, node, upnode, toadd) {
	var kontnode  = getKont(graphs.JG, node),
	    stm_node  = graphs.PDG.makeStm(node.node),
	    scopeInfo = Ast.scopeInfo(node.node),
		parent    = Ast.hoist(scopeInfo).parent(node.node,graphs.AST),
		cont, form_out;
	if (upnode.isEntryNode)
		cont 	 = handleStm(graphs, kontnode, node, stm_node, stm_node);
	else 
		cont = handleStm(graphs, kontnode, node, stm_node, upnode, toadd);
	graphs.JTC.addNodes(node, stm_node);
	if (parent && esp_isRetStm(parent)) {
		form_out = handleFormalOutParameters(graphs, stm_node);
		stm_node.addEdgeOut(form_out, EDGES.DATA);

		stm_node.parsenode = parent;
	}
	return [kontnode, stm_node];
}

var handleNewExp = function (graphs, node, upnode, toadd) {
	var kontnode = getKont(graphs.JG, node),
		name     = node.node.callee.name,
		entry    = graphs.PDG.getEntryNode(name, node),
		proentry = graphs.PDG.makeProEntry(node);
}

/* ASSIGNMENT */
var handleAssignmentExp = function (graphs, node, stm_node, upnode) {
	if(upnode) 
		stm_node.dtype = upnode.getdtype();
	var jtc 	     = graphs.JTC,
		kontnode     = getKont(graphs.JG, node),
		parsenode    = node.node.expression,
		ident        = parsenode.left,
		nr_entry     = graphs.PDG.nodes.length,
		declaration  = declarations(graphs.JG, node, ident.name)[0],
		cont 	     = handleStm(graphs, kontnode, node, stm_node);

	handleIdentifier(graphs, node, ident.name, stm_node);
	stm_node.konts = [kontnode];
	stm_node.name = parsenode.left.name;
	if (declaration) {
		jtc.addNodes(declaration, stm_node);
		if (graphs.PDG.nodes.length > nr_entry) {
			var latest_entry = graphs.PDG.nodes[nr_entry],
				decl_node = jtc.getNode(declaration);
			addDataDep(decl_node[0], latest_entry);
		}
	}
	/* Recheck dependent call nodes for dtype (could be wrong because assign. exp had
	   no dtype at that moment ) */
	var calls = stm_node.edges_out.map(function (e) {
		if (e.to.isCallNode && e.equalsType(EDGES.CONTROL))
			e.to.dtype = stm_node.getdtype()
	})
	node.node = parsenode;
	return [cont,node];
}


/* Kont-node is optional parameter. This is for the case where the successor of the 
   callnode isn't the block statement of the body, but the states for one/more of the arguments */
var handleBody = function (graphs, callnode, entrynode, kontnode) {
	var hasbody  = entrynode.getOutEdges(EDGES.CONTROL).filter( function (e) {
			return !e.to.isFormalNode
		}).length > 0,
		succ     = kontnode, //graphs.JG.successors(kontnode)[0],
		bodykont = getKont(graphs.JG, succ),
		successors = graphs.JG.successors(succ);
	if (!succ.node || (succ.node && !esp_isBlockStm(succ.node))) {
		/* Look for block statement, starting from kontnode */
		successors = graphs.JG.successors(kontnode);
		while(successors.length > 0) {
			succ = successors.shift();
			if (succ.node && esp_isBlockStm(succ.node))
				break;
			successors = graphs.JG.successors(succ);
		}
		bodykont = getKont(graphs.JG, succ);
	}
	if (!hasbody)
		return makePDGNode(graphs, succ, false, entrynode);
	else
		return [bodykont, undefined]

}

var handleCallExpression = function (graphs, node, upnode, toadd) {
	// Handle actual parameters of this call
	var callcnt   = ++cnt,
		parsenode = node.node.expression ? node.node.expression : node.node,
		succ      = graphs.JG.successors(node)[0],
		succkont  = getKont(graphs.JG, succ),
		params 	  = handleActualParameters(graphs, graphs.JG.successors(succkont)[0], parsenode),
		contnode  = params[0],
		primitive = isPrimitiveCall(node),
		bodynodes = graphs.JG.successors(node);

	var callnode;
	if (primitive) {
		callnode = PDG.makeCall(node.node);
		callnode.cnt = callcnt;
		callnode.name = node.node.callee.name;
		params[1].map(function (a_in) {
			callnode.addEdgeOut(a_in, EDGES.CONTROL);
		})
		return [contnode, callnode]
	}
	else {
		var name      = parsenode.callee.name,
		    preventry = graphs.PDG.entry_node,
			entry     = graphs.PDG.getEntryNode(name, node),
			formals   = entry.getFormalIn(),
			body;

		callnode = graphs.PDG.makeCall(node.node);
		callnode.name = name;
		/* Add call edge to entry node 
		   Anonymous function created for callback arguments 
		   are only called to evaluate their body. This should not
		   be reflected in the pdg, so no edge to their
		   entry node */
		if(!callnode.name.startsWith('anonf')) {
			if(!upnode.equals(entry)) 
				upnode.addEdgeOut(callnode, EDGES.CONTROL);
			addCallDep(callnode, entry);
		}	
		// Bind the actual and formal parameters
		for (var i = 0; i < params[1].length; i++) {
			var a = params[1][i],
			f = formals[i];
			// Call node -> actual-in parameter
			callnode.addEdgeOut(a, EDGES.CONTROL);
			// actual-in parameter -> formal-in parameter
			if (!a.equalsdtype(f) ||
				!a.isSharedNode() ||
				!f.isSharedNode())
				a.addEdgeOut(f, EDGES.REMOTEPARIN)
			else
			    a.addEdgeOut(f, EDGES.PARIN);
		}
		graphs.PDG.changeEntry(entry);

		body = handleBody(graphs, node, entry, params[0]);
		graphs.PDG.changeEntry(preventry);
		var kont = body[0];
		if (!isReturnKont(kont)) {
			var successors = graphs.JG.successors(kont),
				kont = successors.shift();
			while(!isReturnKont(kont) && successors.length > 0) {
				successors = successors.concat(graphs.JG.successors(kont));
				kont = successors.shift();
			}
		}

		if (kont) {
			var actual_out = new ActualPNode(graphs.PDG.fun_index, -1);
			actual_out.value = kont.value.value;
			PDG.fun_index++;
			//actual_out.addEdgeOut(entry, EDGES.DATA);
			// Formal-out parameter -> actual-out parameter
			var formal_out = entry.getFormalOut();
			if (formal_out.length > 0 && !name.startsWith('anonf')) 
				if (!actual_out.equalsdtype(formal_out[0]) || 
					!actual_out.isSharedNode() ||
					!formal_out[0].isSharedNode () )
					formal_out[0].addEdgeOut(actual_out, EDGES.REMOTEPAROUT); 
				else
					formal_out[0].addEdgeOut(actual_out, EDGES.PAROUT);
			callnode.addEdgeOut(actual_out, EDGES.CONTROL);  
		}
		// Add summary edges between a_in and a_out
		handleSummaryEdges(callnode, entry);
		postRemoteDep(params[1]);
		if(!name.startsWith('anonf'))
			entry.addCall(callnode);
	}
	return [kont, callnode];
}

/* ACTUAL PARAMETERS of a function call.
 * All parameters are bundled by operand continuation edges */
var handleActualParameters = function (graphs, node, parsenode) {
	var nr_param   = parsenode.arguments.length,
		edge       = graphs.JG.outgoing(node)[0],
		g          = edge.g ? edge.g : [],
		params 	   = [],
		curr_param = 0,
		cont       = node,
		effect, a_in, successor;
	while (nr_param != curr_param) {
		a_in = new ActualPNode(graphs.PDG.fun_index, 1);
		graphs.PDG.fun_index++;
		successor = graphs.JG.successors(cont)[0];
		var PDG_node = makePDGNode(graphs, cont, false, a_in);
		a_in.parsenode = PDG_node && PDG_node[1] ? PDG_node[1].parsenode : cont.node;
		cont = PDG_node ? PDG_node[0] : successor;
		curr_param++;
		params = params.concat(a_in);
	}
	return [cont, params];
}

/* FORMAL PARAMETERS of a function definition.
 * This is handled on AST level (parsenode.params) */
var handleFormalParameters = function (graphs, node, entry) {
	var nr_params = entry.parsenode.params.length,
		PDG 	  = graphs.PDG,
		params 	  = entry.parsenode.params;
	for (var i = 0; i < nr_params; i++) {
		var param    = params[i],
			fin_node = new FormalPNode(PDG.fun_index, param.name, 1);
		PDG.fun_index++;
		entry.addEdgeOut(fin_node, EDGES.CONTROL); 
	}
}

var handleFormalOutParameters = function (graphs, stm_node) {
	var PDG 	 = graphs.PDG,
		entry 	 = PDG.curr_body_node,
		form_out = new FormalPNode(PDG.fun_index,stm_node.parsenode.toString(), -1);
	PDG.fun_index++;
	entry.addEdgeOut(form_out, EDGES.CONTROL);
	return form_out;
}

/* Summary edges are added between actual_in to actual_out parameter if
 * a path between the corresponding formal_in to formal_out exists */
var handleSummaryEdges = function (callnode, entrynode) {
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
				actual_in.addEdgeOut(actual_out, EDGES.SUMMARY)
			}
		}
	}
}

/* GENERAL FUNCTION for EXPRESSIONS */
var handleExpressionStatement = function (graphs, node, upnode, toadd) {
	var expressiontype = node.node.expression ? node.node.expression.type : node.node.type,
	    handled;
	switch (expressiontype) {
      	case 'CallExpression':
      		handled = handleCallExpression(graphs, node, upnode, toadd);
      		if (upnode.isEntryNode)
      			toadd=false
      		break;
      	case 'BinaryExpression' :
      		handled = handleBinExp(graphs, node, upnode, toadd);
      		break;
      	case 'NewExpression' :
      		handled = handleNewExp(graphs, node, upnode, toadd);

     }
    if (handled && toadd) {
    	addToPDG(handled[1], upnode)
    } 
    return handled;
}

var handleIdentifier = function (graphs, node, name, entry, toadd) {
	var declaration = declarations(graphs.JG, node, name)[0],
		stm 		= graphs.PDG.makeStm(node.node),
		formp 		= graphs.PDG.entry_node.getFormalIn(),
		scopeInfo   = Ast.scopeInfo(node.node),
		parent      = Ast.hoist(scopeInfo).parent(node.node,graphs.AST),
		stm_node;
	
	if (parent && esp_isRetStm(parent)) {
		stm_node = graphs.PDG.makeStm(parent);
		form_out = handleFormalOutParameters(graphs, stm_node);
		stm_node.addEdgeOut(form_out, EDGES.DATA);
		entry = stm_node;
		if (toadd) {
			addToPDG(stm_node)
		}

	}
	formp = formp.filter( function (f) {
		return f.name === name;
	});
	if (formp.length > 0) 
		addDataDep(formp[0], entry)
	else if (declaration) {
		var PDG_nodes = graphs.JTC.getNode(declaration);
		if (PDG_nodes && PDG_nodes.length > 0 && entry) 
			PDG_nodes.map( function (c) {
				addDataDep(c, entry)
			})
	}

	if (stm_node)
		return [node, stm_node]
	else
		return [getKont(graphs.JG, node), false]
}

var handleLiteral = function (graphs, node, entry, toadd) {
	var scopeInfo = Ast.scopeInfo(node.node),
		parent    = Ast.hoist(scopeInfo).parent(node.node, graphs.AST);
	if (parent && esp_isRetStm(parent)) {
		var stm_node = graphs.PDG.makeStm(parent);
		if (toadd) {
			addToPDG(stm_node)
		}
	}
}


/* Auxiliary Functions to add correct edges to nodes, etc. */
var addToPDG = function (node, upnode) {
	if (upnode)
		upnode.addEdgeOut(node, EDGES.CONTROL)
	else {
		if (isClientAnnotated(node.parsenode))
			graphs.PDG.addClientStm(node)
		else if (isServerAnnotated(node.parsenode))
			graphs.PDG.addServerStm(node)
		else 
			graphs.PDG.entry_node.addEdgeOut(node, EDGES.CONTROL)
	}
}

var addCallDep = function (from, to) {
	var dtypef = from.getdtype(),
		dtypet = to.getdtype();
	if(dtypef && dtypet)
		if(dtypef.value === DNODES.SHARED.value ||
			dtypet.value === DNODES.SHARED.value) 
			from.addEdgeOut(to, EDGES.CALL)
		else if (dtypef.value !== dtypet.value) 
			from.addEdgeOut(to, EDGES.REMOTEC)
		else 
			from.addEdgeOut(to, EDGES.CALL)
	else
		from.addEdgeOut(to, EDGES.CALL)
}

var addDataDep = function (from, to) {
	var dtypef = from.getdtype(),
		dtypet = to.getdtype(),
		dupl   = from.getOutEdges(EDGES.REMOTED).concat(from.getOutEdges(EDGES.DATA)).filter(function (e) {
					return  e.to.equals(to) });
	if(dupl.length < 1) {
		if(dtypef && dtypet && 
			dtypef.value !== dtypet.value) 
			from.addEdgeOut(to, EDGES.REMOTED)
		else
			from.addEdgeOut(to, EDGES.DATA)
	}
}

/*
 * Because actual parameters are handled before the actual call node,
 * some dependencies for these parameters can be wrong 
 * (atm of creating them the actual parameters don't know their tier information)
 * This function rechecks them.
 */
var postRemoteDep = function (params) {
	params.map( function (param) {
		var datadeps = param.getInEdges(EDGES.DATA).concat(param.getInEdges(EDGES.REMOTED));
			calldeps = param.edges_out.filter( function (e) {
				return e.to.isCallNode  
			}).map( function (e) { return e.to});

		var paramtype = param.getdtype(true);	

		datadeps.map(function (e) {
			var dtypef = e.from.getdtype(true);
			if(dtypef && paramtype && dtypef.value !== paramtype.value)
				e.type = EDGES.REMOTED
			else
				e.type = EDGES.DATA
		})

		calldeps.map(function (n) {
			 n.getOutEdges(EDGES.CALL).concat(n.getOutEdges(EDGES.REMOTEC))
		      .map( function (e) {
						var dtypet = e.to.getdtype(true),
							dtypef = e.from.getdtype(true);
						if(dtypef && dtypet && dtypef.value !== dtypet.value) 
							e.type = EDGES.REMOTEC;	
						else
							e.type = EDGES.CALL
				});
			/* perform post check recursively! */
			var a_ins = n.getActualIn();
			postRemoteDep(a_ins);

		})
	})
}

/* make PDG node out of a JIPDA node:
 * graphs = object containing different graphs,
 * node   = JIPDA node
 * toadd  = does the corresponding node needs to be added under the current entry or distributed node 
 * upnode = direct 'upnode' of current node, e.g. 'return x'-node for the 'x'-node
 */
var makePDGNode = function (graphs, node, toadd, upnode) {
	var PDG = graphs.PDG,
	    JG  = graphs.JG,
		jtc = graphs.JTC;
	if(isEval(node)) {
		var parsetype = node.node.type;
		console.log("PDG(" + parsetype + ")" + node.node);
		if(parsetype != 'Program') {
			var successors = JG.successors(node);
			switch (parsetype) {
      			case 'FunctionDeclaration': 
					return handleDeclarator(graphs, node, upnode, toadd);
				case 'VariableDeclaration':
					return handleDeclarator(graphs, node, upnode, toadd);
				case 'FunctionExpression' :
					return handleDeclarator(graphs, node, upnode, toadd);
				case 'BlockStatement' :
					return handleBlockStatement(graphs, node, upnode, toadd);
				case 'Identifier' :
					return handleIdentifier(graphs, node, node.node.name, upnode, toadd);
				case 'ExpressionStatement' :
					return handleExpressionStatement(graphs, node, upnode, toadd);
				case 'BinaryExpression' :
					return handleExpressionStatement(graphs, node, upnode, toadd);
				case 'Literal' :
					return handleLiteral(graphs, node, upnode, toadd);
				case 'CallExpression' :
					return handleExpressionStatement(graphs, node, upnode, toadd);
				case 'ThisExpression' :
					return handleExpressionStatement(graphs, node, upnode, toadd);
				case 'NewExpression' :
					return handleExpressionStatement(graphs, node, upnode, toadd);

			}
		}
	}
}


/* Graph */
function JipdaToPDGMap () {
	this._nodes = HashMap.empty(131);
}

JipdaToPDGMap.prototype.putNodes = function (JipdaNode, PDGNode) {
	this._nodes = this._nodes.put(JipdaNode,PDGNode);
}

JipdaToPDGMap.prototype.addNodes = function (JipdaNode, PDGNode) {
	var prev = this._nodes.get(JipdaNode, ArraySet.empty()),
		add  = prev ?  prev.concat(PDGNode) : [PDGNode];
	this._nodes = this._nodes.put(JipdaNode,add);
}

JipdaToPDGMap.prototype.getNode = function (JipdaNode) {
	var emptySet = ArraySet.empty(),
	 	res 	 = this._nodes.get(JipdaNode,emptySet);
	return res;
}

function Graphs (AST, src) {
	this.AST  = AST;
	this.PDG  = new PDG();
	this.JTC  = new JipdaToPDGMap();
	this.src  = src;
}

/* Create the program dependency graph */
Graphs.prototype.start = function (initial) {
	this.PDG.changeEntry(new EntryNode(this.PDG.ent_index));
	this.PDG.initial = JSON.parse(JSON.stringify(initial.node));
	this.JTC.addNodes(initial, this.PDG.entry_node);
	var successors = [initial].concat(this.JG.successors(initial));
	/* starting from the root node: create a pdg node for every node 
	   and continue from the result */
	while(successors.length > 0) {
		var successor = successors.shift();
		var tuple = makePDGNode(this, successor, true, this.PDG.entry_node);
    	// TODO : meerdere outgoing
    	if(tuple && tuple[0]) {
    		successors = this.JG.successors(tuple[0]);
    		if(successors.length <= 0)
    			break
    	}
    	else {
    		successors = this.JG.successors(successor);
    		if(successors.length <= 0)
    			break
    	}
    }
}