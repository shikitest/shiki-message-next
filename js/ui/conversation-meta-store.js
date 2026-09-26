(function (global) {
    'use strict';

    const STORE_SUFFIX = 'conversationUiMetaV1';
    let cache = Object.create(null);
    let loadPromise = null;
    let writeChain = Promise.resolve();

    function storageKey() {
        return String(global.APP_PREFIX || 'SHIKI_NEXT_') + STORE_SUFFIX;
    }

    function requireStorage() {
        if (!global.localforage || typeof global.localforage.getItem !== 'function') {
            throw new Error('Conversation UI metadata storage is unavailable');
        }
        return global.localforage;
    }

    function finiteTime(value) {
        if (value === null || value === undefined || value === '') return null;
        return Number.isFinite(Number(value)) ? Number(value) : null;
    }

    function sanitize(meta) {
        const input = meta && typeof meta === 'object' ? meta : {};
        return {
            type: input.type === 'group' ? 'group' : 'direct',
            pinned: input.pinned === true,
            avatarRef: typeof input.avatarRef === 'string' ? input.avatarRef : null,
            updatedAt: finiteTime(input.updatedAt),
            lastMessagePreview: typeof input.lastMessagePreview === 'string'
                ? input.lastMessagePreview.slice(0, 80)
                : null,
            lastMessageType: typeof input.lastMessageType === 'string'
                ? input.lastMessageType.slice(0, 24)
                : null,
            lastMessageAt: finiteTime(input.lastMessageAt)
        };
    }

    function copy(value) {
        return value ? Object.assign({}, value) : value;
    }

    async function load() {
        if (loadPromise) return loadPromise;
        loadPromise = (async function () {
            const saved = await requireStorage().getItem(storageKey());
            const next = Object.create(null);
            if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
                Object.keys(saved).forEach(function (sessionId) {
                    if (sessionId) next[sessionId] = sanitize(saved[sessionId]);
                });
            }
            cache = next;
            return snapshot();
        })().catch(function (error) {
            loadPromise = null;
            throw error;
        });
        return loadPromise;
    }

    function get(sessionId, options) {
        const id = String(sessionId || '');
        if (id && cache[id]) {
            return Object.assign(copy(cache[id]), { explicit: true, legacyGroup: false });
        }
        const legacyGroup = Boolean(options && options.isCurrent && options.legacyGroupEnabled);
        return Object.assign(sanitize({ type: legacyGroup ? 'group' : 'direct' }), {
            explicit: false,
            legacyGroup: legacyGroup
        });
    }

    async function update(sessionId, patch) {
        const id = String(sessionId || '');
        if (!id) throw new Error('A session id is required');
        await load();
        writeChain = writeChain.catch(function () {}).then(async function () {
            const nextEntry = sanitize(Object.assign({}, cache[id] || {}, patch || {}));
            const nextCache = Object.assign(Object.create(null), cache, { [id]: nextEntry });
            await requireStorage().setItem(storageKey(), nextCache);
            cache = nextCache;
            return copy(nextEntry);
        });
        return writeChain;
    }

    async function remove(sessionId) {
        const id = String(sessionId || '');
        if (!id) return;
        await load();
        writeChain = writeChain.catch(function () {}).then(async function () {
            if (!cache[id]) return;
            const nextCache = Object.assign(Object.create(null), cache);
            delete nextCache[id];
            await requireStorage().setItem(storageKey(), nextCache);
            cache = nextCache;
        });
        return writeChain;
    }

    function snapshot() {
        const result = Object.create(null);
        Object.keys(cache).forEach(function (id) { result[id] = copy(cache[id]); });
        return result;
    }

    global.ConversationMetaStore = Object.freeze({
        version: '1.0.0',
        key: storageKey,
        load: load,
        get: get,
        update: update,
        remove: remove,
        snapshot: snapshot
    });
})(window);
