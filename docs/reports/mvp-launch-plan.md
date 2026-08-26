# MVP launch plan — cash-first (2026-08-26)

Ali's direction: Vercel is a TEST bed only; production will move to a VPS
later; the goal now is an MVP. This plan defines that MVP, lists what already
qualifies, and enumerates the blockers in order. Grounded in CLAUDE.md's
environment-state entries and the phase work of 2026-08-25 — not re-audited
from scratch.

## 1. What the MVP is

**Cash-first operation of one real center**, the classic Egyptian workflow:

> walk-in registration (WhatsApp mock → manual link handover) → counter
> check-in with cash / InstaPay / POS collection → drawer shift open/close →
> "إنهاء الحصة" by the receptionist → automatic settlement + clearing
> (platform credit) → receipts, reports, exports → owner + accountant reviews.

Everything in that loop is BUILT and proven by live-DB suites (Phases 0–5,
awaiting Ali's review). **Online payments (Paymob) are NOT in the MVP** — the
driver is deliberately a stub, the Egyptian center's day runs on cash, and
Phase 4's clearing model was designed precisely so cash-collected money is
honest without a gateway.

## 2. Already MVP-grade (no work)

- Counter loop end-to-end incl. Phase 0 locks, Phase 1 methods, Phase 2
  shifts, Phase 3 staff end-lesson + per-lesson financials.
- Clearing model (Phase 4): wallet = platform-held only; credit arrears
  visible. Teacher agreements (Phase 5) with proposal governance.
- Auth (better-auth, 2FA, revocation), RLS tenancy, audit trail, blacklist,
  messaging with child-safety gate, reports/exports, bulk import, student ID
  cards + QR, i18n ar/en, PWA.
- Production DB: all 69 migrations applied (verified 2026-08-26 via the
  migrate-production workflow, status mode), verify-db shape baseline current.

## 3. MVP blockers, in order

| # | Task | Size | Why it gates |
|---|---|---|---|
| 1 | **Ali reviews Phases 0–5** (docs/reports/revenue-operations-spec-audit.md records each proof) | review | All money-engine changes await the stop-per-phase review |
| 2 | ~~Hide online-payment CTAs when mock-in-production~~ **DONE 2026-08-26**: `onlineCheckoutAvailable()` (gateway/types.ts) asserted by all FIVE initiators server-side + `GET /api/v1/payments/availability` + `useOnlineCheckout()` consulted by the five CTA surfaces (student/parent wallet top-ups, subjects subscribe → honest "subscribe at the center" note, parent-pay card leg, center credit top-up controls). Internal-wallet legs untouched. Proof: online-checkout-gate.test.ts 4/4 (prod+mock refuses before DB), route-conventions guard updated, erp unit 1435 | ~~S~~ | ✅ |
| 3 | **`SMTP_PASS`** (Gmail app password — only Ali can generate). Without it INVITE_CHANNELS=email delivers nothing: no walk-in claim links, no guardian verification | XS (Ali) | Walk-in onboarding is half the MVP loop |
| 4 | **Schedule the cron jobs** (`CRON_BASE_URL` + `CRON_SECRET` repo secrets; workflow exists, fails closed today). Gates renewal reminders, weekly digest, subscription expiry sweep | XS | Subscriptions expire silently without the sweep |
| 5 | **Resume backups** (95% done per edura-backup-provisioning-state; needs the B2 Read+Write key; Neon PITR is the only protection today) | S (Ali key) | Real money data with no scheduled dumps |
| 6 | ~~M4 + M8~~ **DONE 2026-08-26** — M4 was already implemented in the shared `toErrorResponse` (proof m4-error-messages 4/4; the audit list was stale); M8's last static-string site converted to the tagged template + a permanent repo-wide guard test (m8-no-raw-unsafe) | ~~S~~ | ✅ |
| 7 | **Pre-launch census + wipe on production** (9 users / 2 centers today — walkthrough residue; verify-db then wipe non-seed rows per Step 9 discipline) | S | First real center starts on clean books |

Deliberately NOT MVP: CSP enforce (Report-Only is acceptable at MVP scale),
M5/M6, Paymob driver (Phase 6 — needs keys), the Next.js caching pass
(post-launch list), video/AI/scholarships/bookstore (permanently descoped).

## 4. Vercel-as-testbed hardening (done 2026-08-26)

- exit-127 fixed by b48c162 (bun-wrapped build command).
- 46-min silent hangs: `webpackMemoryOptimizations` + `NODE_OPTIONS`
  old-space cap → passes in ~4.5m on the basic machine; a true overrun now
  fails fast and visibly. Enhanced machines are NOT available on the Hobby
  plan (`err_build_machines_not_available`) — accepted, since Vercel is test
  only.
- `bun run build:light` (`SERWIST_DISABLE=1`): skips the service-worker
  compilation — the optional lever if test builds ever strain again. Wire it
  as the Vercel buildCommand only if needed; production/VPS builds keep the
  PWA.

## 5. VPS migration (after MVP validates)

Not started; needs its own runbook when the time comes. The shape, sized for
one VPS: Caddy/nginx → three `bun --bun next start` apps (erp/superadmin/www)
+ `apps/realtime` (`bun src/server.ts`), systemd units, env from a secrets
file, Neon stays managed (no self-hosted Postgres), GitHub Actions deploy via
SSH. The Bun-only runtime decision (2026-07-31) transfers as-is. Writing this
runbook is the FIRST post-MVP task, not an MVP blocker.
