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

var esp_isFunDecl = function (node) {
  return node.type === 'FunctionDeclaration'
}

var esp_isVarDecl = function (node) {
    return node.type === 'VariableDeclaration'
}

var esp_isVarDeclarator = function (node) {
    return node.type === 'VariableDeclarator'
}


var esp_isIdentifier = function (node) {
    return node.type === 'Identifier'
}

var esp_isRetStm = function ( node) {
    return node.type === 'ReturnStatement'
}

var esp_isBinExp = function (node) {
    return  node.type === 'BinaryExpression'
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
    return  node.type === 'BlockStatement'
}

var esp_isIfStm = function (node) {
    return  node.type === 'IfStatement'
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

var esp_isThrowStm = function (node) {
  return node.type === 'ThrowStatement'
}

var esp_isTryStm = function (node) {
  return node.type === 'TryStatement'
}

var esp_isCatchStm = function (node) {
  return node.type === 'CatchClause'
}

var esp_isProgram = function (node) {
  return node.type === 'Program'
}

var esp_isArrayExp = function (node) {
  return node.type === 'ArrayExpression'
}

var esp_getCalledName = function (callnode) {
    if (esp_isMemberExpression(callnode.callee)) 
        return callnode.callee.property.name
    else
        return callnode.callee.name
}

var esp_inTryStatement = function (ast, node) {
  var parent = Ast.parent(node, ast);
  while (!esp_isProgram(parent)) {
    if (esp_isTryStm(parent))
      break;
    parent = Ast.parent(parent, ast)

  }
  return parent
}

var esp_hasCallStm = function (node, callnode) {
  var src  = escodegen.generate(node.parsenode),
      call = false,
      calls;
  /* Try catch, because node could be a return statement, which is not a valid program*/
  try {
      falafel(src, function (node) {
        if (esp_isCallExp(node)) 
          if (callnode)
            call = (src.indexOf(escodegen.generate(callnode)) >= 0);
          else
            call = true;
      });
      return call;
  } catch (e) {
      calls = node.getOutEdges(EDGES.CONTROL)
                .filter(function (e) {return e.to})
                .filter(function (n) {return n.isCallNode})
                .filter(function (c) {return callnode.equals(c.parsenode)});
      return calls.length > 0;
  }
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