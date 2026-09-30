(function (global) {
    'use strict';
    let root, page, busy = false, formAvatar = null, avatarVersion = 0, groupsExpanded = true, friendsExpanded = true;
    let groupSelection = new Set(), groupDraft = null;
    const e = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    function button(label, action, id) { const n = e('button', 'next-button', label); n.type = 'button'; n.dataset.nextAction = action; if (id) n.dataset.id = id; return n; }
    function avatar(src) { const n = e('span', 'next-avatar'); if (src) { const i = e('img'); i.src = src; i.alt = ''; n.append(i); } else n.append(ShikiAppShell.createIcon('user')); return n; }
    function field(label, id, type, value) { const l = e('label', 'next-field', label); const n = e(type === 'textarea' ? 'textarea' : 'input'); n.id = id; n.setAttribute('aria-label', label); if (type !== 'textarea') n.type = type || 'text'; n.value = value || ''; l.append(n); return l; }
    function start(title, kind, id) {
        ++avatarVersion; formAvatar = null;
        page.classList.remove('next-profile-page', 'next-group-page', 'next-background-page');
        page.dataset.kind = kind; page.dataset.id = id || '';
        page.replaceChildren();
        const header = e('header', 'next-page-header');
        const back = button('', 'close'); back.setAttribute('aria-label', '返回'); back.append(ShikiAppShell.createIcon('back'));
        header.append(back, e('h2', '', title), e('span', 'next-header-action'));
        page.append(header, e('div', 'next-page-body')); page.hidden = false;
        return page.querySelector('.next-page-body');
    }
    function close() { ++avatarVersion; page.hidden = true; page.replaceChildren(); }
    function checkbox(label, id, value) {
        const wrapper = e('label', 'next-field next-toggle', label), input = e('input');
        input.type = 'checkbox'; input.id = id; input.checked = value === true; input.setAttribute('aria-label', label); wrapper.append(input); return wrapper;
    }
    async function guarded(node, task) {
        if (busy) return;
        busy = true; if (node) { node.disabled = true; node.setAttribute('aria-busy', 'true'); }
        try { await task(); }
        catch (error) { NextRuntime.report(error); }
        finally { busy = false; if (node) { node.disabled = false; node.removeAttribute('aria-busy'); } }
    }
    function renderFriends() {
        if (!root) return;
        const list = root.querySelector('#next-friend-list'), groupList = root.querySelector('#next-group-list'); if (!list || !groupList) return;
        const query = root.querySelector('#next-friend-search').value.trim().toLocaleLowerCase();
        list.replaceChildren(); groupList.replaceChildren();
        const snapshot = NextModel.snapshot();
        const friends = snapshot.friends.filter(f => !f.deleted && (!query || f.name.toLocaleLowerCase().includes(query)));
        const groups = snapshot.conversations.filter(c => c.type === 'group' && (!query || c.name.toLocaleLowerCase().includes(query)));
        groups.forEach(c => {
            const row = e('button', 'next-group-row'); row.type = 'button'; row.dataset.action = 'open-session'; row.dataset.sessionId = c.id;
            const groupAvatar = e('span', 'next-group-avatar'); groupAvatar.append(ShikiAppShell.createIcon('friends'));
            const copy = e('span', 'next-row-copy'); copy.append(e('strong', '', c.name), e('small', '', '[' + c.friendIds.length + '位成员]'));
            row.append(groupAvatar, copy, e('span', 'next-row-chevron', '›')); groupList.append(row);
        });
        friends.forEach(f => {
            const row = button('', 'friend', f.id); row.className = 'next-friend-row';
            const copy = e('span', 'next-row-copy'); copy.append(e('strong', '', f.name), e('small', '', NextMood.status(f.id)));
            row.append(avatar(f.avatar), copy, e('span', 'next-row-chevron', '›')); list.append(row);
        });
        if (!friends.length && !query) {
            const empty = e('div', 'next-friends-empty');
            empty.append(e('strong', '', '来添加好友吧！'), e('p', '', '创建好友资料后，就可以开始聊天。'), button('添加好友', 'add-friend'));
            list.append(empty);
        } else if (!friends.length && !groups.length) list.append(e('p', 'next-empty', '没有找到好友或群聊'));
        const groupsToggle = root.querySelector('[data-next-action="toggle-groups"]');
        const friendsToggle = root.querySelector('[data-next-action="toggle-friends"]');
        if (groupsToggle) { groupsToggle.setAttribute('aria-expanded', String(groupsExpanded)); groupsToggle.classList.toggle('is-collapsed', !groupsExpanded); }
        if (friendsToggle) { friendsToggle.setAttribute('aria-expanded', String(friendsExpanded)); friendsToggle.classList.toggle('is-collapsed', !friendsExpanded); }
        groupList.hidden = !groupsExpanded; list.hidden = !friendsExpanded;
    }
    function openProfile(id) {
        const f = NextModel.friend(id); if (!f) return;
        const body = start('', 'profile', id);
        page.classList.add('next-profile-page');
        page.querySelector('header button').setAttribute('aria-label', '返回好友列表');
        const card = e('div', 'next-profile-card'), copy = e('div', 'next-profile-copy');
        copy.append(e('h1', '', f.name), e('p', 'next-profile-status', NextMood.status(id)));
        card.append(avatar(f.avatar), copy); body.append(card);
        if (!f.deleted) body.append(button('发消息', 'chat', id));
        body.append(button('设定', 'friend-settings', id));
    }
    function refreshProfiles() {
        renderFriends();
        const f = page && page.dataset.kind === 'profile' && NextModel.friend(page.dataset.id);
        if (f && !page.hidden) page.querySelector('.next-profile-status').textContent = NextMood.status(f.id);
        const mine = root && root.querySelector('#next-my-card');
        if (mine) {
            mine.replaceChildren(); const copy = e('span', 'next-row-copy');
            copy.append(e('strong', '', settings.myName || '我'), e('small', '', settings.myStatus || '设置当前状态'));
            mine.append(copy, avatar(NextRuntime.globals().myAvatar));
        }
    }
    function openFriend(id) {
        const f = NextModel.friend(id);
        if (id && !f) return;
        const body = start(f ? '好友设定' : '添加好友', 'friend', id);
        page.classList.remove('next-profile-page');
        body.append(field('好友名称', 'next-friend-name', 'text', f && f.name));
        body.querySelector('input').maxLength = 40;
        formAvatar = f && f.avatar || null;
        const preview = avatar(formAvatar); preview.id = 'next-avatar-preview'; body.append(preview);
        body.append(field('头像图片（自动缩小保存）', 'next-avatar-input', 'file'));
        body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp';
        body.append(button('移除头像', 'remove-avatar'));
        body.append(field('独立字卡：每行一张，可添加、编辑或删除整行', 'next-friend-cards', 'textarea', f && f.cards.join('\n')));
        body.querySelector('textarea').maxLength = 200000;
        body.append(e('p', 'next-note', '该好友在单聊和所有群聊中共用这些字卡。'));
        if (f) body.append(button('心情日历', 'friend-calendar', f.id));
        const prefs = f ? NextRuntime.replyPreferences(f) : getDefaultSettings();
        const mode = e('label', 'next-field', '回复模式'), select = e('select'); select.id = 'next-reply-mode'; select.setAttribute('aria-label', '回复模式');
        [['card', '字卡'], ['ime', 'RandomIME'], ['mixed', '混合']].forEach(([v, t]) => { const option = e('option', '', t); option.value = v; select.append(option); }); select.value = prefs.textGenerationMode; mode.append(select); body.append(mode);
        body.append(checkbox('允许已读不回', 'next-read-no-reply', prefs.allowReadNoReply), field('已读不回概率（0–100%）', 'next-read-chance', 'number', String(prefs.readNoReplyChance * 100)));
        body.append(field('最短回复延迟（毫秒）', 'next-delay-min', 'number', String(prefs.replyDelayMin)), field('最长回复延迟（毫秒）', 'next-delay-max', 'number', String(prefs.replyDelayMax)));
        body.append(checkbox('显示正在输入', 'next-typing', prefs.typingIndicatorEnabled), checkbox('显示已读', 'next-receipts', prefs.readReceiptsEnabled), checkbox('允许随机引用回复', 'next-quote', prefs.replyEnabled));
        if (f) {
            body.append(checkbox('使用预览版额外回复概率（默认关闭）', 'next-preview-probability-enabled', prefs.usePreviewProbability));
            body.append(field('已保存的预览版回复概率（0–100%）', 'next-reply-probability', 'number', String(f.replyProbability * 100)));
        }
        body.append(button('保存好友与字卡', 'save-friend'));
        if (f && !f.deleted) body.append(button('删除好友（保留聊天）', 'delete-friend', f.id));
        if (f && f.deleted) body.append(e('p', 'next-note', '好友已删除，历史资料和字卡仍保留，不再自动发言。'));
    }
    function openGroup(id) {
        const c = NextModel.conversation(id);
        if (c) return openGroupForm(c);
        groupSelection = new Set(); groupDraft = null;
        openGroupSelection();
    }
    function openGroupSelection() {
        const body = start('选择好友', 'group-select');
        page.classList.add('next-group-page');
        const next = button('下一步', 'group-next'); page.querySelector('.next-header-action').replaceWith(next);
        const search = field('', 'next-member-search', 'search'); search.classList.add('next-member-search'); search.querySelector('input').placeholder = '使用姓名搜索';
        body.append(search);
        const friends = NextModel.snapshot().friends.filter(f => !f.deleted);
        if (!friends.length) body.append(e('p', 'next-empty', '没有可选择的好友'));
        friends.forEach(f => {
            const label = e('label', 'next-member-choice'); label.dataset.name = f.name.toLocaleLowerCase();
            const check = e('input'); check.type = 'checkbox'; check.value = f.id; check.checked = groupSelection.has(f.id);
            label.append(check, avatar(f.avatar), e('span', '', f.name)); body.append(label);
        });
        search.querySelector('input').addEventListener('input', event => {
            const query = event.target.value.trim().toLocaleLowerCase();
            body.querySelectorAll('.next-member-choice').forEach(row => { row.hidden = !row.dataset.name.includes(query); });
        });
    }
    function openGroupForm(c) {
        const body = start(c ? '群资料与成员' : '设置群资料', 'group', c && c.id);
        page.classList.add('next-group-page');
        const save = button(c ? '保存' : '创建', 'save-group'); page.querySelector('.next-header-action').replaceWith(save);
        body.append(field('群名称', 'next-group-name', 'text', c ? c.name : groupDraft && groupDraft.name)); body.querySelector('input').maxLength = 50;
        if (!c) { formAvatar = groupDraft && groupDraft.avatar || null; body.append(Object.assign(avatar(formAvatar), { id: 'next-avatar-preview' }), field('群头像（可选）', 'next-avatar-input', 'file')); body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp'; }
        const friends = NextModel.snapshot().friends.filter(f => c ? (!f.deleted || c.friendIds.includes(f.id)) : groupSelection.has(f.id));
        body.append(e('h3', 'next-group-members-title', '成员：' + (c ? c.friendIds.length : friends.length)));
        if (!c) body.append(button('添加或调整成员', 'group-select-back'));
        friends.forEach(f => {
            const label = e('label', 'next-member-choice'); const check = e('input'); check.type = 'checkbox'; check.value = f.id;
            check.checked = c ? c.friendIds.includes(f.id) : true; check.disabled = f.deleted;
            label.append(check, avatar(f.avatar), e('span', '', f.name + (f.deleted ? '（已删除，可移出）' : '')));
            if (f.deleted) { check.disabled = false; check.dataset.deleted = 'true'; }
            body.append(label);
        });
    }
    function openCreate() {
        const body = start('开始聊天', 'create');
        body.append(button('选择好友单聊', 'choose-friend'), button('选择好友创建群聊', 'create-group'));
    }
    function openListEditor() {
        const body = start('编辑聊天列表', 'list-editor');
        NextModel.snapshot().conversations.forEach(c => {
            const row = e('div', 'next-list-edit-row'); row.append(e('strong', '', c.name));
            const pinned = ConversationMetaStore.get(c.id).pinned;
            row.append(button(pinned ? '取消置顶' : '置顶', 'list-pin', c.id), button('删除', 'list-delete', c.id)); body.append(row);
        });
        if (!body.childNodes.length) body.append(e('p', 'next-empty', '暂无聊天'));
    }
    function openBackground() {
        const id = String(SESSION_ID), body = start('背景图片设置', 'conversation-background', id);
        page.classList.add('next-background-page');
        const upload = field('您的照片', 'next-background-file', 'file'); upload.querySelector('input').accept = 'image/png,image/jpeg,image/webp';
        body.append(upload, button('恢复默认背景', 'background-reset', id));
        const gallery = e('div', 'next-background-grid');
        (savedBackgrounds || []).forEach(bg => {
            const item = button('', 'background-select', bg.id); item.classList.add('next-background-tile');
            item.setAttribute('aria-label', bg.type === 'image' ? '选择保存的图片背景' : '选择保存的颜色背景');
            if (bg.type === 'image') { const image = e('img'); image.src = bg.value; image.alt = ''; item.append(image); }
            else item.style.background = bg.value;
            item._backgroundValue = bg.value;
            gallery.append(item);
        });
        body.append(gallery);
    }
    function openGlobals() {
        const body = start('网站设置', 'globals');
        body.append(field('我的名称', 'next-my-name', 'text', settings.myName));
        body.append(field('我的当前状态', 'next-my-status', 'text', settings.myStatus));
        formAvatar = NextRuntime.globals().myAvatar || null;
        body.append(Object.assign(avatar(formAvatar), { id: 'next-avatar-preview' }), field('我的头像', 'next-avatar-input', 'file'));
        body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp';
        const theme = e('label', 'next-field', '主题'); const select = e('select'); select.id = 'next-theme'; select.setAttribute('aria-label', '主题');
        [['black-white', '黑白'], ['gold', '暖金'], ['green', '绿色']].forEach(([v, t]) => { const o = e('option', '', t); o.value = v; select.append(o); }); select.value = settings.colorTheme; if (!select.value) select.value = 'black-white'; theme.append(select); body.append(theme);
        const dark = e('label', 'next-field', '夜间模式'); const checkbox = e('input'); checkbox.id = 'next-dark'; checkbox.type = 'checkbox'; checkbox.checked = settings.isDarkMode; checkbox.setAttribute('aria-label', '夜间模式'); dark.append(checkbox); body.append(dark);
        body.append(field('聊天字号（12–24）', 'next-font-size', 'number', String(settings.fontSize)));
        body.append(button('保存网站设置', 'save-globals'));
    }
    function openBackup() {
        const body = start('新版轻量备份', 'backup');
        body.append(e('p', 'next-note', '包含好友、字卡、群关系、消息、草稿、好友日历状态与必要设置。头像、图片、音视频、音乐文件、活动记录、日历回收站和自定义附件不包含；不会触碰旧网站。旧备份兼容导入尚未完成。'));
        body.append(button('导出新版轻量备份', 'export'), field('导入新版 JSON（恢复替换新版数据）', 'next-import-file', 'file'));
        body.querySelector('#next-import-file').accept = '.json,application/json';
        body.append(e('p', 'next-note', '恢复前会显示数量并要求确认。请先导出当前新版数据；旧版备份会被拒绝。预览版导入上限 10MB。'));
    }
    function openBackgroundSettings() {
        const body = start('通知与保活音频', 'background');
        body.append(e('p', 'next-note', '保活音频仅辅助后台运行，系统仍可能暂停网页。本阶段没有服务器推送。'));
        body.append(button('切换保活音频', 'toggle-keepalive'), button('请求本机消息通知权限', 'notification'));
        const status = e('p', 'next-note'); status.id = 'next-keepalive-status'; status.textContent = document.getElementById('keepalive-audio-desc').textContent; body.append(status);
    }
    async function handle(event) {
        const node = event.target.closest('[data-next-action]'); if (!node) return;
        event.stopPropagation(); const action = node.dataset.nextAction, id = node.dataset.id;
        if (action === 'close') { if (page.dataset.kind === 'friend' && page.dataset.id) return openProfile(page.dataset.id); return close(); }
        if (action === 'group-next') {
            groupSelection = new Set(Array.from(page.querySelectorAll('.next-member-choice input:checked')).map(n => n.value));
            if (groupSelection.size < 2) return showNotification('请至少选择两位好友', 'warning');
            return openGroupForm();
        }
        if (action === 'group-select-back') {
            groupDraft = { name: page.querySelector('#next-group-name').value, avatar: formAvatar };
            groupSelection = new Set(Array.from(page.querySelectorAll('.next-member-choice input:checked')).map(n => n.value));
            return openGroupSelection();
        }
        if (action === 'list-delete') { await deleteConversation(id); if (!page.hidden && page.dataset.kind === 'list-editor') openListEditor(); return; }
        if (action === 'add-friend') return openFriend();
        if (action === 'navigate-settings') return ShikiAppShell.showPrimary('settings');
        if (action === 'toggle-groups') { groupsExpanded = !groupsExpanded; return renderFriends(); }
        if (action === 'toggle-friends') { friendsExpanded = !friendsExpanded; return renderFriends(); }
        if (action === 'show-services') return ShikiAppShell.showPrimary('more');
        if (action === 'friend-tool') {
            if (id === 'stats') return ShikiAppShell.openFeature('stats');
            if (id === 'background') return openBackgroundSettings();
            if (id === 'settings') return ShikiAppShell.showPrimary('settings');
        }
        if (action === 'friend-service') {
            if (id === 'theme') return openGlobals();
        }
        if (action === 'friend') return openProfile(id);
        if (action === 'friend-settings') return openFriend(id);
        if (action === 'friend-calendar') return guarded(node, () => NextMood.open(id));
        if (action === 'create-group') return openGroup();
        if (action === 'globals') return openGlobals();
        if (action === 'backup') return openBackup();
        if (action === 'about') {
            const body = start('版本与功能说明', 'about');
            body.append(e('p', 'next-note', '好友聊天框架。本版本不补发离线历史消息；全会话主动运行、活动邀请和旧备份兼容尚未开放。'));
            return;
        }
        if (action === 'background-settings') {
            return openBackgroundSettings();
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
            if (action === 'list-pin') {
                const meta = ConversationMetaStore.get(id); await ConversationMetaStore.update(id, { pinned: !meta.pinned, updatedAt: meta.updatedAt });
                ShikiAppShell.refresh(); openListEditor();
            }
            if (action === 'background-select' || action === 'background-reset') {
                const version = avatarVersion, sessionId = page.dataset.id, key = getSessionStorageKey(sessionId, 'chatBackground');
                const value = action === 'background-reset' ? null : node._backgroundValue;
                if (value) await localforage.setItem(key, value); else await localforage.removeItem(key);
                if (value) safeSetItem(key, value); else safeRemoveItem(key);
                if (String(SESSION_ID) === sessionId) {
                    if (value) applyBackground(value);
                    else { document.body.classList.remove('with-background'); document.documentElement.style.removeProperty('--chat-bg-image'); }
                }
                if (version === avatarVersion) close(); showNotification('背景已保存', 'success');
            }
            if (action === 'save-friend') {
                const probabilityField = page.querySelector('#next-reply-probability');
                const chance = Number(page.querySelector('#next-read-chance').value);
                if (!Number.isFinite(chance) || chance < 0 || chance > 100) throw new Error('已读不回概率应为 0–100');
                const old = NextModel.friend(page.dataset.id);
                const replySettings = { ...(old && old.replySettings || {}), textGenerationMode: page.querySelector('#next-reply-mode').value,
                    allowReadNoReply: page.querySelector('#next-read-no-reply').checked, readNoReplyChance: chance / 100,
                    replyDelayMin: Number(page.querySelector('#next-delay-min').value), replyDelayMax: Number(page.querySelector('#next-delay-max').value),
                    typingIndicatorEnabled: page.querySelector('#next-typing').checked, readReceiptsEnabled: page.querySelector('#next-receipts').checked, replyEnabled: page.querySelector('#next-quote').checked };
                if (probabilityField) replySettings.usePreviewProbability = page.querySelector('#next-preview-probability-enabled').checked;
                NextModel.preferences(replySettings);
                const input = { name: page.querySelector('#next-friend-name').value, avatar: formAvatar, cards: page.querySelector('#next-friend-cards').value.split('\n').map(c => c.trim()).filter(Boolean), replySettings };
                if (probabilityField) { const probability = Number(probabilityField.value); if (!Number.isFinite(probability) || probability < 0 || probability > 100) throw new Error('回复概率应为 0–100'); input.replyProbability = probability / 100; }
                if (page.dataset.id) input.id = page.dataset.id;
                const f = await NextModel.saveFriend(input); await NextRuntime.sync(); NextRuntime.applyCurrent(); renderFriends(); ShikiAppShell.refresh(); openProfile(f.id); showNotification('已保存', 'success');
            }
            if (action === 'chat') { const c = await NextModel.openDirect(id); close(); await NextRuntime.open(c.id); }
            if (action === 'delete-friend' && confirm('删除好友并停止自动发言？历史聊天和字卡会保留。')) { await NextModel.deleteFriend(id); NextRuntime.cancelReplies(); NextRuntime.applyCurrent(); close(); renderFriends(); ShikiAppShell.refresh(); }
            if (action === 'save-group') {
                const ids = Array.from(page.querySelectorAll('.next-member-choice input:checked')).map(n => n.value);
                const name = page.querySelector('#next-group-name').value, groupId = page.dataset.id, avatarValue = formAvatar, version = avatarVersion;
                const c = groupId ? await NextModel.updateGroup(groupId, name, ids) : await NextModel.createGroup(name, ids);
                if (avatarValue && global.ConversationAvatarStore) {
                    try { await ConversationAvatarStore.save(c.id, await (await fetch(avatarValue)).blob()); await ConversationMetaStore.update(c.id, { avatarRef: 'next:' + Date.now() }); }
                    catch (error) { showNotification('群已保存，但头像保存失败，请从聊天详情重试', 'warning'); }
                }
                NextRuntime.cancelReplies(); await NextRuntime.sync(); NextRuntime.applyCurrent(); ShikiAppShell.refresh();
                if (version === avatarVersion) { close(); await NextRuntime.open(c.id); }
            }
            if (action === 'save-globals') {
                const size = Number(page.querySelector('#next-font-size').value);
                if (!Number.isFinite(size) || size < 12 || size > 24) throw new Error('字号应为 12–24');
                const next = { ...settings, myName: page.querySelector('#next-my-name').value.trim().slice(0, 40) || '我', myStatus: page.querySelector('#next-my-status').value.trim().slice(0, 200), myAvatar: formAvatar, colorTheme: page.querySelector('#next-theme').value, isDarkMode: page.querySelector('#next-dark').checked, fontSize: size };
                await NextRuntime.saveGlobals(next); Object.assign(settings, next); NextRuntime.applyCurrent(); refreshProfiles(); close(); showNotification('已保存', 'success');
            }
            if (action === 'export') { await NextRuntime.flush(); const backup = await NextBackup.exportData(); downloadFileFallback(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'shiki-next-light-' + Date.now() + '.json'); }
        });
    }
    function initialize() {
        root = document.getElementById('shiki-app-shell');
        const view = e('section', 'shiki-shell-view'); view.dataset.view = 'friends'; view.hidden = true;
        const header = e('header', 'shiki-shell-topbar next-friends-topbar'), tools = e('div', 'next-friends-tools');
        const iconButton = (label, action, icon, id) => {
            const b = button('', action); b.classList.add('next-tool-button'); b.setAttribute('aria-label', label); b.title = label; if (id) b.dataset.id = id;
            if (icon) b.append(ShikiAppShell.createIcon(icon));
            return b;
        };
        tools.append(iconButton('收藏与统计', 'friend-tool', 'bookmark', 'stats'), iconButton('通知与保活', 'friend-tool', 'bell', 'background'), iconButton('添加好友', 'add-friend', 'user-plus'), iconButton('设置', 'friend-tool', 'settings', 'settings'));
        header.append(e('span', 'next-friends-header-spacer'), tools);
        const mine = button('', 'globals'); mine.id = 'next-my-card'; mine.className = 'next-my-card';
        const search = e('div', 'next-friends-search'); search.append(ShikiAppShell.createIcon('search'));
        const searchInput = e('input'); searchInput.type = 'search'; searchInput.id = 'next-friend-search'; searchInput.placeholder = '搜索'; searchInput.setAttribute('aria-label', '搜索好友'); searchInput.autocomplete = 'off';
        search.append(searchInput);
        const servicesHeading = e('div', 'next-services-heading'); servicesHeading.append(e('h2', '', '服务'), button('显示全部', 'show-services'));
        const services = e('div', 'next-services-grid');
        [['主题', 'theme', 'brush']].forEach(([label, id, icon]) => {
            const item = button('', 'friend-service'); item.dataset.id = id; item.classList.add('next-service');
            item.setAttribute('aria-label', label);
            item.append(ShikiAppShell.createIcon(icon), e('span', '', label)); services.append(item);
        });
        const groupHeading = button('群', 'toggle-groups'); groupHeading.classList.add('next-section-heading', 'next-groups-heading'); groupHeading.append(e('span', 'next-section-count'), ShikiAppShell.createIcon('chevron'));
        const groupList = e('div', 'next-section-list'); groupList.id = 'next-group-list';
        const friendHeading = button('好友', 'toggle-friends'); friendHeading.classList.add('next-section-heading', 'next-friends-heading'); friendHeading.append(e('span', 'next-section-count'), ShikiAppShell.createIcon('chevron'));
        const friendList = e('div'); friendList.id = 'next-friend-list';
        view.append(header, mine, search, servicesHeading, services, groupHeading, groupList, friendHeading, friendList); root.insertBefore(view, root.querySelector('.shiki-shell-nav'));
        const settingsView = root.querySelector('[data-view="settings"].shiki-shell-view'); settingsView.replaceChildren();
        settingsView.append(e('h1', 'next-settings-heading', '设置'), button('我的资料与外观', 'globals'), button('数据备份', 'backup'));
        settingsView.append(button('版本与功能说明', 'about'));
        const background = button('通知与保活音频', 'background-settings'); settingsView.append(background);
        page = e('section', 'next-page'); page.id = 'next-editor-page'; page.hidden = true; document.body.append(page);
        NextInput.initialize();
        root.addEventListener('click', handle); page.addEventListener('click', handle);
        root.querySelector('#next-friend-search').addEventListener('input', renderFriends);
        page.addEventListener('change', event => {
            if (event.target.id === 'next-background-file' && event.target.files[0]) {
                const file = event.target.files[0], id = page.dataset.id, version = avatarVersion;
                if (file.size > 10 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) return showNotification('请选择 10MB 以下图片', 'warning');
                guarded(null, async () => {
                    const value = await optimizeImage(file), gallery = (savedBackgrounds || []).slice();
                    if (version !== avatarVersion || id !== String(SESSION_ID)) return;
                    gallery.push({ id: 'user-' + Date.now(), type: 'image', value });
                    await localforage.setItem(getSessionStorageKey(id, 'backgroundGallery'), gallery);
                    if (version !== avatarVersion || id !== String(SESSION_ID)) return;
                    savedBackgrounds = gallery; openBackground(); showNotification('图片已加入背景列表，点击图片应用', 'success');
                });
            }
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
            const target = event.target.closest('#mood-function,#group-chat-btn,#session-manager-btn,#custom-replies-function,#chat-settings,#advanced-settings,#data-settings,#appearance-settings,#export-all-settings,#import-all-settings,#export-chat-btn,#import-chat-btn,#export-all-settings-real,#import-all-settings-real,#export-chat-btn-real,#import-chat-btn-real');
            if (!target) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (target.id === 'group-chat-btn') return openGroup(SESSION_ID);
            if (target.id === 'session-manager-btn') return ShikiAppShell.showPrimary('conversations');
            if (target.id === 'appearance-settings') return openGlobals();
            if (target.id.includes('data') || /export|import/.test(target.id)) return openBackup();
            const c = NextModel.conversation(SESSION_ID);
            if (target.id === 'mood-function') {
                if (c && c.type === 'direct') return NextMood.open(c.friendIds[0]).catch(NextRuntime.report);
                return showNotification('请从对应好友的设定打开心情日历', 'info');
            }
            if (c && c.type === 'direct') return openFriend(c.friendIds[0]);
            if (c) return openGroup(c.id);
            showNotification('请先选择好友聊天', 'info');
        }, true);
        refreshProfiles(); NextMood.refresh().catch(NextRuntime.report);
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
            if (String(SESSION_ID) === id) { history.replaceState(null, '', location.pathname + location.search); ShikiAppShell.showPrimary('conversations'); }
            ShikiAppShell.refresh();
        });
    }
    global.NextUI = Object.freeze({ initialize, renderFriends, refreshProfiles, openProfile, openFriend, openGroup, openCreate, openBackup, openBackground, openListEditor, deleteConversation, beforeNavigate: () => { if (global.NextRuntime) NextRuntime.flush().catch(NextRuntime.report); } });
})(window);
