var uuid = require('node-uuid');

function Store () {
    this.store = {},

    this.addObject = function (obj, name) {
        var uid;
        if (name) {
            if (!obj.uid)
                obj.uid = name;
            this.store[name] = obj;
        } else {
            uid = uuid.v4();
            obj.uid = uid;
            this.store[uid] = obj;
        }
    },

    this.getObject = function (uid) {
        return this.store[uid];
    }
}

module.exports = Store;
global.Store = Store;