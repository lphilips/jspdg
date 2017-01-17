// Wrapper on watch.js, as watch.js does not allow multiple "watches" on the same object.
// Will keep track of a list of watchers (listeners/observers), and cleans up watching
// when there are no observers left.

(function() {

	var debug = false;

	OBJSPY = {};

	var createWatcher = function (obj) {
		var fullValue = obj;

		var watcher = function (prop, action, difference, oldvalue) {
			// Call listeners
			if (debug) {
				console.log("Detected update!");
				console.log("Prop: ");
				console.log(prop);
				console.log("Action: ");
				console.log(action);
				console.log("Difference: ");
				console.log(difference);
				console.log("Oldvalue: ");
				console.log(oldvalue);
				console.log("Fullnewvalue: ");
				console.log(this);
			}

			fullValue.__objspy__.listeners.forEach(function (keyandlistener) {
				var listener = keyandlistener.listener;
				listener(prop, action, difference, oldvalue, fullValue);
			});

			if (debug) {
				console.log("-----------------------------------------------------------");
			}
		};

		return watcher;
	};

	OBJSPY.track = function (obj, func, givenKey) {
		var startWatch = false;
		var key, idx;

		var desc = Object.getOwnPropertyDescriptor(obj, '__objspy__');
		if (desc === undefined) {
			key = (givenKey === undefined) ? makeId() : givenKey;
			Object.defineProperty(obj, '__objspy__', {
				enumerable: false,
				configurable: true,
				writable: false,
				value: {
					listeners: [{
						key: key,
						listener: func
					}]
				}
			});
			startWatch = true;
		} else {
			if (givenKey === undefined) {
				do {
					key = makeId();
					idx = -1;
					obj.__objspy__.listeners.forEach(function (keyandlistener, i) {
						if (keyandlistener.key === key) {
							idx = i;
						}
					});
				} while (idx !== -1);
			} else {
				// Generate really unique key
				key = givenKey;
			}

			obj.__objspy__.listeners.push({
				key: key,
				listener: func
			});
		}

		var watcher = createWatcher(obj);

		if (startWatch) {
			watch(obj, watcher, Infinity, true);
		}

		return key;
	};

	OBJSPY.untrack = function (obj, key) {
		// Don't do anything if not tracking
		if (!(obj.hasOwnProperty("__objspy__"))) {
			return;
		}

		var idx = -1;
		obj.__objspy__.listeners.forEach(function (keyandlistener, i) {
			if (keyandlistener.key === key) {
				idx = i;
			}
		});

		if (idx === -1) {
			return false;
		}

		// Remove element
		obj.__objspy__.listeners.splice(idx, 1);

		// "Half" Cleanup
		if (obj.__objspy__.listeners.length === 0) {
			if (debug) {
				console.log("Stopped tracking an object.");
				console.log(obj);
			}
			unwatch(obj);
		}
		// We could remove __objspy__ but it can safely remain there with an empty array, not that huge waste of space.

		return true;
	};

})();