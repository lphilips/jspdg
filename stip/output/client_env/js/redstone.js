REDSTONE = {};
REDSTONE.METHODS = {};
REDSTONE.UPDATECLIENTVAR = {};

REDSTONE.DUMMYCLIENT = function() {
	var nil = function() {};
	this.expose = nil;
	this.onConnected = function(x) {
		console.log("onConnected!");
		x();
	};
	this.onDisconnected = nil;
};

(function() {

	var updateMustache = function updateMustache(idName, newValue) {
		// TODO: Only update if value has changed (at the time of writing, this bugged in ractive)
		ractive.set(idName, newValue);
	};

	var variableInfo = {};
	var loaded = false;
	var waitingUpdates = [];

	var evalProgram = function evalProgram(program) {
		var bodyLength = program.body.length;
		if (bodyLength != 1) {
			console.log("!!! Program.body.length should be equal to 1");
			console.log("!!! Got " + bodyLength);
			return false;
		}
		return eval(program.body[0]);
	};

	var evalExpressionStatement = function evalExpressionStatement(expressionStatement) {
		return eval(expressionStatement.expression);
	};

	var evalLiteral = function evalLiteral(literal) {
		return literal.value;
	};

	var evalIdentifier = function evalIdentifier(identifier) {
		var varname = identifier.name;
		if (identifier.hasOwnProperty("isInCrumb")) {
			var varInfo = variableInfo[varname];

			if (varInfo === undefined) {
				console.log("!!! No definition for variable '" + varname + "'.");
				return false;
			}

			return varInfo.value;
		} else {
			console.log("!!! I don't know what to do with identifier that is not in crumb");
			return false;
		}
	};

	var evalMemberExpression = function evalMemberExpression(memberExpression) {
		var object = eval(memberExpression.object);

		if (memberExpression.computed) {
			return object[eval(memberExpression.property)];
		} else {
			// If not computed, property has type identifier according to specification
			return object[memberExpression.property.name];
		}
	};

	var evalBinaryExpression = function evalBinaryExpression(binaryExpression) {
		var left = eval(binaryExpression.left);
		var right = eval(binaryExpression.right);
		var operator = binaryExpression.operator;

		switch (operator) {
			case "==":			return left == right;
			case "===":			return left === right;
			case "!=":			return left != right;
			case "!==":			return left !== right;
			case "<":			return left < right;
			case "<=":			return left <= right;
			case ">":			return left > right;
			case ">=":			return left >= right;
			case "<<":			return left << right;
			case ">>":			return left >> right;
			case ">>>":			return left >>> right;
			case "+":			return left + right;
			case "-":			return left - right;
			case "*":			return left * right;
			case "/":			return left / right;
			case "%":			return left % right;
			case "|":			return left | right;
			case "^":			return left ^ right;
			case "&":			return left & right;
			case "in":			return left in right;
			case "instanceof":	return left instanceof right;

			default:
				console.log("!!! Unknown type of BinaryOperator: " + operator);
				return false;
		}
	};

	var evalCallExpression = function evalCallExpression(callExpression) {
		var callee = callExpression.callee;
		var methodObj;
		var thisObj = null;

		switch (callee.type) {
			case esprima.Syntax.Identifier:
				methodObj = REDSTONE.METHODS[callee.name];

				if (!methodObj) {
					console.log("!!! method object undefined for " + callee.name);
					return false;
				}
				break;

			case esprima.Syntax.MemberExpression:
				var property_name;

				if (callee.computed) {
					property_name = eval(callee.property);
				} else {
					property_name = callee.property.name;
				}

				thisObj = eval(callee.object);
				methodObj = thisObj[property_name];
				break;

			default:
				console.log("!!! Unknown type of callExpression callee: " + callee.type);
				return false;
		}

		var argumentExpressions = callExpression.arguments;
		var arguments = argumentExpressions.map(eval);

		return methodObj.apply(thisObj, arguments);
	};

	var evalConditionalExpression = function evalConditionalExpression(conditionalExpression) {
		var test_value = eval(conditionalExpression.test);

		if (test_value) {
			return eval(conditionalExpression.consequent);
		} else {
			return eval(conditionalExpression.alternate);
		}
	};

	var eval = function eval(ast) {
		var type = ast.type;

		switch (type) {
			case esprima.Syntax.Program:
				return evalProgram(ast);

			case esprima.Syntax.ExpressionStatement:
				return evalExpressionStatement(ast);

			case esprima.Syntax.Literal:
				return evalLiteral(ast);

			case esprima.Syntax.Identifier:
				return evalIdentifier(ast);

			case esprima.Syntax.MemberExpression:
				return evalMemberExpression(ast);

			case esprima.Syntax.BinaryExpression:
				return evalBinaryExpression(ast);

			case esprima.Syntax.CallExpression:
				return evalCallExpression(ast);

			case esprima.Syntax.ConditionalExpression:
				return evalConditionalExpression(ast);

			default:
				console.log("!!! unknown type of expression: " + type);
				return false;
		}
	};

	var updateVariable = function updateVariable(variableName, value, shared) {
		// Fill in default variable if none given
		if (shared === undefined) {
			shared = false;
		}

		// Create info object if not yet created
		if (!variableInfo.hasOwnProperty(variableName)) {
			variableInfo[variableName] = {
				value: value,
				blocked: false,
				finalValue: value
			}
		}

		// When not yet loaded, wait until loaded
		if (!loaded) {
			waitingUpdates.push({
				variableName: variableName,
				value: value,
				shared: shared
			});
			return;
		}
		
		// Don't do anything if blocked
		if (variableInfo[variableName].blocked) {
			console.log("!!! Variable " + variableName + " is blocked, not allowing nested updating GUI on same variable!");

			// The new value is stored in finalValue: when variable is unblocked, the final value is used for storing, so
			// it reflects the final value as stored in client layer
			variableInfo[variableName].finalValue = value;
			return false;
		}

		// Clean up old value
		var oldValue = variableInfo[variableName].value;
		if (typeof oldValue == 'object') {
			OBJSPY.untrack(oldValue, variableName);
		}

		// Get crumbs belonging to this variable
		var crumbIds = REDSTONE.VARTOCRUMBID[variableName];

		// Block and set new value
		variableInfo[variableName].blocked = true;
		variableInfo[variableName].finalValue = value;
		variableInfo[variableName].value = value;

		var onInternalUpdate = function onInternalUpdate() {
			if (crumbIds !== undefined) {
				crumbIds.map(function (crumbId) {
					return REDSTONE.CRUMBS[crumbId];
				}).forEach(function (crumb) {
					var newValue = eval(crumb.parsedExpression);
					updateMustache(crumb.idName, newValue);
				});
			}
		};

		// Do initial update
		onInternalUpdate();

		// Unblock
		variableInfo[variableName].blocked = false;

		// Set the final value
		value = variableInfo[variableName].finalValue;
		variableInfo[variableName].value = value;

		// Track value
		if (typeof value == 'object') {
			OBJSPY.track(
				value,
				function (prop, action, difference, oldvalue, fullnewvalue) {
					onInternalUpdate();

					// Send update if shared (if static analysis didn't catch it)
					if (shared) {
						REDSTONE.store.set(variableName, value);
					}
				},
				variableName
			);
		}
		
		return true;
	};

	var initGUI = function initGUI() {
		loaded = true;

		// Evaluate crumbs without any varnames
		var crumbIds = Object.keys(REDSTONE.CRUMBS);
		crumbIds.map(function (crumbId) {
			return REDSTONE.CRUMBS[crumbId];
		}).forEach(function (crumb) {
			var variableNames = crumb.variableNames;
			// Immediate evaluate after loading
			if (variableNames.length === 0) {
				var value = eval(crumb.parsedExpression);
				updateMustache(crumb, value);
			}
		});

		// Evaluate those that were waiting until loaded
		for (var i = 0; i < waitingUpdates.length; i++) {
			var upd = waitingUpdates[i];
			updateVariable(upd.variableName, upd.value, upd.shared);
		}
		waitingUpdates = [];

		// Install ractive observers on two-way variables
		REDSTONE.EXPOSEDVALUES.forEach(function (exposedValue) {
			var crumb = exposedValue.crumb;
			var rId = crumb.idName;
			var expression = getExposedExpression(crumb.parsedExpression);

			ractive.observe(rId, function (newValue, oldValue) {
				var continueAssignment = (expression !== false);

				// If exposedValue has an change observer
				if (exposedValue.onChangeEvent !== false) {
					var functionName = exposedValue.onChangeEvent.name;
					var result = REDSTONE.METHODS[functionName](newValue);

					if (result !== undefined) {
						if (result === false) {
							continueAssignment = false;
						} else if (typeof result === "string") {
							newValue = result;
						}
					}
				}

				if (continueAssignment) {
					assignLValue(rId, expression, newValue);
				}
			});
		});
	};

	var getExposedExpression = function getExposedExpression(ast) {
		if (typeof ast !== 'object') {
			return false;
		}

		if (ast.type !== esprima.Syntax.Program) {
			console.log("!!! AST doesn't start with Program");
			return false;
		}

		if (ast.body.length != 1) {
			console.log("!!! Program body length is not equal to 1.");
			return false;
		}

		if (ast.body[0].type !== esprima.Syntax.ExpressionStatement) {
			console.log("!!! Expected ExpressionStatement, instead of " + ast.body[0].type);
			return false;
		}

		return ast.body[0].expression;
	};

	var assignLValue = function assignLValue(exposedId, expression, value) {
		var type = expression.type;

		switch (type) {
			case esprima.Syntax.Identifier:
				var varname = expression.name;

				// Update client value
				REDSTONE.UPDATECLIENTVAR[varname](value);

				// Update other crumbs
				updateVariable(varname, value);
				break;

			case esprima.Syntax.MemberExpression:
				// Evaluate object
				var object = eval(expression.object);
				var property;

				if (expression.computed) {
					// Evaluate property
					property = eval(expression.property);
				} else {
					// Get property name
					property = expression.property.name;
				}

				// Let ObjWatch take care of updates
				object[property] = value;
				break;
		}
	};
	
	var installEventProxies = function installEventProxies() {
		REDSTONE.EVENTS.forEach(function (event) {
			switch (event.type) {
				case "click":
					ractive.on(event.idName, function (ev) {
                        ev.index = ev.index ? ev.index.__idx__ : false;
						REDSTONE.METHODS[event.name](ev);
					});
					break;
			}
		});
	};

	var init = function init() {
		console.log("initGUI()");
		initGUI();
		installEventProxies();
	};

	var registerMethod = function (name, func) {
		REDSTONE.METHODS[name] = func;
	};

	var onConnected = function() {
		$("#loading").fadeOut(250);
		$("#render-target").fadeIn(250);
		console.log("Connected with server!");
	};

	var onDisconnected = function() {
		$("#loading").fadeIn(100);
		console.log("Lost connection with server!");
	};

	var receiveStoreUpdate = function(name, val) {
		REDSTONE.UPDATECLIENTVAR[name](val);
		updateVariable(name, val, true);
	};

	REDSTONE.init = init;
	REDSTONE.updateVariable = updateVariable;
	REDSTONE.getVarInfo = function (varname) {
		return variableInfo[varname];
	};
	REDSTONE.registerMethod = registerMethod;
	REDSTONE.onConnected = onConnected;
	REDSTONE.onDisconnected = onDisconnected;
	REDSTONE.receiveStoreUpdate = receiveStoreUpdate;

})();

// Disable Ractive debug
Ractive.DEBUG = false;