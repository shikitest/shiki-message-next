/* Thin adapter: reuse the original message pipeline; friend identity is canonical. */
(function (global) {
    'use strict';
    const GLOBAL_KEY = 'SHIKI_NEXT_globalSettingsV1';
    const GLOBAL_FIELDS = ['myName', 'myStatus', 'isDarkMode', 'colorTheme', 'fontSize', 'messageFontFamily', 'messageFontWeight', 'messageLineHeight', 'customFontUrl', 'soundEnabled', 'soundVolume', 'musicPlayerEnabled', 'customGlobalCss', 'timeFormat', 'myAvatarShape', 'myAvatarFrame'];
    let globalSettings = {};
    let draftTimer = null;
    const replyTimers = new Set();
    let switching = false;
    function sessions() {
        return NextModel.snapshot().conversations.map(c => ({ ...c, name: c.type === 'direct' ? (NextModel.friend(c.friendIds[0]) || {}).name || c.name : c.name }));
    }
    async function sync() {
        sessionList = sessions();
        await localforage.setItem(APP_PREFIX + 'sessionList', sessionList);
        await ConversationMetaStore.load();
        for (const c of sessionList) {
            if (ConversationMetaStore.get(c.id).type !== c.type) await ConversationMetaStore.update(c.id, { type: c.type });
        }
    }
    function applyCurrent() {
        Object.assign(settings, globalSettings);
        settings.autoSendEnabled = false;
        partnerPersonas = [];
        const c = NextModel.conversation(SESSION_ID);
        const all = c ? NextModel.members(c.id) : [];
        groupChatSettings = { enabled: c && c.type === 'group', showAvatar: true, showName: true, members: all.map(f => ({ id: f.id, name: f.name, avatar: f.avatar, deleted: f.deleted })) };
        _activeGroupSessionId = null;
        _activeGroupSessionScoped = false;
        settings.partnerName = c ? (c.type === 'group' ? c.name : all[0].name + (all[0].deleted ? '（已删除）' : '')) : '请选择好友';
        settings.partnerStatus = '本地模拟';
        customReplies = c && c.type === 'direct' && all[0] ? all[0].cards.slice() : [];
        if (DOMElements.partner && DOMElements.partner.avatar) {
            DOMElements.partner.avatar.replaceChildren();
            const f = c && c.type === 'direct' ? all[0] : null;
            if (f && f.avatar) { const img = document.createElement('img'); img.src = f.avatar; img.alt = ''; DOMElements.partner.avatar.appendChild(img); }
            else { const icon = document.createElement('i'); icon.className = 'fas fa-user'; DOMElements.partner.avatar.appendChild(icon); }
        }
        updateUI();
        if (global.ChatDetail) ChatDetail.refresh();
    }
    function pickGlobal(input) {
        const output = {};
        GLOBAL_FIELDS.forEach(key => { if (Object.prototype.hasOwnProperty.call(input, key)) output[key] = input[key]; });
        return output;
    }
    async function saveGlobals(input) {
        const next = pickGlobal(input);
        await localforage.setItem(GLOBAL_KEY, next);
        globalSettings = next;
    }
    async function saveDraft() {
        clearTimeout(draftTimer);
        const id = String(SESSION_ID || '');
        const input = document.getElementById('message-input');
        if (id && input && NextModel.conversation(id)) await localforage.setItem(getSessionStorageKey(id, 'draft'), input.value.slice(0, 10000));
    }
    async function boot() {
        globalSettings = await localforage.getItem(GLOBAL_KEY) || {};
        await sync(); applyCurrent();
        const input = document.getElementById('message-input');
        if (input) {
            input.value = await localforage.getItem(getSessionStorageKey(SESSION_ID, 'draft')) || '';
            input.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft().catch(report), 200); });
        }
        global.addEventListener('pagehide', () => { cancelReplies(); saveDraft().catch(report); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) cancelReplies(); });
    }
    function report(error) { console.warn('[Next]', error); showNotification('保存失败：' + String(error.message || error).slice(0, 100), 'error'); }
    function cancelReplies() { replyTimers.forEach(clearTimeout); replyTimers.clear(); }
    async function flush() {
        await NextModel.flush(); await saveDraft();
        if (SESSION_ID && NextModel.conversation(String(SESSION_ID))) {
            await global.flushThrottledSaveData(SESSION_ID);
            const result = await saveData(SESSION_ID);
            if (result.failed.length) throw new Error('当前会话保存失败：' + result.failed.join(', '));
        }
    }
    async function open(id) {
        if (switching) return;
        if (!NextModel.conversation(id)) throw new Error('会话不存在');
        switching = true;
        try {
            await flush(); await sync(); cancelReplies();
            if (global._pendingReplyTimer) clearTimeout(global._pendingReplyTimer);
            if (String(SESSION_ID) === id) { ShikiAppShell.showChat(); return; }
            // Keep the proven reload boundary for the preview. Globals and drafts persist.
            NextStorage.session.setItem('CHAT_APP_UI_PENDING_NAVIGATION_V1', JSON.stringify({ version: 1, sessionId: id, reason: 'selected', createdAt: Date.now() }));
            location.hash = id; location.reload();
        } finally { switching = false; }
    }
    function reply(trigger) {
        const typing = document.getElementById && document.getElementById('typing-indicator-wrapper');
        if (typing) typing.style.display = 'none';
        const id = String(SESSION_ID || ''); const c = NextModel.conversation(id);
        if (!c || (trigger && trigger.source === 'rolling-scheduler')) return;
        for (const f of NextModel.members(id)) {
            if (f.deleted || !f.cards.length || Math.random() >= f.replyProbability) continue;
            const delay = 800 + Math.random() * 1600;
            const timer = setTimeout(() => {
                replyTimers.delete(timer);
                const current = NextModel.friend(f.id); const conversation = NextModel.conversation(id);
                if (String(SESSION_ID) !== id || document.hidden || !current || current.deleted || !conversation || !conversation.friendIds.includes(f.id) || !current.cards.length) return;
                const message = { id: crypto.randomUUID(), sender: current.name, friendId: current.id,
                    groupMemberId: c.type === 'group' ? current.id : null, text: current.cards[Math.floor(Math.random() * current.cards.length)],
                    timestamp: new Date(), status: 'received', type: 'normal', favorited: false, note: null };
                addMessage(message); playSound('message');
            }, delay);
            replyTimers.add(timer);
        }
    }
    global.NextRuntime = Object.freeze({ GLOBAL_KEY, GLOBAL_FIELDS, boot, sync, sessions, applyCurrent, saveGlobals, flush, open, reply, cancelReplies, report, globals: () => ({ ...globalSettings }) });
})(window);
