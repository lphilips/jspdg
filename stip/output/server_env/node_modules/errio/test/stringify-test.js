'use strict';

var assert = require('assert');

var SuperError = require('super-error');
var Errio = require('..');

describe('stringify', function() {
  it('serializes to a JSON object', function() {
    var json = Errio.stringify(new Error('test'));
    assert.equal(typeof json, 'string');
    JSON.parse(json);
  });

  it('passes option overrides', function() {
    var json = Errio.stringify(new Error('test'), { stack: true });
    var object = JSON.parse(json);
    assert.equal(typeof object.stack, 'string');
  });
});
