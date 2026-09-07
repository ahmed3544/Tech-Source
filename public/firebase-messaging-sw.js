importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.3.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCULaavzAbW3_ZgvJP7W4nxD3s-X9WsPg',
  authDomain: 'hidden-tesla-xt8c4.firebaseapp.com',
  projectId: 'hidden-tesla-xt8c4',
  storageBucket: 'hidden-tesla-xt8c4.firebasestorage.app',
  messagingSenderId: '501556944186',
  appId: '1:501556944186:web:6ca49a703d63de2561c403'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification?.title || 'TECH SOURCE',
    { body: payload.notification?.body || '', data: payload.data || {} }
  );
});
