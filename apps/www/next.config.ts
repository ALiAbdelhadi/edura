import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin();

// Serwist compiles src/app/sw.ts into public/sw.js via the webpack InjectManifest
// plugin. Next 16 defaults to Turbopack, so `next build --webpack` is required for
// the SW to be emitted (see package.json build script). Disabled in dev unless
// SERWIST_DEV=1 (use the `dev:pwa` script to test the worker locally).
const withSerwist = withSerwistInit({
  cacheOnNavigation: true,
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  // Precache only the offline shell + icons; runtime caching (defaultCache in sw.ts)
  // handles _next/static, RSC navigations, images and API GETs on first use. This
  // keeps installs fast and avoids the multi-hundred-entry precache (per PWA plan).
  exclude: [/.*/],
  additionalPrecacheEntries: [
    { url: "/offline.html", revision: "v1" },
    { url: "/edura-mark.svg", revision: "v1" },
    { url: "/edura-maskable.svg", revision: "v1" },
  ],
});

const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ["@repo/database", "@repo/ui"],
  serverExternalPackages: [
    "bcryptjs",
    "@prisma/client",
    ".prisma/client",
    "@prisma/client-runtime-utils",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
  ],
};

export default withSerwist(withNextIntl(nextConfig));
