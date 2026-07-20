import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. CSP ships as Report-Only first (observe, don't block)
// so it can be tightened to enforce once real traffic confirms nothing legit
// is flagged. HSTS / nosniff / frame options / Referrer-Policy ARE enforced.
const isDev = process.env.NODE_ENV !== "production";

// The chat client (socket.io) connects to the realtime server over HTTP
// polling + a WS upgrade, so both the http(s) and ws(s) origins are allowed.
const realtimeHttp = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005";
const realtimeWs = realtimeHttp.replace(/^http/, "ws");

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'self'`,
  `form-action 'self'`,
  // Cloudinary delivers material/receipt images; data:/blob: for inline SVGs
  // and generated previews.
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  // 'unsafe-inline' covers Next's injected critical CSS + style attributes.
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the theme-bootstrap script + Next's inline
  // hydration/streaming scripts; 'unsafe-eval' only in dev (HMR). Tightening
  // to a nonce-based script-src is a recommended follow-up.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // 'self' + the realtime socket origins (chat).
  `connect-src 'self' ${realtimeHttp} ${realtimeWs}`,
  // Same-origin mock checkout + the real Paymob card iframe.
  `frame-src 'self' https://accept.paymob.com`,
  `worker-src 'self'`,
  `manifest-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  exclude: [/.*/],
  additionalPrecacheEntries: [
    { url: "/offline.html", revision: "v1" },
    { url: "/edura-mark.svg", revision: "v1" },
    { url: "/edura-maskable.svg", revision: "v1" },
  ],
});

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  transpilePackages: ["@repo/database", "@repo/ui", "@repo/server-core"],
  serverExternalPackages: [
    "bcryptjs",
    "@prisma/client",
    ".prisma/client",
    "@prisma/client-runtime-utils",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
    "ioredis",
  ],
};

export default withSerwist(withNextIntl(nextConfig));
