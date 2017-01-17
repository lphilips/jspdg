'use strict';

var assert = require('assert');
var Errio = require('..');

exports.toObject = {
  testRecursiveTrue: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    error.nested = new ErrorClass('nested');

    var object = Errio.toObject(error, options);
    assert.equal(typeof object.nested, 'object', 'contains nested error');

    return object;
  },

  testRecursiveFalse: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    error.nested = new ErrorClass('nested');

    var object = Errio.toObject(error, options);
    assert(!object.hasOwnProperty('nested'), 'does not contain nested error');

    return object;
  },

  testInheritedTrue: function(ParentClass, ErrorClass, options) {
    ParentClass.prototype.parentProperty = 'inherited';

    var error = new ErrorClass('test');

    var object = Errio.toObject(error, options);
    assert.equal(object.parentProperty, 'inherited', 'contains inherited property');

    return object;
  },

  testInheritedFalse: function(ParentClass, ErrorClass, options) {
    ParentClass.prototype.parentProperty = 'inherited';

    var error = new ErrorClass('test');

    var object = Errio.toObject(error, options);
    assert(!object.hasOwnProperty('parentProperty'), 'does not contain inherited property');

    return object;
  },

  testStackTrue: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    var object = Errio.toObject(error, options);
    assert.equal(typeof object.stack, 'string', 'contains stack property');
    return object;
  },

  testStackFalse: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    var object = Errio.toObject(error, options);
    assert(!object.hasOwnProperty('stack'), 'does not contain stack property');
    return object;
  },

  testPrivateTrue: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    error._leading = 'private';
    error.trailing_ = 'private';

    var object = Errio.toObject(error, options);
    assert.equal(object._leading, 'private', 'contains leading underscore property');
    assert.equal(object.trailing_, 'private', 'contains trailing underscore property');

    return object;
  },

  testPrivateFalse: function(ErrorClass, options) {
    var error = new ErrorClass('test');
    error._leading = 'private';
    error.trailing_ = 'private';

    var object = Errio.toObject(error, options);
    assert(!object.hasOwnProperty('_leading'), 'does not contain leading underscore property');
    assert(!object.hasOwnProperty('trailing_'), 'does not contain trailing underscore property');

    return object;
  },

  testExcludeProperty: function(property, ErrorClass, options) {
    var error = new ErrorClass('test');
    error[property] = 'excluded';

    var object = Errio.toObject(error, options);
    assert(!object.hasOwnProperty(property), 'does not contain excluded property');

    return object;
  },

  testIncludeProperty: function(property, ErrorClass, options) {
    var error = new ErrorClass('test');
    error[property] = 'excluded';

    var object = Errio.toObject(error, options);
    assert.equal(object[property], 'excluded', 'contains excluded property');

    return object;
  }
};

exports.fromObject = {
  testRecursiveTrue: function(ErrorClass, options) {
    var original = new ErrorClass('test');
    original.nested = new ErrorClass('nested');

    var object = Errio.toObject(original, { recursive: true });

    var error = Errio.fromObject(object, options);
    assert(error.nested instanceof Error, 'contains nested Error');

    return error;
  },

  testRecursiveFalse: function(ErrorClass, options) {
    var original = new ErrorClass('test');
    original.nested = new ErrorClass('nested');

    var object = Errio.toObject(original, { recursive: true });

    var error = Errio.fromObject(object, options);
    assert.equal(typeof error.nested, 'object', 'contains nested object');
    assert(!(error.nested instanceof Error), 'nested object is not an Error');

    return error;
  }
};
