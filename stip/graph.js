/***************************************************************
*   Distributed program dependency graph     					*
*                                            					*
*               GRAPH                        					*
*                                            					*
*  - entry    		  	(NODE)		         					*
*  - dclient          	(distributed node - client) 			*
*  - dserver		   	(distributed node - server)				*
*  - current_index		(index of current entry node)			*
*  - ent_index			(index for entry nodes)					*
*  - stm_index			(index for statement nodes)				*
*  - cal_index			(index for call nodes)					*
*  - fun_index			(index for function arguments/params)	*
*  - nodes				(list of entry nodes)					*
****************************************************************/


function PDG () {
  this.entry_node;
  this.curr_body_node;
  this.initial;
  // Distributed
  this.dclient;
  this.dserver;
  this.current_index = 0; 
  this.ent_index	 = 0;
  this.stm_index 	 = 0;
  this.cal_index 	 = 0;
  this.fun_index 	 = 0;
  this.nodes 		 = [];
}

PDG.prototype.reverse_entry = function (node) {
  	this.entry_node = node;		
}

PDG.prototype.add_node = function (node) {
	var find = this.nodes.filter(function (n) {
		return n.id === node.id
	})
	if(find.length === 0)
  		this.nodes.push(node);
}

PDG.prototype.make_stm = function (node) {
	var stm = new StatementNode(this.stm_index, node);
	this.stm_index++;
	return stm;
}

PDG.prototype.decr_stm = function () {
	this.stm_index--;
}

PDG.prototype.make_cal = function (node) {
	var cal = new CallNode(this.cal_index, node);
	this.cal_index++;
	return cal;
}

PDG.prototype.change_entry = function (node) {
  this.entry_node = node;
  this.curr_body_node = node;
  this.add_node(node);
  this.current_index = this.nodes.length - 1;
  this.ent_index++;
}

/* Look for the entry node,
   given its name and the current callnode      */
PDG.prototype.getEntryNode = function (name, node) {
	var entries  = this.nodes,
		filtered = entries.filter(function (n) {
		if(n.parsenode && n.parsenode.declarations) 
			return n.parsenode.declarations[0].id.name === name;
		else if (n.parsenode && n.parsenode.id)
			return n.parsenode.id.name === name;
		else {
			var incoming = n.edges_in.filter(function (e) {
				   return e.type === EDGES.DATA;
			    }),
			    innodes = incoming.filter(function (e) {
				   return e.from.parsenode &&
				   		  e.from.parsenode.type === "VariableDeclaration" &&
				          e.from.parsenode.declarations[0].id.name === name;
			   });
		   if(innodes.length === 0 && node) {
			    var pn = n.parsenode;
				if(pn && pn.tag === node.fun.tag)
				  return true;
			 	
		   }
		   return innodes.length !== 0;
		}
	});

	return filtered[0];
}

PDG.prototype.getAllNodes = function () {
	var nodes     = [],
		contains  = function (set, id) {
    					for (var i = 0; i < set.length; i++) {
      						if(set[i].id === id)
        						return true;
    					}
    					return false;
  					};
		selectAll = function (node) {
			if (!contains(nodes, node.id )) {
				nodes = nodes.concat(node);
				var out = node.edges_out.map(function (e) { return e.to});
				out.map(function (n) {selectAll(n)})
			}
		};
	this.nodes.map(function (n) {selectAll(n)});
	nodes.sort(function (n1, n2) {
    	return n1.cnt - n2.cnt;
    })
	return nodes;
}

/* Distributed components */

/* Add a client statement
   checks first if corresponding distributed node exists */
PDG.prototype.addClientStm = function (node) {
	node.dtype = DNODES.CLIENT;
	if (this.dclient)
		this.dclient.add_edge_out(node, EDGES.CONTROL)
	else {
		this.dclient = new DistributedNode(DNODES.CLIENT);
		this.nodes[0].add_edge_out(this.dclient, EDGES.CONTROL);
		this.dclient.add_edge_out(node, EDGES.CONTROL)
	}
}

/* Add a server statement
   checks first if corresponding distributed node exists */
PDG.prototype.addServerStm = function (node) {
	node.dtype = DNODES.SERVER;
	if (this.dserver)
		this.dserver.add_edge_out(node, EDGES.CONTROL)
	else {
		this.dserver = new DistributedNode(DNODES.SERVER);
		this.nodes[0].add_edge_out(this.dserver, EDGES.CONTROL);
		this.dserver.add_edge_out(node, EDGES.CONTROL)
	}
}

/************************/
/* 	Slice algorithm		*/
/************************/

/* Aux function for the union of an array 
   (filters out doubles)*/
var union = function (array) {
  var a = array.concat();
  for (var i = 0; i < a.length; ++i) {
      for(var j = i + 1; j < a.length; ++j) {
          if(a[i] === a[j])
              a.splice(j--, 1);
      }
  }
  return a
}

PDG.prototype.slice = function (node) { 
  
  var contains = function (equal, set) {
    for (var i = 0; i < set.length; i++) {
      if(equal(set[i]))
        return true;
    }
    return false;
  };

  var traverse_backward = function (nodes, set, ignore) {
    for(var i = 0; i<nodes.length; i++) {  
      var node 		= nodes[i],
 		  tdtype 	= node.getdtype(true),
          edges_in 	= node.edges_in,
      	  equal 	= function (id) {return function (n) {return n.id === id}};
      if(!(contains(equal(node.id), set))) {
        set.push(node);
        for(var j = 0; j < edges_in.length; j++) {
          var edge 		= edges_in[j],
              from 		= edge.from,
              fdtype 	= from.getdtype(true),
              type_eq 	= function (t) {return edge.type.value === t.value};
		  /* While traversing backward, don't follow edges from a formal parameter
		     to a node contained in another distributed component 
			 Also don't follow a remote call edge from the current call node*/
          if (!(contains(equal(from.id), set)) && 
              !(contains(type_eq, ignore)) &&
			  //!(node.isFormalNode) &&  
			  (fdtype && tdtype && 
				(fdtype.value === DNODES.SHARED.value || tdtype.value === DNODES.SHARED.value || fdtype.value === tdtype.value)) &&
			  !(from.isCallNode && edge.equalsType(EDGES.REMOTEC))) {
 	    			traverse_backward([from],set,ignore);
          }  
        }
      }
    }
    return set;
  }
  /* two passes of the algorithm */
  var first_pass 	= traverse_backward([node],[], [EDGES.PAROUT, EDGES.REMOTEPAROUT, EDGES.REMOTEPARIN]),
  	  second_pass 	= traverse_backward(first_pass,[],[EDGES.PARIN, EDGES.REMOTEPARIN, EDGES.REMOTEPAROUT, EDGES.CALL]);
  return union(first_pass.concat(second_pass)); 
};

PDG.prototype.sliceDistributedNode = function (dnode) {
	if(!dnode)
	  return [];
	var toslice,
	    slicedset = [],
	    getLeaves = function (node) {
		  leaves = [];
		  out = node.edges_out;
		  while (out.length > 0) {
				var edge = out.shift(),
			     	target = edge.to,
			    	control_out = target.edges_out.filter(function (e) {
						return e.type.value === EDGES.CONTROL.value;
					}),
					data_out = target.edges_out.filter(function (e) {
						return e.type.value === EDGES.DATA.value
					});
					if(	target.parsenode && 
						target.parsenode.type === 'VariableDeclaration' &&
					   	data_out.length > 0 && 
					    data_out[0].to.parsenode && 
					    data_out[0].to.parsenode.type === 'FunctionExpression') 
					   out = out.concat(data_out);
					else if (control_out.length === 0 && !target.isFormalNode && 
						    !(target.isActualPNode && target.direction === -1))
						    leaves = leaves.concat([target]);
					else 
						out = out.concat(control_out);		
			}
			return leaves;
		};
	if (dnode.dtype.value === DNODES.CLIENT.value)
		toslice = this.dclient
	else 
		toslice = this.dserver
	var outgoing = toslice.edges_out,
	    leaves 	 = getLeaves(toslice);
	while (leaves.length > 0) {
		var set = this.slice(leaves.shift());
		slicedset = union(slicedset.concat(set))
	}

	return slicedset
}

// Example graph from "Slicing Object-Oriented Software", Larsen and Harrold
/*var E0 = new EntryNode(0), E11 = new EntryNode(11),
    S1 = new StatementNode(1), S2 = new StatementNode(2), S3 = new StatementNode(3), S4 = new StatementNode(4), S5 = new StatementNode(5),
    S6 = new StatementNode(6), S8 = new StatementNode(8), S10 = new StatementNode(10), S12 = new StatementNode(12),
    C7 = new CallNode(7), C9 = new CallNode(9),
    A1_in = new ActualPNode(1,1), A2_in = new ActualPNode(2,1), A1_out = new ActualPNode(1,-1), A3_in = new ActualPNode(3,1),
    F1_in = new FormalPNode(1,1), F2_in = new FormalPNode(2,1), F1_out = new FormalPNode(1,-1);

E0.add_edges_out([[S1,EDGES.CONTROL],[S2,EDGES.CONTROL],[S3,EDGES.CONTROL], [S4,EDGES.CONTROL], [S5,EDGES.CONTROL], [S10,EDGES.CONTROL]]);
S5.add_edges_out([[S6,EDGES.CONTROL],[S8,EDGES.CONTROL]]);
S6.add_edges_out([[C7,EDGES.CONTROL], [S6,EDGES.CONTROL]]);
S8.add_edges_out([[C9,EDGES.CONTROL],[S8,EDGES.CONTROL]]);
C7.add_edges_out([[A2_in,EDGES.CONTROL]]);
C9.add_edges_out([[A1_in,EDGES.CONTROL], [A3_in,EDGES.CONTROL], [A1_out,EDGES.CONTROL],[E11,EDGES.CALL]]);
E11.add_edges_out([[F1_in,EDGES.CONTROL], [F2_in,EDGES.CONTROL], [F1_out,EDGES.CONTROL],[S12,EDGES.CONTROL]]);
S1.add_edges_out([[S6,EDGES.DATA],[S8,EDGES.DATA]]);
S2.add_edges_out([[A1_in,EDGES.DATA], [S6,EDGES.DATA], [S8,EDGES.DATA]]);
S3.add_edges_out([[S6,EDGES.DATA],[S8, EDGES.DATA]]);
S4.add_edges_out([[S5,EDGES.DATA]]);
A1_out.add_edges_out([[S10,EDGES.DATA]]);
A1_in.add_edges_out([[F1_in,EDGES.PARIN],[A1_out,EDGES.SUMMARY]]);
A3_in.add_edges_out([[F2_in,EDGES.PARIN], [A1_out,EDGES.SUMMARY]]);
S12.add_edges_out([[F1_out,EDGES.DATA]]);
F1_in.add_edges_out([[S12,EDGES.DATA]]);
F2_in.add_edges_out([[S12,EDGES.DATA]]);
F1_out.add_edges_out([[A1_out,EDGES.PAROUT]]); */
