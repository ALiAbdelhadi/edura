// Environment for the realtime server. Loaded from apps/realtime/.env (dev) or
// the process environment (production). DATABASE_URL / DATABASE_DRIVER are
// consumed by @repo/database's client on first import — so this module MUST be
// imported before anything that touches the database package.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dedicatedSecret } from "./secrets";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", ".env") });

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

export const JWT_AUDIENCE = "edura-realtime";
export const JWT_ISSUER = "edura";
