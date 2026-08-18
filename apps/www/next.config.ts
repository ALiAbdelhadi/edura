import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// This app is a marketing surface: no database, no session, no third-party
// asset. That lets its CSP be `default-src 'self'` with no vendor origins at
// all. Fonts are self-hosted by next/font, so `font-src 'self'` is enough —
// nothing here should ever reach fonts.googleapis.com at runtime.
const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  // 'unsafe-inline' covers Next's injected critical CSS and the style
  // attributes React writes for the register's per-row animation delays.
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the pre-paint theme bootstrap and Next's inline
  // hydration scripts; 'unsafe-eval' only in dev (HMR).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'`,
  `manifest-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Next 16.3 writes an AGENTS.md + CLAUDE.md into the app on every dev boot.
  // This repo authors its agent instructions at the root; keep them authored.
  agentRules: false,

  reactStrictMode: true,

  // The shared design system ships TypeScript sources, not a build.
  transpilePackages: ["@repo/ui"],

  // Same escape hatch the other apps carry: a second dev/build against this
  // app sets NEXT_DIST_DIR so it does not fight the primary server's dev lock.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  experimental: {
    // TypeScript 7 ships `tsc` and the `typescript/unstable/*` API, not the
    // classic JS compiler API Next reaches for. Without this flag `next build`
    // refuses to start; with it, Next shells out to the `tsc` binary.
    useTypeScriptCli: true,
  },

  // Pin the module-graph root to this workspace so a git worktree's dev server
  // cannot walk up and adopt the main checkout as its root.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
