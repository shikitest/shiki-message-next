/* Isolated browser storage and intercepted OS delivery; no user permission prompts. */
const { chromium } = require('C:/Users/en/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { fork } = require('node:child_process');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const server = fork(path.join(__dirname, 'serve-next.js'), [], { env: { ...process.env, SHIKI_PREVIEW_PORT: '8878' }, silent: true });
let browser;
(async () => {
    await new Promise(resolve => server.stdout.once('data', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8878/shiki-message-next/');
    await page.waitForFunction(() => window.NextNotifications && document.querySelector('.shiki-shell-nav'));
    const ids = await page.evaluate(async () => {
        const a = await NextModel.saveFriend({ name: '提醒 A', cards: ['通知链路真实回复'] }), b = await NextModel.saveFriend({ name: '提醒 B', cards: ['B'] });
        const ca = await NextModel.openDirect(a.id), cb = await NextModel.openDirect(b.id);
        await NextRuntime.sync(); await NextRuntime.open(ca.id);
        settings.replyDelayMin = 30; settings.replyDelayMax = 30; settings.allowReadNoReply = false;
        await NextRuntime.flush();
        Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
        window.__systemCalls = [];
        window.BackgroundSupport = { showNotification: async (title, options) => { window.__systemCalls.push({ title, options }); return true; } };
        return { a: a.id, b: b.id, ca: ca.id, cb: cb.id };
    });
    await page.waitForTimeout(350);
    const message = (id, fid, text, mid) => ({ id: mid, friendId: fid, sender: '角色', text, conversationId: id, timestamp: new Date().toISOString(), type: 'normal' });
    await page.evaluate(message => ShikiAppShell.noteMessageSaved(message), message(ids.ca, ids.a, '当前聊天不弹横幅', 'current'));
    assert.equal(await page.locator('.next-message-notification').count(), 0);
    await page.evaluate(() => ShikiAppShell.showPrimary('conversations'));
    await page.waitForTimeout(350);
    await page.evaluate(() => NextRuntime.reply());
    await page.waitForSelector('.next-message-notification');
    assert.equal(await page.locator('.next-message-notification').getAttribute('data-conversation-id'), ids.ca);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(root, 'outputs/notification-home-390.png') });
    await page.locator('.next-message-notification-open').click();
    await page.waitForFunction(id => SESSION_ID === id && document.body.classList.contains('shiki-chat-view-active'), ids.ca);
    await page.evaluate(async ids => { await NextRuntime.open(ids.cb); document.getElementById('message-input').value = 'B 通知切换草稿'; }, ids);
    await page.waitForTimeout(350);
    const alert = message(ids.ca, ids.a, '<img src=x onerror=alert(1)> 安全预览', 'other-chat');
    await page.evaluate(message => ShikiAppShell.noteMessageSaved(message), alert);
    await page.waitForSelector('.next-message-notification');
    assert.ok((await page.locator('.next-message-notification').innerText()).includes('<img'));
    assert.equal(await page.locator('.next-message-notification img').count(), 1, 'untrusted text does not become markup');
    await page.locator('.next-message-notification-open').click();
    await page.waitForFunction(id => SESSION_ID === id, ids.ca);
    assert.equal(await page.evaluate(id => localforage.getItem(getSessionStorageKey(id, 'draft')), ids.cb), 'B 通知切换草稿');
    await page.waitForTimeout(350);
    await page.evaluate(() => ShikiAppShell.showPrimary('conversations'));
    await page.waitForTimeout(350);
    await page.evaluate(async ids => { settings.muted = true; await ShikiAppShell.noteMessageSaved({ id: 'muted', sender: 'A', friendId: ids.a, conversationId: ids.ca, text: '免打扰' }); settings.muted = false; }, ids);
    assert.equal(await page.locator('.next-message-notification').count(), 0);
    await page.evaluate(async () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await NextNotifications.setSystemEnabled(false);
    });
    await page.evaluate(message => ShikiAppShell.noteMessageSaved(message), message(ids.ca, ids.a, '开关关闭不提醒', 'off'));
    assert.equal(await page.evaluate(() => __systemCalls.length), 0);
    await page.evaluate(async () => { await NextNotifications.setSystemEnabled(true); });
    assert.equal(await page.evaluate(() => NextStorage.local.getItem('notifEnabled')), '1', 'permission and legacy enable flag both saved');
    const background = message(ids.ca, ids.a, '后台系统提醒', 'background');
    await page.evaluate(async message => { await ShikiAppShell.noteMessageSaved(message); await ShikiAppShell.noteMessageSaved(message); }, background);
    await page.waitForFunction(() => __systemCalls.length === 1);
    const system = await page.evaluate(() => __systemCalls[0]);
    assert.equal(system.options.data.conversationId, ids.ca); assert.equal(system.options.data.messageId, 'background');
    await page.evaluate(async () => {
        delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
        NextNotifications.setInAppEnabled(false); ShikiAppShell.showPrimary('conversations');
    });
    await page.waitForTimeout(350);
    await page.evaluate(message => ShikiAppShell.noteMessageSaved(message), message(ids.ca, ids.a, '站内关闭', 'in-app-off'));
    assert.equal(await page.locator('.next-message-notification').count(), 0);
    await page.reload();
    await page.waitForFunction(() => window.NextNotifications && document.querySelector('.shiki-shell-nav'));
    const restored = await page.evaluate(() => NextNotifications.status());
    assert.equal(restored.inApp, false); assert.equal(restored.system, true);
    // The real global settings controls must change the SAME legacy key.
    await page.evaluate(() => ShikiAppShell.showPrimary('settings'));
    await page.locator('[data-next-action="background-settings"]').click();
    await page.getByRole('button', { name: '关闭系统消息通知', exact: true }).click();
    await page.waitForFunction(() => NextStorage.local.getItem('notifEnabled') === '0');
    await page.getByRole('button', { name: '开启系统消息通知', exact: true }).click();
    await page.waitForFunction(() => NextStorage.local.getItem('notifEnabled') === '1');
    await page.getByRole('checkbox', { name: '站内消息提醒', exact: true }).check();
    assert.equal(await page.evaluate(() => NextNotifications.status().inApp), true);
    // Denied system permission never blocks foreground site banners.
    await context.clearPermissions();
    await context.grantPermissions([], { origin: 'http://127.0.0.1:8878' });
    assert.equal(await page.evaluate(() => Notification.permission), 'denied');
    await page.evaluate(message => ShikiAppShell.noteMessageSaved(message), message(ids.ca, ids.a, '系统权限被拒绝仍有站内提醒', 'denied-in-app'));
    await page.waitForSelector('.next-message-notification');
    await page.goto('http://127.0.0.1:8878/shiki-message-next/?shikiNextNotification=' + encodeURIComponent(ids.ca));
    await page.waitForFunction(id => window.NextChatUI?.inspect().route === '/chat/' && SESSION_ID === id, ids.ca);
    assert.ok(!page.url().includes('shikiNextNotification='));
    // Worker target isolation + click routing, without showing real OS notices.
    let click, focused = [], posted = [], opened = [];
    const scope = 'https://example.com/shiki-message-next/';
    const worker = { self: { registration: { scope }, addEventListener: (type, handler) => { if (type === 'notificationclick') click = handler; }, clients: {
        matchAll: async () => [{ url: 'https://example.com/shiki-message/', focus: async () => focused.push('old') }, { url: scope, focus: async () => focused.push('next'), postMessage: data => posted.push(data) }],
        openWindow: async url => opened.push(url)
    } } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), worker);
    let done; click({ notification: { close() {}, data: system.options.data }, waitUntil: task => { done = task; } }); await done;
    assert.deepEqual(focused, ['next']); assert.equal(posted[0].conversationId, ids.ca);
    worker.self.clients.matchAll = async () => []; click({ notification: { close() {}, data: system.options.data }, waitUntil: task => { done = task; } }); await done;
    assert.ok(opened[0].startsWith(scope + '?shikiNextNotification='));
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(root, 'outputs/notifications-result.json'), JSON.stringify({ system, restored, errors, tests: ['real saved reply -> home banner', 'active chat suppressed', 'other chat click + draft', 'text injection safe', 'muted', 'system off/on + legacy key', 'deduplicated', 'in-app off', 'reload persistence', 'notification new-window navigation', 'worker old-site isolation + click target'] }, null, 2));
    console.log('PASS notifications: saved runtime reply, home/other-chat banner, click/draft, mute, permission+enable flag, background OS call interception, duplicate suppression, settings persistence, worker target isolation and startup routing; no uncaught errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.kill(); });
