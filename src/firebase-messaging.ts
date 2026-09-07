import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { PushNotifications } from '@capacitor/push-notifications';

const firebaseConfig = {
  apiKey: 'AIzaSyBfp-MUx3aNXXTiZ3EDGIxkPt_IkNn1bIE',
  authDomain: 'tech-source-attendance.firebaseapp.com',
  projectId: 'tech-source-attendance',
  storageBucket: 'tech-source-attendance.firebasestorage.app',
  messagingSenderId: '745139448493',
  appId: '1:745139448493:web:57dd3cd719cffba47f3424',
  measurementId: 'G-LG6NZZ2PYL'
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
let webMessaging: Messaging | null = null;

export async function registerPushNotifications(employeeId?: string) {
  if (!employeeId || typeof window === 'undefined') return;
  const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;

  if (isNative) {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;
    const listener = await PushNotifications.addListener('registration', async ({ value }) => {
      await fetch('/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, token: value, platform: 'android' }) }).catch(() => {});
      listener.remove();
    });
    await PushNotifications.register();
    return;
  }

  if (!(await isSupported().catch(() => false))) return;
  const vapidKey = 'BFLM0Qo8dmGfOzaM_4RUsjCmay3KDk2Af-zwc2vUaSftDi1Udpmv3YNsrD25y8An_MeXlTU5Sl19a9tzHocF4WA';
  if (!('Notification' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  webMessaging = getMessaging(app);
  const token = await getToken(webMessaging, { vapidKey, serviceWorkerRegistration: registration });
  if (token) await fetch('/api/push/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, token, platform: 'web' }) }).catch(() => {});
  onMessage(webMessaging, (payload) => {
    if (Notification.permission === 'granted') new Notification(payload.notification?.title || 'TECH SOURCE', { body: payload.notification?.body || '' });
  });
}
