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
| 3 | ~~SMTP_PASS~~ **PROVIDED 2026-08-26** — set on edura-erp Production alongside the full SMTP_* family (verified via `vercel env ls`; the running deployment already reads it). Password-validity proof: the new `?deep=mail` health probe (connect+auth, no send, opt-in, never flips status) is in the tree awaiting the next successful deploy — the local `.env.production` turned out fully redacted (`"[SENSITIVE]"` values), so no local send-proof is possible by design | ~~XS~~ | ✅ (proof pending one deploy) |
| 4 | **Schedule the cron jobs** (`CRON_BASE_URL` + `CRON_SECRET` repo secrets; workflow exists, fails closed today). Gates renewal reminders, weekly digest, subscription expiry sweep | XS | Subscriptions expire silently without the sweep |
| 5 | **Resume backups** (95% done per edura-backup-provisioning-state; needs the B2 Read+Write key; Neon PITR is the only protection today) | S (Ali key) | Real money data with no scheduled dumps |
| 6 | ~~M4 + M8~~ **DONE 2026-08-26** — M4 was already implemented in the shared `toErrorResponse` (proof m4-error-messages 4/4; the audit list was stale); M8's last static-string site converted to the tagged template + a permanent repo-wide guard test (m8-no-raw-unsafe) | ~~S~~ | ✅ |
| 7 | ~~Pre-launch census + wipe~~ **DONE 2026-08-26** — census named all 9 users; cleanup deleted the 7 residue users + 2 centers (137 rows / 20 tables, one tx, 3 FK passes) keeping the 2 staff + catalog byte-identical; sequences restarted; verify-db 28/28 after; fresh B2 dump taken minutes before | ~~S~~ | ✅ |

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
- `bun run build:light` (`SERWIST_DISABLE=1`, webpack, in-process compile) is
  now the Vercel buildCommand. The full escalation was burned through on
  2026-08-26 afternoon: three consecutive silent hangs (with the memory flag,
  without serwist, and even in-process) after three morning successes —
  the freeze is infrastructure-side and time-variable, not one knob. turbopack
  dies with SIGILL on Vercel's image. VERDICT: free-plan Vercel builds of this
  app are structurally unreliable; retry when they hang, and treat the VPS
  (§5) as the real fix — which was already the plan.

## 5. VPS migration (after MVP validates)

Not started; needs its own runbook when the time comes. The shape, sized for
one VPS: Caddy/nginx → three `bun --bun next start` apps (erp/superadmin/www)
+ `apps/realtime` (`bun src/server.ts`), systemd units, env from a secrets
file, Neon stays managed (no self-hosted Postgres), GitHub Actions deploy via
SSH. The Bun-only runtime decision (2026-07-31) transfers as-is. Writing this
runbook is the FIRST post-MVP task, not an MVP blocker.
