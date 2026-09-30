(function (global) {
    'use strict';
    const KEY = 'SHIKI_NEXT_friendFrameworkV1';
    let state = { version: 1, friends: [], conversations: [] };
    let queue = Promise.resolve();
    const copy = value => JSON.parse(JSON.stringify(value));
    const uid = () => global.crypto.randomUUID();
    const preferenceKeys = ['allowReadNoReply', 'readNoReplyChance', 'replyDelayMin', 'replyDelayMax', 'textGenerationMode', 'typingIndicatorEnabled', 'readReceiptsEnabled', 'replyEnabled', 'autoSendEnabled', 'autoSendInterval', 'autoSendFrequency', 'usePreviewProbability'];
    function preferences(input) {
        const output = {};
        for (const key of preferenceKeys) {
            const value = input && input[key];
            if (value === undefined) continue;
            if (['allowReadNoReply', 'typingIndicatorEnabled', 'readReceiptsEnabled', 'replyEnabled', 'autoSendEnabled', 'usePreviewProbability'].includes(key)) {
                if (typeof value !== 'boolean') throw new Error('回复开关格式无效');
            } else if (key === 'textGenerationMode') {
                if (!['card', 'ime', 'mixed'].includes(value)) throw new Error('生成模式无效');
            } else if (key === 'autoSendFrequency') {
                if (!['low', 'normal', 'high'].includes(value)) throw new Error('主动发言频率无效');
            } else if (!Number.isFinite(value) || value < 0 || (key === 'readNoReplyChance' ? value > 1 : value > 3600000)) throw new Error('回复参数无效');
            output[key] = value;
        }
        if (output.replyDelayMin !== undefined && output.replyDelayMax !== undefined && output.replyDelayMin > output.replyDelayMax) throw new Error('最短延迟不能大于最长延迟');
        return output;
    }
    function text(value, max) { return String(value || '').trim().slice(0, max); }
    function validate(input) {
        if (!input || input.version !== 1 || !Array.isArray(input.friends) || !Array.isArray(input.conversations)) throw new Error('好友数据格式不正确');
        if (input.friends.length > 2000 || input.conversations.length > 5000) throw new Error('超过预览版数量限制');
        const ids = new Set();
        const clean = { version: 1, friends: [], conversations: [] };
        for (const f of input.friends) {
            if (!f || typeof f.id !== 'string' || !/^[\w-]{1,80}$/.test(f.id) || ids.has(f.id) || !text(f.name, 40)) throw new Error('好友 ID 或名称无效');
            if (!Array.isArray(f.cards) || f.cards.length > 2000 || f.cards.some(c => typeof c !== 'string' || c.length > 2000)) throw new Error('字卡格式或长度无效');
            ids.add(f.id);
            const avatar = typeof f.avatar === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(f.avatar) && f.avatar.length <= 250000 ? f.avatar : null;
            clean.friends.push({ id: f.id, name: text(f.name, 40), avatar, cards: f.cards.map(c => text(c, 2000)).filter(Boolean), deleted: f.deleted === true,
                replyProbability: Number.isFinite(f.replyProbability) ? Math.min(1, Math.max(0, f.replyProbability)) : 0.8,
                replySettings: preferences(f.replySettings), createdAt: Number(f.createdAt) || Date.now() });
        }
        const sessions = new Set(); const direct = new Set();
        for (const c of input.conversations) {
            if (!c || typeof c.id !== 'string' || !/^[\w-]{1,80}$/.test(c.id) || sessions.has(c.id) || !['direct', 'group'].includes(c.type)) throw new Error('会话格式不正确');
            const members = [...new Set(Array.isArray(c.friendIds) ? c.friendIds : [])];
            if (members.some(id => !ids.has(id)) || (c.type === 'direct' && members.length !== 1) || (c.type === 'group' && members.length < 2)) throw new Error('会话好友关系无效');
            if (c.type === 'direct' && direct.has(members[0])) throw new Error('同一好友存在重复单聊');
            if (c.type === 'direct') direct.add(members[0]);
            sessions.add(c.id);
            clean.conversations.push({ id: c.id, type: c.type, name: text(c.name, 50) || '群聊', friendIds: members, createdAt: Number(c.createdAt) || Date.now() });
        }
        return clean;
    }
    async function load() {
        const saved = await global.localforage.getItem(KEY);
        if (saved) state = validate(saved);
        return copy(state);
    }
    function mutate(operation) {
        const task = queue.catch(() => {}).then(async () => {
            const next = copy(state); const result = operation(next);
            const clean = validate(next);
            await global.localforage.setItem(KEY, clean);
            state = clean;
            global.dispatchEvent(new Event('next-model-change'));
            return copy(result);
        });
        queue = task; return task;
    }
    function friend(id) { return copy(state.friends.find(f => f.id === id) || null); }
    function conversation(id) { return copy(state.conversations.find(c => c.id === id) || null); }
    function members(id) { const c = conversation(id); return c ? c.friendIds.map(friend).filter(Boolean) : []; }
    global.NextModel = Object.freeze({ key: KEY, load, validate, preferences, snapshot: () => copy(state), friend, conversation, members,
        flush: () => queue,
        replace: input => mutate(next => { const clean = validate(input); Object.assign(next, clean); return clean; }),
        saveFriend: input => mutate(next => {
            const old = next.friends.find(f => f.id === input.id);
            const f = Object.assign({ id: uid(), cards: [], deleted: false, replyProbability: 0.8, createdAt: Date.now() }, old || {}, input);
            if (!text(f.name, 40)) throw new Error('请输入好友名称');
            if (old) next.friends[next.friends.indexOf(old)] = f; else next.friends.push(f);
            return f;
        }),
        deleteFriend: id => mutate(next => { const f = next.friends.find(f => f.id === id); if (!f) throw new Error('好友不存在'); f.deleted = true; return f; }),
        openDirect: id => mutate(next => {
            const f = next.friends.find(f => f.id === id && !f.deleted); if (!f) throw new Error('好友不存在或已删除');
            const existing = next.conversations.find(c => c.type === 'direct' && c.friendIds[0] === id);
            if (existing) return existing;
            const c = { id: uid(), type: 'direct', name: f.name, friendIds: [id], createdAt: Date.now() };
            next.conversations.push(c); return c;
        }),
        createGroup: (name, ids) => mutate(next => {
            const members = [...new Set(ids)];
            if (!text(name, 50) || members.length < 2 || members.some(id => !next.friends.some(f => f.id === id && !f.deleted))) throw new Error('请输入群名并选择至少两位好友');
            const c = { id: uid(), type: 'group', name: text(name, 50), friendIds: members, createdAt: Date.now() };
            next.conversations.push(c); return c;
        }),
        updateGroup: (id, name, ids) => mutate(next => {
            const c = next.conversations.find(c => c.id === id && c.type === 'group'); if (!c) throw new Error('群聊不存在');
            const previous = new Set(c.friendIds);
            if (ids.some(id => !next.friends.some(f => f.id === id && (!f.deleted || previous.has(id))))) throw new Error('不能添加已删除好友');
            c.name = text(name, 50); c.friendIds = [...new Set(ids)]; return c;
        }),
        deleteConversation: id => mutate(next => { next.conversations = next.conversations.filter(c => c.id !== id); return true; })
    });
})(window);
