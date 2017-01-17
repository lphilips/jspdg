'use strict';

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

describe('registerObject', function() {
  it('sets option overrides for all error classes', function() {
    var object = {};
    var FirstError = SuperError.subclass(object, 'RegisterObjectFirstTestError');
    var SecondError = SuperError.subclass(object, 'RegisterObjectSecondTestError');
    Errio.registerObject(object, { stack: true });
    common.toObject.testStackTrue(FirstError);
    common.toObject.testStackTrue(SecondError);
  });

  it('does not call constructors', function() {
    var object = {};
    var ThirdError = SuperError.subclass(object, 'RegisterObjectThirdTestError', function() {
      assert(false, 'ThirdError constructor called');
    });
    var FourthError = SuperError.subclass(object, 'RegisterObjectFourthTestError', function() {
      assert(false, 'FourthError constructor called');
    });
    Errio.registerObject(object);
  });
});
