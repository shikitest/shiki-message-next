/* Thin adapter: reuse the original message pipeline; friend identity is canonical. */
(function (global) {
    'use strict';
    const GLOBAL_KEY = 'SHIKI_NEXT_globalSettingsV1';
    const GLOBAL_FIELDS = ['myName', 'myStatus', 'myAvatar', 'isDarkMode', 'colorTheme', 'fontSize', 'messageFontFamily', 'messageFontWeight', 'messageLineHeight', 'customFontUrl', 'soundEnabled', 'soundVolume', 'musicPlayerEnabled', 'customGlobalCss', 'timeFormat', 'myAvatarShape', 'myAvatarFrame'];
    let globalSettings = {};
    let draftTimer = null;
    const replyTimers = new Set();
    const typingFriends = new Map();
    function refreshTyping() {
        const wrapper = document.getElementById && document.getElementById('typing-indicator-wrapper');
        if (!wrapper) return;
        const label = document.getElementById('typing-indicator-label');
        if (label) label.textContent = [...typingFriends.values()].join('、') + ' 正在输入';
        wrapper.style.display = typingFriends.size ? 'block' : 'none';
        if (typingFriends.size && typeof positionTypingIndicator === 'function') positionTypingIndicator();
    }
    let switchGeneration = 0, requestedId = null, transition = null;
    const scrollPositions = new Map();
    const userReplyTimers = new Set();
    const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif';
    const originalReplyDefaults = getDefaultSettings();
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
        if (c && c.type === 'direct' && all[0]) Object.assign(settings, NextModel.preferences(replyPreferences(all[0])));
        settings.autoSendEnabled = false;
        groupChatSettings = { enabled: c && c.type === 'group', showAvatar: true, showName: true, members: all.map(f => ({ id: f.id, name: f.name, avatar: f.avatar, deleted: f.deleted })) };
        _activeGroupSessionId = null;
        _activeGroupSessionScoped = false;
        settings.partnerName = c ? (c.type === 'group' ? c.name : all[0].name + (all[0].deleted ? '（已删除）' : '')) : '请选择好友';
        settings.partnerStatus = c && c.type === 'direct' && global.NextMood ? NextMood.status(all[0].id) : '';
        customReplies = c && c.type === 'direct' && all[0] ? all[0].cards.slice() : [];
        if (DOMElements.partner && DOMElements.partner.avatar) {
            DOMElements.partner.avatar.replaceChildren();
            const f = c && c.type === 'direct' ? all[0] : null;
            if (f && f.avatar) { const img = document.createElement('img'); img.src = f.avatar; img.alt = ''; DOMElements.partner.avatar.appendChild(img); }
            else { const icon = document.createElement('i'); icon.className = 'fas fa-user'; DOMElements.partner.avatar.appendChild(icon); }
        }
        updateUI();
        const input = document.getElementById('message-input');
        if (input) input.placeholder = 'Aa';
        const continueButton = document.getElementById('continue-btn');
        if (continueButton) continueButton.setAttribute('aria-label', '让' + settings.partnerName + '继续说');
        if (globalSettings.myAvatar && DOMElements.me && DOMElements.me.avatar) updateAvatar(DOMElements.me.avatar, globalSettings.myAvatar);
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
    async function saveDraft(targetId, draftValue) {
        clearTimeout(draftTimer);
        const id = String(targetId || SESSION_ID || '');
        const input = document.getElementById('message-input');
        if (id && input && NextModel.conversation(id)) await localforage.setItem(getSessionStorageKey(id, 'draft'), (draftValue === undefined ? input.value : draftValue).slice(0, 10000));
    }
    async function boot() {
        globalSettings = await localforage.getItem(GLOBAL_KEY) || {};
        if (!Object.keys(globalSettings).length) {
            globalSettings = { ...pickGlobal(settings), colorTheme: 'black-white', messageFontFamily: fontStack };
            await saveGlobals(globalSettings);
        }
        for (const f of NextModel.snapshot().friends) {
            if (Object.keys(f.replySettings || {}).length) continue;
            const direct = NextModel.snapshot().conversations.find(c => c.type === 'direct' && c.friendIds[0] === f.id);
            if (!direct) continue;
            const legacy = await localforage.getItem(getSessionStorageKey(direct.id, 'chatSettings'));
            if (legacy) await NextModel.saveFriend({ id: f.id, replySettings: NextModel.preferences(legacy) });
        }
        await sync(); applyCurrent();
        const input = document.getElementById('message-input');
        if (input) {
            input.value = await localforage.getItem(getSessionStorageKey(SESSION_ID, 'draft')) || '';
            input.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraft().catch(report), 200); });
        }
        global.addEventListener('pagehide', () => { cancelReplies(); saveDraft().catch(report); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) cancelReplies(); });
    }
    function report(error) { console.warn('[Next]', error); showNotification('操作失败：' + String(error.message || error).slice(0, 100), 'error'); }
    function cancelReplies() {
        typingFriends.clear();
        replyTimers.forEach(clearTimeout); replyTimers.clear();
        userReplyTimers.forEach(clearTimeout); userReplyTimers.clear();
        if (global._pendingReplyTimer) clearTimeout(global._pendingReplyTimer);
        global._pendingReplyTimer = null;
        const typing = document.getElementById && document.getElementById('typing-indicator-wrapper');
        if (typing) typing.style.display = 'none';
    }
    async function flush() {
        const id = String(SESSION_ID || ''), version = switchGeneration;
        const input = document.getElementById('message-input'), draft = input ? input.value : '';
        await NextModel.flush(); await saveDraft(id, draft);
        if (global.NextMood) await NextMood.flush();
        if (id !== String(SESSION_ID || '') || version !== switchGeneration) return;
        if (id && NextModel.conversation(id)) {
            await global.flushThrottledSaveData(id);
            if (id !== String(SESSION_ID || '') || version !== switchGeneration) return;
            const result = await saveData(id);
            if (result.failed.length) throw new Error('当前会话保存失败：' + result.failed.join(', '));
        }
    }
    function open(id) {
        if (!NextModel.conversation(id)) throw new Error('会话不存在');
        requestedId = id; ++switchGeneration;
        if (!transition) transition = drainTransitions().finally(() => { transition = null; document.body.classList.remove('next-switching'); });
        return transition;
    }
    async function drainTransitions() {
        const originalId = String(SESSION_ID || '');
        const container = DOMElements.chatContainer;
        const original = { settings: { ...settings }, messages, draft: DOMElements.messageInput.value, customReplies, savedBackgrounds, groupChatSettings };
        const restoreExtras = [];
        if (typeof customPokes !== 'undefined') { const value = customPokes; restoreExtras.push(() => { customPokes = value; }); }
        if (typeof customStatuses !== 'undefined') { const value = customStatuses; restoreExtras.push(() => { customStatuses = value; }); }
        if (typeof customMottos !== 'undefined') { const value = customMottos; restoreExtras.push(() => { customMottos = value; }); }
        if (typeof customIntros !== 'undefined') { const value = customIntros; restoreExtras.push(() => { customIntros = value; }); }
        if (typeof customEmojis !== 'undefined') { const value = customEmojis; restoreExtras.push(() => { customEmojis = value; }); }
        if (typeof anniversaries !== 'undefined') { const value = anniversaries; restoreExtras.push(() => { anniversaries = value; }); }
        if (typeof stickerLibrary !== 'undefined') { const value = stickerLibrary; restoreExtras.push(() => { stickerLibrary = value; }); }
        if (typeof myStickerLibrary !== 'undefined') { const value = myStickerLibrary; restoreExtras.push(() => { myStickerLibrary = value; }); }
        if (typeof customThemes !== 'undefined') { const value = customThemes; restoreExtras.push(() => { customThemes = value; }); }
        if (typeof themeSchemes !== 'undefined') { const value = themeSchemes; restoreExtras.push(() => { themeSchemes = value; }); }
        if (typeof envelopeData !== 'undefined') { const value = envelopeData; restoreExtras.push(() => { envelopeData = value; }); }
        if (typeof showPartnerNameInChat !== 'undefined') { const value = showPartnerNameInChat; restoreExtras.push(() => { showPartnerNameInChat = value; }); }
        const windowState = global._shikiMessageRenderWindow, count = displayedMessageCount, replyTarget = currentReplyTo;
        const groups = [global.customReplyGroups, global.customPokeGroups, global.customStatusGroups];
        const background = document.documentElement && document.documentElement.style.getPropertyValue('--chat-bg-image');
        const withBackground = document.body.classList.contains && document.body.classList.contains('with-background');
        if (container && NextModel.conversation(originalId)) scrollPositions.set(originalId, { top: container.scrollTop, count: displayedMessageCount });
        document.body.classList.add('next-switching');
        cancelReplies();
        if (global.NextInput) NextInput.close();
        try {
            await flush();
            for (;;) {
                const id = requestedId, version = switchGeneration;
                if (String(SESSION_ID) !== id) {
                    SESSION_ID = id;
                    global._shikiMessageRenderWindow = null;
                    currentReplyTo = null; batchMessages = []; isBatchMode = false; isLoadingHistory = false;
                    if (global.ChatDetail) ChatDetail.close();
                    if (global.MessageSearch) MessageSearch.close();
                    if (global.MessageDateSearch) MessageDateSearch.close();
                    const loaded = await loadData();
                    if (!loaded) throw new Error('聊天读取失败，已恢复原页面，请重试');
                }
                const draft = await localforage.getItem(getSessionStorageKey(id, 'draft')) || '';
                if (version !== switchGeneration) continue;
                applyCurrent();
                const prior = scrollPositions.get(id);
                displayedMessageCount = prior ? prior.count : HISTORY_BATCH_SIZE;
                DOMElements.messageInput.value = draft;
                updateReplyPreview(); renderMessages();
                if (prior) container.scrollTop = prior.top;
                history.replaceState(null, '', '#' + encodeURIComponent(id));
                NextStorage.local.setItem(APP_PREFIX + 'lastSessionId', id);
                ShikiAppShell.showChat();
                return;
            }
        } catch (error) {
            SESSION_ID = originalId; settings = original.settings; messages = original.messages;
            customReplies = original.customReplies; savedBackgrounds = original.savedBackgrounds; groupChatSettings = original.groupChatSettings;
            restoreExtras.forEach(restore => restore());
            [global.customReplyGroups, global.customPokeGroups, global.customStatusGroups] = groups;
            global._shikiMessageRenderWindow = windowState; displayedMessageCount = count; currentReplyTo = replyTarget;
            if (document.documentElement) {
                document.documentElement.style.setProperty('--chat-bg-image', background || 'none');
                document.body.classList.toggle('with-background', Boolean(withBackground));
            }
            applyCurrent(); renderMessages(); DOMElements.messageInput.value = original.draft;
            throw error;
        }
    }
    function replyPreferences(f) {
        return { ...originalReplyDefaults, ...f.replySettings };
    }
    function userSent() {
        const id = String(SESSION_ID), version = switchGeneration;
        userReplyTimers.forEach(clearTimeout); userReplyTimers.clear();
        const readTimer = setTimeout(() => {
            userReplyTimers.delete(readTimer);
            if (id !== String(SESSION_ID) || version !== switchGeneration) return;
            messages.forEach(m => { if (m.sender === 'user') m.status = 'read'; });
            _updateReadReceiptsDOM(); throttledSaveData();
        }, 1500 + Math.random() * 2500);
        userReplyTimers.add(readTimer);
        for (const f of NextModel.members(id)) {
            if (f.deleted) continue;
            const p = replyPreferences(f);
            if ((p.allowReadNoReply && Math.random() < p.readNoReplyChance) || (p.usePreviewProbability && Math.random() >= f.replyProbability)) continue;
            const timer = setTimeout(() => {
                userReplyTimers.delete(timer);
                if (id === String(SESSION_ID) && version === switchGeneration && !document.hidden) reply({ friendId: f.id, probabilityChecked: true });
            }, p.replyDelayMin + Math.random() * (p.replyDelayMax - p.replyDelayMin));
            userReplyTimers.add(timer);
        }
    }
    function reply(trigger) {
        const id = String(SESSION_ID || ''); const c = NextModel.conversation(id);
        if (!c || (trigger && trigger.source === 'rolling-scheduler')) return;
        const version = switchGeneration;
        for (const f of NextModel.members(id)) {
            const prefs = replyPreferences(f);
            if (f.deleted || (trigger && trigger.friendId && trigger.friendId !== f.id)) continue;
            if (!(trigger && trigger.probabilityChecked) && ((prefs.allowReadNoReply && Math.random() < prefs.readNoReplyChance) || (prefs.usePreviewProbability && Math.random() >= f.replyProbability))) continue;
            const valid = () => String(SESSION_ID) === id && switchGeneration === version && !document.hidden && NextModel.friend(f.id) && !NextModel.friend(f.id).deleted && NextModel.conversation(id) && NextModel.conversation(id).friendIds.includes(f.id);
            if (Math.random() < 0.03 && valid() && typeof global._triggerPartnerPoke === 'function') global._triggerPartnerPoke({ id: f.id, name: f.name, avatar: f.avatar });
            if (Math.random() < 0.01 && global.PhotoAlbum && typeof PhotoAlbum.generateRandomPhotoForOwner === 'function') {
                PhotoAlbum.generateRandomPhotoForOwner({ ownerType: 'partner', ownerId: f.id, ownerName: f.name, source: 'random' }).then(photo => {
                    if (photo && photo.image && valid()) addMessage({ id: crypto.randomUUID(), sender: f.name, friendId: f.id, groupMemberId: c.type === 'group' ? f.id : null, image: photo.image, text: '', timestamp: new Date(), type: 'normal', status: 'received' });
                }).catch(report);
            }
            if (prefs.textGenerationMode === 'card' && !f.cards.length) continue;
            const count = Math.random() < 0.75 ? 1 : (Math.random() < 0.95 ? 2 : 3);
            if (prefs.typingIndicatorEnabled) { typingFriends.set(f.id, f.name); refreshTyping(); }
            let delay = 0;
            for (let i = 0; i < count; i++) {
                delay += prefs.replyDelayMin + Math.random() * (prefs.replyDelayMax - prefs.replyDelayMin);
                const timer = setTimeout(() => {
                replyTimers.delete(timer);
                if (i === count - 1) { typingFriends.delete(f.id); refreshTyping(); }
                const current = NextModel.friend(f.id); const conversation = NextModel.conversation(id);
                if (!valid() || !current || !conversation) return;
                const choice = chooseReplyText(current.cards, prefs);
                if (!choice.text) return;
                let finalText = choice.text, separateEmoji = null;
                if (typeof customEmojis !== 'undefined' && customEmojis.length && Math.random() < 0.2) {
                    const emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
                    if (settings.emojiMixEnabled !== false) finalText = Math.random() < 0.5 ? emoji + ' ' + finalText : finalText + ' ' + emoji;
                    else separateEmoji = emoji;
                }
                const message = { id: crypto.randomUUID(), sender: current.name, friendId: current.id,
                    groupMemberId: c.type === 'group' ? current.id : null, text: finalText,
                    timestamp: new Date(), status: 'received', type: 'normal', favorited: false, note: null };
                if (prefs.replyEnabled && i === 0) {
                    const recent = messages.filter(m => m.sender === 'user').slice(-10);
                    if (recent.length && Math.random() < 0.3) {
                        const quoted = recent[Math.floor(Math.random() * recent.length)];
                        message.replyTo = { id: quoted.id, text: quoted.text, sender: quoted.sender };
                    }
                }
                addMessage(message); playSound('message');
                if (typeof global._sendPartnerNotification === 'function') global._sendPartnerNotification(current.name, finalText);
                const delayedExtra = (payload, milliseconds) => {
                    const extra = setTimeout(() => { replyTimers.delete(extra); if (valid()) { addMessage({ ...message, ...payload, id: crypto.randomUUID(), timestamp: new Date() }); playSound('message'); } }, milliseconds);
                    replyTimers.add(extra);
                };
                let disabledStickers = new Set();
                try { disabledStickers = new Set(JSON.parse(NextStorage.local.getItem('disabledStickerItems') || '[]')); } catch (_) {}
                const enabledStickers = (typeof stickerLibrary === 'undefined' ? [] : stickerLibrary).filter(s => !disabledStickers.has(s));
                if (enabledStickers.length && Math.random() < 0.2) delayedExtra({ text: '', image: enabledStickers[Math.floor(Math.random() * enabledStickers.length)] }, 400 + Math.random() * 600);
                if (separateEmoji) delayedExtra({ text: separateEmoji }, 300 + Math.random() * 400);
            }, delay);
            replyTimers.add(timer);
            }
        }
    }
    global.NextRuntime = Object.freeze({ GLOBAL_KEY, GLOBAL_FIELDS, boot, sync, sessions, applyCurrent, saveGlobals, flush, open, reply, userSent, replyPreferences, cancelReplies, report, generation: () => switchGeneration, globals: () => ({ ...globalSettings }) });
})(window);
