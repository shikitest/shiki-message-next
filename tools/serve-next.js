const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/shiki-message-next/')) { res.writeHead(404); res.end(); return; }
    const target = path.resolve(root, '.' + decodeURIComponent(pathname.slice('/shiki-message-next'.length)), pathname.endsWith('/') ? 'index.html' : '');
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(target, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(data); });
}).listen(8765, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:8765/shiki-message-next/'));
