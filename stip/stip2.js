var Stip = (function () {

	var module = {};


	/*   _________________________________ PROGRAMS _________________________________
	 *
	 * https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Programs
	 */


	var handleProgram = function (graphs, node) {
		var rootnode = new EntryNode(graphs.PDG.ent_index);
		graphs.PDG.changeEntry(rootnode);
		node.body.map(function (exp) {
			makePDGNode(graphs, exp, rootnode);
		})
		return rootnode;
	}


	/*       _________________________________ DECLARATIONS _________________________________
	 *
	 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Declarations
	 */

	/* VARIABLE DECLARATION */
	var handleVarDecl = function (graphs, node, upnode) { 
		node.declarations.map(function (decl) {
			var	stmnode = graphs.PDG.makeStm(decl);
			if (upnode) 
				stmnode.dtype = upnode.getdtype();
			stmnode.name = decl.id.name;
			addToPDG(stmnode, upnode);
			/* Make (if necessary) PDG nodes of init expression */
			makePDGNode(graphs, decl.init, stmnode);
			graphs.ATP.addNodes(decl, stmnode);
		})		  
	}

	/* FUNCTION DECLARATION creates a new entry node in the DPDG */
	var handleFuncDeclaration = function (graphs, node, entry) {
		var PDG 	   = graphs.PDG,
			entry 	   = new EntryNode(PDG.ent_index, node),
			prev_entry = PDG.entry_node;
		PDG.changeEntry(entry);
		handleFormalParameters(graphs, node, entry);
		// Body isn't evaluated, so switch back to previous entry node
		PDG.reverseEntry(prev_entry);
		jtc.addNodes(node,entry);
	}

	/* ANONYMOUS FUNCTION DECLARATION bound to a variable
	 * creates a entry node and data dependency on the variable */
	var handleAnonFuncDeclaration = function (graphs, node, entry) {
		var // Statement node of the variable declaration
		    stm_node   = graphs.PDG.makeStm(node),
		    next_node  = esp_isFunExp(node) ? node : node.declarations[0].init,
	        // Entry node for the function
	        entry_node = new EntryNode(graphs.PDG.ent_index, next_node),
	        prev_entry = graphs.PDG.entry_node;
	    graphs.PDG.changeEntry(entry_node);
		graphs.ATP.addNodes(next_node, entry_node);
		handleFormalParameters(graphs,node,entry_node);
		if (!esp_isFunExp(node)) {
			stm_node.addEdgeOut(entry_node, EDGES.DATA);
			graphs.ATP.addNodes(node,stm_node);
			addToPDG(stm_node, entry);
		} 
		else {
			entry.addEdgeOut(entry_node, EDGES.DATA);
			graphs.ATP.addNodes(node, entry)
		}
		/* BODY */
		next_node.body.body.map(function (exp) {
			makePDGNode(graphs, exp, entry_node)
		})
		graphs.PDG.reverseEntry(prev_entry);		
	}


	/* GENERAL FUNCTION for DECLARATIONS */
	var handleDeclarator = function (graphs, node, upnode) {
		var declaratortype = node.type;
		switch (declaratortype) {
			case 'VariableDeclaration':
				if (esp_isFunExp(node.declarations[0].init)) 
					return handleAnonFuncDeclaration(graphs, node, upnode);
				else 
					return handleVarDecl(graphs, node, upnode);
			case 'FunctionDeclaration':
				return handleFuncDeclaration(graphs, node, upnode);
			case 'FunctionExpression':
				handleAnonFuncDeclaration(graphs, node, upnode);
		}
	}

	/*        _________________________________ STATEMENTS _________________________________
	 *
	 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Statements
	 */


	/* BLOCK STATEMENT:
	 * Consists of several statements surrounded by corresponding 
	 * push and pop body edges */
	var handleBlockStatement = function (graphs, node, upnode) {
		var PDG 	  = graphs.PDG,
			old_entry = PDG.entry_node,
			new_entry = new EntryNode(PDG.ent_index, node);
		PDG.ent_index++;
		addToPDG(new_entry, upnode);
		node.body.map(function (exp) {
		    makePDGNode(graphs, exp, new_entry); 
		})

	}

	/* IF STATEMENT */
	var handleIfStatement = function (graphs, node, upnode) {
		var PDG 	   = graphs.PDG,
			consequent = node.consequent,
			alternate  = node.alternate,
			stmnode    = PDG.makeStm(node);
	
		addToPDG(stmnode, upnode);
		/* CONSEQUENT */
		makePDGNode(graphs, consequent, stmnode)
		/* ALTERNATE */
		if (alternate) {
			makePDGNode(graphs, alternate, stmnode)
			stmnode.getOutEdges(EDGES.CONTROL).filter(function (e) {
				if (e.to.parsenode === alternate)
					e.label = false;
			})
		}
	}


	var handleReturnStatement  = function (graphs, node, upnode) {
		var stmnode = graphs.PDG.makeStm(node),
		    formout;
		addToPDG(stmnode, upnode);
		formout = handleFormalOutParameters(graphs, stmnode);	
		stmnode.addEdgeOut(formout, EDGES.DATA);
		makePDGNode(graphs, node.argument, stmnode);	
	}


	var handleForStatement = function (graphs, node, upnode) {
		var stmnode = graphs.PDG.makeStm(node);
		addToPDG(stmnode, upnode);
		stmnode.addEdgeOut(stmnode, EDGES.CONTROL);
		makePDGNode(graphs, node.init, stmnode);
		makePDGNode(graphs, node.test, stmnode);
		makePDGNode(graphs, node.update, stmnode);
		makePDGNode(graphs, node.body, stmnode);
	}


	/*       _________________________________ EXPRESSIONS _________________________________
	 *
	 *  https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API#Expressions
	 */

	/* BINARY EXPRESSION  */
	var handleBinExp = function (graphs, node, upnode) {
		var stmnode   = graphs.PDG.makeStm(node),
			parent    = Ast.parent(node, graphs.AST),
			/* returns true for entry node, if stm or for stm as parent */
			hasEntryParent = upnode.isEntryNode ||
					   esp_isIfStm(upnode.parsenode) ||
					   esp_isForStm(upnode.parsenode),
			form_out;

		/* LEFT expression */
		makePDGNode(graphs, node.left, hasEntryParent ? stmnode : upnode);
		/* RIGHT expression */
		makePDGNode(graphs, node.right, hasEntryParent ? stmnode : upnode);
		//if (parent && esp_isRetStm(parent)) {
		//	stmnode.parsenode = parent;
		//	form_out = handleFormalOutParameters(graphs, stmnode);
		//	stmnode.addEdgeOut(form_out, EDGES.DATA);
		//}
		if (hasEntryParent)
			addToPDG(stmnode, upnode);
	}

	var handleNewExp = function (graphs, node, upnode, toadd) {
		var kontnode = getKont(graphs.JG, node),
			name     = node.node.callee.name,
			entry    = graphs.PDG.getEntryNode(name, node),
			proentry = graphs.PDG.makeProEntry(node);
	}

	/* ASSIGNMENT */
	var handleAssignmentExp = function (graphs, node, upnode) {
		var parsenode    = node.expression,
			ident        = parsenode.left,
			stm_node     = graphs.PDG.makeStm(node);

		stm_node.name = ident.name;
		/* Will add data dependency to declaration node */
		makePDGNode(graphs, parsenode.left, stm_node);
		/* Right-hand side */
		makePDGNode(graphs, parsenode.right, stm_node);
		/* Recheck dependent call nodes for dtype (could be wrong because assign. exp had
		   no dtype at that moment ) */
		var calls = stm_node.edges_out.map(function (e) {
			if (e.to.isCallNode && e.equalsType(EDGES.CONTROL))
				e.to.dtype = stm_node.getdtype()
		})
		addToPDG(stm_node, upnode);
	}

	/* ARRAY EXPRESSION */
	var handleArrayExpression = function (graphs, node, upnode) {
		var stmnode   = graphs.PDG.makeStm(node),
			parent    = Ast.parent(node, graphs.AST),
			/* returns true for entry node, if stm or for stm as parent */
			hasEntryParent = upnode.isEntryNode ||
					   esp_isIfStm(upnode.parsenode) ||
					   esp_isForStm(upnode.parsenode),
			form_out;

		/* ELEMENTS */
		node.elements.map(function (el) {
			makePDGNode(graphs, el, hasEntryParent ? stmnode : upnode)
		})

		//if (parent && esp_isRetStm(parent)) {
		//	stmnode.parsenode = parent;
		//	form_out = handleFormalOutParameters(graphs, stmnode);
		//	stmnode.addEdgeOut(form_out, EDGES.DATA);
		//}
		if (hasEntryParent)
			addToPDG(stmnode, upnode);
	}

	/* MEMBER EXPRESSION */
	var handleMemberExpression = function (graphs, node, upnode) {
		var object   = node.object, 
			property = node.property,
			stmnode  = graphs.PDG.makeStm(node),
			/* returns true for entry node, if stm or for stm as parent */
			hasEntryParent = upnode.isEntryNode ||
					   esp_isIfStm(upnode.parsenode) ||
					   esp_isForStm(upnode.parsenode);

		if (hasEntryParent)
			addToPDG(stmnode, upnode);
		/* Will add data dependency to declaration node */
		makePDGNode(graphs, object, hasEntryParent ? stmnode : upnode);
		/* Right-hand side */
		makePDGNode(graphs, property, hasEntryParent ? stmnode : upnode);
		/* Recheck dependent call nodes for dtype (could be wrong because assign. exp had
		   no dtype at that moment ) */
		var calls = stmnode.edges_out.map(function (e) {
			if (e.to.isCallNode && e.equalsType(EDGES.CONTROL))
				e.to.dtype = stmnode.getdtype()
		})
	}

	/* PROPERTY */
	var handleProperty = function (graphs, node, upnode) {
		var stmnode = graphs.PDG.makeStm(node);
		upnode.addEdgeOut(stmnode, EDGES.OBJMEMBER)
		makePDGNode(graphs, node.value, stmnode);
	}


	/* THIS EXPRESSION */
	var handleThisExpression = function (graphs, node, upnode) {
		Ast.enclosingScope;
	}


	var handleObjectExpression = function (graphs, node, upnode) {
		var objectentry = new ObjectEntryNode(graphs.PDG.ent_index++, node),
			preventry   = graphs.PDG.entry_node;
		graphs.PDG.changeEntry(objectentry);
		if (esp_isVarDeclarator(upnode.parsenode))
			addDataDep(upnode, objectentry)
		else
			addToPDG(objectentry, upnode);
		node.properties.map(function (prop) {
			makePDGNode(graphs, prop, objectentry)
		})
		graphs.PDG.reverseEntry(preventry);
	}

	/* CALL EXPRESSION */
	var handleCallExpression = function (graphs, node, upnode) {
		// Handle actual parameters of this call
		var callcnt   = ++cnt,
			parsenode = node.expression ? node.expression : node,
			primitive = isPrimitiveCall(node),
			callnode  = graphs.PDG.makeCall(node);
		
		callnode.name = parsenode.callee.toString();
		if (primitive) {
			callnode = PDG.makeCall(node);
			callnode.cnt = callcnt;
			callnode.name = esp_getCalledName(parsenode);
			handleActualParameters(graphs, parsenode, callnode);
			return [contnode, callnode]
		}
		else {
			var preventry = graphs.PDG.entry_node,
				calledf   = Pdg.functionsCalled(node, graphs.AST).values(),
				entry     = graphs.PDG.getEntryNode(calledf[0]),
				formals   = entry.getFormalIn();
			
			/* Add call edge to entry node 
			   Anonymous function created for callback arguments 
			   are only called to evaluate their body. This should not
			   be reflected in the pdg, so no edge to their
			   entry node */
			if (!callnode.name.startsWith('anonf')) {
				addToPDG(callnode, upnode);
				addCallDep(callnode, entry);
			}	
			handleActualParameters(graphs, parsenode, callnode);
			/* Bind the actual and formal parameters */
			for (var i = 0; i < callnode.getActualIn().length; i++) {
				var a = callnode.getActualIn()[i],
				    f = formals[i];
				// actual-in parameter -> formal-in parameter
				if (!a.equalsdtype(f) || 
					!a.isSharedNode() ||
					!f.isSharedNode())
					a.addEdgeOut(f, EDGES.REMOTEPARIN)
				else
				    a.addEdgeOut(f, EDGES.PARIN);
			}
			/* Actual out parameter */
			if (entry.getFormalOut().length > 0 && !name.startsWith('anonf')) {
				var actual_out = new ActualPNode(graphs.PDG.fun_index, -1),
					formal_out = entry.getFormalOut()[0];
				graphs.PDG.fun_index++;
				/* Formal-out parameter -> actual-out parameter */
				if (!actual_out.equalsdtype(formal_out) || 
					!actual_out.isSharedNode() ||
					!formal_out.isSharedNode () )
						formal_out.addEdgeOut(actual_out, EDGES.REMOTEPAROUT); 
					else
						formal_out.addEdgeOut(actual_out, EDGES.PAROUT);
				callnode.addEdgeOut(actual_out, EDGES.CONTROL);  
			}
			/* Add summary edges between a_in and a_out */
			handleSummaryEdges(callnode, entry);
			postRemoteDep(callnode.getActualIn());
			if(!name.startsWith('anonf'))
				entry.addCall(callnode);
		}
	}

	/* ACTUAL PARAMETERS of a function call.
	 * All parameters are bundled by operand continuation edges */
	var handleActualParameters = function (graphs, node, callnode) {
		var nr_param   = node.arguments.length,
			params     = node.arguments,
			curr_param = 0,
			a_in;
		while (nr_param != curr_param) {
			a_in = new ActualPNode(graphs.PDG.fun_index, 1);
			graphs.PDG.fun_index++;
			a_in.parsenode = params[curr_param];
			var PDG_node = makePDGNode(graphs, a_in.parsenode, a_in);
			curr_param++;
			callnode.addEdgeOut(a_in, EDGES.CONTROL);
		}
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
			form_out = new FormalPNode(PDG.fun_index, stm_node.parsenode.toString(), -1);
		PDG.fun_index++;
		entry.addEdgeOut(form_out, EDGES.CONTROL);
		return form_out;
	}

	/* Summary edges are added between actual_in to actual_out parameter if
	 * a path between the corresponding formal_in to formal_out exists */
	var handleSummaryEdges = function (callnode, entrynode) {
		var actual_ins = callnode.getActualIn(),
			actual_out = callnode.getActualOut()[0],
			formal_ins = entrynode.getFormalIn(),
			formal_out = entrynode.getFormalOut()[0];
		if(actual_out && formal_out) {
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
	var handleExpressionStatement = function (graphs, node, upnode) {
		var expressiontype = node.expression ? node.expression.type : node.type;
		switch (expressiontype) {
	      	case 'CallExpression':
	      		return handleCallExpression(graphs, node, upnode);
	      	case 'BinaryExpression' :
	      		return handleBinExp(graphs, node.expression ? node.expression : node, upnode);
	      	case 'AssignmentExpression' :
	      		return handleAssignmentExp(graphs, node, upnode);
	      	case 'ArrayExpression' :
	      		return handleArrayExpression(graphs, node, upnode);
	      	case 'MemberExpression' :
	      		return handleMemberExpression(graphs, node, upnode);
	      	case 'ThisExpression' :
	      		return handleThisExpression(graphs, node, upnode);
	      	case 'NewExpression' :
	      		return handleNewExp(graphs, node, upnode);
	      	case 'Property' :
	      		return handleProperty(graphs, node, upnode);
	      	case 'ObjectExpression' :
	      		return handleObjectExpression(graphs, node, upnode)
	     }
	}

	var handleIdentifier = function (graphs, node, upnode) {
		var parent      = Ast.parent(node, graphs.AST),
			formp       = graphs.PDG.entry_node.getFormalIn(),
			declaration = Pdg.declarationOf(node, graphs.AST);
		/* Accessing object */
		if (esp_isMemberExpression(parent)) {
			var objectentry = upnode.enclosingObjectEntry(),
				memberstm   = objectentry ? objectentry.getMember(node)[0] : false;
			if (memberstm) 
				memberstm.addEdgeOut(upnode, EDGES.DATA);
			else if (declaration) {
				var pdg_nodes   = graphs.ATP.getNode(declaration),
					objectentry = pdg_nodes[0].getOutEdges(EDGES.DATA)
									.map(function (e) {return e.to})
									.filter(function (n) {return n.isObjectEntry})[0];
				//if (objectentry)
				//	objectentry.addEdgeOut(upnode, EDGES.DATA);
			} else {
				declaration = Pdg.declarationOf(parent.object, graphs.AST);
				pdg_nodes   = graphs.ATP.getNode(declaration),
				objectentry = pdg_nodes[0].getOutEdges(EDGES.DATA)
									.map(function (e) {return e.to})
									.filter(function (n) {return n.isObjectEntry})[0],
				memberstm = objectentry ? objectentry.getMember(node)[0] : false;
				if (memberstm)
					memberstm.addEdgeOut(upnode, EDGES.DATA);
			}
		}
		else if (esp_isAssignmentExp(Ast.parent(parent, graphs.AST))) {
			var stm 		= graphs.PDG.makeStm(node),
				
				parent      = Ast.parent(node, graphs.AST),
				stm_node;
			

		}
		else {
			if (declaration) {
			var PDG_nodes = graphs.ATP.getNode(declaration);
				if (PDG_nodes && PDG_nodes.length > 0 && upnode) 
					PDG_nodes.map( function (vardecl) {
						addDataDep(vardecl, upnode)
					})
		
			}	
			//if (parent && esp_isRetStm(parent)) {
			//	var formout = graphs.PDG.entry_node.getFormalOut()[0];
			//	upnode.addEdgeOut(formout, EDGES.DATA);
			//}
			formp = formp.filter( function (f) {
				return f.name === node.name;
			});
			if (formp.length > 0) 
				addDataDep(formp[0], upnode)
		}
	}

	var handleLiteral = function (graphs, node, upnode) {
		var parent    = Ast.parent(node, graphs.AST);
		if (parent && esp_isRetStm(parent)) {
			var stm_node = graphs.PDG.makeStm(parent);
			stm_node.addEdgeOut(upnode, EDGES.CONTROL)
		}
	}


	/* Auxiliary Functions to add correct edges to nodes, etc. */
	var addToPDG = function (node, upnode) {
		if (isClientAnnotated(node.parsenode))
			graphs.PDG.addClientStm(node)
		else if (isServerAnnotated(node.parsenode))
			graphs.PDG.addServerStm(node)
		else 
			upnode.addEdgeOut(node, EDGES.CONTROL)
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
			dupl   = from.getOutEdges(EDGES.REMOTED)
			             .concat(from.getOutEdges(EDGES.DATA))
			             .filter(function (e) {
						    return  e.to.equals(to) });
		if(dupl.length < 1) {
			if(dtypef && dtypet && 
				(dtypef.value !== DNODES.SHARED.value ||
				 dtypet.value !== DNODES.SHARED.value) && 
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
			var datadeps = param.getInEdges(EDGES.DATA).concat(param.getInEdges(EDGES.REMOTED)),
				calldeps = param.edges_out.filter( function (e) {
					return e.to.isCallNode  
				}).map( function (e) { return e.to});

			var paramtype = param.getdtype(true);	

			datadeps.map(function (e) {
				var dtypef = e.from.getdtype(true);
				if(dtypef && paramtype && 
				   (dtypef.value !== DNODES.SHARED.value &&
				   	paramtype.value !== DNODES.SHARED.value) && 
					dtypef.value !== paramtype.value)
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

	/* make PDG node out of an AST node:
	 * graphs = object containing different graphs,
	 * node   = AST node
	 * upnode = direct 'upnode' of current node, e.g. 'return x'-node for the 'x'-node
	 */
	var makePDGNode = function (graphs, node, upnode) {
		var PDG = graphs.PDG,
			jtc = graphs.JTC,
			parsetype = node.type;
			console.log("PDG(" + parsetype + ")" + node);
		switch (parsetype) {
			case 'Program':
				return handleProgram(graphs, node);
  			case 'FunctionDeclaration': 
				return handleDeclarator(graphs, node, upnode);
			case 'VariableDeclaration':
				return handleDeclarator(graphs, node, upnode);
			case 'FunctionExpression' :
				return handleDeclarator(graphs, node, upnode);
			case 'BlockStatement' :
				return handleBlockStatement(graphs, node, upnode);
			case 'IfStatement' :
				return handleIfStatement(graphs, node, upnode);
			case 'ForStatement' :
				return handleForStatement(graphs, node, upnode);
			case 'Identifier' :
				return handleIdentifier(graphs, node, upnode);
			case 'ExpressionStatement' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'BinaryExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'Literal' :
				return handleLiteral(graphs, node, upnode);
			case 'CallExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'AssignmentExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'ArrayExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'ObjectExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'MemberExpression' :
				return handleMemberExpression(graphs, node, upnode);
			case 'Property' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'ReturnStatement' :
				return handleReturnStatement(graphs, node, upnode);
			case 'ThisExpression' :
				return handleExpressionStatement(graphs, node, upnode);
			case 'NewExpression' :
				return handleExpressionStatement(graphs, node, upnode);
		}
	}




	/* Graph */
	function ASTToPDGMap () {
		this._nodes = HashMap.empty(131);
	}

	ASTToPDGMap.prototype.putNodes = function (AstNode, PDGNode) {
		this._nodes = this._nodes.put(AstNode,PDGNode);
	}

	ASTToPDGMap.prototype.addNodes = function (AstNode, PDGNode) {
		var prev = this._nodes.get(AstNode, ArraySet.empty()),
			add  = prev ?  prev.concat(PDGNode) : [PDGNode];
		this._nodes = this._nodes.put(AstNode, add);
	}

	ASTToPDGMap.prototype.getNode = function (AstNode) {
		var emptySet = ArraySet.empty(),
		 	res 	 = this._nodes.get(AstNode, emptySet);
		return res;
	}

	function Graphs (AST, src) {
		this.AST  = AST;
		this.PDG  = new PDG();
		this.ATP  = new ASTToPDGMap();
		this.src  = src;
	}

	/* Create the program dependency graph */
	start = function (graphs) {
		makePDGNode(graphs, graphs.AST);
	}

	module.start = start;
	module.Graphs = Graphs;
	return module;

})();