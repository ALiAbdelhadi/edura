---
paths:
  - "**/package.json"
  - "bun.lock"
  - "turbo.json"
  - ".github/workflows/**"
  - "scripts/**"
  - "apps/realtime/**"
---

## Runtime (Bun)

- Bun is the only package manager/toolchain AND the official runtime: both apps'
  `start` scripts run `bun --bun next start`; `apps/realtime` runs
  `bun src/server.ts`.
- Minimum Bun is 1.4.0 (`packageManager` `bun@1.4.2`) — a runtime requirement:
  on Bun 1.3.12 `next start` served 500 on every route.
- `next dev` (Turbopack) stays on Node. Do NOT flip dev to `--bun` until a
  Bun/Next upgrade passes the login smoke test.
- `packages/database` tooling may keep Node/tsx (Ali's decision, 2026-07-31).
- No Node install instructions, `engines.node`, or Node references anywhere
  user-facing; `engines` declare Bun only.
- Full history and proofs → [runtime-bun](../../docs/claude/runtime-bun.md)
