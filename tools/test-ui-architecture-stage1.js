'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const metaSource = fs.readFileSync(path.join(root, 'js/ui/conversation-meta-store.js'), 'utf8');
const shellSource = fs.readFileSync(path.join(root, 'js/ui/app-shell.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

const originalSessionList = [
    { id: 'old-direct', name: '旧会话', createdAt: 10 },
    { id: 'old-group', name: '旧群聊', createdAt: 20 }
];
const originalMessages = [
    { id: 'm1', text: '[redacted]', sender: 'member-a', memberId: 'stable-a' },
    { id: 'm2', text: '[redacted]', senderId: 'stable-b', memberId: 'stable-b' }
];
const originalGroup = {
    enabled: true,
    members: [{ id: 'stable-a', name: 'A', avatarRef: 'gca_stable-a' }]
};
const before = JSON.stringify({ originalSessionList, originalMessages, originalGroup });
const records = new Map([
    ['CHAT_APP_V3_sessionList', structuredClone(originalSessionList)],
    ['CHAT_APP_V3_old-direct_messages', structuredClone(originalMessages)],
    ['groupChatSettings', structuredClone(originalGroup)]
]);
const writes = [];
const removals = [];
const fakeStorage = {
    async getItem(key) { return records.has(key) ? structuredClone(records.get(key)) : null; },
    async setItem(key, value) { writes.push(key); records.set(key, structuredClone(value)); return value; },
    async removeItem(key) { removals.push(key); records.delete(key); }
};
const sandbox = { window: { APP_PREFIX: 'CHAT_APP_V3_', localforage: fakeStorage } };
vm.runInNewContext(metaSource, sandbox, { filename: 'conversation-meta-store.js' });

(async function run() {
    const store = sandbox.window.ConversationMetaStore;
    await store.load();
    assert.deepStrictEqual(writes, [], 'metadata load must not write storage');
    assert.strictEqual(store.get('old-direct').type, 'direct');
    assert.strictEqual(store.get('old-group', { isCurrent: true, legacyGroupEnabled: true }).type, 'group');
    assert.strictEqual(store.get('old-group', { isCurrent: true, legacyGroupEnabled: true }).legacyGroup, true);

    await store.update('old-direct', { type: 'direct', pinned: true, updatedAt: 30 });
    assert.deepStrictEqual(writes, ['CHAT_APP_V3_conversationUiMetaV1']);
    assert.strictEqual(store.get('old-direct').pinned, true);
    assert.deepStrictEqual(removals, [], 'metadata operations must not delete legacy keys');
    assert.deepStrictEqual(records.get('CHAT_APP_V3_sessionList'), originalSessionList);
    assert.deepStrictEqual(records.get('CHAT_APP_V3_old-direct_messages'), originalMessages);
    assert.deepStrictEqual(records.get('groupChatSettings'), originalGroup);

    await store.remove('old-direct');
    assert.strictEqual(records.has('CHAT_APP_V3_sessionList'), true);
    assert.strictEqual(records.has('CHAT_APP_V3_old-direct_messages'), true);
    assert.strictEqual(records.has('groupChatSettings'), true);
    assert.strictEqual(JSON.stringify({ originalSessionList, originalMessages, originalGroup }), before);

    assert(indexSource.includes('css/app-shell.css'));
    assert(indexSource.includes('js/ui/conversation-meta-store.js'));
    assert(indexSource.includes('js/ui/app-shell.js'));
    assert(indexSource.indexOf('conversation-meta-store.js') < indexSource.indexOf('app-shell.js'));
    assert(indexSource.indexOf('app-shell.js') < indexSource.indexOf('js/app.js'));
    assert(appSource.includes('window.ShikiAppShell.initialize'));
    assert(shellSource.includes("activeView = 'conversations'"));
    assert(shellSource.includes("['conversations', '聊天'"));
    assert(shellSource.includes("['more', '更多'"));
    assert(shellSource.includes("['settings', '设置'"));
    assert(shellSource.includes("id: 'watch-together'"));
    assert(!shellSource.includes('renderMessages('));
    assert(!shellSource.includes('RandomIME.generate'));
    assert(!shellSource.includes('TranslationHelper.initialize'));
    assert(!shellSource.includes('RollingMessageScheduler.initialize'));
    assert(!shellSource.includes('messages.map'));

    console.log('UI Architecture Stage 1 tests: PASS');
    console.log('Legacy data mutations: 0');
    console.log('Legacy key removals: 0');
    console.log('Metadata-only writes:', writes.length);
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
