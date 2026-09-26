'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const backgroundSource = fs.readFileSync(path.join(root, 'js/background-support.js'), 'utf8');
const featuresSource = fs.readFileSync(path.join(root, 'js/features.js'), 'utf8');
const dataSource = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const wav = fs.readFileSync(path.join(root, 'assets/keepalive.wav'));

assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE');
assert(wav.subarray(44).some(function (byte) { return byte !== 0; }), 'keepalive audio must not be optimized as a completely silent track');
assert(featuresSource.includes("var SRC = 'assets/keepalive.wav'"));
assert(featuresSource.includes("setAttribute('playsinline'"));
assert(featuresSource.includes("setAttribute('webkit-playsinline'"));
assert(featuresSource.includes("document.addEventListener('touchend', _unlock"));
assert(featuresSource.includes("window.addEventListener('pageshow'"));
assert(featuresSource.includes('window._getKeepaliveAudioStatus'));
assert(dataSource.includes('window.BackgroundSupport.showNotification'));
assert(!appSource.includes('Notification.requestPermission()'));
assert(workerSource.includes("self.addEventListener('notificationclick'"));
assert(!workerSource.includes("addEventListener('fetch'"));
assert(!workerSource.includes('caches.open'));

let registerCalls = 0;
let showCalls = 0;
const registration = {
    showNotification: async function () { showCalls++; }
};
const windowObject = {
    Notification: { permission: 'granted' },
    navigator: null
};
const sandbox = {
    window: windowObject,
    Notification: windowObject.Notification,
    navigator: {
        serviceWorker: {
            register: async function (url, options) {
                registerCalls++;
                assert.strictEqual(url, 'service-worker.js');
                assert.strictEqual(options.scope, './');
                return registration;
            },
            ready: Promise.resolve(registration)
        }
    },
    document: {
        readyState: 'complete',
        addEventListener: function () {}
    },
    console: console
};
windowObject.navigator = sandbox.navigator;
vm.runInNewContext(backgroundSource, sandbox, { filename: 'background-support.js' });

(async function () {
    await windowObject.BackgroundSupport.initialize();
    await windowObject.BackgroundSupport.initialize();
    const shown = await windowObject.BackgroundSupport.showNotification('test', { body: 'hidden' });
    assert.strictEqual(shown, true);
    assert.strictEqual(registerCalls, 1, 'service worker registration must be deduplicated');
    assert.strictEqual(showCalls, 1);
    console.log(JSON.stringify({
        passed: true,
        localAudio: true,
        localAudioBytes: wav.length,
        safariGestureUnlock: true,
        serviceWorkerRegistrations: registerCalls,
        serviceWorkerNotifications: showCalls,
        cacheHandlers: 0,
        remotePushBackend: false
    }, null, 2));
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
