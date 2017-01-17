# Errio

[![npm](https://img.shields.io/npm/v/errio.svg?style=flat-square)](https://www.npmjs.com/package/errio)
[![Travis](https://img.shields.io/travis/programble/errio.svg?style=flat-square)](https://travis-ci.org/programble/errio)
[![Coveralls](https://img.shields.io/coveralls/programble/errio.svg?style=flat-square)](https://coveralls.io/r/programble/errio)

Error serialization and deserialization.

```
npm install errio
```

## Overview

JavaScript errors don't serialize well.

```javascript
> JSON.stringify(new Error('help'));
'{}'
```

And they certainly don't deserialize well.

```javascript
> JSON.parse('{}');
{}
```

Errio serializes errors to meaningful JSON.

```javascript
> Errio.stringify(new Error('serialize me'));
'{"name":"Error","message":"serialize me"}'
```

And deserializes JSON back into error instances.

```javascript
> Errio.parse('{"name":"Error","message":"serialize me"}');
[Error: serialize me]
```

## Example

Consult the [API Documentation][docs] for details on the functions used.

This example uses [SuperError][super-error], a library for easily
subclassing errors in Node.js.

```javascript
var Errio = require('errio');
var SuperError = require('super-error');
var fs = require('fs');

// Create a new Error subclass with a custom constructor.
var MyError = SuperError.subclass('MyError', function(code, message) {
  this.code = code;
  this.message = message;
});

// Register the class with Errio.
Errio.register(MyError);

// Create an error instance.
var error = new MyError(420, 'Enhance Your Calm');

// Save the error somewhere.
fs.writeFileSync('error.json', Errio.stringify(error));

// Load the error from somewhere.
var loadedError = Errio.parse(fs.readFileSync('error.json'));

// Throw as usual.
try {
  throw loadedError;
} catch (thrown) {
  // Check class as usual.
  if (thrown instanceof MyError) {
    console.log(thrown.code); // And access properties as usual.
  }
}
```

[super-error]: https://github.com/busbud/super-error
[docs]: #api-documentation

## API Documentation

```javascript
var Errio = require('errio');
```

### Options

Options can be set at a global defaults level, at the error class level
and at the individual call level. Listed below are the available options
and their factory default values.

- `recursive: true`: Recursively serialize and deserialize nested errors
- `inherited: true`: Include inherited properties
- `stack: false`: Include the stack trace
- `private: false`: Include properties with leading or trailing
  underscores in serialization
- `exclude: []`: Property names to exclude (low priority)
- `include: []`: Property names to include (high priority)

### Errio.setDefaults(options)

Overwrite the global default options with the plain object `options`.
Option keys missing from `options` are left unchanged.

### Errio.register(constructor, options)

Register an error constructor for serialization and deserialization with
option overrides.

The error name will be taken from the first of these that is set:

1. `options.name`
2. `constructor.prototype.name`, if it is not 'Error'
3. `constructor.name`
4. `new constructor().name`

Note that in the last case, the constructor is instantiated with no arguments.

All [built-in error classes][builtins] are automatically registered with
no option overrides.

Can be called more than once for the same error constructor in order to
replace the option overrides.

[builtins]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types

### Errio.registerAll(constructors, options)

Register an array of error constructors with the same option overrides.

Names cannot be specified in `options`, so all constructors will be
instantiated to infer their names.

### Errio.registerObject(constructors, options)

Register a plain object of error names mapped to constructors with the
same option overrides. Constructors will not be instantiated.

Perfect for registering error classes exported from a module.

### Errio.toObject(error, options)

Serialize an error instance to a plain object with option overrides.

Passed options take priority over registered error class options and the
global defaults.

If the class of the error instance has not been registered, it is
automatically registered with the options passed to the call.

Returned objects always contain `name` and `message` properties.

### Errio.fromObject(object, options)

Deserialize a plain object to an instance of a registered error class.

If the class of the serialized error has no registered constructor,
return an instance of `Error` with the `name` property set.

If the stack was not serialized, capture a new stack trace from the
caller.

### Errio.stringify(error, options)

Serialize an error instance to a JSON string. Convenience wrapper for
`Errio.toObject`.

### Errio.parse(string, options)

Deserialize a JSON string to an instance of a registered error class.
Convenience wrapper for `Errio.fromObject`.

## License

Copyright © 2015, Curtis McEnroe <curtis@cmcenroe.me>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
