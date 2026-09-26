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
            .then(function () { return navigator.serviceWorker.ready; })
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
            await registration.showNotification(title || '传讯', options || {});
            return true;
        }
        try {
            new Notification(title || '传讯', options || {});
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
