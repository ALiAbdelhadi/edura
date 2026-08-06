import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dedicatedSecret } from "./secrets";

const here = path.dirname(fileURLToPath(import.meta.url));
const NODE_ENV = process.env.NODE_ENV ?? "development";
const envFile = (name: string) => path.join(here, "..", name);

loadEnv({
  path: [
    envFile(`.env.${NODE_ENV}.local`),
    envFile(".env.local"),
    envFile(`.env.${NODE_ENV}`),
    envFile(".env"),
  ],
});

const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export const env = {
  port: Number(process.env.REALTIME_PORT ?? process.env.PORT ?? 3005),
  jwtSecret: dedicatedSecret("REALTIME_JWT_SECRET"),
  internalSecret: dedicatedSecret("INTERNAL_API_SECRET"),
  allowedOrigins: (process.env.APP_ORIGIN ?? "http://localhost:3002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  appInternalUrl: (
    process.env.APP_INTERNAL_URL ?? "http://localhost:3002"
  ).replace(/\/$/, ""),
};

if (process.env.NODE_ENV === "production") {
  const bad = env.allowedOrigins.filter((o) => PRIVATE_ORIGIN.test(o));
  if (!env.allowedOrigins.length || bad.length) {
    throw new Error(
      `APP_ORIGIN must be the public browser origin(s) in production, got ` +
        `"${process.env.APP_ORIGIN ?? "(unset)"}". A loopback/LAN origin here ` +
        `means every production socket handshake is rejected.`,
    );
  }
  if (PRIVATE_ORIGIN.test(env.appInternalUrl)) {
    throw new Error(
      `APP_INTERNAL_URL must be the public app URL in production, got ` +
        `"${env.appInternalUrl}". A loopback value silently drops every ` +
        `offline→push notification.`,
    );
  }
}

export const JWT_AUDIENCE = "edura-realtime";
export const JWT_ISSUER = "edura";

export const corsOrigin:
  | string[]
  | ((
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void) =
  process.env.NODE_ENV === "production"
    ? env.allowedOrigins
    : (origin, cb) =>
        cb(
          null,
          !origin ||
            env.allowedOrigins.includes(origin) ||
            PRIVATE_ORIGIN.test(origin),
        );
