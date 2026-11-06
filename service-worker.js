'use strict';

// Only this project's registration is updated. No caches/storage are cleared.
self.addEventListener('install', function (event) { event.waitUntil(self.skipWaiting()); });

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    const data = event.notification.data || {};
    const id = data.type === 'SHIKI_NEXT_MESSAGE' && typeof data.conversationId === 'string' ? data.conversationId : null;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (windows) {
                for (const client of windows) {
                    if (!client.url.startsWith(self.registration.scope)) continue;
                    if ('focus' in client) return client.focus().then(function () {
                        if (id) client.postMessage({ type: 'SHIKI_NEXT_OPEN_CONVERSATION', conversationId: id });
                        return client;
                    });
                }
                if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope + (id ? '?shikiNextNotification=' + encodeURIComponent(id) : ''));
                return null;
            })
    );
});
