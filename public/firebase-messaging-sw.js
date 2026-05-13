importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBNRRUrLJpwsa2TeDZtzNBu8St5epNfphw",
  authDomain: "hosen-550dc.firebaseapp.com",
  projectId: "hosen-550dc",
  storageBucket: "hosen-550dc.firebasestorage.app",
  messagingSenderId: "698642335371",
  appId: "1:698642335371:web:698aa6935e16dc90b8b68e",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'חוסן-קונקט';
  const body  = payload.notification?.body  || payload.data?.body  || '';
  const link  = payload.fcmOptions?.link    || payload.data?.link  || '/';

  self.registration.showNotification(title, {
    body,
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    data:    { link },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
});

// Navigate to the correct page when user taps the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
