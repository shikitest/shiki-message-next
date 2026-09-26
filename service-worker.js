'use strict';

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(function (windows) {
                for (const client of windows) {
                    if (!client.url.startsWith(self.registration.scope)) continue;
                    if ('focus' in client) return client.focus();
                }
                if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
                return null;
            })
    );
});
