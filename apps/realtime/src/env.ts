// Environment for the realtime server. Loaded from apps/realtime/.env (dev) or
// the process environment (production). DATABASE_URL / DATABASE_DRIVER are
// consumed by @repo/database's client on first import — so this module MUST be
// imported before anything that touches the database package.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", ".env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (apps/realtime/.env)`);
  return v;
}

export const env = {
  port: Number(process.env.REALTIME_PORT ?? 3005),
  /**
   * Secret for the short-lived socket handshake JWTs minted by Next.js
   * (GET /api/v1/realtime/token). Falls back to NEXTAUTH_SECRET so a single
   * shared secret works out of the box.
   */
  jwtSecret: process.env.REALTIME_JWT_SECRET ?? required("NEXTAUTH_SECRET"),
  /** Shared secret guarding server↔server bridge endpoints (both directions). */
  internalSecret:
    process.env.INTERNAL_API_SECRET ?? required("NEXTAUTH_SECRET"),
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

export const JWT_AUDIENCE = "edura-realtime";
export const JWT_ISSUER = "edura";
