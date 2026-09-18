// Metrol CRM's push service worker. Dropped in public/ so Vite serves it at
// the site root — Push API subscriptions need root scope to receive
// notifications regardless of which screen was open when the app was
// closed. Deliberately does nothing else: no offline cache, no asset
// interception. That is a different feature nobody has asked for yet.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* a non-JSON payload just shows with no body */ }
  const title = data.title || 'Metrol CRM'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
