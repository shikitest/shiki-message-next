// Normalize inherited trailing whitespace for the independent repository's initial diff.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (path.basename(root) !== 'shiki-message-next') throw new Error('Wrong directory');
function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(target);
        else if (/\.(js|css|html|json|md|ps1|webmanifest)$/.test(entry.name)) {
            const source = fs.readFileSync(target, 'utf8');
            const next = source.replace(/\r\n/g, '\n').replace(/[\t ]+$/gm, '').replace(/\n+$/, '') + '\n';
            if (source !== next) fs.writeFileSync(target, next);
        }
    }
}
walk(root);
