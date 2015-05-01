/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **
 *          CLOUD TYPES TRANSFORMATIONS                                                                         *
 *                                                                                                              *   
 *     Based on JavaScript implementation : https://github.com/ticup/CloudTypes                                 *
 *                                                                                                              *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * **/


 var CTTransform = (function () {

    var module           = {},
        CTtoTransform    = {};
        



    /* Analysis functions to decide whether a var decl has the same type throughout the whole program */

    var hasSameType = function (vardecl) {
        var datadeps    = vardecl.dataDependentNodes(true, true),
            sameType    = true,
            jipdanodes, konts, values, first;

        datadeps = datadeps.filter(function (datadep) {
            return esp_isAssignmentExp(datadep.parsenode) || 
                   (esp_isExpStm(datadep.parsenode) && esp_isAssignmentExp(datadep.parsenode.expression))
        })
        jipdanodes = datadeps.flatMap(function (datadep) {
                return graphs.etg().nodes().filter(function (node) {
                    return isEval(node) && node.node === datadep.parsenode 
                })
        });
        konts = jipdanodes.flatMap(function (node) {
                return graphs.DSG.ecg.successors(node)
            }).filter(function (node) {
                return isKont(node)
        });
        values = konts.map(function (kont) { return kont.value });
        /* First is value of the kont-node of the variable declaration */
        if (vardecl.konts[0])
            first = vardecl.konts[0].value
         else {
            first = graphs.etg().nodes().filter(function (node) {
                return isEval(node) && node.node === vardecl.parsenode
            }).flatMap(function (node) {
                return graphs.DSG.etg.successors(node)
            }).filter(function (node) {
                return isKont(node)
            })[0].value
         }

        values.map(function (value) {
            if (value.compareToDo) {
                if (!value.compareToDo(first)) {
                    sameType = false
                }
            }
            else {
                if (value.prim.compareToDo(first.prim) === undefined) {
                    sameType = false
                }
            }
        })

        return sameType

    }

    /* Returns the corresponding cloud type of a Jipda Lattice */
    var getCloudType = function (vardecl) {
        var value;
        Ast.augmentAst(graphs.AST); /* AST can be changed at this moment, so augment it to be sure */
        value = Pdg.values(vardecl, graphs.AST);
        /*else {
            value = graphs.etg().nodes().filter(function (node) {
                return isEval(node) && node.node === vardecl.parsenode
            }).flatMap(function (node) {
                return graphs.DSG.etg.successors(node)
            }).filter(function (node) {
                return isKont(node)
            })[0].value
        }
        if (value.prim.Num) {
            return 'CInt'
        }*/
    }


    /* Function that indicates whether a variable declaration should be transformed to a cloud type */

    /* For variable declaration */
    var shouldTransformVarDecl = function (vardecl) {
        var type    = vardecl.getdtype(),
            datadep = vardecl.dataDependentNodes(true, true);

        if (dtypeEquals(type, DNODES.SHARED)) {
            var usedOnClient = false;
            datadep.map(function (node) {
                var ntype = node.getdtype();
                if (!usedOnClient)
                    usedOnClient = dtypeEquals(ntype, DNODES.CLIENT)
            })
            return usedOnClient
        }
        else
            return false
    } 

    /* For assignment expression */
    var shouldTransformAssExp = function (node) {
        var upnodes = node.edges_in.filter( function (e) {
            return  e.equalsType(EDGES.DATA) ||
                    e.equalsType(EDGES.REMOTED)
        }).map(function (e) { return e.from }),
            shouldtransform = false;
        upnodes.map( function (node) {
            if (node.parsenode && esp_isVarDecl(node.parsenode))
                shouldtransform = shouldTransformVarDecl(node)
        })
        return shouldtransform;
    }



    /* Combined */
    var shouldTransform = function (node) {
        if (esp_isVarDecl(node.parsenode)) 
            return shouldTransformVarDecl(node)
        else if (esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
            return shouldTransformAssExp(node)
        else 
            return false
    }

    var transformVarDecl = function (vardecl, cloudtypes) {
        var type = getCloudType(vardecl),
            tranformF;
        var transform = transformExp(vardecl.parsenode.declarations[0].init, cloudtypes);
            vardecl.parsenode.declarations[0].init = esprima.parse(transform).body[0].expression;
        if (shouldTransform(vardecl)) {
            if(type) {
                transformF = CTtoTransform[type];
                return transformF(vardecl)
            }
        } 
        else {
            return false;
        }
    }


    var transformBinaryAdd = function (binexp, name, cloudtypes) {
        var exp       = esp_isLiteral(binexp.left) ? binexp.left : binexp.right,
            expstr    = escodegen.generate(exp);

        if (binexp.operator === "-")
            expstr = "-" + expstr;

        return cloudtypes[name].add(expstr)
        //assexp.parsenode = cloudtypes[assexp.name].add(nr);
    }

    var transformAssExp = function (assexp, cloudtypes) {
        var rightexp = assexp.parsenode.expression.right,
            transform = transformExp(rightexp, cloudtypes, assexp.name);
        if(shouldTransform(assexp)) {
          if (esp_isBinExp(rightexp) && (rightexp.operator === "+" || rightexp.operator === "-")) 
            assexp.parsenode.expression.right = esprima.parse(transform).body[0].expression;
          else
            assexp.parsenode = cloudtypes[assexp.name] ? cloudtypes[assexp.name].set(transform) : assexp.parsenode
        } else {
            assexp.parsenode.expression.right = esprima.parse(transform).body[0].expression;
        }

    }

    var transformRetStm = function (retstm, cloudtypes) {
        var retexp = retstm.parsenode.argument,
            transform = transformExp(retexp, cloudtypes);
        retstm.parsenode.argument = esprima.parse(transform).body[0].expression;
    }

    var transformExpression = function (exp, cloudtypes) {
        if (esp_isVarDecl(exp.parsenode))
            return transformVarDecl(exp, cloudtypes)
        if (esp_isAssignmentExp(exp.parsenode) || (esp_isExpStm(exp.parsenode) && esp_isAssignmentExp(exp.parsenode.expression))) 
            return transformAssExp(exp, cloudtypes)
        if (esp_isRetStm(exp.parsenode)) 
            return transformRetStm(exp, cloudtypes)
    }


    var transformExp = function (exp, cloudtypes, name) {
        var transformstr = falafel(escodegen.generate(exp), function (node) {
            if (esp_isIdentifier(node) && cloudtypes[node.name]) {
                var cloudtype = cloudtypes[node.name];
                node.update(escodegen.generate(cloudtype.get()).slice(0,-1)); // remove trailing semicolon
            }
            else if (esp_isBinExp(node) && cloudtypes[name]) {
                if (node.operator === '+' || node.operator === '-') {
                    node.update(escodegen.generate(transformBinaryAdd(node, name, cloudtypes)))
                }
            }
        })
        return transformstr.toString()
    }

    var transformArguments = function (arguments, cloudtypes) {
        return arguments.map( function (arg) {
            var transformstr = transformExp(arg, cloudtypes);
            return esprima.parse(transformstr).body[0].expression;
        })
    }

    var transformCInt = function (vardecl) {
        var cint = CTParse.CInt(vardecl.name);
        return cint;
    }

    var transformCString = function (vardecl) {
        var cstring = CTParse.CString(vardecl.name);
        return cstring;
    }

    CTtoTransform = {
                        CInt    : transformCInt,
                        CString : transformCString
                    };

    module.transformExpression = transformExpression
    module.transformArguments  = transformArguments;
    module.hasSameType         = hasSameType;
    module.shouldTransform     = shouldTransform;
    module.CTtoTransform       = CTtoTransform
    module.getCloudType        = getCloudType;
    
    return module;

 })()