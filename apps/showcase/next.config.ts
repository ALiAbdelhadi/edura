import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

// The showcase is a marketing surface: it talks to no database, holds no
// session, and loads nothing from a third party. That makes its CSP far
// stricter than www's — `default-src 'self'` with no vendor origins at all.
// If a scene ever needs an external asset, it gets inlined or self-hosted
// rather than added here.
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `img-src 'self' data: blob:`,
  `media-src 'self'`,
  `font-src 'self'`,
  // 'unsafe-inline' covers Next's injected critical CSS and style attributes;
  // GSAP writes inline styles, so this cannot be tightened without a nonce
  // pipeline for style attributes, which does not exist.
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the theme-bootstrap script and Next's inline
  // hydration/streaming scripts; 'unsafe-eval' only in dev (HMR).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here is meant to be framed anywhere.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/ui"],
  images: {
    // Every image is local and pre-optimised by the Phase 2 pipeline; these
    // formats let next/image still serve the smaller variant per browser.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
