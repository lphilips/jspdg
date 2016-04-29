/***************************************************************
*   Distributed program dependency graph                        *
*                                                               *
*               GRAPH                                           *
*                                                               *
*  - entry              (NODE)                                  *
*  - dclient            (distributed node - client)             *
*  - dserver            (distributed node - server)             *
*  - current_index      (index of current entry node)           *
*  - ent_index          (index for entry nodes)                 *
*  - stm_index          (index for statement nodes)             *
*  - cal_index          (index for call nodes)                  *
*  - fun_index          (index for function arguments/params)   *
*  - nodes              (list of entry nodes)                   *
****************************************************************/


function PDG () {
  this.entryNode;
  this.currBodyNode;
  this.initial;
  // Distributed
  this.dclient;
  this.dserver;
  this.currentIndex = 0; 
  this.entIndex     = 0;
  this.stmIndex     = 0;
  this.calIndex     = 0;
  this.funIndex     = 0;
  this.proIndex     = 0;
  this.exiIndex     = 0;
  this.nodes        = [];
}

PDG.prototype.reverseEntry = function (node) {
    this.entryNode = node;     
}

PDG.prototype.addNode = function (node) {
    var find = this.nodes.filter(function (n) {
        return n.id === node.id
    })
    if(find.length === 0)
        this.nodes.push(node);
}

PDG.prototype.makeStm = function (node) {
    return new StatementNode(++this.stmIndex, node);
}

PDG.prototype.decrStm = function () {
    this.stmIndex--;
}

PDG.prototype.makeCall = function (node) {
    return new CallNode(++this.calIndex, node);
}

PDG.prototype.makeObjEntry = function (node) {
    return new ObjectEntryNode(++this.proIndex, node);
}

PDG.prototype.makeExitNode = function (node, exception) {
  return new ExitNode(++this.exiIndex, node, exception);
}

PDG.prototype.makeFormalNode = function (node, direction) {
  return new FormalPNode(++this.funIndex, node.toString(), direction);
}

PDG.prototype.changeEntry = function (node) {
  this.entryNode = node;
  this.currBodyNode = node;
  this.addNode(node);
  this.currentIndex = this.nodes.length - 1;
  this.entIndex++;
}

/* Look for the entry node,
   given its name and its parsenode */
PDG.prototype.getEntryNode = function (parsenode) {
    var entries  = this.nodes,
        filtered = entries.filter(function (n) {
            return n.parsenode === parsenode
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
PDG.prototype.addClientStm = function (node, ast) {
    node.dtype = DNODES.CLIENT;
    if (this.dclient)
        this.dclient.addEdgeOut(node, EDGES.CONTROL)
    else {
        this.dclient = new DistributedNode(DNODES.CLIENT, ast);
        this.nodes[0].addEdgeOut(this.dclient, EDGES.CONTROL);
        this.dclient.addEdgeOut(node, EDGES.CONTROL)
    }
}

/* Add a server statement
   checks first if corresponding distributed node exists */
PDG.prototype.addServerStm = function (node, ast) {
    node.dtype = DNODES.SERVER;
    if (this.dserver)
        this.dserver.addEdgeOut(node, EDGES.CONTROL)
    else {
        this.dserver = new DistributedNode(DNODES.SERVER, ast);
        this.nodes[0].addEdgeOut(this.dserver, EDGES.CONTROL);
        this.dserver.addEdgeOut(node, EDGES.CONTROL)
    }
}

/************************/
/*  Slice algorithm     */
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

PDG.prototype.slice = function (criterion, tiersplitting) { 
  
  function contains (equal, set) {
    for (var i = 0; i < set.length; i++) {
      if(equal(set[i]))
        return true;
    }
    return false;
  }

  function enclosingFunction (node) {
    if (node.isEntryNode && !node.parsenode) 
      return node; 
    else if (node.isEntryNode && (Aux.isFunExp(node.parsenode) || Aux.isFunDecl(node.parsenode))) 
      return node; 
    else if (node.isObjectEntry)
      return enclosingFunction(node.getInNodes(EDGES.DATA)[0]);
    else 
      return enclosingFunction(node.getInNodes(EDGES.CONTROL)[0]);
  }

  function includeSharedFunction (node) {
    var entryN = enclosingFunction(node),
        entryC = enclosingFunction(criterion);
    if (entryC.isClientNode()) {
      return entryN.clientCalls && entryN.clientCalls > 0;
    }
    else if (entryC.isServerNode()) {
      return entryN.serverCalls && entryN.serverCalls > 0;
    }
    else 
      return true;
  }

  /* get assignments on variable declaration left in AST from original slicing criterion */
  function getAssignments (statementNode) {
    var assignments = []; 
    if (statementNode.isStatementNode && Aux.isVarDeclarator(statementNode.parsenode)) {
        assignments = statementNode.getOutNodes(EDGES.DATA)
                      .filter(function (n) {
                        if (tiersplitting && n.cnt < criterion.cnt) {
                          if (criterion.equalsdtype(n))
                            return  n.isCallNode || n.isStatementNode &&
                                (Aux.isExpStm(n.parsenode) &&
                                  Aux.isAssignmentExp(n.parsenode.expression) ||
                                  Aux.isAssignmentExp(n.parsenode));
                          else
                            return criterion.isActualPNode && n.isSharedNode() && includeSharedFunction(n) && 
                                (n.isCallNode || n.isStatementNode &&
                                (Aux.isExpStm(n.parsenode) &&
                                  Aux.isAssignmentExp(n.parsenode.expression) ||
                                  Aux.isAssignmentExp(n.parsenode)));
                        } else
                          return n.cnt < criterion.cnt && 
                            (n.isCallNode || n.isStatementNode &&
                          (Aux.isExpStm(n.parsenode) && 
                            Aux.isAssignmentExp(n.parsenode.expression)) ||
                           Aux.isAssignmentExp(n.parsenode));
                       });
    }

    return assignments;
  }

  var traverse_backward = function (nodes, set, ignore) {
    nodes.map(function (node) {
      var tdtype    = node.getdtype(true),
          equal     = function (id) {return function (n) {return n.id === id}};
      if(!(contains(equal(node.id), set))) {
        set.push(node);
        getAssignments(node, tiersplitting).map(function (n) {
             traverse_backward([n], set, ignore);
        });
        node.edges_in.map(function (edge) {
          var from     = edge.from,
              fdtype   = from.getdtype(true),
              type_eq  = function (t) {return edge.type.value === t.value};

          /* While traversing backward, don't follow edges from a formal parameter
             to a node contained in another distributed component 
             Also don't follow a remote call edge from the current call node*/
          if (!(contains(equal(from.id), set)) && 
              !(contains(type_eq, ignore)) &&
              //!(node.isFormalNode) &&  
              (fdtype && tdtype && 
                (fdtype.value === DNODES.SHARED.value || 
                 tdtype.value === DNODES.SHARED.value || 
                 fdtype.value === tdtype.value)) &&
                !(from.isCallNode && edge.equalsType(EDGES.REMOTEC))) {
                    traverse_backward([from], set, ignore);
          }  
        })
      }
    })
    return set;
  }

  /* two passes of the algorithm */
  var first_pass    = traverse_backward([criterion],[], [EDGES.PAROUT, EDGES.REMOTEPAROUT, EDGES.REMOTEPARIN, EDGES.REMOTED, EDGES.PROTOTYPE]),
      second_pass   = traverse_backward(first_pass,[],[EDGES.PARIN, EDGES.REMOTEPARIN, EDGES.REMOTEPAROUT, EDGES.CALL, EDGES.REMOTED, EDGES.PROTOTYPE]);
  return union(first_pass.concat(second_pass)); 
};

PDG.prototype.sliceDistributedNode = function (dnode) {
    if(!dnode)
      return [];
    var toslice,
        slicedset = [],
        getLeaves = function (node) {
          var leaves = [],
              visited = [],
              out = node.edges_out;
          while (out.length > 0) {
                var edge = out.shift(),
                    target = edge.to,
                    control_out = target.getOutEdges(EDGES.CONTROL)
                            .filter(function (e) {
                              return e.to.getdtype(true).value === dnode.dtype.value
                    }),
                    data_out = target.getOutEdges(EDGES.DATA)
                            .filter(function (e) {
                                return e.to.getdtype(true).value === dnode.dtype.value
                    }),
                    proto_out = target.getOutEdges(EDGES.OBJMEMBER)
                            .filter(function (e) {
                              return e.to.getdtype(true).value === dnode.dtype.value
                            });
                    if( target.parsenode && 
                        (target.parsenode.type === 'VariableDeclaration'  ||
                          (target.parsenode.type === 'ExpressionStatement' && 
                            target.parsenode.expression.type === 'AssignmentExpression'))
                        &&
                        data_out.length > 0 && 
                        data_out[0].to.parsenode && 
                        (data_out[0].to.parsenode.type === 'FunctionExpression' ||
                          data_out[0].to.isObjectEntry)) 
                       out = out.concat(data_out).concat(control_out);
                    else if (control_out.length === 0 && 
                            proto_out.length == 0 && 
                            visited.indexOf(target) < 0)
                            leaves = leaves.concat([target]);
                    else if (visited.indexOf(target) < 0) {                        
                        out = out.concat(control_out);  
                        out = out.concat(proto_out);  
                    }
                    visited.push(target);
            }
            return leaves;
        };
    if (dnode.dtype.value === DNODES.CLIENT.value)
        toslice = this.dclient
    else 
        toslice = this.dserver
    var outgoing = toslice.edges_out,
        leaves   = getLeaves(toslice);
    while (leaves.length > 0) {
        var set = this.slice(leaves.shift(), true);
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


if (typeof module !== 'undefined' && module.exports != null) {
    var pdg_edge        = require('./edge.js');
    var EDGES           = pdg_edge.EDGES;
    var PDG_Edge        = pdg_edge.PDG_Edge;
    var Parameter_Edge  = Parameter_Edge;

    var node            = require('./node.js');
    var PDG_Node        = node.PDG_Node;
    var EntryNode       = node.EntryNode;
    var ObjectEntryNode = node.ObjectEntryNode;
    var CallNode        = node.CallNode;
    var StatementNode   = node.StatementNode;
    var FormalPNode     = node.FormalPNode;
    var ActualPNode     = node.ActualPNode;
    var ExitNode        = node.ExitNode;
    var DNODES          = node.DNODES;
    var ARITY           = node.ARITY;
    var DistributedNode = node.DistributedNode;
    exports.PDG = PDG;
}
