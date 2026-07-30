# Finding: no scheduler invokes any cron job

**Date:** 2026-07-26
**Status:** open — pre-launch blocker
**Scope:** platform-wide operations, not specific to any one feature
**Method:** read-only inspection of the repo. No code changed.

## Summary

The repo defines six scheduled jobs behind one authenticated endpoint. **Nothing
in the repository invokes that endpoint.** There is no `vercel.json`, no
`.github/` directory, no CI workflow, no scheduler YAML, no `package.json`
script, and no external caller documented in `docs/guides/deployment.md` or
`docs/guides/runbook.md`.

Every job is therefore dead in every environment today. Each one fails silently:
the endpoint is correct, authenticated and tested, it is simply never called.

## The surface

One route, six jobs — [apps/www/src/app/api/v1/cron/\[job\]/route.ts](../../apps/www/src/app/api/v1/cron/[job]/route.ts).
`apps/superadmin` has no cron route at all.

| Job | Implementation | Invoked by | Consequence of never running |
|---|---|---|---|
| `month-end-statements` | `services/cron/jobs.ts:16` | nothing | Month-end statements are never generated |
| `lesson-reminders` | `services/cron/jobs.ts:77` | nothing | Lesson reminders are never sent |
| `expire-payment-intents` | `services/payments/payment-intents` | nothing | Payment intents stay pending forever |
| `expire-subscriptions` | `services/subscriptions/subscriptions` | nothing | **Subscriptions never expire — paid access continues past the paid period** |
| `expire-collaboration-requests` | `@repo/server-core/services/collaboration` | nothing | Collaboration requests stay open indefinitely |
| `guardian-contact-reminders` | `@repo/server-core/services/invites/guardian-contact` | nothing | Minors owed a guardian email are never reminded; the center is never told |

## Evidence that nothing calls it

Searched the whole tree (excluding `node_modules` / `.next`) for anything that
hits `/api/v1/cron`:

- `find . -name "vercel.json"` → none.
- `.github/` → does not exist. No CI of any kind.
- No `*.yml` / `*.yaml` other than `bun.lock` and `pnpm-workspace.yaml`.
- No `cron` entry in any `package.json` script.
- `CRON_SECRET` appears only in: `CLAUDE.md`, `turbo.json`, the route itself,
  `docs/security/security-audit.md`, `tests/db/_fixtures.ts`,
  `tests/unit/m7-cron-auth.test.ts`.
- The only things that ever call the endpoint are **tests and a manual API
  client**: `apps/www/tests/db/_deep-write-1.mjs`,
  `apps/www/tests/unit/m7-cron-auth.test.ts`, and the Bruno request file
  `apps/www/bruno/v1/cron/_job/POST.bru`.
- `docs/guides/deployment.md` and `docs/guides/runbook.md` contain no cron or
  scheduling section.

Note: `docs/reports/api-verification.md` records these jobs returning `200`.
That was a test harness calling them directly — it verifies the endpoint works,
not that anything schedules it. It is easy to misread as evidence of a
functioning schedule; it is not.

## Severity ranking

1. **`expire-subscriptions`** — money and access control. A subscription that
   never expires is a customer retaining paid access without paying. This is the
   one to fix first; it is the only job whose silence has a direct revenue and
   entitlement effect.
2. **`expire-payment-intents`** — pending intents accumulate; reconciliation
   noise and a growing table.
3. **`month-end-statements`**, **`lesson-reminders`** — finance and comms
   commitments that simply never happen.
4. **`expire-collaboration-requests`** — stale requests, low blast radius.
5. **`guardian-contact-reminders`** — welfare, not safety. The child-safety lock
   it escalates does **not** depend on this job; see
   [guardian-gate-findings.md](guardian-gate-findings.md) §3.

## What closing this looks like

Not planned here, listed so it is not re-derived: pick the scheduler (Vercel
cron, an external cron hitting the endpoint with `x-cron-secret`, or a
platform-native scheduler), commit the config, and add the schedule and expected
cadence to `docs/guides/deployment.md`. Then verify by asserting each job ran —
a scheduler that is configured but silently failing looks identical to today
from inside the app.

Until a scheduler exists, **any feature whose correctness depends on a periodic
sweep should be treated as not shipped**, however complete its code is.
