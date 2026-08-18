// QA-only: map @neondatabase/serverless onto node-postgres so the existing DB
// proof suites (which hardcode Neon's Pool for fixtures) can run against a
// disposable LOCAL Postgres. Business logic/SQL unchanged; only the transport
// differs (local TCP instead of Neon WebSocket).
import pg from "file:///Users/ali/edura/node_modules/.bun/pg@8.22.0+51226add061828f6/node_modules/pg/lib/index.js";
export const Pool = pg.Pool;
export const Client = pg.Client;
export const neonConfig = {};
export function neon() { throw new Error("QA shim: neon() http mode not supported"); }
export default { Pool, Client, neonConfig, neon };
