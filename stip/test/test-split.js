/* mocha --ui tdd tests/test.js  */

var compareAst = require('compare-ast');
var assert = require('assert');

var fs = require('fs');

/* Libraries */
var esprima = require('../lib/esprima.js');
var escodegen = require('../lib/escodegen.js');


/* Stip - constructing pdg */

var Stip = require('../run.js');


suite('Tier split - basic', function () {

    function tierSplit(source) {
        return Stip.tierSplit(source, true);
    }

    test('variables', function () {
        var res = tierSplit('/* @server */ {var a = 1; var b = 2; var c = a + b;} /* @client */ {var a = 1; var b = 2; var c = a + b;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0), 'var a; var b; var c; a = 1; b = 2; c = a + b; client.expose({});');
        compareAst(escodegen.generate(ast1), 'var a; var b; var c; a = 1; b = 2; c = a + b; server.expose({});');
    });

    test('function client to server', function () {
        var res = tierSplit('/* @server */ {function foo (x) {return x}} /* @client */ {var a = foo(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'var a; client.rpc("foo", 42, function (_v1_, _v2_) {a = _v2_;}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function client to server - call argument', function () {
        var res = tierSplit('/* @server */ {function foo (x) {return x}} /* @client */ {foo(foo(42))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 42, function (_v1_, _v2_) {client.rpc("foo", _v2_, function (_v3_, _v4_) {})}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function server to client: broadcast', function () {
        var res = tierSplit('/* @client */ {function clientf (x) { return x; }} /* @server */ {/* @all */ clientf(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"clientf" : function (x, callback) {return callback(null, x)}});');
        compareAst(escodegen.generate(ast1),
            'server.rpc("clientf", [42]); server.expose({});');
    });

    test('function server to client: reply', function () {
        var res = tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {return 42+y;} foo();}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", function (_v1_, _v2_) {}); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both', function () {
        var res = tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {return 42+y;} foo();bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {return 42+y;} client.rpc("foo", function (_v1_, _v2_) {}); bar(2); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both with rpc', function () {
        var res = tierSplit('/* @server */ {function foo() {/*@reply */ bar(3)}} /* @client */ {function bar(y) {foo(); return 42+y;} bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {client.rpc("foo", function (_v1_, _v2_){}); return 42+y;}  bar(2); client.expose({"bar" : function (y,callback) {client.rpc("foo", function (_v1_, _v2_){}); return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('remote call in return statement client', function () {
        var res = tierSplit('/* @server */ {function bar() {return 42;} foo(3); }/* @client */ {function foo(y) {return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1))
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'client.expose({"foo" : function (y,callback) {return client.rpc("bar", function (_v1_, _v2_){ return callback(_v1_,_v2_)})}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.rpc("foo", [3]); server.expose({"bar" : function (callback) {var self = this; return callback(null, 42)}});',
            {varPattern: /_v\d_/});
    });

    test('remote call in return statement server', function () {
        var res = tierSplit('/* @client */ {function bar() {return 42;} foo(3); }/* @server */ {function foo(y) {return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {return callback(_v1_,_v2_)})}});',
            {varPattern: /_v\d_/});
    });

    test('remote calls in return statement server', function () {
        var res = tierSplit('/* @client */ {function bar() {return 42;} foo(3); }/* @server */ {function foo(y) {return bar() + bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {self.rpc("bar", function (_v3_, _v4_) {return callback(_v1_,_v4_+_v2_)})})}});',
            {varPattern: /_v\d_/});
    });

});


suite('Tier split without analysis - basic', function () {

    function tierSplit(source) {
        return Stip.tierSplit(source, false);
    }

    test('variables', function () {
        var res = tierSplit('/* @server */ {var a = 1; var b = 2; var c = a + b;} /* @client */ {var a = 1; var b = 2; var c = a + b;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0), 'var a; var b; var c; a = 1; b = 2; c = a + b; client.expose({});');
        compareAst(escodegen.generate(ast1), 'var a; var b; var c; a = 1; b = 2; c = a + b; server.expose({});');
    });

    test('function client to server', function () {
        var res = tierSplit('/* @server */ {/* @remoteFunction */ function foo (x) {return x}} /* @client */ {/* @remoteCall */ var a = foo(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'var a; client.rpc("foo", 42, function (_v1_, _v2_) {a = _v2_;}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function client to server - call argument', function () {
        var res = tierSplit('/* @server */ {/* @remoteFunction */ function foo (x) {return x}} /* @client */ {/* @remoteCall */ foo(foo(42))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast1), 'server.expose({"foo" : function (x, callback) {var self = this; return callback(null, x)}})');
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 42, function (_v1_, _v2_) {client.rpc("foo", _v2_, function (_v3_, _v4_) {})}); client.expose({});',
            {varPattern: /_v\d_/});
    });

    test('function server to client: broadcast', function () {
        var res = tierSplit('/* @client */ {/* @remoteFunction */ function clientf (x) { return x; }} /* @server */ {/* @remoteCall @all */ clientf(42)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'client.expose({"clientf" : function (x, callback) {return callback(null, x)}});');
        compareAst(escodegen.generate(ast1),
            'server.rpc("clientf", [42]); server.expose({});');
    });

    test('function server to client: reply', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteFunction */  function foo() {/* @remoteCall @reply */ bar(3)}} /* @client */ {/* @remoteFunction */  function bar(y) {return 42+y;} /* @remoteCall */ foo();}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", function (_v1_, _v2_) {}); client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both', function () {
        var res = tierSplit('/* @server */ {/* @remoteFunction */ function foo() {/* @remoteCall @reply */ bar(3)}} /* @client */ {/* @remoteFunction @localFunction */ function bar(y) {return 42+y;} /* @remoteCall */ foo(); bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {return 42+y;} client.rpc("foo", function (_v1_, _v2_) {bar(2);});  client.expose({"bar" : function (y,callback) {return callback(null,42+y);}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('function client called by both with rpc', function () {
        var res = tierSplit('/* @server */ {/* @remoteFunction */  function foo() {/* @remoteCall @reply */ bar(3)}} /* @client */ {/* @remoteFunction @localFunction */  function bar(y) {/* @remoteCall */ foo(); return 42+y;} bar(2);}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'function bar(y) {client.rpc("foo", function (_v1_, _v2_){return callback(_v1_, 42+y);});}  bar(2); client.expose({"bar" : function (y,callback) {client.rpc("foo", function (_v1_, _v2_){return callback(_v1_,42+y);}); }})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (callback) {var self = this; self.rpc("bar", 3);}})');
    });

    test('remote call in return statement client', function () {
        var res = tierSplit('/* @server */ {/* @remoteFunction */ function bar() {return 42;} /* @remoteCall */ foo(3); }/* @client */ {/* @remoteFunction */ function foo(y) {/* @remoteCall */ return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'client.expose({"foo" : function (y,callback) {return client.rpc("bar", function (_v1_, _v2_){ return callback(_v1_,_v2_)})}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.rpc("foo", [3]); server.expose({"bar" : function (callback) {var self = this; return callback(null, 42)}});',
            {varPattern: /_v\d_/});
    });

    test('remote call in return statement server', function () {
        var res = tierSplit('/* @client */ {/* @remoteFunction */ function bar() {return 42;} /* @remoteCall */ foo(3); }/* @server */ {/* @remoteFunction */ function foo(y) {/* @remoteCall */ return bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {return callback(_v1_,_v2_)})}});',
            {varPattern: /_v\d_/});
    });

    test('remote calls in return statement server', function () {
        var res = tierSplit('/* @client */ {/* @remoteFunction */ function bar() {return 42;} /* @remoteCall */ foo(3); }/* @server */ {/* @remoteFunction */ function foo(y) {/* @remoteCall */ return bar() + bar()}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(res[3].length, 0);
        compareAst(escodegen.generate(ast0),
            'client.rpc("foo", 3, function (_v1_, _v2_) {}); client.expose({"bar" : function (callback) {return callback(null, 42)}})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo" : function (y, callback) {var self = this; return self.rpc("bar", function (_v1_, _v2_) {self.rpc("bar", function (_v3_, _v4_) {return callback(_v1_,_v4_+_v2_)})})}});',
            {varPattern: /_v\d_/});
    });

});

suite('Data sharing', function () {
    function tierSplit(src) {
        return Stip.tierSplit(src, true);
    }

    test('local', function () {
        var res = tierSplit('/* @server */ {var a = 1; var b = a * 2;} /* @client */ {var c = 22}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var c; c = 22; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('copy', function () {
        var res = tierSplit('/* @server */ {/* @copy */ var a = 1; var b = a * 2;} /* @client */ {var c = a * 3;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;

        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var a; a = 1; var c; c = a * 3; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('observable - object literal', function () {
        var res = tierSplit('/* @server */ {/* @observable */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeObservableObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeObservableObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - object constructor', function () {
        var res = tierSplit('/* @server */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection', function () {
        var res = tierSplit('/* @server */ {/* @observable */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection with anonymous objects', function () {
        var res = tierSplit('/* @server */ {/* @observable */ function Point(x,y) {this.x = x; this.y = y;} /* @observable */ var coll = [];} /* @client */ {coll.push( new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));} var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('erplicated - object literal', function () {
        var res = tierSplit('/* @server */ {/* @replicated */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeReplicatedObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeReplicatedObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - object constructor', function () {
        var res = tierSplit('/* @server */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;}  var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y));} var p; p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - collection', function () {
        var res = tierSplit('/* @server */ {/* @replicated */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated- collection with anonymous objects', function () {
        var res = tierSplit('/* @server */ {/* @replicated */ function Point(x,y) {this.x = x; this.y = y;} /* @replicated */ var coll = [];} /* @client */ {coll.push( new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));} var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })


})


suite('Data sharing - without analysis ', function () {
    test('local', function () {
        var res = Stip.tierSplit('/* @server */ {/* @local */ var a = 1; var b = a * 2;} /* @client */ {var c = 22}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var c; c = 22; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('copy', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @copy */ var a = 1; var b = a * 2;} /* @client */ {var c = a * 3;}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var a; a = 1; var c; c = a * 3; client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var a; var b; a = 1; b = a * 2; server.expose({})',
            {varPattern: /_v\d_/});
    });
    test('observable - object literal', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @observable */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeObservableObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeObservableObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - object constructor', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @observable */ function Point(x,y) {this.x = x; this.y = y;} /* @remoteData */ var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var p; function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y));} p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @observable */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('observable - collection with anonymous objects', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @observable */ function Point(x,y) {this.x = x; this.y = y;} /* @remoteData @observable */ var coll = [];} /* @client */ {coll.push(/* @remoteData */ new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;

        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeObservableObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeObservableObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeObservableObject(id, new Point(x,y));} var coll; coll = server.makeObservableObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('erplicated - object literal', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @replicated */ var obs = {x:1, y:2}} /* @client */ {console.log(obs)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var obs; obs = client.makeReplicatedObject("obs", {x:1, y: 2}); console.log(obs); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var obs; obs = server.makeReplicatedObject("obs", {x:1, y:2}); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - object constructor', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @replicated */ function Point(x,y) {this.x = x; this.y = y;} /* @remoteData */ var p = new Point(1,2) } /* @client */ {console.log(p.x)}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var p; function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y));} p = new Point("p", 1, 2); console.log(p.x); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));}var p; p = new Point("p", 1, 2); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated - collection', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @replicated */ var coll = [];} /* @client */ {coll.push({x:1})}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); coll.push({x:1}); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
    test('replicated- collection with anonymous objects', function () {
        var res = Stip.tierSplit('/* @server */ {/* @remoteData @replicated */ function Point(x,y) {this.x = x; this.y = y;} /* @remoteData @replicated */ var coll = [];} /* @client */ {coll.push(/* @remoteData */ new Point(1,2))}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        /* no warnings */
        assert.equal(0, res[3].length);
        compareAst(escodegen.generate(ast0),
            'var coll; coll = client.makeReplicatedObject("coll", []); function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return client.makeReplicatedObject(id, new Point(x,y))} coll.push(new Point(false, 1, 2)); client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'function Point(id, x, y) {function Point(x,y) {this.x = x; this.y = y;} return server.makeReplicatedObject(id, new Point(x,y));} var coll; coll = server.makeReplicatedObject("coll", []); server.expose({})',
            {varPattern: /_v\d_/});
    })
})

suite('Failure Handling', function () {
    function tierSplit(src) {
        return Stip.tierSplit(src, true);
    }

    test('try catch - 1', function () {
        var res = tierSplit('/*@server*/ {function foo(x) {if (x<0) throw "error"; else return x;}} /*@client*/{try{foo(2)} catch(e) {console.log(e)}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        console.log(escodegen.generate(ast0));
        console.log();
        console.log(escodegen.generate(ast1));
        compareAst(escodegen.generate(ast0),
            'try{client.rpc("foo", 2, function (_v1_, _v2_) {try {if(_v1_) throw _v1_} catch (_v3_) {console.log(_v3_)}})} catch (e) {console.log(e)} client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({"foo": function (x, callback) {var self = this; if (x<0) return callback("error"); else return callback(null, x);}})');
    });
    test('try catch - 2', function () {
        var res = tierSplit('/*@server*/ {function foo(x) {if (x<0) throw "error"; else return x;}} /*@client*/{try{var z = foo(2); console.log(z); foo(z) } catch(e) {console.log(e)}}');
        var ast0 = res[0].nosetup;
        var ast1 = res[1].nosetup;
        compareAst(escodegen.generate(ast0),
            'var z; try{client.rpc("foo", 2, function (_v1_, _v2_) {try {if(_v1_) throw _v1_; z = _v2_; console.log(z); client.rpc("foo", z, function (_v4_, _v5_) {try {if (_v4_) throw _v4_;} catch(e) {console.log(e);}})} catch (_v3_) {console.log(_v3_)}})} catch (e) {console.log(e)} client.expose({})',
            {varPattern: /_v\d_/});
        compareAst(escodegen.generate(ast1),
            'server.expose({ "foo": function (x, callback) {var self = this; if (x<0) return callback("error"); else return callback(null, x);}})');
    });
    test('handlers - default', function () {
        var res = tierSplit('/*@server*/{function broadcast(msg){}}/*@client @useHandler: log buffer*/{/*@useHandler: abort*/function speak(){broadcast("hello")} speak()}');
        var ast0 = res[0].nosetup;
        compareAst(escodegen.generate(ast0),
            'function speak() {_v1_.rpc("broadcast", "hello", function (_v2_, _v3_) {})} speak(); client.expose({})',
            {varPattern: /_v\d_/})
    });
})

suite('Annotations', function () {
    function tierSplit(src) {
        return Stip.tierSplit(src, true);
    }

    test('@require', function () {
        var res = tierSplit('/* @require [fs moment] @server */ {var foo = 1} /* @client */ {var foo = 2;}')
        var setup = escodegen.generate(res[1].setup);
        var contains1 = setup.indexOf("var fs = require('fs')") > -1;
        var contains2 = setup.indexOf("var moment = require('moment')") > -1;
        assert.equal(contains1, true);
        assert.equal(contains2, true);

    })
})

suite('RedStone', function () {
    function tierSplit(filename) {
        var src = fs.readFileSync(filename, "utf-8");
        return Stip.tierSplit(src, true);
    }

    test('basic', function () {
        var res = tierSplit('./redstone/examples/chat.redstone');
        var clientprogram = res[0];
        var serverprogram = res[1];
        var html = res[2];
        var warnings = res[3];
        /* no warnings */
        assert.equal(warnings.length, 0);
    })

})

suite('CPS transform', function () {

    function cpsTransform(src) {
        return Stip.cpsTransform(src, true);
    }

    test('variables', function () {
        var ast = cpsTransform('var a = 1; var b = 2; var c = a + b;', true);
        compareAst(escodegen.generate(ast.nosetup), 'var a; var b; var c; a = 1; b = 2; c = a + b;');
    });

    test('function', function () {
        var ast = cpsTransform('function foo (x) {return x * 2} foo(42);', true);
        console.log(ast);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x * 2)} foo(42, function (_v2_, _v3_) {})',
            {varPattern: /_v\d_/})
    });

    test('call argument', function () {
        var ast = cpsTransform('function foo(x) {return x} foo(foo(42));', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} foo(42, function (_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {})})',
            {varPattern: /_v\d_/})
    });

    test('anon function as call arg', function () {
        var ast = cpsTransform('function id(x) {return x}; function foo() {var a= https.get(id("foo"));  a.on("ev", function (d) {console.log(d)})} foo();', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function id(x, callback) {return callback(null, x);}function foo(callback) {function anonf1(d) {console.log(d);}var a;id("foo", function (_v1_, _v2_) {https.get(_v2_, function (_v3_, _v4_) {a = _v4_;a.on("ev", anonf1, function (_v5_, _v6_) {});});});}foo(function (_v7_, _v8_) {});',
            {varPattern: /_v\d_/})
    });

    test('blocking annotation', function () {
        var ast = cpsTransform('function foo(x) {return x} /* @blocking */ foo(42); var a = 2;', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;})',
            {varPattern: /_v\d_/})
    });

    test('without blocking annotation', function () {
        var ast = cpsTransform('function foo(x) {return x} foo(42); var a = 2;', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {}); a = 2;',
            {varPattern: /_v\d_/})
    });

    test('blocking delimited block', function () {
        var ast = cpsTransform('function foo(x) {return x} /* @blocking */ { foo(42); var a = 2;} foo(4);', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var a; foo(42, function(_v2_, _v3_) {a = 2;}); foo(4, function (_v4_, _v5_){});',
            {varPattern: /_v\d_/})
    });

    test('blocking delimited block2', function () {
        var ast = cpsTransform('function foo(x) {return x} /* @blocking */ { var z = foo(foo(42)); var a = z + 101;} foo(4);', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} var z; var a; foo(42, function(_v2_, _v3_) {foo(_v3_, function (_v4_, _v5_) {z = _v5_; a = z + 101;});}); foo(4, function (_v6_, _v7_){});',
            {varPattern: /_v\d_/})
    });

    test('return call in cps function', function () {
        var ast = cpsTransform('function foo(x) {return x} function bar() {return foo(42)} bar();', true);
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} function bar(_v2_){return foo(42, function (_v3_, _v4_) {return _v2_(_v3_, _v4_)})} bar(function (_v5_, _v6_) {})',
            {varPattern: /_v\d_/})
    });
    test('blocking if', function () {
        var ast = cpsTransform('function foo(x) {return x} /*@blocking*/if(true) {foo(0)} else {foo(1)} console.log("done")', true);
        console.log(escodegen.generate(ast.nosetup));
        compareAst(escodegen.generate(ast.nosetup),
            'function foo(x, _v1_) {return _v1_(null, x)} if(true) {foo(0, function (_v2_, _v3_) {console.log("done")})} else {foo(1, function (_v4_, _v5_) {console.log("done")})}',
            {varPattern: /_v\d_/})
    });
    test('blocking for each', function () {
        var ast = cpsTransform('var c = [1,2,3]; function f(x) {return x} /*@blocking*/c.forEach(function (x) {f(x)}); console.log("done");', true);
        compareAst(escodegen.generate(ast.nosetup),
            'var c; function anonf1(x, _v1_) {f(x, function (_v2_, _v3_) {_v1_(null);})} function f(x, _v4_){return _v4_(null, x)} c = [1,2,3]; async.each(c, anonf1, function (_v5_, _v6_) {console.log("done")});',
            {varPattern: /_v\d_/})
    });

});
