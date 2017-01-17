'use strict';

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

// Each of these tests is required to set the option back to its factory
// default in order to not interfere with other tests. This is the reason for
// the inconsistent order of true/false option tests.

describe('setDefaults', function() {
  it('sets recursive option', function() {
    var TestError = SuperError.subclass('SetDefaultsRecursiveOptionTestError');

    Errio.setDefaults({ recursive: false });
    common.toObject.testRecursiveFalse(TestError);

    Errio.setDefaults({ recursive: true });
    common.toObject.testRecursiveTrue(TestError);

    Errio.setDefaults({ recursive: false });
    common.fromObject.testRecursiveFalse(TestError);

    Errio.setDefaults({ recursive: true });
    common.fromObject.testRecursiveTrue(TestError);
  });

  it('sets inherited option', function() {
    var ParentError = SuperError.subclass('SetDefaultsInheritedOptionParentError');
    var TestError = ParentError.subclass('SetDefaultsInheritedOptionTestError');

    Errio.setDefaults({ inherited: false });
    common.toObject.testInheritedFalse(ParentError, TestError);

    Errio.setDefaults({ inherited: true });
    common.toObject.testInheritedTrue(ParentError, TestError);
  });

  it('sets stack option', function() {
    var TestError = SuperError.subclass('SetDefaultsStackOptionTestError');

    Errio.setDefaults({ stack: true });
    common.toObject.testStackTrue(TestError);

    Errio.setDefaults({ stack: false });
    common.toObject.testStackFalse(TestError);
  });

  it('sets private option', function() {
    var TestError = SuperError.subclass('SetDefaultsPrivateOptionTestError');

    Errio.setDefaults({ private: true });
    common.toObject.testPrivateTrue(TestError);

    Errio.setDefaults({ private: false });
    common.toObject.testPrivateFalse(TestError);
  });

  it('sets exclude option', function() {
    var TestError = SuperError.subclass('SetDefaultsExcludeOptionTestError');

    Errio.setDefaults({ exclude: [ 'excluded' ] });
    common.toObject.testExcludeProperty('excluded', TestError);

    Errio.setDefaults({ exclude: [] });
    common.toObject.testIncludeProperty('excluded', TestError);
  });

  it('sets include option', function() {
    var TestError = SuperError.subclass('SetDefaultsIncludeOptionTestError');

    Errio.setDefaults({ exclude: [ 'included' ], include: [ 'included' ] });
    common.toObject.testIncludeProperty('included', TestError);

    Errio.setDefaults({ include: [] });
    common.toObject.testExcludeProperty('included', TestError);

    Errio.setDefaults({ exclude: [] });
  });
});
