self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {
    title: "Nowe zadanie",
    body: "Masz nowe zadanie do wykonania"
  }

  if (event.data) {
    data = event.data.json()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png"
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  event.waitUntil(
    clients.openWindow("/")
  )
})