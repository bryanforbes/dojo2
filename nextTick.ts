import CallbackQueue = require('./CallbackQueue');
import core = require('./interfaces');
import has = require('./has');

declare var process:any;

has.add('dom-mutationobserver', function (global:any):boolean {
	return has('host-browser') && Boolean(global.MutationObserver || global.WebKitMutationObserver);
});

function noop():void {}

var nextTick:(callback:() => void) => core.IHandle;

// Node.JS 0.10 added `setImmediate` and then started throwing warnings when people called `nextTick` recursively;
// Node.JS 0.11 supposedly removes this behaviour, so only target 0.10
if (has('host-node') && typeof setImmediate !== 'undefined' && process.version.indexOf('v0.10.') === 0) {
	nextTick = function (callback:() => void):core.IHandle {
		var timer = setImmediate(callback);
		return {
			remove: function ():void {
				this.remove = noop;
				clearImmediate(timer);
			}
		};
	};
}
else if (has('host-node')) {
	nextTick = function (callback:() => void):core.IHandle {
		var removed = false;
		process.nextTick(function ():void {
			// There isn't an API to remove a pending call from `process.nextTick`
			if (removed) {
				return;
			}

			callback();
		});

		return {
			remove: function ():void {
				this.remove = noop;
				removed = true;
			}
		};
	};
}
else {
	var queue = new CallbackQueue<() => void>();

	if (has('dom-mutationobserver')) {
		nextTick = (function ():typeof nextTick {
			var MutationObserver = this.MutationObserver || this.WebKitMutationObserver;
			var element = document.createElement('div');
			var observer = new MutationObserver(function ():void {
				queue.drain();
			});

			observer.observe(element, { attributes: true });

			return function (callback:() => void):core.IHandle {
				var handle = queue.add(callback);
				element.setAttribute('drainQueue', '1');
				return handle;
			};
		})();
	}
	else {
		nextTick = (function ():typeof nextTick {
			// Node.js returns a Timer object from setTimeout,
			// HTML5 specifies a number
			var timer:any;
			return function (callback:() => void):core.IHandle {
				var handle = queue.add(callback);

				if (!timer) {
					timer = setTimeout(function ():void {
						clearTimeout(timer);
						timer = null;
						queue.drain();
					}, 0);
				}

				return handle;
			};
		})();
	}
}

export = nextTick;
