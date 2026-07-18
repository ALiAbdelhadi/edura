import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const withNextIntl = createNextIntlPlugin();

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

  transpilePackages: ["@repo/database", "@repo/ui", "@repo/server-core"],
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
