(function (global) {
    'use strict';

    const STATE_PREFIX = 'watchTogetherStateV1:';
    const MESSAGES_PREFIX = 'watchTogetherMessagesV1:';
    const PLAYLIST_PREFIX = 'watchTogetherPlaylistV1:';
    const MAX_MESSAGES = 300;
    const MAX_PLAYLIST_ITEMS = 200;

    function key(suffix, sessionId) {
        return String(global.APP_PREFIX || 'SHIKI_NEXT_') + suffix + String(sessionId);
    }

    function storage() {
        if (!global.localforage) throw new Error('共同观影存储不可用');
        return global.localforage;
    }

    function cleanState(sessionId, value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            version: 1,
            sessionId: String(sessionId),
            videoName: String(input.videoName || '').slice(0, 180),
            sourceType: input.sourceType === 'remote' ? 'remote' : (input.sourceType === 'local' ? 'local' : null),
            remoteUrl: input.sourceType === 'remote' && /^https?:\/\//i.test(String(input.remoteUrl || '')) ? String(input.remoteUrl) : '',
            lastPosition: Math.max(0, Number(input.lastPosition) || 0),
            duration: Math.max(0, Number(input.duration) || 0),
            volume: Math.max(0, Math.min(1, Number.isFinite(Number(input.volume)) ? Number(input.volume) : 1)),
            autoInteractionEnabled: input.autoInteractionEnabled === true,
            updatedAt: Number(input.updatedAt) || Date.now()
        };
    }

    async function loadState(sessionId) {
        const saved = await storage().getItem(key(STATE_PREFIX, sessionId));
        return cleanState(sessionId, saved);
    }

    async function saveState(sessionId, value) {
        const clean = cleanState(sessionId, value);
        clean.updatedAt = Date.now();
        await storage().setItem(key(STATE_PREFIX, sessionId), clean);
        return clean;
    }

    function cleanMessage(value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            id: String(input.id || ('watch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
            senderType: input.senderType === 'user' ? 'user' : 'partner',
            memberId: input.memberId ? String(input.memberId) : null,
            senderName: String(input.senderName || '').slice(0, 40),
            text: String(input.text || '').slice(0, 500),
            createdAt: Number(input.createdAt) || Date.now(),
            playbackTime: Math.max(0, Number(input.playbackTime) || 0)
        };
    }

    function safeRemoteUrl(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        try {
            const parsed = new URL(text);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
        } catch (error) { return ''; }
    }

    function cleanPlaylistItem(value) {
        const input = value && typeof value === 'object' ? value : {};
        const sourceType = input.sourceType === 'remote' ? 'remote' : 'local';
        return {
            id: String(input.id || ('watch_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
            name: String(input.name || '未命名视频').slice(0, 180),
            sourceType: sourceType,
            remoteUrl: sourceType === 'remote' ? safeRemoteUrl(input.remoteUrl) : '',
            mimeType: String(input.mimeType || '').slice(0, 100),
            size: Math.max(0, Number(input.size) || 0),
            createdAt: Number(input.createdAt) || Date.now(),
            lastPosition: Math.max(0, Number(input.lastPosition) || 0),
            duration: Math.max(0, Number(input.duration) || 0),
            needsFile: sourceType === 'local'
        };
    }

    function cleanPlaylist(sessionId, value) {
        const input = value && typeof value === 'object' ? value : {};
        const items = (Array.isArray(input.items) ? input.items : []).slice(0, MAX_PLAYLIST_ITEMS).map(cleanPlaylistItem);
        const current = items.some(function (item) { return item.id === String(input.currentItemId || ''); })
            ? String(input.currentItemId)
            : (items[0] ? items[0].id : null);
        return {
            version: 1,
            sessionId: String(sessionId),
            currentItemId: current,
            items: items,
            updatedAt: Number(input.updatedAt) || Date.now()
        };
    }

    async function loadPlaylist(sessionId) {
        return cleanPlaylist(sessionId, await storage().getItem(key(PLAYLIST_PREFIX, sessionId)));
    }

    async function savePlaylist(sessionId, value) {
        const clean = cleanPlaylist(sessionId, value);
        clean.updatedAt = Date.now();
        await storage().setItem(key(PLAYLIST_PREFIX, sessionId), clean);
        return clean;
    }

    async function loadMessages(sessionId) {
        const saved = await storage().getItem(key(MESSAGES_PREFIX, sessionId));
        return Array.isArray(saved) ? saved.slice(-MAX_MESSAGES).map(cleanMessage) : [];
    }

    async function saveMessages(sessionId, values) {
        const clean = (Array.isArray(values) ? values : []).slice(-MAX_MESSAGES).map(cleanMessage);
        await storage().setItem(key(MESSAGES_PREFIX, sessionId), clean);
        return clean;
    }

    async function remove(sessionId) {
        await Promise.all([
            storage().removeItem(key(STATE_PREFIX, sessionId)),
            storage().removeItem(key(MESSAGES_PREFIX, sessionId)),
            storage().removeItem(key(PLAYLIST_PREFIX, sessionId))
        ]);
    }

    async function exportPayload(sessionId, sessionName) {
        return {
            format: 'shiki-watch-together',
            version: 1,
            sessionId: String(sessionId),
            sessionName: String(sessionName || '').slice(0, 100),
            playlist: await loadPlaylist(sessionId),
            messages: await loadMessages(sessionId),
            createdAt: Date.now(),
            exportedAt: Date.now()
        };
    }

    function validateImport(payload, sessionId) {
        if (!payload || payload.format !== 'shiki-watch-together' || Number(payload.version) !== 1) {
            throw new Error('不是有效的共同观影记录');
        }
        const rawPlaylist = payload.playlist;
        if (!rawPlaylist || !Array.isArray(rawPlaylist.items) || !Array.isArray(payload.messages)) {
            throw new Error('观影记录结构不完整');
        }
        if (rawPlaylist.items.length > MAX_PLAYLIST_ITEMS || payload.messages.length > MAX_MESSAGES) {
            throw new Error('观影记录数量超过限制');
        }
        rawPlaylist.items.forEach(function (item) {
            if (item && item.sourceType === 'remote' && !safeRemoteUrl(item.remoteUrl)) {
                throw new Error('观影记录包含不安全的视频地址');
            }
        });
        return {
            playlist: cleanPlaylist(sessionId, rawPlaylist),
            messages: payload.messages.map(cleanMessage).slice(-MAX_MESSAGES)
        };
    }

    async function applyImport(sessionId, payload) {
        const clean = validateImport(payload, sessionId);
        await Promise.all([
            savePlaylist(sessionId, clean.playlist),
            saveMessages(sessionId, clean.messages)
        ]);
        return clean;
    }

    global.WatchTogetherStore = Object.freeze({
        version: '1.0.0',
        maxMessages: MAX_MESSAGES,
        maxPlaylistItems: MAX_PLAYLIST_ITEMS,
        stateKey: function (id) { return key(STATE_PREFIX, id); },
        messagesKey: function (id) { return key(MESSAGES_PREFIX, id); },
        playlistKey: function (id) { return key(PLAYLIST_PREFIX, id); },
        loadState: loadState,
        saveState: saveState,
        loadMessages: loadMessages,
        saveMessages: saveMessages,
        loadPlaylist: loadPlaylist,
        savePlaylist: savePlaylist,
        cleanPlaylist: cleanPlaylist,
        safeRemoteUrl: safeRemoteUrl,
        exportPayload: exportPayload,
        validateImport: validateImport,
        applyImport: applyImport,
        remove: remove
    });
})(window);
