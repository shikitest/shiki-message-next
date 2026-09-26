'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/message-date-search.js'), 'utf8');
const sandbox = { window: { addEventListener() {} }, console };
vm.runInNewContext(source, sandbox, { filename: 'message-date-search.js' });
const api = sandbox.window.MessageDateSearch;

assert(api, 'MessageDateSearch API should exist');
assert.strictEqual(api.buildCalendarMonth(2024, 1).daysInMonth, 29);
assert.strictEqual(api.buildCalendarMonth(2023, 1).daysInMonth, 28);
assert.strictEqual(api.buildCalendarMonth(2026, 3).daysInMonth, 30);
assert.strictEqual(api.buildCalendarMonth(2026, 7).daysInMonth, 31);
assert.strictEqual(api.buildCalendarMonth(2026, 7).firstWeekday, new Date(2026, 7, 1).getDay());

const local = new Date(2026, 8, 3, 0, 30, 0);
assert.strictEqual(api.getLocalDateKey(local.getTime()), '2026-09-03', 'date keys must use local calendar fields');
assert.strictEqual(api.getLocalDateKey('not-a-date'), null);
assert.strictEqual(api.getLocalDateKey(String(local.getTime())), '2026-09-03');
assert.strictEqual(api.getLocalDateKey(Math.floor(local.getTime() / 1000)), '2026-09-03', 'seconds timestamps should be supported');

const messages = [
    { id: 'a', timestamp: new Date(2026, 8, 1, 8).getTime() },
    { id: 'b', timestamp: new Date(2026, 8, 1, 18).toISOString() },
    { id: 'c', createdAt: new Date(2026, 8, 2, 8).getTime() },
    { id: 'bad', timestamp: 'invalid' }
];
const index = api.buildDateIndex(messages);
assert.strictEqual(index['2026-09-01'].count, 2);
assert.strictEqual(index['2026-09-01'].firstMessageId, 'a');
assert.strictEqual(index['2026-09-01'].lastMessageId, 'b');
assert.strictEqual(index['2026-09-02'].count, 1);
assert.strictEqual(index.invalidCount, 1);
assert.strictEqual(Object.prototype.hasOwnProperty.call(messages[0], 'dateKey'), false, 'index must not mutate messages');

const large = Array.from({ length: 5000 }, (_, i) => ({ id: i, timestamp: Date.now() - i * 3600000 }));
const started = performance.now();
const largeIndex = api.buildDateIndex(large);
const elapsed = performance.now() - started;
assert(Object.keys(largeIndex).length > 1);
assert(elapsed < 1000, '5000-message date index should stay lightweight');

const veryLarge = Array.from({ length: 20000 }, (_, i) => ({ id: 'large-' + i, timestamp: Date.now() - i * 1800000 }));
const veryLargeStarted = performance.now();
const veryLargeIndex = api.buildDateIndex(veryLarge);
const veryLargeElapsed = performance.now() - veryLargeStarted;
assert(Object.keys(veryLargeIndex).length > 1);
assert(veryLargeElapsed < 2000, '20000-message date index should stay lightweight');

console.log(JSON.stringify({ passed: true, messages: veryLarge.length, dateIndexMs: Number(veryLargeElapsed.toFixed(2)), indexedDays: Object.keys(veryLargeIndex).length }, null, 2));
