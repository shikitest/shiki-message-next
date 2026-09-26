'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/conversation-avatar-store.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'js/backup-engine.js'), 'utf8');
const records = new Map();
let creates = 0;
let revokes = 0;
const fakeStorage = {
    async getItem(key) { return records.get(key) || null; },
    async setItem(key, value) { records.set(key, value); },
    async removeItem(key) { records.delete(key); }
};
const sandbox = {
    window: {
        APP_PREFIX: 'CHAT_APP_V3_',
        localforage: fakeStorage,
        URL: {
            createObjectURL() { creates += 1; return 'blob:test-' + creates; },
            revokeObjectURL() { revokes += 1; }
        },
        addEventListener() {}
    }
};
vm.runInNewContext(source, sandbox, { filename: 'conversation-avatar-store.js' });

(async function () {
    const store = sandbox.window.ConversationAvatarStore;
    const file = { type: 'image/png', size: 1024, name: 'avatar.png' };
    const ref = await store.save('session-a', file);
    assert.strictEqual(ref, 'local-avatar:session-a');
    assert(records.has('CHAT_APP_V3_conversationAvatarMediaV1:session-a'));
    assert.strictEqual(await store.getObjectUrl('session-a'), 'blob:test-1');
    assert.strictEqual(await store.getObjectUrl('session-a'), 'blob:test-1', 'object URL must be reused');
    assert.strictEqual(creates, 1);
    await store.save('session-a', file);
    assert.strictEqual(revokes, 1, 'replacing an avatar must revoke the old URL');
    await store.getObjectUrl('session-a');
    await store.remove('session-a');
    assert.strictEqual(records.has('CHAT_APP_V3_conversationAvatarMediaV1:session-a'), false);
    assert.strictEqual(revokes, 2, 'deleting an avatar must revoke its URL');
    assert(backupSource.includes("key.indexOf('conversationAvatarMediaV1:') !== -1"), 'avatar blobs must be excluded from ordinary backup');
    console.log(JSON.stringify({ passed: true, objectUrlCreates: creates, objectUrlRevokes: revokes, backupIsolation: true }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
