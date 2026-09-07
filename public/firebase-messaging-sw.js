importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBfp-MUx3aNXXTiZ3EDGIxkPt_IkNn1bIE',
  authDomain: 'tech-source-attendance.firebaseapp.com',
  projectId: 'tech-source-attendance',
  storageBucket: 'tech-source-attendance.firebasestorage.app',
  messagingSenderId: '745139448493',
  appId: '1:745139448493:web:57dd3cd719cffba47f3424',
  measurementId: 'G-LG6NZZ2PYL'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'TECH SOURCE',
    { body: payload.notification?.body || '', data: payload.data || {} }
  );
});
