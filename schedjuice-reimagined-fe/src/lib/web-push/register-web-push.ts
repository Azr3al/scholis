import { axiosClient } from "@/lib/api";

const PUSH_SERVICE_UNAVAILABLE =
  'Web push needs Chrome, Edge, or Firefox on desktop. Cursor\'s built-in browser cannot subscribe.';

const PUSH_SERVICE_ERROR =
  'Browser could not register with the push service. Try Chrome or Edge at localhost:3000.';

const PUSH_SERVICE_ERROR_BRAVE =
  'Brave blocked the push service (FCM). For localhost:3000 turn Shields off (lion icon), allow Notifications, then hard refresh. Or test in Chrome.';

function isBraveBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return navigator.userAgent.includes('Brave');
}

/**
 * Cursor / VS Code Simple Browser and other Electron webviews expose PushManager
 * but cannot reach FCM/Mozilla push backends.
 */
export function isEmbeddedBrowser(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('electron') || ua.includes('cursor');
}

/**
 * Check if web push notifications are supported in the current browser
 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !isEmbeddedBrowser() &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isPushServiceUnavailableError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  if (error.name !== 'AbortError') {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('push service not available') ||
    message.includes('push service error')
  );
}

export function getWebPushSubscribeErrorMessage(error: unknown): string {
  if (isEmbeddedBrowser()) {
    return PUSH_SERVICE_UNAVAILABLE;
  }
  if (isPushServiceUnavailableError(error)) {
    if (isBraveBrowser()) {
      return PUSH_SERVICE_ERROR_BRAVE;
    }
    return PUSH_SERVICE_ERROR;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Could not enable web push notifications.';
}

/**
 * Convert base64 URL-safe string to Uint8Array for VAPID key
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Register the service worker for web push
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) {
    console.warn('Web push notifications are not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    console.log('Service worker registered successfully');
    return registration;
  } catch (error) {
    console.error('Service worker registration failed:', error);
    return null;
  }
}

/**
 * Subscribe to web push notifications using the provided registration
 */
export async function subscribeToWebPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  
  if (!vapidPublicKey) {
    throw new Error('VAPID public key not configured (NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY)');
  }

  try {
    await navigator.serviceWorker.ready;
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    console.log('Push subscription created successfully');
    return subscription;
  } catch (error) {
    if (isPushServiceUnavailableError(error) || isEmbeddedBrowser()) {
      console.warn(getWebPushSubscribeErrorMessage(error));
    } else {
      console.error('Push subscription failed:', error);
    }
    throw error;
  }
}

/**
 * Sync push subscription with the backend
 */
export async function syncWebPushSubscription(subscription: PushSubscription): Promise<void> {
  try {
    const json = subscription.toJSON();
    const subscriptionData = {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
    };

    if (!subscriptionData.keys.p256dh || !subscriptionData.keys.auth) {
      throw new Error('Push subscription keys missing');
    }

    await axiosClient.post('web-push-subscriptions', subscriptionData);
    console.log('Push subscription synced with backend');
  } catch (error) {
    console.error('Failed to sync push subscription:', error);
    throw error;
  }
}

/**
 * Deactivate web push subscription on the backend
 */
export async function deactivateWebPushSubscription(endpoint: string): Promise<void> {
  try {
    await axiosClient.post('web-push-subscriptions/deactivate', { endpoint });
    console.log('Push subscription deactivated');
  } catch (error) {
    console.error('Failed to deactivate push subscription:', error);
    // Don't throw - this is best effort on logout
  }
}

/**
 * Get the current push subscription if one exists
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) {
    return null;
  }

  try {
    await navigator.serviceWorker.ready;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) {
      return null;
    }

    return await registration.pushManager.getSubscription();
  } catch (error) {
    console.error('Failed to get current push subscription:', error);
    return null;
  }
}

/**
 * Unregister service worker (used on logout)
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (!isWebPushSupported()) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (registration) {
      await registration.unregister();
      console.log('Service worker unregistered');
    }
  } catch (error) {
    console.error('Failed to unregister service worker:', error);
    // Don't throw - this is best effort cleanup
  }
}