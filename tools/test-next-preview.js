const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const normalize = x => JSON.parse(JSON.stringify(x));
function storage() {
    const data = Object.create(null);
    Object.setPrototypeOf(data, {
        getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; },
        setItem(key, val) { this[key] = String(val); }, removeItem(key) { delete this[key]; },
        clear() { for (const k of Object.keys(this)) delete this[k]; }, key(i) { return Object.keys(this)[i] || null; }
    });
    return data;
}
function environment() {
    const records = new Map(); let failKey = null;
    const timers = new Map(); let timerId = 0;
    const ctx = { console, Event, crypto: { randomUUID }, localStorage: storage(), sessionStorage: storage(),
        dispatchEvent() {}, addEventListener() {},
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
        NextModel: null, APP_PREFIX: 'SHIKI_NEXT_', SESSION_ID: '', settings: {}, messages: [],
        Math: Object.create(Math), document: { hidden: false },
        addMessage: msg => ctx.sent.push(msg), playSound() {}, sent: [],
        localforage: {
            async getItem(k) { return records.has(k) ? structuredClone(records.get(k)) : null; },
            async setItem(k, v) { if (k === failKey) { failKey = null; throw new Error('injected write failure'); } records.set(k, structuredClone(v)); return v; },
            async removeItem(k) { records.delete(k); }, async keys() { return [...records.keys()]; }
        }
    };
    ctx.window = ctx; vm.createContext(ctx);
    const core = fs.readFileSync(path.join(root, 'js/core.js'), 'utf8');
    vm.runInContext(core.slice(core.indexOf('function getDefaultSettings()'), core.indexOf('function renderBackgroundGallery()')), ctx);
    vm.runInContext(core.slice(core.indexOf('function normalizeTextGenerationMode('), core.indexOf('window.chooseReplyText =')), ctx);
    for (const file of ['next-storage.js', 'next-model.js', 'next-runtime.js', 'next-backup.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
    return { ctx, records, timers, fail: k => { failKey = k; } };
}
(async () => {
    const env = environment(), { ctx, records, timers } = env;
    ctx.localStorage.setItem('groupChatSettings', 'OLD GROUP'); ctx.localStorage.setItem('CHAT_APP_V3_sessionList', 'OLD LIST');
    ctx.sessionStorage.setItem('CHAT_APP_UI_OPEN_CHAT', 'OLD NAV');
    ctx.NextStorage.local.setItem('groupChatSettings', 'NEW GROUP');
    assert.equal(ctx.NextStorage.local.getItem('groupChatSettings'), 'NEW GROUP');
    assert.deepEqual(Object.keys(ctx.NextStorage.local), ['groupChatSettings']); ctx.NextStorage.local.clear();
    assert.equal(ctx.localStorage.getItem('groupChatSettings'), 'OLD GROUP'); assert.equal(ctx.localStorage.getItem('CHAT_APP_V3_sessionList'), 'OLD LIST');
    ctx.NextStorage.session.clear(); assert.equal(ctx.sessionStorage.getItem('CHAT_APP_UI_OPEN_CHAT'), 'OLD NAV');
    await ctx.NextModel.load();
    const a = await ctx.NextModel.saveFriend({ name: 'A', cards: ['A ONLY'], replyProbability: 1 });
    const b = await ctx.NextModel.saveFriend({ name: 'B', cards: ['B ONLY'], replyProbability: 1 });
    const directs = await Promise.all([ctx.NextModel.openDirect(a.id), ctx.NextModel.openDirect(a.id)]);
    assert.equal(directs[0].id, directs[1].id); assert.equal(ctx.NextModel.snapshot().conversations.length, 1);
    const directB = await ctx.NextModel.openDirect(b.id);
    const group = await ctx.NextModel.createGroup('G', [a.id, b.id]);
    await ctx.NextModel.load(); assert.deepEqual(normalize(ctx.NextModel.friend(a.id).cards), ['A ONLY']);
    assert.deepEqual(normalize(ctx.NextModel.friend(b.id).cards), ['B ONLY']);
    assert.deepEqual(normalize(ctx.NextModel.conversation(group.id).friendIds), [a.id, b.id]);
    const original = ctx.NextModel.snapshot(); env.fail(ctx.NextModel.key);
    await assert.rejects(ctx.NextModel.saveFriend({ id: a.id, name: 'FAILED', cards: ['bad'] }));
    assert.deepEqual(normalize(ctx.NextModel.snapshot()), normalize(original));
    ctx.SESSION_ID = group.id; ctx.Math.random = () => 0;
    ctx.NextRuntime.reply({}); assert.equal(timers.size, 2);
    for (const fn of [...timers.values()]) fn(); timers.clear();
    assert.equal(ctx.sent.length, 2);
    assert.deepEqual(ctx.sent.map(m => [m.friendId, m.text]), [[a.id, 'A ONLY'], [b.id, 'B ONLY']]);
    const oldMessages = normalize(ctx.sent);
    await ctx.NextModel.saveFriend({ id: a.id, name: 'A', cards: ['A NEW'] });
    assert.deepEqual(normalize(ctx.sent), oldMessages);
    ctx.SESSION_ID = directs[0].id; ctx.NextRuntime.reply({});
    ctx.SESSION_ID = directB.id; for (const fn of [...timers.values()]) fn(); timers.clear();
    assert.equal(ctx.sent.length, 2, 'stale A tasks cannot write into B');
    ctx.SESSION_ID = group.id; await ctx.NextModel.deleteFriend(a.id); ctx.NextRuntime.reply({});
    assert.equal(timers.size, 1, 'deleted friend stops replying'); ctx.NextRuntime.cancelReplies(); assert.equal(timers.size, 0);
    await ctx.NextModel.saveFriend({ id: a.id, name: 'A', cards: ['A NEW'], deleted: false, replyProbability: 0.5, replySettings: { allowReadNoReply: true, readNoReplyChance: 0.5 } });
    await ctx.NextModel.saveFriend({ id: b.id, name: 'B', cards: ['B ONLY'], replyProbability: 0.5, replySettings: { allowReadNoReply: true, readNoReplyChance: 0.5 } });
    const draws = [0.1, 0.9, 0.99, 0.99, 0.1, 0]; ctx.Math.random = () => draws.shift() ?? 0;
    ctx.NextRuntime.reply({}); assert.equal(timers.size, 1, 'separate Bernoulli draw for each member'); ctx.NextRuntime.cancelReplies();
    await ctx.localforage.setItem('SHIKI_NEXT_globalSettingsV1', { myName: 'Me', isDarkMode: true, colorTheme: 'black-white', fontSize: 18 });
    await ctx.localforage.setItem('SHIKI_NEXT_' + group.id + '_chatMessages', ctx.sent);
    await ctx.localforage.setItem('SHIKI_NEXT_' + directB.id + '_draft', 'B draft');
    await ctx.localforage.setItem('SHIKI_NEXT_friend:' + a.id + ':moodCalendar', { '2026-09-26': { partner: 'happy', partnerNote: 'calendar source' } });
    const exported = await ctx.NextBackup.exportData();
    assert.equal(exported.model.friends[0].avatar, null);
    await ctx.NextBackup.importData(exported);
    assert.deepEqual(normalize(ctx.NextModel.snapshot()), normalize(exported.model));
    assert.equal(records.get('SHIKI_NEXT_' + directB.id + '_draft'), 'B draft');
    assert.equal(records.get('SHIKI_NEXT_friend:' + a.id + ':moodCalendar')['2026-09-26'].partnerNote, 'calendar source');
    assert.equal(records.get('SHIKI_NEXT_globalSettingsV1').fontSize, 18);
    assert.equal(ctx.localStorage.getItem('groupChatSettings'), 'OLD GROUP');
    const bad = normalize(exported); bad.records.CHAT_APP_V3_sessionList = [];
    assert.throws(() => ctx.NextBackup.validate(bad)); assert.throws(() => ctx.NextBackup.validate({ type: 'full', indexedDB: {} }));
    const before = normalize([...records]); env.fail('SHIKI_NEXT_globalSettingsV1');
    await assert.rejects(ctx.NextBackup.importData(exported)); assert.deepEqual(normalize([...records]), before);
    assert.ok(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8').includes("name: 'ShikiMessageNextV1'"));
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'); assert.ok(sw.includes('client.url.startsWith(self.registration.scope)'));
    console.log('PASS: storage isolation, persistence, direct deduplication, group relationships, write failure, friend cards, stale reply cancellation, deleted friend, independent reply draws, backup roundtrip/rejection/rollback, SW scope.');
})().catch(error => { console.error(error); process.exitCode = 1; });
