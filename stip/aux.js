/* Aux function */
var contains = function (els,el) {
	return els.filter(function (e) {
		return e.equals(el)			
	}).length >= 1;
}

/* Aux functions for esprima */

var esp_isFunExp = function (node) {
	return node.type === 'FunctionExpression'
}

var esp_isVarDecl = function (node) {
	return node.type === 'VariableDeclaration'
}

var esp_isVarDeclarator = function (node) {
	return node.type === 'VariableDeclarator'
}

var esp_isFunDecl = function (node) {
	return node.type === 'FunctionDeclaration'
}

var esp_isIdentifier = function (node) {
	return node.type === 'Identifier'
}

var esp_isRetStm = function ( node) {
	return node.type === 'ReturnStatement'
}

var esp_isBinExp = function (node) {
	return 	node.type === 'BinaryExpression'
}

var esp_isLiteral = function (node) {
	return node.type === 'Literal'
}

var esp_isCallExp = function (node) {
	return node.type === 'CallExpression'
}

var esp_isExpStm = function (node) {
	return node.type === 'ExpressionStatement'
}

var esp_isAssignmentExp = function (node) {
	return node.type === 'AssignmentExpression'
}

var esp_isBlockStm = function (node) {
	return 	node.type === 'BlockStatement'
}

var esp_isIfStm = function (node) {
	return 	node.type === 'IfStatement'
}

var esp_isNewExp = function (node) {
	return node.type === 'NewExpression'
}

var esp_isThisExpression = function (node) {
	return node.type === 'ThisExpression'
}

var esp_isMemberExpression = function (node) {
	return node.type === 'MemberExpression'
}

var esp_isForStm = function (node) {
	return node.type === 'ForStatement'
}

var esp_isProperty = function (node) {
	return node.type === 'Property'
}

var esp_isObjExp = function (node) {
	return node.type === 'ObjectExpression'
}


var esp_getCalledName = function (callnode) {
	if (esp_isMemberExpression(callnode.callee)) 
		return callnode.callee.property.name
	else
		return callnode.callee.name
}


/*  Predicates on type of eval node (Jipda nodes) */
var isEval = function (node) {
	return node.type === 'eval'
}

var isKont = function (node) {
	return node.type === 'kont'
}

var isApply = function (node) {
	return node.type === 'apply'
}

var isFunExp = function (graphs, node) {
	return 	isEval(node) && esp_isFunExp(node.node)
}
var isVarDecl = function (graphs, node) {
	return 	isEval(node) && esp_isVarDecl(node.node)
}

var isFunDecl = function (graphs, node) {
	return 	isEval(node) && esp_isFunDecl(node.node)
}

var isIdentifier = function (graphs, node) {
	return 	isEval(node) && esp_isIdentifier(node.node)
}

var isRetStm = function (graphs, node) {
	return esp_isRetStm(node.node)
}

var isBinExp = function (graphs, node) {
	return 	isEval(node) && esp_isBinExp(node.node)
}

var isLiteral = function (graphs, node) {
	return 	isEval(node) && esp_isLiteral(node.node)
}

var isCallExp = function (graphs, node) {
	return 	isEval(node) && esp_isCallExp(node.node)
}

var isExpStm = function (graphs, node) {
	return 	isEval(node) && esp_isExpStm(node.node)
}

var isAssignmentExp = function (graphs, node) {
	return 	isEval(node) && esp_isAssignmentExp(node.node)
}

var isBlockStm = function (graphs, node) {
	return 	isEval(node) && esp_isBlockStm(node.node)
}

var isIfStm = function (graphs, node) {
	return 	isEval(node) && esp_isIfStm(node.node)
}


var isOperandKont = function (edge) {
	return 	edge.g && edge.g.frame && edge.g.frame.node && 
			edge.g.frame.node.type === 'CallExpression' &&
			edge.g.frame.operandValues;
}

var isReturnKont = function (kont) {
	return kont.completion &&
	       kont.completion === "return"
}

var declarations = function (graph, s, name) {
  var targets = HashSet.empty();
  var visited = HashSet.empty();
  var todo = [s];
  while (todo.length > 0)
  {
    var q = todo.shift();
    if (visited.contains(q))
    {
      continue;
    }
    visited = visited.add(q);
    if (q.node && q.node.type === "VariableDeclaration" && q.node.declarations[0].id.name === name)
    {
      targets = targets.add(q);
      continue;
    }
    var incoming = graph.incoming(q);
    todo = incoming.reduce(
      function (todo, e)
      {
        if (e.g && e.g.isPop && e.g.frame.isMarker)
        {
          return todo.concat(Pushdown.framePredecessors(q, e.g.frame, ecg));
        }
        return todo.addLast(e.source);
      }, todo);
  }
  return targets.values();

}

/*  Tierless primitives */
var primitives = ['read', 'print', 'broadcast', 'subscribe', 'installL'];
var isPrimitiveCall = function (node) {
	var checkName = function (name) {
		return 	contains(primitives, name)
	}
	return 	(node.isCallNode &&  checkName(node.name)) || 
			(node.node && node.node.type === "CallExpression" && checkName(node.node.callee.name)) 
}

Array.prototype.memberAt =
	function (x)
	{
		for (var i = 0; i < this.length; i++)
		{
			var el = this[i];
			if (x.equals(el))
			{
				return i;
			}
		}
		return -1;
	};

Array.prototype.remove =
  function (x)
  {
    var i = this.memberAt(x);
    if (i === -1)
    {
      return this.slice(0);
    }
    return this.slice(0, i).concat(this.slice(i+1));
  }