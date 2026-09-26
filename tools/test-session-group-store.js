'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/session-group-store.js'), 'utf8');
const groupSource = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8');
const records = new Map();
const storage = {
    async getItem(key) { return records.has(key) ? records.get(key) : null; },
    async setItem(key, value) { records.set(key, value); },
    async removeItem(key) { records.delete(key); }
};
const sandbox = { window: { APP_PREFIX: 'CHAT_APP_V3_', localforage: storage } };
vm.runInNewContext(source, sandbox, { filename: 'session-group-store.js' });

(async function () {
    const store = sandbox.window.SessionGroupStore;
    const direct = await store.get('direct-a');
    assert.strictEqual(direct, null, 'reading a direct session must not create group data');

    const groupB = await store.create('group-b');
    const groupC = await store.create('group-c');
    assert.strictEqual(groupB.enabled, true);
    assert.strictEqual(groupC.members.length, 0);

    const b1 = { id: 'b1-stable', name: 'B1', avatarRef: null };
    await store.setMemberAvatar('group-b', b1.id, { type: 'image/png', value: 'B' });
    b1.avatarRef = store.avatarKey('group-b', b1.id);
    await store.save('group-b', Object.assign({}, groupB, { members: [b1] }));
    await store.save('group-c', Object.assign({}, groupC, { members: [{ id: 'c1-stable', name: 'C1' }] }));
    const savedB = await store.get('group-b');
    const savedC = await store.get('group-c');
    assert.strictEqual(savedB.members[0].id, 'b1-stable');
    assert.strictEqual(savedC.members[0].id, 'c1-stable');
    assert.notStrictEqual(store.avatarKey('group-b', 'same'), store.avatarKey('group-c', 'same'));

    savedB.members[0].name = 'B1 renamed';
    await store.save('group-b', savedB);
    assert.strictEqual((await store.get('group-b')).members[0].id, 'b1-stable', 'rename must preserve id');
    assert.strictEqual((await store.get('group-c')).members[0].name, 'C1', 'groups must remain isolated');

    const legacy = { enabled: true, showAvatar: true, showName: true, members: [{ id: 'legacy-stable', name: 'Legacy', avatar: 'data:image/png;base64,AA' }] };
    const migrated = await store.migrateLegacy('legacy-group', legacy);
    assert.strictEqual(migrated.members[0].id, 'legacy-stable');
    assert.strictEqual(legacy.members[0].id, 'legacy-stable', 'legacy input must not be mutated');
    assert.strictEqual((await store.migrateLegacy('legacy-group', { members: [] })).members[0].id, 'legacy-stable', 'migration must not repeat');

    await store.remove('group-b');
    assert.strictEqual(await store.get('group-b'), null);
    assert(await store.get('group-c'), 'removing B must not remove C');

    assert(groupSource.includes('previous && previous.id ? previous.id'), 'member edit must preserve stable ids');
    assert(groupSource.includes('window.activateGroupChatSession'));
    console.log(JSON.stringify({ passed: true, isolatedGroups: 2, stableIds: true, legacyMigration: true }, null, 2));
})().catch(function (error) { console.error(error); process.exitCode = 1; });
