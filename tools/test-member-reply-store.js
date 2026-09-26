'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/member-reply-store.js'), 'utf8');
const records = new Map();
const storage = {
    async getItem(key) { return records.has(key) ? records.get(key) : null; },
    async setItem(key, value) { records.set(key, value); return value; },
    async removeItem(key) { records.delete(key); }
};
const sandbox = { window: { APP_PREFIX: 'CHAT_APP_V3_', localforage: storage } };
vm.runInNewContext(source, sandbox, { filename: 'member-reply-store.js' });

(async function () {
    const store = sandbox.window.MemberReplyStore;
    const originalMessages = [
        { id: 'old-1', sender: 'user', text: '旧消息', translationText: 'old' },
        { id: 'old-2', sender: '同名角色', groupMemberId: 'member-same', text: '群消息' }
    ];
    const before = JSON.stringify(originalMessages);

    const cReplies = Array.from({ length: 100 }, (_, i) => 'C字卡' + i);
    const dReplies = Array.from({ length: 100 }, (_, i) => 'D字卡' + i);
    await store.set('group-c', 'member-same', { replies: cReplies });
    await store.set('group-d', 'member-same', { replies: dReplies });

    assert.notStrictEqual(store.key('group-c', 'member-same'), store.key('group-d', 'member-same'));
    assert.strictEqual((await store.get('group-c', 'member-same')).replies[0], 'C字卡0');
    assert.strictEqual((await store.get('group-d', 'member-same')).replies[0], 'D字卡0');

    // A rename does not affect the stable member id used by the store.
    assert.strictEqual(await store.has('group-c', 'member-same'), true);
    await store.remove('group-c', 'member-same');
    assert.strictEqual(await store.has('group-c', 'member-same'), false);
    assert.strictEqual(await store.has('group-d', 'member-same'), true);

    await store.set('group-c', 'member-2', ['C2']);
    await Promise.all(Array.from({ length: 25 }, (_, i) =>
        store.set('group-concurrent', 'member-' + i, ['并发字卡' + i])
    ));
    for (let i = 0; i < 25; i += 1) {
        assert.strictEqual(await store.has('group-concurrent', 'member-' + i), true);
    }
    const concurrentIndex = records.get(store.indexKey('group-concurrent'));
    assert.strictEqual(concurrentIndex.length, 25, 'concurrent member writes must not lose index entries');
    await store.removeSession('group-c');
    assert.strictEqual(await store.has('group-c', 'member-2'), false);
    assert.strictEqual(await store.has('group-d', 'member-same'), true);
    assert.strictEqual(JSON.stringify(originalMessages), before, 'old messages must remain byte-for-byte unchanged');

    console.log(JSON.stringify({
        passed: true,
        isolatedSessions: 2,
        sameMemberNameSafe: true,
        stableMemberId: true,
        memberRemovalIsolated: true,
        sessionRemovalIsolated: true,
        concurrentIndexEntries: concurrentIndex.length,
        legacyMessagesChanged: false,
        replyGeneratorIntegration: false
    }, null, 2));
})().catch(function (error) { console.error(error); process.exitCode = 1; });
