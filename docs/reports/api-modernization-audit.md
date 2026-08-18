# API modernization audit — all 410 route handlers (2026-08-08)

**Scope:** every `route.ts` under `apps/www/src/app/api` (209) and
`apps/superadmin/src/app/api` (201). `apps/realtime` is a Socket.IO server, not
Next.js; `apps/showcase` has no API surface.

**Installed versions:** Next.js **16.2.12**, React 19.2.8, App Router only.
Feature claims below were verified against nextjs.org/docs (site reports
v16.3.0, 2026-06/07 updates) — noted where 16.2 vs 16.3 differs.

**Standing guards created by this audit:**
`apps/www/tests/unit/route-conventions.test.ts` and
`apps/superadmin/tests/unit/route-conventions.test.ts` statically analyse every
route file and enforce: auth wrapper or justified public allowlist (each entry
pinned to its gate — rate limit / HMAC / CRON_SECRET / dedicated secret /
GET-only), `dynamic = "force-dynamic"` everywhere, and no raw body reads
outside `parseJson` (with the webhook `.text()` and five upload `formData()`
exceptions named). The allowlists fail on stale entries, so they cannot drift.

---

## 1. Verdict

This API surface is already modern by deliberate, recorded decisions — the
audit's main output is confirmation plus a small applied list, not a rewrite:

- **409/410 routes** exported `dynamic = "force-dynamic"` before this audit
  (the 410th is fixed below). Correct for this product: money, wallets,
  attendance, messaging, auth and per-user reads must never be cached
  (CLAUDE.md hard constraint).
- **Auth**: no unauthenticated business route exists. Two wrapper families
  (`requireRole`/`requireSession` and the actor wrappers
  `centerStaff`/`delegated`/`delegatedWithCenter`) cover everything; the 20
  www + 2 superadmin public routes each carry a verified gate (rate limit,
  HMAC, CRON_SECRET, dedicated internal secret, or GET-only public read).
- **Conventions**: `await ctx.params` everywhere (Next 15+ style — zero legacy
  sync access found); bodies via `parseJson` + zod on every route (the one
  legacy zod-`.parse` site was migrated on review approval, see §2); uniform
  `ok`/`fail` envelope via `withErrors` with Prisma error mapping and prod
  message hiding (M4).
- **Caching**: `experimental.useCache` (not `cacheComponents`) is enabled on
  purpose; the education catalog is the only cached read, with tag, profiles
  and a written cross-app invalidation model
  (`apps/www/src/lib/services/catalog/catalog-cache.ts`). That file is the
  in-repo exemplar the post-launch pass should copy.

Per CLAUDE.md ("Post-launch improvements — do NOT implement now") and the
decision recorded in `apps/www/next.config.ts`, **no cache enablement was done
in this pass**. §4 is the execution plan for when that work is unlocked.

## 2. Applied in this pass (behavior-preserving only)

| Change | Files | Why it is safe |
|---|---|---|
| `export const dynamic = "force-dynamic"` added | `apps/www/src/app/api/v1/affiliations/[id]/decline/route.ts` | POST-only route — handlers with a body are always dynamic; this is consistency, and it lets the convention suite assert the invariant with zero exceptions. |
| `parseJson` migration (approved 2026-08-08, review follow-up #2) | `v1/collaboration-requests/[id]/accept` | **Deliberate contract change, approved:** a wrong-shape body is now 400 `validation_error` (was a raw ZodError 500); a request with NO body still accepts, preserving tooling tolerance (the UI always posts `{}`). Pinned by `route-collab-accept-body.test.ts`; the convention suite's raw-json allowlist is now empty. |
| Analytics moved into `after()` (6 call sites) | `v1/enrollments` (trackFirstStudent), `v1/collaboration-requests/[id]/accept` (trackFirstTeacher), `v1/courses` ×2 (trackFirstGroup), `v1/auth/register/center` + `v1/auth/register/teacher` (captureServerEvent) | All six are post-commit, results unused, and never-throw **by contract** (`packages/observability` + funnel helpers). `after()` still guarantees execution (waitUntil-backed on Vercel), so the count survives while the response stops waiting on a DB count + PostHog network hop. No response byte or status changes on any path — including error paths, because the helpers could not throw before either. |

Deliberately **not** applied, though they pattern-match "fire-and-forget":
every `notify()` call (writes user-visible notification rows; failure today is
a loud 500, moving it to `after()` silently swallows fan-out failures — a
failure-contract decision, not a refactor), and all mail/invite sends that are
already downstream of committed writes inside services (wrapping inside a
service would detach them from the request lifecycle guarantees they rely on).

## 3. Recommend-only findings (need a decision; NOT applied)

1. ~~**`v1/collaboration-requests/[id]/accept` body parsing.**~~ **RESOLVED —
   approved and applied 2026-08-08** (review follow-up #2); see §2. Kept here
   because the original flag explains why it needed sign-off: the migration
   changed a public status code (wrong-shape body 500→400).
2. **`notify()` → `after()` family** (`v1/enrollment-requests` POST and
   siblings): decide the failure contract first — is "enrollment request
   created but admins not notified" a 500 (today) or a 201 with a logged
   fan-out failure (after())? If the latter, `notify()` should also become
   contractually never-throw and log through observability.
3. **Superadmin catalog writes cannot invalidate www's catalog cache**
   (cross-process; documented in `catalog-cache.ts`). The 60s/300s cacheLife
   is the current freshness bound and is fine. If the post-launch pass extends
   caching, close this properly with the shared Redis cache handler (M3
   infrastructure) — not with a per-write HTTP bridge.
4. **`_ping` is DEPRECATED (comment added in the route, 2026-08-08)**:
   `/api/v1/%5Fping` exists because `_`-prefixed folders are private in the
   App Router. It predates `/api/health` and returns 200 even when the DB is
   down (CLAUDE.md already warns never to point a monitor at it). Retire it
   once nothing references it — check `scripts/api-smoke.sh`, the generated
   Bruno collection, and any external uptime monitor before deleting; until
   then it stays allowlisted as public infra in the convention suite.

## 4. Post-launch caching execution plan (do NOT start before launch)

Constraints restated from CLAUDE.md, binding: **never cache** money, wallet
balances, subscriptions, attendance, messaging, auth/session, or any per-user
or stateful data; **measure real traffic first**; optimize specific slow paths
batch-by-batch, never a repo-wide sweep.

**Step 1 — flag migration.** `experimental.useCache: true` →
`cacheComponents: true` (top-level in current docs; on 16.2.12 verify whether
it is still `experimental.cacheComponents` or upgrade to ≥16.3 first). This is
the gating step because `cacheComponents` changes the prerendering model for
GET route handlers app-wide. Mitigation already in place: every API route
exports `force-dynamic`, and the convention suites enforce that — so the flag
flip cannot silently make an API route prerenderable. Run the full DB-suite +
unit + build gauntlet after flipping; `catalog-onboarding`'s known `cacheTag()`
env failure is the canary suite to watch.

**Step 2 — candidates, in measured-traffic order.** Cache at the DATA-function
level (the `catalog-read.ts` pattern: route stays `force-dynamic`, auth runs
every request, only the query result behind the gate is memoised). Do not use
`export const revalidate` / `force-static` segment configs — that is the
legacy model and mixes badly with Cache Components; one model only.

| Endpoint(s) | Suggested tag | Suggested cacheLife | Invalidation |
|---|---|---|---|
| `v1/subjects` | `catalog` (existing) | existing `CATALOG_CACHE_LIFE` | already handled — route it through the cached catalog reader instead of its direct `findMany` |
| `v1/centers/[id]` | `center-profile:{id}` | minutes (stale 60 / revalidate 300 / expire 900) | `revalidateTag(tag, 'max')` from www-side center profile writes; superadmin writes rely on expire until the shared cache handler exists |
| `v1/teachers/[teacherId]` | `teacher-profile:{id}` | same as centers | same; also invalidate on review create/moderate |
| `v1/search/centers`, `v1/search/teachers` | `discovery` | short (stale 30 / revalidate 60 / expire 300) | time-based only — collapses concurrent identical queries; args are the cache key |
| `v1/search/courses` | `discovery` | short | **only the anonymous/unnarrowed branch** — the `?studentId=` branch resolves an approved child's scope and stays uncached |

Already done today (verify, don't redo): `v1/catalog/tree`,
`v1/catalog/subjects` read through the `"use cache"` catalog readers.

**Step 3 — invalidation wiring.** Next 16 requires the two-argument
`revalidateTag(tag, profile)` (single-argument form is deprecated): `'max'`
for stale-while-revalidate on ordinary content writes; `{ expire: 0 }` only
where a caller needs immediate expiry (webhook-style). `updateTag` is Server
Actions only — this API is route handlers, so it does not apply. The existing
`revalidateCatalogCache()` already models the correct call shape.

**Step 4 — explicitly out of scope forever** (per the hard constraint): every
`v1/me/*`, wallet/payments/payouts/finance, attendance/check-in, messaging,
dashboards, reports, roster, enrollment, subscription and notification route,
and the entire superadmin app (per-actor, low-traffic, audit-sensitive).

## 5. Test coverage added by this workstream

See the companion suites (Batch 3/4 of the 2026-08-08 audit): convention
enforcement over all 410 routes (both apps), unit coverage of the shared
wrappers (`requireRole`, actor wrappers, `withErrors`/`toErrorResponse`,
envelope, `parseJson`, rate-limit and cron gates), and mocked route tests for
the public/security-critical endpoints. The live-DB suites remain the proof
mechanism for money paths, RLS and real auth doors — the mocked layer is
contract coverage, not a replacement.

## Appendix — per-endpoint classification (all 410 routes)

Classes: **A** already modern, no change · **B** safe fix applied this pass · **C** post-launch cache candidate · **D** recommend-only (contract/product decision) · **done** already cached correctly today.

Routes not individually annotated are class **A**: force-dynamic, auth-wrapped (or allowlisted public), zod-parsed body, `await ctx.params`, envelope errors — verified by the convention suites, which is why the table only lists exceptions in the Notes column.


### apps/superadmin

| Route | Methods | Class | Notes |
|---|---|---|---|
| `/api/auth/[...all]` | none | A |  |
| `/api/health` | GET,HEAD | A |  |
| `/api/v1/admin/accountants` | POST | A |  |
| `/api/v1/admin/audit-logs/actions` | GET | A |  |
| `/api/v1/admin/audit-logs` | GET | A |  |
| `/api/v1/admin/blacklist/[id]/remove` | POST | A |  |
| `/api/v1/admin/blacklist` | GET | A |  |
| `/api/v1/admin/catalog/grade-levels/[id]` | PATCH | A |  |
| `/api/v1/admin/catalog/grade-levels` | GET,POST | A |  |
| `/api/v1/admin/catalog/grade-tracks/[id]` | DELETE | A |  |
| `/api/v1/admin/catalog/grade-tracks` | POST | A |  |
| `/api/v1/admin/catalog/offerings/[id]` | DELETE,PATCH | A |  |
| `/api/v1/admin/catalog/offerings` | GET,POST | A |  |
| `/api/v1/admin/catalog/stages/[id]` | PATCH | A |  |
| `/api/v1/admin/catalog/stages` | GET,POST | A |  |
| `/api/v1/admin/catalog/subject-requests/[id]/approve` | POST | A |  |
| `/api/v1/admin/catalog/subject-requests/[id]/reject` | POST | A |  |
| `/api/v1/admin/catalog/subject-requests` | GET | A |  |
| `/api/v1/admin/catalog/subjects/[id]` | PATCH | A |  |
| `/api/v1/admin/catalog/subjects` | GET,POST | A |  |
| `/api/v1/admin/catalog/systems/[id]` | PATCH | A |  |
| `/api/v1/admin/catalog/systems` | GET,POST | A |  |
| `/api/v1/admin/catalog/tracks/[id]` | PATCH | A |  |
| `/api/v1/admin/catalog/tracks` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/admins/[userId]` | DELETE | A |  |
| `/api/v1/admin/centers/[id]/admins/invite` | POST | A |  |
| `/api/v1/admin/centers/[id]/admins` | GET | A |  |
| `/api/v1/admin/centers/[id]/affiliations/[affiliationId]` | PUT | A |  |
| `/api/v1/admin/centers/[id]/affiliations` | GET | A |  |
| `/api/v1/admin/centers/[id]/approve` | POST | A |  |
| `/api/v1/admin/centers/[id]/attendance/[attendanceId]` | PATCH | A |  |
| `/api/v1/admin/centers/[id]/blacklist/[entryId]` | DELETE | A |  |
| `/api/v1/admin/centers/[id]/blacklist` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/broadcast` | POST | A |  |
| `/api/v1/admin/centers/[id]/checkin/lookup` | GET | A |  |
| `/api/v1/admin/centers/[id]/checkin` | POST | A |  |
| `/api/v1/admin/centers/[id]/checkin/suggest` | GET | A |  |
| `/api/v1/admin/centers/[id]/collaboration-requests` | POST | A |  |
| `/api/v1/admin/centers/[id]/courses/[courseId]/cancel` | POST | A |  |
| `/api/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher` | POST | A |  |
| `/api/v1/admin/centers/[id]/courses/[courseId]` | GET,PATCH | A |  |
| `/api/v1/admin/centers/[id]/courses` | POST | A |  |
| `/api/v1/admin/centers/[id]/dashboard` | GET | A |  |
| `/api/v1/admin/centers/[id]/deletion-requests/[requestId]/decide` | POST | A |  |
| `/api/v1/admin/centers/[id]/deletion-requests` | GET | A |  |
| `/api/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide` | POST | A |  |
| `/api/v1/admin/centers/[id]/enrollment-requests` | GET | A |  |
| `/api/v1/admin/centers/[id]/enrollments/[enrollmentId]` | DELETE | A |  |
| `/api/v1/admin/centers/[id]/enrollments` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/members/[userId]/status` | POST | A |  |
| `/api/v1/admin/centers/[id]/money/expenses/[expenseId]` | DELETE,PATCH | A |  |
| `/api/v1/admin/centers/[id]/money/expenses` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/money/payments/[paymentId]/refund` | POST | A |  |
| `/api/v1/admin/centers/[id]/money/payments/[paymentId]` | GET | A |  |
| `/api/v1/admin/centers/[id]/money/payments` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/money/payout-request` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/money/subscriptions` | POST | A |  |
| `/api/v1/admin/centers/[id]/money/wallet-topup` | POST | A |  |
| `/api/v1/admin/centers/[id]/oversight/attendance` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/courses` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/enrollments` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/finance` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/invoices` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/overview` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/payments` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/payouts` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/pending` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/sessions` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/settlements` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/staff` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/statement` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/students` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/subscriptions` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/transactions` | GET | A |  |
| `/api/v1/admin/centers/[id]/oversight/wallet` | GET | A |  |
| `/api/v1/admin/centers/[id]/per-student-rate` | DELETE,PUT | A |  |
| `/api/v1/admin/centers/[id]/reject` | POST | A |  |
| `/api/v1/admin/centers/[id]/reports/[report]` | GET | A |  |
| `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | DELETE,PUT | A |  |
| `/api/v1/admin/centers/[id]/rooms/[roomId]` | PATCH | A |  |
| `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | DELETE,PUT | A |  |
| `/api/v1/admin/centers/[id]/rooms/[roomId]/status` | POST | A |  |
| `/api/v1/admin/centers/[id]/rooms/create` | POST | A |  |
| `/api/v1/admin/centers/[id]/rooms` | GET | A |  |
| `/api/v1/admin/centers/[id]/roster/students/[studentId]` | DELETE,GET,PATCH | A |  |
| `/api/v1/admin/centers/[id]/roster/students/invite` | POST | A |  |
| `/api/v1/admin/centers/[id]/roster/students/lookup` | POST | A |  |
| `/api/v1/admin/centers/[id]/roster/students` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/roster/teachers/[teacherId]` | DELETE | A |  |
| `/api/v1/admin/centers/[id]/roster/teachers/invite` | POST | A |  |
| `/api/v1/admin/centers/[id]/roster/teachers/lookup` | POST | A |  |
| `/api/v1/admin/centers/[id]/roster/teachers` | GET | A |  |
| `/api/v1/admin/centers/[id]` | GET,PATCH | A |  |
| `/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | GET,PUT | A |  |
| `/api/v1/admin/centers/[id]/sessions/[sessionId]/cancel` | POST | A |  |
| `/api/v1/admin/centers/[id]/sessions/[sessionId]/complete` | POST | A |  |
| `/api/v1/admin/centers/[id]/sessions/[sessionId]/postpone` | POST | A |  |
| `/api/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview` | GET | A |  |
| `/api/v1/admin/centers/[id]/split` | DELETE,GET,PUT | A |  |
| `/api/v1/admin/centers/[id]/staff/[linkId]/invite` | POST | A |  |
| `/api/v1/admin/centers/[id]/staff/[linkId]` | DELETE,PATCH | A |  |
| `/api/v1/admin/centers/[id]/staff` | GET,POST | A |  |
| `/api/v1/admin/centers/[id]/status` | POST | A |  |
| `/api/v1/admin/centers/[id]/students/[studentId]/membership` | POST | A |  |
| `/api/v1/admin/centers/[id]/temp-students/[tempId]/invite` | POST | A |  |
| `/api/v1/admin/centers/[id]/temp-students` | POST | A |  |
| `/api/v1/admin/centers/[id]/toggle` | PATCH | A |  |
| `/api/v1/admin/centers/[id]/walk-in/resend` | POST | A |  |
| `/api/v1/admin/centers/[id]/walk-in` | POST | A |  |
| `/api/v1/admin/centers` | GET | A |  |
| `/api/v1/admin/collaboration-requests/[id]/decide` | POST | A |  |
| `/api/v1/admin/collaboration-requests/[id]` | GET | A |  |
| `/api/v1/admin/collaboration-requests` | GET | A |  |
| `/api/v1/admin/commission-settings` | GET,PUT | A |  |
| `/api/v1/admin/contact-submissions/[id]/status` | POST | A |  |
| `/api/v1/admin/contact-submissions` | GET | A |  |
| `/api/v1/admin/dashboard/decision-queue` | GET | A |  |
| `/api/v1/admin/dashboard/kpis` | GET | A |  |
| `/api/v1/admin/dashboard/revenue-chart` | GET | A |  |
| `/api/v1/admin/dashboard/user-growth-chart` | GET | A |  |
| `/api/v1/admin/deletion-requests/[id]` | POST | A |  |
| `/api/v1/admin/deletion-requests` | GET | A |  |
| `/api/v1/admin/feature-flags` | GET,PUT | A |  |
| `/api/v1/admin/impersonation/stop` | POST | A |  |
| `/api/v1/admin/messaging/blocks` | GET | A |  |
| `/api/v1/admin/messaging/conversations/[id]` | GET | A |  |
| `/api/v1/admin/messaging/conversations` | GET | A |  |
| `/api/v1/admin/messaging/messages/[id]` | DELETE | A |  |
| `/api/v1/admin/messaging/reports/[id]` | PATCH | A |  |
| `/api/v1/admin/messaging/reports` | GET | A |  |
| `/api/v1/admin/notifications/history` | GET | A |  |
| `/api/v1/admin/payment-intents/[id]` | GET | A |  |
| `/api/v1/admin/payment-intents` | GET | A |  |
| `/api/v1/admin/platform/students/[studentId]/move` | POST | A |  |
| `/api/v1/admin/platform/students/[studentId]/verify-dob` | POST | A |  |
| `/api/v1/admin/platform/users/[userId]/force-logout` | POST | A |  |
| `/api/v1/admin/points/rules/[id]` | DELETE,PATCH | A |  |
| `/api/v1/admin/points/rules` | GET,POST | A |  |
| `/api/v1/admin/points/students/[id]/adjust` | POST | A |  |
| `/api/v1/admin/points/students/[id]/ledger` | GET | A |  |
| `/api/v1/admin/registrations` | GET | A |  |
| `/api/v1/admin/revenue-split/per-student-rate` | DELETE,PUT | A |  |
| `/api/v1/admin/revenue-split` | GET,PUT | A |  |
| `/api/v1/admin/session-settlements/export` | GET | A |  |
| `/api/v1/admin/session-settlements` | GET | A |  |
| `/api/v1/admin/students/[id]/blacklist` | POST | A |  |
| `/api/v1/admin/students/[id]/link-parent` | POST | A |  |
| `/api/v1/admin/students/[id]` | GET | A |  |
| `/api/v1/admin/students/[id]/unlink-parent` | DELETE | A |  |
| `/api/v1/admin/students` | GET | A |  |
| `/api/v1/admin/subscriptions/[id]` | GET | A |  |
| `/api/v1/admin/subscriptions` | GET | A |  |
| `/api/v1/admin/teachers/[id]/approve` | POST | A |  |
| `/api/v1/admin/teachers/[id]/attendance-mode` | PATCH | A |  |
| `/api/v1/admin/teachers/[id]/blacklist` | POST | A |  |
| `/api/v1/admin/teachers/[id]/link-center` | POST | A |  |
| `/api/v1/admin/teachers/[id]/reject` | POST | A |  |
| `/api/v1/admin/teachers/[id]/unlink-center` | DELETE | A |  |
| `/api/v1/admin/teachers` | GET | A |  |
| `/api/v1/admin/users/[id]/blacklist` | POST | A |  |
| `/api/v1/admin/users/[id]/impersonate` | POST | A |  |
| `/api/v1/admin/users/[id]/password-reset` | POST | A |  |
| `/api/v1/admin/users/[id]/permissions` | GET,PATCH | A |  |
| `/api/v1/admin/users/[id]/reset-2fa` | POST | A |  |
| `/api/v1/admin/users/[id]/revoke-sessions` | POST | A |  |
| `/api/v1/admin/users/[id]` | GET | A |  |
| `/api/v1/admin/users/[id]/sessions/[sessionId]` | DELETE | A |  |
| `/api/v1/admin/users/[id]/status` | PATCH | A |  |
| `/api/v1/admin/users` | GET | A |  |
| `/api/v1/admin/wallet-settings` | GET,PUT | A |  |
| `/api/v1/admin/whatsapp-messages` | GET | A |  |
| `/api/v1/finance/alerts` | GET | A |  |
| `/api/v1/finance/commission-settings` | GET | A |  |
| `/api/v1/finance/dashboard/revenue-chart` | GET | A |  |
| `/api/v1/finance/dashboard` | GET | A |  |
| `/api/v1/finance/invoices/[id]/pdf` | GET | A |  |
| `/api/v1/finance/invoices/[id]` | GET | A |  |
| `/api/v1/finance/invoices/[id]/send-email` | POST | A |  |
| `/api/v1/finance/invoices` | GET,POST | A |  |
| `/api/v1/finance/payment-intents/[id]` | GET | A |  |
| `/api/v1/finance/payment-intents` | GET | A |  |
| `/api/v1/finance/payouts/[id]/approve` | POST | A |  |
| `/api/v1/finance/payouts/[id]/receipt` | GET | A |  |
| `/api/v1/finance/payouts/[id]/reject` | POST | A |  |
| `/api/v1/finance/payouts/bulk-approve` | POST | A |  |
| `/api/v1/finance/payouts/counts` | GET | A |  |
| `/api/v1/finance/payouts` | GET,POST | A |  |
| `/api/v1/finance/refunds` | GET,POST | A |  |
| `/api/v1/finance/reports/center-statement/[centerId]` | GET | A |  |
| `/api/v1/finance/reports/refunds` | GET | A |  |
| `/api/v1/finance/reports/revenue` | GET | A |  |
| `/api/v1/finance/reports/teacher-statement/[teacherId]` | GET | A |  |
| `/api/v1/finance/reports/trial-balance` | GET | A |  |
| `/api/v1/finance/subscriptions/[id]` | GET | A |  |
| `/api/v1/finance/subscriptions` | GET | A |  |
| `/api/v1/finance/transactions/[id]` | GET | A |  |
| `/api/v1/finance/transactions` | GET | A |  |
| `/api/v1/me` | GET,PATCH | A |  |
| `/api/v1/notifications/[id]/read` | POST | A |  |
| `/api/v1/notifications/read-all` | POST | A |  |
| `/api/v1/notifications` | GET | A |  |

### apps/www

| Route | Methods | Class | Notes |
|---|---|---|---|
| `/api/auth/[...all]` | none | A |  |
| `/api/health` | GET,HEAD | A |  |
| `/api/v1/%5Fping` | GET | A |  |
| `/api/v1/affiliations/[id]/accept` | POST | A |  |
| `/api/v1/affiliations/[id]/decline` | POST | B | added missing `force-dynamic` (POST-only, so behavior was already dynamic; consistency + convention-suite green) |
| `/api/v1/affiliations/[id]` | DELETE | A |  |
| `/api/v1/attendance/[id]` | PATCH | A |  |
| `/api/v1/auth/invite/accept` | POST | A |  |
| `/api/v1/auth/login` | POST | A |  |
| `/api/v1/auth/password/forgot` | POST | A |  |
| `/api/v1/auth/password/reset` | POST | A |  |
| `/api/v1/auth/register/center` | POST | B | `captureServerEvent` moved into `after()` |
| `/api/v1/auth/register/parent` | POST | A |  |
| `/api/v1/auth/register/student` | POST | A |  |
| `/api/v1/auth/register/teacher` | POST | B | `captureServerEvent` moved into `after()` |
| `/api/v1/catalog/subjects` | GET | done | already reads through the cached catalog readers |
| `/api/v1/catalog/tree` | GET | done | already reads through the `"use cache"` catalog readers (CATALOG_CACHE_TAG + CATALOG_CACHE_LIFE) |
| `/api/v1/center/audit-logs/actors` | GET | A |  |
| `/api/v1/center/audit-logs` | GET | A |  |
| `/api/v1/center/blacklist/[id]` | DELETE | A |  |
| `/api/v1/center/blacklist` | GET,POST | A |  |
| `/api/v1/center/checkin/lookup` | GET | A |  |
| `/api/v1/center/checkin` | POST | A |  |
| `/api/v1/center/checkin/suggest` | GET | A |  |
| `/api/v1/center/external-teachers/[teacherId]/convert` | POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/grades/[gradeId]/scores` | PUT | A |  |
| `/api/v1/center/external-teachers/[teacherId]/grades` | GET,POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/invite` | POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/restore` | POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]` | DELETE,GET,PATCH | A |  |
| `/api/v1/center/external-teachers/[teacherId]/settlements` | GET,POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/statement` | GET | A |  |
| `/api/v1/center/external-teachers/[teacherId]/students/enroll` | POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/students/lookup` | POST | A |  |
| `/api/v1/center/external-teachers/[teacherId]/students` | GET,POST | A |  |
| `/api/v1/center/external-teachers/balances` | GET | A |  |
| `/api/v1/center/external-teachers/gaps` | GET | A |  |
| `/api/v1/center/external-teachers` | GET,POST | A |  |
| `/api/v1/center/staff/[id]/invite` | POST | A |  |
| `/api/v1/center/staff/[id]` | DELETE,PATCH | A |  |
| `/api/v1/center/staff/me` | GET | A |  |
| `/api/v1/center/staff` | GET,POST | A |  |
| `/api/v1/center/students/[id]/guardian-contact` | GET,POST | A |  |
| `/api/v1/center/subscriptions` | GET,POST | A |  |
| `/api/v1/center/temp-students` | POST | A |  |
| `/api/v1/center/walk-in/resend` | POST | A |  |
| `/api/v1/center/walk-in` | POST | A |  |
| `/api/v1/center/wallet-topup` | POST | A |  |
| `/api/v1/center/wallet/payout-request` | POST | A |  |
| `/api/v1/center/wallet/payouts` | GET | A |  |
| `/api/v1/center/wallet` | GET | A |  |
| `/api/v1/center/wallet/transactions` | GET | A |  |
| `/api/v1/centers/[id]/rooms` | GET | A |  |
| `/api/v1/centers/[id]` | GET | C | public center profile; `use cache` keyed on id, tag `center-profile:{id}`, profile ~minutes |
| `/api/v1/centers/me/admins/[userId]` | DELETE | A |  |
| `/api/v1/centers/me/admins/invite` | POST | A |  |
| `/api/v1/centers/me/admins` | GET | A |  |
| `/api/v1/centers/me/logo` | DELETE,POST | A |  |
| `/api/v1/centers/me` | GET,PATCH | A |  |
| `/api/v1/collaboration-requests/[id]/accept` | POST | B+D | `trackFirstTeacher` moved into `after()`; body parsing migrated to `parseJson` (approved 2026-08-08 — wrong-shape body 500→400, no-body still accepts) |
| `/api/v1/collaboration-requests/[id]/cancel` | POST | A |  |
| `/api/v1/collaboration-requests/[id]/reject` | POST | A |  |
| `/api/v1/collaboration-requests` | GET,POST | A |  |
| `/api/v1/contact` | POST | A |  |
| `/api/v1/courses/[id]/cancel` | POST | A |  |
| `/api/v1/courses/[id]/reassign-teacher` | POST | A |  |
| `/api/v1/courses/[id]` | GET,PATCH | A |  |
| `/api/v1/courses` | GET,POST | B | both `trackFirstGroup` calls moved into `after()` |
| `/api/v1/cron/[job]` | POST | A |  |
| `/api/v1/dashboards/admin/checklist` | GET | A |  |
| `/api/v1/dashboards/admin` | GET | A |  |
| `/api/v1/dashboards/student` | GET | A |  |
| `/api/v1/dashboards/teacher` | GET | A |  |
| `/api/v1/deletion-requests/[id]/approve` | POST | A |  |
| `/api/v1/deletion-requests/[id]/reject` | POST | A |  |
| `/api/v1/deletion-requests` | GET | A |  |
| `/api/v1/door-checkin` | GET,POST | A |  |
| `/api/v1/enrollment-requests/[id]/approve` | POST | A |  |
| `/api/v1/enrollment-requests/[id]/decline` | POST | A |  |
| `/api/v1/enrollment-requests/[id]` | DELETE | A |  |
| `/api/v1/enrollment-requests` | GET,POST | D | post-commit `notify()` could move to `after()`, but notify writes user-visible rows and is not contractually never-throw — moving it silently swallows fan-out failures (500→201). Decide the failure contract first |
| `/api/v1/enrollments/[id]` | DELETE | A |  |
| `/api/v1/enrollments` | GET,POST | B | `trackFirstStudent` moved into `after()` — response no longer waits on the analytics hop |
| `/api/v1/expenses/[id]` | DELETE,PATCH | A |  |
| `/api/v1/expenses` | GET,POST | A |  |
| `/api/v1/grades/[id]` | DELETE,GET,PATCH | A |  |
| `/api/v1/grades/[id]/scores` | PUT | A |  |
| `/api/v1/grades` | GET,POST | A |  |
| `/api/v1/internal/chat-notify` | POST | A |  |
| `/api/v1/materials/[id]/download` | GET | A |  |
| `/api/v1/materials/[id]` | DELETE,PATCH | A |  |
| `/api/v1/materials` | GET,POST | A |  |
| `/api/v1/me/affiliations` | GET | A |  |
| `/api/v1/me/attendance` | GET | A |  |
| `/api/v1/me/children` | GET | A |  |
| `/api/v1/me/credentials` | POST | A |  |
| `/api/v1/me/data-rights/deletion/[id]` | DELETE | A |  |
| `/api/v1/me/data-rights/deletion` | GET,POST | A |  |
| `/api/v1/me/data-rights/exports/[id]` | DELETE,GET | A |  |
| `/api/v1/me/data-rights/exports` | GET,POST | A |  |
| `/api/v1/me/delete-request` | POST | A |  |
| `/api/v1/me/device-tokens/[token]` | DELETE | A |  |
| `/api/v1/me/device-tokens` | POST | A |  |
| `/api/v1/me/family-code/rotate` | POST | A |  |
| `/api/v1/me/family-code` | GET | A |  |
| `/api/v1/me/guardian-contact` | GET,POST | A |  |
| `/api/v1/me/onboarding-email` | GET,POST | A |  |
| `/api/v1/me/onboarding` | GET,PATCH,POST | A |  |
| `/api/v1/me/parent-wallet/history` | GET | A |  |
| `/api/v1/me/parent-wallet` | GET | A |  |
| `/api/v1/me/password` | POST | A |  |
| `/api/v1/me/points/history` | GET | A |  |
| `/api/v1/me/points` | GET | A |  |
| `/api/v1/me/prefs` | GET,PATCH | A |  |
| `/api/v1/me/push-subscription` | DELETE,POST | A |  |
| `/api/v1/me/roster/choice` | POST | A |  |
| `/api/v1/me` | GET,PATCH | A |  |
| `/api/v1/me/student-card` | GET | A |  |
| `/api/v1/me/subject-requests` | POST | A |  |
| `/api/v1/me/subjects` | GET | A |  |
| `/api/v1/me/subscriptions` | GET | A |  |
| `/api/v1/me/wallet/history` | GET | A |  |
| `/api/v1/me/wallet` | GET | A |  |
| `/api/v1/messages/blocks` | DELETE,GET,POST | A |  |
| `/api/v1/messages/contacts` | GET | A |  |
| `/api/v1/messages/conversations/[id]/read` | POST | A |  |
| `/api/v1/messages/conversations/[id]` | GET | A |  |
| `/api/v1/messages/conversations` | GET,POST | A |  |
| `/api/v1/messages/groups/[id]/mute` | POST | A |  |
| `/api/v1/messages/groups/[id]/read` | POST | A |  |
| `/api/v1/messages/groups/[id]` | GET,POST | A |  |
| `/api/v1/messages/groups` | GET,POST | A |  |
| `/api/v1/messages/reports` | POST | A |  |
| `/api/v1/messages` | POST | A |  |
| `/api/v1/notifications/[id]/read` | POST | A |  |
| `/api/v1/notifications/broadcast` | POST | A |  |
| `/api/v1/notifications/read-all` | POST | A |  |
| `/api/v1/notifications` | GET | A |  |
| `/api/v1/parent-links/[id]/approve` | POST | A |  |
| `/api/v1/parent-links/[id]/reject` | POST | A |  |
| `/api/v1/parent-links/[id]` | DELETE | A |  |
| `/api/v1/parent-links` | GET,POST | A |  |
| `/api/v1/parent/oversight/children/[studentId]/conversations/[id]` | GET | A |  |
| `/api/v1/parent/oversight/children/[studentId]/conversations` | GET | A |  |
| `/api/v1/parent/oversight/children` | GET | A |  |
| `/api/v1/payments/[id]/receipt` | GET | A |  |
| `/api/v1/payments/[id]` | GET,PATCH | A |  |
| `/api/v1/payments/initiate` | POST | A |  |
| `/api/v1/payments/intents/[id]/mock-complete` | POST | A |  |
| `/api/v1/payments/intents/[id]` | GET | A |  |
| `/api/v1/payments/parent-wallet-topup/initiate` | POST | A |  |
| `/api/v1/payments/paymob/webhook` | POST | A |  |
| `/api/v1/payments` | GET,POST | A |  |
| `/api/v1/payments/wallet-topup/initiate` | POST | A |  |
| `/api/v1/realtime/token` | GET | A |  |
| `/api/v1/reports/attendance-by-course` | GET | A |  |
| `/api/v1/reports/course-fill-rates` | GET | A |  |
| `/api/v1/reports/enrollment-funnel` | GET | A |  |
| `/api/v1/reports/expenses-timeseries` | GET | A |  |
| `/api/v1/reports/expenses` | GET | A |  |
| `/api/v1/reports/net-profit` | GET | A |  |
| `/api/v1/reports/revenue-timeseries` | GET | A |  |
| `/api/v1/reports/revenue` | GET | A |  |
| `/api/v1/reviews/[id]` | PATCH | A |  |
| `/api/v1/reviews/eligible` | GET | A |  |
| `/api/v1/reviews` | GET,POST | A |  |
| `/api/v1/rooms/[id]/photos` | POST | A |  |
| `/api/v1/rooms/[id]` | DELETE,PATCH | A |  |
| `/api/v1/rooms/per-student-availability` | GET | A |  |
| `/api/v1/rooms` | GET,POST | A |  |
| `/api/v1/roster/students/[studentId]` | DELETE,GET,PATCH | A |  |
| `/api/v1/roster/students/invite` | POST | A |  |
| `/api/v1/roster/students/lookup` | POST | A |  |
| `/api/v1/roster/students` | GET,POST | A |  |
| `/api/v1/roster/teachers/[teacherId]` | DELETE | A |  |
| `/api/v1/roster/teachers/invite` | POST | A |  |
| `/api/v1/roster/teachers/lookup` | POST | A |  |
| `/api/v1/roster/teachers` | GET | A |  |
| `/api/v1/search/centers` | GET | C | public discovery; `use cache` keyed on normalized filters, short profile (~60s), collapses concurrent identical queries |
| `/api/v1/search/courses` | GET | C | same, but respect `?studentId=` scope resolution — only the anonymous/unnarrowed branch is cacheable |
| `/api/v1/search/teachers` | GET | C | same as search/centers |
| `/api/v1/sessions/[id]/attendance` | GET,PUT | A |  |
| `/api/v1/sessions/[id]/cancel` | POST | A |  |
| `/api/v1/sessions/[id]/complete` | POST | A |  |
| `/api/v1/sessions/[id]/postpone` | POST | A |  |
| `/api/v1/sessions/[id]` | GET | A |  |
| `/api/v1/sessions` | GET | A |  |
| `/api/v1/subjects` | GET | C | public catalog read; route through the cached catalog reader (tag `catalog`, existing CATALOG_CACHE_LIFE) |
| `/api/v1/subscriptions/[id]/cancel` | POST | A |  |
| `/api/v1/subscriptions/checkout` | POST | A |  |
| `/api/v1/teacher/assistants/[id]/invite` | POST | A |  |
| `/api/v1/teacher/assistants/[id]` | DELETE | A |  |
| `/api/v1/teacher/assistants` | GET,POST | A |  |
| `/api/v1/teacher/attendance-mode` | GET,PATCH | A |  |
| `/api/v1/teacher/attendance/sync` | POST | A |  |
| `/api/v1/teacher/blacklist/[id]` | DELETE | A |  |
| `/api/v1/teacher/blacklist` | GET,POST | A |  |
| `/api/v1/teacher/temp-students` | POST | A |  |
| `/api/v1/teacher/wallet/payout-request` | POST | A |  |
| `/api/v1/teacher/wallet/payouts` | GET | A |  |
| `/api/v1/teacher/wallet` | GET | A |  |
| `/api/v1/teacher/wallet/transactions` | GET | A |  |
| `/api/v1/teachers/[teacherId]` | GET | C | public teacher profile incl. reviews aggregate; `use cache` keyed on id, tag `teacher-profile:{id}`, profile ~minutes |
| `/api/v1/teachers/me/photo` | DELETE,GET,POST | A |  |
| `/api/v1/team-notes/[id]` | DELETE,PATCH | A |  |
| `/api/v1/team-notes` | GET,POST | A |  |
| `/api/v1/temp-students/[id]/send-invite` | POST | A |  |
| `/api/v1/temp-students/claim` | POST | A |  |
| `/api/v1/temp-students` | POST | A |  |