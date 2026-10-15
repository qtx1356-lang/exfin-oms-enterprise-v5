self.addEventListener('push', function (event) {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Incoming EXFIN OMS video call', {
    body: payload.body || 'You have an incoming video call.',
    icon: '/manifest-icon-192.png',
    badge: '/favicon.ico',
    data: payload.data || { url: '/' },
    tag: payload.data && payload.data.callId ? 'exfin-call-' + payload.data.callId : 'exfin-video-call',
    renotify: true
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
    for (const client of clients) {
      if ('focus' in client) {
        if ('navigate' in client) client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  }));
});
