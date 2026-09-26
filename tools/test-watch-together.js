'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storeSource = fs.readFileSync(path.join(root, 'js/ui/watch-together-store.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'js/ui/watch-together.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(root, 'js/ui/app-shell.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'js/backup-engine.js'), 'utf8');
const records = new Map();
const sandbox = { window: { APP_PREFIX: 'CHAT_APP_V3_', localforage: {
    async getItem(key) { return records.get(key) || null; },
    async setItem(key, value) { records.set(key, value); },
    async removeItem(key) { records.delete(key); }
} } };
vm.runInNewContext(storeSource, sandbox, { filename: 'watch-together-store.js' });
const uiSandbox = { window: { URL: { createObjectURL() { return ''; }, revokeObjectURL() {} } }, console, setTimeout, clearTimeout };
vm.runInNewContext(uiSource, uiSandbox, { filename: 'watch-together.js' });

(async function () {
    const store = sandbox.window.WatchTogetherStore;
    const state = await store.saveState('session-a', {
        videoName: 'movie.mp4', sourceType: 'local', remoteUrl: 'https://must-not-persist.example',
        lastPosition: 12.5, duration: 100, volume: 2, autoInteractionEnabled: true
    });
    assert.strictEqual(state.remoteUrl, '');
    assert.strictEqual(state.volume, 1);
    assert.strictEqual((await store.loadState('session-a')).lastPosition, 12.5);
    const values = Array.from({ length: 350 }, (_, index) => ({ id: index, senderType: 'partner', text: 'x', playbackTime: index }));
    const saved = await store.saveMessages('session-a', values);
    assert.strictEqual(saved.length, 300);
    assert.strictEqual(saved[0].id, '50');

    let creates = 0;
    let revokes = 0;
    const lifecycle = uiSandbox.window.WatchTogether.createObjectUrlLifecycle({
        createObjectURL() { creates += 1; return 'blob:test-' + creates; },
        revokeObjectURL() { revokes += 1; }
    });
    for (let i = 0; i < 100; i += 1) lifecycle.replace({ name: 'video-' + i + '.mp4' });
    lifecycle.clear();
    const lifecycleStats = lifecycle.stats();
    assert.strictEqual(lifecycleStats.creates, 100);
    assert.strictEqual(lifecycleStats.revokes, 100);
    assert.strictEqual(lifecycleStats.active, 0);

    assert(uiSource.includes("localInput.accept = 'video/*'"));
    assert(uiSource.includes('objectUrls.replace(file)'));
    assert(uiSource.includes('45000 + Math.floor(Math.random() * 75001)'));
    assert(uiSource.includes('setTimeout(saveNow, 4000)'));
    assert(!uiSource.includes('MutationObserver'));
    assert(!uiSource.includes('renderMessages(') || uiSource.includes('function renderMessages()'));
    assert(!uiSource.includes('chatMessages'));
    assert(!uiSource.includes('videoName,') || !uiSource.includes('generateBlindText(videoName'));
    assert(shellSource.includes("id: 'watch-together', title: '共同观影'"));
    assert(!backupSource.includes('watchTogetherVideoBlob'), 'no video Blob should enter backups');
    console.log(JSON.stringify({ passed: true, messageCap: saved.length, objectUrlCreates: creates, objectUrlRevokes: revokes, objectUrlLeaks: lifecycle.stats().active, videoBlobPersisted: false, semanticInputs: 0 }, null, 2));
})().catch(function (error) { console.error(error); process.exitCode = 1; });
