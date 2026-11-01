/* Alert Tracker — Web Push service worker (GitHub Pages /alert-tracker/). */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let title = 'Тривога.Карта'
  let body = 'Нове сповіщення'
  let tag = 'alert-tracker'

  try {
    const raw = event.data ? event.data.text() : ''
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.title === 'string') title = parsed.title
          if (typeof parsed.body === 'string') body = parsed.body
          if (typeof parsed.tag === 'string') tag = parsed.tag
        } else {
          body = raw
        }
      } catch {
        body = raw
      }
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      data: { url: self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
