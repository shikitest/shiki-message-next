(function (global) {
    'use strict';

    const VIDEO_TYPES = { mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mkv: 'video/x-matroska' };
    const MAX_SUBTITLE_SIZE = 5 * 1024 * 1024;

    function extension(name) {
        return String(name || '').split('.').pop().toLowerCase();
    }

    function videoError(file, video) {
        const ext = extension(file && file.name);
        const type = VIDEO_TYPES[ext];
        const mime = (file && file.type) || type;
        if (!mime || !mime.startsWith('video/')) return '请选择 MP4、WebM 或其他浏览器支持的视频文件';
        const support = video.canPlayType(mime);
        if (!support) {
            return ext === 'mkv'
                ? '当前浏览器不支持 MKV，请使用浏览器可播放的 MP4 或 WebM 文件'
                : '当前浏览器不支持此视频格式，请尝试 MP4 或 WebM 文件';
        }
        return '';
    }

    function toWebVtt(content, name) {
        const source = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
        if (extension(name) === 'vtt') {
            if (!/^WEBVTT(?:\s|$)/.test(source)) throw new Error('VTT 文件缺少 WEBVTT 文件头');
            return source + '\n';
        }
        if (extension(name) !== 'srt') throw new Error('请选择 .srt 或 .vtt 字幕');
        const blocks = source.split(/\n\s*\n/);
        const cues = [];
        blocks.forEach(function (block) {
            const lines = block.split('\n');
            if (/^\d+$/.test(lines[0].trim())) lines.shift();
            if (!lines.length) return;
            const timing = lines.shift().trim().match(/^(\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3}(?:\s+.*)?$/);
            if (!timing || !lines.length) return;
            cues.push(timing[0].replace(/(\d),(\d{1,3})/g, '$1.$2') + '\n' + lines.join('\n'));
        });
        if (!cues.length) throw new Error('SRT 文件中没有可用的字幕时间轴');
        return 'WEBVTT\n\n' + cues.join('\n\n') + '\n';
    }

    function attach(page, video) {
        const controls = document.createElement('section');
        controls.className = 'shiki-watch-subtitles';
        controls.innerHTML = '<label class="shiki-watch-subtitle-picker">选择字幕（SRT / VTT）<input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" multiple></label>' +
            '<label class="shiki-watch-subtitle-switch"><input type="checkbox" disabled>显示字幕</label>' +
            '<select aria-label="选择字幕" disabled><option value="">未导入字幕</option></select>' +
            '<div class="shiki-watch-subtitle-name">未选择字幕</div>' +
            '<div class="shiki-watch-local-error" role="alert" hidden></div>';
        page.querySelector('.shiki-watch-source-actions').after(controls);
        const input = controls.querySelector('input[type=file]');
        const toggle = controls.querySelector('input[type=checkbox]');
        const select = controls.querySelector('select');
        const name = controls.querySelector('.shiki-watch-subtitle-name');
        const error = controls.querySelector('.shiki-watch-local-error');
        const tracks = [];

        function showError(message) {
            error.textContent = message || '';
            error.hidden = !message;
        }
        function update() {
            tracks.forEach(function (entry, index) {
                const active = toggle.checked && String(index) === select.value;
                if (entry.node.track) entry.node.track.mode = active ? 'showing' : 'disabled';
            });
        }
        function clear() {
            tracks.forEach(function (entry) {
                entry.node.remove();
                global.URL.revokeObjectURL(entry.url);
            });
            tracks.length = 0;
            select.replaceChildren(new Option('未导入字幕', ''));
            select.disabled = true;
            toggle.checked = false;
            toggle.disabled = true;
            name.textContent = '未选择字幕';
            input.value = '';
            showError('');
        }
        async function importFiles() {
            const files = Array.from(input.files || []);
            input.value = '';
            for (const file of files) {
                try {
                    if (tracks.length >= 10) throw new Error('最多可导入 10 个字幕文件');
                    if (file.size > MAX_SUBTITLE_SIZE) throw new Error('字幕文件不能超过 5 MB');
                    const content = toWebVtt(await file.text(), file.name);
                    const url = global.URL.createObjectURL(new Blob([content], { type: 'text/vtt' }));
                    const node = document.createElement('track');
                    node.kind = 'subtitles';
                    node.label = file.name;
                    node.srclang = 'ja';
                    node.src = url;
                    video.appendChild(node);
                    tracks.push({ node: node, url: url });
                    select.add(new Option(file.name, String(tracks.length - 1)));
                    select.disabled = false;
                    toggle.disabled = false;
                    toggle.checked = true;
                    select.value = String(tracks.length - 1);
                    name.textContent = file.name;
                    showError('');
                    update();
                } catch (reason) { showError(reason.message || '字幕读取失败'); }
            }
        }
        input.addEventListener('change', importFiles);
        toggle.addEventListener('change', update);
        select.addEventListener('change', function () {
            const selected = tracks[Number(select.value)];
            name.textContent = selected ? selected.node.label : '未选择字幕';
            update();
        });
        global.addEventListener('pagehide', clear);
        return { clear: clear, showError: showError };
    }

    global.WatchLocalMedia = Object.freeze({ attach: attach, videoError: videoError, toWebVtt: toWebVtt });
})(window);
