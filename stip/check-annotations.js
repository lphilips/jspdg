var CheckAnnotations = (function () {

    var toreturn = {};


    function checkAnnotations(PDG) {
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
            warnings = warnings.concat(checkDataAnnotations(node));
        })

        calls.forEach(function (node) {
            warnings = warnings.concat(checkCommunicationAnnotations(node));
        })
        return warnings;
    }

    function checkCommunicationAnnotations(node) {
        var comment = node.parsenode.leadingComment;
        var warnings = [];
        var entry, remotecalls, entryTier, calls;

        if (node.isCallNode && comment && Comments.isReplyAnnotated(comment)) {
            entry = node.enclosingEntry();
            entryTier = entry.getTier();
            /* Does the surrounding function needs to be transformed? */
            remotecalls = entry.getCalls(true).filter(function (c) {
                return c.getTier() !== entryTier;
            });
            calls = entry.getCalls().filter(function (c) {
                return c.getTier() === entryTier;
            })
            if (remotecalls.length <= 0)
               warnings.push(new Exceptions.ReplyAnnotationLocation("Reply annotation not inside remote function: " + escodegen.generate(node.parsenode)));
            if (calls.length > 0)
                warnings.push(new Exceptions.ReplyAnnotationLocation("Reply annotation in local function definition transformed to broadcast: " + escodegen.generate(entry.parsenode)));

        }

        return warnings;
    }

    function checkDataAnnotations(node) {
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


    if (typeof module !== 'undefined' && module.exports != null) {
        Aux = require('./aux.js').Aux;
        Exceptions = require('./exceptions.js');
        exports.CheckAnnotations = toreturn;
    }

    return toreturn;


})()