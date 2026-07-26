// Environment for the realtime server. Loaded from the process environment
// first, then the .env files below (Next.js precedence — see loadEnv). NOTE:
// NODE_ENV itself must come from the process manager, since it is what selects
// `.env.production`. DATABASE_URL / DATABASE_DRIVER are
// consumed by @repo/database's client on first import — so this module MUST be
// imported before anything that touches the database package.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dedicatedSecret } from "./secrets";

const here = path.dirname(fileURLToPath(import.meta.url));
const NODE_ENV = process.env.NODE_ENV ?? "development";
const envFile = (name: string) => path.join(here, "..", name);
// dotenv never overwrites an already-set var and the array is first-wins, so
// this list reproduces the Next.js precedence used by apps/www:
//   process env  >  .env.<NODE_ENV>.local  >  .env.local  >  .env.<NODE_ENV>  >  .env
// Missing files are ignored. `.env.production` was previously NOT read at all —
// a production config dropped there would have been silently skipped and the
// server would have booted on dev values (or refused to boot at all, since the
// dedicated secrets are required in production).
loadEnv({
  path: [
    envFile(`.env.${NODE_ENV}.local`),
    envFile(".env.local"),
    envFile(`.env.${NODE_ENV}`),
    envFile(".env"),
  ],
});

/** Loopback + RFC1918 private ranges — i.e. "my own machine or my own LAN". */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export const env = {
  port: Number(process.env.REALTIME_PORT ?? 3005),
  /**
   * Secret for the short-lived socket handshake JWTs minted by Next.js
   * (GET /api/v1/realtime/token). Dedicated + required in production (M2).
   */
  jwtSecret: dedicatedSecret("REALTIME_JWT_SECRET"),
  /** Shared secret guarding server↔server bridge endpoints (both directions). */
  internalSecret: dedicatedSecret("INTERNAL_API_SECRET"),
  /** Browser origins allowed to open socket connections (CSV). */
  allowedOrigins: (process.env.APP_ORIGIN ?? "http://localhost:3002")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  /** Base URL of the Next.js app, for the offline→push notification bridge. */
  appInternalUrl: (
    process.env.APP_INTERNAL_URL ?? "http://localhost:3002"
  ).replace(/\/$/, ""),
};

// ---------------------------------------------------------------------------
// Production config guard — fail closed, same discipline as the C1/M2 secrets.
//
// A leftover .env.local outranks .env.production (Next.js precedence, mirrored
// above), and the defaults here are loopback. Either way the process would boot
// happily and then reject every real browser handshake, showing users nothing
// but "Connection lost". These values are load-bearing, so refuse to start
// rather than serve a chat that silently cannot connect.
// ---------------------------------------------------------------------------
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

/**
 * Socket.IO CORS origin.
 *
 * Production keeps the explicit APP_ORIGIN allowlist — unchanged. In dev the
 * app is routinely opened from a phone on the LAN (http://192.168.x.x:3002) to
 * exercise the PWA, and the single hardcoded "http://localhost:3002" rejected
 * every one of those handshakes, so the chat showed "Connection lost" on every
 * device that was not the dev machine. Private-network origins are therefore
 * also accepted, and ONLY outside production.
 */
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
