// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from "firebase/auth";
// import { getAnalytics } from "firebase/analytics"; // Opcional

// Tu configuración de Firebase (CORRECTA)
const firebaseConfig = {
  apiKey: "AIzaSyBaJSeFwlJ8IS7GDI56DRnSUqbjelbNVlk",
  authDomain: "prueba-174d4.firebaseapp.com",
  projectId: "prueba-174d4",
  storageBucket: "prueba-174d4.firebasestorage.app",
  messagingSenderId: "490423181385",
  appId: "1:490423181385:web:0bfad8bf8a8c8fdfab9f98",
  measurementId: "G-2Q29WH4FNL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔴 IMPORTANTE: Inicializar y EXPORTAR auth y providers
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const facebookProvider = new FacebookAuthProvider();

// Si quieres analytics (opcional)
// export const analytics = getAnalytics(app);

export default app;