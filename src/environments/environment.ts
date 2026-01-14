export const environment = {
  production: false,
  firebase: { // 👈 AQUÍ estaba el error, lo cambiamos a 'firebase'
    apiKey: "AIzaSyA_XJi9gAc3ktMG6UVoS5A-pk24hswdASs",
    authDomain: "smart-mirror-tesis.firebaseapp.com",
    projectId: "smart-mirror-tesis",
    storageBucket: "smart-mirror-tesis.firebasestorage.app",
    messagingSenderId: "219209234178",
    appId: "1:219209234178:web:fca3048a9c9f46e57b341b"
  }
};