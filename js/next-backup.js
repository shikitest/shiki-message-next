(function (global) {
    'use strict';
    const FORMAT = 'shiki-message-next-light';
    const JOURNAL = 'SHIKI_NEXT_importJournalV1';
    const suffixes = ['chatMessages', 'chatSettings', 'draft', 'showPartnerNameInChat'];
    const GLOBAL_KEY = 'SHIKI_NEXT_globalSettingsV1';
    const jsonCopy = input => JSON.parse(JSON.stringify(input));
    const moodSuffixes = ['moodCalendar', 'customMoodOptions'];
    const moodKey = (id, suffix) => 'SHIKI_NEXT_friend:' + id + ':' + suffix;
    const isExcludedMediaKey = key => /avatar|photo|image|audio|video|media|backgroundgallery|stickerlibrary|customemojis|customsongs|playercover/i.test(String(key));
    function moodCalendar(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 15000) throw new Error('心情日历格式无效');
        const result = {};
        for (const [date, entry] of Object.entries(input)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('心情日期或记录无效');
            result[date] = {};
            for (const field of ['partner', 'user', 'partnerNote', 'note', 'partnerWeather', 'myWeather']) {
                if (entry[field] === undefined) continue;
                if (typeof entry[field] !== 'string' || entry[field].length > 4000) throw new Error('心情文本无效');
                result[date][field] = entry[field];
            }
            if (entry.partnerChecked !== undefined) result[date].partnerChecked = entry.partnerChecked === true;
        }
        return result;
    }
    function moodOptions(input) {
        if (!Array.isArray(input) || input.length > 1000) throw new Error('自定义心情格式无效');
        return input.map(item => {
            if (!item || typeof item.key !== 'string' || !/^[\w-]{1,80}$/.test(item.key) || typeof item.label !== 'string' || item.label.length > 100 || /[<>]/.test(item.label) || typeof item.kaomoji !== 'string' || item.kaomoji.length > 100 || /[<>]/.test(item.kaomoji) || !/^#[0-9a-fA-F]{6}$/.test(item.color)) throw new Error('自定义心情内容无效');
            return { key: item.key, label: item.label, kaomoji: item.kaomoji, color: item.color };
        });
    }
    function message(input) {
        if (!input || typeof input !== 'object' || !['string', 'number'].includes(typeof input.id)) throw new Error('消息 ID 无效');
        const result = { id: input.id, sender: input.sender === null ? null : String(input.sender || '').slice(0, 100), text: String(input.text || '').slice(0, 30000),
            timestamp: input.timestamp, type: input.type === 'system' ? 'system' : 'normal', status: String(input.status || 'received').slice(0, 20),
            friendId: typeof input.friendId === 'string' ? input.friendId.slice(0, 80) : null,
            groupMemberId: typeof input.groupMemberId === 'string' ? input.groupMemberId.slice(0, 80) : null,
            favorited: input.favorited === true, note: typeof input.note === 'string' ? input.note.slice(0, 4000) : null };
        if (!Number.isFinite(new Date(result.timestamp).getTime())) throw new Error('消息日期无效');
        if (typeof input.translationText === 'string') result.translationText = input.translationText.slice(0, 30000);
        if (input.replyTo && ['string', 'number'].includes(typeof input.replyTo.id)) result.replyTo = { id: input.replyTo.id, text: String(input.replyTo.text || '').slice(0, 30000), sender: String(input.replyTo.sender || '').slice(0, 100) };
        if (input.image || /image|photo|audio|voice|video|file/.test(String(input.type || ''))) { result.text = result.text || '[媒体未包含在轻量备份中]'; result.type = 'normal'; }
        return result;
    }
    function globals(input) {
        const result = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('网站设置格式无效');
        for (const key of ['myName', 'myStatus', 'isDarkMode', 'colorTheme', 'fontSize', 'soundEnabled', 'soundVolume', 'musicPlayerEnabled', 'messageFontFamily', 'messageFontWeight', 'messageLineHeight', 'timeFormat']) {
            const value = input[key];
            if (value === undefined) continue;
            if (!['string', 'boolean', 'number'].includes(typeof value) || typeof value === 'string' && value.length > 200) throw new Error('网站设置值无效');
            result[key] = value;
        }
        if (result.fontSize !== undefined && (!Number.isFinite(result.fontSize) || result.fontSize < 12 || result.fontSize > 24)) throw new Error('字号无效');
        if (result.colorTheme !== undefined && !['black-white', 'gold', 'green'].includes(result.colorTheme)) result.colorTheme = 'black-white';
        return result;
    }
    function cleanSettings(input) {
        // Per-conversation backup must not smuggle website-wide preferences
        // into a conversation payload. Those remain owned by GLOBAL_KEY.
        const output = {};
        for (const key of ['replyEnabled', 'readReceiptsEnabled', 'typingIndicatorEnabled', 'inChatAvatarEnabled', 'inChatAvatarSize', 'showPartnerNameInChat', 'replyDelayMin', 'replyDelayMax', 'showPartnerMessageTranslation', 'showUserMessageTranslation', 'muted']) {
            if (typeof input[key] === 'boolean' || typeof input[key] === 'number' && Number.isFinite(input[key])) output[key] = input[key];
        }
        output.autoSendEnabled = false;
        return output;
    }
    function validate(data) {
        if (!data || data.format !== FORMAT || data.version !== 1) throw new Error('只支持新版轻量备份；旧备份兼容导入尚未完成');
        const model = NextModel.validate(data.model);
        if (!data.records || typeof data.records !== 'object' || Array.isArray(data.records)) throw new Error('备份记录格式无效');
        const allowed = new Map([[GLOBAL_KEY, 'global']]);
        model.conversations.forEach(c => suffixes.forEach(s => allowed.set('SHIKI_NEXT_' + c.id + '_' + s, s)));
        model.friends.forEach(f => moodSuffixes.forEach(s => allowed.set(moodKey(f.id, s), s)));
        const records = {};
        if (Object.keys(data.records).length > model.conversations.length * suffixes.length + model.friends.length * moodSuffixes.length + 1) throw new Error('备份记录数量无效');
        for (const [key, value] of Object.entries(data.records)) {
            const type = allowed.get(key); if (!type) throw new Error('备份包含不允许的存储键');
            if (type === 'chatMessages') {
                if (!Array.isArray(value) || value.length > 50000) throw new Error('消息数量超过预览版限制');
                records[key] = value.map(message);
            } else if (type === 'moodCalendar') records[key] = moodCalendar(value);
            else if (type === 'customMoodOptions') records[key] = moodOptions(value);
            else if (type === 'draft') {
                if (typeof value !== 'string' || value.length > 10000) throw new Error('草稿无效'); records[key] = value;
            } else if (type === 'showPartnerNameInChat') { if (typeof value !== 'boolean') throw new Error('显示设置无效'); records[key] = value; }
            else records[key] = type === 'global' ? globals(value) : cleanSettings(value);
        }
        return { model, records };
    }
    async function exportData() {
        const model = NextModel.snapshot(); model.friends.forEach(f => { f.avatar = null; });
        const records = {};
        records[GLOBAL_KEY] = globals(await localforage.getItem(GLOBAL_KEY) || {});
        for (const c of model.conversations) {
            for (const suffix of suffixes) {
                const key = 'SHIKI_NEXT_' + c.id + '_' + suffix, value = await localforage.getItem(key);
                if (value === null) continue;
                records[key] = suffix === 'chatMessages' ? value.map(message) : suffix === 'chatSettings' ? cleanSettings(value) : jsonCopy(value);
            }
        }
        for (const f of model.friends) {
            for (const suffix of moodSuffixes) {
                const key = moodKey(f.id, suffix), value = await localforage.getItem(key);
                if (value !== null) records[key] = suffix === 'moodCalendar' ? moodCalendar(value) : moodOptions(value);
            }
        }
        const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), exclusions: ['background galleries and sticker libraries', 'message image/audio/video/file payloads (replaced with text placeholders)', 'attachments', 'watch activity media', 'custom CSS', 'other conversations and website-wide preferences'], model, records };
        validate(data);
        if (JSON.stringify(data).length > 10 * 1024 * 1024) throw new Error('数据超过预览版轻量备份上限；未执行导出');
        return data;
    }
    async function exportConversation(sessionId) {
        const id = String(sessionId || ''), conversation = NextModel.conversation(id);
        if (!conversation) throw new Error('请先打开一个有效聊天');
        const friends = conversation.friendIds.map(friendId => NextModel.friend(friendId)).filter(Boolean);
        const prefix = APP_PREFIX + id + '_', records = {};
        for (const key of await localforage.keys()) {
            if (!key.startsWith(prefix) || isExcludedMediaKey(key)) continue;
            const value = await localforage.getItem(key);
            if (value !== null && value !== undefined) records[key] = jsonCopy(value);
        }
        const localPrefix = 'SHIKI_NEXT_' + id + '_';
        const localRecords = {};
        for (let i = 0; i < NextStorage.local.length; i++) {
            const key = NextStorage.local.key(i);
            if (key && key.startsWith(localPrefix) && !isExcludedMediaKey(key)) localRecords[key] = NextStorage.local.getItem(key);
        }
        const result = {
            format: 'shiki-message-next-conversation', version: 1, sessionId: id,
            exportedAt: new Date().toISOString(), conversation, friends,
            friendSnapshot: { included: true, warning: '好友资料为共享快照；恢复时默认不覆盖，需明确确认。' },
            records, localRecords,
            meta: global.ConversationMetaStore ? global.ConversationMetaStore.get(id) : {},
            exclusions: ['背景图库与贴图媒体', '消息内图片、音频、视频、附件载荷（以文字占位替代）', '共同活动媒体', '其它会话及全站设置', '原网站数据']
        };
        if (JSON.stringify(result).length > 10 * 1024 * 1024) throw new Error('当前聊天备份超过 10MB 轻量上限；未导出');
        return result;
    }
    async function exportMessages(sessionId) {
        const id = String(sessionId || ''), conversation = NextModel.conversation(id);
        if (!conversation) throw new Error('请先打开一个有效聊天');
        const messages = await localforage.getItem(getSessionStorageKey(id, 'chatMessages')) || [];
        if (!Array.isArray(messages)) throw new Error('聊天记录格式无效');
        return { format: 'shiki-message-next-messages', version: 1, sessionId: id, exportedAt: new Date().toISOString(), messages: messages.map(message) };
    }
    function validateConversation(data) {
        if (!data || data.format !== 'shiki-message-next-conversation' || data.version !== 1 || typeof data.sessionId !== 'string') throw new Error('不是可识别的当前聊天备份');
        const model = NextModel.validate({ version: 1, friends: data.friends, conversations: [data.conversation] });
        const c = model.conversations[0];
        if (c.id !== data.sessionId || !data.records || typeof data.records !== 'object' || Array.isArray(data.records) || !data.localRecords || typeof data.localRecords !== 'object' || Array.isArray(data.localRecords)) throw new Error('聊天备份身份或记录格式无效');
        const members = new Set(c.friendIds);
        if (model.friends.length !== members.size || model.friends.some(friend => !members.has(friend.id))) throw new Error('共享好友快照必须与当前聊天成员完全对应');
        const allowedPrefix = APP_PREFIX + c.id + '_';
        const records = {};
        for (const [key, value] of Object.entries(data.records)) {
            if (!key.startsWith(allowedPrefix) || isExcludedMediaKey(key)) throw new Error('聊天备份包含越界或未支持的数据键');
            if (key.endsWith('_chatMessages')) {
                if (!Array.isArray(value) || value.length > 50000) throw new Error('聊天消息数量无效');
                records[key] = value.map(message);
            } else if (key.endsWith('_draft')) {
                if (typeof value !== 'string' || value.length > 10000) throw new Error('聊天草稿无效'); records[key] = value;
            } else {
                if (!value || typeof value !== 'object' || JSON.stringify(value).length > 5 * 1024 * 1024) throw new Error('会话设置记录无效');
                records[key] = jsonCopy(value);
            }
        }
        for (const key of Object.keys(data.localRecords)) if (!key.startsWith('SHIKI_NEXT_' + c.id + '_') || isExcludedMediaKey(key)) throw new Error('聊天备份包含越界或未支持的本地设置');
        const metaInput = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta) ? data.meta : {};
        const meta = {};
        ['type', 'pinned', 'avatarRef', 'updatedAt', 'lastMessagePreview', 'lastMessageType', 'lastMessageAt'].forEach(key => {
            if (Object.prototype.hasOwnProperty.call(metaInput, key)) meta[key] = metaInput[key];
        });
        return { model, records, localRecords: data.localRecords, meta };
    }
    async function importConversation(data, targetId, restoreShared) {
        const clean = validateConversation(data), id = String(targetId || ''), current = NextModel.conversation(id);
        if (!current || id !== data.sessionId || JSON.stringify(current.friendIds) !== JSON.stringify(clean.model.conversations[0].friendIds)) throw new Error('为保护聊天身份，只能恢复到同一稳定 ID 且成员一致的聊天');
        if (current.friendIds.some(friendId => !NextModel.friend(friendId))) throw new Error('当前聊天有好友资料缺失，无法安全恢复');
        const prefix = APP_PREFIX + id + '_', localPrefix = 'SHIKI_NEXT_' + id + '_';
        const existingKeys = (await localforage.keys()).filter(key => key.startsWith(prefix));
        const existingLocalKeys = [];
        for (let i = 0; i < NextStorage.local.length; i++) {
            const key = NextStorage.local.key(i); if (key && key.startsWith(localPrefix)) existingLocalKeys.push(key);
        }
        const before = [], localBefore = [];
        for (const key of new Set([...existingKeys, ...Object.keys(clean.records)])) before.push([key, await localforage.getItem(key)]);
        for (const key of new Set([...existingLocalKeys, ...Object.keys(clean.localRecords)])) localBefore.push([key, NextStorage.local.getItem(key)]);
        const changedFriends = restoreShared ? clean.model.friends : [];
        const oldFriends = changedFriends.map(f => [f.id, NextModel.friend(f.id)]);
        const importedConversation = clean.model.conversations[0];
        await global.ConversationMetaStore.load();
        const oldMeta = global.ConversationMetaStore.get(id);
        try {
            // Media omitted from the file is left untouched in the target chat.
            for (const key of existingKeys) if (!isExcludedMediaKey(key) && !Object.prototype.hasOwnProperty.call(clean.records, key)) await localforage.removeItem(key);
            for (const key of existingLocalKeys) if (!isExcludedMediaKey(key) && !Object.prototype.hasOwnProperty.call(clean.localRecords, key)) NextStorage.local.removeItem(key);
            for (const [key, value] of Object.entries(clean.records)) await localforage.setItem(key, value);
            for (const [key, value] of Object.entries(clean.localRecords)) NextStorage.local.setItem(key, value);
            for (const friend of changedFriends) await NextModel.saveFriend(friend);
            if (current.type === 'group') await NextModel.updateGroup(id, importedConversation.name, current.friendIds);
            if (global.ConversationMetaStore) await global.ConversationMetaStore.update(id, clean.meta);
        } catch (error) {
            for (const [key, value] of before) { if (value === null) await localforage.removeItem(key); else await localforage.setItem(key, value); }
            for (const [key, value] of localBefore) { if (value === null) NextStorage.local.removeItem(key); else NextStorage.local.setItem(key, value); }
            for (const [friendId, friend] of oldFriends) if (friend) await NextModel.saveFriend(friend);
            if (current.type === 'group') await NextModel.updateGroup(id, current.name, current.friendIds);
            if (global.ConversationMetaStore) await global.ConversationMetaStore.update(id, oldMeta);
            throw error;
        }
        return true;
    }
    async function recover() {
        const journal = await localforage.getItem(JOURNAL);
        if (!journal) return;
        for (const [key, value] of journal.before) {
            if (!key.startsWith('SHIKI_NEXT_') || key === JOURNAL) throw new Error('恢复日志无效');
            if (value === null) await localforage.removeItem(key); else await localforage.setItem(key, value);
        }
        await localforage.removeItem(JOURNAL);
    }
    async function importData(data) {
        const clean = validate(data);
        const before = [];
        const keys = (await localforage.keys()).filter(k => k.startsWith('SHIKI_NEXT_') && k !== JOURNAL);
        const writes = { ...clean.records, [NextModel.key]: clean.model, SHIKI_NEXT_sessionList: clean.model.conversations };
        const affected = [...new Set([...keys, ...Object.keys(writes)])];
        for (const key of affected) before.push([key, await localforage.getItem(key)]);
        await localforage.setItem(JOURNAL, { before });
        try {
            for (const key of keys) if (!Object.prototype.hasOwnProperty.call(writes, key)) await localforage.removeItem(key);
            for (const [key, value] of Object.entries(writes)) await localforage.setItem(key, value);
            await localforage.removeItem(JOURNAL);
            NextStorage.local.clear();
            await NextModel.load();
        } catch (error) {
            try { await recover(); } catch (recoveryError) { console.error('[NextBackup] 恢复中断，保留回滚日志供下次启动恢复', recoveryError); }
            throw error;
        }
    }
    global.NextBackup = Object.freeze({ validate, exportData, importData, exportConversation, exportMessages, validateConversation, importConversation, recover });
})(window);
