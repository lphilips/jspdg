var js_libs = (function () {

    var https   = "var https = {get : function(options) {return {on: function (type, fn) {}}}, createServer : function (fn) {return {listen : function (port) {}}}};";
    var jQuery  = 'function $(ids){function n (){this.add=function(){return new n()};this.addClass = function(){return new n()}; this.append=function(){return new n()};this.click=function(){return new n()};this.submit = function () {return new n()}; this.empty=function(){return new n()};this.prop=function(){return true;};this.map=function(){return new n()};this.on=function(){return new n()};this.show=function(){return new n()};this.hide=function(){return new n()};this.text=function(txt){return ""}; this.highcharts = function (chart) {}; this.val=function(){return""};this.getContext=function(){return {}}; this.off = function () {return new n();};this.trigger = function (e) {return new n();}}  return new n()}';
    var math    = "var Math = {random : function () {return 0;}, floor : function (x) {return 1;}};";
    var console = "var console = {log: function (txt) {} };";
    var windowo = "var window = {innerWidth : 0, innerHeight : 0, screenX : 0, screenY : 0, outerWidth: 0, outerHeight : 0 };"
    var json    = "var JSON = {parse : function (str) {return []}};"
    var fs      = "var fs = {readFile : function (path) {}, exists : function (path) {return true;}, writeFile : function (path, data, options) {}}"
    var dns     = "var dns = {lookup: function (path) {}}"
    var proxy   = "var proxy = {getUser : function () {return;}, getPosts : function (user) {return;}, getComments: function (user) {return}}"
    var date    = "function Date (value) { this.getDate = function () {return 1}; this.getDay = function () {return 0;}; this.getMonth = function () {return 0;}; this.getTime = function () {return 0;};}";

    var libs = [https, console, jQuery, math, windowo, json, fs, dns, proxy, date];


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

if (typeof module !== 'undefined' && module.exports != null) {
    var esprima = require('./lib/esprima.js');
    var Ast = require('../jipda-pdg/ast.js').Ast;
    exports.js_libs = js_libs;
}