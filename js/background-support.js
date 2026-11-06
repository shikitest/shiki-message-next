(function (global) {
    'use strict';

    let registrationPromise = null;

    function initialize() {
        if (registrationPromise) return registrationPromise;
        if (!('serviceWorker' in navigator)) {
            registrationPromise = Promise.resolve(null);
            return registrationPromise;
        }
        registrationPromise = navigator.serviceWorker.register('service-worker.js', { scope: './' })
            .then(function (registration) {
                if (registration.active) return registration;
                // Wait for THIS project's worker, not a root-scoped old site's
                // navigator.serviceWorker.ready registration.
                const worker = registration.installing || registration.waiting;
                if (!worker) return null;
                return new Promise(function (resolve) {
                    let timeout;
                    function finish(value) { clearTimeout(timeout); worker.removeEventListener('statechange', changed); resolve(value); }
                    function changed() { if (worker.state === 'activated') finish(registration); else if (worker.state === 'redundant') finish(null); }
                    worker.addEventListener('statechange', changed);
                    timeout = setTimeout(function () { finish(null); }, 10000);
                    changed();
                });
            })
            .catch(function (error) {
                console.warn('[BackgroundSupport] Service Worker unavailable:', error);
                return null;
            });
        return registrationPromise;
    }

    async function showNotification(title, options) {
        if (!('Notification' in global) || Notification.permission !== 'granted') return false;
        const registration = await initialize();
        if (registration && typeof registration.showNotification === 'function') {
            try { await registration.showNotification(title || '传讯', options || {}); return true; }
            catch (error) { console.warn('[BackgroundSupport] System notification failed:', error); }
        }
        try {
            const notification = new Notification(title || '传讯', options || {});
            notification.onclick = function () {
                global.focus(); notification.close();
                const id = options && options.data && options.data.conversationId;
                if (id && global.NextNotifications) NextNotifications.openConversation(id).catch(function (error) { console.warn('[BackgroundSupport] Open notification failed:', error); });
            };
            return true;
        } catch (error) {
            return false;
        }
    }

    global.BackgroundSupport = Object.freeze({
        version: '1.0.0',
        initialize: initialize,
        showNotification: showNotification
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})(window);
