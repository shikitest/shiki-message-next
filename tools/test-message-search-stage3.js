'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/ui/message-search.js'), 'utf8');
const sandbox = { window: {}, console };
vm.runInNewContext(source, sandbox, { filename: 'message-search.js' });
const api = sandbox.window.MessageSearch;
const messages = [
    { id: 1, text: 'before' },
    { id: 2, text: '猫かわいい', translationText: '猫很可爱' },
    { id: 3, text: 'after' },
    { id: 4, text: '', image: 'data:image/png;base64,AA', size: 1024 },
    { id: 5, type: 'video', video: 'blob:video' },
    { id: 6, type: 'voice', audio: 'blob:audio' },
    { id: 7, type: 'file', file: { name: 'note.pdf', type: 'application/pdf', size: 2048 } },
    { id: 8, text: 'https://example.com/video' },
    { id: 9, text: 'plain punctuation ...' }
];

const match = api.searchMessages(messages, 'かわいい', 100)[0];
assert.strictEqual(match.previous.id, 1);
assert.strictEqual(match.next.id, 3);
assert.strictEqual(api.searchMessages(messages, '猫很可爱', 100)[0].field, 'translation');
assert.strictEqual(api.searchMessages(messages, '', 100, 'image').length, 1);
assert.strictEqual(api.searchMessages(messages, '', 100, 'video').length, 1);
assert.strictEqual(api.searchMessages(messages, '', 100, 'audio').length, 1);
assert.strictEqual(api.searchMessages(messages, '', 100, 'file').length, 1);
assert.strictEqual(api.searchMessages(messages, '', 100, 'link').length, 1);
assert.deepStrictEqual(Array.from(api.mediaCategories(messages[8])), []);
const many = Array.from({ length: 140 }, (_, index) => ({ id: index, text: 'result' }));
assert.strictEqual(api.searchMessages(many, 'result', 100).length, 100);
console.log(JSON.stringify({ passed: true, context: true, categories: 5, resultLimit: 100 }, null, 2));
