'use strict';

var assert = require('assert');

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

describe('fromObject', function() {
  describe('with registered error class', function() {
    it('deserializes to an instance', function() {
      var TestError = SuperError.subclass('FromObjectDeserializationTestError');
      Errio.register(TestError);

      var object = Errio.toObject(new TestError('test'));
      var error = Errio.fromObject(object);
      assert(error instanceof TestError, 'is instance of error class');
      assert.equal(error.name, 'FromObjectDeserializationTestError', 'has name property');
      assert.equal(error.message, 'test', 'has message property');
    });
  });

  describe('with option overrides', function() {
    it('sets recursive option', function() {
      var TestError = SuperError.subclass('FromObjectRecursiveOptionTestError');
      Errio.register(TestError);

      common.fromObject.testRecursiveTrue(TestError, { recursive: true });
      common.fromObject.testRecursiveFalse(TestError, { recursive: false });
    });
  });

  describe('with unregistered error class', function() {
    it('returns Error instance with name set', function() {
      var object = { name: 'FromObjectUnregisteredTestError', message: 'test' };
      var error = Errio.fromObject(object);
      assert(error instanceof Error, 'is instance of Error');
      assert.equal(error.name, 'FromObjectUnregisteredTestError');
    });
  });

  describe('without serialized stack', function() {
    it('captures a new stack', function() {
      var TestError = SuperError.subclass('FromObjectNoStackTestError');
      Errio.register(TestError, { stack: false });

      var object = Errio.toObject(new TestError('test'));
      var error = Errio.fromObject(object);
      assert.equal(typeof error.stack, 'string', 'has stack property');
    });
  });

  describe('with serialized stack', function() {
    it('preserves stack', function() {
      var TestError = SuperError.subclass('FromObjectStackTestError');
      Errio.register(TestError, { stack: true });

      var object = Errio.toObject(new TestError('test'));
      var error = Errio.fromObject(object);
      assert.equal(error.stack, object.stack);
    });
  });

  describe('with built-in error classes', function() {
    it('returns Error instance', function() {
      var error = Errio.fromObject({ name: 'Error', message: 'test' });
      assert(error instanceof Error);
    });

    it('returns EvalError instance', function() {
      var error = Errio.fromObject({ name: 'EvalError', message: 'test' });
      assert(error instanceof EvalError);
    });

    it('returns RangeError instance', function() {
      var error = Errio.fromObject({ name: 'RangeError', message: 'test' });
      assert(error instanceof RangeError);
    });

    it('returns ReferenceError instance', function() {
      var error = Errio.fromObject({ name: 'ReferenceError', message: 'test' });
      assert(error instanceof ReferenceError);
    });

    it('returns SyntaxError instance', function() {
      var error = Errio.fromObject({ name: 'SyntaxError', message: 'test' });
      assert(error instanceof SyntaxError);
    });

    it('returns TypeError instance', function() {
      var error = Errio.fromObject({ name: 'TypeError', message: 'test' });
      assert(error instanceof TypeError);
    });

    it('returns URIError instance', function() {
      var error = Errio.fromObject({ name: 'URIError', message: 'test' });
      assert(error instanceof URIError);
    });
  });

  describe('with nested plain object', function() {
    it('preserves object', function() {
      var error = Errio.fromObject({
        name: 'Error',
        message: 'test',
        nested: { key: 'value' }
      });
      assert.deepEqual(error.nested, { key: 'value' });
    });
  });

  describe('with null property value', function() {
    it('does not try to recurse', function() {
      var error = Errio.fromObject({
        name: 'Error',
        message: 'test',
        nullValue: null
      });
      assert.equal(error.nullValue, null);
    });
  });
});
