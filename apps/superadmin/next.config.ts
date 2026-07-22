import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// H4 — security headers. The back-office is the highest-value surface, so it is
// stricter than www: never framable and no cross-origin frames/sockets. CSP
// ships Report-Only first (observe, don't block); the rest is enforced.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  // Cloudinary delivers material/receipt images shown in the back-office.
  `img-src 'self' data: blob: https://res.cloudinary.com`,
  `font-src 'self' data:`,
  `style-src 'self' 'unsafe-inline'`,
  // 'unsafe-inline' covers the theme-bootstrap + Next inline hydration scripts;
  // 'unsafe-eval' only in dev (HMR). Nonce-based tightening is a follow-up.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'`,
  `frame-src 'none'`,
  `worker-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig = {
  reactStrictMode: true,

  // Cloud name only (public by construction — it is in every delivery URL);
  // the API key/secret stay server-side. Lets @repo/ui/lib/cloudinary build
  // transformation URLs in the back-office too.
  env: {
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  },

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

export default withNextIntl(nextConfig);
