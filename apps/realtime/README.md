# realtime — Edura chat WebSocket server

A **standalone long-running server process** (run with Bun) for real-time messaging. It is
separate from Next.js on purpose: serverless functions (Vercel-style) are
short-lived and cannot hold persistent WebSocket connections. Next.js keeps
owning the frontend and REST endpoints; this server owns the sockets.

## What it does

- **Auth at the socket level** — the handshake carries a short-lived JWT minted
  by Next.js (`GET /api/v1/realtime/token`, 60s TTL, HS256 with
  `REALTIME_JWT_SECRET` / `NEXTAUTH_SECRET`). Every inbound event is attributed
  to the verified socket identity; a client-supplied `senderId` is never read.
- **Message fanout + persistence** — `message:send` persists through the shared
  domain layer (`@repo/database` → `queries/chat`), which enforces the
  role-to-role conversation matrix (`queries/chat-policy.ts`) and the
  relationship gates. Ordering is server-assigned (`seq` bigserial).
- **Delivery state** — messages become `delivered` when the recipient is online
  (or via the delivered-on-connect sweep), `read` when they open the
  conversation. Receipts are pushed to the sender.
- **Typing indicators** (volatile), **presence** (partners-only fanout).
- **`/internal/*` bridge** — REST-sent messages/reads still fan out live.
  Guarded by `x-internal-secret`. If this server is down, REST keeps working;
  only the live push degrades.
- **Offline recipients** → bridged to Next.js `/api/v1/internal/chat-notify`
  (web-push / FCM / in-app notification row).

## Database driver

`@repo/database` picks its driver from `DATABASE_DRIVER`:

- unset (default) → Neon serverless driver (WebSocket per call) — right for
  short-lived serverless functions, also works here.
- `pg` → **node-postgres connection pool** — set this in production for this
  server: a long-running process should hold a real pool
  (`DATABASE_POOL_MAX`, default 10).

## Env (`apps/realtime/.env`)

| var | meaning |
| --- | --- |
| `REALTIME_PORT` | listen port (default 3005) |
| `DATABASE_URL` | Neon pooled URL for the RLS-enforced `edura_app` role |
| `DATABASE_DRIVER` | `pg` in production (node-postgres pool) |
| `NEXTAUTH_SECRET` | shared secret (token + internal bridge fallback) |
| `REALTIME_JWT_SECRET` | optional dedicated handshake-token secret |
| `INTERNAL_API_SECRET` | optional dedicated server↔server secret |
| `APP_ORIGIN` | allowed browser origins, CSV (CORS) |
| `APP_INTERNAL_URL` | Next.js base URL for the notify bridge |

## Run

```sh
bun run --filter realtime dev    # tsx watch
bun run --filter realtime start
```

## Scaling out

Presence + rooms are in-memory (single instance). To run multiple instances:
add the Socket.IO Redis adapter and move `PresenceRegistry` to a shared Redis
hash — it is the only stateful piece, isolated behind one interface.
