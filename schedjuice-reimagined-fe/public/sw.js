// Service Worker for Web Push Notifications

self.addEventListener("push", (event) => {
  if (!(self.Notification && self.Notification.permission === "granted")) {
    return;
  }

  let notificationData;
  try {
    notificationData = event.data ? event.data.json() : {};
  } catch (error) {
    console.warn("Invalid push notification data:", error);
    return;
  }

  const { title, body, data } = notificationData;

  if (!title) {
    console.warn("Push notification missing required title");
    return;
  }

  const options = {
    body: body || "",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    data: data || {},
    tag: "schedjuice-notification",
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};

  event.waitUntil(
    (async () => {
      // Focus existing window or open new one
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      let targetClient = null;

      // Try to find an existing window to focus
      for (const client of windowClients) {
        if (client.url && client.url.includes(self.location.origin)) {
          targetClient = client;
          break;
        }
      }

      if (targetClient) {
        // Focus existing window
        if (targetClient.focus) {
          await targetClient.focus();
        }

        // Post message with notification data for routing
        targetClient.postMessage({
          type: "notification-click",
          data: notificationData,
        });
      } else {
        // Open new window
        const newClient = await self.clients.openWindow("/");

        // Wait a bit for the page to load, then send the message
        if (newClient) {
          setTimeout(() => {
            newClient.postMessage({
              type: "notification-click",
              data: notificationData,
            });
          }, 1000);
        }
      }
    })(),
  );
});

// Optional: Handle service worker installation and activation
self.addEventListener("install", (event) => {
  console.log("Service worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service worker activated");
  event.waitUntil(self.clients.claim());
});
