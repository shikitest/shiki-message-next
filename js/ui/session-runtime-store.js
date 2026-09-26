(function (global) {
    'use strict';

    const CONVERSATION_SETTING_KEYS = [
        'partnerName', 'myName', 'myStatus', 'partnerStatus',
        'typingIndicatorEnabled', 'readReceiptsEnabled', 'replyEnabled',
        'replyDelayMin', 'replyDelayMax', 'textGenerationMode',
        'autoSendEnabled', 'autoSendInterval', 'autoSendFrequency',
        'showPartnerMessageTranslation', 'showUserMessageTranslation',
        'allowReadNoReply', 'readNoReplyChance', 'emojiMixEnabled',
        'inChatAvatarEnabled', 'inChatAvatarSize', 'inChatAvatarPosition',
        'inChatAvatarCustomOffset', 'alwaysShowAvatar', 'showPartnerNameInChat',
        'myAvatarFrame', 'partnerAvatarFrame', 'myAvatarShape',
        'partnerAvatarShape', 'avatarCornerRadius', 'fontSize', 'bubbleStyle',
        'messageFontFamily', 'messageFontWeight', 'messageLineHeight',
        'customFontUrl', 'customBubbleCss', 'customGlobalCss', 'isDarkMode',
        'colorTheme', 'customThemeColors', 'soundEnabled', 'soundVolume',
        'customSoundUrl', 'mySendSoundPreset', 'mySendCustomSoundUrl',
        'partnerMessageSoundPreset', 'partnerMessageCustomSoundUrl',
        'myPokeSoundPreset', 'myPokeCustomSoundUrl',
        'partnerPokeSoundPreset', 'partnerPokeCustomSoundUrl',
        'timeFormat', 'readReceiptStyle', 'bottomCollapseMode',
        'musicPlayerEnabled'
    ];
    const GLOBAL_NAMESPACES = [
        'sessionList', 'lastSessionId', 'customThemes', 'themeSchemes',
        'customSongs', 'playerCover', 'localMusicMedia', 'tour_seen'
    ];
    const settingScopes = Object.create(null);
    CONVERSATION_SETTING_KEYS.forEach(function (key) { settingScopes[key] = 'conversation'; });
    GLOBAL_NAMESPACES.forEach(function (key) { settingScopes[key] = 'global'; });
    Object.freeze(settingScopes);

    let activeSessionId = '';
    let pendingSessionId = '';
    let loadGeneration = 0;
    let transitionGeneration = 0;
    let transitionQueue = Promise.resolve();
    let completedLoads = 0;
    let discardedLoads = 0;

    function normalizeId(sessionId) {
        const id = String(sessionId || '');
        if (!id) throw new Error('Session id is required');
        return id;
    }

    function getSettingScope(key) {
        return settingScopes[String(key)] || 'conversation';
    }

    function beginLoad(sessionId) {
        const id = normalizeId(sessionId);
        const token = ++loadGeneration;
        pendingSessionId = id;
        return Object.freeze({ sessionId: id, generation: token });
    }

    function isCurrent(token) {
        return Boolean(token) &&
            token.generation === loadGeneration &&
            token.sessionId === pendingSessionId;
    }

    async function load(sessionId, loader) {
        if (typeof loader !== 'function') throw new Error('Session loader is required');
        const token = beginLoad(sessionId);
        const value = await loader(token.sessionId, token);
        if (!isCurrent(token)) {
            discardedLoads += 1;
            return { sessionId: token.sessionId, token: token, stale: true, value: null };
        }
        completedLoads += 1;
        return { sessionId: token.sessionId, token: token, stale: false, value: value };
    }

    function activate(sessionId, value, token) {
        const id = normalizeId(sessionId);
        if (token && !isCurrent(token)) return false;
        if (token && token.sessionId !== id) return false;
        activeSessionId = id;
        pendingSessionId = '';
        return value === undefined ? true : value;
    }

    function capture(sessionId, producer) {
        const id = normalizeId(sessionId);
        return {
            sessionId: id,
            value: typeof producer === 'function' ? producer(id) : producer
        };
    }

    async function save(sessionId, saver) {
        const id = normalizeId(sessionId);
        if (typeof saver !== 'function') throw new Error('Session saver is required');
        return saver(id);
    }

    async function flush(sessionId, flusher) {
        const id = normalizeId(sessionId);
        if (typeof flusher !== 'function') return [];
        return flusher(id);
    }

    function clearRuntime(clearer) {
        if (typeof clearer === 'function') clearer(activeSessionId);
    }

    function invalidate() {
        loadGeneration += 1;
        pendingSessionId = '';
    }

    async function runTransition(sessionId, handlers) {
        const targetId = normalizeId(sessionId);
        const requestGeneration = ++transitionGeneration;
        const steps = handlers || {};
        const task = transitionQueue.catch(function () {}).then(async function () {
            if (requestGeneration !== transitionGeneration) return { stale: true, sessionId: targetId };
            const previousId = activeSessionId;
            if (typeof steps.beforeLeave === 'function') await steps.beforeLeave(previousId, targetId);
            if (requestGeneration !== transitionGeneration) return { stale: true, sessionId: targetId };
            const loaded = await load(targetId, function (id, token) {
                return typeof steps.load === 'function' ? steps.load(id, token) : null;
            });
            if (loaded.stale || requestGeneration !== transitionGeneration) return { stale: true, sessionId: targetId };
            if (typeof steps.clear === 'function') steps.clear(previousId, targetId);
            if (typeof steps.apply === 'function') await steps.apply(loaded.value, targetId, loaded.token);
            if (requestGeneration !== transitionGeneration || !isCurrent(loaded.token)) return { stale: true, sessionId: targetId };
            activate(targetId, undefined, loaded.token);
            if (typeof steps.afterActivate === 'function') await steps.afterActivate(targetId, previousId);
            return { stale: false, sessionId: targetId, value: loaded.value };
        });
        transitionQueue = task;
        return task;
    }

    function remove(sessionId) {
        const id = String(sessionId || '');
        if (id) transitionGeneration += 1;
        if (id && (activeSessionId === id || pendingSessionId === id)) {
            invalidate();
            if (activeSessionId === id) activeSessionId = '';
        }
    }

    function bindModal(modal, sessionId) {
        if (!modal) return null;
        const id = normalizeId(sessionId || activeSessionId);
        modal.dataset.sessionRuntimeId = id;
        return id;
    }

    function isModalCurrent(modal, sessionId) {
        if (!modal) return false;
        const id = String(sessionId || activeSessionId || '');
        return Boolean(id) && modal.dataset.sessionRuntimeId === id;
    }

    global.SessionRuntimeStore = Object.freeze({
        version: '1.0.0',
        settingScopes: settingScopes,
        getSettingScope: getSettingScope,
        beginLoad: beginLoad,
        isCurrent: isCurrent,
        load: load,
        capture: capture,
        save: save,
        activate: activate,
        flush: flush,
        clearRuntime: clearRuntime,
        runTransition: runTransition,
        invalidate: invalidate,
        remove: remove,
        bindModal: bindModal,
        isModalCurrent: isModalCurrent,
        getActiveSessionId: function () { return activeSessionId || null; },
        getDebugSnapshot: function () {
            return {
                activeSessionId: activeSessionId || null,
                pendingSessionId: pendingSessionId || null,
                loadGeneration: loadGeneration,
                transitionGeneration: transitionGeneration,
                completedLoads: completedLoads,
                discardedLoads: discardedLoads
            };
        }
    });
})(window);
