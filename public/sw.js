/*
 * WhatsApp inbox — Service Worker.
 *
 * Responsibilities:
 *   1. Receive Web Push payloads from `src/lib/whatsapp/push-server.ts`
 *      and surface them as native OS notifications.
 *   2. Route clicks on those notifications to the exact conversation.
 *   3. Relay "a new WA message just arrived" to any open client tabs so
 *      they can play the in-app sound + flash the tab title — even when
 *      the tab was the one that received the push via a channel.
 *
 * NOTE: keep this file small + vanilla JS — it has to run in every modern
 * browser's SW runtime with no bundler.
 */

/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "واتساب", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "واتساب";
  const options = {
    body: data.body || "",
    icon: data.icon || "/whatsapp-icon.png",
    badge: data.badge || "/whatsapp-badge.png",
    tag: data.tag || "wa-notify",
    renotify: true,
    requireInteraction: false,
    silent: !!data.silent,
    dir: "auto",
    lang: "ar",
    data: {
      url: data.url || "/whatsapp",
      contactPhone: data.contactPhone || null,
      conversationId: data.conversationId || null,
      messageId: data.messageId || null,
      ts: Date.now(),
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Relay to open clients so they can play the in-app sound immediately.
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
        (clients) => {
          for (const c of clients) {
            try {
              c.postMessage({
                type: "WA_PUSH",
                payload: data,
              });
            } catch (_) {
              /* ignore */
            }
          }
        },
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/whatsapp";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer focusing an already-open /whatsapp tab.
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.pathname === "/whatsapp" || url.pathname.startsWith("/whatsapp/")) {
            await client.focus();
            client.postMessage({
              type: "WA_OPEN_CONVERSATION",
              url: targetUrl,
              contactPhone:
                (event.notification.data && event.notification.data.contactPhone) ||
                null,
            });
            return;
          }
        } catch (_) {
          /* ignore */
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
