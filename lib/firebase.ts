import { initializeApp, getApps } from "firebase/app"

const firebaseConfig = {
  apiKey: "AIzaSyDEgG0h1laicf6huGiIlfX0-nvkQicvQ20",
  authDomain: "task-app2-8cb83.firebaseapp.com",
  projectId: "task-app2-8cb83",
  storageBucket: "task-app2-8cb83.firebasestorage.app",
  messagingSenderId: "270232366770",
  appId: "1:270232366770:web:aff81c04b666117f61e3ab"
}

// 🔥 zapobiega wielokrotnej inicjalizacji
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export default app