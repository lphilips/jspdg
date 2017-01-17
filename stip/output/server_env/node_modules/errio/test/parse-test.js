'use strict';

var assert = require('assert');

var SuperError = require('super-error');
var Errio = require('..');

describe('parse', function() {
  it('deserializes from a JSON object', function() {
    var error = Errio.parse('{"name":"Error","message":"test"}');
    assert(error instanceof Error, 'is instance of Error');
    assert.equal(error.message, 'test', 'has message property');
  });

  it('passes option overrides', function() {
    var error = Errio.parse(
      '{"name":"Error","message":"test","nested":{"name":"Error","message":"nested"}}',
      { recursive: false }
    );
    assert.equal(typeof error.nested, 'object', 'contains nested object');
    assert(!(error.nested instanceof Error), 'nested object is not an Error');
  });
});
