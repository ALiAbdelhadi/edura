import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

// Serwist injects the precache manifest here at build time.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// defaultCache already NetworkFirst-caches same-origin `/api/*` GETs (cache
// "apis", 16 entries), but this app has 150+ distinct /api/v1 GET endpoints
// across five dashboards — 16 entries would thrash constantly. Match /api/v1
// first with a much larger bucket; /api/auth/* still falls through untouched
// to defaultCache's own NetworkOnly entry for it.
const apiV1Caching: RuntimeCaching = {
  matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith("/api/v1/"),
  method: "GET",
  handler: new NetworkFirst({
    cacheName: "edura-api-v1",
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24, maxAgeFrom: "last-used" }),
    ],
  }),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // RSC-aware runtime caching recipes for the App Router (pages / pages-rsc /
  // pages-rsc-prefetch / static assets / images), plus the wider /api/v1 cache above.
  runtimeCaching: [apiV1Caching, ...defaultCache],
  fallbacks: {
    entries: [
      {
        // Served when a navigation fails offline and nothing is cached.
        // `.html` path is skipped by the next-intl middleware, so no locale redirect.
        url: "/offline.html",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Native Web Push — separate event types from Serwist's fetch/precache
// routing above, so these coexist in the same worker without conflict.
self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title ?? "Edura";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: "/edura-mark.svg",
      badge: "/edura-mark.svg",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.startsWith(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
