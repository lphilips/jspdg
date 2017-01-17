var ServerRpc = require('./rpc-server.js'),
    Store = require('./store.js'),
    ObservableObject = require('./ObservableObject.js'),
    ReplicatedObject = require('./ReplicatedObject.js'),
    Clock = require('./clock.js');


// SERVER DATA + RPC
var ServerData = function (app, port, opts) {
    var self = this;
    ServerRpc.call(this, app, port, opts);
    this.store = new Store();
    this.updateMethodServer = '__updateFromServer__';
    this.updateMethodClient = '__updateFromClient__';



    var methods = {
        '__updateFromClient__' : function (uid, prop, value, clock, cb) {
            var obj = self.store.getObject(uid);
            if (obj)
                obj.__updateFromClient__(prop, value, clock, this.id);
        }
    };

    this.expose(methods);

    this.onConnection(function (client) {

        Object.keys(self.store.store).forEach(function(key, index) {
            var obj = self.store.store[key];
            var clock = obj.__clock;
            self.rpcTo(client.id, '__addObjectFromServer__', key, obj, clock);
        });
    });
};

ServerData.prototype = Object.create(ServerRpc.prototype);
ServerData.prototype.constructor = ServerData;

ServerData.prototype.expose = function (o) {
    var self = this;
    Object.keys(o).forEach(function (key, index) {
        self.exposedFunctions[key] = o[key];
    });
};


ServerData.prototype.makeObservableObject = function (name, object) {
    var obs = ObservableObject.makeObservableObjectServer(this, this.updateMethodServer, this.store, object, name);
    return obs;
}

ServerData.prototype.makeReplicatedObject = function (name, object) {
    var clock = Clock.makeClock();
    var repl = ReplicatedObject.makeReplicatedObjectServer(this, this.store,
        this.updateMethodServer, this.updateMethodClient, object, name, clock);
    return repl;
}



////////////////////////////////////////////////////////////////////////////////////////////

module.exports = ServerData;