importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js")

firebase.initializeApp({
  apiKey: "AIzaSyDEgG0h1laicf6huGiIlfX0-nvkQicvQ20",
  authDomain: "task-app2-8cb83.firebaseapp.com",
  projectId: "task-app2-8cb83",
  storageBucket: "task-app2-8cb83.firebasestorage.app",
  messagingSenderId: "270232366770",
  appId: "1:270232366770:web:aff81c04b666117f61e3ab"
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.data?.title || "Task App",
    {
      body: payload.data?.body || "Masz nowe zadanie",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [700, 300, 700, 300, 700],
      requireInteraction: true,
      silent: false
    }
  )
})