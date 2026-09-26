(function (global) {
    'use strict';

    const MAX_VISIBLE = 6;
    const MAX_CHARS = 80;
    const DURATION_MS = 6000;
    const SEEK_WINDOW_SECONDS = 0.75;

    function createTimeline(show) {
        let messages = [];
        let seen = new Set();
        let lastTime = null;

        function validTime(message) {
            const time = Number(message && message.playbackTime);
            return Number.isFinite(time) && time >= 0 ? time : null;
        }

        function emit(message) {
            const id = String(message && message.id || '');
            if (!id || seen.has(id) || !message.text) return false;
            seen.add(id);
            show(message);
            return true;
        }

        return {
            setMessages: function (value, reset) {
                messages = Array.isArray(value) ? value : [];
                if (reset) { seen = new Set(); lastTime = null; }
            },
            tick: function (time) {
                const now = Number(time);
                if (!Number.isFinite(now) || now < 0) return;
                if (lastTime === null) {
                    if (now <= 2) messages.forEach(function (message) {
                        const at = validTime(message);
                        if (at !== null && at <= now) emit(message);
                    });
                    lastTime = now;
                    return;
                }
                if (now + 0.25 < lastTime) {
                    seen = new Set();
                    lastTime = now;
                    if (now <= 2) messages.forEach(function (message) {
                        const at = validTime(message);
                        if (at !== null && at <= now) emit(message);
                    });
                    return;
                }
                const from = now - lastTime > 2 ? Math.max(lastTime, now - 2) : lastTime;
                messages.forEach(function (message) {
                    const at = validTime(message);
                    if (at !== null && at > from && at <= now) emit(message);
                });
                lastTime = now;
            },
            seek: function (time) {
                const now = Number(time);
                if (!Number.isFinite(now) || now < 0) return;
                seen = new Set();
                lastTime = now;
                messages.forEach(function (message) {
                    const at = validTime(message);
                    if (at !== null && Math.abs(at - now) <= SEEK_WINDOW_SECONDS) emit(message);
                });
            },
            immediate: emit,
            reset: function () { seen = new Set(); lastTime = null; },
            getSeenCount: function () { return seen.size; }
        };
    }

    function attach(layer, video) {
        if (!layer || !video) throw new Error('Danmaku layer and video are required');
        const timeline = createTimeline(show);
        let lane = 0;

        function show(message) {
            if (layer.childElementCount >= MAX_VISIBLE) layer.firstElementChild.remove();
            const node = document.createElement('span');
            node.className = 'shiki-watch-danmaku-item';
            node.textContent = String(message.senderName || (message.senderType === 'user' ? '我' : '对方')) + '：' +
                Array.from(String(message.text || '')).slice(0, MAX_CHARS).join('');
            node.style.setProperty('--danmaku-lane', String(lane++ % MAX_VISIBLE));
            node.style.setProperty('--danmaku-duration', DURATION_MS + 'ms');
            node.addEventListener('animationend', function () { node.remove(); }, { once: true });
            layer.appendChild(node);
            layer.classList.toggle('is-paused', video.paused);
        }

        return Object.freeze({
            setMessages: timeline.setMessages,
            tick: function () { if (!video.paused && !video.ended) timeline.tick(video.currentTime); },
            seek: function () { layer.replaceChildren(); timeline.seek(video.currentTime); },
            immediate: timeline.immediate,
            play: function () { layer.classList.remove('is-paused'); },
            pause: function () { layer.classList.add('is-paused'); },
            clear: function () { layer.replaceChildren(); timeline.reset(); lane = 0; },
            getDebugSnapshot: function () { return { visible: layer.childElementCount, seen: timeline.getSeenCount() }; }
        });
    }

    global.WatchDanmaku = Object.freeze({
        attach: attach,
        createTimeline: createTimeline,
        maxVisible: MAX_VISIBLE,
        maxChars: MAX_CHARS,
        durationMs: DURATION_MS
    });
})(window);
