/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @repo/database ships TypeScript source (src/*.ts) — Next must transpile it.
  transpilePackages: ["@repo/database"],
  // Keep native/server-only deps out of the bundle: bcryptjs and the Prisma
  // engine + Neon driver.
  serverExternalPackages: [
    "bcryptjs",
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-neon",
    "@neondatabase/serverless",
    "ws",
  ],
};

export default nextConfig;
