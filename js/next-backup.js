(function (global) {
    'use strict';
    const FORMAT = 'shiki-message-next-light';
    const JOURNAL = 'SHIKI_NEXT_importJournalV1';
    const suffixes = ['chatMessages', 'chatSettings', 'draft', 'showPartnerNameInChat'];
    const GLOBAL_KEY = 'SHIKI_NEXT_globalSettingsV1';
    const jsonCopy = input => JSON.parse(JSON.stringify(input));
    const moodSuffixes = ['moodCalendar', 'customMoodOptions'];
    const moodKey = (id, suffix) => 'SHIKI_NEXT_friend:' + id + ':' + suffix;
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
        const output = globals(input);
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
        const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), exclusions: ['avatars', 'images', 'audio', 'video', 'files', 'watch activities', 'custom CSS', 'backgrounds'], model, records };
        validate(data);
        if (JSON.stringify(data).length > 10 * 1024 * 1024) throw new Error('数据超过预览版轻量备份上限；未执行导出');
        return data;
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
    global.NextBackup = Object.freeze({ validate, exportData, importData, recover });
})(window);
