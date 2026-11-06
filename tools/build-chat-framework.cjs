/* Reproducible vendor build. No changes to the source UI lab or its runtime. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dependencies = process.env.SHIKI_F7_DEPENDENCIES || path.resolve(root, '../shiki-chat-ui-lab');
const esbuild = require(require.resolve('esbuild', { paths: [dependencies] }));
const f7 = path.join(dependencies, 'node_modules/framework7');
const { chromium } = require('C:/Users/en/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
    const out = path.join(root, 'assets/vendor/framework7');
    fs.mkdirSync(out, { recursive: true });
    await esbuild.build({ stdin: { contents: `import Framework7 from 'framework7/lite'; window.ShikiFramework7 = Framework7;`, resolveDir: dependencies }, bundle: true, minify: true, outfile: path.join(out, 'chat.min.js'), legalComments: 'eof' });
    const core = fs.readFileSync(path.join(f7, 'framework7.css'), 'utf8');
    const section = name => {
        const start = core.indexOf('/* === ' + name + ' === */');
        if (start < 0) throw Error('Missing Framework7 CSS section: ' + name);
        const end = core.indexOf('/* === ', start + 10);
        return core.slice(start, end < 0 ? undefined : end);
    };
    const css = section('Views') + section('Pages') + fs.readFileSync(path.join(f7, 'components/messagebar/messagebar.css'), 'utf8');
    const messagesCss = fs.readFileSync(path.join(f7, 'components/messages/messages.css'), 'utf8');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage();
        const scoped = await page.evaluate(({ css, messagesCss }) => {
            const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
            function rules(list) {
                return [...list].map(rule => {
                    if (rule instanceof CSSStyleRule) {
                        const selectors = rule.selectorText.split(',').map(s => {
                            s = s.trim();
                            if (/^(?:\:root|\.ios)(?=[ .:#>]|$)/.test(s)) return s.replace(/^(?:\:root|\.ios)/, '#next-f7-app');
                            return '#next-f7-app ' + s;
                        }).join(',');
                        return selectors + '{' + rule.style.cssText + '}';
                    }
                    if (rule instanceof CSSKeyframesRule) return rule.cssText;
                    if (rule.cssRules) return rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + rules(rule.cssRules) + '}';
                    return rule.cssText;
                }).join('\n');
            }
            const animations = new CSSStyleSheet(); animations.replaceSync(messagesCss);
            // Use F7's message motion, NOT its default bubble dimensions/colors.
            return rules(sheet.cssRules) + '\n' + [...animations.cssRules].filter(rule => rule instanceof CSSKeyframesRule).map(rule => rule.cssText).join('\n');
        }, { css, messagesCss });
        fs.writeFileSync(path.join(out, 'chat.css'), '/* Framework7 9.0.0, MIT. Scoped to #next-f7-app; see LICENSE. */\n' + scoped.replace(/[\t ]+$/gm, ''));
        fs.copyFileSync(path.join(f7, 'LICENSE'), path.join(out, 'LICENSE'));
    } finally { await browser.close(); }
    console.log('Built scoped Framework7 chat vendor assets.');
})().catch(error => { console.error(error); process.exitCode = 1; });
