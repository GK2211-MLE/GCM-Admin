import { apiClient } from '@/lib/api-client';

const VAPID_PUBLIC_KEY_STORAGE = 'f2c_vapid_public_key';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission denied');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key from server
    let vapidKey = localStorage.getItem(VAPID_PUBLIC_KEY_STORAGE);
    if (!vapidKey) {
      const { data } = await apiClient.get('/push/vapid-key');
      vapidKey = data.publicKey;
      if (vapidKey) {
        localStorage.setItem(VAPID_PUBLIC_KEY_STORAGE, vapidKey);
      }
    }

    if (!vapidKey) {
      console.warn('No VAPID key available');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as ArrayBuffer,
    });

    await apiClient.post('/push/subscribe', subscription.toJSON());
    return true;
  } catch (err) {
    console.error('Failed to subscribe to push:', err);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await apiClient.post('/push/unsubscribe', { endpoint: subscription.endpoint });
    }
  } catch (err) {
    console.error('Failed to unsubscribe from push:', err);
  }
}
