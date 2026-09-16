"use client";
import { Button, buttonVariants } from "@/components/primitives";

import { useState, useEffect } from "react";
import { Bell, BellOff, Xmark as X } from "iconoir-react";

import { 
  getWebPushSubscribeErrorMessage,
  isWebPushSupported, 
  registerServiceWorker, 
  subscribeToWebPush, 
  syncWebPushSubscription 
} from "@/lib/web-push/register-web-push";

const DISMISSED_KEY = 'web-push-prompt-dismissed';

type NotificationPermission = 'default' | 'granted' | 'denied';

export function WebPushPrompt() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    // Check if web push is supported
    const supported = isWebPushSupported();
    setIsSupported(supported);
    
    if (supported) {
      // Get current permission state
      setPermission(Notification.permission as NotificationPermission);
      
      // Check if user previously dismissed
      const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
      setIsDismissed(dismissed);
    }
  }, []);

  // Hide once enabled, denied, dismissed, or unsupported — but stay mounted while enabling.
  if (!isSupported || isDismissed) {
    return null;
  }
  if (permission === 'denied') {
    return null;
  }
  if (permission === 'granted' && !isLoading && !subscribeError) {
    return null;
  }

  const handleEnable = async () => {
    setIsLoading(true);
    setSubscribeError(null);
    
    try {
      const newPermission = await Notification.requestPermission();

      if (newPermission === 'granted') {
        const registration = await registerServiceWorker();
        if (!registration) {
          throw new Error('Service worker registration failed');
        }
        const subscription = await subscribeToWebPush(registration);
        if (!subscription) {
          throw new Error('Push subscription failed');
        }
        await syncWebPushSubscription(subscription);
        setPermission('granted');
        console.log('Web push notifications enabled successfully');
      } else {
        setPermission(newPermission as NotificationPermission);
      }
    } catch (error) {
      setSubscribeError(getWebPushSubscribeErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  return (
    <div className="border-primary/20 bg-primary/5">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 mt-1">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground mb-1">
              Stay updated with notifications
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Get notified about classes, assignments, and important updates even when this page isn't open.
            </p>

            {subscribeError ? (
              <p className="text-xs text-destructive mb-3">{subscribeError}</p>
            ) : null}
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleEnable}
                isLoading={isLoading}
                className="text-xs h-7 px-3"
              >
                <Bell className="h-3 w-3 mr-1" />
                Enable
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-xs h-7 px-3 text-muted-foreground hover:text-foreground"
              >
                <BellOff className="h-3 w-3 mr-1" />
                Not now
              </Button>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}