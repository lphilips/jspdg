var compareAst = require('compare-ast');



/* Libraries */
var esprima         = require('./lib/esprima.js');
var escodegen       = require('./lib/escodegen.js');

/* Jipda */
var Ast             = require('../jipda-pdg/ast.js').Ast;


/* Stip - constructing pdg */

var Aux             = require('./aux.js').Aux;
var pre_analyse     = require('./pre-analysis.js').pre_analyse;
var Hoist           = require('./hoist.js').Hoist;
var Stip            = require('./stip.js').Stip;

/* Transpiler */
var CodeGenerator       = require('./transpiler/slice.js').CodeGenerator;

function cpstransform (src) {
    var ast = Ast.createAst(src, {loc: true, owningComments: true, comment: true});
    ast = Hoist.hoist(ast, function (node) {
        return Aux.isBlockStm(node) && 
                        (Comments.isTierAnnotated(node) || 
                            (node.leadingComment && Comments.isBlockingAnnotated(node.leadingComment)));
    });
    var pre_analysis = pre_analyse(ast, {callbacks: [], identifiers: []}),
        genast       = pre_analysis.ast,
        assumes      = pre_analysis.assumes,
        shared       = pre_analysis.shared,
        asyncs       = pre_analysis.asyncs,
        graphs       = new Stip.Graphs(ast, src, pre_analysis.primitives);

    Stip.start(graphs);

    var PDG          = graphs.PDG,
        nodes        = PDG.getAllNodes(),
        assumesnames = assumes.map(function (ass) {
                                    if (ass.id)
                                        return ass.id.name.trim();
                                    else
                                        return ass.declarations[0].id.name.trim()}),
                removes = [],
                remove    = function (node) {
                    nodes = nodes.remove(node);
                    if (node.isEntryNode) {
                        var params = node.getFormalIn().concat(node.getFormalOut()),
                        body   = node.getBody();
                        params.map(function (param) {nodes = nodes.remove(param)});
                        body.map(function (bodynode) { remove(bodynode)}); //nodes = nodes.remove(bodynode);});
                    }
                    else if (node.isStatementNode) {
                        node.getOutEdges(EDGES.CONTROL)
                            .map(function (e) {remove(e.to)});
                        node.getOutEdges(EDGES.DATA)
                            .filter(function (e) {
                                return e.to.isObjectEntry ||
                                    e.to.isEntryNode;})
                            .map(function (e) {
                                remove(e.to)});
                    }
                    else if (node.isObjectEntry) {
                        node.getOutEdges(EDGES.OBJMEMBER).map(function (e) {
                            remove(e.to)
                        });
                    }
                },
                program;

            nodes.map(function (pdgnode) {
                if (pdgnode.parsenode)
                    if (Aux.isFunDecl(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false
                    } 
                    else if (Aux.isVarDeclarator(pdgnode.parsenode) &&
                        assumesnames.indexOf(pdgnode.parsenode.id.name) > -1) {
                        removes = removes.concat(pdgnode);
                        return false;
                    }
                    else
                        return true
                else
                    return true
            });
            removes.map(function (node) {
               remove(node);
            });
            program = CodeGenerator.transpile(nodes, {target: 'normal', cps : true}, graphs.AST);
            return program;
}

function printCPS (src) {
    console.log(escodegen.generate(cpstransform(src).nosetup));
}

console.log('https://github.com/Runnable/How-Callbacks-Work-Example-App/blob/master/server.js');
printCPS('var ip = dns.lookup("google.com"); console.log("google resolved to " + ip);var html = fs.readFile("./index.html");console.log(html)');
console.log();
console.log();
console.log('2');
printCPS('function some_function(arg1, arg2) {var my_number = Math.random();return my_number;}console.log(some_function(5,25));console.log(some_function(5, "foo"));');
console.log();
console.log();
console.log('3');
printCPS('function get() {var user = proxy.getUser();var posts = proxy.getPosts(user);var comments = proxy.getComments(user); return {user : user, posts : posts,comments : comments}};console.log(get())');
console.log();
console.log();
console.log('4');
printCPS('function sum1(x) {return x + 1;} function sum2(x) {return x + 2;} function sum3(x) {return x + 3;} function sum4(x) {return x + 4;} function sum5(x) {return x + 5;} function sum6(x) {return x + 6;} function sum7(x) {return x + 7;} function sum8(x) {return x + 8;} function sum9(x) {return x + 9;} function sum10(x) {return x + 10;} function doIt(x) {return sum10(sum9(sum8(sum7(sum6(sum5(sum4(sum3(sum2(sum1(x))))))))))} console.log(doIt(2))');
console.log();
console.log();
console.log('5');
printCPS('var outsideUniverse = "Im Outside the Known Universe"; function foo () {var personInUniverse = "Im somewhere in the universe"; function localSuperCluster (person1) { var pIU = person1; var personILSC = "Im somewhere in the Local Super Cluster"; return personILSC; } function virgoSuperCluster (person2) {var pLSC = person2; var personIVSC = "Im in the Virgo Super Cluster"; return personIVSC;} function localGalacticGroup (person3) {var pIVSC = person3; var personLGG = "Im in the Local Galactic Group"; return personLGG; } function earth (person7){var pSS = person7;var personE = "Im on Earth"; return personE; }  function enterMilkyWay (personInLocalGalacticGroup){ function milkyWayGalaxy (person4){ var pILGG = person4; var personIMWG = "Im in the Milky Way Galaxy";  return personIMWG;} var personInMilkyWayGalaxy = milkyWayGalaxy(personInLocalGalacticGroup);  function solarInterstellarNeighbourHood (person5) { var pIMWG = person5; var personISIN = "Im in the Solar InterStellar Neighbourhood"; return personISIN; }  function solarSystem (person6){ var pISIN = person6; var personSS = "Im in the Solar System"; return personSS; }var personInSolarInterstellarNeighbourHood = solarInterstellarNeighbourHood(personInMilkyWayGalaxy);  var personInSolarSystem =  solarSystem(personInSolarInterstellarNeighbourHood); var personOnEarth = earth(personInSolarSystem); } var personInLocalSuperCluster = localSuperCluster(personInUniverse); var personInVirgoSuperCluster=  virgoSuperCluster(personInLocalSuperCluster); var z = localGalacticGroup(personInVirgoSuperCluster); enterMilkyWay(z);};foo();');
console.log();
console.log();
console.log('6');


