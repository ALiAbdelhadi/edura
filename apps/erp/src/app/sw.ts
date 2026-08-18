/// <reference lib="webworker" />
/// <reference lib="es2015" />
/* cspell:disable */

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
        // `navigate()` is only allowed on a client this worker controls; a tab
        // loaded before the worker took over is not. Falling back to a new
        // window is better than swallowing the click.
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

/**
 * A push subscription is not permanent: browsers rotate the endpoint on their
 * own schedule (Chrome does it when its own push registration is refreshed),
 * and the old endpoint stops delivering the moment they do.
 *
 * WITHOUT THIS HANDLER THAT IS A SILENT, PERMANENT LOSS. Nothing on the client
 * re-subscribes — `usePushSubscription` only runs when someone opens Settings —
 * and the server keeps writing to the dead endpoint until it happens to collect
 * a 410. The user is still "subscribed" in the UI and simply never hears from
 * us again.
 *
 * The new subscription is minted from the OLD one's key rather than from an
 * environment variable: the worker is built once and the key it was built with
 * may not be the key this subscription was created with.
 */
// `pushsubscriptionchange` has no lib.webworker event type, so it arrives as a
// bare Event; it is an ExtendableEvent carrying the two subscriptions.
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

        // Retire the dead endpoint only after the live one is recorded, so a
        // failure here leaves the user subscribed twice rather than not at all.
        if (oldEndpoint && oldEndpoint !== json.endpoint) {
          await fetch("/api/v1/me/push-subscription", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: oldEndpoint }),
          }).catch(() => {});
        }
      } catch {
        // Nothing useful to do in a worker with no UI: the next visit to
        // Settings re-subscribes.
      }
    })(),
  );
});