importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBNRRUrLJpwsa2TeDZtzNBu8St5epNfphw",
  authDomain: "hosen-550dc.firebaseapp.com",
  projectId: "hosen-550dc",
  storageBucket: "hosen-550dc.firebasestorage.app",
  messagingSenderId: "698642335371",
  appId: "1:698642335371:web:698aa6935e16dc90b8b68e",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
