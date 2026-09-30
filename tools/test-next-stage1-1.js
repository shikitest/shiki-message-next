const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, 'js', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function main() {
    const data = new Map(), timers = new Map(), loads = [], rendered = [], writes = [];
    let tid = 0, readGate = null, failSave = false, failLoad = false;
    const input = { value: '', addEventListener() {} }, classes = new Set();
    const ctx = { console, Date, Event, crypto: { randomUUID }, Math: Object.create(Math),
        document: { hidden: false, addEventListener() {}, getElementById: id => id === 'message-input' ? input : null, body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } } },
        addEventListener() {}, dispatchEvent() {}, setTimeout: (fn, delay) => { const id = ++tid; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
        APP_PREFIX: 'SHIKI_NEXT_', SESSION_ID: 'next-home', settings: {}, sessionList: [], messages: [], customReplies: [], savedBackgrounds: [], groupChatSettings: {}, partnerPersonas: [],
        currentReplyTo: null, batchMessages: [], isBatchMode: false, isLoadingHistory: false, displayedMessageCount: 20, HISTORY_BATCH_SIZE: 20, _activeGroupSessionId: null, _activeGroupSessionScoped: false,
        DOMElements: { messageInput: input, chatContainer: { scrollTop: 0 }, partner: {} },
        localforage: { async getItem(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async setItem(k, v) { if (failSave) { failSave = false; throw new Error('write failed'); } data.set(k, structuredClone(v)); writes.push(k); }, async keys() { return [...data.keys()]; }, async removeItem(k) { data.delete(k); } },
        NextStorage: { local: { getItem() { return null; }, setItem() {} } },
        ConversationMetaStore: { async load() {}, get() { return { type: 'direct' }; }, async update() {} },
        getSessionStorageKey: (id, key) => 'SHIKI_NEXT_' + id + '_' + key,
        updateUI() {}, updateReplyPreview() {}, playSound() {}, showNotification() {}, _updateReadReceiptsDOM() {}, throttledSaveData() {},
        flushThrottledSaveData: async () => [], saveData: async id => { writes.push('save:' + id); return { failed: [] }; },
        ShikiAppShell: { showChat() { rendered.push(ctx.SESSION_ID); } }, renderMessages() {},
        history: { replaceState() {} }, addMessage: msg => ctx.sent.push(msg), sent: [],
        formatDateStr: date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
        MOOD_OPTIONS: [{ key: 'happy', label: '开心', kaomoji: '😊' }, { key: 'busy', label: '忙碌', kaomoji: '😵‍💫' }]
    };
    ctx.window = ctx; vm.createContext(ctx);
    const core = source('core.js');
    vm.runInContext(core.slice(core.indexOf('function getDefaultSettings()'), core.indexOf('function renderBackgroundGallery()')), ctx);
    vm.runInContext(core.slice(core.indexOf('function normalizeTextGenerationMode('), core.indexOf('window.chooseReplyText =')), ctx);
    for (const file of ['next-model.js', 'next-runtime.js', 'next-mood.js']) vm.runInContext(source(file), ctx);
    const a = await ctx.NextModel.saveFriend({ name: 'A', cards: ['A CARD'], replyProbability: 0.23 });
    const b = await ctx.NextModel.saveFriend({ name: 'B', cards: ['B CARD'] });
    const da = await ctx.NextModel.openDirect(a.id), db = await ctx.NextModel.openDirect(b.id), group = await ctx.NextModel.createGroup('G', [a.id, b.id]);
    const today = ctx.NextMood.today();
    await ctx.localforage.setItem(ctx.getSessionStorageKey(da.id, 'moodCalendar'), { [today]: { partner: 'happy', partnerNote: 'original note' } });
    await ctx.localforage.setItem(ctx.NextMood.key(b.id), { [today]: { partner: 'busy' } });
    await ctx.NextMood.refresh();
    assert.equal(ctx.NextMood.status(a.id), '😊 开心'); assert.equal(ctx.NextMood.status(b.id), '😵‍💫 忙碌');
    assert.equal(data.get(ctx.NextMood.key(a.id))[today].partnerNote, 'original note');
    assert.ok(data.has(ctx.getSessionStorageKey(da.id, 'moodCalendar')), 'original calendar retained');
    const noRecord = await ctx.NextModel.saveFriend({ name: 'C', cards: [] });
    await ctx.NextMood.refresh(); assert.equal(ctx.NextMood.status(noRecord.id), '暂无心情状态');
    assert.equal(data.has(ctx.NextMood.key(noRecord.id)), false, 'no randomly fabricated record');
    const probabilities = ctx.NextRuntime.replyPreferences(a);
    assert.equal(probabilities.replyDelayMin, 3000); assert.equal(probabilities.replyDelayMax, 7000);
    assert.equal(probabilities.readNoReplyChance, 0.2); assert.equal(probabilities.allowReadNoReply, false);
    ctx.settings.replyDelayMin = 9999;
    assert.equal(ctx.NextRuntime.replyPreferences(b).replyDelayMin, 3000, 'current conversation cannot leak preferences into another friend');
    assert.equal(ctx.NextModel.friend(a.id).replyProbability, 0.23, 'saved preview value preserved but not enabled');
    const cases = [{ draws: [.99,.99,.1,0], count: 1 }, { draws: [.99,.99,.8,.9,0,0], count: 2 }, { draws: [.99,.99,.8,.99,0,0,0], count: 3 }];
    ctx.SESSION_ID = da.id;
    for (const test of cases) {
        timers.clear(); const random = [...test.draws]; ctx.Math.random = () => random.shift() ?? 0;
        ctx.NextRuntime.reply({}); assert.equal(timers.size, test.count, 'original nested reply count distribution'); ctx.NextRuntime.cancelReplies();
    }
    ctx.RandomIME = { generate: () => ({ text: 'IME ONLY' }) };
    ctx.Math.random = () => 0;
    assert.equal(ctx.chooseReplyText(['A CARD'], { textGenerationMode: 'card' }).text, 'A CARD');
    assert.equal(ctx.chooseReplyText([], { textGenerationMode: 'ime' }).text, 'IME ONLY');
    assert.equal(ctx.chooseReplyText(['A CARD'], { textGenerationMode: 'mixed' }).source, 'card');
    ctx.Math.random = () => .9; assert.equal(ctx.chooseReplyText(['A CARD'], { textGenerationMode: 'mixed' }).source, 'ime');
    await ctx.NextRuntime.saveGlobals({ myName: 'Me', myStatus: '在休息', colorTheme: 'black-white' });
    await ctx.localforage.setItem(ctx.getSessionStorageKey(db.id, 'draft'), 'B DRAFT');
    await ctx.localforage.setItem(ctx.getSessionStorageKey(group.id, 'draft'), 'G DRAFT');
    ctx.loadData = async () => { const id = ctx.SESSION_ID; loads.push(id); if (readGate) { const wait = readGate; readGate = null; await wait; } if (failLoad) { failLoad = false; return false; } ctx.messages = [{ id, text: id }]; ctx.settings = ctx.getDefaultSettings(); return true; };
    input.value = 'A DRAFT';
    let release; readGate = new Promise(resolve => { release = resolve; });
    const pending = ctx.NextRuntime.open(db.id);
    for (let i = 0; i < 20 && !loads.length; i++) await Promise.resolve();
    const latest = ctx.NextRuntime.open(group.id); release(); await Promise.all([pending, latest]);
    assert.equal(ctx.SESSION_ID, group.id); assert.equal(input.value, 'G DRAFT');
    assert.deepEqual(rendered, [group.id], 'only final target becomes visible');
    assert.equal(data.get(ctx.getSessionStorageKey(da.id, 'draft')), 'A DRAFT');
    assert.equal(ctx.settings.myStatus, '在休息'); assert.equal(ctx.settings.colorTheme, 'black-white');
    await ctx.NextRuntime.open(da.id); assert.equal(input.value, 'A DRAFT');
    failLoad = true; const oldMessages = ctx.messages; await assert.rejects(ctx.NextRuntime.open(db.id));
    assert.equal(ctx.SESSION_ID, da.id); assert.equal(ctx.messages, oldMessages); assert.equal(input.value, 'A DRAFT'); assert.equal(classes.has('next-switching'), false);
    const before = plain(ctx.NextModel.snapshot()); failSave = true;
    await assert.rejects(ctx.NextModel.saveFriend({ id: a.id, name: 'broken' })); assert.deepEqual(plain(ctx.NextModel.snapshot()), before);
    const ui = source('next-ui.js'), runtime = source('next-runtime.js');
    assert.ok(!ui.includes("f.cards.length + ' 张字卡'")); assert.ok(ui.includes("button('发消息', 'chat'")); assert.ok(ui.includes("button('设定', 'friend-settings'"));
    assert.ok(!runtime.includes('location.reload')); assert.ok(runtime.includes('switchGeneration'));
    console.log('PASS Stage 1.1: original reply counts/delays/modes; preserved preferences; independent friend calendar mapping and empty status; latest-wins in-page switch, drafts, global user status, failed-load rollback, failed-write protection, profile layering.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
