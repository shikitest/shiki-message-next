(function (global) {
    'use strict';

    let context = null;
    let page = null;
    let chatBar = null;
    let avatarInput = null;
    let initialized = false;
    let refreshVersion = 0;

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function currentSession() {
        return context && context.getCurrentSession ? context.getCurrentSession() : null;
    }

    function currentMeta() {
        const session = currentSession();
        return session && global.ConversationMetaStore
            ? global.ConversationMetaStore.get(session.id, {
                isCurrent: true,
                legacyGroupEnabled: context.getLegacyGroupEnabled && context.getLegacyGroupEnabled()
            })
            : { type: 'direct', pinned: false, avatarRef: null };
    }

    function isGroup() {
        const meta = currentMeta();
        return meta.type === 'group' || meta.legacyGroup;
    }

    function fallbackAvatar() {
        const source = document.querySelector('#partner-avatar img');
        return source ? source.src : null;
    }

    async function avatarUrl() {
        const session = currentSession();
        if (global.NextModel && session && session.type === 'direct') return (global.NextModel.friend(session.friendIds[0]) || {}).avatar || null;
        const meta = currentMeta();
        if (session && meta.avatarRef && global.ConversationAvatarStore) {
            try {
                const url = await global.ConversationAvatarStore.getObjectUrl(session.id);
                if (url) return url;
            } catch (error) {
                console.warn('[ChatDetail] 会话头像读取失败:', error);
            }
        }
        return isGroup() ? null : fallbackAvatar();
    }

    function renderAvatar(target, url) {
        if (!target) return;
        const key = url || (isGroup() ? 'fallback:group' : 'fallback:direct');
        if (target.dataset.avatarKey === key) return;
        target.dataset.avatarKey = key;
        target.replaceChildren();
        if (url) {
            const image = make('img');
            image.src = url;
            image.alt = '';
            image.decoding = 'async';
            target.appendChild(image);
        } else {
            target.appendChild(global.ShikiAppShell.createIcon(isGroup() ? 'friends' : 'user'));
        }
    }

    function renderGroupMembers(members) {
        const section = page && page.querySelector('.shiki-detail-members');
        if (!section) return;
        section.hidden = !isGroup() || page.dataset.mode === 'settings';
        const list = section.querySelector('.shiki-detail-member-list');
        list.replaceChildren();
        (Array.isArray(members) ? members : []).forEach(function (member) {
            const row = make('div', 'shiki-detail-member');
            const avatar = make('span', 'shiki-detail-member-avatar');
            if (member.avatar) {
                const image = make('img');
                image.src = member.avatar;
                image.alt = '';
                avatar.appendChild(image);
            } else avatar.appendChild(global.ShikiAppShell.createIcon('user'));
            row.append(avatar, make('span', '', member.name || '群成员'));
            list.appendChild(row);
        });
        if (!list.childNodes.length) list.appendChild(make('div', 'shiki-record-empty', '暂未添加群成员'));
    }

    async function refresh() {
        if (!initialized) return;
        const version = ++refreshVersion;
        const session = currentSession() || {};
        const meta = currentMeta();
        const group = isGroup();
        const friendRow = page.querySelector('[data-detail-action="friend-profile"]');
        const settingsMode = page.dataset.mode === 'settings';
        if (friendRow) friendRow.hidden = group || settingsMode;
        const title = session.name || (context.getPartnerName ? context.getPartnerName() : '未命名会话');
        const members = group && context.getGroupMembers ? context.getGroupMembers() : [];
        const subtitle = group ? ((Array.isArray(members) ? members.length : 0) + ' 位成员') : (context.getPartnerStatus ? context.getPartnerStatus() : '');
        chatBar.querySelector('.shiki-chat-title').textContent = title;
        chatBar.querySelector('.shiki-chat-subtitle').textContent = subtitle;
        page.querySelector('.shiki-detail-name').textContent = title;
        page.querySelector('.shiki-detail-type').textContent = group ? '群聊 · ' + subtitle : '单聊';
        const pinLabel = page.querySelector('[data-detail-action="pin"] span');
        if (pinLabel) pinLabel.textContent = meta.pinned ? '取消置顶聊天' : '置顶聊天';
        const groupRow = page.querySelector('[data-detail-action="group"]');
        if (groupRow) groupRow.hidden = !group || settingsMode;
        const renameRow = page.querySelector('[data-detail-action="rename-group"]');
        if (renameRow) renameRow.hidden = !group || settingsMode;
        renderGroupMembers(members);
        const url = await avatarUrl();
        if (version !== refreshVersion || String((currentSession() || {}).id || '') !== String(session.id || '')) return;
        renderAvatar(chatBar.querySelector('.shiki-chat-avatar'), url);
        renderAvatar(page.querySelector('.shiki-detail-avatar'), url);
    }

    function buildChatBar() {
        chatBar = make('header', 'shiki-chat-topbar');
        chatBar.id = 'shiki-chat-topbar';
        chatBar.innerHTML = [
            '<button type="button" data-chat-action="back" aria-label="返回会话列表"></button>',
            '<span class="shiki-chat-avatar"></span>',
            '<span class="shiki-chat-heading"><strong class="shiki-chat-title"></strong><small class="shiki-chat-subtitle"></small></span>',
            '<button type="button" data-chat-action="search" aria-label="搜索聊天"></button>',
            '<button type="button" data-chat-action="detail" aria-label="聊天详情"></button>',
            '<button type="button" data-chat-action="settings" aria-label="聊天设置"></button>'
        ].join('');
        [['back', 'back'], ['search', 'search'], ['detail', 'menu'], ['settings', 'settings']].forEach(function (entry) {
            chatBar.querySelector('[data-chat-action="' + entry[0] + '"]').appendChild(global.ShikiAppShell.createIcon(entry[1]));
        });
        document.body.appendChild(chatBar);
        chatBar.addEventListener('click', function (event) {
            if (event.target.closest('[data-chat-action="back"]')) return context.backToConversations && context.backToConversations();
            if (event.target.closest('[data-chat-action="search"]')) return global.MessageSearch && global.MessageSearch.open();
            if (event.target.closest('[data-chat-action="settings"]')) return open('settings');
            if (event.target.closest('[data-chat-action="detail"]')) return open();
        });
    }

    function row(action, icon, label, danger) {
        const item = make('button', 'shiki-detail-row' + (danger ? ' danger' : ''));
        item.type = 'button';
        item.dataset.detailAction = action;
        item.append(make('i', 'fas ' + icon), make('span', '', label), make('i', 'fas fa-chevron-right'));
        return item;
    }

    function buildPage() {
        page = make('section', 'shiki-record-page shiki-chat-detail-page');
        page.id = 'shiki-chat-detail-page';
        page.hidden = true;
        const header = make('header', 'shiki-record-header');
        const back = make('button');
        back.type = 'button';
        back.dataset.detailAction = 'close';
        back.setAttribute('aria-label', '返回');
        back.appendChild(global.ShikiAppShell.createIcon('close'));
        header.append(make('span'), make('h2', '', '聊天详情'), back);
        const profile = make('div', 'shiki-detail-profile');
        profile.innerHTML = '<span class="shiki-detail-avatar"></span><strong class="shiki-detail-name"></strong><small class="shiki-detail-type"></small>';
        const avatarActions = make('div', 'shiki-detail-avatar-actions');
        avatarActions.append(row('avatar', 'fa-camera', '更换会话头像'), row('avatar-reset', 'fa-rotate-left', '恢复默认头像'));
        const actions = make('div', 'shiki-detail-actions');
        actions.append(
            row('friend-profile', 'fa-user', '好友资料'),
            row('rename-group', 'fa-pen', '修改群聊名称'),
            row('search', 'fa-search', '查找聊天内容'),
            row('date', 'fa-calendar-days', '按日期查找'),
            row('media', 'fa-photo-film', '聊天文件与媒体'),
            row('pin', 'fa-thumbtack', '置顶聊天'),
            row('background', 'fa-image', '设置当前聊天背景'),
            row('group', 'fa-users-gear', '群聊设置'),
            row('clear', 'fa-trash', '清空聊天记录', true),
            row('delete-conversation', 'fa-trash', '删除聊天（保留好友）', true)
        );
        const members = make('section', 'shiki-detail-members');
        members.innerHTML = '<h3>群成员</h3><div class="shiki-detail-member-list"></div>';
        avatarInput = make('input');
        avatarInput.type = 'file';
        avatarInput.accept = 'image/*';
        avatarInput.hidden = true;
        page.append(header, profile, members, avatarActions, actions, avatarInput);
        document.body.appendChild(page);
        page.addEventListener('click', handleClick);
        avatarInput.addEventListener('change', handleAvatar);
    }

    function open(mode) {
        const settingsMode = mode === 'settings';
        page.dataset.mode = settingsMode ? 'settings' : 'detail';
        refresh();
        page.querySelector('.shiki-record-header h2').textContent = settingsMode ? '设置' : '聊天详情';
        page.querySelector('.shiki-detail-profile').hidden = settingsMode;
        page.querySelector('.shiki-detail-avatar-actions').hidden = settingsMode;
        page.querySelectorAll('[data-detail-action]').forEach(function (item) {
            const action = item.dataset.detailAction;
            if (['friend-profile', 'rename-group', 'group'].includes(action)) item.hidden = settingsMode || (action === 'friend-profile' ? isGroup() : !isGroup());
        });
        const members = page.querySelector('.shiki-detail-members');
        members.hidden = settingsMode || !isGroup();
        page.hidden = false;
        document.body.classList.add('shiki-record-page-active');
    }

    function close() {
        page.hidden = true;
        document.body.classList.remove('shiki-record-page-active');
    }

    async function handleAvatar() {
        const file = avatarInput.files && avatarInput.files[0];
        avatarInput.value = '';
        const session = currentSession();
        if (!file || !session || !global.ConversationAvatarStore) return;
        try {
            const avatarRef = await global.ConversationAvatarStore.save(session.id, file);
            await global.ConversationMetaStore.update(session.id, { avatarRef: avatarRef });
            await refresh();
            if (context.refreshConversations) context.refreshConversations();
            if (context.notify) context.notify('会话头像已更新', 'success');
        } catch (error) {
            if (context.notify) context.notify(error.message || '头像保存失败', 'error');
        }
    }

    async function handleClick(event) {
        const item = event.target.closest('[data-detail-action]');
        if (!item) return;
        const action = item.dataset.detailAction;
        if (action === 'close') return close();
        if (action === 'search') {
            close();
            return global.MessageSearch && global.MessageSearch.open();
        }
        if (action === 'date') {
            close();
            return global.MessageDateSearch && global.MessageDateSearch.open();
        }
        if (action === 'media') {
            close();
            return global.MessageSearch && global.MessageSearch.open('image');
        }
        if (action === 'avatar') {
            const c = currentSession();
            if (global.NextUI && c && c.type === 'direct') { close(); return global.NextUI.openFriend(c.friendIds[0]); }
            return avatarInput.click();
        }
        const session = currentSession();
        if (!session) return;
        if (action === 'friend-profile' && global.NextUI) { close(); return global.NextUI.openProfile(session.friendIds[0]); }
        if (action === 'delete-conversation' && global.NextUI) { close(); return global.NextUI.deleteConversation(session.id); }
        if (action === 'group' && global.NextUI) { close(); return global.NextUI.openGroup(session.id); }
        if (action === 'avatar-reset' && global.NextUI && session.type === 'direct') { close(); return global.NextUI.openFriend(session.friendIds[0]); }
        if (action === 'rename-group') {
            const previousName = session.name || '';
            const nextName = global.prompt('输入新的群聊名称：', previousName);
            if (!nextName || !nextName.trim() || nextName.trim() === previousName) return;
            try {
                await context.renameSession(session.id, nextName.trim());
                await refresh();
                if (context.refreshConversations) context.refreshConversations();
                if (context.notify) context.notify('群聊名称已更新', 'success');
            } catch (error) {
                if (context.notify) context.notify('群聊名称保存失败，原名称未改变', 'error');
            }
            return;
        }
        if (action === 'avatar-reset') {
            try {
                if (global.ConversationAvatarStore) await global.ConversationAvatarStore.remove(session.id);
                await global.ConversationMetaStore.update(session.id, { avatarRef: null });
                await refresh();
                if (context.refreshConversations) context.refreshConversations();
            } catch (error) {
                if (context.notify) context.notify('恢复默认头像失败', 'error');
            }
            return;
        }
        if (action === 'pin') {
            const meta = currentMeta();
            await global.ConversationMetaStore.update(session.id, { pinned: !meta.pinned, updatedAt: meta.updatedAt });
            await refresh();
            if (context.refreshConversations) context.refreshConversations();
            return;
        }
        if (action === 'background') {
            close();
            if (global.NextUI) return global.NextUI.openBackground();
            return context.openLegacy && context.openLegacy('background-input');
        }
        if (action === 'group') {
            close();
            return context.openLegacy && context.openLegacy('group-chat-btn');
        }
        if (action === 'clear') {
            close();
            return context.openClearMessages && context.openClearMessages();
        }
    }

    function initialize(nextContext) {
        if (initialized) return;
        context = nextContext || {};
        buildChatBar();
        buildPage();
        initialized = true;
        refresh();
    }

    global.ChatDetail = Object.freeze({
        initialize: initialize,
        open: open,
        close: close,
        refresh: refresh,
        getDebugSnapshot: function () {
            return { initialized: initialized, open: Boolean(page && !page.hidden), chatBars: document.querySelectorAll('#shiki-chat-topbar').length, detailPages: document.querySelectorAll('#shiki-chat-detail-page').length };
        }
    });
})(window);
