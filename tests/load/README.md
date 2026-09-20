# Load tests (k6) — localhost only

Per-role load scenarios for `apps/erp` (six portals) and `apps/superadmin` (two).
Findings from the first campaign: [docs/reports/load-test-2026-09-20.md](../../docs/reports/load-test-2026-09-20.md).

## The one rule

**These never leave this machine.** Every script refuses a non-localhost URL, the
seed refuses any database not on `localhost` and not labelled `edura-env:test`, and
`lib/serve.sh` aborts if the server it started holds a single non-loopback
connection. Never point any of this at Vercel or at a Neon branch — dev, test or
production. High-volume traffic there is real money on someone else's
infrastructure and is indistinguishable from a denial-of-service attack.

## Run it

```bash
brew install k6                                                     # once
cd packages/database && EDURA_LOCAL_DB=edura_load bash scripts/local-test-db.sh   # once: a SEPARATE db, not edura_test
tests/load/seed/seed.sh                                             # 20 centres x 1000 students, 640k attendance rows, ZERO money rows
tests/load/lib/serve.sh build erp && tests/load/lib/serve.sh build superadmin
tests/load/lib/serve.sh start erp && tests/load/lib/serve.sh start superadmin
bun tests/load/lib/mint-sessions.mjs                                # one cookie per load account, minted once, slowly
psql -h localhost -d edura_load -c "set app.bypass_rls='on'; update users set two_factor_enabled=true where email like 'load-sa-%' or email like 'load-acc-%'"

tests/load/run.sh center_staff            # one role: 10->50->100->250->500 VUs, 2 min per step
RUN_ID=mine tests/load/run-all.sh         # all eight, a fresh server per role (~85 min)
bun tests/load/lib/report.mjs mine        # the per-step tables + computed knee
bun tests/load/lib/report.mjs mine teacher   # plus per-endpoint latency

k6 run tests/load/money-race.js           # the double-click at the counter (must report 0 double charges)
tests/load/lib/money-check.sh             # 9 ledger invariants, read-only, exits non-zero on the first failure
TARGET=page k6 run tests/load/cost-split.js   # what one request costs: page | rsc | api | login

tests/load/realtime/run.sh connect            # chat WebSocket server: 10,000 sockets at 250/s
tests/load/realtime/run.sh storm --target 10000 --hold 10 --reconnect 1   # a redeploy: everyone reconnects at once
tests/load/realtime/run.sh chat               # message throughput, ack + delivery latency, row-per-ack check
```

Run long jobs inside `screen` with `caffeinate -i` — a chain launched from an app
that later quits dies with it, and a sleeping laptop produces garbage numbers.

## Read before trusting a number

1. **Which thing are you measuring?** `withRateLimit` keys on `(path, client IP)`.
   One machine is one client, so a naive run measures the limiter. Here every VU
   sends its own `X-Forwarded-For` — the same header a real proxy sets — so the
   limiter sees a crowd. No limit is raised or disabled. A run that comes back
   mostly `429` is a finding about the limiter, not a throughput number.
2. **Check the status mix first.** `report.mjs` prints it per step. On 2026-09-20 a
   run against a server that had quietly exited reported 71,000 req/s — 100% failed.
3. **HTTP 200 does not mean the page rendered.** A redirect issued after streaming
   starts travels inside the body as `NEXT_REDIRECT`. A whole role was once measured
   against its onboarding redirect this way. `page()` now fails such a view and
   `report.mjs` prints a warning; if you add a role, crawl its pages once first.
4. **Every page is dynamic** (nonce CSP → 360 dynamic / 3 static / 0 prerendered).
   Nothing here is a cache hit, so do not compare with a Next.js app that serves
   static pages.
5. **Quiet the machine.** The server is one JS thread. With ~2 cores of background
   noise (Spotlight/`dasd`, a browser) the same scenario measured ~2x worse.
   `samples.csv` records k6's own CPU so a starved server is visible, not assumed.
6. **Local Postgres has no network.** Every request here is ≥6 statements in an
   interactive transaction; on Neon each is a round trip. Latency will be higher
   and connection hold time longer in production than anything measured here.

## What is where

| file | purpose |
|---|---|
| `<role>.js` | one scenario per role: a realistic mix of page views (HTML + the API calls that screen fires, batched like a browser) and the one or two writes the role really performs |
| `money-race.js` | fires the same cash-for-one-lesson request 3x concurrently; proves at most one is charged |
| `cost-split.js` | closed-loop cost of one page / RSC / API / login request |
| `lib/common.js` | ramp, per-step tagging, status counters, per-VU identity + IP, deterministic ids |
| `lib/env.sh` | the sealed environment: every key `.env.local` could leak is pinned, DATABASE_URL asserted localhost |
| `lib/serve.sh` | build / start / stop; proves all established peers are loopback |
| `lib/mint-sessions.mjs` | signs every load account in once and stores the cookie |
| `lib/sampler.sh` | every 5 s: app CPU, Postgres CPU, k6 CPU, `pg_stat_activity` states |
| `lib/report.mjs` | results → markdown tables; the knee is computed, not eyeballed |
| `lib/money-check.sh` | ledger reconciliation |
| `realtime/ws-load.mjs`, `realtime/run.sh`, `lib/serve-realtime.sh` | the chat WebSocket server (`apps/realtime`): real `socket.io-client`, real token, sharded over worker processes; starts its own sealed local server |
| `seed/` | the volume seed; writes no payments, transactions, wallets or settlements |

`.sessions/`, `.run/` and `results/` are gitignored: they hold cookies, logs and raw output.
