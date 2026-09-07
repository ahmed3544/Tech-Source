import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { PushNotifications } from '@capacitor/push-notifications';

const firebaseConfig = {
  apiKey: 'AIzaSyCULaavzAbW3_ZgvJP7W4nxD3s-X9WsPg',
  authDomain: 'hidden-tesla-xt8c4.firebaseapp.com',
  projectId: 'hidden-tesla-xt8c4',
  storageBucket: 'hidden-tesla-xt8c4.firebasestorage.app',
  messagingSenderId: '501556944186',
  appId: '1:501556944186:web:6ca49a703d63de2561c403'
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
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey || !('Notification' in window)) return;
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
