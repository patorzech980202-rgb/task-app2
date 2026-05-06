import { initializeApp, getApps } from "firebase/app"
import { getMessaging } from "firebase/messaging"

const firebaseConfig = {
  apiKey: "XXX",
  authDomain: "task-app2-8cb83.firebaseapp.com",
  projectId: "task-app2-8cb83",
  storageBucket: "task-app2-8cb83.firebasestorage.app",
  messagingSenderId: "270232366770",
  appId: "1:270232366770:web:aff81c04b666117f61e3ab"
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

// 🔥 TO JEST KLUCZOWE
export const messaging =
  typeof window !== "undefined"
    ? getMessaging(app)
    : null

export default app