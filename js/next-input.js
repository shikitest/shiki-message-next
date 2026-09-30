/* Move existing controls without cloning them or binding another send pipeline. */
(function (global) {
    'use strict';
    let tools, activeMenu = null, pressTimer = null, pressStart = null, suppressClick = false, dismissTarget = null;
    function closeMenu() {
        clearTimeout(pressTimer); pressTimer = null;
        if (activeMenu) { activeMenu.classList.remove('next-message-menu'); activeMenu.removeAttribute('style'); activeMenu = null; }
    }
    function close() {
        closeMenu();
        if (tools) tools.hidden = true;
        const picker = document.getElementById('user-sticker-picker');
        if (picker) picker.classList.remove('active');
    }
    function renderReplyPreview(container, name, text, friend) {
        container.replaceChildren();
        const preview = document.createElement('div'); preview.className = 'next-reply-preview';
        const avatar = document.createElement('span'); avatar.className = 'next-reply-avatar';
        const source = friend && friend.avatar || (currentReplyTo.sender === 'user' ? NextRuntime.globals().myAvatar : null);
        if (source) { const image = document.createElement('img'); image.src = source; image.alt = ''; avatar.append(image); }
        else avatar.append(ShikiAppShell.createIcon('user'));
        const copy = document.createElement('div'); copy.className = 'next-reply-copy';
        const title = document.createElement('strong'); title.textContent = name;
        const excerpt = document.createElement('span'); excerpt.textContent = text;
        copy.append(title, excerpt);
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.setAttribute('aria-label', '取消引用'); cancel.append(ShikiAppShell.createIcon('close'));
        cancel.addEventListener('click', () => { currentReplyTo = null; updateReplyPreview(); });
        preview.append(avatar, copy, cancel); container.append(preview);
    }
    function showMenu(wrapper) {
        closeMenu();
        const actions = wrapper.querySelector('.message-meta-actions');
        if (!actions || !actions.childNodes.length) return;
        activeMenu = actions; actions.classList.add('next-message-menu');
        actions.querySelectorAll('button').forEach(b => {
            const kind = b.classList.contains('reply-btn') ? 'reply' : b.classList.contains('delete-btn') ? 'trash' : 'star';
            const label = document.createElement('span'); label.textContent = b.title;
            b.replaceChildren(ShikiAppShell.createIcon(kind), label);
        });
        const bubble = wrapper.querySelector('.message').getBoundingClientRect();
        actions.style.gridTemplateColumns = 'repeat(' + actions.querySelectorAll('button').length + ', minmax(0, 1fr))';
        const width = Math.min(240, innerWidth - 24), height = 82;
        const bottomLimit = document.querySelector('.input-area-wrapper').getBoundingClientRect().top - height - 8;
        const topLimit = document.querySelector('.shiki-chat-topbar').getBoundingClientRect().bottom + 8;
        actions.style.width = width + 'px';
        actions.style.left = Math.max(12, Math.min(innerWidth - width - 12, bubble.right - width)) + 'px';
        actions.style.top = Math.max(topLimit, Math.min(bottomLimit, bubble.top - height - 8)) + 'px';
    }
    function initializeMenus() {
        const chat = document.getElementById('chat-container');
        chat.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || event.target.closest('.message-meta-actions')) return;
            const wrapper = event.target.closest('.message-wrapper'); if (!wrapper || !event.target.closest('.message')) return;
            pressStart = { x: event.clientX, y: event.clientY };
            clearTimeout(pressTimer);
            pressTimer = setTimeout(() => { showMenu(wrapper); suppressClick = true; pressTimer = null; }, 480);
        });
        chat.addEventListener('pointermove', event => { if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 8) { clearTimeout(pressTimer); pressTimer = null; } });
        ['pointerup', 'pointercancel'].forEach(name => chat.addEventListener(name, () => { clearTimeout(pressTimer); pressTimer = null; pressStart = null; }));
        chat.addEventListener('contextmenu', event => {
            const wrapper = event.target.closest('.message-wrapper'); if (!wrapper) return;
            event.preventDefault(); showMenu(wrapper);
        });
        chat.addEventListener('click', event => {
            if (event.target.closest('.message-meta-actions')) { suppressClick = false; setTimeout(closeMenu, 0); return; }
            if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
        }, true);
        chat.addEventListener('scroll', closeMenu, { passive: true });
        document.addEventListener('pointerdown', event => {
            if (!activeMenu || activeMenu.contains(event.target)) return;
            dismissTarget = event.target;
            closeMenu(); event.preventDefault(); event.stopPropagation();
        }, true);
        document.addEventListener('click', event => {
            if (!dismissTarget) return;
            const target = dismissTarget; dismissTarget = null;
            if (event.target === target || target.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    }
    function initialize() {
        const area = document.querySelector('.input-area');
        if (!area || area.dataset.nextInitialized) return;
        area.dataset.nextInitialized = 'true';
        const make = (id, name, icon) => {
            const button = document.createElement('button'); button.id = id; button.type = 'button';
            button.className = 'input-btn next-input-control'; button.title = name; button.setAttribute('aria-label', name);
            button.append(ShikiAppShell.createIcon(icon)); return button;
        };
        const plus = make('next-attachment-toggle', '更多发送功能', 'plus'), camera = make('next-camera', '拍照', 'camera');
        tools = document.createElement('div'); tools.id = 'next-input-tools'; tools.hidden = true;
        ['continue-btn', 'batch-btn'].forEach(id => {
            const button = document.getElementById(id); if (!button) return;
            button.setAttribute('aria-label', button.title); tools.append(button);
        });
        area.prepend(plus, camera);
        document.querySelector('.input-area-wrapper').append(tools);
        const input = document.getElementById('message-input'), combo = document.getElementById('combo-btn');
        input.placeholder = 'Aa'; input.setAttribute('aria-label', '消息');
        const field = document.createElement('div'); field.className = 'next-compose-field';
        input.before(field); field.append(input, combo);
        combo.replaceChildren(ShikiAppShell.createIcon('smile'));
        document.getElementById('attachment-btn').replaceChildren(ShikiAppShell.createIcon('photo'));
        document.getElementById('send-btn').replaceChildren(ShikiAppShell.createIcon('send'));
        const picker = document.getElementById('user-sticker-picker'); document.querySelector('.input-area-wrapper').append(picker);
        combo.setAttribute('aria-label', '表情与贴图');
        document.getElementById('attachment-btn').setAttribute('aria-label', '发送图片');
        document.getElementById('send-btn').setAttribute('aria-label', '发送消息');
        plus.addEventListener('click', event => {
            event.stopPropagation(); const wasOpen = !tools.hidden; close(); input.blur(); tools.hidden = wasOpen;
        });
        combo.addEventListener('click', () => { tools.hidden = true; input.blur(); }, true);
        input.addEventListener('focus', close);
        camera.addEventListener('click', () => { close(); const file = document.getElementById('image-input'); file.setAttribute('capture', 'environment'); file.click(); });
        document.getElementById('attachment-btn').addEventListener('click', () => { close(); document.getElementById('image-input').removeAttribute('capture'); }, true);
        const viewport = global.visualViewport;
        const resize = () => {
            const lift = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
            document.documentElement.style.setProperty('--next-keyboard-lift', lift > 100 ? lift + 'px' : '0px');
            const height = document.querySelector('.input-area-wrapper').getBoundingClientRect().height;
            document.documentElement.style.setProperty('--next-compose-height', height + 'px');
        };
        if (viewport) { viewport.addEventListener('resize', resize); viewport.addEventListener('scroll', resize); }
        global.addEventListener('resize', resize);
        if (global.ResizeObserver) new ResizeObserver(resize).observe(document.querySelector('.input-area-wrapper'));
        resize(); initializeMenus();
    }
    global.NextInput = Object.freeze({ initialize, close, closeMenu, renderReplyPreview });
})(window);
