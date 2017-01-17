'use strict';

// Default options for all serializations.
var defaultOptions = {
  recursive: true, // Recursively serialize and deserialize nested errors
  inherited: true, // Include inherited properties
  stack: false,    // Include stack property
  private: false,  // Include properties with leading or trailing underscores
  exclude: [],     // Property names to exclude (low priority)
  include: []      // Property names to include (high priority)
};

// Overwrite global default options.
exports.setDefaults = function(options) {
  for (var key in options) defaultOptions[key] = options[key];
};

// Object containing registered error constructors and their options.
var errors = {};

// Register an error constructor for serialization and deserialization with
// option overrides. Name can be specified in options, otherwise it will be
// taken from the prototype's name property (if it is not set to Error), the
// constructor's name property, or the name property of an instance of the
// constructor.
exports.register = function(constructor, options) {
  options = options || {};
  var prototypeName = constructor.prototype.name !== 'Error'
    ? constructor.prototype.name
    : null;
  var name = options.name
    || prototypeName
    || constructor.name
    || new constructor().name;
  errors[name] = { constructor: constructor, options: options };
};

// Register an array of error constructors all with the same option overrides.
exports.registerAll = function(constructors, options) {
  constructors.forEach(function(constructor) {
    exports.register(constructor, options);
  });
};

// Shallow clone a plain object.
function cloneObject(object) {
  var clone = {};
  for (var key in object) {
    if (object.hasOwnProperty(key)) clone[key] = object[key];
  }
  return clone;
}

// Register a plain object of constructor names mapped to constructors with
// common option overrides.
exports.registerObject = function(constructors, commonOptions) {
  for (var name in constructors) {
    if (!constructors.hasOwnProperty(name)) continue;

    var constructor = constructors[name];
    var options = cloneObject(commonOptions);
    options.name = name;

    exports.register(constructor, options);
  }
};

// Register the built-in error constructors.
exports.registerAll([
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError
]);

// Serialize an error instance to a plain object with option overrides, applied
// on top of the global defaults and the registered option overrides. If the
// constructor of the error instance has not been registered yet, register it
// with the provided options.
exports.toObject = function(error, callOptions) {
  callOptions = callOptions || {};

  if (!errors[error.name]) {
    // Make sure we register with the name of this instance.
    callOptions.name = error.name;
    exports.register(error.constructor, callOptions);
  }

  var errorOptions = errors[error.name].options;
  var options = {};
  for (var key in defaultOptions) {
    if (callOptions.hasOwnProperty(key)) options[key] = callOptions[key];
    else if (errorOptions.hasOwnProperty(key)) options[key] = errorOptions[key];
    else options[key] = defaultOptions[key];
  }

  // Always explicitly include essential error properties.
  var object = {
    name: error.name,
    message: error.message
  };
  // Explicitly include stack since it is not always an enumerable property.
  if (options.stack) object.stack = error.stack;

  for (var prop in error) {
    // Skip exclusion checks if property is in include list.
    if (options.include.indexOf(prop) === -1) {
      if (typeof error[prop] === 'function') continue;

      if (options.exclude.indexOf(prop) !== -1) continue;

      if (!options.inherited)
        if (!error.hasOwnProperty(prop)) continue;
      if (!options.stack)
        if (prop === 'stack') continue;
      if (!options.private)
        if (prop[0] === '_' || prop[prop.length - 1] === '_') continue;
    }

    var value = error[prop];

    // Recurse if nested object has name and message properties.
    if (typeof value === 'object' && value && value.name && value.message) {
      if (options.recursive) {
        object[prop] = exports.toObject(value, callOptions);
      }
      continue;
    }

    object[prop] = value;
  }

  return object;
};

// Deserialize a plain object to an instance of a registered error constructor
// with option overrides.  If the specific constructor is not registered,
// return a generic Error instance. If stack was not serialized, capture a new
// stack trace.
exports.fromObject = function(object, callOptions) {
  callOptions = callOptions || {};

  var registration = errors[object.name];
  if (!registration) registration = errors.Error;

  var constructor = registration.constructor;
  var errorOptions = registration.options;

  var options = {};
  for (var key in defaultOptions) {
    if (callOptions.hasOwnProperty(key)) options[key] = callOptions[key];
    else if (errorOptions.hasOwnProperty(key)) options[key] = errorOptions[key];
    else options[key] = defaultOptions[key];
  }

  // Instantiate the error without actually calling the constructor.
  var error = Object.create(constructor.prototype);

  for (var prop in object) {
    // Recurse if nested object has name and message properties.
    if (options.recursive && typeof object[prop] === 'object') {
      var nested = object[prop];
      if (nested && nested.name && nested.message) {
        error[prop] = exports.fromObject(nested, callOptions);
        continue;
      }
    }

    error[prop] = object[prop];
  }

  // Capture a new stack trace such that the first trace line is the caller of
  // fromObject.
  if (!error.stack) {
    Error.captureStackTrace(error, exports.fromObject);
  }

  return error;
};

// Serialize an error instance to a JSON string with option overrides.
exports.stringify = function(error, callOptions) {
  return JSON.stringify(exports.toObject(error, callOptions));
};

// Deserialize a JSON string to an instance of a registered error constructor.
exports.parse = function(string, callOptions) {
  return exports.fromObject(JSON.parse(string), callOptions);
};
