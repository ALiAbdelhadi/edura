# Runtime: Bun-only surface (full history)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## Runtime: Bun-only surface (binding, added 2026-07-31)

- Bun is the only package manager/toolchain AND the official runtime:
  both apps' `start` scripts run `bun --bun next start` (proven 2026-07-31:
  session endpoint + full credentials path return 401-not-500, zero external-
  module errors), and `apps/realtime` runs `bun src/server.ts` directly
  (`tsx` removed from the app).
- The ONE remaining internal Node surface: `next dev` (Turbopack). Under
  `bun --bun` its hashed external server modules (bcryptjs, @prisma/adapter-neon,
  ws, pg) fail to resolve and every `/api/auth/*` route 500s — proven
  2026-07-31. Do NOT flip dev to `--bun` until a Bun/Next upgrade passes the
  login smoke test. CI keeps `setup-node` for exactly this dev/build tooling.
- `packages/database` tooling is explicitly ALLOWED to keep Node/tsx
  (Ali's decision, 2026-07-31). No Node install instructions, `engines.node`,
  or Node references may appear anywhere user-facing; `engines` declare Bun only.
- **THE MINIMUM BUN IS 1.4.0, AND THAT IS A RUNTIME REQUIREMENT, NOT HOUSEKEEPING
  (2026-09-20).** On **Bun 1.3.12** `bun --bun next start` served **500 on every
  route** of a clean Next 16.3.5 build: `TypeError: Expected CommonJS module to
  have a function wrapper`, thrown out of `.next/server/middleware.js`. Narrowed
  to one file — `require("next/dist/compiled/next-server/app-page.runtime.prod.js")`
  fails in isolation under that Bun, while `app-route`, `pages` and `server`
  runtimes all load. It is a Bun bug, fixed upstream: the same require, the same
  build and the same start script all pass on **Bun 1.4.2**, where
  `/ar/login` and `/api/health` return 200 and an invalid-credentials sign-in
  returns **401, not 500** — the 2026-07-31 proof, re-run.
  So `packageManager` is `bun@1.4.2`, `engines.bun` is `>=1.4.0`, all nine
  `bun-version:` pins in `.github/workflows/*.yml` are 1.4.2, and `bun.lock` was
  byte-identical after `bun install --frozen-lockfile` on the new Bun.
  **THE BUG DOES NOT REACH VERCEL, AND A NOTE HERE CLAIMING OTHERWISE WAS WRONG
  FOR A FEW HOURS ON 2026-09-20.** Vercel runs `bun run build` (through
  `scripts/vercel-build.sh`) and then serves the build OUTPUT on its own Node
  runtime — `next start` is never executed there, so the app-page-runtime require
  never happens. What the bug does hit: every local `bun run start`, and any
  self-hosted or container deploy that runs the `start` script. `apps/realtime`
  on Railway is `bun src/server.ts` — no Next runtime, unaffected (re-checked
  that day). The `BUN_VERSION = "1.4.2"` line in the runbook sits inside a
  **Netlify** snippet that is stale legacy; Netlify is not used.
  Vercel picks its OWN Bun for install/build and we do not pin it — the evidence
  is in `vercel-build.sh`, which forgives a Bun 1.3.14 teardown segfault we never
  installed locally.
