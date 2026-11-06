/* Isolated browser data only. F7 route + trusted CDP touch regression. */
const { chromium } = require('C:/Users/en/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { fork } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/f7-rounds');
fs.mkdirSync(output, { recursive: true });
const server = fork(path.join(__dirname, 'serve-next.js'), [], { env: { ...process.env, SHIKI_PREVIEW_PORT: '8875' }, silent: true });
let browser, context, stopRecording;
// Native browser MediaRecorder encodes the actual CDP screen frames. This
// avoids installing ffmpeg or filming a reconstructed/mock animation.
async function recordScreen(context, page) {
    const recorder = await context.newPage();
    await recorder.setContent('<canvas width="390" height="844"></canvas>');
    await recorder.evaluate(() => {
        const canvas = document.querySelector('canvas');
        window.framesContext = canvas.getContext('2d');
        window.chunks = [];
        window.recorder = new MediaRecorder(canvas.captureStream(20), { mimeType: 'video/webm;codecs=vp8' });
        window.recorder.ondataavailable = event => { if (event.data.size) window.chunks.push(event.data); };
        window.recorder.start(200);
    });
    await page.bringToFront();
    const screen = await context.newCDPSession(page);
    let busy = false, pending = Promise.resolve();
    screen.on('Page.screencastFrame', event => {
        screen.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
        if (busy) return;
        busy = true;
        pending = recorder.evaluate(async data => {
            const image = new Image();
            await new Promise(resolve => { image.onload = resolve; image.src = 'data:image/jpeg;base64,' + data; });
            window.framesContext.drawImage(image, 0, 0, 390, 844);
        }, event.data).finally(() => { busy = false; });
    });
    await screen.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
    return async () => {
        await screen.send('Page.stopScreencast'); await pending;
        const bytes = await recorder.evaluate(async () => {
            await new Promise(resolve => { window.recorder.onstop = resolve; window.recorder.stop(); });
            return Array.from(new Uint8Array(await new Blob(window.chunks, { type: 'video/webm' }).arrayBuffer()));
        });
        fs.writeFileSync(path.join(output, 'interaction-390.webm'), Buffer.from(bytes));
        await recorder.close();
    };
}
(async () => {
    await new Promise(resolve => server.stdout.once('data', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8875/shiki-message-next/');
    await page.waitForFunction(() => window.NextChatUI?.inspect().ready);
    stopRecording = await recordScreen(context, page);
    const ids = await page.evaluate(async () => {
        const a = await NextModel.saveFriend({ name: '测试好友 A', cards: ['这是同一轮的回复'] });
        const b = await NextModel.saveFriend({ name: '测试好友 B', cards: ['B 的独立字卡'] });
        const ca = await NextModel.openDirect(a.id), cb = await NextModel.openDirect(b.id);
        await NextRuntime.sync(); await NextRuntime.open(ca.id);
        settings.replyDelayMin = 250; settings.replyDelayMax = 400;
        settings.typingIndicatorEnabled = true; settings.fontSize = 18;
        settings.customBubbleCss = '.message-sent { background-color: rgb(222, 234, 222) !important; color: rgb(29, 51, 29) !important; }';
        applyCustomBubbleCss(settings.customBubbleCss); updateUI(); await NextRuntime.flush();
        return { ca: ca.id, cb: cb.id };
    });
    await page.waitForTimeout(350);
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('第一条消息');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('等待期间补充，不取消前一条回复');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(output, 'chat-390.png') });
    const state = await page.evaluate(() => {
        const message = document.querySelector('.message-sent');
        return { ui: NextChatUI.inspect(), label: document.getElementById('typing-indicator-label').textContent,
            background: getComputedStyle(message).backgroundColor, font: getComputedStyle(message).fontSize,
            originalBubbleMarkup: !message.querySelector('.message-bubble'),
            animation: getComputedStyle(document.querySelector('.message-wrapper')).animationName,
            overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(state.ui.route, '/chat/'); assert.ok(state.originalBubbleMarkup); assert.equal(state.background, 'rgb(222, 234, 222)');
    assert.equal(state.font, '18px'); assert.equal(state.overflow, false);
    assert.ok(!state.label.includes('A、测试好友 A'));
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('A 的草稿');
    await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
    await page.waitForFunction(() => NextChatUI.inspect().route === '/' && document.body.classList.contains('shiki-primary-view-active'));
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('message-input'))), 'parked chat retains reachable IDs');
    assert.equal(await page.evaluate(() => document.getElementById('shiki-app-shell').inert), false, 'home stays interactive after back');
    await page.waitForTimeout(1200);
    await page.evaluate(async ids => { await NextRuntime.open(ids.cb); settings.fontSize = 14; settings.customBubbleCss = ''; applyCustomBubbleCss(''); updateUI(); await NextRuntime.flush(); }, ids);
    await page.waitForTimeout(330);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 6, y: 340 }] });
    for (const x of [30, 70, 130, 210, 290, 355]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: 340 }] });
        await page.waitForTimeout(22);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => NextChatUI.inspect().route === '/' && document.body.classList.contains('shiki-primary-view-active'), { timeout: 4000 });
    await page.evaluate(async ids => NextRuntime.open(ids.ca), ids);
    await page.waitForTimeout(350);
    const restored = await page.evaluate(() => ({ draft: document.getElementById('message-input').value, font: settings.fontSize,
        cards: messages.filter(m => m.sender !== 'user').map(m => m.text), background: getComputedStyle(document.querySelector('.message-sent')).backgroundColor }));
    assert.equal(restored.draft, 'A 的草稿'); assert.equal(restored.font, 18); assert.equal(restored.background, 'rgb(222, 234, 222)');
    assert.ok(restored.cards.length > 0);
    await page.evaluate(() => { ShikiAppShell.showPrimary('conversations'); ShikiAppShell.showChat(); });
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => NextChatUI.inspect().route), '/chat/', 'last presentation intent wins during transition');
    await page.screenshot({ path: path.join(output, 'restored-390.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '返回会话列表', exact: true }).tap();
    await page.waitForFunction(() => document.body.classList.contains('shiki-primary-view-active'), null, { timeout: 4000 });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ state, restored, trustedEdgeSwipe: 'passed', reducedMotion: 'passed', errors }, null, 2));
    console.log('PASS F7 navigation/motion + original bubbles/per-chat skin, back, trusted edge swipe, persistent DOM, background reply, draft restore, reduced motion, 390x844 overflow and uncaught errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await stopRecording?.(); await context?.close(); await browser?.close(); server.kill(); });
