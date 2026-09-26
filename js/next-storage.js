(function (global) {
    'use strict';
    const PREFIX = 'SHIKI_NEXT_V1:';
    function scoped(native) {
        const keys = () => Object.keys(native).filter(key => key.startsWith(PREFIX));
        const methods = {
            getItem: key => native.getItem(PREFIX + String(key)),
            setItem: (key, value) => native.setItem(PREFIX + String(key), String(value)),
            removeItem: key => native.removeItem(PREFIX + String(key)),
            clear: () => keys().forEach(key => native.removeItem(key)),
            key: index => (keys()[index] || '').slice(PREFIX.length) || null
        };
        return new Proxy(methods, {
            get: (target, key) => key === 'length' ? keys().length : key in target ? target[key] : methods.getItem(key),
            ownKeys: () => keys().map(key => key.slice(PREFIX.length)),
            getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
            set: (_, key, value) => { methods.setItem(key, value); return true; },
            deleteProperty: (_, key) => { methods.removeItem(key); return true; }
        });
    }
    global.NextStorage = Object.freeze({ local: scoped(global.localStorage), session: scoped(global.sessionStorage), prefix: PREFIX });
})(window);
