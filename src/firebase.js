import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  projectId: "lost-found-92-kz-0924",
  appId: "1:463507993812:web:2e59b51454a4a79bfab741",
  storageBucket: "lost-found-92-kz-0924.firebasestorage.app",
  apiKey: "AIzaSyDnptKjRVDTWgK38MfLr88vaRQtOAl2TlA",
  authDomain: "lost-found-92-kz-0924.firebaseapp.com",
  messagingSenderId: "463507993812"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
