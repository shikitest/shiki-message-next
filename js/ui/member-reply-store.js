(function (global) {
    'use strict';

    const RECORD_PREFIX = 'memberReplyLibraryV1:';
    const INDEX_PREFIX = 'memberReplyLibraryIndexV1:';
    const MAX_REPLIES = 2000;
    const MAX_GROUPS = 200;
    const MAX_TEXT_LENGTH = 2000;
    const sessionQueues = new Map();

    function storage() {
        if (!global.localforage) throw new Error('Member reply storage is unavailable');
        return global.localforage;
    }

    function prefix() {
        return String(global.APP_PREFIX || 'SHIKI_NEXT_');
    }

    function normalizeId(value, label) {
        const id = String(value || '');
        if (!id) throw new Error(label + ' is required');
        return id;
    }

    function recordKey(sessionId, memberId) {
        return prefix() + RECORD_PREFIX + normalizeId(sessionId, 'Session id') + ':' + normalizeId(memberId, 'Member id');
    }

    function indexKey(sessionId) {
        return prefix() + INDEX_PREFIX + normalizeId(sessionId, 'Session id');
    }

    function cleanText(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return '';
        return String(value).slice(0, MAX_TEXT_LENGTH);
    }

    function sanitizeGroup(value) {
        const input = value && typeof value === 'object' ? value : {};
        return {
            id: cleanText(input.id || ('mrg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
            name: cleanText(input.name || '分组'),
            enabled: input.enabled !== false
        };
    }

    function sanitize(sessionId, memberId, value) {
        const input = Array.isArray(value) ? { replies: value } : (value && typeof value === 'object' ? value : {});
        return {
            version: 1,
            sessionId: normalizeId(sessionId, 'Session id'),
            memberId: normalizeId(memberId, 'Member id'),
            replies: Array.isArray(input.replies)
                ? input.replies.slice(0, MAX_REPLIES).map(cleanText).filter(Boolean)
                : [],
            groups: Array.isArray(input.groups)
                ? input.groups.slice(0, MAX_GROUPS).map(sanitizeGroup)
                : [],
            updatedAt: Date.now()
        };
    }

    async function getIndex(sessionId) {
        const saved = await storage().getItem(indexKey(sessionId));
        return Array.isArray(saved) ? saved.map(String).filter(Boolean) : [];
    }

    async function updateIndex(sessionId, memberId, shouldExist) {
        const id = normalizeId(memberId, 'Member id');
        const index = await getIndex(sessionId);
        const next = index.filter(function (item) { return item !== id; });
        if (shouldExist) next.push(id);
        if (next.length) await storage().setItem(indexKey(sessionId), next);
        else await storage().removeItem(indexKey(sessionId));
    }

    function runExclusive(sessionId, operation) {
        const id = normalizeId(sessionId, 'Session id');
        const previous = sessionQueues.get(id) || Promise.resolve();
        const current = previous.catch(function () {}).then(operation);
        sessionQueues.set(id, current);
        current.then(function () {
            if (sessionQueues.get(id) === current) sessionQueues.delete(id);
        }, function () {
            if (sessionQueues.get(id) === current) sessionQueues.delete(id);
        });
        return current;
    }

    async function get(sessionId, memberId) {
        const saved = await storage().getItem(recordKey(sessionId, memberId));
        return saved ? sanitize(sessionId, memberId, saved) : null;
    }

    async function set(sessionId, memberId, value) {
        return runExclusive(sessionId, async function () {
            const key = recordKey(sessionId, memberId);
            const clean = sanitize(sessionId, memberId, value);
            const previous = await storage().getItem(key);
            await storage().setItem(key, clean);
            try {
                await updateIndex(sessionId, memberId, true);
            } catch (error) {
                if (previous === null || previous === undefined) {
                    await storage().removeItem(key).catch(function () {});
                } else {
                    await storage().setItem(key, previous).catch(function () {});
                }
                throw error;
            }
            return clean;
        });
    }

    async function remove(sessionId, memberId) {
        return runExclusive(sessionId, async function () {
            const key = recordKey(sessionId, memberId);
            const previous = await storage().getItem(key);
            await storage().removeItem(key);
            try {
                await updateIndex(sessionId, memberId, false);
            } catch (error) {
                if (previous !== null && previous !== undefined) {
                    await storage().setItem(key, previous).catch(function () {});
                }
                throw error;
            }
        });
    }

    async function removeSession(sessionId) {
        return runExclusive(sessionId, async function () {
            const ids = await getIndex(sessionId);
            for (let i = 0; i < ids.length; i += 1) {
                await storage().removeItem(recordKey(sessionId, ids[i]));
            }
            await storage().removeItem(indexKey(sessionId));
        });
    }

    async function has(sessionId, memberId) {
        return Boolean(await storage().getItem(recordKey(sessionId, memberId)));
    }

    global.MemberReplyStore = Object.freeze({
        version: '1.0.0',
        key: recordKey,
        indexKey: indexKey,
        sanitize: sanitize,
        get: get,
        set: set,
        remove: remove,
        removeSession: removeSession,
        has: has
    });
})(window);
