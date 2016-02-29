/* General transpile function.
 *
 * Parameters: transpiler object, contains:
 *    - node         : PDG node to be transpiled
 *    - nodes        : rest of PDG nodes that should be transpiled
 *    - ast          : original AST program (needed to calculate parent nodes, etc.)
 *    - options      : object containing flags for CPS transformation, ...
 *    - transform    : actual transpiler
 *    - setup        : array, statements that should be added in beginning of program
 *    - closeup      : array, statements that should be added at end of program
 * 
 * Returns: transpiler object, contains all of the above + transpiled node.
 * 
 */
var Transpiler = (function () {

    function createTranspileObject (node, nodes, ast, options, transform, setup, closeup) {
        return {
            node        : node,
            nodes       : nodes,
            ast         : ast,
            options     : options,
            transform   : transform,
            setup       : setup ? setup : [],
            closeup     : closeup ? closeup : []
        };

    }

    function copyTranspileObject (transpiler, newnode) {
        return createTranspileObject(
            newnode ? newnode : transpiler.node,
            transpiler.nodes,
            transpiler.ast,
            transpiler.options,
            transpiler.transform,
            transpiler.setup,
            transpiler.closeup
            );
    }

    function copySetups (transpilerFrom, transpilerTo) {
        transpilerTo.setup = transpilerFrom.setup;
        transpilerTo.closeup = transpilerFrom.closeup;
    }

    function transpile (transpiler) {

        
        var transformer = transpiler.transform;
        var node = transpiler.node;
        var expression;
        var parent;

        if (node.isActualPNode) {
            return transformer.transformActualParameter(transpiler);
        }
        else if (node.isFormalNode) {
            return transformer.transformFormalParameter(transpiler);
        }
        else if (node.isExitNode) {
            return transformer.transformExitNode(transpiler);
        }
        parent = Ast.parent(node.parsenode, transpiler.ast);
        /* In order not to loose the expression statement, we check this first */
        if (Aux.isExpStm(node.parsenode) || Aux.isExpStm(parent)) {

            /* Make sure the parsenode is the expression statement */
            if (Aux.isExpStm(parent)) {
                transpiler.node.parsenode = parent;
            }

            expression = node.parsenode.expression;

            /* Dispatch on actual expression */
            switch (expression.type) {
                case 'AssignmentExpression':
                    return transformer.transformAssignmentExp(transpiler);
                case 'ObjectExpression':
                    return transformer.transformObjectExp(transpiler);
                case 'NewExpression':
                    return transformer.transformNewExp(transpiler);
                case 'FunctionExpression':
                    return transformer.transformFunctionExp(transpiler);
                case 'CallExpression':
                    return transformer.transformCallExp(transpiler);
                case 'BinaryExpression':
                    return transformer.transformBinaryExp(transpiler);

            }

        }

        else if (node.parsenode) {

            switch (node.parsenode.type) {
                case 'VariableDeclaration':
                    return transformer.transformVariableDecl(transpiler);
                case 'VariableDeclarator':
                    return transformer.transformVariableDecl(transpiler);
                case 'FunctionExpression':
                    return transformer.transformFunctionExp(transpiler);
                case 'FunctionDeclaration':
                    return transformer.transformFunctionDecl(transpiler);
                case 'BlockStatement':
                    return transformer.transformBlockStm(transpiler);
                case 'CallExpression':
                    return transformer.transformCallExp(transpiler);
                case 'BinaryExpression':
                    return transformer.transformBinaryExp(transpiler);
                case 'IfStatement':
                    return transformer.transformIfStm(transpiler);
                case 'ObjectExpression':
                    return transformer.transformObjectExp(transpiler);
                case 'Property':
                    return transformer.transformProperty(transpiler);
                case 'NewExpression' :
                    return transformer.transformNewExp(transpiler);
                case 'ThrowStatement' :
                    return transformer.transformThrowStm(transpiler);
                case 'TryStatement' :
                    return transformer.transformTryStm(transpiler);
                case 'ReturnStatement' :
                    return transformer.transformReturnStm(transpiler);

            }
        }

        else {
            return transpiler;
        }

    }

    var toreturn = {
        createTranspileObject       : createTranspileObject,
        copyTranspileObject         : copyTranspileObject,
        copySetups                  : copySetups,
        transpile                   : transpile
    }

    if (typeof module !== 'undefined' && module.exports != null) {
        exports.Transpiler = toreturn;
    }

    return toreturn;

})();