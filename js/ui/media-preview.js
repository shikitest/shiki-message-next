(function (global) {
    'use strict';

    let context = null;
    let page = null;
    let body = null;
    let initialized = false;

    function createObjectUrlLifecycle(urlApi) {
        let current = null;
        let creates = 0;
        let revokes = 0;
        return {
            replace: function (blob) {
                this.clear();
                current = urlApi.createObjectURL(blob);
                creates += 1;
                return current;
            },
            clear: function () {
                if (!current) return;
                try { urlApi.revokeObjectURL(current); } catch (error) {}
                current = null;
                revokes += 1;
            },
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

    function safeHttpUrl(value) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) return '';
        try {
            const parsed = new URL(text, global.location && global.location.href);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
        } catch (error) { return ''; }
    }

    function firstTextUrl(message) {
        const match = String(message && message.text || '').match(/https?:\/\/[^\s<>]+/i);
        return match ? safeHttpUrl(match[0]) : '';
    }

    function unwrap(value) {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof Blob === 'function' && value instanceof Blob) return value;
        if (typeof value === 'object') return value.blob || value.data || value.url || value.src || null;
        return null;
    }

    function sourceFor(message, category) {
        if (!message) return null;
        if (category === 'image') return unwrap(message.image || message.photo || message.url);
        if (category === 'video') return unwrap(message.video || message.file || message.attachment || message.url);
        if (category === 'audio') return unwrap(message.audio || message.voice || message.file || message.attachment || message.url);
        if (category === 'file') return unwrap(message.file || message.attachment || message.url);
        if (category === 'link') return safeHttpUrl(message.url || message.link) || firstTextUrl(message);
        return null;
    }

    function releaseObjectUrl() {
        objectUrls.clear();
    }

    function usableSource(value) {
        if (typeof Blob === 'function' && value instanceof Blob) {
            return objectUrls.replace(value);
        }
        return typeof value === 'string' ? value : '';
    }

    function stopMedia() {
        if (!body) return;
        body.querySelectorAll('video,audio').forEach(function (media) {
            try { media.pause(); } catch (error) {}
            media.removeAttribute('src');
            try { media.load(); } catch (error) {}
        });
        releaseObjectUrl();
    }

    function fileName(message) {
        return String(message && (message.fileName || message.name || (message.file && message.file.name)) || '附件');
    }

    function fileSize(message) {
        const value = Number(message && (message.size || message.fileSize || (message.file && message.file.size)));
        if (!Number.isFinite(value) || value <= 0) return '';
        return value >= 1048576 ? (value / 1048576).toFixed(1) + ' MB' : Math.ceil(value / 1024) + ' KB';
    }

    function mimeType(message) {
        return String(message && (message.mimeType || message.mime || (message.file && message.file.type)) || '');
    }

    function renderMedia(message, category) {
        stopMedia();
        body.replaceChildren();
        const source = sourceFor(message, category);
        if (!source) {
            body.appendChild(make('div', 'shiki-record-empty', '这条记录没有可预览的媒体数据'));
            return true;
        }
        if (category === 'image') {
            if (typeof source === 'string' && typeof global.viewImage === 'function') {
                global.viewImage(source);
                return false;
            }
            const img = make('img', 'shiki-media-preview-image');
            img.alt = fileName(message);
            img.src = usableSource(source);
            body.appendChild(img);
            return true;
        }
        if (category === 'video' || category === 'audio') {
            const media = make(category, 'shiki-media-preview-' + category);
            media.controls = true;
            media.preload = 'metadata';
            if (category === 'video') {
                media.playsInline = true;
                media.setAttribute('webkit-playsinline', '');
            }
            media.src = usableSource(source);
            body.append(make('strong', 'shiki-media-preview-name', fileName(message)), media);
            return true;
        }
        if (category === 'link') {
            const url = String(source || '');
            let domain = '链接';
            try { domain = new URL(url).hostname || domain; } catch (error) {}
            const address = url.length > 240 ? url.slice(0, 237) + '...' : url;
            body.append(make('strong', 'shiki-media-preview-name', domain), make('p', 'shiki-media-preview-address', address));
            const openButton = make('button', 'shiki-media-preview-open', '在新窗口打开');
            openButton.type = 'button';
            openButton.dataset.previewOpenUrl = url;
            openButton.disabled = !url;
            body.appendChild(openButton);
            return true;
        }
        const name = fileName(message);
        const size = fileSize(message);
        const details = [mimeType(message), size].filter(Boolean).join(' · ') || '文件附件';
        body.append(make('strong', 'shiki-media-preview-name', name), make('p', 'shiki-media-preview-address', details));
        const download = make('a', 'shiki-media-preview-open', '下载文件');
        const value = usableSource(source);
        const safe = objectUrls.current() || safeHttpUrl(value) || (/^data:/i.test(value) ? value : '');
        if (safe) {
            download.href = safe;
            download.download = name;
        } else {
            download.setAttribute('aria-disabled', 'true');
        }
        body.appendChild(download);
        return true;
    }

    function open(message, category) {
        if (!initialized || !message) return false;
        if (renderMedia(message, category) === false) return true;
        page.hidden = false;
        document.body.classList.add('shiki-record-page-active');
        return true;
    }

    function close() {
        if (!page) return;
        stopMedia();
        body.replaceChildren();
        page.hidden = true;
        if (document.querySelector('.shiki-record-page:not([hidden])')) document.body.classList.add('shiki-record-page-active');
        else document.body.classList.remove('shiki-record-page-active');
    }

    function build() {
        page = make('section', 'shiki-record-page shiki-media-preview-page');
        page.id = 'shiki-media-preview';
        page.hidden = true;
        page.innerHTML = '<header class="shiki-record-header"><button type="button" data-preview-action="close" aria-label="返回"><i class="fas fa-chevron-left"></i></button><h2>媒体预览</h2><span></span></header><div class="shiki-media-preview-body"></div>';
        document.body.appendChild(page);
        body = page.querySelector('.shiki-media-preview-body');
        page.addEventListener('click', function (event) {
            if (event.target.closest('[data-preview-action="close"]')) return close();
            const opener = event.target.closest('[data-preview-open-url]');
            if (!opener || !safeHttpUrl(opener.dataset.previewOpenUrl)) return;
            global.open(opener.dataset.previewOpenUrl, '_blank', 'noopener,noreferrer');
        });
        global.addEventListener('pagehide', stopMedia);
    }

    function initialize(nextContext) {
        if (initialized) return;
        context = nextContext || {};
        build();
        initialized = true;
    }

    global.MediaPreview = Object.freeze({
        initialize: initialize,
        open: open,
        close: close,
        safeHttpUrl: safeHttpUrl,
        sourceFor: sourceFor,
        createObjectUrlLifecycle: createObjectUrlLifecycle,
        getDebugSnapshot: function () {
            const stats = objectUrls.stats();
            return { initialized: initialized, open: Boolean(page && !page.hidden), pages: document.querySelectorAll('#shiki-media-preview').length, activeObjectUrls: stats.active, objectUrlCreates: stats.creates, objectUrlRevokes: stats.revokes };
        }
    });
})(window);
