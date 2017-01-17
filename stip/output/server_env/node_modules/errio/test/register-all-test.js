'use strict';

var SuperError = require('super-error');
var Errio = require('..');

var common = require('./common');

describe('registerAll', function() {
  it('sets option overrides for all error classes', function() {
    var FirstError = SuperError.subclass('RegisterAllFirstTestError');
    var SecondError = SuperError.subclass('RegisterAllSecondTestError');
    Errio.registerAll([ FirstError, SecondError ], { stack: true });
    common.toObject.testStackTrue(FirstError);
    common.toObject.testStackTrue(SecondError);
  });
});
