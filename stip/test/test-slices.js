/* mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');
var assert = require('assert');

var fs = require('fs');

/* Libraries */
var esprima = require('esprima');
var escodegen = require('escodegen');


var Stip = require('../run.js');


suite('Slices - basic', function () {

    function tierSplit (source) {
        return Stip.tierSplit(source, true);
    }

    test('variables', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {var a = 1; var b = 2; var c = a + b;} /* @slice first */ {var a = 1; var b = 2; var c = a + b;}');

        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0), 'var a; var b; var c; a = 1; b = 2; c = a + b; client.expose({});');
        compareAst(escodegen.generate(ast1), 'var a; var b; var c; a = 1; b = 2; c = a + b; server.expose({});');
    });

    test('function client to server', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function foo (x) {return x}} /* @slice first */ {var a = foo(42)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;       /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'var a; client.rpc("foo", 42, function (_v1_, _v2_) {a = _v2_;}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function client to server - call argument', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function foo (x) {return x}} /* @slice first */ {foo(foo(42))}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 42, function (_v1_, _v2_) {client.rpc("foo", _v2_, function (_v3_, _v4_) {})}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function server to client: broadcast', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice first */ {function clientf (x) { return x; }} /* @slice second */ {/* @all */ clientf(42)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"clientf" : function (x, callback) {return callback(null, x)}});');
        compareAst(escodegen.generate(ast1),
            'server.rpc("clientf", [42]); server.expose({});');
    });

    test('function server to client: reply', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function foo() {/*@reply */ bar(3)}} /* @slice first */ {function bar(y) {return 42+y;} foo();}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", function (_v1_, _v2_) {}); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function foo() {/*@reply */ bar(3)}} /* @slice first*/ {function bar(y) {return 42+y;} foo();bar(2);}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {return 42+y;} client.rpc("foo", function (_v1_, _v2_) {}); bar(2); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both with rpc', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function foo() {/*@reply */ bar(3)}} /* @slice first */ {function bar(y) {foo(); return 42+y;} bar(2);}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {client.rpc("foo", function (_v1_, _v2_){}); return 42+y;}  bar(2); client.expose({"bar" : function (y,callback) {client.rpc("foo", function (_v1_, _v2_){}); return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('remote call in return statement client', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {function bar() {return 42;} foo(3); }/* @slice first */ {function foo(y) {return bar()}}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"foo" : function (y,callback) {return client.rpc("bar", function (_v1_, _v2_){ return callback(_v1_,_v2_)})}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.rpc("foo", [3]); server.expose({"bar" : function (callback) {var self = this; return callback(null, 42)}});',
            {varPattern: /_v\d_/});
    });

    test('remote call in return statement server', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice first */ {function bar() {return 42;} foo(3); }/* @slice second*/ {function foo(y) {return bar()}}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {return callback(_v1_,_v2_)})}});',
            {varPattern: /_v\d_/});
    });

    test('remote calls in return statement server', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice first */ {function bar() {return 42;} foo(3); }/* @slice second*/ {function foo(y) {return bar() + bar()}}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {self.rpc("bar", function (_v3_, _v4_) {return callback(_v1_,_v4_+_v2_)})})}});',
            {varPattern: /_v\d_/});
    });

});

suite('Data sharing', function () {
    function tierSplit (src) {
        return Stip.tierSplit(src, true);
    }
    test('local', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {var a = 1; var b = a * 2;} /* @slice first */ {var c = 22}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var c; c = 22; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('copy', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @copy */ var a = 1; var b = a * 2;} /* @slice first */ {var c = a * 3;}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;

        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var a; a = 1; var c; c = a * 3; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('observable - object literal', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {/* @observable */ var obs = {x:1, y:2}} /* @slice first */ {console.log(obs)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeObservableObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeObservableObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - object constructor', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} var p = new Point(1,2) } /* @slice first */ {console.log(p.x)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @observable */ var coll = [];} /* @slice first */ {coll.push({x:1})}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection with anonymous objects', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} /* @observable */ var coll = [];} /* @slice first */ {coll.push( new Point(1,2))}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;

        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));} var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('erplicated - object literal', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @replicated */ var obs = {x:1, y:2}} /* @slice first */ {console.log(obs)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeReplicatedObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeReplicatedObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - object constructor', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;}  var p = new Point(1,2) } /* @slice first */ {console.log(p.x)}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - collection', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+'@slice second */ {/* @replicated */ var coll = [];} /* @slice first */ {coll.push({x:1})}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated- collection with anonymous objects', function () {
        var config = '/*@config first : client, second : server ';
        var res = tierSplit(config+' @slice second */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;} /* @replicated */ var coll = [];} /* @slice first */ {coll.push( new Point(1,2))}');
        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));} var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })

})

suite('Multiple slices - fixed location', function () {
    function tierSplit (source) {
        return Stip.tierSplit(source, true);
    }

    test('three slices - calls', function () {
        var config = '/*@config first : client, second : server, third : client';
        var res = tierSplit(config+'@slice first */ {function foo() {return 42;}} /* @slice second */ {function bar (x) {return x}} /* @slice third */ {foo() + bar();}');

        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0), 'function foo() {return 42;} client.rpc("bar", function (_v1_, _v2_) {foo()+res2});client.expose({});',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1), 'server.expose({"bar" : function (x, callback) {var self = this; return callback(null, x)}});',
            {varPattern: /_v\d_/});
    });

    test('three slices - data', function () {
        var config = '/*@config first : client, second : server, third : client';
        var res = tierSplit(config+'@slice first */ {function findInColl(x, coll) {return coll.indexOf(x) >= 0}} /* @slice second */ {/* @observable */ var coll = [];} /* @slice third */ {coll.push(2); coll.push(3); if (findInColl(2, coll)) console.log("found!")}');

        var ast0 = res.clientprogram.nosetup;
        var ast1 = res.serverprogram.nosetup;
        /* no warnings */
        assert.equal(0, res.errors.length);
        compareAst(escodegen.generate(ast0), 'var coll; coll = client.makeObservableObject("coll", []); function findInColl(x, coll) {return coll.indexOf(x) >= 0} coll.push(2); coll.push(3); if (findInColl(2, coll)) console.log("found!");client.expose({});',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1), 'var coll; coll = server.makeObservableObject("coll", []); server.expose({});',
            {varPattern: /_v\d_/});
    });
})