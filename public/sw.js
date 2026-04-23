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
  const contactPhone =
    (event.notification.data && event.notification.data.contactPhone) || null;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // 1) Prefer an already-open /whatsapp inbox tab — focus it and tell the
      //    React layer which conversation to open (instant, no reload).
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.pathname === "/whatsapp") {
            await client.focus();
            client.postMessage({
              type: "WA_OPEN_CONVERSATION",
              url: targetUrl,
              contactPhone,
            });
            return;
          }
        } catch (_) {
          /* ignore */
        }
      }

      // 2) Fall back to any same-origin tab that supports navigation — send
      //    it to the deep-link URL so the user lands directly on the thread
      //    (critical on mobile: otherwise we'd leave them on phonebook /
      //    settings without a conversation list).
      for (const client of allClients) {
        if ("navigate" in client) {
          try {
            await client.focus();
            await client.navigate(targetUrl);
            return;
          } catch (_) {
            /* ignore and try next */
          }
        }
      }

      // 3) No open tabs → open a fresh window on the deep-link URL. On mobile
      //    this launches the PWA shell directly into the conversation.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
