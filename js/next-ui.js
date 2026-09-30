(function (global) {
    'use strict';
    let root, page, busy = false, formAvatar = null, avatarVersion = 0, groupsExpanded = true, friendsExpanded = true;
    let groupSelection = new Set(), groupDraft = null;
    let legacyPassThrough = null;
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
            const copy = e('span', 'next-row-copy'); copy.append(e('strong', '', c.name), e('small', '', c.friendIds.map(id => { const f = NextModel.friend(id); return f && (f.remark || f.name); }).filter(Boolean).join('、')));
            row.append(groupAvatar, copy, e('span', 'next-row-chevron', '›')); groupList.append(row);
        });
        friends.forEach(f => {
            const row = button('', 'friend', f.id); row.className = 'next-friend-row';
            const copy = e('span', 'next-row-copy'); copy.append(e('strong', '', f.remark || f.name), e('small', '', NextMood.status(f.id)));
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
    function prepareLegacySettingSurfaces() {
        const gallery = document.getElementById('gallery-banner-entry'); if (gallery) gallery.remove();
        const avatarPanel = document.getElementById('appearance-panel-avatar');
        if (avatarPanel) {
            avatarPanel.querySelectorAll('.settings-section').forEach(section => { if (section.querySelector('.frame-settings-container')) section.remove(); });
            document.querySelectorAll('#appearance-nav-grid [onclick*="showAppearancePanel(\'avatar\')"]').forEach(node => node.remove());
        }
        const keepalive = document.getElementById('keepalive-audio-toggle');
        if (keepalive) {
            const card = keepalive.closest('.cs-card');
            const heading = card && card.previousElementSibling;
            if (card) card.remove();
            if (heading && heading.classList.contains('cs-group-label') && /保活/.test(heading.textContent)) heading.remove();
        }
        const names = document.getElementById('cs-panel-names');
        if (names) {
            names.replaceChildren(e('p', 'cs-group-label', '昵称与备注'));
            names.append(e('p', 'cs-hint', '用户名称请在「我的资料」修改；好友备注请在好友的「设定」中修改。备注会在单聊与群聊中保持一致。'));
            const friendSettings = e('button', 'cs-inline-action', '打开好友资料与备注');
            friendSettings.type = 'button';
            friendSettings.addEventListener('click', () => {
                const conversation = NextModel.conversation(SESSION_ID);
                const friend = conversation && conversation.type === 'direct' && NextModel.friend(conversation.friendIds[0]);
                if (!friend) return showNotification('群聊成员备注请从对应好友资料中修改', 'info');
                hideModal(document.getElementById('chat-modal'));
                openFriend(friend.id);
            });
            names.append(friendSettings);
        }
    }
    function openProfile(id) {
        const f = NextModel.friend(id); if (!f) return;
        const body = start('', 'profile', id);
        page.classList.add('next-profile-page');
        page.querySelector('header button').setAttribute('aria-label', '返回好友列表');
        const card = e('div', 'next-profile-card'), copy = e('div', 'next-profile-copy');
        copy.append(e('h1', '', f.remark || f.name));
        if (f.remark) copy.append(e('p', 'next-profile-original', '原名：' + f.name));
        copy.append(e('p', 'next-profile-status', NextMood.status(id)));
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
        if (f) body.append(field('备注（显示名称）', 'next-friend-remark', 'text', f.remark || ''));
        formAvatar = f && f.avatar || null;
        const preview = avatar(formAvatar); preview.id = 'next-avatar-preview'; body.append(preview);
        body.append(field('头像图片（自动缩小保存）', 'next-avatar-input', 'file'));
        body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp';
        body.append(button('移除头像', 'remove-avatar'));
        if (f) body.append(button('心情日历', 'friend-calendar', f.id));
        body.append(button('保存好友资料', 'save-friend'));
        if (f && !f.deleted) body.append(button('删除好友（保留聊天）', 'delete-friend', f.id));
        if (f && f.deleted) body.append(e('p', 'next-note', '好友已删除，历史资料和字卡仍保留，不再自动发言。'));
    }
    function openGroup(id) {
        const c = NextModel.conversation(id);
        if (c) return openGroupForm(c);
        groupSelection = new Set(); groupDraft = null;
        openGroupSelection();
    }
    function openReplyLibraryForCurrent() {
        const conversation = NextModel.conversation(SESSION_ID);
        if (!conversation) return showNotification('请先选择聊天', 'info');
        const members = NextModel.members(conversation.id).filter(friend => !friend.deleted);
        if (!members.length) return showNotification('当前聊天没有可编辑的好友字卡', 'info');
        if (conversation.type === 'direct') return openReplyLibraryForFriend(members[0].id);
        const body = start('选择要编辑字卡的好友', 'card-owner', conversation.id);
        members.forEach(friend => {
            const row = button(friend.remark || friend.name, 'edit-friend-cards', friend.id);
            row.classList.add('next-friend-row');
            row.prepend(avatar(friend.avatar));
            body.append(row);
        });
    }
    async function openReplyLibraryForFriend(friendId) {
        try {
            const conversation = NextModel.conversation(SESSION_ID);
            const owner = NextModel.friend(friendId);
            if (conversation && conversation.type === 'direct' && owner) {
                const oldCards = await localforage.getItem(getSessionStorageKey(conversation.id, 'customReplies'));
                const extras = Array.isArray(oldCards) ? oldCards.filter(card => typeof card === 'string' && card.trim() && !owner.cards.includes(card)) : [];
                if (extras.length && confirm('发现此单聊旧回复库中有 ' + extras.length + ' 张未写入好友资料的字卡。要恢复到该好友的共用字卡吗？')) {
                    await NextModel.saveFriend({ id: friendId, cards: owner.cards.concat(extras) });
                }
            }
            await NextRuntime.beginCardEditor(friendId);
            if (page && page.dataset.kind === 'card-owner') close();
            if (global.NextInput) NextInput.close();
            if (typeof global.openLegacyReplyLibrary !== 'function') throw new Error('原版自定义回复界面不可用');
            global.openLegacyReplyLibrary();
        } catch (error) { NextRuntime.report(error); }
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
        const globals = NextRuntime.globals();
        body.append(field('我的名称', 'next-my-name', 'text', globals.myName || settings.myName));
        body.append(field('我的当前状态', 'next-my-status', 'text', globals.myStatus || ''));
        formAvatar = globals.myAvatar || null;
        body.append(Object.assign(avatar(formAvatar), { id: 'next-avatar-preview' }), field('我的头像', 'next-avatar-input', 'file'));
        body.querySelector('#next-avatar-input').accept = 'image/png,image/jpeg,image/webp';
        const theme = e('label', 'next-field', '主题'); const select = e('select'); select.id = 'next-theme'; select.setAttribute('aria-label', '主题');
        [['black-white', '黑白'], ['gold', '暖金'], ['green', '绿色']].forEach(([v, t]) => { const o = e('option', '', t); o.value = v; select.append(o); }); select.value = globals.colorTheme || 'black-white'; if (!select.value) select.value = 'black-white'; theme.append(select); body.append(theme);
        const dark = e('label', 'next-field', '夜间模式'); const checkbox = e('input'); checkbox.id = 'next-dark'; checkbox.type = 'checkbox'; checkbox.checked = !!globals.isDarkMode; checkbox.setAttribute('aria-label', '夜间模式'); dark.append(checkbox); body.append(dark);
        body.append(e('h3', 'next-settings-heading', '全站功能'));
        body.append(e('p', 'next-note', '保活音频是全站辅助功能；浏览器或系统仍可能暂停后台网页。'));
        body.append(button('切换后台保活音频', 'toggle-keepalive'));
        const keepalive = e('p', 'next-note'); keepalive.id = 'next-keepalive-status';
        const legacyKeepalive = document.getElementById('keepalive-audio-desc');
        keepalive.textContent = legacyKeepalive ? legacyKeepalive.textContent : '保活状态由浏览器控制';
        body.append(keepalive, button('请求本机消息通知权限', 'notification'));
        body.append(button('保存网站设置', 'save-globals'));
    }
    function openBackup() {
        const id = String(SESSION_ID || ''), conversation = NextModel.conversation(id);
        const body = start('当前聊天 · 数据管理', 'backup', id);
        if (!conversation) { body.append(e('p', 'next-note', '请从聊天列表先打开一个会话，再管理该聊天的数据。')); return; }
        body.append(e('p', 'next-note', '全量备份只包含当前聊天、会话设置与该聊天成员的共享好友资料快照（含头像）。恢复好友快照会影响所有引用该好友的聊天，并需单独确认；其它会话与全站设置不会纳入。旧站备份不受影响。'));
        body.append(button('导出当前聊天全量备份', 'export-conversation', id), button('导出聊天记录（仅消息）', 'export-messages', id));
        body.append(field('导入当前聊天备份（仅同一会话 ID 与成员）', 'next-import-file', 'file'));
        body.querySelector('#next-import-file').accept = '.json,application/json';
        body.append(e('p', 'next-note', '备份包含好友资料快照中的头像字段；背景图库、贴图媒体、消息内图片/音视频/附件载荷与共同活动媒体不包含，消息以文字占位保留。单条导出文件上限 10MB。导入不会按名称匹配，也不会清理其它聊天、全站设置或旧站数据。目标聊天原有的未纳入媒体会保留。'));
    }
    function openBackgroundSettings() {
        return openGlobals();
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
        if (action === 'edit-friend-cards') return openReplyLibraryForFriend(id);
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
                const input = { name: page.querySelector('#next-friend-name').value, remark: page.querySelector('#next-friend-remark')?.value || '', avatar: formAvatar };
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
                const next = { myName: page.querySelector('#next-my-name').value.trim().slice(0, 40) || '我', myStatus: page.querySelector('#next-my-status').value.trim().slice(0, 200), myAvatar: formAvatar, colorTheme: page.querySelector('#next-theme').value, isDarkMode: page.querySelector('#next-dark').checked };
                await NextRuntime.saveGlobals(next); NextRuntime.applyCurrent(); refreshProfiles(); close(); showNotification('已保存', 'success');
            }
            if (action === 'export-conversation') { await NextRuntime.flush(); const backup = await NextBackup.exportConversation(id); downloadFileFallback(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'shiki-chat-' + id + '-' + Date.now() + '.json'); }
            if (action === 'export-messages') { await NextRuntime.flush(); const backup = await NextBackup.exportMessages(id); downloadFileFallback(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), 'shiki-messages-' + id + '-' + Date.now() + '.json'); }
        });
    }
    function initialize() {
        root = document.getElementById('shiki-app-shell');
        prepareLegacySettingSurfaces();
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
                const file = event.target.files[0]; event.target.value = '';
                if (file.size > 10 * 1024 * 1024) throw new Error('单个聊天备份上限为 10MB');
                const data = JSON.parse(await file.text()), targetId = String(page.dataset.id || '');
                NextBackup.validateConversation(data);
                if (data.sessionId !== targetId) throw new Error('备份属于另一会话，已取消；不会按名称合并');
                if (!confirm('将恢复此聊天的消息、草稿和会话设置。该聊天现有数据会被备份内容替换；其它会话不受影响。继续吗？')) return;
                const restoreShared = confirm('是否同时恢复好友资料快照（备注、字卡及回复偏好）？选择“确定”会影响所有引用这些好友的单聊和群聊；选择“取消”则仅恢复当前聊天数据。');
                await NextRuntime.flush(); NextRuntime.cancelReplies();
                await NextBackup.importConversation(data, targetId, restoreShared);
                if (!await loadData()) throw new Error('导入已写入，但聊天重新读取失败；请重试刷新当前聊天');
                NextRuntime.applyCurrent(); renderMessages(); close();
                ShikiAppShell.refresh(); showNotification('当前聊天备份已恢复', 'success');
            });
        });
        // Guard legacy entry points before their document-level handlers run.
        document.addEventListener('click', event => {
            const target = event.target.closest('#mood-function,#group-chat-btn,#session-manager-btn,#custom-replies-function,#chat-settings,#advanced-settings,#data-settings,#appearance-settings,#export-all-settings,#import-all-settings,#export-chat-btn,#import-chat-btn,#export-all-settings-real,#import-all-settings-real,#export-chat-btn-real,#import-chat-btn-real');
            if (!target) return;
            if (legacyPassThrough === target.id) { legacyPassThrough = null; return; }
            event.preventDefault(); event.stopImmediatePropagation();
            if (target.id === 'group-chat-btn') return openGroup(SESSION_ID);
            if (target.id === 'session-manager-btn') return ShikiAppShell.showPrimary('conversations');
            if (target.id === 'appearance-settings' || target.id === 'chat-settings' || target.id === 'advanced-settings') {
                legacyPassThrough = target.id;
                setTimeout(() => {
                    if (legacyPassThrough === target.id) target.click();
                }, 0);
                return;
            }
            if (target.id.includes('data') || /export|import/.test(target.id)) return openBackup();
            const c = NextModel.conversation(SESSION_ID);
            if (target.id === 'mood-function') {
                if (c && c.type === 'direct') return NextMood.open(c.friendIds[0]).catch(NextRuntime.report);
                return showNotification('请从对应好友的设定打开心情日历', 'info');
            }
            if (target.id === 'custom-replies-function') return openReplyLibraryForCurrent();
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
    global.NextUI = Object.freeze({ initialize, renderFriends, refreshProfiles, openProfile, openFriend, openGroup, openCreate, openBackup, openBackground, openListEditor, openReplyLibraryForCurrent, deleteConversation, beforeNavigate: () => { if (global.NextRuntime) NextRuntime.flush().catch(NextRuntime.report); } });
})(window);
