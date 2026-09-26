'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative));
const text = relative => read(relative).toString('utf8');

function pngSize(relative) {
    const bytes = read(relative);
    assert.strictEqual(bytes.toString('ascii', 1, 4), 'PNG');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const index = text('index.html');
const css = text('css/app-shell.css');
const app = text('js/app.js');
const onboarding = text('js/onboarding.js');
const manifest = JSON.parse(text('manifest.webmanifest'));

assert(index.includes('data-skip-opening="true"'));
assert(index.includes('assets/app-icon.svg'));
assert(index.includes('assets/apple-touch-icon.png'));
assert(index.includes('manifest.webmanifest'));
assert(css.includes('html[data-skip-opening="true"] #splash-declaration'));
assert(css.includes('html[data-skip-opening="true"] .welcome-animation'));
assert(onboarding.indexOf("data-skip-opening") < onboarding.indexOf("localStorage.removeItem('splashPledgeSigned_v2')"));
assert(!app.includes('setTimeout(hideWelcomeScreen'));
assert(app.includes("document.visibilityState === 'visible'"));
assert(app.includes("window.addEventListener('pageshow'"));
assert((app.match(/wakeRollingScheduler\(\);/g) || []).length >= 3);
assert(app.includes('window.RollingMessageScheduler.wake'));
assert(!app.includes('window.RollingMessageScheduler.start({\n                source'));

assert.strictEqual(manifest.start_url, './');
assert.strictEqual(manifest.scope, './');
assert.strictEqual(manifest.display, 'standalone');
assert.deepStrictEqual(pngSize('assets/apple-touch-icon.png'), { width: 180, height: 180 });
assert.deepStrictEqual(pngSize('assets/app-icon-192.png'), { width: 192, height: 192 });
assert.deepStrictEqual(pngSize('assets/app-icon-512.png'), { width: 512, height: 512 });

console.log(JSON.stringify({
    passed: true,
    openingAnimationSkipped: true,
    schedulerResumeWake: true,
    schedulerReinitialized: false,
    icons: ['180x180', '192x192', '512x512'],
    closedPagePushClaimed: false
}, null, 2));
