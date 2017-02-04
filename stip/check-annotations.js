var Exceptions = require('./exceptions.js');

var toreturn = {};


function checkAnnotations(PDG, options) {
    var nodes = PDG.getAllNodes();
    var warnings = [];

    var varDecls = nodes.filter(function (n) {
        return n.isStatementNode &&
            (Aux.isVarDecl(n.parsenode) || Aux.isVarDeclarator(n.parsenode));
    });
    var calls = nodes.filter(function (n) {
        return n.isCallNode;
    })

    varDecls.forEach(function (node) {
        warnings = warnings.concat(checkDataAnnotations(node, options));
    })

    calls.forEach(function (node) {
        warnings = warnings.concat(checkCommunicationAnnotations(node, options));
    })
    return warnings;
}

function checkCommunicationAnnotations(node, options) {
    var comment = node.parsenode.leadingComment;
    var warnings = [];
    var entry, remote, local, entryTier;

    if (node.isCallNode && comment && Comments.isReplyAnnotated(comment)) {
        entry = node.enclosingEntry();
        entryTier = entry.getTier();
        /* Does the surrounding function needs to be transformed? */
        remote = Analysis.isRemoteFunction(options, entry);
        local = Analysis.isLocalFunction(options, entry);
        if (local && !remote)
            warnings.push(new Exceptions.ReplyAnnotationLocation("Reply annotation not inside remote function: " + escodegen.generate(node.parsenode)));
        else if (local)
            warnings.push(new Exceptions.ReplyAnnotationLocation("Reply annotation in local function definition transformed to broadcast: " + escodegen.generate(entry.parsenode)));
        else if (!local && !remote)
            warnings.push(new Exceptions.ReplyAnnotationLocation("Reply annotation in wrong place " + escodegen.generate(node.parsenode)));
    }

    return warnings;
}

function checkDataAnnotations(node, options) {
    var warnings = [];
    var fTypeNode = node.getFType();
    var comment = node.parsenode.leadingComment;
    var name = Aux.isVarDecl(node.parsenode) ? node.parsenode.declarations[0].id.name : node.parsenode.id.name;
    var assignments = node.getOutNodes(EDGES.REMOTED).filter(function (n) {
        var assexp;
        if (n.isStatementNode &&
            (Aux.isAssignmentExp(n.parsenode) || (Aux.isExpStm(n.parsenode) && Aux.isAssignmentExp(n.parsenode.expression)))) {
            assexp = Aux.isAssignmentExp(n.parsenode) ? n.parsenode.left.name : n.parsenode.expression.left.name;
            return assexp == name;
        } else {
            return false;
        }
    });


    /* Check on @local */
    var refs = node.getOutNodes(EDGES.REMOTED);
    if (refs.length > 0 && comment && Comments.isTierOnlyAnnotated(comment)) {
        warnings.push(new Exceptions.LocalUsedByOtherTier("Declaration annotated as tier only referenced on wrong tier: " + escodegen.generate(node.parsenode)));
    }


    return warnings;
}


toreturn.checkAnnotations = checkAnnotations;

module.exports = toreturn;
global.CheckAnnotations = toreturn;