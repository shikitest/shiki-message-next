'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sandbox = {
    window: { URL: { createObjectURL() { return ''; }, revokeObjectURL() {} } },
    console, setTimeout, clearTimeout
};
vm.runInNewContext(read('js/ui/watch-danmaku.js'), sandbox, { filename: 'watch-danmaku.js' });
vm.runInNewContext(read('js/ui/watch-together.js'), sandbox, { filename: 'watch-together.js' });

const senders = sandbox.window.WatchTogether.createSenderOptions({
    getMyName: () => '我自己',
    getGroupMembers: () => [{ id: 'stable-a', name: '小花' }, { id: 'stable-b', name: '小花' }]
});
assert.deepStrictEqual(Array.from(senders, item => item.value), ['user', 'member:stable-a', 'member:stable-b']);
assert.strictEqual(senders[0].senderType, 'user');
assert.strictEqual(senders[1].senderType, 'partner');
assert.strictEqual(senders[1].memberId, 'stable-a');
assert.strictEqual(senders[2].memberId, 'stable-b');
const direct = sandbox.window.WatchTogether.createSenderOptions({
    getMyName: () => '我', getPartnerName: () => '角色', getGroupMembers: () => []
});
assert.strictEqual(direct[1].senderName, '角色');
assert.strictEqual(direct[1].memberId, null);

const shown = [];
const timeline = sandbox.window.WatchDanmaku.createTimeline(message => shown.push(message.id));
const entries = [
    { id: 'one', text: '你好', playbackTime: 5 },
    { id: 'two', text: '哇', playbackTime: 6 }
];
timeline.setMessages(entries, true);
timeline.tick(4);
timeline.tick(5.1);
timeline.tick(5.4);
assert.deepStrictEqual(shown, ['one'], 'normal playback must display once');
timeline.tick(6.2);
assert.deepStrictEqual(shown, ['one', 'two']);
timeline.seek(5);
assert.deepStrictEqual(shown, ['one', 'two', 'one'], 'seeking back may replay nearby comments');
timeline.tick(5.3);
assert.strictEqual(shown.length, 3, 'same playback pass must not duplicate');
timeline.seek(0);
timeline.tick(4.5);
timeline.tick(5.2);
assert.deepStrictEqual(shown, ['one', 'two', 'one', 'one'], 'replay may show comment again');
timeline.immediate({ id: 'manual', text: '现场评论', playbackTime: 5.2 });
timeline.immediate({ id: 'manual', text: '现场评论', playbackTime: 5.2 });
assert.strictEqual(shown.filter(id => id === 'manual').length, 1);
const startShown = [];
const startTimeline = sandbox.window.WatchDanmaku.createTimeline(message => startShown.push(message.id));
startTimeline.setMessages([{ id: 'at-start', text: '开场', playbackTime: 0 }], true);
startTimeline.tick(0.2);
startTimeline.tick(0.4);
assert.deepStrictEqual(startShown, ['at-start'], 'start-time comments display once');
startTimeline.seek(0);
assert.deepStrictEqual(startShown, ['at-start', 'at-start'], 'rewinding to start replays comments');

function fakeNode() {
    return {
        children: [], classList: { toggle() {}, add() {}, remove() {} },
        style: { setProperty() {} }, addEventListener() {},
        appendChild(child) { child.parent = this; this.children.push(child); },
        remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); },
        replaceChildren() { this.children = []; },
        get childElementCount() { return this.children.length; },
        get firstElementChild() { return this.children[0]; }
    };
}
sandbox.document = { createElement: () => fakeNode() };
const layer = fakeNode();
const video = { currentTime: 0, paused: false, ended: false };
const overlay = sandbox.window.WatchDanmaku.attach(layer, video);
for (let i = 0; i < 20; i += 1) {
    overlay.immediate({ id: 'overlay-' + i, senderName: '角色', text: '字'.repeat(120) });
}
assert.strictEqual(layer.childElementCount, 6, 'visible danmaku must be capped');
assert(Array.from(layer.firstElementChild.textContent).length <= 83, 'long comments must be clipped only in overlay');
overlay.pause();
overlay.play();
overlay.clear();
assert.strictEqual(layer.childElementCount, 0, 'close/switch must clear overlay DOM');

const storeSandbox = { window: { APP_PREFIX: 'CHAT_APP_V3_', localforage: {
    async getItem() { return null; }, async setItem(key, value) { return value; }, async removeItem() {}
} } };
vm.runInNewContext(read('js/ui/watch-together-store.js'), storeSandbox);
(async function () {
    const saved = await storeSandbox.window.WatchTogetherStore.saveMessages('group-1', [{
        id: 'comment-1', senderType: 'partner', memberId: 'stable-a',
        senderName: '小花', text: '这里真好', playbackTime: 13.5
    }]);
    assert.strictEqual(saved[0].memberId, 'stable-a');
    assert.strictEqual(saved[0].playbackTime, 13.5);
    const html = read('index.html');
    const ui = read('js/ui/watch-together.js');
    const css = read('css/watch-danmaku.css');
    assert(html.indexOf('watch-danmaku.js') < html.indexOf('watch-together.js'));
    assert(ui.includes('danmaku.tick()') && ui.includes('danmaku.seek()'));
    assert(ui.includes('danmaku.immediate(message)'));
    assert(ui.includes('danmaku.clear()'));
    assert(css.includes('pointer-events:none'));
    assert(css.includes('inset:4% 0 30%'));
    console.log(JSON.stringify({ passed: true, groupRoles: 2, directRole: true,
        savedMemberId: saved[0].memberId, playbackTime: saved[0].playbackTime,
        immediate: true, seekReplay: true, duplicateGuard: true, controlsUnblocked: true,
        visibleCap: 6, overlayCleanup: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
