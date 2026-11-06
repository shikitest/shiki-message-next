/* Compare pre-change HEAD and working tree using synthetic, isolated data. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('C:/Users/en/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), root = path.resolve(__dirname, '..');
const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/);
const baseline = new Map(changed.map(file => [file, execFileSync('git', ['show', 'HEAD:' + file], { cwd: root })]));
const servers = [];
async function serve(port, before) {
    const server = http.createServer((request, response) => {
        let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/shiki-message-next\//, '');
        if (!relative) relative = 'index.html';
        const file = path.resolve(root, relative);
        if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
        const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(file)];
        if (type) response.setHeader('Content-Type', type + '; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (before && baseline.has(relative)) response.end(baseline.get(relative));
        else fs.readFile(file, (error, content) => { if (error) response.writeHead(404).end(); else response.end(content); });
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); servers.push(server);
}
(async () => {
    await serve(8891, true); await serve(8892, false);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const results = [];
    try {
        for (const port of [8891, 8892]) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
            const page = await context.newPage();
            await page.goto('http://127.0.0.1:' + port + '/shiki-message-next/');
            await page.waitForFunction(() => window.NextUI && document.querySelector('.shiki-shell-nav'));
            await page.evaluate(async () => {
                const friend = await NextModel.saveFriend({ name: '测量角色', cards: ['测试'] }), conversation = await NextModel.openDirect(friend.id);
                await NextRuntime.sync(); await NextRuntime.open(conversation.id);
                settings.fontSize = 18; settings.messageFontFamily = 'Arial, sans-serif'; settings.messageLineHeight = 1.5;
                updateUI();
                const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="40" fill="gold"/></svg>');
                for (const data of [{ sender: 'user', text: '短消息' }, { sender: '测量角色', text: '收到你的消息了' }, { sender: 'user', text: '这是一段用于检查换行后气泡宽度和高度是否保持不变的长消息。'.repeat(4) }, { sender: '测量角色', text: '', image: photo, imageKind: 'sticker' }]) {
                    addMessage({ id: crypto.randomUUID(), type: 'normal', timestamp: new Date(), ...data });
                }
            });
            await page.waitForTimeout(650);
            const measure = () => page.evaluate(() => [...document.querySelectorAll('#chat-container .message')].map(node => {
                const style = getComputedStyle(node), rect = node.getBoundingClientRect();
                return { width: rect.width, height: rect.height, color: style.color, background: style.backgroundColor,
                    padding: style.padding, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius],
                    font: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight };
            }));
            const normal = await measure();
            await page.evaluate(() => applyCustomBubbleCss('.message-sent { background: #ddeedd !important; color: #203020 !important; padding: 10px 18px !important; border-radius: 9px !important; }'));
            await page.waitForTimeout(650);
            const custom = await measure();
            results.push({ normal, custom }); await context.close();
        }
        assert.deepEqual(results[1], results[0], 'bubble dimensions/colors/padding/radii/font must match pre-change HEAD, including custom skin');
        fs.writeFileSync(path.join(root, 'outputs/f7-rounds/bubble-parity.json'), JSON.stringify({ baseline: 'HEAD before this task', viewport: '390x844', before: results[0], after: results[1], identical: true }, null, 2));
        console.log('PASS bubble parity: short/long sent/received text + sticker, width/height/colors/padding/radii/font, default and custom skin unchanged from HEAD.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => servers.forEach(server => server.close()));
