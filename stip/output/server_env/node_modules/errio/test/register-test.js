'use strict';

var assert = require('assert');

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

describe('register', function() {
  describe('with option overrides', function() {
    it('sets recursive option', function() {
      var TrueError = SuperError.subclass('RegisterRecursiveTrueTestError');
      Errio.register(TrueError, { recursive: true });
      common.toObject.testRecursiveTrue(TrueError);
      common.fromObject.testRecursiveTrue(TrueError);

      var FalseError = SuperError.subclass('RegisterRecursiveFalseTestError');
      Errio.register(FalseError, { recursive: false });
      common.toObject.testRecursiveFalse(FalseError);
      common.fromObject.testRecursiveFalse(FalseError);
    });

    it('sets inherited option', function() {
      var ParentError = SuperError.subclass('RegisterInheritedParentError');

      var TrueError = ParentError.subclass('RegisterInheritedTrueTestError');
      Errio.register(TrueError, { inherited: true });
      common.toObject.testInheritedTrue(ParentError, TrueError);

      var FalseError = ParentError.subclass('RegisterInheritedFalseTestError');
      Errio.register(FalseError, { inherited: false });
      common.toObject.testInheritedFalse(ParentError, FalseError);
    });

    it('sets stack option', function() {
      var TrueError = SuperError.subclass('RegisterStackTrueTestError');
      Errio.register(TrueError, { stack: true });
      common.toObject.testStackTrue(TrueError);

      var FalseError = SuperError.subclass('RegisterStackFalseTestError');
      Errio.register(FalseError, { stack: false });
      common.toObject.testStackFalse(FalseError);
    });

    it('sets private option', function() {
      var TrueError = SuperError.subclass('RegisterPrivateTrueTestError');
      Errio.register(TrueError, { private: true });
      common.toObject.testPrivateTrue(TrueError);

      var FalseError = SuperError.subclass('RegisterPrivateFalseTestError');
      Errio.register(FalseError, { private: false });
      common.toObject.testPrivateFalse(FalseError);
    });

    it('sets exclude option', function() {
      var ExcludeError = SuperError.subclass('RegisterExcludeTestError');
      Errio.register(ExcludeError, { exclude: [ 'excluded' ] });
      common.toObject.testExcludeProperty('excluded', ExcludeError);

      var NoExcludeError = SuperError.subclass('RegisterNoExcludeTestError');
      Errio.register(ExcludeError, { exclude: [] });
      common.toObject.testIncludeProperty('excluded', NoExcludeError);
    });

    it('sets include option', function() {
      var IncludeError = SuperError.subclass('RegisterIncludeTestError');
      Errio.register(IncludeError, {
        exclude: [ 'included' ],
        include: [ 'included' ]
      });
      common.toObject.testIncludeProperty('included', IncludeError);

      var NoIncludeError = SuperError.subclass('RegisterNoIncludeError');
      Errio.register(NoIncludeError, { exclude: [ 'included' ] });
      common.toObject.testExcludeProperty('included', NoIncludeError);
    });
  });

  describe('with explicit error name', function() {
    it('does not call constructor', function() {
      var TestError = SuperError.subclass('RegisterExplicitNameTestError', function() {
        assert(false, 'constructor not called');
      });
      Errio.register(TestError, { name: 'RegisterExplicitNameTestError' });
    });
  });

  describe('with already registered error class', function() {
    it('replaces option overrides', function() {
      var TestError = SuperError.subclass('RegisterReplaceOptionsTestError');
      Errio.register(TestError, { stack: false });
      Errio.register(TestError, { stack: true });
      common.toObject.testStackTrue(TestError);
    });
  });
});
