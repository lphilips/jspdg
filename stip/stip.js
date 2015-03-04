
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
				PDG_node = makePDGNode(graphs, target, toadd, stm_node);
			if(PDG_node) {
				if(addJtc)
					jtc.addNodes(PDG_node[0], addJtc)
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
			cont = target
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
var handleVarDecl = function (graphs, node, stm_node, upnode) {
	var jtc  = graphs.JTC,
		out  = graphs.etg().outgoing(node),
		/* Follow epsilon edge to corresponding kont-node to obtain type info */
		epsk = graphs.DSG.ecg.successors(node).filter(function (n) {
			return n !== node
		}),
		vrators, cont;
	jtc.addNodes(node, stm_node);
	stm_node.konts = epsk;
	if (upnode) 
		stm_node.dtype = upnode.getdtype();
	vrators = out.map( function (e) {
		return e.g.frame;
	});
	cont = handleStm(graphs, vrators, node, stm_node, stm_node, false);	
	stm_node.name = node.node.declarations[0].id.name;
	return [cont, node];     
}

/* FUNCTION DECLARATION creates a new entry node in the DPDG */
var handleFuncDeclaration = function (graphs, node, entry) {
	var PDG 	   = graphs.PDG,
		jtc 	   = graphs.JTC,
		entry 	   = new EntryNode(PDG.ent_index, node.node),
		prev_entry = PDG.entry_node;
	PDG.change_entry(entry);
	handleFormalParameters(graphs,node,entry);
	// Body isn't evaluated, so switch back to previous entry node
	PDG.reverse_entry(prev_entry);
	jtc.addNodes(node,entry);
	return [node, entry];
}

/* ANONYMOUS FUNCTION DECLARATION bound to a variable
 * creates a entry node and data dependency on the variable */
var handleAnonFuncDeclaration = function (graphs, node, entry, toadd) {
	var successors = graphs.JG.successors(node),
	    // Statement node of the variable declaration
	    stm_node   = graphs.PDG.make_stm(node.node),
	    next_node  = esp_isFunExp(node.node) ? node : successors[0],
        // Entry node for the function
        entry_node = new EntryNode(graphs.PDG.ent_index, next_node.node),
        prev_entry = graphs.PDG.entry_node;
    graphs.PDG.change_entry(entry_node);
	// Body isn't evaluated, so switch back to previous entry node
	graphs.PDG.reverse_entry(prev_entry);
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
				var stm_node = graphs.PDG.make_stm(parent);
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
		PDG.change_entry(new_entry);
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
	PDG.reverse_entry(entry.isEntryNode ? entry : old_entry);
	return [kontnode, new_entry]
}

/* IF STATEMENT */
var handleIfStatement = function (graphs, node, stm_node, entry) {
	var PDG 	   = graphs.PDG,
		etg 	   = graphs.etg(),
		jtc 	   = graphs.JTC,
		parsenode  = node.node,
		consequent = parsenode.consequent,
		alternate  = parsenode.alternate,
		outgoing   = etg.outgoing(node),
		ifs 	   = outgoing.filter( function (e) {
			return e.g && e.g.frame
		}).map(function (e) {
			return e.g.frame
		}),
		cont 	   = handleStm(graphs,ifs,node,stm_node);
	jtc.addNodes(node,stm_node);
	var nextEval = function (start, n) {
			if (!(start.equals(n)) && isEval(n))
				return n
			else {
				var next = etg.outgoing(n);
				if (next.length > 0) 
					return nextEval(start, next[0].target)
				else 
					return false
			}
		},
		entryHasIf = entry.edges_out.filter(function (e) {
			return e.to.isStatementNode && e.to.parsenode === stm_node.parsenode
		}),
		hasbranch = function (node, branchnode) {
			return stm_node.edges_out.filter(function (e) {
				return e.to.parsenode && e.toparsenode === branchnode;
			}).length > 0;
		},
		next = nextEval(cont, cont);
	if (entryHasIf.length > 0) {
			// Remove all incoming (data) edges to newly created if stm
			var froms = stm_node.edges_in.map(function (e) {return e.from});
			froms.map(function (n) {n.remove_edge_out(stm_node)});
			stm_node.edges_in = [];
			stm_node = entryHasIf[0].to;
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
	var kontnode = getKont(graphs.JG, node),
	    stm_node = graphs.PDG.make_stm(node.node),
		cont;
	if (upnode.isEntryNode)
		cont 	 = handleStm(graphs, kontnode, node, stm_node, stm_node);
	else 
		cont = handleStm(graphs, kontnode, node, stm_node, upnode, toadd);
	graphs.JTC.addNodes(node, stm_node);
	return [kontnode, stm_node];
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
		succ     = graphs.JG.successors(callnode)[0],
		bodykont = getKont(graphs.JG, succ),
		successors = graphs.JG.successors(succ);
	if (succ.node && !esp_isBlockStm(succ.node)) {
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
		params 	  = handleActualParameters(graphs, node, parsenode),
		contnode  = params[0],
		primitive = isPrimitiveCall(node),
		bodynodes = graphs.JG.successors(node);
	var callnode;
	if (primitive) {
		callnode = PDG.make_cal(node.node);
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

		callnode = graphs.PDG.make_cal(node.node);
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
		graphs.PDG.change_entry(entry);

		body = handleBody(graphs, node, entry, params[0]);
		graphs.PDG.change_entry(preventry);
		var kont = body[0];
		if (!isReturnKont(kont)) {
			var successors = graphs.JG.successors(kont),
				kont = successors.shift();
			while(!isReturnKont(kont) && successors.length > 0) {
				successors = successors.concat(graphs.JG.successors(kont));
				kont = successors.shift();
			}
			if (entryHasIf.length > 0) 
				// TODO
			node = false;
			return [contnode[0], stm_node];
		}
		return [cont,node];
	}

/* ACTUAL PARAMETERS of a function call.
 * All parameters are bundled by operand continuation edges */
var handleActualParameters = function (graphs, node) {
	var nr_param   = node.node.arguments.length,
		etg 	   = graphs.etg(),
		outgoing   = etg.outgoing(node),
		push 	   = undefined,
		cont 	   = node,
		params 	   = [],
		curr_param = 0;
	while(outgoing.length > 0 && nr_param != curr_param) {
		var edge   = outgoing.shift(),
			target = edge.target;
		if(edge.g && edge.g.isPush && isOperandKont(edge)) {
			push = edge.g.frame;
			var param = handleActualParameter(graphs, edge.source, node.node.arguments[curr_param]);
			curr_param++;
			params = params.concat(param[1]);
			target = param[0];
		}
		outgoing = outgoing.concat(etg.outgoing(target));
		cont = target;
	}	
	return [cont, params];
}

/* FORMAL PARAMETERS of a function definition.
 * This is handled on AST level (parsenode.params) */
var handleFormalParameters = function (graphs, node, entry) {
	var nr_params = entry.parsenode.params.length,
		PDG 	  = graphs.PDG,
		params 	  = entry.parsenode.params;
	for(var i = 0; i < nr_params; i++) {
		var param    = params[i],
			fin_node = new FormalPNode(PDG.fun_index, param.name, 1);
		PDG.fun_index++;
		entry.add_edge_out(fin_node, EDGES.CONTROL); 
	}
}

var handleFormalOutParameters = function (graphs, stm_node) {
	var PDG 	 = graphs.PDG,
		entry 	 = PDG.curr_body_node,
		form_out = new FormalPNode(PDG.fun_index,stm_node.parsenode.toString(), -1);
	PDG.fun_index++;
	entry.add_edge_out(form_out, EDGES.CONTROL);
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
				actual_in.add_edge_out(actual_out, EDGES.SUMMARY)
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
      		break;
      	case 'BinaryExpression' :
      		handled = handleBinExp(graphs, node, upnode, toadd);
      		break;

     }
    if (handled && toadd) {
    	addToPDG(handled[1], upnode)
    } 
    return handled;
}

/* IDENTIFIER doesn't create a new statement node, but can 
 * result in a data edge to the corresponding declaration
 * or formal parameter */
var handleIdentifier = function (graphs, node, entry) {
	var declarations 	= graphs.DSG.declarations(node),
		stm 			= graphs.PDG.make_stm(node.node),
		declarationNode = declarations[0],
		formp 			= graphs.PDG.entry_node.getFormalIn();
	
	formp = formp.filter( function (f) {
		return f.name === node.node.name;
	});
	if(formp.length > 0) 
		addDataDep(formp[0], entry)
	else if (declarationNode) {
		var PDG_nodes = graphs.JTC.getNode(declarationNode);
		if (PDG_nodes && PDG_nodes.length > 0 && entry) 
			PDG_nodes.map( function (c) {
				addDataDep(c, entry)
			})
	}
}

var handleLiteral = function (graphs, node, entry, toadd) {
	var scopeInfo = Ast.scopeInfo(node.node),
		parent    = Ast.hoist(scopeInfo).parent(node.node, graphs.AST);
	if (parent && esp_isRetStm(parent)) {
		var stm_node = graphs.PDG.make_stm(parent);
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
		graphs.PDG.entry_node.add_edge_out(node, EDGES.CONTROL)
	}
}

var addCallDep = function (from, to) {
	var dtypef = from.getdtype(),
		dtypet = to.getdtype();
	if(dtypef && dtypet)
		if(dtypef.value === DNODES.SHARED.value ||
			dtypet.value === DNODES.SHARED.value) 
			from.add_edge_out(to, EDGES.CALL)
		else if (dtypef.value !== dtypet.value) 
			from.add_edge_out(to, EDGES.REMOTEC)
		else 
			from.add_edge_out(to, EDGES.CALL)
	else
		from.add_edge_out(to, EDGES.CALL)
}

var addDataDep = function (from, to) {
	var dtypef = from.getdtype(),
		dtypet = to.getdtype(),
		dupl   = from.edges_out.filter(function (e) {
		return  e.to.equals(to) && 
		(e.equalsType(EDGES.REMOTED) || e.equalsType(EDGES.DATA))
	});
	if(dupl.length < 1) {
		if(dtypef && dtypet && 
			dtypef.value !== dtypet.value) 
			from.add_edge_out(to, EDGES.REMOTED)
		else
			from.add_edge_out(to, EDGES.DATA)
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
		var datadeps = param.edges_in.filter( function (e) {
				return e.equalsType(EDGES.DATA) || e.equalsType(EDGES.REMOTED)
			}),
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
			 n.edges_out.filter( function (e) {
					return e.equalsType(EDGES.CALL) || e.equalsType(EDGES.REMOTEC);
				}).map( function (e) {
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
	var etg = graphs.etg(),
		PDG = graphs.PDG,
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

			}
		}
	}
}


/* Graph */
function JipdaToPDGMap() {
	this._nodes = HashMap.empty(131);
}

JipdaToPDGMap.prototype.putNodes = function (JipdaNode, PDGNode) {
	this._nodes = this._nodes.put(JipdaNode,PDGNode);
}

JipdaToPDGMap.prototype.addNodes = function (JipdaNode, PDGNode) {
	var prev = this._nodes.get(JipdaNode, ArraySet.empty()),
		add  = prev.length>0 ?  prev.concat(PDGNode) : [PDGNode];
	this._nodes = this._nodes.put(JipdaNode,add);
}

JipdaToPDGMap.prototype.getNode = function (JipdaNode) {
	var emptySet = ArraySet.empty(),
	 	res 	 = this._nodes.get(JipdaNode,emptySet);
	return res;
}

function Graphs (DSG, AST, src) {
	this.DSG  = DSG;
	this.AST  = AST;
	this.PDG  = new PDG();
	this.JTC  = new JipdaToPDGMap();
	this.src  = src;
}

Graphs.prototype.etg = function () {
	return this.DSG.etg;
}

/* Create the program dependency graph */
Graphs.prototype.start = function () {
	this.PDG.change_entry(new EntryNode(this.PDG.ent_index));
	this.PDG.initial = JSON.parse(JSON.stringify(this.DSG.initial));
	this.JTC.addNodes(result.initial, this.PDG.entry_node);
	var node = result.initial;
	/* starting from the root node: create a pdg node for every node 
	   and continue from the result */
	while(this.etg().outgoing(node).length > 0) {
		var tuple = makePDGNode(this,node,true, this.PDG.entry_node);
    	// TODO : meerdere outgoing
    	if(tuple && tuple[0]) {
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