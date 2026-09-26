'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/session-runtime-store.js'), 'utf8');
const sandbox = { window: {}, console: console, Promise: Promise, setTimeout: setTimeout };
vm.runInNewContext(source, sandbox, { filename: 'session-runtime-store.js' });

const store = sandbox.window.SessionRuntimeStore;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async function () {
    assert.strictEqual(store.getSettingScope('textGenerationMode'), 'conversation');
    assert.strictEqual(store.getSettingScope('replyDelayMin'), 'conversation');
    assert.strictEqual(store.getSettingScope('showPartnerMessageTranslation'), 'conversation');
    assert.strictEqual(store.getSettingScope('customThemes'), 'global');
    assert.strictEqual(store.getSettingScope('customSongs'), 'global');

    const first = store.load('slow-a', async () => { await delay(8); return 'A'; });
    const second = store.load('fast-b', async () => { await delay(1); return 'B'; });
    const initial = await Promise.all([first, second]);
    assert.strictEqual(initial[0].stale, true, 'older load must be discarded');
    assert.strictEqual(initial[1].stale, false);
    assert.strictEqual(store.activate('fast-b', undefined, initial[1].token), true);

    let staleTransitions = 0;
    for (let round = 0; round < 100; round += 1) {
        const targets = ['A', 'B', 'C', 'A'];
        const transitions = targets.map(function (target, index) {
            return store.runTransition(target, {
                load: async function () {
                    await delay((round + index) % 3);
                    return { target: target, round: round };
                },
                apply: async function (value, id) {
                    assert.strictEqual(value.target, id);
                }
            });
        });
        const results = await Promise.all(transitions);
        staleTransitions += results.filter(result => result.stale).length;
        assert.strictEqual(store.getActiveSessionId(), 'A');
    }

    const writes = [];
    await store.save('session-a', async id => { writes.push(id + ':settings'); });
    await store.save('session-b', async id => { writes.push(id + ':settings'); });
    assert.deepStrictEqual(writes, ['session-a:settings', 'session-b:settings']);

    let failureCaught = false;
    try { await store.save('session-a', async () => { throw new Error('simulated failure'); }); }
    catch (error) { failureCaught = error.message === 'simulated failure'; }
    assert.strictEqual(failureCaught, true, 'save failures must remain observable');

    console.log(JSON.stringify({
        passed: true,
        rapidSwitchRounds: 100,
        staleTransitions: staleTransitions,
        finalSession: store.getActiveSessionId(),
        explicitSessionWrites: writes.length,
        saveFailureObserved: failureCaught,
        semanticInputs: 0
    }, null, 2));
})().catch(function (error) { console.error(error); process.exitCode = 1; });
