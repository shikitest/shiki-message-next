/* Notifications consume saved messages. Never generate replies or replay history. */
(function (global) {
    'use strict';
    const seen = new Set();
    let banner = null, dismissTimer = null, ready = false, pendingId = null;
    const preference = key => NextStorage.local.getItem(key);
    function status() {
        return { system: preference('notifEnabled') === '1', inApp: preference('inAppNotifEnabled') !== '0',
            permission: 'Notification' in global ? Notification.permission : 'unsupported' };
    }
    async function setSystemEnabled(enabled) {
        if (!enabled) { NextStorage.local.setItem('notifEnabled', '0'); return status(); }
        if (!('Notification' in global)) throw new Error('此浏览器不支持系统通知，请使用支持通知的浏览器或主屏幕应用');
        // Called only by an explicit settings gesture, never by message arrival.
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        NextStorage.local.setItem('notifEnabled', permission === 'granted' ? '1' : '0');
        return status();
    }
    function setInAppEnabled(enabled) {
        NextStorage.local.setItem('inAppNotifEnabled', enabled ? '1' : '0');
        if (!enabled) dismiss();
    }
    function dismiss() { clearTimeout(dismissTimer); if (banner) banner.remove(); banner = null; }
    async function openConversation(id) {
        if (!ready) { pendingId = id; return false; }
        if (!global.NextModel?.conversation(id)) return false;
        dismiss();
        if (global.NextUI) NextUI.beforeNavigate();
        // Hide only existing overlays, retaining each module's close lifecycle.
        if (global.NextUI?.dismissForNavigation) NextUI.dismissForNavigation();
        if (global.MessageSearch?.close) MessageSearch.close();
        if (global.ChatDetail?.close) ChatDetail.close();
        document.querySelectorAll('.modal').forEach(node => {
            if (getComputedStyle(node).display !== 'none' && typeof global.hideModal === 'function') hideModal(node);
        });
        await NextRuntime.open(id);
        return true;
    }
    function showBanner(id, title, body, avatar) {
        dismiss();
        const node = document.createElement('div'); node.className = 'notification info next-message-notification';
        node.dataset.conversationId = id; node.setAttribute('role', 'status');
        const open = document.createElement('button'); open.type = 'button'; open.className = 'next-message-notification-open';
        open.setAttribute('aria-label', '打开消息：' + title);
        const picture = document.createElement('img'); picture.src = avatar || 'assets/app-icon-192.png'; picture.alt = '';
        const copy = document.createElement('span'), name = document.createElement('strong'), text = document.createElement('span');
        name.textContent = title; text.textContent = body; copy.append(name, text); open.append(picture, copy);
        open.addEventListener('click', () => openConversation(id).catch(NextRuntime.report));
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.className = 'next-message-notification-close'; close.setAttribute('aria-label', '关闭消息提醒'); close.addEventListener('click', dismiss);
        node.append(open, close); document.body.append(node); banner = node;
        dismissTimer = setTimeout(dismiss, 5000);
    }
    async function received(message, conversationId) {
        if (!message || message.sender === 'user' || (!message.sender && !message.friendId)) return false;
        const id = String(conversationId || message.conversationId || '');
        const conversation = global.NextModel?.conversation(id);
        if (!conversation) return false;
        const key = message.id == null ? null : JSON.stringify([id, String(message.id)]);
        if (key && seen.has(key)) return false;
        if (key) { seen.add(key); if (seen.size > 2000) seen.delete(seen.values().next().value); }
        const prefs = String(SESSION_ID) === id ? settings : await localforage.getItem(getSessionStorageKey(id, 'chatSettings')) || {};
        if (prefs.muted) return false;
        const friend = message.friendId ? NextModel.profile(message.friendId) : null;
        const direct = conversation.type === 'direct' ? NextModel.profile(conversation.friendIds[0]) : null;
        const name = friend ? friend.remark || friend.name : direct ? direct.remark || direct.name : String(message.sender || '对方');
        const title = conversation.type === 'group' ? conversation.name + ' · ' + name : name;
        const body = String(message.image ? message.imageKind === 'sticker' ? '[表情]' : '[图片]' : message.text || '[消息]').replace(/\s+/g, ' ').slice(0, 160);
        const avatar = friend?.avatar || direct?.avatar || null;
        const foreground = !document.hidden && (!document.hasFocus || document.hasFocus());
        const viewing = foreground && document.body.classList.contains('shiki-chat-view-active') && String(SESSION_ID) === id && !document.querySelector('.next-page:not([hidden])');
        const options = status();
        if (foreground) {
            if (!viewing && options.inApp) { showBanner(id, title, body, avatar); return true; }
            return false;
        }
        if (!options.system || options.permission !== 'granted') return false;
        return BackgroundSupport.showNotification(title, {
            body, icon: avatar || 'assets/app-icon-192.png', badge: 'assets/app-icon-192.png',
            tag: 'shiki-next-' + id, renotify: true,
            data: { type: 'SHIKI_NEXT_MESSAGE', conversationId: id, messageId: String(message.id || '') }
        });
    }
    if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', event => {
        if (event.source?.scriptURL && !event.source.scriptURL.startsWith(new URL('./', location.href).href)) return;
        if (event.data?.type === 'SHIKI_NEXT_OPEN_CONVERSATION' && typeof event.data.conversationId === 'string') {
            openConversation(event.data.conversationId).catch(NextRuntime.report);
        }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) dismiss(); });
    async function initialize() {
        ready = true;
        const url = new URL(location.href), requested = url.searchParams.get('shikiNextNotification');
        if (requested) { url.searchParams.delete('shikiNextNotification'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
        const id = pendingId || requested; pendingId = null;
        if (id) await openConversation(id);
    }
    global.NextNotifications = Object.freeze({ received, status, setSystemEnabled, setInAppEnabled, openConversation, initialize });
})(window);
