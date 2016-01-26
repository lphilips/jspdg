var js_libs = (function () {

    var https   = "var https = {get : function(options) {return {on: function (fn) {}}}}";
    var jQuery  = 'function $(ids){function n (){this.add=function(){return new n()};this.append=function(){return new n()};this.click=function(){return new n()};this.empty=function(){return new n()};this.map=function(){return new n()};this.on=function(){return new n()};this.show=function(){return new n()};this.hide=function(){return new n()};this.text=function(){return""};this.val=function(){return""};this.getContext=function(){return {}}}; return new n()}';
    var math    = "var Math = {random : function () {return 0;}}";
    var console = "var console = {log: function (txt) {} };";
    var windowo  = "var window = {innerWidth : 0, innerHeight : 0, screenX : 0, screenY : 0, outerWidth: 0, outerHeight : 0 }"



    var libs = [https, jQuery, math, console, windowo];


     return  { 
        getLibraries : function () {
            return libs.map(function (lib) {
                var ast = esprima.parse(lib).body[0];
                Ast.augmentAst(ast);
                return ast;
            })
        }
    };
})();