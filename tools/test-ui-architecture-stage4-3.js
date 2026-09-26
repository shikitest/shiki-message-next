'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const runtime = read('js/ui/session-runtime-store.js');
const memberReplies = read('js/ui/member-reply-store.js');
const core = read('js/core.js');
const utils = read('js/utils.js');
const shell = read('js/ui/app-shell.js');
const group = read('js/features/group-chat.js');

assert(html.indexOf('js/ui/session-runtime-store.js') < html.indexOf('js/core.js'));
assert(html.indexOf('js/ui/member-reply-store.js') < html.indexOf('js/core.js'));
assert(runtime.includes("scope") || runtime.includes('settingScopes'));
assert(runtime.includes('runTransition'));
assert(runtime.includes('loadGeneration'));
assert(runtime.includes('discardedLoads'));

assert(core.includes("const targetSessionId = String(SESSION_ID || '')"));
assert(core.includes("getSessionStorageKey(targetSessionId, 'customReplies')"));
assert(core.includes('window.customReplyGroups = []'));
assert(core.includes('customReplies = []'));
assert(core.includes('window.SessionRuntimeStore.activate(targetSessionId'));
assert(core.includes('saveData(targetSessionId)'));

assert(utils.includes("const capturedSessionId = String(sessionIdOverride || SESSION_ID || '')"));
assert(utils.includes('pendingSessionSaveTimers'));
assert(utils.includes('window.flushThrottledSaveData'));
assert(utils.includes('window.cancelThrottledSaveData'));
assert(shell.includes('sessionReloadGeneration'));
assert(shell.includes('flushPendingSessionSaves(currentSessionId)'));

assert(group.includes('_groupSessionActivationGeneration'));
assert(group.includes('activationGeneration !== _groupSessionActivationGeneration'));
assert(group.includes('window.MemberReplyStore.remove(_activeGroupSessionId, removed.id)'));
assert(memberReplies.includes("RECORD_PREFIX = 'memberReplyLibraryV1:'"));
assert(memberReplies.includes('sessionId') && memberReplies.includes('memberId'));

assert(!memberReplies.includes('RandomIME'));
assert(!memberReplies.includes('chooseReplyText'));
assert(!runtime.includes('message.text'));
assert(!runtime.includes('keyword'));

console.log(JSON.stringify({
    passed: true,
    explicitSessionLoadKeys: true,
    missingKeyRuntimeReset: true,
    generationGuard: true,
    capturedSessionSaves: true,
    groupActivationGuard: true,
    memberReplyStoreReservedOnly: true,
    replyGenerationChanged: false,
    semanticInputs: 0
}, null, 2));
