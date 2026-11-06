/* Framework7 presentation bridge. No message generation, storage or send handler. */
(function (global) {
    'use strict';
    let app, view, chatPage, homePage, shell, leaving = false, completing = false, desiredChat = false, returnView = 'conversations';
    const reduced = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function finishBack() {
        if (!view || desiredChat || view.router.currentRoute.path !== '/') return;
        if (!leaving && document.body.classList.contains('shiki-primary-view-active')) return;
        leaving = false; completing = true;
        shell.inert = false; chatPage.inert = true;
        global.ShikiAppShell.showPrimary(returnView);
        completing = false;
    }
    function syncRoute() {
        if (!view || !view.router.allowPageChange) return;
        const current = view.router.currentRoute.path;
        if (desiredChat && current !== '/chat/') view.router.navigate('/chat/', { animate: !reduced() });
        else if (!desiredChat && current === '/chat/') view.router.back({ animate: !reduced() });
    }
    function showChat() {
        if (!view) return;
        desiredChat = true; leaving = false;
        shell.hidden = false; // Persistent previous page for interactive swipe.
        shell.inert = true; shell.setAttribute('aria-hidden', 'true');
        chatPage.inert = false;
        syncRoute();
    }
    function leave(viewName) {
        if (!view || completing || view.router.currentRoute.path !== '/chat/') return false;
        returnView = viewName || 'conversations';
        desiredChat = false; leaving = true;
        global.NextInput.close(); document.getElementById('message-input').blur();
        syncRoute();
        return true;
    }
    function initialize() {
        if (app || !global.ShikiFramework7) return;
        shell = document.getElementById('shiki-app-shell');
        if (!shell) return;
        const wasChat = document.body.classList.contains('shiki-chat-view-active');
        const host = document.createElement('div'); host.id = 'next-f7-app'; host.className = 'ios';
        const viewEl = document.createElement('div'); viewEl.className = 'view view-main';
        homePage = document.createElement('div'); homePage.className = 'page page-current'; homePage.dataset.name = 'next-home';
        chatPage = document.createElement('div'); chatPage.className = 'page'; chatPage.id = 'next-f7-chat-page'; chatPage.dataset.name = 'next-chat';
        homePage.append(shell); viewEl.append(homePage); host.append(viewEl, chatPage); document.body.append(host);
        ['.header', '#shiki-chat-topbar', '.main-chat-area', '.input-area-wrapper'].forEach(selector => {
            const node = document.querySelector(selector); if (node) chatPage.append(node);
        });
        app = new global.ShikiFramework7({ el: host, theme: 'ios', name: 'Shiki Message Next', id: 'shiki-message-next',
            init: true, clicks: { fastClicks: false, externalLinks: 'a' }, touch: { touchRipple: false, activeState: false },
            routes: [{ path: '/', el: homePage, keepAlive: true }, { path: '/chat/', el: chatPage, keepAlive: true }]
        });
        view = app.views.create(viewEl, { url: '/', browserHistory: false, iosSwipeBack: true, iosSwipeBackActiveArea: 24,
            iosSwipeBackAnimateShadow: false, iosSwipeBackAnimateOpacity: false, preloadPreviousPage: true,
            on: { pageAfterIn(page) { if (page.name === 'next-home') finishBack(); } }
        });
        // Keep legacy DOM IDs reachable while home is visible. F7 normally
        // detaches keepAlive pages; park these two persistent surfaces instead.
        const removePage = view.router.removePage.bind(view.router);
        view.router.removePage = element => {
            const node = element?.nodeType ? element : element?.[0];
            if (node === chatPage || node === homePage) host.append(node);
            else removePage(element);
        };
        view.on('routeChanged', () => queueMicrotask(() => { finishBack(); syncRoute(); }));
        // Do NOT replace or wrap bubbles. Existing sizes, colors, inline image
        // behavior and custom CSS selectors remain the original skin contract.
        const composer = document.querySelector('.input-area-wrapper');
        composer.classList.add('messagebar');
        document.querySelector('.next-compose-field').classList.add('messagebar-area');
        // One owner for keyboard and scrolling: retain NextInput's viewport
        // measurement and core's windowed history; don't initialize a second
        // Messagebar resize/scroll loop or duplicate the send listeners.
        chatPage.addEventListener('touchstart', event => {
            if (document.querySelector('.modal.active, .next-page:not([hidden]), .shiki-record-page:not([hidden]), .image-viewer.active') || event.target.closest('textarea,input,button,.message-image,#user-sticker-picker,#next-input-tools')) app.preventSwipeBack = true;
            else app.preventSwipeBack = false;
        }, { capture: true, passive: true });
        viewEl.addEventListener('swipeback:beforechange', () => { desiredChat = false; leaving = true; returnView = 'conversations'; global.NextInput.close(); document.getElementById('message-input').blur(); });
        document.body.classList.add('next-f7-ready');
        if (wasChat) showChat(); else { shell.inert = false; chatPage.inert = true; }
    }
    global.NextChatUI = Object.freeze({ initialize, showChat, leave,
        inspect: () => ({ ready: Boolean(app), route: view?.router.currentRoute.path, history: view?.router.history.slice(), leaving }) });
})(window);
