import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { PushNotifications } from '@capacitor/push-notifications';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: 'hidden-tesla-xt8c4.firebaseapp.com',
  projectId: 'hidden-tesla-xt8c4',
  storageBucket: 'hidden-tesla-xt8c4.firebasestorage.app',
  messagingSenderId: '501556944186',
  appId: '1:501556944186:web:6ca49a703d63de2561c403'
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
const PUSH_API_BASE = '';
let webMessaging: Messaging | null = null;

export async function registerPushNotifications(employeeId?: string) {
  if (!employeeId || typeof window === 'undefined') return;
  const isNative = (window as any).Capacitor?.isNativePlatform?.() === true;

  if (isNative) {
    await PushNotifications.removeAllListeners().catch(() => {});
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.createChannel({
      id: 'tech-source-notifications', name: 'TECH SOURCE Notifications',
      description: 'Attendance, leave and shift notifications', importance: 5,
      visibility: 1, sound: 'default', vibration: true,
    }).catch((error) => console.warn('[FCM] channel creation failed', error));

    const listener = await PushNotifications.addListener('registration', async ({ value }) => {
      await fetch(`${PUSH_API_BASE}/api/push/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, token: value, platform: 'android' })
      }).catch((error) => console.warn('[FCM] token registration failed', error));
      listener.remove();
    });
    await PushNotifications.addListener('registrationError', (error) => console.warn('[FCM] native registration error', error));
    await PushNotifications.addListener('pushNotificationReceived', (notification) => console.info('[FCM] notification received', notification.title));
    await PushNotifications.register();
    return;
  }

  if (!(await isSupported().catch(() => false))) return;
  if (!('Notification' in window)) return;
  const vapidKey = 'BFLM0Qo8dmGfOzaM_4RUsjCmay3KDk2Af-zwc2vUaSftDi1Udpmv3YNsrD25y8An_MeXlTU5Sl19a9tzHocF4WA';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    webMessaging = getMessaging(app);
    const token = await getToken(webMessaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) {
      await fetch(`${PUSH_API_BASE}/api/push/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, token, platform: 'web' })
      }).catch((error) => console.warn('[FCM] web token registration failed', error));
    }
    onMessage(webMessaging, (payload) => {
      if (Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'TECH SOURCE', { body: payload.notification?.body || '' });
      }
    });
  } catch (error: any) {
    // Web push is optional. Do not let a Firebase auth/configuration problem
    // break attendance sync or flood the browser console with an unhandled
    // messaging/token-subscribe-failed exception.
    console.warn('[FCM] web push unavailable:', error?.code || error?.message || error);
  }
}

// Firebase project: tech-source-attendance; web and Android use the same project.
