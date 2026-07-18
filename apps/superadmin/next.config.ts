import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

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

export default withNextIntl(nextConfig);
