(function (global) {
    'use strict';

    const RESULT_LIMIT = 100;
    let context = null;
    let overlay = null;
    let input = null;
    let results = null;
    let source = null;
    let timer = null;
    let initialized = false;
    let searches = 0;
    let activeCategory = 'all';

    const categories = [
        ['all', '全部'], ['image', '图片'], ['video', '视频'],
        ['audio', '音频'], ['file', '文件'], ['link', '链接']
    ];

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function normalize(value) { return String(value || '').toLocaleLowerCase(); }

    function typeLabel(message) {
        if (!message) return '';
        if (message.image) return '[图片]';
        const type = String(message.type || 'normal');
        if (type === 'system') return '[拍一拍]';
        if (/audio|voice/.test(type)) return '[音频]';
        if (/video|call/.test(type)) return '[视频]';
        if (/photo|image/.test(type)) return '[图片]';
        return type === 'normal' ? '' : '[特殊消息]';
    }

    function mediaCategories(message) {
        if (!message || typeof message !== 'object') return [];
        const output = [];
        const type = String(message.type || '').toLocaleLowerCase();
        const mime = String(message.mimeType || message.mime || (message.file && message.file.type) || '').toLocaleLowerCase();
        const text = String(message.text || '');
        if (message.image || /image|photo/.test(type) || mime.startsWith('image/')) output.push('image');
        if (message.video || /video/.test(type) || mime.startsWith('video/')) output.push('video');
        if (message.audio || message.voice || /audio|voice/.test(type) || mime.startsWith('audio/')) output.push('audio');
        if (message.file || message.attachment || /file|document/.test(type) || (mime && !/^image|^video|^audio/.test(mime))) output.push('file');
        if (message.url || message.link || /https?:\/\/[^\s]+/i.test(text)) output.push('link');
        return Array.from(new Set(output));
    }

    function searchMessages(messages, query, limit, category) {
        const q = normalize(query).trim();
        const selectedCategory = category || 'all';
        if (!q && selectedCategory === 'all') return [];
        const output = [];
        const max = Number.isFinite(limit) ? limit : RESULT_LIMIT;
        const list = Array.isArray(messages) ? messages : [];
        for (let i = 0; i < list.length && output.length < max; i += 1) {
            const message = list[i] || {};
            const text = String(message.text || '');
            const translation = String(message.translationText || '');
            const type = typeLabel(message);
            const messageCategories = mediaCategories(message);
            if (selectedCategory !== 'all' && !messageCategories.includes(selectedCategory)) continue;
            let field = null;
            if (!q) field = 'category';
            else if (normalize(text).includes(q)) field = 'text';
            else if (normalize(translation).includes(q)) field = 'translation';
            else if (normalize(type).includes(q)) field = 'type';
            else if (normalize(message.name || message.fileName || '').includes(q)) field = 'file';
            if (field) output.push({
                message: message,
                field: field,
                index: i,
                categories: messageCategories,
                previous: i > 0 ? list[i - 1] : null,
                next: i + 1 < list.length ? list[i + 1] : null
            });
        }
        return output;
    }

    function formatTime(value) {
        const date = global.MessageDateSearch
            ? global.MessageDateSearch.normalizeMessageTimestamp(value)
            : new Date(value);
        if (!date || !Number.isFinite(date.getTime())) return '';
        return date.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function senderName(message) {
        if (message.sender === 'user') return context.getMyName ? context.getMyName() : '我';
        if (message.groupMemberId && context.getGroupMemberById) {
            const member = context.getGroupMemberById(message.groupMemberId);
            if (member && member.name) return member.name;
        }
        return context.getPartnerName ? context.getPartnerName() : '对方';
    }

    function previewFor(result) {
        const message = result.message;
        if (result.field === 'translation') return String(message.translationText || '').slice(0, 140);
        return (String(message.text || '') || typeLabel(message)).slice(0, 140);
    }

    function contextPreview(message) {
        if (!message) return '';
        return (String(message.text || '') || typeLabel(message)).replace(/\s+/g, ' ').trim().slice(0, 64);
    }

    function fileSize(message) {
        const value = Number(message && (message.size || message.fileSize || (message.file && message.file.size)));
        if (!Number.isFinite(value) || value <= 0) return '';
        if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB';
        return Math.ceil(value / 1024) + ' KB';
    }

    function render() {
        clearTimeout(timer);
        const query = input.value.trim();
        results.replaceChildren();
        if (!query && activeCategory === 'all') {
            results.appendChild(make('div', 'shiki-record-empty', '输入文字搜索当前会话'));
            return;
        }
        searches += 1;
        const matches = searchMessages(source, query, RESULT_LIMIT, activeCategory);
        const count = make('p', 'shiki-search-count', '找到 ' + matches.length + (matches.length === RESULT_LIMIT ? '+' : '') + ' 条结果');
        results.appendChild(count);
        if (!matches.length) {
            results.appendChild(make('div', 'shiki-record-empty', '没有匹配的聊天记录'));
            return;
        }
        const fragment = document.createDocumentFragment();
        matches.forEach(function (result) {
            const item = make('article', 'shiki-message-search-result');
            const meta = make('span', 'shiki-search-result-meta');
            meta.append(make('strong', '', senderName(result.message)), make('time', '', formatTime(result.message.timestamp || result.message.createdAt)));
            const categoryLabel = result.categories.length
                ? categories.filter(function (entry) { return result.categories.includes(entry[0]); }).map(function (entry) { return entry[1]; }).join(' · ')
                : '消息';
            const detail = make('small', 'shiki-search-field', categoryLabel + (fileSize(result.message) ? ' · ' + fileSize(result.message) : ''));
            item.append(meta);
            const imageSource = result.message.image || (result.message.type === 'image' && result.message.url) || null;
            if (imageSource) {
                const thumbnail = make('img', 'shiki-search-thumbnail');
                thumbnail.src = imageSource;
                thumbnail.alt = '';
                thumbnail.loading = 'lazy';
                thumbnail.dataset.previewMessageId = String(result.message.id);
                thumbnail.dataset.previewCategory = 'image';
                item.appendChild(thumbnail);
            }
            item.append(make('span', 'shiki-search-result-text', previewFor(result)), detail);
            if (result.field === 'translation') item.appendChild(make('small', 'shiki-search-field', '译文匹配'));
            const contextBox = make('span', 'shiki-search-context');
            if (result.previous) contextBox.appendChild(make('small', '', '上一条：' + contextPreview(result.previous)));
            if (result.next) contextBox.appendChild(make('small', '', '下一条：' + contextPreview(result.next)));
            if (contextBox.childNodes.length) item.appendChild(contextBox);
            const actions = make('span', 'shiki-search-result-actions');
            if (result.categories.length) {
                const preview = make('button', '', '预览');
                preview.type = 'button';
                preview.dataset.previewMessageId = String(result.message.id);
                preview.dataset.previewCategory = activeCategory !== 'all' && result.categories.includes(activeCategory)
                    ? activeCategory
                    : result.categories[0];
                actions.appendChild(preview);
            }
            const locate = make('button', '', '定位到消息');
            locate.type = 'button';
            locate.dataset.locateMessageId = String(result.message.id);
            actions.appendChild(locate);
            item.appendChild(actions);
            fragment.appendChild(item);
        });
        results.appendChild(fragment);
    }

    function build() {
        overlay = make('section', 'shiki-record-page shiki-message-search-page');
        overlay.id = 'shiki-message-search';
        overlay.hidden = true;
        overlay.innerHTML = [
            '<header class="shiki-record-header">',
            '<button type="button" data-search-action="close" aria-label="返回"><i class="fas fa-chevron-left"></i></button>',
            '<h2>查找聊天内容</h2><span></span>',
            '</header>',
            '<div class="shiki-record-search-box"><i class="fas fa-search"></i>',
            '<input type="search" id="shiki-message-search-input" placeholder="搜索当前会话" autocomplete="off">',
            '</div>',
            '<div class="shiki-search-categories" role="tablist">',
            categories.map(function (entry) { return '<button type="button" role="tab" data-search-category="' + entry[0] + '">' + entry[1] + '</button>'; }).join(''),
            '</div>',
            '<div class="shiki-message-search-results" id="shiki-message-search-results"></div>'
        ].join('');
        document.body.appendChild(overlay);
        input = overlay.querySelector('#shiki-message-search-input');
        results = overlay.querySelector('#shiki-message-search-results');
        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(render, 180);
        });
        overlay.addEventListener('click', async function (event) {
            if (event.target.closest('[data-search-action="close"]')) return close();
            const category = event.target.closest('[data-search-category]');
            if (category) {
                activeCategory = category.dataset.searchCategory;
                overlay.querySelectorAll('[data-search-category]').forEach(function (item) {
                    item.classList.toggle('active', item === category);
                    item.setAttribute('aria-selected', item === category ? 'true' : 'false');
                });
                render();
                return;
            }
            const preview = event.target.closest('[data-preview-message-id]');
            if (preview) {
                const message = (source || []).find(function (item) { return String(item.id) === preview.dataset.previewMessageId; });
                if (message && global.MediaPreview) global.MediaPreview.open(message, preview.dataset.previewCategory);
                return;
            }
            const item = event.target.closest('[data-locate-message-id]');
            if (!item) return;
            const id = item.dataset.locateMessageId;
            close();
            if (context.locateMessageById) await context.locateMessageById(id);
        });
    }

    function open(initialCategory) {
        source = context && context.getMessages ? context.getMessages() : [];
        activeCategory = categories.some(function (entry) { return entry[0] === initialCategory; }) ? initialCategory : 'all';
        overlay.querySelectorAll('[data-search-category]').forEach(function (item) {
            const active = item.dataset.searchCategory === activeCategory;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        input.value = '';
        if (activeCategory === 'all') results.replaceChildren(make('div', 'shiki-record-empty', '输入文字搜索当前会话'));
        else render();
        overlay.hidden = false;
        document.body.classList.add('shiki-record-page-active');
        setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
        clearTimeout(timer);
        source = null;
        input.value = '';
        overlay.hidden = true;
        document.body.classList.remove('shiki-record-page-active');
    }

    function initialize(nextContext) {
        if (initialized) return;
        context = nextContext || {};
        build();
        initialized = true;
    }

    global.MessageSearch = Object.freeze({
        initialize: initialize,
        open: open,
        close: close,
        searchMessages: searchMessages,
        mediaCategories: mediaCategories,
        getDebugSnapshot: function () {
            return { initialized: initialized, open: Boolean(overlay && !overlay.hidden), searches: searches, cachedMessages: source ? source.length : 0 };
        }
    });
})(window);
