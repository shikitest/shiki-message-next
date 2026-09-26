(function (global) {
    'use strict';
    let root, page, busy = false, formAvatar = null, avatarVersion = 0;
    const e = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    function button(label, action, id) { const n = e('button', 'next-button', label); n.type = 'button'; n.dataset.nextAction = action; if (id) n.dataset.id = id; return n; }
    function avatar(src) { const n = e('span', 'next-avatar'); if (src) { const i = e('img'); i.src = src; i.alt = ''; n.append(i); } else n.textContent = '☺'; return n; }
    function field(label, id, type, value) { const l = e('label', 'next-field', label); const n = e(type === 'textarea' ? 'textarea' : 'input'); n.id = id; n.setAttribute('aria-label', label); if (type !== 'textarea') n.type = type || 'text'; n.value = value || ''; l.append(n); return l; }
    function start(title, kind, id) {
        ++avatarVersion; formAvatar = null;
        page.dataset.kind = kind; page.dataset.id = id || '';
        page.replaceChildren();
        const header = e('header', 'next-page-header'); header.append(button('返回', 'close'), e('h2', '', title), e('span'));
        page.append(header, e('div', 'next-page-body')); page.hidden = false;
        return page.querySelector('.next-page-body');
    }
    function close() { ++avatarVersion; page.hidden = true; page.replaceChildren(); }
    async function guarded(node, task) {
        if (busy) return;
        busy = true; if (node) { node.disabled = true; node.setAttribute('aria-busy', 'true'); }
        try { await task(); }
        catch (error) { NextRuntime.report(error); }
        finally { busy = false; if (node) { node.disabled = false; node.removeAttribute('aria-busy'); } }
    }
    function renderFriends() {
        const list = root.querySelector('#next-friend-list'); if (!list) return;
        const query = root.querySelector('#next-friend-search').value.toLocaleLowerCase();
        list.replaceChildren();
        const friends = NextModel.snapshot().friends.filter(f => !f.deleted && f.name.toLocaleLowerCase().includes(query));
        friends.forEach(f => {
            const row = button('', 'friend', f.id); row.className = 'next-friend-row';
            const copy = e('span', 'next-row-copy'); copy.append(e('strong', '', f.name), e('small', '', f.cards.length + ' 张字卡'));
            row.append(avatar(f.avatar), copy, e('span', '', '›')); list.append(row);
        });
        if (!friends.length) list.append(e('p', 'next-empty', query ? '没有找到好友' : '添加好友，为每位好友设置自己的字卡。'));
    }
    function openFriend(id) {
        const f = NextModel.friend(id);
        if (id && !f) return;
        const body = start(f ? '好友资料与字卡' : '添加好友', 'friend', id);
        body.append(field('好友名称', 'next-friend-name', 'text', f && f.name));
        body.querySelector('input').maxLength = 40;
        formAvatar = f && f.avatar || null;
        const preview = avatar(formAvatar); preview.id = 'next-avatar-preview'; body.append(preview);
        body.append(field('头像图片（自动缩小保存）', 'next-avatar-input', 'file'));
        body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp';
        body.append(button('移除头像', 'remove-avatar'));
        body.append(field('独立字卡：每行一张，可添加、编辑或删除整行', 'next-friend-cards', 'textarea', f && f.cards.join('\n')));
        body.querySelector('textarea').maxLength = 200000;
        body.append(e('p', 'next-note', '此字卡供该好友在所有单聊与群聊中共用。空字卡不会自动回复；本预览版仅接入字卡模式。'));
        body.append(field('回复概率（0–100%，每个角色独立判断）', 'next-reply-probability', 'number', f ? String(f.replyProbability * 100) : '80'));
        const p = body.querySelector('#next-reply-probability'); p.min = '0'; p.max = '100'; p.step = '1';
        body.append(button('保存好友与字卡', 'save-friend'));
        if (f && !f.deleted) body.append(button('聊天', 'chat', f.id), button('删除好友（保留聊天）', 'delete-friend', f.id));
        if (f && f.deleted) body.append(e('p', 'next-note', '好友已删除，历史资料和字卡仍保留，不再自动发言。'));
    }
    function openGroup(id) {
        const c = NextModel.conversation(id);
        const body = start(c ? '群资料与成员' : '选择好友创建群聊', 'group', id);
        body.append(field('群名称', 'next-group-name', 'text', c && c.name)); body.querySelector('input').maxLength = 50;
        body.append(e('p', 'next-note', '选择至少两位好友。成员直接使用各自好友字卡，不复制新字卡。'));
        if (!c) { body.append(field('群头像（可选）', 'next-avatar-input', 'file')); body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp'; body.append(avatar(null)); }
        NextModel.snapshot().friends.filter(f => !f.deleted || c && c.friendIds.includes(f.id)).forEach(f => {
            const label = e('label', 'next-member-choice'); const check = e('input'); check.type = 'checkbox'; check.value = f.id;
            check.checked = Boolean(c && c.friendIds.includes(f.id)); check.disabled = f.deleted;
            label.append(check, avatar(f.avatar), e('span', '', f.name + (f.deleted ? '（已删除，可移出）' : '')));
            if (f.deleted) { check.disabled = false; check.dataset.deleted = 'true'; }
            body.append(label);
        });
        body.append(button(c ? '保存群资料与成员' : '创建群聊', 'save-group'));
    }
    function openCreate() {
        const body = start('开始聊天', 'create');
        body.append(button('选择好友单聊', 'choose-friend'), button('选择好友创建群聊', 'create-group'));
        body.append(e('p', 'next-note', '添加角色请使用“好友 → 添加好友”。'));
    }
    function openGlobals() {
        const body = start('网站设置', 'globals');
        body.append(field('我的名称', 'next-my-name', 'text', settings.myName));
        const theme = e('label', 'next-field', '主题'); const select = e('select'); select.id = 'next-theme'; select.setAttribute('aria-label', '主题');
        [['black-white', '黑白'], ['gold', '暖金'], ['green', '绿色']].forEach(([v, t]) => { const o = e('option', '', t); o.value = v; select.append(o); }); select.value = settings.colorTheme; if (!select.value) select.value = 'black-white'; theme.append(select); body.append(theme);
        const dark = e('label', 'next-field', '夜间模式'); const checkbox = e('input'); checkbox.id = 'next-dark'; checkbox.type = 'checkbox'; checkbox.checked = settings.isDarkMode; checkbox.setAttribute('aria-label', '夜间模式'); dark.append(checkbox); body.append(dark);
        body.append(field('聊天字号（12–24）', 'next-font-size', 'number', String(settings.fontSize)));
        body.append(button('保存网站设置', 'save-globals'));
    }
    function openBackup() {
        const body = start('新版轻量备份', 'backup');
        body.append(e('p', 'next-note', '包含好友、字卡、群关系、消息、草稿与必要设置。头像、图片、音视频、音乐文件、活动记录和自定义附件不包含；不会触碰旧网站。旧备份兼容导入尚未完成。'));
        body.append(button('导出新版轻量备份', 'export'), field('导入新版 JSON（恢复替换新版数据）', 'next-import-file', 'file'));
        body.querySelector('#next-import-file').accept = '.json,application/json';
        body.append(e('p', 'next-note', '恢复前会显示数量并要求确认。请先导出当前新版数据；旧版备份会被拒绝。预览版导入上限 10MB。'));
    }
    async function handle(event) {
        const node = event.target.closest('[data-next-action]'); if (!node) return;
        event.stopPropagation(); const action = node.dataset.nextAction, id = node.dataset.id;
        if (action === 'close') return close();
        if (action === 'add-friend') return openFriend();
        if (action === 'friend') return openFriend(id);
        if (action === 'create-group') return openGroup();
        if (action === 'globals') return openGlobals();
        if (action === 'backup') return openBackup();
        if (action === 'background-settings') {
            const body = start('通知与保活音频', 'background');
            body.append(e('p', 'next-note', '保活音频仅辅助后台运行，系统仍可能暂停网页。本阶段没有服务器推送。'));
            body.append(button('切换保活音频', 'toggle-keepalive'), button('请求本机消息通知权限', 'notification'));
            const status = e('p', 'next-note'); status.id = 'next-keepalive-status'; status.textContent = document.getElementById('keepalive-audio-desc').textContent; body.append(status);
            return;
        }
        if (action === 'toggle-keepalive') {
            if (typeof global._toggleKeepaliveAudio !== 'function') return showNotification('当前浏览器保活入口不可用', 'warning');
            global._toggleKeepaliveAudio();
            setTimeout(() => { const node = page.querySelector('#next-keepalive-status'); if (node) node.textContent = document.getElementById('keepalive-audio-desc').textContent; }, 200);
            return;
        }
        if (action === 'notification') {
            if (!('Notification' in global)) return showNotification('此浏览器不支持通知，请在支持的主屏幕应用中使用', 'info');
            const permission = await Notification.requestPermission(); showNotification(permission === 'granted' ? '通知权限已开启；不保证退出网站后收到消息' : '通知权限未开启', 'info'); return;
        }
        if (action === 'choose-friend') { close(); ShikiAppShell.showPrimary('friends'); renderFriends(); return; }
        if (action === 'remove-avatar') { formAvatar = null; const v = page.querySelector('#next-avatar-preview'); if (v) v.replaceWith(Object.assign(avatar(null), { id: 'next-avatar-preview' })); return; }
        await guarded(node, async () => {
            if (action === 'save-friend') {
                const probability = Number(page.querySelector('#next-reply-probability').value);
                if (!Number.isFinite(probability) || probability < 0 || probability > 100) throw new Error('回复概率应为 0–100');
                const input = { name: page.querySelector('#next-friend-name').value, avatar: formAvatar, cards: page.querySelector('#next-friend-cards').value.split('\n').map(c => c.trim()).filter(Boolean), replyProbability: probability / 100 };
                if (page.dataset.id) input.id = page.dataset.id;
                const f = await NextModel.saveFriend(input); await NextRuntime.sync(); NextRuntime.applyCurrent(); renderFriends(); ShikiAppShell.refresh(); openFriend(f.id); showNotification('好友和字卡已保存', 'success');
            }
            if (action === 'chat') { const c = await NextModel.openDirect(id); close(); await NextRuntime.open(c.id); }
            if (action === 'delete-friend' && confirm('删除好友并停止自动发言？历史聊天和字卡会保留。')) { await NextModel.deleteFriend(id); NextRuntime.cancelReplies(); NextRuntime.applyCurrent(); close(); renderFriends(); ShikiAppShell.refresh(); }
            if (action === 'save-group') {
                const ids = Array.from(page.querySelectorAll('.next-member-choice input:checked')).map(n => n.value);
                const name = page.querySelector('#next-group-name').value;
                const c = page.dataset.id ? await NextModel.updateGroup(page.dataset.id, name, ids) : await NextModel.createGroup(name, ids);
                if (formAvatar && global.ConversationAvatarStore) {
                    try { await ConversationAvatarStore.save(c.id, await (await fetch(formAvatar)).blob()); await ConversationMetaStore.update(c.id, { avatarRef: 'next:' + Date.now() }); }
                    catch (error) { showNotification('群已保存，但头像保存失败，请从聊天详情重试', 'warning'); }
                }
                close(); NextRuntime.cancelReplies(); await NextRuntime.sync(); NextRuntime.applyCurrent(); ShikiAppShell.refresh(); await NextRuntime.open(c.id);
            }
            if (action === 'save-globals') {
                const size = Number(page.querySelector('#next-font-size').value);
                if (!Number.isFinite(size) || size < 12 || size > 24) throw new Error('字号应为 12–24');
                const next = { ...settings, myName: page.querySelector('#next-my-name').value.trim().slice(0, 40) || '我', colorTheme: page.querySelector('#next-theme').value, isDarkMode: page.querySelector('#next-dark').checked, fontSize: size };
                await NextRuntime.saveGlobals(next); Object.assign(settings, next); updateUI(); close(); showNotification('网站设置已保存', 'success');
            }
            if (action === 'export') { await NextRuntime.flush(); const backup = await NextBackup.exportData(); downloadFileFallback(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'shiki-next-light-' + Date.now() + '.json'); }
        });
    }
    function initialize() {
        root = document.getElementById('shiki-app-shell');
        const view = e('section', 'shiki-shell-view'); view.dataset.view = 'friends'; view.hidden = true;
        const header = e('header', 'shiki-shell-topbar'); header.append(e('h1', '', '好友'), button('添加好友', 'add-friend'));
        view.append(header, field('搜索好友', 'next-friend-search', 'search'), Object.assign(e('div'), { id: 'next-friend-list' })); root.insertBefore(view, root.querySelector('.shiki-shell-nav'));
        const settingsView = root.querySelector('[data-view="settings"].shiki-shell-view'); settingsView.replaceChildren();
        settingsView.append(e('h1', 'next-settings-heading', '设置'), e('p', 'next-note', '这里只管理网站设置，不切换单聊或群聊模式。'), button('资料、主题与字号', 'globals'), button('新版轻量备份', 'backup'));
        const background = button('通知与保活音频', 'background-settings'); settingsView.append(background);
        page = e('section', 'next-page'); page.id = 'next-editor-page'; page.hidden = true; document.body.append(page);
        root.addEventListener('click', handle); page.addEventListener('click', handle);
        root.querySelector('#next-friend-search').addEventListener('input', renderFriends);
        page.addEventListener('change', event => {
            if (event.target.id === 'next-avatar-input' && event.target.files[0]) {
                const file = event.target.files[0], version = avatarVersion;
                if (file.size > 5 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) return showNotification('请选择 5MB 以下 PNG/JPEG/WebP 图片', 'warning');
                guarded(null, async () => { const result = await cropImageToSquare(file, 256); if (version !== avatarVersion) return; if (result.length > 250000) throw new Error('头像过大，请选择较简单的图片'); formAvatar = result; const old = page.querySelector('#next-avatar-preview'); if (old) old.replaceWith(Object.assign(avatar(result), { id: 'next-avatar-preview' })); });
            }
            if (event.target.id === 'next-import-file' && event.target.files[0]) guarded(null, async () => {
                const file = event.target.files[0]; if (file.size > 10 * 1024 * 1024) throw new Error('预览版仅支持 10MB 以下轻量备份');
                const data = JSON.parse(await file.text()); NextBackup.validate(data);
                if (!confirm('恢复 ' + data.model.friends.length + ' 位好友、' + data.model.conversations.length + ' 个会话？这会替换新版数据，不影响旧网站。请先备份当前新版。')) return;
                await NextRuntime.flush(); NextRuntime.cancelReplies(); await NextBackup.importData(data); location.hash = ''; NextStorage.session.clear(); location.reload();
            });
        });
        // Guard legacy entry points before their document-level handlers run.
        document.addEventListener('click', event => {
            const target = event.target.closest('#group-chat-btn,#session-manager-btn,#custom-replies-function,#chat-settings,#advanced-settings,#data-settings,#appearance-settings,#export-all-settings,#import-all-settings,#export-chat-btn,#import-chat-btn,#export-all-settings-real,#import-all-settings-real,#export-chat-btn-real,#import-chat-btn-real');
            if (!target) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (target.id === 'group-chat-btn') return openGroup(SESSION_ID);
            if (target.id === 'session-manager-btn') return ShikiAppShell.showPrimary('conversations');
            if (target.id === 'appearance-settings') return openGlobals();
            if (target.id.includes('data') || /export|import/.test(target.id)) return openBackup();
            const c = NextModel.conversation(SESSION_ID);
            if (c && c.type === 'direct') return openFriend(c.friendIds[0]);
            if (c) return openGroup(c.id);
            showNotification('请先选择好友聊天', 'info');
        }, true);
        const more = root.querySelector('[data-view="more"].shiki-shell-view');
        if (more) {
            const watch = more.querySelector('[data-id="watch-together"]');
            if (watch) { watch.disabled = true; watch.append(e('small', '', '活动邀请适配中')); }
        }
        const badge = e('p', 'next-preview-badge', '好友框架预览 · 主动消息与旧备份兼容将在下一阶段开放'); root.querySelector('[data-view="conversations"].shiki-shell-view').prepend(badge);
        renderFriends();
    }
    async function deleteConversation(id) {
        if (!confirm('删除此聊天及其消息？好友与字卡仍保留。请先导出需要保留的聊天。')) return;
        await guarded(null, async () => {
            await NextRuntime.flush(); NextRuntime.cancelReplies();
            await NextModel.deleteConversation(id);
            const keys = await localforage.keys();
            for (const key of keys) if (key.startsWith(APP_PREFIX + id + '_')) await localforage.removeItem(key);
            await ConversationMetaStore.remove(id);
            if (global.ConversationAvatarStore) await ConversationAvatarStore.remove(id);
            if (global.WatchTogetherStore) await WatchTogetherStore.remove(id);
            await NextRuntime.sync();
            if (String(SESSION_ID) === id) { location.hash = ''; location.reload(); }
            else ShikiAppShell.refresh();
        });
    }
    global.NextUI = Object.freeze({ initialize, renderFriends, openFriend, openGroup, openCreate, openBackup, deleteConversation, beforeNavigate: () => { if (global.NextRuntime) NextRuntime.flush().catch(NextRuntime.report); } });
})(window);
