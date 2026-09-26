(function (global) {
    'use strict';

    let context = null;
    let page = null;
    let video = null;
    let localInput = null;
    let importInput = null;
    let localMedia = null;
    let danmaku = null;
    let messages = [];
    let state = null;
    let playlist = { currentItemId: null, items: [] };
    const localFiles = new Map();
    let autoTimer = null;
    let saveTimer = null;
    let initialized = false;
    let openState = false;
    let stateWrites = 0;

    function createObjectUrlLifecycle(urlApi) {
        let current = null;
        let creates = 0;
        let revokes = 0;
        function clear() {
            if (!current) return;
            try { urlApi.revokeObjectURL(current); } catch (error) {}
            current = null;
            revokes += 1;
        }
        return {
            replace: function (file) {
                clear();
                current = urlApi.createObjectURL(file);
                creates += 1;
                return current;
            },
            clear: clear,
            current: function () { return current; },
            stats: function () { return { creates: creates, revokes: revokes, active: current ? 1 : 0 }; }
        };
    }

    const objectUrls = createObjectUrlLifecycle(global.URL);

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function notify(text, type) {
        if (context && context.notify) context.notify(text, type || 'info');
    }

    function currentSession() {
        return context && context.getCurrentSession ? context.getCurrentSession() : null;
    }

    function revokeObjectUrl() {
        objectUrls.clear();
    }

    function formatTime(value) {
        const seconds = Math.max(0, Math.floor(Number(value) || 0));
        const minutes = Math.floor(seconds / 60);
        return minutes + ':' + String(seconds % 60).padStart(2, '0');
    }

    function updateTime() {
        if (!page || !video) return;
        page.querySelector('.shiki-watch-time').textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
    }

    function snapshotState() {
        const session = currentSession();
        return Object.assign({}, state || {}, {
            sessionId: session ? session.id : '',
            lastPosition: video ? video.currentTime || 0 : 0,
            duration: video && Number.isFinite(video.duration) ? video.duration : (state && state.duration) || 0,
            volume: video ? video.volume : (state && state.volume) || 1,
            updatedAt: Date.now()
        });
    }

    function currentItem() {
        return playlist && Array.isArray(playlist.items)
            ? playlist.items.find(function (item) { return item.id === playlist.currentItemId; }) || null
            : null;
    }

    function captureCurrentProgress() {
        const item = currentItem();
        if (!item || !video) return;
        const duration = Number.isFinite(video.duration) ? Math.max(0, video.duration) : item.duration;
        item.duration = Number.isFinite(duration) ? duration : 0;
        item.lastPosition = Math.max(0, Math.min(Number(video.currentTime) || 0, item.duration || Number.MAX_SAFE_INTEGER));
    }

    function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        const session = currentSession();
        if (!session || !global.WatchTogetherStore) return Promise.resolve();
        captureCurrentProgress();
        state = snapshotState();
        stateWrites += 1;
        return Promise.all([
            global.WatchTogetherStore.saveState(session.id, state),
            global.WatchTogetherStore.savePlaylist(session.id, playlist)
        ]).catch(function (error) {
            console.warn('[WatchTogether] 状态保存失败:', error);
        });
    }

    function scheduleSave() {
        if (saveTimer) return;
        saveTimer = setTimeout(saveNow, 4000);
    }

    function clearAutoTimer() {
        if (autoTimer) clearTimeout(autoTimer);
        autoTimer = null;
    }

    function choosePartner() {
        const members = context && context.getGroupMembers ? context.getGroupMembers() : [];
        if (Array.isArray(members) && members.length) {
            const member = members[Math.floor(Math.random() * members.length)];
            return { memberId: member.id || null, senderName: member.name || '群成员' };
        }
        return { memberId: null, senderName: context && context.getPartnerName ? context.getPartnerName() : '对方' };
    }

    function createSenderOptions(senderContext) {
        const result = [{ value: 'user', senderType: 'user', memberId: null,
            senderName: senderContext && senderContext.getMyName ? senderContext.getMyName() : '我' }];
        const members = senderContext && senderContext.getGroupMembers ? senderContext.getGroupMembers() : [];
        if (Array.isArray(members) && members.length) {
            members.forEach(function (member) {
                if (!member || !member.id) return;
                result.push({ value: 'member:' + member.id, senderType: 'partner',
                    memberId: member.id, senderName: member.name || '群成员' });
            });
        } else {
            result.push({ value: 'partner', senderType: 'partner', memberId: null,
                senderName: senderContext && senderContext.getPartnerName ? senderContext.getPartnerName() : '对方' });
        }
        return result;
    }

    function availableSenders() { return createSenderOptions(context); }

    function renderSenderOptions() {
        const select = page && page.querySelector('.shiki-watch-sender-select');
        if (!select) return;
        const selected = select.value;
        select.replaceChildren();
        availableSenders().forEach(function (sender) {
            const option = make('option', '', sender.senderType === 'user' ? '我' : sender.senderName);
            option.value = sender.value;
            select.appendChild(option);
        });
        if (Array.from(select.options).some(function (option) { return option.value === selected; })) {
            select.value = selected;
        }
    }

    function generateBlindText() {
        if (typeof global.chooseReplyText === 'function') {
            const choice = global.chooseReplyText(Array.isArray(global._customReplies) ? global._customReplies.slice() : []);
            if (choice && choice.text) return String(choice.text);
        }
        if (global.RandomIME && typeof global.RandomIME.generate === 'function') {
            const generated = global.RandomIME.generate();
            if (generated && generated.text) return String(generated.text);
        }
        return ['うん', 'そうだね', 'えっ', 'なるほど', 'ふふ'][Math.floor(Math.random() * 5)];
    }

    async function appendInteraction(entry) {
        const session = currentSession();
        if (!session || !global.WatchTogetherStore) return;
        const message = Object.assign({
            id: 'watch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            createdAt: Date.now(),
            playbackTime: video ? video.currentTime || 0 : 0
        }, entry);
        messages.push(message);
        messages = messages.slice(-global.WatchTogetherStore.maxMessages);
        renderMessages();
        if (danmaku) {
            danmaku.setMessages(messages);
            danmaku.immediate(message);
        }
        try {
            await global.WatchTogetherStore.saveMessages(session.id, messages);
        } catch (error) {
            console.warn('[WatchTogether] 留言保存失败:', error);
            notify('观影留言保存失败，刷新后可能丢失', 'warning');
        }
    }

    function scheduleAutoInteraction() {
        clearAutoTimer();
        if (!openState || !state || !state.autoInteractionEnabled || !video || video.paused || video.ended) return;
        const delay = 45000 + Math.floor(Math.random() * 75001);
        autoTimer = setTimeout(async function () {
            autoTimer = null;
            if (!openState || !video || video.paused || video.ended) return;
            const partner = choosePartner();
            await appendInteraction({ senderType: 'partner', memberId: partner.memberId, senderName: partner.senderName, text: generateBlindText() });
            scheduleAutoInteraction();
        }, delay);
    }

    function renderMessages() {
        const list = page && page.querySelector('.shiki-watch-messages');
        if (!list) return;
        list.replaceChildren();
        if (!messages.length) {
            list.appendChild(make('div', 'shiki-record-empty', '观影互动会显示在这里'));
            return;
        }
        messages.slice(-100).forEach(function (message) {
            const row = make('div', 'shiki-watch-message ' + (message.senderType === 'user' ? 'user' : 'partner'));
            row.append(
                make('strong', '', message.senderName || (message.senderType === 'user' ? '我' : '对方')),
                make('span', '', message.text),
                make('small', '', formatTime(message.playbackTime))
            );
            list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
    }

    function renderPlaylist() {
        const list = page && page.querySelector('.shiki-watch-playlist');
        if (!list) return;
        list.replaceChildren();
        if (!playlist.items.length) {
            list.appendChild(make('div', 'shiki-record-empty', '播放列表为空'));
            return;
        }
        playlist.items.forEach(function (item, index) {
            const row = make('div', 'shiki-watch-playlist-item' + (item.id === playlist.currentItemId ? ' active' : ''));
            row.dataset.playlistId = item.id;
            const main = make('button', 'shiki-watch-playlist-main');
            main.type = 'button';
            main.dataset.watchItemAction = 'play';
            main.innerHTML = '<i class="fas ' + (item.sourceType === 'remote' ? 'fa-link' : 'fa-file-video') + '"></i>';
            const details = make('span');
            details.append(
                make('strong', '', item.name),
                make('small', '', item.sourceType === 'remote' ? '网络视频' : (localFiles.has(item.id) ? '本地视频' : '需要重新选择文件'))
            );
            main.appendChild(details);
            const controls = make('span', 'shiki-watch-playlist-controls');
            [['up', 'fa-arrow-up'], ['down', 'fa-arrow-down'], ['delete', 'fa-trash']].forEach(function (entry) {
                const button = make('button');
                button.type = 'button';
                button.dataset.watchItemAction = entry[0];
                button.disabled = (entry[0] === 'up' && index === 0) || (entry[0] === 'down' && index === playlist.items.length - 1);
                button.innerHTML = '<i class="fas ' + entry[1] + '"></i>';
                controls.appendChild(button);
            });
            row.append(main, controls);
            list.appendChild(row);
        });
    }

    async function playItem(itemId, shouldPlay) {
        captureCurrentProgress();
        const item = playlist.items.find(function (candidate) { return candidate.id === itemId; });
        if (!item) return;
        const sameActiveLocal = item.sourceType === 'local' && playlist.currentItemId === item.id &&
            localFiles.has(item.id) && objectUrls.current() && video.currentSrc;
        playlist.currentItemId = item.id;
        if (sameActiveLocal) {
            renderPlaylist();
            if (shouldPlay) {
                try {
                    const result = video.play();
                    if (result && result.catch) result.catch(function () {});
                } catch (error) {}
            }
            return;
        }
        if (item.sourceType === 'remote') {
            setVideoSource(item.remoteUrl, item.name, 'remote');
        } else {
            const file = localFiles.get(item.id);
            if (!file) {
                video.pause();
                if (danmaku) danmaku.clear();
                if (localMedia) localMedia.clear();
                revokeObjectUrl();
                video.removeAttribute('src');
                video.load();
                page.querySelector('.shiki-watch-video-name').textContent = item.name;
                notify('请重新选择本地视频文件', 'info');
                renderPlaylist();
                saveNow();
                return;
            }
            const url = objectUrls.replace(file);
            setVideoSource(url, item.name, 'local', true);
        }
        renderPlaylist();
        if (shouldPlay) {
            try {
                const result = video.play();
                if (result && result.catch) result.catch(function () { notify('请点击播放器开始播放', 'info'); });
            } catch (error) { notify('请点击播放器开始播放', 'info'); }
        }
    }

    function adjacentItem(step) {
        if (!playlist.items.length) return null;
        const currentIndex = Math.max(0, playlist.items.findIndex(function (item) { return item.id === playlist.currentItemId; }));
        return playlist.items[(currentIndex + step + playlist.items.length) % playlist.items.length];
    }

    function playAdjacent(step) {
        const item = adjacentItem(step);
        if (item) playItem(item.id, true);
    }

    function moveItem(itemId, direction) {
        const index = playlist.items.findIndex(function (item) { return item.id === itemId; });
        const target = index + direction;
        if (index < 0 || target < 0 || target >= playlist.items.length) return;
        const moved = playlist.items.splice(index, 1)[0];
        playlist.items.splice(target, 0, moved);
        renderPlaylist();
        saveNow();
    }

    function deleteItem(itemId) {
        const index = playlist.items.findIndex(function (item) { return item.id === itemId; });
        if (index < 0) return;
        const wasCurrent = playlist.currentItemId === itemId;
        const shouldResume = wasCurrent && video && !video.paused;
        localFiles.delete(itemId);
        playlist.items.splice(index, 1);
        if (wasCurrent) {
            video.pause();
            if (danmaku) danmaku.clear();
            if (localMedia) localMedia.clear();
            revokeObjectUrl();
            video.removeAttribute('src');
            video.load();
            const nextItem = playlist.items[Math.min(index, playlist.items.length - 1)];
            playlist.currentItemId = nextItem ? nextItem.id : null;
            if (playlist.currentItemId) playItem(playlist.currentItemId, shouldResume);
        }
        renderPlaylist();
        saveNow();
    }

    function clearPlaylist() {
        if (!playlist.items.length) return;
        if (!global.confirm('确定清空当前会话的观影播放列表吗？')) return;
        video.pause();
        if (danmaku) danmaku.clear();
        if (localMedia) localMedia.clear();
        revokeObjectUrl();
        video.removeAttribute('src');
        video.load();
        localFiles.clear();
        playlist.items = [];
        playlist.currentItemId = null;
        page.querySelector('.shiki-watch-video-name').textContent = '未选择视频';
        renderPlaylist();
        saveNow();
    }

    function downloadJson(payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = global.URL.createObjectURL(blob);
        const anchor = make('a');
        anchor.href = url;
        anchor.download = 'watch-together-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { global.URL.revokeObjectURL(url); }, 0);
    }

    async function exportRecord() {
        const session = currentSession();
        if (!session) return;
        await saveNow();
        try {
            downloadJson(await global.WatchTogetherStore.exportPayload(session.id, session.name));
            notify('观影记录已导出', 'success');
        } catch (error) { notify('观影记录导出失败', 'error'); }
    }

    function readTextFile(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || '')); };
            reader.onerror = function () { reject(reader.error || new Error('文件读取失败')); };
            reader.readAsText(file, 'utf-8');
        });
    }

    async function importRecord() {
        const file = importInput.files && importInput.files[0];
        importInput.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return notify('观影记录文件不能超过5MB', 'warning');
        const session = currentSession();
        if (!session) return;
        try {
            const payload = JSON.parse(await readTextFile(file));
            const clean = global.WatchTogetherStore.validateImport(payload, session.id);
            if (!global.confirm('导入将覆盖当前会话的观影播放列表和互动记录，是否继续？')) return;
            await global.WatchTogetherStore.applyImport(session.id, payload);
            playlist = clean.playlist;
            messages = clean.messages;
            if (danmaku) { danmaku.clear(); danmaku.setMessages(messages, true); }
            localFiles.clear();
            if (localMedia) localMedia.clear();
            revokeObjectUrl();
            video.pause();
            video.removeAttribute('src');
            video.load();
            renderPlaylist();
            renderMessages();
            if (playlist.currentItemId) await playItem(playlist.currentItemId);
            notify('观影记录已导入，本地视频需要重新选择', 'success');
        } catch (error) {
            notify(error && error.message ? error.message : '观影记录导入失败', 'error');
        }
    }

    function setVideoSource(source, name, type, sourceAlreadyOwned) {
        if (danmaku) danmaku.clear();
        if (localMedia) localMedia.clear();
        if (!sourceAlreadyOwned) revokeObjectUrl();
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.src = source;
        state.videoName = name || '';
        state.sourceType = type;
        state.remoteUrl = type === 'remote' ? source : '';
        page.querySelector('.shiki-watch-video-name').textContent = name || '未选择视频';
        saveNow();
    }

    async function handleLocalFile() {
        const files = Array.from(localInput.files || []);
        localInput.value = '';
        if (!files.length) return;
        const added = [];
        let rejected = '';
        files.forEach(function (file) {
            if (playlist.items.length >= global.WatchTogetherStore.maxPlaylistItems) return;
            const mediaError = global.WatchLocalMedia.videoError(file, video);
            if (mediaError) { rejected = mediaError; return; }
            const type = String(file.type || '');
            let item = playlist.items.find(function (candidate) {
                return candidate.sourceType === 'local' && !localFiles.has(candidate.id) && candidate.name === file.name && Number(candidate.size) === Number(file.size);
            });
            if (!item) {
                item = {
                    id: 'watch_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    name: file.name || '本地视频',
                    sourceType: 'local', remoteUrl: '', mimeType: type,
                    size: Number(file.size) || 0, createdAt: Date.now(), lastPosition: 0, duration: 0, needsFile: false
                };
                playlist.items.push(item);
            }
            localFiles.set(item.id, file);
            item.needsFile = false;
            added.push(item);
        });
        if (rejected && localMedia) localMedia.showError(rejected);
        if (!added.length) return notify(rejected || '请选择视频文件', 'warning');
        if (added.length < files.length) notify(rejected || '部分文件未加入：播放列表最多保存 ' + global.WatchTogetherStore.maxPlaylistItems + ' 条', 'warning');
        if (!playlist.currentItemId) playlist.currentItemId = added[0].id;
        renderPlaylist();
        await saveNow();
        await playItem(added[0].id, true);
        if (rejected && localMedia) localMedia.showError(rejected);
    }

    function useRemoteUrl() {
        const input = page.querySelector('.shiki-watch-url');
        const url = input.value.trim();
        const safeUrl = global.WatchTogetherStore.safeRemoteUrl(url);
        if (!safeUrl) return notify('请输入安全的 http 或 https 视频直链', 'warning');
        if (playlist.items.length >= global.WatchTogetherStore.maxPlaylistItems) return notify('播放列表已达到数量上限', 'warning');
        const item = {
            id: 'watch_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: safeUrl.split('/').pop().split('?')[0] || '网络视频',
            sourceType: 'remote', remoteUrl: safeUrl, mimeType: '', size: 0,
            createdAt: Date.now(), lastPosition: 0, duration: 0, needsFile: false
        };
        playlist.items.push(item);
        playlist.currentItemId = item.id;
        input.value = '';
        renderPlaylist();
        saveNow();
        playItem(item.id, true);
    }

    async function sendManual() {
        const input = page.querySelector('.shiki-watch-input');
        const text = input.value.trim();
        if (!text) return;
        const select = page.querySelector('.shiki-watch-sender-select');
        const sender = availableSenders().find(function (item) { return item.value === select.value; }) || availableSenders()[0];
        input.value = '';
        await appendInteraction({ senderType: sender.senderType, memberId: sender.memberId,
            senderName: sender.senderName, text: text });
    }

    function endWatching() {
        clearAutoTimer();
        if (danmaku) danmaku.clear();
        video.pause();
        if (localMedia) localMedia.clear();
        revokeObjectUrl();
        video.removeAttribute('src');
        video.load();
        state = Object.assign({}, state, { videoName: '', sourceType: null, remoteUrl: '', lastPosition: 0, duration: 0 });
        page.querySelector('.shiki-watch-video-name').textContent = '未选择视频';
        updateTime();
        saveNow();
    }

    function requestFullscreen() {
        const method = video.requestFullscreen || video.webkitEnterFullscreen || video.webkitRequestFullscreen;
        if (!method) return notify('当前浏览器不支持网页全屏，请使用播放器自带全屏按钮', 'info');
        try {
            const result = method.call(video);
            if (result && result.catch) result.catch(function () { notify('无法进入全屏', 'warning'); });
        } catch (error) { notify('无法进入全屏', 'warning'); }
    }

    function build() {
        page = make('section', 'shiki-record-page shiki-watch-page');
        page.id = 'shiki-watch-together';
        page.hidden = true;
        page.innerHTML = [
            '<header class="shiki-record-header"><button type="button" data-watch-action="close" aria-label="返回"><i class="fas fa-chevron-left"></i></button><h2>共同观影</h2><button type="button" data-watch-action="end">结束</button></header>',
            '<div class="shiki-watch-heading"><strong class="shiki-watch-session"></strong><small>单设备本地模拟 · 不上传视频</small></div>',
            '<div class="shiki-watch-player"><div class="shiki-watch-video-stage"><video controls playsinline webkit-playsinline preload="metadata"></video><div class="shiki-watch-danmaku-layer" aria-hidden="true"></div></div><div class="shiki-watch-video-name">未选择视频</div><div class="shiki-watch-time">0:00 / 0:00</div><div class="shiki-watch-skip"><button type="button" data-watch-action="previous"><i class="fas fa-step-backward"></i>上一条</button><button type="button" data-watch-action="next">下一条<i class="fas fa-step-forward"></i></button></div></div>',
            '<div class="shiki-watch-source-actions"><button type="button" data-watch-action="local"><i class="fas fa-folder-open"></i>选择本地视频</button><input class="shiki-watch-url" type="url" placeholder="可直接播放的 http/https 视频地址"><button type="button" data-watch-action="remote">打开直链</button><button type="button" data-watch-action="fullscreen"><i class="fas fa-expand"></i>全屏</button></div>',
            '<section class="shiki-watch-playlist-section"><div class="shiki-watch-section-title"><strong>播放列表</strong><button type="button" data-watch-action="clear-playlist">清空</button></div><div class="shiki-watch-playlist"></div></section>',
            '<div class="shiki-watch-record-actions"><button type="button" data-watch-action="export"><i class="fas fa-file-export"></i>导出观影记录</button><button type="button" data-watch-action="import"><i class="fas fa-file-import"></i>导入观影记录</button></div>',
            '<label class="shiki-watch-auto"><input type="checkbox" class="shiki-watch-auto-input"><span>随机观影互动（与视频内容无关）</span></label>',
            '<div class="shiki-watch-messages"></div>',
            '<div class="shiki-watch-compose"><select class="shiki-watch-sender-select" aria-label="发送身份"></select><input class="shiki-watch-input" maxlength="500" placeholder="发送观影留言"><button type="button" data-watch-action="send">发送</button></div>'
        ].join('');
        localInput = make('input');
        localInput.type = 'file';
        localInput.accept = 'video/*';
        localInput.multiple = true;
        localInput.hidden = true;
        page.appendChild(localInput);
        importInput = make('input');
        importInput.type = 'file';
        importInput.accept = 'application/json,.json';
        importInput.hidden = true;
        page.appendChild(importInput);
        document.body.appendChild(page);
        video = page.querySelector('video');
        danmaku = global.WatchDanmaku.attach(page.querySelector('.shiki-watch-danmaku-layer'), video);
        localMedia = global.WatchLocalMedia.attach(page, video);
        page.addEventListener('click', function (event) {
            const action = event.target.closest('[data-watch-action]');
            if (action) {
                if (action.dataset.watchAction === 'close') close();
                else if (action.dataset.watchAction === 'end') endWatching();
                else if (action.dataset.watchAction === 'local') localInput.click();
                else if (action.dataset.watchAction === 'remote') useRemoteUrl();
                else if (action.dataset.watchAction === 'fullscreen') requestFullscreen();
                else if (action.dataset.watchAction === 'send') sendManual();
                else if (action.dataset.watchAction === 'previous') playAdjacent(-1);
                else if (action.dataset.watchAction === 'next') playAdjacent(1);
                else if (action.dataset.watchAction === 'clear-playlist') clearPlaylist();
                else if (action.dataset.watchAction === 'export') exportRecord();
                else if (action.dataset.watchAction === 'import') importInput.click();
            }
            const itemAction = event.target.closest('[data-watch-item-action]');
            if (!itemAction) return;
            const row = itemAction.closest('[data-playlist-id]');
            if (!row) return;
            const itemId = row.dataset.playlistId;
            if (itemAction.dataset.watchItemAction === 'play') playItem(itemId, true);
            else if (itemAction.dataset.watchItemAction === 'up') moveItem(itemId, -1);
            else if (itemAction.dataset.watchItemAction === 'down') moveItem(itemId, 1);
            else if (itemAction.dataset.watchItemAction === 'delete') deleteItem(itemId);
        });
        localInput.addEventListener('change', handleLocalFile);
        importInput.addEventListener('change', importRecord);
        video.addEventListener('timeupdate', function () { updateTime(); if (danmaku) danmaku.tick(); scheduleSave(); });
        video.addEventListener('seeked', function () { if (danmaku) danmaku.seek(); });
        video.addEventListener('loadedmetadata', function () {
            const item = currentItem();
            const position = item ? item.lastPosition : (state && state.lastPosition);
            if (position > 0 && position < video.duration) {
                try { video.currentTime = position; } catch (error) {}
            }
            updateTime();
        });
        video.addEventListener('play', function () { if (danmaku) danmaku.play(); scheduleAutoInteraction(); });
        video.addEventListener('pause', function () { if (danmaku) danmaku.pause(); clearAutoTimer(); saveNow(); });
        video.addEventListener('ended', function () { if (danmaku) danmaku.clear(); clearAutoTimer(); if (playlist.items.length > 1) playAdjacent(1); });
        video.addEventListener('error', function () {
            if (!video.currentSrc) return;
            const message = '视频无法播放，可能是编码不受浏览器支持，请尝试 MP4 或 WebM';
            if (localMedia) localMedia.showError(message);
            notify(message, 'warning');
        });
        video.addEventListener('volumechange', scheduleSave);
        page.querySelector('.shiki-watch-auto-input').addEventListener('change', function (event) {
            state.autoInteractionEnabled = event.target.checked;
            saveNow();
            scheduleAutoInteraction();
        });
        page.querySelector('.shiki-watch-input').addEventListener('keydown', function (event) {
            if (event.key === 'Enter') { event.preventDefault(); sendManual(); }
        });
        global.addEventListener('pagehide', function () { clearAutoTimer(); if (danmaku) danmaku.clear(); revokeObjectUrl(); saveNow(); });
        global.addEventListener('beforeunload', revokeObjectUrl);
    }

    async function open() {
        const session = currentSession();
        if (!session || !global.WatchTogetherStore) return notify('当前会话不可用', 'warning');
        state = await global.WatchTogetherStore.loadState(session.id);
        messages = await global.WatchTogetherStore.loadMessages(session.id);
        if (danmaku) { danmaku.clear(); danmaku.setMessages(messages, true); }
        playlist = await global.WatchTogetherStore.loadPlaylist(session.id);
        localFiles.clear();
        if (localMedia) localMedia.clear();
        revokeObjectUrl();
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.volume = state.volume;
        page.querySelector('.shiki-watch-session').textContent = '与「' + (session.name || '当前会话') + '」一起看';
        page.querySelector('.shiki-watch-auto-input').checked = state.autoInteractionEnabled;
        renderSenderOptions();
        renderPlaylist();
        const item = currentItem();
        page.querySelector('.shiki-watch-video-name').textContent = item ? item.name : '未选择视频';
        if (item && item.sourceType === 'remote') await playItem(item.id, false);
        else if (item && item.sourceType === 'local') notify('请重新选择本地视频，进度已保留', 'info');
        renderMessages();
        page.hidden = false;
        openState = true;
        document.body.classList.add('shiki-record-page-active');
    }

    function close() {
        if (!page) return;
        openState = false;
        clearAutoTimer();
        if (danmaku) danmaku.clear();
        if (video) video.pause();
        saveNow();
        if (objectUrls.current()) {
            revokeObjectUrl();
            video.removeAttribute('src');
            video.load();
        }
        if (localMedia) localMedia.clear();
        page.hidden = true;
        document.body.classList.remove('shiki-record-page-active');
    }

    function initialize(nextContext) {
        if (initialized) return;
        context = nextContext || {};
        build();
        initialized = true;
    }

    global.WatchTogether = Object.freeze({
        initialize: initialize,
        open: open,
        close: close,
        end: endWatching,
        createObjectUrlLifecycle: createObjectUrlLifecycle,
        createSenderOptions: createSenderOptions,
        availableSenders: availableSenders,
        getDebugSnapshot: function () {
            const objectUrlStats = objectUrls.stats();
            return {
                initialized: initialized,
                open: openState,
                pages: document.querySelectorAll('#shiki-watch-together').length,
                videos: document.querySelectorAll('#shiki-watch-together video').length,
                autoTimers: autoTimer ? 1 : 0,
                saveTimers: saveTimer ? 1 : 0,
                objectUrlCreates: objectUrlStats.creates,
                objectUrlRevokes: objectUrlStats.revokes,
                activeObjectUrls: objectUrlStats.active,
                stateWrites: stateWrites,
                messages: messages.length,
                playlistItems: playlist.items.length,
                runtimeFiles: localFiles.size,
                danmaku: danmaku ? danmaku.getDebugSnapshot() : null
            };
        }
    });
})(window);
