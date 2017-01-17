var Proxy = require('harmony-proxy');

function AssignmentObservable(message) {
    this.name = 'AssignmentObservable';
    this.message = message || 'Assignment on observable object';
    this.stack = (new Error()).stack;
}

AssignmentObservable.prototype = Object.create(Error.prototype);
AssignmentObservable.prototype.constructor = AssignmentObservable;


function makeObservableHandlerServer (server, method) {
    var uid;
    return {
        get: function (obj, prop) {
            if (prop == 'uid') {
                return uid;
            } else {
                return obj[prop];
            }
        },
        set: function (obj, prop, value) {
            if (prop == 'uid') {
                uid = value;
                return true;
            }
            /* Forward to replica */
            server.rpc(method, uid, prop, value);
            /* default behavior */
            obj[prop] = value;
            return true;
        }
    }
}

/* Make proxy handle for observable object on client side.
   Method is for example '__updateFromServer__' . */
function makeObservableHandlerClient (method, name, callback) {
    return {
        get: function (obj, prop) {
            if (prop == 'uid') {
                return name;
            }
            else if (prop == method) {
                return function () {
                    var args = Array.prototype.slice.call(arguments);
                    var prop, value, newObjectCB;
                    if (args.length >= 2) {
                        prop = args[0];
                        value = args[1];
                        newObjectCB = args.length == 3 ? args[2] : false;
                        if (!prop) {
                            Object.keys(value).forEach(function (key, index) {
                                obj[key] = value[key];
                            });
                            if (newObjectCB)
                                newObjectCB(name, obj);
                            else if (callback)
                                callback(name,false, obj);
                        } else {
                            obj[prop] = value;
                            if (newObjectCB)
                                newObjectCB(name, obj);
                            else if (callback)
                                callback(name, prop, value);
                        }
                        return true;
                    }
                    return false
                }
            } else {
                return obj[prop];
            }
        },
        set: function (obj, prop, value) {
            throw new AssignmentObservable('Assignment on observable object: ' + obj);
        }
    }
}

function makeObservableObjectServer (server, method, store, object, name) {
    var observable = new Proxy(object, makeObservableHandlerServer(server, method));
    store.addObject(observable, name);
    server.rpc('__addObjectFromServer__', observable.uid, observable, false);
    return observable;
}

function makeObservableObjectClient (method, store,  object, name, callback) {
    Object.keys(object).forEach(function (key, index) {
       if (object[key].uid) {
           var observable = new Proxy(object[key], makeObservableHandlerClient(method, object[key].uid, callback));
           object[key] = observable;
       }
    });
    var observable = new Proxy(object, makeObservableHandlerClient(method, name, callback));
    store.addObject(observable, name);
    return observable;
}

module.exports = {
    makeObservableObjectClient : makeObservableObjectClient,
    makeObservableObjectServer : makeObservableObjectServer,
    AssignmentObservable       : AssignmentObservable
}

global.ObservableObject = {
    makeObservableObjectClient : makeObservableObjectClient,
    makeObservableObjectServer : makeObservableObjectServer,
    AssignmentObservable       : AssignmentObservable
}