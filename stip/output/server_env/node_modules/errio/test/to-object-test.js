'use strict';

var assert = require('assert');

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

describe('toObject', function() {
  it('serializes name and message', function() {
    var TestError = SuperError.subclass('ToObjectSerializationTestError');
    var object = Errio.toObject(new TestError('test'));
    assert.equal(object.name, 'ToObjectSerializationTestError');
    assert.equal(object.message, 'test');
  });

  describe('with option overrides', function() {
    it('sets recursive option', function() {
      var TestError = SuperError.subclass('ToObjectRecursiveOptionTestError');
      common.toObject.testRecursiveTrue(TestError, { recursive: true });
      common.toObject.testRecursiveFalse(TestError, { recursive: false });
    });

    it('sets inherited option', function() {
      var ParentError = SuperError.subclass('ToObjectInheritedOptionParentError');
      var TestError = ParentError.subclass('ToObjectInheritedOptionTestError');
      common.toObject.testInheritedTrue(ParentError, TestError, { inherited: true });
      common.toObject.testInheritedFalse(ParentError, TestError, { inherited: false });
    });

    it('sets stack option', function() {
      var TestError = SuperError.subclass('ToObjectStackOptionTestError');
      common.toObject.testStackTrue(TestError, { stack: true });
      common.toObject.testStackFalse(TestError, { stack: false });
    });

    it('sets private option', function() {
      var TestError = SuperError.subclass('ToObjectPrivateOptionTestError');
      common.toObject.testPrivateTrue(TestError, { private: true });
      common.toObject.testPrivateFalse(TestError, { private: false });
    });

    it('sets exclude option', function() {
      var TestError = SuperError.subclass('ToObjectExcludeOptionTestError');
      common.toObject.testExcludeProperty('excluded', TestError, {
        exclude: [ 'excluded' ]
      });
      common.toObject.testIncludeProperty('excluded', TestError, { exclude: [] });
    });

    it('sets include option', function() {
      var TestError = SuperError.subclass('ToObjectIncludeOptionTestError');
      common.toObject.testIncludeProperty('included', TestError, {
        exclude: [ 'included' ],
        include: [ 'included' ]
      });
      common.toObject.testExcludeProperty('included', TestError, {
        exclude: [ 'included' ],
        include: []
      });
    });
  });

  describe('with unregistered error class', function() {
    it('registers error class with option overrides', function() {
      var TestError = SuperError.subclass('ToObjectImplicitRegisterTestError');
      Errio.toObject(new TestError('test'), { stack: true });
      common.toObject.testStackTrue(TestError);
    });
  });

  describe('with explicitly set stack property', function() {
    it('does not include stack', function() {
      var TestError = SuperError.subclass('ToObjectExplicitStackTestError');
      var error = new TestError('test');
      delete error.stack;
      error.stack = 'bogus';

      var object = Errio.toObject(error, { stack: false });
      assert(!object.hasOwnProperty('stack'), 'does not contain stack property');
    });
  });

  describe('with null property value', function() {
    it('does not try to recurse', function() {
      var TestError = SuperError.subclass('ToObjectNullPropertyValueTestError');
      var error = new TestError('test');
      error.nullValue = null;

      var object = Errio.toObject(error, { recursive: true });
      assert.equal(object.nullValue, null);
    });
  });
});
