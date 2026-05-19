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

// Extract and set badging count helper
const updateAppBadge = (payload) => {
  let count = undefined;
  if (payload.data && payload.data.badge) {
    count = parseInt(payload.data.badge, 10);
  } else if (payload.notification && payload.notification.badge) {
    count = parseInt(payload.notification.badge, 10);
  }

  if (count !== undefined && !isNaN(count)) {
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(count).catch(err => console.error("Error setting badge:", err));
    }
    // Cache the count
    caches.open('badge-cache').then((cache) => {
      cache.put('/badge-count', new Response(String(count)));
    }).catch(() => {});
  } else {
    // Increment local badge count in Cache
    caches.open('badge-cache').then((cache) => {
      return cache.match('/badge-count').then((cachedResponse) => {
        let current = 1;
        if (cachedResponse) {
          return cachedResponse.text().then((text) => {
            current = parseInt(text, 10) + 1;
            if (isNaN(current)) current = 1;
            return current;
          });
        }
        return current;
      }).then((current) => {
        if ('setAppBadge' in navigator) {
          navigator.setAppBadge(current).catch(err => console.error("Error setting badge:", err));
        }
        return cache.put('/badge-count', new Response(String(current)));
      });
    }).catch(() => {});
  }
};

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'חוסן-קונקט';
  const body  = payload.notification?.body  || payload.data?.body  || '';
  const link  = payload.fcmOptions?.link    || payload.data?.link  || '/';

  // Update badge count
  updateAppBadge(payload);

  self.registration.showNotification(title, {
    body,
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    data:    { link },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
});

// Listener for background push events
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      try {
        data = { body: event.data.text() };
      } catch (err) {}
    }
  }

  // Update badge count
  updateAppBadge(data);
});

// Navigate to the correct page when user taps the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Clear app icon badge
  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
  // Reset cache badge-count
  caches.open('badge-cache').then((cache) => {
    cache.put('/badge-count', new Response('0'));
  }).catch(() => {});

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
