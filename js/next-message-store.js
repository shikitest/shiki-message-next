/* Scoped append adapter for the existing chatMessages storage, not a second database. */
(function (global) {
    'use strict';
    const pending = new Map();
    function merge(id, records) {
        const result = Array.isArray(records) ? records.slice() : [];
        const ids = new Set(result.map(m => String(m.id)));
        for (const message of (pending.get(id) || new Map()).values()) {
            if (!ids.has(String(message.id))) { result.push(message); ids.add(String(message.id)); }
        }
        return result;
    }
    function adopt(id, records) {
        const entries = pending.get(id); if (!entries) return;
        records.forEach(m => entries.delete(String(m.id)));
        if (!entries.size) pending.delete(id);
    }
    async function append(id, message) {
        if (!NextModel.conversation(id)) return false;
        if (!pending.has(id)) pending.set(id, new Map());
        pending.get(id).set(String(message.id), message);
        await global.enqueueSessionWrite(id, async () => {
            if (!NextModel.conversation(id)) return;
            const key = getSessionStorageKey(id, 'chatMessages');
            const records = await localforage.getItem(key) || [];
            if (!records.some(m => String(m.id) === String(message.id))) records.push(message);
            await localforage.setItem(key, merge(id, records));
        });
        return Boolean(NextModel.conversation(id));
    }
    async function markRead(id) {
        return global.enqueueSessionWrite(id, async () => {
            if (!NextModel.conversation(id)) return;
            const key = getSessionStorageKey(id, 'chatMessages');
            const records = merge(id, await localforage.getItem(key) || []);
            records.forEach(m => { if (m.sender === 'user') m.status = 'read'; });
            await localforage.setItem(key, records);
        });
    }
    global.NextMessageStore = Object.freeze({ merge, adopt, append, markRead, discard: id => pending.delete(id) });
})(window);
