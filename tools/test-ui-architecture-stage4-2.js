'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const shell = read('js/ui/app-shell.js');
const detail = read('js/ui/chat-detail.js');
const avatars = read('js/ui/conversation-avatar-store.js');
const dates = read('js/ui/message-date-search.js');
const app = read('js/app.js');
const core = read('js/core.js');
const data = read('js/data.js');
const backup = read('js/backup-engine.js');
const css = read('css/app-shell.css');

assert(shell.includes('const conversationRowCache = new Map()'), 'conversation rows must be keyed and reused');
assert(shell.includes('avatarRenderVersion'), 'avatar loads need stale-result protection');
assert(shell.includes('avatar.dataset.avatarKey === avatarKey'), 'unchanged avatars must not be reloaded');
assert(detail.includes('refreshVersion'), 'chat detail avatar refreshes need stale-result protection');
assert(avatars.includes('const pendingUrls = new Map()'), 'concurrent avatar reads must be deduplicated');

const settingTargets = Array.from(shell.matchAll(/target:\s*'([^']+)'\s*,\s*scope:/g), match => match[1]);
assert(settingTargets.length >= 7, 'settings registry should expose scoped entries');
assert.strictEqual(new Set(settingTargets).size, settingTargets.length, 'top-level settings targets must be unique');

assert(css.includes('background: var(--shell-surface, #fff)'), 'watch overlay needs an opaque fallback');
assert(!css.includes('.shiki-watch-page { overflow-y:auto; background:var(--shell-bg); }'));

const statsStart = data.indexOf('function updateStats()');
const statsEnd = data.indexOf('function syncToggles()', statsStart);
const usageStart = data.indexOf('function updateStorageUsageBar()');
const usageEnd = data.indexOf('(function() {', usageStart);
const statsCode = data.slice(statsStart, statsEnd) + data.slice(usageStart, usageEnd);
assert(statsCode.includes('navigator.storage.estimate'));
assert(!statsCode.includes('localforage.keys()'), 'opening data settings must not scan all IndexedDB keys');
assert(!statsCode.includes('JSON.stringify'), 'opening data settings must not serialize stored values');

assert(backup.includes("key.indexOf('localMusicMedia:') !== -1"));
assert(backup.includes("key.indexOf('conversationAvatarMediaV1:') !== -1"));
assert(backup.includes("key.indexOf('sessionGroupAvatarV1:') !== -1"));

assert(core.includes('const _sessionSaveQueues = new Map()'));
assert(core.includes('const targetSessionId = String(sessionIdOverride || SESSION_ID || \'\')'));
assert(core.includes("localforage.setItem(sessionKey('chatSettings')"));
assert(core.includes('window.flushPendingSessionSaves'));
assert(core.includes("_BACKUP_PREFIX + 'critical:' + sessionId"), 'emergency journal must be session scoped');

assert(app.includes('renderMessagesAround(messageId, 60)'));
assert(!app.includes('displayedMessageCount = messages.length'));
assert(core.includes('function renderMessagesAround(messageId, radius = 60)'));
assert(core.includes('index + safeRadius + 1'));
assert(dates.includes('minimumMonth'));
assert(dates.includes('maximumMonth'));
assert(dates.includes('type="month"'));

assert(!shell.includes('RandomIME.generate()'));
assert(!shell.includes('requestForMessage'));
assert(!shell.includes('RollingMessageScheduler'));

console.log(JSON.stringify({
    passed: true,
    avatarStaleLoadGuard: true,
    keyedConversationRows: true,
    uniqueSettingsTargets: settingTargets.length,
    storageEstimateWithoutFullScan: true,
    sessionSaveQueue: true,
    sessionScopedEmergencyJournal: true,
    boundedMessageLocation: 121,
    boundedMonthNavigation: true,
    mediaBlobIsolation: true,
    semanticInputs: 0
}, null, 2));
