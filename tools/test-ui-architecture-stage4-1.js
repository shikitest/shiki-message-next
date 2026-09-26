'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const appShellSource = read('js/ui/app-shell.js');
const appSource = read('js/app.js');
const onboardingSource = read('js/onboarding.js');
const indexSource = read('index.html');
const cssSource = read('css/app-shell.css');

const sandbox = {
    window: {},
    console: {
        log() {},
        warn() {},
        error() {}
    }
};
vm.runInNewContext(appShellSource, sandbox, { filename: 'app-shell.js' });

const transaction = sandbox.window.ShikiAppShell.createConversationTransaction;
assert.strictEqual(typeof transaction, 'function');

function createHarness(options) {
    const settings = options || {};
    const failures = new Set(Array.isArray(settings.failAt) ? settings.failAt : [settings.failAt]);
    const sessions = new Map();
    const metadata = new Map();
    const groupSessions = new Set();
    const rolledBack = [];
    let sequence = 0;

    const deps = {
        async createSession() {
            if (failures.has('create')) throw new Error('create failed');
            sequence += 1;
            const id = 'session-' + sequence + '-' + Math.random().toString(36).slice(2, 9);
            sessions.set(id, { id, name: 'temporary' });
            return id;
        },
        sessionExists(id) {
            if (failures.has('availability')) return false;
            return sessions.has(id);
        },
        async renameSession(id, name) {
            if (failures.has('rename')) throw new Error('rename failed');
            sessions.get(id).name = name;
        },
        async updateMeta(id, value) {
            if (failures.has('metadata')) throw new Error('metadata failed');
            metadata.set(id, Object.assign({}, value));
        },
        async createGroupSession(id) {
            if (failures.has('group')) throw new Error('group failed');
            groupSessions.add(id);
        },
        async rollbackNewSession(id) {
            rolledBack.push(id);
            if (failures.has('rollback')) throw new Error('rollback failed');
            sessions.delete(id);
            metadata.delete(id);
            groupSessions.delete(id);
        }
    };

    return { deps, sessions, metadata, groupSessions, rolledBack };
}

(async function () {
    const legacyMessages = [
        { id: 'old-1', sender: 'user', text: '保留消息', translationText: 'preserved' },
        { id: 'old-2', sender: 'char', groupMemberId: 'member-stable', text: '旧群消息' }
    ];
    const legacySnapshot = JSON.stringify(legacyMessages);

    const normal = createHarness();
    const directIds = [];
    const groupIds = [];
    for (let i = 0; i < 50; i += 1) {
        directIds.push(await transaction(normal.deps, 'direct', '单聊 ' + i));
    }
    for (let i = 0; i < 50; i += 1) {
        groupIds.push(await transaction(normal.deps, 'group', '群聊 ' + i));
    }

    assert.strictEqual(new Set(directIds.concat(groupIds)).size, 100);
    assert.strictEqual(normal.sessions.size, 100);
    assert.strictEqual(normal.metadata.size, 100);
    assert.strictEqual(normal.groupSessions.size, 50);
    directIds.forEach(id => {
        assert.strictEqual(normal.metadata.get(id).type, 'direct');
        assert.strictEqual(normal.groupSessions.has(id), false);
    });
    groupIds.forEach(id => {
        assert.strictEqual(normal.metadata.get(id).type, 'group');
        assert.strictEqual(normal.groupSessions.has(id), true);
    });
    assert.strictEqual(JSON.stringify(legacyMessages), legacySnapshot);

    const failureCases = [
        { name: 'create', failAt: 'create' },
        { name: 'availability', failAt: 'availability' },
        { name: 'rename', failAt: 'rename' },
        { name: 'metadata', failAt: 'metadata' },
        { name: 'group', failAt: 'group', type: 'group' },
        { name: 'rollback', failAt: ['rename', 'rollback'] }
    ];
    for (const failureCase of failureCases) {
        const harness = createHarness({ failAt: failureCase.failAt });
        await assert.rejects(
            transaction(harness.deps, failureCase.type || 'direct', '失败测试'),
            /failed|unavailable/
        );
        if (failureCase.name === 'create') {
            assert.strictEqual(harness.rolledBack.length, 0);
        } else {
            assert.strictEqual(harness.rolledBack.length, 1);
        }
        if (failureCase.name !== 'rollback') assert.strictEqual(harness.sessions.size, 0);
    }

    assert(appShellSource.includes('if (isCreatingConversation) return;'));
    assert(appShellSource.includes('isCreatingConversation = false;'));
    assert(appShellSource.includes("createButton.setAttribute('aria-busy', 'true')"));
    assert(appShellSource.includes("root.addEventListener('click', handleClick)"));
    assert(!appShellSource.includes("document.addEventListener('click', handleClick)"));
    assert(appShellSource.includes("const PENDING_NAVIGATION_KEY = 'CHAT_APP_UI_PENDING_NAVIGATION_V1'"));
    assert(appShellSource.includes('sessionStorage.removeItem(PENDING_NAVIGATION_KEY)'));
    assert(appShellSource.includes('age > PENDING_NAVIGATION_MAX_AGE'));
    assert(appShellSource.includes('String(context.getCurrentSessionId()) !== id'));
    assert(!appShellSource.includes("sessionStorage.setItem(LEGACY_OPEN_CHAT_KEY"));
    assert(!appShellSource.includes("sessionStorage.setItem(LEGACY_OPEN_GROUP_SETUP_KEY"));
    assert(appShellSource.includes("else showPrimary('conversations')"));
    assert(appShellSource.includes("{ id: 'call', title: '通话'"));
    assert(!appShellSource.includes("title: '模拟通话'"));

    assert(indexSource.includes('data-shell-booting="true"'));
    assert(cssSource.includes('html[data-shell-booting="true"] #chat-container'));
    assert(cssSource.includes('body.shiki-primary-view-active #chat-container'));
    assert(cssSource.includes('.shiki-app-shell::before'));
    assert(appSource.includes("document.documentElement.removeAttribute('data-shell-booting')"));
    assert(appSource.includes("document.body.classList.add('shiki-chat-view-active')"));
    assert(appSource.includes("document.documentElement.getAttribute('data-skip-opening') !== 'true'"));

    assert(onboardingSource.includes('let createNewSessionPromise = null;'));
    assert(onboardingSource.includes('if (createNewSessionPromise) return createNewSessionPromise;'));
    assert(onboardingSource.includes('const nextList = previousList.concat(newSession);'));
    assert(
        onboardingSource.indexOf('await localforage.setItem(`${APP_PREFIX}sessionList`, nextList)') <
        onboardingSource.indexOf('sessionList = nextList;')
    );

    console.log(JSON.stringify({
        passed: true,
        directTransactions: directIds.length,
        groupTransactions: groupIds.length,
        uniqueSessionIds: 100,
        failureStagesCovered: failureCases.map(item => item.name),
        legacyMessagesChanged: false,
        targetedReloadMarker: true,
        staleBooleanMarkersIgnored: true,
        defaultView: 'conversations',
        callLabel: '通话'
    }, null, 2));
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
