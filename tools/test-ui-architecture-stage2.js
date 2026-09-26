'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');
const app = read('js/app.js');
const core = read('js/core.js');
const utils = read('js/utils.js');
const shell = read('js/ui/app-shell.js');
const searchSource = read('js/ui/message-search.js');
const dateSource = read('js/ui/message-date-search.js');
const detail = read('js/ui/chat-detail.js');
const css = read('css/app-shell.css');

[
    'js/ui/conversation-avatar-store.js',
    'js/ui/message-date-search.js',
    'js/ui/message-search.js',
    'js/ui/chat-detail.js'
].forEach(file => assert(index.includes(file), file + ' must be loaded'));
assert(index.indexOf('message-date-search.js') < index.indexOf('message-search.js'));
assert(index.indexOf('chat-detail.js') < index.indexOf('app-shell.js'));
assert(app.includes('getMessages: () => Array.isArray(messages) ? messages.slice() : []'));
assert(app.includes('renderMessagesAround(messageId, 60)'));
assert(!app.includes('displayedMessageCount = messages.length'), 'message location must not render the entire history');
assert(core.includes('window.ShikiAppShell.noteMessageSaved(message)'));
assert(core.includes('throttledSaveData(saveResult =>'), 'summary hook must wait for the existing save path');
assert(utils.includes('maybePromise.then(result =>'), 'save callbacks must run only after persistence succeeds');
assert(core.includes("saveResult.failed.includes('chatMessages')"), 'summary must not update when message persistence failed');
assert(shell.includes('lastMessagePreview: summary.text'));
assert(shell.includes('global.MessageDateSearch.initialize'));
assert(shell.includes('global.MessageSearch.initialize'));
assert(shell.includes('global.ChatDetail.initialize'));
assert(detail.includes("row('date', 'fa-calendar-days', '按日期查找')"));
assert(detail.includes("row('search', 'fa-search', '查找聊天内容')"));
assert(css.includes('.shiki-calendar-grid'));
assert(css.includes('.shiki-chat-topbar'));

const sandbox = { window: {}, console };
vm.runInNewContext(searchSource, sandbox, { filename: 'message-search.js' });
const search = sandbox.window.MessageSearch.searchMessages;
const messages = [
    { id: 1, sender: 'user', text: '今天下雨了', translationText: '' },
    { id: 2, sender: 'partner', text: '猫かわいい', translationText: '猫很可爱' },
    { id: 3, sender: 'partner', text: 'ABC 123', translationText: '' },
    { id: 4, sender: 'partner', text: '', type: 'audio' }
];
assert.strictEqual(search(messages, '下雨', 100).length, 1);
assert.strictEqual(search(messages, 'かわいい', 100).length, 1);
assert.strictEqual(search(messages, '猫很可爱', 100)[0].field, 'translation');
assert.strictEqual(search(messages, 'abc', 100).length, 1);
assert.strictEqual(search(messages, '123', 100).length, 1);
assert.strictEqual(search(messages, '音频', 100).length, 1);
assert.strictEqual(search(messages, '', 100).length, 0);

const forbidden = searchSource + dateSource + detail;
assert(!forbidden.includes('RandomIME.generate'));
assert(!forbidden.includes('RollingMessageScheduler'));
assert(!forbidden.includes('requestForMessage'));
assert(!forbidden.includes('localforage.setItem') || detail.includes('ConversationMetaStore.update'));

console.log(JSON.stringify({ passed: true, textSearchCases: 7, sharedLocateInterface: true, legacyMessageMutation: 0, replyGeneratorCalls: 0 }, null, 2));
