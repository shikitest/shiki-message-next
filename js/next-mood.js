/* Original calendar schema, owned by a stable friend, never derived from messages. */
(function (global) {
    'use strict';
    const cache = new Map(), queues = new Map();
    let editorId = null, refreshVersion = 0;
    const copy = value => JSON.parse(JSON.stringify(value));
    function key(id, suffix = 'moodCalendar') { return APP_PREFIX + 'friend:' + id + ':' + suffix; }
    async function read(id, suffix = 'moodCalendar') {
        const target = key(id, suffix);
        let saved = await localforage.getItem(target);
        if (saved === null) {
            const direct = NextModel.snapshot().conversations.find(c => c.type === 'direct' && c.friendIds[0] === id);
            const previous = direct && await localforage.getItem(getSessionStorageKey(direct.id, suffix));
            if (previous !== null && previous !== undefined) { await localforage.setItem(target, previous); saved = previous; }
        }
        return saved || (suffix === 'moodCalendar' ? {} : []);
    }
    function today() { return formatDateStr(new Date()); }
    function status(id) {
        const data = cache.get(id);
        const entry = data && data.calendar[today()];
        const option = entry && [...MOOD_OPTIONS, ...data.options].find(m => m.key === entry.partner);
        return option ? option.kaomoji + ' ' + option.label : '暂无心情状态';
    }
    async function refresh() {
        const version = ++refreshVersion;
        for (const f of NextModel.snapshot().friends.filter(f => !f.deleted)) {
            const calendar = await read(f.id), options = await read(f.id, 'customMoodOptions');
            if (version !== refreshVersion) return;
            cache.set(f.id, { calendar, options });
        }
        if (global.NextUI) NextUI.refreshProfiles();
        if (global.NextRuntime) NextRuntime.applyCurrent();
    }
    async function open(id) {
        if (!NextModel.friend(id)) throw new Error('好友不存在');
        editorId = id;
        const [calendar, options, trash] = await Promise.all([read(id), read(id, 'customMoodOptions'), read(id, 'moodTrash')]);
        if (editorId !== id) return;
        moodData = copy(calendar); customMoodOptions = copy(options); moodTrash = copy(trash);
        global.moodData = moodData; global.moodTrash = moodTrash;
        currentCalendarDate = new Date();
        renderMoodCalendar();
        const modal = document.getElementById('mood-modal');
        modal.dataset.nextFriendId = id;
        const title = modal.querySelector('.modal-title');
        if (title) title.textContent = NextModel.friend(id).name + ' · 心情日历';
        modal.querySelectorAll('[data-name-partner]').forEach(node => { node.textContent = NextModel.friend(id).name + '的记录'; });
        document.getElementById('mood-tab-partner').textContent = NextModel.friend(id).name + '的记录';
        showModal(modal);
    }
    function save(suffix, value) {
        const id = editorId;
        if (!id) return Promise.reject(new Error('请从好友设定打开心情日历'));
        const snapshot = copy(value);
        const task = (queues.get(id) || Promise.resolve()).catch(() => {}).then(async () => {
            await localforage.setItem(key(id, suffix), snapshot);
            if (suffix === 'moodCalendar' || suffix === 'customMoodOptions') {
                const previous = cache.get(id) || { calendar: {}, options: [] };
                previous[suffix === 'moodCalendar' ? 'calendar' : 'options'] = snapshot; cache.set(id, previous);
                if (global.NextUI) NextUI.refreshProfiles();
                if (global.NextRuntime) NextRuntime.applyCurrent();
            }
        });
        queues.set(id, task); return task;
    }
    global.NextMood = Object.freeze({ key, read, today, status, refresh, open, save, friendName: () => (NextModel.friend(editorId) || {}).name || '好友', flush: () => Promise.all([...queues.values()]) });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(NextRuntime.report); });
    let boundary;
    function scheduleDayBoundary() {
        clearTimeout(boundary);
        const next = new Date(); next.setHours(24, 0, 1, 0);
        boundary = setTimeout(() => { refresh().catch(NextRuntime.report); scheduleDayBoundary(); }, next.getTime() - Date.now());
    }
    global.addEventListener('pagehide', () => clearTimeout(boundary));
    global.addEventListener('pageshow', event => { scheduleDayBoundary(); if (event.persisted) refresh().catch(NextRuntime.report); });
    scheduleDayBoundary();
})(window);
