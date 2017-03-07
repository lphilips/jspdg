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

var pdg_edge        = require('./edge.js');
var EDGES           = pdg_edge.EDGES;


var node            = require('./node.js');
var ObjectEntryNode = node.ObjectEntryNode;
var CallNode        = node.CallNode;
var StatementNode   = node.StatementNode;
var FormalPNode     = node.FormalPNode;
var ExitNode        = node.ExitNode;
var FunctionalityNode = node.FunctionalityNode;
var DNODES          = node.DNODES;
var DistributedNode = node.DistributedNode;
var Aux             = require('../aux.js');


function PDG () {
  this.entryNode;
  this.currBodyNode;
  this.rootNode;
  this.currentIndex = 0; 
  this.entIndex     = 0;
  this.stmIndex     = 0;
  this.calIndex     = 0;
  this.funIndex     = 0;
  this.proIndex     = 0;
  this.exiIndex     = 0;
  this.nodes        = [];
  /* Functionality Nodes */
  this.fnodes       = {};
  this.placements   = {};
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

PDG.prototype.getAllNodes = function (filter) {
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
                nodes.push(node);
                var out = node.getOutNodes();
                out.map(function (n) {selectAll(n)})
            }
        };
    this.nodes.map(function (n) {selectAll(n)});
    this.getFunctionalityNodes().map(function (n) {selectAll(n)});
    nodes.sort(function (n1, n2) {
        return n1.cnt - n2.cnt;
    });
    if (filter)
      return nodes.filter(function (n) {return filter(n)});
    else
      return nodes;
}



/* Component nodes */

PDG.prototype.addFunctionalityStm = function (tag, node) {
  var functionality = this.fnodes[tag];
  node.ftype = tag;
  if (functionality)
    functionality.addEdgeOut(node, EDGES.CONTROL);
}

PDG.prototype.getFunctionalityNode = function (tag) {
  return this.fnodes[tag];
}

PDG.prototype.getFunctionalityNodes = function () {
  var fnodes = [];
  var self = this;
  Object.keys(this.fnodes).forEach(function(key,index) {
      if (key !== "generated")
        fnodes.push(self.fnodes[key]);
  });
  return fnodes;
}

PDG.prototype.createFunctionalityNode = function (tag, tier) {
  var fnode = new FunctionalityNode(tag, tier);
  this.fnodes[tag] = fnode;
  return fnode;
}

/* Add a client statement
   checks first if corresponding distributed node exists */
PDG.prototype.addClientStm = function (node) {
    var dnode = this.fnodes[DNODES.CLIENT];
    if (dnode)
        this.addFunctionalityStm(DNODES.CLIENT, node);
    else {
        dnode = new DistributedNode(DNODES.CLIENT);
        this.rootNode.addEdgeOut(dnode, EDGES.CONTROL);
        this.fnodes[DNODES.CLIENT] = dnode;
        this.addFunctionalityStm(DNODES.CLIENT, node); 
    }
}

/* Add a server statement
   checks first if corresponding distributed node exists */
PDG.prototype.addServerStm = function (node) {
    var dnode = this.fnodes[DNODES.SERVER];
    if (dnode)
        this.addFunctionalityStm(DNODES.SERVER, node);
    else {
        dnode = new DistributedNode(DNODES.SERVER);
        this.rootNode.addEdgeOut(dnode, EDGES.CONTROL);
        this.fnodes[DNODES.SERVER] = dnode;
        this.addFunctionalityStm(DNODES.SERVER, node);
        
    }
}


/* Distribute: make sure every component node
   has a tier property. If not, calculate it from the given
   placement strategy */

PDG.prototype.distribute = function (strategy) {
  var self = this;
  this.getFunctionalityNodes().forEach(function (fnode) {
      var placement = self.placements[fnode.ftype];
      if (placement) {
          if (placement == DNODES.CLIENT) {
              fnode.tier = DNODES.CLIENT;
          }
          else if (placement == DNODES.SERVER) {
              fnode.tier = DNODES.SERVER;
          }
      }
  });
  strategy.addPlacementTags(self);
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
          if(a[i].equals(a[j]))
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
    if (node.isRootNode)
      return node;
    else if (node.isEntryNode && !node.parsenode) 
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
                          if (criterion.equalsFunctionality(n))
                            return  n.isCallNode || n.isStatementNode &&
                                  (Aux.isExpStm(n.parsenode) &&
                                  Aux.isAssignmentExp(n.parsenode.expression) ||
                                  Aux.isAssignmentExp(n.parsenode));
                          else
                            return criterion.isActualPNode && n.isSharedNode() && 
                                  includeSharedFunction(n) && 
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
      var tCType    = node.getFType(true),
          equal     = function (id) {return function (n) {return n.id === id}};

      if(!(contains(equal(node.id), set))) {
        set.push(node);
        getAssignments(node, tiersplitting).map(function (n) {
             traverse_backward([n], set, ignore);
        });
        node.edges_in.map(function (edge) {
          var from     = edge.from,
              fCType   = from.getFType(true),
              type_eq  = function (t) {return edge.type.value === t.value};

          /* While traversing backward, don't follow edges from a formal parameter
             to a node contained in another distributed component 
             Also don't follow a remote call edge from the current call node*/
          if (!(contains(equal(from.id), set)) && 
              !(contains(type_eq, ignore)) &&
              //!(node.isFormalNode) &&  
              (fCType && tCType && 
                (fCType === DNODES.SHARED|| 
                 tCType === DNODES.SHARED|| 
                 fCType === tCType)) &&
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



PDG.prototype.forwardslice = function (criterion, tiersplitting) {

    function contains (equal, set) {
        for (var i = 0; i < set.length; i++) {
            if(equal(set[i]))
                return true;
        }
        return false;
    }

    function enclosingFunction (node) {
        if (node.isRootNode)
            return node;
        else if (node.isEntryNode && !node.parsenode)
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
                        if (criterion.equalsFunctionality(n))
                            return  n.isCallNode || n.isStatementNode &&
                                (Aux.isExpStm(n.parsenode) &&
                                Aux.isAssignmentExp(n.parsenode.expression) ||
                                Aux.isAssignmentExp(n.parsenode));
                        else
                            return criterion.isActualPNode && n.isSharedNode() &&
                                includeSharedFunction(n) &&
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

    var traverse_forward= function (nodes, set, ignore) {
        nodes.map(function (node) {
            var fCType    = node.getFType(true),
                equal     = function (id) {return function (n) {return n.id === id}};

            if(!(contains(equal(node.id), set))) {
                set.push(node);
                getAssignments(node, tiersplitting).map(function (n) {
                    traverse_forward([n], set, ignore);
                });
                node.getOutEdges()
                    .map(function (edge) {
                    var to    = edge.to,
                        tCType   = to.getFType(true),
                        type_eq  = function (t) {return edge.type.value === t.value};

                    /* While traversing forward, don't follow edges from a formal parameter
                     to a node contained in another distributed component
                     Also don't follow a remote call edge from the current call node*/
                    if (!(contains(equal(to.id), set)) &&
                        !(contains(type_eq, ignore)) &&
                        //!(node.isFormalNode) &&
                        (fCType && tCType &&
                        (fCType === DNODES.SHARED||
                        tCType === DNODES.SHARED||
                        fCType === tCType)) &&
                        !(to.isActualPNode && edge.from.isActualPNode) &&
                        !(to.isCallNode && edge.equalsType(EDGES.REMOTEC))) {
                            traverse_forward([to], set, ignore);
                    }
                })
            }
        })
        return set;
    }

    /* two passes of the algorithm */
    var first_pass    = traverse_forward([criterion],[], [EDGES.PAROUT,EDGES.PROTOTYPE, EDGES.PARIN,  EDGES.REMOTEPAROUT, EDGES.REMOTEPARIN,  EDGES.CALL, EDGES.SUMMARY, EDGES.REMOTED]),
        second_pass   = traverse_forward(first_pass,[],[EDGES.PARIN, EDGES.PROTOTYPE, EDGES.PAROUT, EDGES.REMOTEPARIN, EDGES.REMOTEPAROUT, EDGES.CALL, EDGES.SUMMARY, EDGES.REMOTED]);
    return union(first_pass.concat(second_pass));
};


PDG.prototype.sliceTier = function (tier) {
  var self = this;
  return this.getFunctionalityNodes()
          .filter(function (comp) {return comp.tier == tier || comp.tier == DNODES.SHARED})
          .flatMap(function (comp) {return self.sliceDistributedNode(comp.getFType())});
}


PDG.prototype.sliceDistributedNode = function (ctype) {
    if(!ctype)
      return [];
    var toslice = this.fnodes[ctype],
        slicedset = [],
        getLeaves = function (node) {
          var leaves = [],
              visited = [],
              out = node.edges_out.slice();
          while (out.length > 0) {
                var edge = out.shift(),
                    target = edge.to,
                    control_out = target.getOutEdges(EDGES.CONTROL)
                            .filter(function (e) {
                              return e.to.equalsFunctionality(toslice);
                    }),
                    data_out = target.getOutEdges(EDGES.DATA)
                            .filter(function (e) {
                                return e.to.equalsFunctionality(toslice);
                    }),
                    proto_out = target.getOutEdges(EDGES.OBJMEMBER)
                            .filter(function (e) {
                              return e.to.equalsFunctionality(toslice);
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
    var outgoing = toslice.edges_out,
        leaves   = getLeaves(toslice);
    while (leaves.length > 0) {
        var set = this.slice(leaves.shift(), true);
        slicedset = union(slicedset.concat(set))
    }
    return slicedset
}

exports.PDG = PDG;
global.PDG = PDG;