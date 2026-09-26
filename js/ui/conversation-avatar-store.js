(function (global) {
    'use strict';

    const STORE_SUFFIX = 'conversationAvatarMediaV1:';
    const objectUrls = new Map();
    const pendingUrls = new Map();
    const generations = new Map();

    function key(sessionId) {
        return String(global.APP_PREFIX || 'SHIKI_NEXT_') + STORE_SUFFIX + String(sessionId || '');
    }

    function storage() {
        if (!global.localforage || typeof global.localforage.getItem !== 'function') {
            throw new Error('Conversation avatar storage is unavailable');
        }
        return global.localforage;
    }

    function revoke(sessionId) {
        const id = String(sessionId || '');
        const url = objectUrls.get(id);
        if (url && global.URL && typeof global.URL.revokeObjectURL === 'function') {
            global.URL.revokeObjectURL(url);
        }
        objectUrls.delete(id);
        pendingUrls.delete(id);
        generations.set(id, (generations.get(id) || 0) + 1);
    }

    async function save(sessionId, file) {
        const id = String(sessionId || '');
        if (!id || !file || typeof file.size !== 'number') throw new Error('Invalid avatar file');
        if (!/^image\//i.test(file.type || '')) throw new Error('请选择图片文件');
        if (file.size > 8 * 1024 * 1024) throw new Error('头像文件不能超过 8MB');
        await storage().setItem(key(id), file);
        revoke(id);
        return 'local-avatar:' + id;
    }

    async function getObjectUrl(sessionId) {
        const id = String(sessionId || '');
        if (!id) return null;
        if (objectUrls.has(id)) return objectUrls.get(id);
        if (pendingUrls.has(id)) return pendingUrls.get(id);
        const generation = generations.get(id) || 0;
        const pending = storage().getItem(key(id)).then(function (blob) {
            if ((generations.get(id) || 0) !== generation) return null;
            if (!blob || !global.URL || typeof global.URL.createObjectURL !== 'function') return null;
            if (objectUrls.has(id)) return objectUrls.get(id);
            const url = global.URL.createObjectURL(blob);
            objectUrls.set(id, url);
            return url;
        });
        pending.then(function () {
            if (pendingUrls.get(id) === pending) pendingUrls.delete(id);
        }, function () {
            if (pendingUrls.get(id) === pending) pendingUrls.delete(id);
        });
        pendingUrls.set(id, pending);
        return pending;
    }

    async function remove(sessionId) {
        const id = String(sessionId || '');
        if (!id) return;
        revoke(id);
        await storage().removeItem(key(id));
    }

    global.addEventListener('pagehide', function () {
        Array.from(objectUrls.keys()).forEach(revoke);
    });

    global.ConversationAvatarStore = Object.freeze({
        key: key,
        save: save,
        getObjectUrl: getObjectUrl,
        remove: remove,
        revoke: revoke
    });
})(window);
