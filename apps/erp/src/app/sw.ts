/// <reference lib="webworker" />
/// <reference lib="es2015" />

import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";
import {
  DEFAULT_URL,
  notificationSpec,
  parsePushPayload,
  resolveClickTarget,
} from "../lib/pwa/sw-handlers";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const apiV1Caching: RuntimeCaching = {
  matcher: ({ sameOrigin, url: { pathname } }) =>
    sameOrigin && pathname.startsWith("/api/v1/"),
  method: "GET",
  handler: new NetworkFirst({
    cacheName: "edura-api-v1",
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 60 * 60 * 24,
        maxAgeFrom: "last-used",
      }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [apiV1Caching, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event: PushEvent) => {
  const { title, options } = notificationSpec(parsePushPayload(event.data));
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url =
    (event.notification.data as { url?: string } | undefined)?.url ??
    DEFAULT_URL;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const target = resolveClickTarget(url, clients, self.location.origin);

      if (target.action === "open") {
        await self.clients.openWindow(target.url);
        return;
      }

      const client = clients[target.index] as WindowClient;
      if (target.action === "navigate") {
        try {
          const navigated = await client.navigate(target.url);
          await (navigated ?? client).focus();
          return;
        } catch {
          await self.clients.openWindow(target.url);
          return;
        }
      }

      await client.focus();
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event: Event) => {
  const change = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };

  change.waitUntil(
    (async () => {
      const oldEndpoint = change.oldSubscription?.endpoint;
      try {
        const applicationServerKey =
          change.oldSubscription?.options?.applicationServerKey ?? undefined;

        const fresh =
          change.newSubscription ??
          (applicationServerKey
            ? await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            })
            : null);
        if (!fresh) return;

        const json = fresh.toJSON();
        await fetch("/api/v1/me/push-subscription", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });

        if (oldEndpoint && oldEndpoint !== json.endpoint) {
          await fetch("/api/v1/me/push-subscription", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: oldEndpoint }),
          }).catch(() => { });
        }
      } catch {
      }
    })(),
  );
});
