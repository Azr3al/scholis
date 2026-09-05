"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { 
  getWebPushSubscribeErrorMessage,
  isEmbeddedBrowser,
  isPushServiceUnavailableError,
  isWebPushSupported, 
  registerServiceWorker, 
  getCurrentPushSubscription,
  subscribeToWebPush,
  syncWebPushSubscription,
} from "@/lib/web-push/register-web-push";
import { 
  parsePushNotificationData, 
  pushDataToHref, 
  shouldInvalidateUtilityNotifications 
} from "@/lib/web-push/parse-push-data";

export function WebPushRegistrar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const listenerAttached = useRef(false);

  useEffect(() => {
    if (!isWebPushSupported()) {
      return;
    }

    const initializeWebPush = async () => {
      try {
        const registration = await registerServiceWorker();
        if (!registration) {
          console.warn('Service worker registration failed');
          return;
        }

        if (!listenerAttached.current) {
          listenerAttached.current = true;

          const handleServiceWorkerMessage = (event: MessageEvent) => {
            if (event.data?.type !== 'notification-click') {
              return;
            }

            const pushData = parsePushNotificationData(event.data.data);
            if (!pushData) {
              console.warn('Invalid push notification data received');
              return;
            }

            if (shouldInvalidateUtilityNotifications(pushData)) {
              queryClient.invalidateQueries({
                queryKey: ['utility-notifications'],
              });
            }

            const href = pushDataToHref(pushData);
            if (href) {
              router.push(href);
            } else {
              router.push('/notifications');
            }
          };

          navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        }

        if (Notification.permission !== 'granted') {
          return;
        }

        let subscription = await getCurrentPushSubscription();
        if (!subscription) {
          subscription = await subscribeToWebPush(registration);
        }
        if (subscription) {
          await syncWebPushSubscription(subscription);
          console.log('Web push subscription synced');
        }
      } catch (error) {
        if (isPushServiceUnavailableError(error) || isEmbeddedBrowser()) {
          console.warn(getWebPushSubscribeErrorMessage(error));
        } else {
          console.error('Failed to initialize web push:', error);
        }
      }
    };

    initializeWebPush();
  }, [router, queryClient]);

  // This component doesn't render anything - it's just for setup
  return null;
}