(function (global) {
    'use strict';

    const LEGACY_OPEN_CHAT_KEY = 'CHAT_APP_UI_OPEN_CHAT';
    const LEGACY_OPEN_GROUP_SETUP_KEY = 'CHAT_APP_UI_OPEN_GROUP_SETUP';
    const PENDING_NAVIGATION_KEY = 'CHAT_APP_UI_PENDING_NAVIGATION_V1';
    const PENDING_NAVIGATION_MAX_AGE = 60000;
    let initialized = false;
    let context = null;
    let root = null;
    let activeView = 'conversations';
    let searchTimer = null;
    let isCreatingConversation = false;
    let createTransactions = 0;
    let reloadRequests = 0;
    let sessionReloadGeneration = 0;
    const conversationRowCache = new Map();
    let avatarRenderVersion = 0;

    const features = [
        { id: 'watch-together', title: '共同观影', icon: 'fa-film' },
        { id: 'photo-album', title: '照片集', icon: 'fa-images' },
        { id: 'music', title: '音乐播放器', icon: 'fa-music' },
        { id: 'anniversary', title: '纪念日', icon: 'fa-calendar-days' },
        { id: 'mood', title: '心情', icon: 'fa-face-smile' },
        { id: 'games', title: '小游戏', icon: 'fa-gamepad' },
        { id: 'call', title: '通话', icon: 'fa-phone' },
        { id: 'stats', title: '收藏与统计', icon: 'fa-chart-simple' }
    ];

    const settingsEntries = [
        { id: 'profile', title: '资料、翻译与聊天选项', icon: 'fa-user-pen', target: 'chat-settings', scope: 'conversation' },
        { id: 'sessions', title: '会话管理', icon: 'fa-comments', target: 'session-manager-btn', scope: 'global' },
        { id: 'group', title: '当前群聊设置', icon: 'fa-users', target: 'group-chat-btn', scope: 'conversation' },
        { id: 'replies', title: '字卡与回复生成', icon: 'fa-message', target: 'custom-replies-function', scope: 'conversation' },
        { id: 'ime', title: 'IME 自定义词典', icon: 'fa-keyboard', target: 'ime-custom-lexicon-function', scope: 'global' },
        { id: 'appearance', title: '主题、背景与外观', icon: 'fa-palette', target: 'appearance-settings', scope: 'conversation' },
        { id: 'data', title: '数据备份与恢复', icon: 'fa-database', target: 'data-settings', scope: 'global' },
        { id: 'advanced', title: '媒体与高级功能', icon: 'fa-sliders', target: 'advanced-settings', scope: 'conversation' }
    ];

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function button(label, action, iconClass) {
        const node = el('button', 'shiki-shell-button');
        node.type = 'button';
        node.dataset.action = action;
        if (iconClass) {
            const icon = el('i', 'fas ' + iconClass);
            icon.setAttribute('aria-hidden', 'true');
            node.appendChild(icon);
        }
        node.appendChild(el('span', '', label));
        return node;
    }

    function buildTopBar(title, withAdd) {
        const bar = el('header', 'shiki-shell-topbar');
        bar.appendChild(el('h1', '', title));
        if (withAdd) {
            const add = button('新建', 'open-create', 'fa-plus');
            add.classList.add('shiki-shell-icon-button');
            bar.appendChild(add);
        }
        return bar;
    }

    function buildConversationsView() {
        const view = el('section', 'shiki-shell-view');
        view.dataset.view = 'conversations';
        view.appendChild(buildTopBar('聊天', true));
        const searchWrap = el('div', 'shiki-conversation-search');
        searchWrap.appendChild(el('i', 'fas fa-search'));
        const search = el('input');
        search.type = 'search';
        search.id = 'shiki-conversation-search-input';
        search.placeholder = '搜索会话名称';
        search.autocomplete = 'off';
        searchWrap.appendChild(search);
        view.appendChild(searchWrap);
        const list = el('div', 'shiki-conversation-list');
        list.id = 'shiki-conversation-list';
        view.appendChild(list);
        return view;
    }

    function buildHubView(name, title, entries) {
        const view = el('section', 'shiki-shell-view');
        view.dataset.view = name;
        view.hidden = true;
        view.appendChild(buildTopBar(title, false));
        const intro = el('p', 'shiki-hub-intro', name === 'more'
            ? '常用功能与未来扩展入口'
            : '原有设置和数据保持不变');
        view.appendChild(intro);
        const grid = el('div', name === 'more' ? 'shiki-feature-grid' : 'shiki-settings-list');
        entries.forEach(function (entry) {
            const item = button(entry.title, name === 'more' ? 'feature' : 'setting', entry.icon);
            item.dataset.id = entry.id;
            if (entry.pending) item.appendChild(el('small', 'shiki-pending-badge', '即将开放'));
            grid.appendChild(item);
        });
        view.appendChild(grid);
        return view;
    }

    function buildNavigation() {
        const nav = el('nav', 'shiki-shell-nav');
        [
            ['conversations', '聊天', 'fa-comment-dots'],
            ['friends', '好友', 'fa-user-group'],
            ['more', '更多', 'fa-border-all'],
            ['settings', '设置', 'fa-gear']
        ].forEach(function (item) {
            const tab = button(item[1], 'navigate', item[2]);
            tab.dataset.view = item[0];
            if (item[0] === 'conversations') tab.classList.add('active');
            nav.appendChild(tab);
        });
        return nav;
    }

    function buildCreateDialog() {
        const overlay = el('div', 'shiki-create-overlay');
        overlay.id = 'shiki-create-overlay';
        overlay.hidden = true;
        const panel = el('div', 'shiki-create-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.appendChild(el('h2', '', '新建会话'));
        const types = el('div', 'shiki-create-types');
        const direct = button('单人聊天', 'select-create-type', 'fa-user');
        direct.dataset.type = 'direct';
        direct.classList.add('active');
        const group = button('群组聊天', 'select-create-type', 'fa-users');
        group.dataset.type = 'group';
        types.append(direct, group);
        panel.appendChild(types);
        const input = el('input', 'shiki-create-name');
        input.id = 'shiki-create-name';
        input.placeholder = '输入会话名称';
        input.maxLength = 30;
        panel.appendChild(input);
        const actions = el('div', 'shiki-create-actions');
        actions.append(button('取消', 'close-create'), button('创建', 'create-conversation'));
        panel.appendChild(actions);
        overlay.appendChild(panel);
        return overlay;
    }

    function build() {
        root = el('div', 'shiki-app-shell');
        root.id = 'shiki-app-shell';
        root.append(
            buildConversationsView(),
            buildHubView('more', '更多', features),
            buildHubView('settings', '设置', settingsEntries),
            buildNavigation(),
            buildCreateDialog()
        );
        document.body.appendChild(root);
    }

    function formatDate(value) {
        const time = Number(value);
        if (!Number.isFinite(time)) return '';
        const date = new Date(time);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    }

    function getSessions() {
        const sessions = context && context.getSessions ? context.getSessions() : [];
        return Array.isArray(sessions) ? sessions.slice() : [];
    }

    function metaFor(session) {
        const currentId = context.getCurrentSessionId();
        return global.ConversationMetaStore.get(session.id, {
            isCurrent: String(session.id) === String(currentId),
            legacyGroupEnabled: context.getLegacyGroupEnabled()
        });
    }

    function setAvatarFallback(avatar, type) {
        if (avatar.querySelector('img')) return;
        avatar.replaceChildren(el('i', 'fas ' + (type === 'group' ? 'fa-users' : 'fa-user')));
    }

    function renderAvatar(avatar, session, meta) {
        if (global.NextModel && session.type === 'direct') {
            const friend = global.NextModel.friend(session.friendIds[0]);
            const key = friend && friend.avatar || 'next-friend-fallback';
            if (avatar.dataset.avatarKey === key) return;
            avatar.dataset.avatarKey = key;
            avatar.replaceChildren();
            if (friend && friend.avatar) { const image = el('img'); image.src = friend.avatar; image.alt = ''; avatar.appendChild(image); }
            else setAvatarFallback(avatar, 'direct');
            return;
        }
        const sessionId = String(session.id);
        const currentId = String(context.getCurrentSessionId());
        const currentAvatar = meta.type === 'direct' && sessionId === currentId
            ? document.querySelector('#partner-avatar img')
            : null;
        const legacySrc = currentAvatar && currentAvatar.src ? currentAvatar.src : '';
        const avatarKey = meta.avatarRef ? 'custom:' + sessionId + ':' + meta.avatarRef : 'legacy:' + legacySrc + ':' + meta.type;
        if (avatar.dataset.avatarKey === avatarKey) return;
        avatar.dataset.avatarKey = avatarKey;
        const version = String(++avatarRenderVersion);
        avatar.dataset.avatarVersion = version;
        if (!meta.avatarRef) {
            if (legacySrc) {
                const image = el('img');
                image.src = legacySrc;
                image.alt = '';
                image.decoding = 'async';
                avatar.replaceChildren(image);
            } else {
                setAvatarFallback(avatar, meta.type);
            }
            return;
        }
        if (!global.ConversationAvatarStore) return setAvatarFallback(avatar, meta.type);
        setAvatarFallback(avatar, meta.type);
        global.ConversationAvatarStore.getObjectUrl(sessionId).then(function (url) {
            if (!url || !avatar.isConnected || avatar.dataset.avatarVersion !== version || avatar.dataset.avatarKey !== avatarKey) return;
            if (avatar.closest('[data-session-id]')?.dataset.sessionId !== sessionId) return;
            const image = el('img');
            image.alt = '';
            image.decoding = 'async';
            image.addEventListener('load', function () {
                if (avatar.isConnected && avatar.dataset.avatarVersion === version && avatar.dataset.avatarKey === avatarKey) {
                    avatar.replaceChildren(image);
                }
            }, { once: true });
            image.addEventListener('error', function () { setAvatarFallback(avatar, meta.type); }, { once: true });
            image.src = url;
            if (image.complete && image.naturalWidth > 0) image.dispatchEvent(new Event('load'));
        }).catch(function (error) {
            console.warn('[AppShell] 会话头像读取失败:', error);
            if (avatar.dataset.avatarVersion === version) setAvatarFallback(avatar, meta.type);
        });
    }

    function updateConversationRow(item, row) {
        const session = row.session;
        const meta = row.meta;
        item.dataset.sessionId = String(session.id);
        renderAvatar(item.querySelector('.shiki-conversation-avatar'), session, meta);
        item.querySelector('.shiki-conversation-name').textContent = session.name || '未命名会话';
        item.querySelector('.shiki-conversation-type').textContent = meta.type === 'group' ? '群聊' : '单聊';
        const legacy = item.querySelector('.shiki-legacy-badge');
        legacy.hidden = !meta.legacyGroup;
        item.querySelector('.shiki-conversation-preview').textContent = meta.lastMessagePreview || '已有会话';
        item.querySelector('time').textContent = formatDate(meta.lastMessageAt || meta.updatedAt || session.createdAt);
        const pin = item.querySelector('.shiki-pin-button');
        pin.dataset.sessionId = String(session.id);
        pin.classList.toggle('active', Boolean(meta.pinned));
        pin.setAttribute('aria-label', meta.pinned ? '取消置顶' : '置顶');
    }

    function createConversationRow(row) {
        const item = el('div', 'shiki-conversation-row');
        item.dataset.action = 'open-session';
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        const avatar = el('span', 'shiki-conversation-avatar');
        const body = el('span', 'shiki-conversation-body');
        const titleLine = el('span', 'shiki-conversation-title-line');
        titleLine.append(el('strong', 'shiki-conversation-name'), el('small', 'shiki-conversation-type'));
        const legacy = el('small', 'shiki-legacy-badge', '旧群聊');
        legacy.hidden = true;
        titleLine.appendChild(legacy);
        body.append(titleLine, el('span', 'shiki-conversation-preview'));
        const side = el('span', 'shiki-conversation-side');
        side.appendChild(el('time'));
        const pin = button('', 'toggle-pin', 'fa-thumbtack');
        pin.className = 'shiki-pin-button';
        side.appendChild(pin);
        item.append(avatar, body, side);
        updateConversationRow(item, row);
        return item;
    }

    function renderConversations(query) {
        if (!root) return;
        const list = root.querySelector('#shiki-conversation-list');
        if (!list) return;
        const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
        const rows = getSessions().map(function (session, index) {
            return { session: session, meta: metaFor(session), index: index };
        }).filter(function (row) {
            return !normalizedQuery || String(row.session.name || '').toLocaleLowerCase().includes(normalizedQuery);
        }).sort(function (a, b) {
            if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
            const aTime = a.meta.lastMessageAt || a.meta.updatedAt || a.session.createdAt || 0;
            const bTime = b.meta.lastMessageAt || b.meta.updatedAt || b.session.createdAt || 0;
            return bTime - aTime || a.index - b.index;
        });
        const liveSessionIds = new Set(getSessions().map(function (session) { return String(session.id); }));
        conversationRowCache.forEach(function (node, id) {
            if (!liveSessionIds.has(id)) {
                node.remove();
                conversationRowCache.delete(id);
            }
        });
        if (!rows.length) {
            let empty = list.querySelector('.shiki-conversation-empty');
            if (!empty) {
                empty = el('div', 'shiki-conversation-empty');
                empty.append(el('i', 'far fa-comments'), el('strong'), el('span'));
            }
            empty.querySelector('strong').textContent = normalizedQuery ? '没有匹配的会话' : '还没有会话';
            empty.querySelector('span').textContent = normalizedQuery ? '换个名称试试' : '点击右上角新建会话';
            list.replaceChildren(empty);
            return;
        }
        const fragment = document.createDocumentFragment();
        rows.forEach(function (row) {
            const id = String(row.session.id);
            let item = conversationRowCache.get(id);
            if (!item) {
                item = createConversationRow(row);
                conversationRowCache.set(id, item);
            } else updateConversationRow(item, row);
            fragment.appendChild(item);
        });
        list.replaceChildren(fragment);
    }

    function showPrimary(viewName) {
        if (global.NextUI) global.NextUI.beforeNavigate();
        if (!root) return;
        if (document.body.classList.contains('shiki-chat-view-active') && typeof global.saveDataForSession === 'function') {
            Promise.resolve(global.saveDataForSession(context.getCurrentSessionId())).catch(function (error) {
                console.warn('[AppShell] 返回主页前保存失败:', error);
                notify('部分设置尚未保存，请稍后重试', 'warning');
            });
        }
        activeView = viewName || 'conversations';
        root.hidden = false;
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('shiki-primary-view-active');
        document.body.classList.remove('shiki-chat-view-active');
        setLegacyChatAvailable(false);
        root.querySelectorAll('.shiki-shell-view').forEach(function (view) {
            view.hidden = view.dataset.view !== activeView;
        });
        root.querySelectorAll('.shiki-shell-nav [data-view]').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.view === activeView);
        });
        if (activeView === 'conversations') renderConversations(root.querySelector('#shiki-conversation-search-input').value);
    }

    function showChat() {
        if (!root) return;
        root.hidden = true;
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('shiki-primary-view-active');
        document.body.classList.add('shiki-chat-view-active');
        setLegacyChatAvailable(true);
        if (global.ChatDetail && typeof global.ChatDetail.refresh === 'function') global.ChatDetail.refresh();
    }

    function setLegacyChatAvailable(available) {
        ['.header', '#chat-container', '#empty-state', '#typing-indicator-wrapper', '.input-area-wrapper'].forEach(function (selector) {
            const node = document.querySelector(selector);
            if (!node) return;
            node.setAttribute('aria-hidden', available ? 'false' : 'true');
            if ('inert' in node) node.inert = !available;
        });
    }

    function clearLegacyNavigationFlags() {
        try {
            NextStorage.session.removeItem(LEGACY_OPEN_CHAT_KEY);
            NextStorage.session.removeItem(LEGACY_OPEN_GROUP_SETUP_KEY);
        } catch (error) {}
    }

    function queueNavigation(sessionId, groupSetup, reason) {
        const id = String(sessionId || '');
        if (!id) return false;
        try {
            NextStorage.session.setItem(PENDING_NAVIGATION_KEY, JSON.stringify({
                version: 1,
                sessionId: id,
                groupSetup: groupSetup === true,
                reason: reason === 'created' ? 'created' : 'selected',
                createdAt: Date.now()
            }));
            return true;
        } catch (error) {
            console.warn('[AppShell] 无法保存一次性会话导航状态:', error);
            return false;
        }
    }

    function consumeNavigation() {
        clearLegacyNavigationFlags();
        let raw = null;
        try {
            raw = NextStorage.session.getItem(PENDING_NAVIGATION_KEY);
            NextStorage.session.removeItem(PENDING_NAVIGATION_KEY);
        } catch (error) { return null; }
        if (!raw) return null;
        try {
            const value = JSON.parse(raw);
            const age = Date.now() - Number(value.createdAt);
            const id = String(value.sessionId || '');
            if (value.version !== 1 || !id || !Number.isFinite(age) || age < 0 || age > PENDING_NAVIGATION_MAX_AGE) return null;
            if (!getSessions().some(function (session) { return String(session.id) === id; })) return null;
            if (String(context.getCurrentSessionId()) !== id) return null;
            return { sessionId: id, groupSetup: value.groupSetup === true, reason: value.reason };
        } catch (error) { return null; }
    }

    async function requestSessionReload(sessionId, groupSetup, reason) {
        if (global.NextRuntime) {
            try { await global.NextRuntime.open(String(sessionId)); return true; }
            catch (error) { global.NextRuntime.report(error); return false; }
        }
        const requestedSessionId = String(sessionId || '');
        const reloadGeneration = ++sessionReloadGeneration;
        if (!requestedSessionId || !getSessions().some(function (session) { return String(session.id) === requestedSessionId; })) {
            notify('目标会话不存在，已取消切换', 'warning');
            return false;
        }
        const currentSessionId = context.getCurrentSessionId();
        if (currentSessionId && typeof global.saveDataForSession === 'function') {
            try {
                if (typeof global.flushThrottledSaveData === 'function') {
                    await global.flushThrottledSaveData(currentSessionId);
                }
                if (reloadGeneration !== sessionReloadGeneration) return false;
                const saveResult = await global.saveDataForSession(currentSessionId);
                if (saveResult && Array.isArray(saveResult.failed) && saveResult.failed.length) {
                    throw new Error('Failed storage groups: ' + saveResult.failed.join(', '));
                }
                if (typeof global.flushPendingSessionSaves === 'function') await global.flushPendingSessionSaves(currentSessionId);
                if (reloadGeneration !== sessionReloadGeneration) return false;
            } catch (error) {
                console.warn('[AppShell] 切换会话前保存失败:', error);
                notify('当前会话保存失败，请重试后再切换', 'error');
                return false;
            }
        }
        if (global.SessionRuntimeStore) global.SessionRuntimeStore.invalidate();
        if (reloadGeneration !== sessionReloadGeneration) return false;
        if (!queueNavigation(requestedSessionId, groupSetup, reason)) {
            notify('浏览器无法保存页面切换状态，刷新后请再次点击会话', 'warning');
        }
        reloadRequests += 1;
        window.location.hash = requestedSessionId;
        window.location.reload();
        return true;
    }

    function notify(message, type) {
        if (context && context.notify) context.notify(message, type || 'info');
    }

    function triggerLegacy(id) {
        const target = document.getElementById(id);
        if (!target) {
            notify('这个入口暂时不可用', 'warning');
            return false;
        }
        target.click();
        return true;
    }

    function runFeature(id) {
        if (id === 'watch-together') {
            if (global.WatchTogether && typeof global.WatchTogether.open === 'function') return global.WatchTogether.open();
            return notify('共同观影尚未准备好', 'warning');
        }
        if (id === 'photo-album') {
            if (global.PhotoAlbumUI && typeof global.PhotoAlbumUI.open === 'function') return global.PhotoAlbumUI.open();
            return notify('照片集尚未准备好', 'warning');
        }
        if (id === 'call') {
            if (global.callFeature && typeof global.callFeature.startCall === 'function') return global.callFeature.startCall(false);
            return notify('通话尚未准备好', 'warning');
        }
        const map = {
            music: 'music-player-toggle', anniversary: 'anniversary-function', mood: 'mood-function',
            games: 'decision-function', stats: 'stats-function'
        };
        triggerLegacy(map[id]);
    }

    function openCreateDialog() {
        if (global.NextUI) return global.NextUI.openCreate();
        const overlay = root.querySelector('#shiki-create-overlay');
        overlay.hidden = false;
        overlay.dataset.type = 'direct';
        overlay.querySelectorAll('[data-type]').forEach(function (item) {
            item.classList.toggle('active', item.dataset.type === 'direct');
        });
        const input = overlay.querySelector('#shiki-create-name');
        input.value = '';
        setTimeout(function () { input.focus(); }, 0);
    }

    function closeCreateDialog() {
        root.querySelector('#shiki-create-overlay').hidden = true;
    }

    async function createConversationTransaction(dependencies, type, name) {
        const deps = dependencies || {};
        const normalizedType = type === 'group' ? 'group' : 'direct';
        let id = null;
        try {
            id = await deps.createSession();
            if (!id || !deps.sessionExists(id)) throw new Error('Created session is unavailable');
            await deps.renameSession(id, name);
            await deps.updateMeta(id, { type: normalizedType, updatedAt: Date.now() });
            if (normalizedType === 'group' && deps.createGroupSession) await deps.createGroupSession(id);
            return id;
        } catch (error) {
            if (id && deps.rollbackNewSession) {
                try { await deps.rollbackNewSession(id); }
                catch (rollbackError) { console.warn('[AppShell] 新会话附属数据回滚失败:', rollbackError); }
            }
            throw error;
        }
    }

    async function createConversation() {
        if (isCreatingConversation) return;
        const overlay = root.querySelector('#shiki-create-overlay');
        const type = overlay.dataset.type === 'group' ? 'group' : 'direct';
        const name = overlay.querySelector('#shiki-create-name').value.trim();
        if (!name) return notify('请输入会话名称', 'warning');
        const createButton = overlay.querySelector('[data-action="create-conversation"]');
        let id = null;
        isCreatingConversation = true;
        createTransactions += 1;
        if (createButton) {
            createButton.disabled = true;
            createButton.setAttribute('aria-busy', 'true');
        }
        try {
            id = await createConversationTransaction({
                createSession: context.createSession,
                sessionExists: function (sessionId) {
                    return getSessions().some(function (session) { return String(session.id) === String(sessionId); });
                },
                renameSession: context.renameSession,
                updateMeta: function (sessionId, value) { return global.ConversationMetaStore.update(sessionId, value); },
                createGroupSession: context.createGroupSession,
                rollbackNewSession: context.rollbackNewSession
            }, type, name);
            closeCreateDialog();
            const navigationStarted = await requestSessionReload(id, type === 'group', 'created');
            if (!navigationStarted) {
                notify('会话已创建，但当前会话尚未保存，因此没有自动切换', 'warning');
                renderConversations(root.querySelector('#shiki-conversation-search-input').value);
            }
        } catch (error) {
            console.error('[AppShell] 创建会话失败:', error);
            notify('创建失败，旧会话未受影响', 'error');
            showPrimary('conversations');
        } finally {
            isCreatingConversation = false;
            if (createButton) {
                createButton.disabled = false;
                createButton.removeAttribute('aria-busy');
            }
        }
    }

    function openSession(id) {
        if (!id) return;
        if (!getSessions().some(function (session) { return String(session.id) === String(id); })) {
            notify('这个会话不存在或已经被删除', 'warning');
            return showPrimary('conversations');
        }
        if (String(id) === String(context.getCurrentSessionId())) return showChat();
        requestSessionReload(id, false, 'selected');
    }

    async function handleClick(event) {
        const actionNode = event.target.closest('[data-action]');
        if (!actionNode) return;
        const action = actionNode.dataset.action;
        if (action === 'navigate') {
            if (actionNode.dataset.view === 'friends' && global.NextUI) { showPrimary('friends'); global.NextUI.renderFriends(); return; }
            return showPrimary(actionNode.dataset.view);
        }
        if (action === 'open-create') return openCreateDialog();
        if (action === 'close-create') return closeCreateDialog();
        if (action === 'select-create-type') {
            const overlay = root.querySelector('#shiki-create-overlay');
            overlay.dataset.type = actionNode.dataset.type;
            overlay.querySelectorAll('[data-type]').forEach(function (item) {
                item.classList.toggle('active', item === actionNode);
            });
            return;
        }
        if (action === 'create-conversation') return createConversation();
        if (action === 'open-session') return openSession(actionNode.dataset.sessionId);
        if (action === 'toggle-pin') {
            event.stopPropagation();
            const meta = global.ConversationMetaStore.get(actionNode.dataset.sessionId);
            await global.ConversationMetaStore.update(actionNode.dataset.sessionId, {
                pinned: !meta.pinned,
                updatedAt: meta.updatedAt
            });
            return renderConversations(root.querySelector('#shiki-conversation-search-input').value);
        }
        if (action === 'feature') return runFeature(actionNode.dataset.id);
        if (action === 'setting') {
            const entry = settingsEntries.find(function (item) { return item.id === actionNode.dataset.id; });
            if (entry) triggerLegacy(entry.target);
        }
    }

    function previewForMessage(message) {
        if (!message || typeof message !== 'object') return { text: '[消息]', type: 'unknown' };
        if (message.image) return { text: '[图片]', type: 'image' };
        const type = String(message.type || 'normal');
        if (type === 'system') return { text: '[拍一拍]', type: 'system' };
        if (/audio|voice/.test(type)) return { text: '[音频]', type: 'audio' };
        if (/video|call/.test(type)) return { text: '[视频]', type: 'video' };
        if (/photo|image/.test(type)) return { text: '[照片]', type: 'photo' };
        const text = String(message.text || '').replace(/\s+/g, ' ').trim();
        return { text: text ? text.slice(0, 40) : '[消息]', type: type };
    }

    async function noteMessageSaved(message) {
        if (!context || !global.ConversationMetaStore || !message) return;
        const sessionId = context.getCurrentSessionId();
        if (!sessionId) return;
        const summary = previewForMessage(message);
        const parsedTime = message.timestamp instanceof Date ? message.timestamp.getTime() : new Date(message.timestamp || Date.now()).getTime();
        const lastMessageAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
        try {
            const existing = global.ConversationMetaStore.get(sessionId);
            if (existing.lastMessageAt && existing.lastMessageAt > lastMessageAt) return;
            await global.ConversationMetaStore.update(sessionId, {
                lastMessagePreview: summary.text,
                lastMessageType: summary.type,
                lastMessageAt: lastMessageAt,
                updatedAt: lastMessageAt
            });
            if (root && !root.hidden && activeView === 'conversations') renderConversations(root.querySelector('#shiki-conversation-search-input').value);
        } catch (error) {
            console.warn('[AppShell] 会话摘要保存失败，消息本身未受影响:', error);
        }
    }

    function handleInput(event) {
        if (event.target.id !== 'shiki-conversation-search-input') return;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { renderConversations(event.target.value); }, 160);
    }

    function handleKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const row = event.target.closest('.shiki-conversation-row');
        if (!row) return;
        event.preventDefault();
        openSession(row.dataset.sessionId);
    }

    async function initialize(nextContext) {
        if (initialized) return;
        if (!nextContext || !global.ConversationMetaStore) throw new Error('App shell dependencies are missing');
        context = nextContext;
        await global.ConversationMetaStore.load();
        build();
        root.addEventListener('click', handleClick);
        root.addEventListener('input', handleInput);
        root.addEventListener('keydown', handleKeydown);
        initialized = true;
        const sharedContext = {
            getMessages: context.getMessages,
            locateMessageById: context.locateMessageById,
            getMyName: context.getMyName,
            getPartnerName: context.getPartnerName,
            getPartnerStatus: context.getPartnerStatus,
            getGroupMemberById: context.getGroupMemberById,
            getGroupMembers: context.getGroupMembers
        };
        if (global.MediaPreview) global.MediaPreview.initialize({ notify: notify });
        if (global.MessageSearch) global.MessageSearch.initialize(sharedContext);
        if (global.MessageDateSearch) global.MessageDateSearch.initialize(sharedContext);
        if (global.WatchTogether) {
            global.WatchTogether.initialize({
                getCurrentSession: function () {
                    return getSessions().find(function (session) { return String(session.id) === String(context.getCurrentSessionId()); }) || null;
                },
                getMyName: context.getMyName,
                getPartnerName: context.getPartnerName,
                getGroupMembers: context.getGroupMembers,
                notify: notify
            });
        }
        if (global.ChatDetail) {
            global.ChatDetail.initialize({
                getCurrentSession: function () {
                    return getSessions().find(function (session) { return String(session.id) === String(context.getCurrentSessionId()); }) || null;
                },
                getLegacyGroupEnabled: context.getLegacyGroupEnabled,
                getPartnerName: context.getPartnerName,
                getPartnerStatus: context.getPartnerStatus,
                getGroupMembers: context.getGroupMembers,
                renameSession: context.renameSession,
                backToConversations: function () { showPrimary('conversations'); },
                refreshConversations: function () { renderConversations(root.querySelector('#shiki-conversation-search-input').value); },
                openLegacy: triggerLegacy,
                openClearMessages: context.openClearMessages,
                notify: notify
            });
        }
        const pendingNavigation = consumeNavigation();
        if (pendingNavigation) {
            showChat();
            if (pendingNavigation.groupSetup) {
                setTimeout(function () { triggerLegacy('group-chat-btn'); }, 0);
            }
        }
        else showPrimary('conversations');
        document.documentElement.removeAttribute('data-shell-booting');
    }

    global.ShikiAppShell = Object.freeze({
        initialize: initialize,
        showPrimary: showPrimary,
        showChat: showChat,
        refresh: renderConversations,
        noteMessageSaved: noteMessageSaved,
        previewForMessage: previewForMessage,
        createConversationTransaction: createConversationTransaction,
        getDebugSnapshot: function () {
            return {
                initialized: initialized,
                activeView: activeView,
                creatingConversation: isCreatingConversation,
                createTransactions: createTransactions,
                reloadRequests: reloadRequests,
                sessionReloadGeneration: sessionReloadGeneration,
                documentClickListeners: 0,
                rootClickListeners: initialized ? 1 : 0,
                rootInputListeners: initialized ? 1 : 0,
                rootKeydownListeners: initialized ? 1 : 0
            };
        }
    });
})(window);
