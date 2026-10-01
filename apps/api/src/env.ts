// Bun loads .env / .env.local / .env.<NODE_ENV> from the working directory on
// its own, so there is no dotenv here. Everything the service reads from the
// environment is named in this file.
export const env = {
  port: Number(process.env.PORT ?? 3006),
  proxySecret: process.env.EDURA_PROXY_SECRET?.trim() || undefined,
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
};
