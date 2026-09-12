# SuperAdmin Full Audit — Phase 1 Report

Date: 2026-09-01. Scope: `apps/superadmin` (401 TS/TSX files, 211 `route.ts` files → 252 HTTP handlers, 65 feature files, 44 pages/layouts) plus the shared kit it consumes (`packages/ui`, `packages/server-core`). Read-only audit — **no code was changed by the audit pass itself**; fixes landed later are recorded in the Remediation log below and in each item's note.

Method: six parallel audit passes (surface map, UI action states, DB write integrity, DRY/architecture, performance, accessibility), followed by manual verification of the highest-impact claims (the broken nav-badge resource, the deletion-queue shared note, the unaudited accountants route, and the money-write/invariant contradiction were each re-checked against the source directly).

**Overall verdict:** the app is structurally healthy. Authorization is uniform (every write route calls `requireRole`, fails closed), the error envelope is consistent (`withErrors` on 208/211 routes, no raw Prisma leaks), validation is near-universal (zod `.strict()`, bounded strings, shared money schema), multi-write services run in real transactions, and the payout engine is exemplary on races. The findings below are the exceptions — concentrated in (a) audit-trail gaps, (b) a handful of client-side state bugs, (c) a large duplicated client layer that has already drifted, and (d) ~26% of API endpoints with no UI caller.

Checkbox legend: `[ ]` = not fixed, `[x]` = fixed and verified. Cross-refs use the IDs below.

---

## Remediation log — 2026-09-01

Fixed and verified this session: **C-1**, **C-2**, **H-3**, **M-9**, **M-13**, **M-14**,
**H-9**, **M-17**.

**H-3 is DONE — corrected 2026-09-05.** This log said "53 of 56" and ticked
`decideCollaborationRequest` by name; the independent verification
([VERIFICATION_REPORT.md](VERIFICATION_REPORT.md) §1 H-3) found four sites in
`center-control.ts` still writing their audit row in a SECOND transaction after the
mutation had committed (`decideCollaborationRequest` approve and reject,
`removeStudentFromCenter`, `restoreStudentToCenter`). Those four were fixed on
2026-09-05 by adding `acceptCollaborationRequestTx` / `rejectCollaborationRequestTx`
and joining them, with the existing blacklist `…Tx` variants, to the wrapper's own
transaction. The honest tally is **49 of 49** wrapper call sites, with `adminBroadcast`
the sole structural exception (it has no DB write of its own); the "56" denominator
counted seven walk-in / counter / temp-student wrappers that were deleted with their
routes. Proven by `tests/db/h3-audit-atomicity.test.ts`, now **42/42**, with a
trigger-blocked case for each of the four sites and the original negative control.

**C-4 is DONE — corrected 2026-09-05.** This log said "PLAN ONLY, nothing applied".
Migration `20260902120000_dedupe_guards` exists, creates exactly the three planned
indexes, and is **applied to dev, test AND production** (measured read-only
2026-09-05: `prisma migrate status` 71/71 on all three, `verify-db` 28/28 on all
three, `expected-db-shape.json` at 71). Proof suite
`tests/db/c04-dedupe-guards.test.ts` 19/19 on the test branch. Nothing is committed.

**C-3 untouched** — it is your decision, not a code fix.

Checks: `check-types` 9/9 · eslint 0 new issues in touched files · unit 106/106 (superadmin)
and 1488 passed / 1 skipped (erp) · `bun run build` 3/3 apps · DB suites on the test branch
263/263 across the five center-parity suites, plus `refund` 13, `wallet-refund` 8,
`h3-refund-race` 6, `c01-zero-wallet-refund` 9, `commission-audit` 6.

Three suite failures were confirmed **pre-existing, not caused by these changes**:
`h2-payout-floor` (its fixture needs a `teacher_profiles` row; the test branch has 0),
`catalog-onboarding` in erp (dies at line 112 in `getCatalogTree()` on
`cacheTag() is only available with the cacheComponents config`, far before the edited
lines — so that file's changes are type-checked but not runtime-exercised), and
`c01-zero-wallet-refund` + `commission-audit` failing only inside a 10-suite batch while
passing alone (the known shared-DB census interference).

---

## CRITICAL

### C-1 — Accountant creation is completely unaudited (and the only route with inline DB writes)
- [x] `apps/superadmin/src/app/api/v1/admin/accountants/route.ts:22-46`

Creates a privileged back-office account (role `accountant`, active, password set) with **zero** `audit_logs` row; `User.create` is not in the auto-audit `AUDITED` map either. This is the single most privileged unaudited mutation in the app, directly against the "every superadmin write is audited" convention. It is also the only route in the app that writes to the DB inline instead of through a service.

**Fix:** move the logic into a service; wrap creation + `tx.auditLog.create` in one transaction.

> **DONE 2026-09-01.** `createAccountant()` in `src/lib/services/admin/accountants.ts`: the
> duplicate check, `user.create` and an `accountant.created` audit row (actor + full
> after-state) commit together or not at all. The route is now guard → parse → service.
> `tests/unit/route-admin-guard.test.ts` asserts the audit row is created on the SAME tx
> object as the user row.

### C-2 — Second, weaker suspension path: no reason, no self-protection, no role restriction
- [x] `apps/superadmin/src/app/api/v1/admin/users/[id]/permissions/route.ts:22` → `updateUserStatus` at `apps/superadmin/src/lib/services/admin/platform.ts:448-457`

Duplicates `PATCH /users/[id]/status` → `setUserSuspended` (`admin-users.ts:166`) but drops every safeguard the primary path has: no `refuseSelf` (a super_admin can suspend their own account), no required reason, no target-role restriction (can suspend another super_admin), no already-in-state check, and a vaguer audit action (`user.status_changed` vs `user.suspended` + reason). The endpoint currently has **no UI caller** (see L-9), which makes it pure attack/mistake surface.

**Fix:** route through `setUserSuspended`, or delete the PATCH handler entirely (GET can stay if the permissions screen ever ships).

> **DONE 2026-09-01** — PATCH deleted, GET kept. Suspension now goes only through
> `setUserSuspended`. `updateUserStatus` is deliberately LEFT in `platform.ts` because
> `tests/db/c03-status-revocation.test.ts` uses it as the token-version proof; with the
> route gone it is unreachable over HTTP. Say if you want it deleted and that test
> repointed at `setUserSuspended`.

### C-3 — Money-write surface contradicts the binding "money is read-only in the back office" invariant — DECISION NEEDED, not a code fix
- [ ] `apps/superadmin/src/lib/services/admin/center-money.ts:6-19` + 8 routes under `admin/centers/[id]/money/**`

The module imports and executes real money movers from server-core (`recordPayment`, `topUpWalletCash`, `createWalkInSubscription`, `requestCenterPayout`, expenses CRUD) under `superadminAsCenter`. Verified: `docs/architecture/superadmin-center-parity.md` §10 documents these 13 ops as **deliberate**, audited, and tested (48/48 in `tests/db/center-money.test.ts`), and the code itself reuses the sanctioned flows correctly. But CLAUDE.md's binding invariant still says "no back-office module imports a money service", and the 2026-08-20 qualifier blessed money movement only via view-as into the ERP. The invariant text and the shipped code cannot both be right, and the invariant is what reviewers rely on to skip re-auditing money paths here.

**Fix (yours to decide):** either amend `docs/decisions/superadmin-center-oversight.md` + CLAUDE.md to record the counter-parity ops as a sanctioned second exception, or remove the write half of the money routes. No code should change until you choose.

### C-4 — Duplicate-row races on tables missing unique constraints (one is money-relevant)
- [x] `linkTeacherCenter` — `apps/superadmin/src/lib/services/admin/platform.ts:309-331`: `findFirst`-then-`create` with no unique on `center_teacher_affiliations (center_id, teacher_id)` (verified absent in migrations). Concurrent double-submit → two active affiliations; `centerShare` is later read via `findFirst`, so **which row prices the revenue split is arbitrary**.
- [x] `linkParent` — `platform.ts:392-416`: same shape, no `(parent_id, student_id)` unique on `parent_student_links`.
- [x] `updateWalletPolicy` — `apps/superadmin/src/lib/services/settings/wallet-settings-admin.ts`: singleton via `findFirst` with no unique; two concurrent first-PUTs create two policy rows and readers pick one arbitrarily.

**Fix:** partial/composite unique indexes, same pattern `commission_settings` already uses (`commission_one_global` etc.). Schema change → will be presented as its own migration plan for approval first, per project rules.

> **PLAN WRITTEN 2026-09-01 — [MIGRATION_PLAN_C4.md](MIGRATION_PLAN_C4.md).** Measured
> read-only that day: ZERO duplicates in dev, test AND production on both pairs, and one
> `wallet_settings` row each in dev/production — so no dedup backfill was needed.
>
> **APPLIED — status corrected 2026-09-05.** The paragraph above stood as "no migration
> file created, nothing applied" for three days after it stopped being true. Migration
> `20260902120000_dedupe_guards` creates `center_teacher_affiliation_one_live` (partial
> on `status IN ('pending','active')`), `parent_student_link_one_live` (partial on
> `('pending','approved')`) and `wallet_settings_one_row` (`((true))`), and is applied to
> **dev `ep-withered-field-b23csnyq`, test `ep-morning-snow-b269im2n` and production
> `ep-mute-rice-b2s8gg42`** — 71/71 migrations and `verify-db` 28/28 on each, measured
> 2026-09-05. `schema.prisma` deliberately carries only comments (Prisma cannot express a
> partial or expression index; `prisma migrate dev` will propose dropping them — refuse).
> Services: `linkTeacherCenter` is a direct `create` + `isUniqueViolation` → domain
> `ConflictError`; `linkParent` catches P2002 on create; `updateWalletPolicy` retries once
> on `WALLET_SETTINGS_ONE_ROW`. Index names live in
> `packages/server-core/src/db/unique-indexes.ts`. Proof:
> `tests/db/c04-dedupe-guards.test.ts` 19/19 (real concurrent races, partial-ness, no
> orphan audit row). The same class of race on `blacklist_entries` and on proposed
> `teacher_agreements` was NOT in this finding; it is planned separately in
> [MIGRATION_PLAN_C5.md](MIGRATION_PLAN_C5.md) (plan only, awaiting approval).

---

## HIGH

### H-1 — Registrations nav badge is silently broken (unmapped Refine resource → request to a nonexistent endpoint)
- [ ] `apps/superadmin/src/components/refine/dashboard-shell.tsx:101-105` uses `useList({ resource: "admin-registrations" })`; `RESOURCE_MAP` in `src/lib/refine/data-provider.ts:30-52` has no such key, so `resolveResource` falls through to the raw name and the badge requests `GET /api/v1/admin-registrations` — a route that does not exist. Verified directly. The pending-registrations count silently shows 0 (and the failed query likely fires the provider's error toast on superadmin pages).
- [ ] Same stale names declared as Refine resources in `src/components/providers/app-providers.tsx:17-20` (`admin-centers`, `admin-teachers`, `admin-students`, `admin-registrations`) — unmapped and unused.
- [ ] Compounding: the real endpoint's service `listRegistrations` (`src/lib/services/admin/platform.ts:22-58`) is **unbounded** (no `take` on the centers half) and returns full rows + admins + teachers just to render a number, refetched on every page focus.

**Fix:** correct the resource name; add a dedicated count endpoint (`center.count` + `user.count`) for the badge; cap `listRegistrations` regardless (see M-16).

### H-2 — Deletion queue shares ONE note state across every row: rejecting row B can submit row A's note
- [ ] `apps/superadmin/src/features/admin/deletion-queue-screen.tsx:57,215-225,259-260` — verified: a single `note` `useState` is bound to every pending row's textarea (typing under row A mirrors into all rows), the reject button of any row submits it, and the same note silently rides into the approve dialog. A destructive, audited decision can be recorded with the wrong justification text.

**Fix:** key note state per row, or move the textarea into the confirm dialog only.

### H-3 — Audit rows written AFTER commit in six wrapper services — a crash loses the audit trail the decision doc guarantees
- [x] `apps/superadmin/src/lib/services/admin/center-money.ts:29-46` — 8 / 8
- [x] `center-people.ts:43-60` (13/13), [x] `center-academic.ts:30-47` (8/8), [x] `center-operations.ts:47-64` (11/14 — 3 documented below), [x] `center-platform.ts:17-43`
- [x] `teacher-agreements-admin.ts:10-31`, [x] `decideCollaborationRequest` (`center-control.ts:305-343`)

`docs/decisions/superadmin-center-oversight.md` §3 promises "a write cannot commit without its audit row (same transaction)" — true only in `center-control.ts` and `admin-users.ts`. The rest audit in a separate transaction after commit; a crash/timeout between the two leaves an unaudited superadmin mutation. Related: the auto-audit Prisma extension (`packages/database/src/extensions/index.ts:155-200`) both swallows audit failures (`catch {}`) and can write **phantom** audit rows for operations whose enclosing transaction later rolls back.

**Fix:** pass the audit write into the same `tx` (the shared services already accept one in several cases); one shared `writeAdminAudit(tx, actor, spec)` replaces the six copy-pasted `audit()` helpers (see M-9).

> **DONE 2026-09-01 — [docs/plans/h3-tx-split.md](../plans/h3-tx-split.md).**
> The shared `writeAdminAudit(tx, actor, spec)` replaced all six copy-pasted
> helpers (M-9), and the audit row now rides the mutation's own transaction at
> **49 of 49** wrapper call sites across the seven wrapper services (corrected
> 2026-09-05 — this paragraph and the table below said 53 of 56; see the
> correction at the end of this note).
>
> **The obvious fix was rejected as unsafe, and that is the point of the design.**
> Having the wrapper open one transaction for the delegated service to join would
> have put awaited network I/O inside an open Postgres transaction: 24 of the 42
> delegated services call `notify()` (SMTP + SMS + FCM + web-push), `sendMail`,
> `deliverInviteWhatsApp` or `sendStaffInvite` after their transaction commits —
> including `recordPayment`, `counterCheckin`, `topUpWalletCash` and
> `createWalkInSubscription`, the counter's hot path. It would have passed every
> local test, where all those channels are mocked, and failed in production
> against the 20 s transaction timeout on a pooled Neon connection.
>
> Instead each service was split the way the repo already splits them
> (`approveAgreementTx`, `settleSubscriptionFromIntentTx`, `generateSessionsTx`):
> a pure-DB `fooTx(tx, …)` plus a thin `foo(acting, …)` that opens the transaction
> and runs the I/O **after** commit, carried as deferred effects
> (`packages/server-core/src/db/effects.ts`). Every `foo` kept its exact signature
> and return value, so no ERP caller changed.
>
> | wrapper | in the mutation's tx |
> |---|---|
> | `center-academic.ts` | 8 / 8 |
> | `center-people.ts` | 13 / 13 |
> | `center-money.ts` | 8 / 8 |
> | `center-platform.ts` | 3 / 3 |
> | `center-control.ts` | 10 / 10 (6 / 10 until 2026-09-05 — see below) |
> | `teacher-agreements-admin.ts` | 3 / 3 |
> | `center-operations.ts` | 8 / 9 |
>
> **The one exception is structural, not skipped.** `adminBroadcast` has no
> database mutation at all; the write *is* the notification fan-out.
> (`adminRegisterWalkIn` and `adminResendWalkIn`, listed here earlier as the other
> two exceptions, were deleted together with `adminLookupStudents`,
> `adminSuggestSessions`, `adminCounterCheckin`, `adminCreateTempStudent` and
> `adminSendTempStudentInvite` and their routes, which is why the denominator
> fell from 56 to 49.)
>
> **Proven, not asserted:** `tests/db/h3-audit-atomicity.test.ts` (42/42) blocks
> `audit_logs` inserts with a trigger and shows the mutation is absent afterwards
> — for a roster write, an expense, and a course-plus-sessions creation — and
> carries a negative control in which the OLD shape leaves the roster row behind,
> unaudited.
>
> **Two bugs fell out of the work:** `sendTempStudentInvite` was awaiting
> `sendMail` INSIDE its transaction; and the `after` snapshots behind three audit
> rows were read on a separate connection, so they could record a pre-write value.
> Both fixed.
>
> **The auto-audit extension half** is also fixed
> (`packages/database/src/{context.ts,client.ts,extensions/index.ts}`):
> `withTenant`/`withPlatformContext` register the active transaction in an
> AsyncLocalStorage, and the extension writes its row on THAT transaction inside a
> savepoint instead of opening a second top-level one. A rollback now takes the
> audit row with it; a rejected insert rolls back to the savepoint and is reported
> via `console.error` instead of `catch {}`. Proven against dev, before and after —
> old code: `{ noPhantomOnRollback: false }`;
> new code: `{ noPhantomOnRollback: true, rowWrittenOnCommit: true, txUsableAfterFailedAudit: true }`.
>
> **CORRECTION 2026-09-05 — the "10 / 10" for `center-control.ts` was wrong when it
> was written.** [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md) §1 H-3 traced every
> `writeAdminAudit` to its transaction and found four sites in that file still auditing
> in a SEPARATE transaction after the delegated service had committed on its own:
> `decideCollaborationRequest` (approve AND reject — the very item ticked by name above),
> `removeStudentFromCenter` and `restoreStudentToCenter`. Fixed the same day:
> `acceptCollaborationRequestTx` / `rejectCollaborationRequestTx` were added to
> `packages/server-core/src/services/collaboration/collaboration.ts` following the same
> `fooTx` + thin `foo` + deferred-effects split (expiry is returned as an outcome so the
> expired mark still commits before the refusal), and all four wrappers now open one
> `platformDb`, call the `…Tx` variant, write the audit, and run effects after commit.
> No caller signature changed. The suite gained a trigger-blocked case per site
> (16 → 42 assertions).
>
> **M-9 was also not finished** when the line above said "all six copies gone": three
> OLDER local audit helpers in `platform.ts`, `admin-users.ts` and `rooms-split.ts` (each
> its own `tx.auditLog.create`, no `beforeState`) and a dead `audit()` in
> `center-academic.ts` survived. All four were replaced by `writeAdminAudit` on
> 2026-09-05 (34 call sites, before-state recorded wherever the previous row was already
> in hand).

### H-4 — Catalog admin tabs have no error state: a failed load renders as "catalog is empty"
- [ ] `apps/superadmin/src/features/admin/catalog/offerings-tab.tsx:204-209` and [ ] `requests-tab.tsx:196-201` — on query error, `rows.length === 0` shows the **"no data" EmptyState**, actively telling the operator the catalog/queue is empty when the load failed.
- [ ] `structure-tab.tsx` — no `isError` handling anywhere; failed queries render blank columns.
- [ ] `subjects-tab.tsx:147-151` — error renders as a bare "—" row.

**Fix:** add the `isError → EmptyState tone="error" + retry` branch already used by users/teachers/deletion-queue screens.

### H-5 — Hardcoded English user-facing strings across center-oversight (Arabic-first app, counter-staff audience)
Always-shown strings, not fallbacks:
- [ ] `academic-tabs.tsx:1064` `toast.success("Hall updated"/"Hall created")`; `:1078` DialogTitle "Edit hall"/"Add hall"; Save button
- [ ] `operations-tabs.tsx:652` `` `Sent to ${n} recipient(s)` ``
- [ ] `people-tabs.tsx:241-269,462-468,557,618,694-702,783-787,817` — invite/roster dialogs: "Send invite", "Add to roster", "Invite sent", "Staff member added — claim link emailed", "Create & send claim link", `${label} is required`, inline explanatory paragraphs
- [ ] `platform-tabs.tsx:44-48,72,381` — report labels ("Net profit", …), AlertTitle, "uuid" placeholder
- [ ] Lower-stakes: English-only fallback strings in ~14 catch blocks across the same files (violates the messageAr convention ERP established)

**Fix:** move to the next-intl dictionaries; sweep with a grep for string literals in JSX/toast calls in these four files.

### H-6 — Client infrastructure layer is a byte-identical fork of apps/erp — and has already drifted on a security-relevant file
- [ ] ~530 duplicated lines measured by `diff`: `src/lib/refine/` (data-provider 292 lines, router-provider 158, notification-provider, query-client, as-array/as-record — **diff = 0** vs ERP), `src/lib/i18n/` (format/keys/page-metadata identical), `src/lib/api/use-param-seed.ts`, `src/components/kit/confirm-dialog.tsx`, theme-toggle, and near-identical siblings.
- [ ] **The drift proof:** `src/lib/api/client.ts` — ERP's copy gained `SESSION_INTEGRITY_EVENT` handling (session_conflict / role_mismatch / session_expired detection on 401/403); superadmin still has the old bare `handle401`. A session-integrity improvement landed in one app and not the other — exactly how forked infra rots.

**Fix:** extract a shared client package (mirror of the server-core shim pattern that already works: superadmin's `src/lib/{http,validation,errors,db,rate-limit}` are one-line re-exports). Carry ERP's session-integrity handling into superadmin as part of the merge. Incremental: merge `client.ts` first (real behavioral gap), then the refine providers.

### H-7 — Keyboard-inaccessible clickable rows/cards, 8+ surfaces (WCAG 2.1.1) — one kit fix covers most
- [ ] `packages/ui/src/components/data-table.tsx:280,358` — shared `DataTable` `onRowClick` puts `onClick` on `<TableRow>`/card `<div>` with no `tabIndex`/`role`/`onKeyDown`. **One fix here repairs every consumer in both apps.**
- [ ] Per-screen copies of the same pattern: `collaboration-requests-screen.tsx:204`, [ ] `payment-intents-screen.tsx:214`, [ ] `subscriptions-screen.tsx:195`, [ ] `whatsapp-messages-screen.tsx:174`, [ ] `notifications-screen.tsx:232` (clickable Card that also **marks the notification read** — a state change unreachable by keyboard).

**Fix:** copy the in-repo reference pattern `users-screen.tsx:202-214` (`tabIndex={0}`, role, aria-label, Enter/Space handler).

### H-8 — No debounce on search inputs: one HTTP request + full re-render per keystroke (7 screens)
- [ ] `subscriptions-screen.tsx:138`, [ ] `payment-intents-screen.tsx:143`, [ ] `whatsapp-messages-screen.tsx:101`, [ ] `teachers-screen.tsx:52-60` (also swaps the whole table for a spinner per keystroke), [ ] `messaging-screen.tsx:149-157`, [ ] `collaboration-requests-screen.tsx:62-72`, [ ] `contact-inbox-screen.tsx:104-107`

Server cost is doubled: subscriptions search runs two 500-row `searchText` scans per request (`subscriptions-admin.ts:44-58`). The correct pattern already exists in-repo twice: `users-screen.tsx:81-84` (300ms) and `useDebounced` in `use-global-search.ts:26-33`.

**Fix:** extract `useDebounced` to a shared hook (or add `debounceMs` to `SearchInput`), wire the 7 screens.

### H-9 — Refund clawback surfaces as a raw 500 when the wallet can't cover it
- [x] `apps/superadmin/src/lib/services/finance/refunds.ts:155-178` — teacher/center wallet decrements are unconditional; if the beneficiary was already paid out, the DB CHECK (`*_wallet_balance_nonneg`) aborts the tx — correct money outcome, but SQLSTATE 23514 is unmapped in `toErrorResponse` → the accountant sees `500 Internal error` instead of a clean 422 explaining the wallet can't cover the clawback. `settlePayout` (`payouts.ts:240-254`) already does this right with a conditional `updateMany`.

**Fix:** conditional decrement + domain error, mirroring `settlePayout`.

> **DONE 2026-09-01.** Both decrements are now `updateMany … where walletBalance >= net`
> + `BusinessRuleError` (422). The refund is still refused, never partially applied — only
> the reporting changes, and the message says what to do instead. The `center_held` branch
> still goes through `creditMove` and was not touched.

---

## MEDIUM

### UI states
- [ ] **M-1 Double error toast on ~25 mutation sites** — Refine's fallback `errorNotification` fires the provider toast AND the screen's own catch toasts the same message (`wallet-settings-screen.tsx:67-68`, `feature-flags-screen.tsx:51-52`, `teachers-screen.tsx:82-83`, `user-detail-screen.tsx:210-211`, `control-actions.tsx:75`, `money-actions.tsx:67`, oversight tabs, `deletion-queue-screen.tsx:85`, `contact-inbox-screen.tsx:77-78`, more). Fix once via the shared mutation hook (M-8) or provider-level filtering.
- [ ] **M-2 `teachers-screen.tsx:194-210`** — attendance-mode `<select>` has no pending state: not disabled during PATCH, shows stale value mid-flight, second change can race the first.
- [ ] **M-3 `structure-tab.tsx:292-303`** — unlink-track button + link-track Select ignore the `busy` flag; double-click fires the DELETE twice.
- [ ] **M-4 `security-screen.tsx:194,201-235,120-121`** — `void authClient.getSession().then(...)` with no catch (2FA section silently renders nothing on failure); thrown network errors in `start()`/`confirm()` escape without a toast; sessions load failure has no retry and `null` renders nothing.
- [ ] **M-5 `student-card-panel.tsx:50-62`** — `run` swallows the error instead of rethrowing, so the ReasonDialog closes on failure and loses the typed reason (contrast `user-detail-screen.tsx:246-249` which rethrows precisely to keep it open).
- [ ] **M-6 `messaging-screen.tsx:410-420`** — report resolve has no success toast; only feedback is the row changing after refetch.
- [ ] **M-7 Server field-level validation never reaches the form** — `mapError`/`localizeApiError` carry `fields`, no screen renders them; a 422 collapses to a generic toast. This is the QuerySection/messageAr convention gap vs ERP (1 full QuerySection usage vs ERP's 28).

### DRY / architecture
- [ ] **M-8 The mutation dance is re-rolled ~20 times** (58 `toast.success`, 81 `toast.error`, 62 `refetch()`, 44 busy-flag states) while THREE partial local abstractions already exist (`useMoneyMutation` in `money-actions.tsx:52-70`, `useCatalogMutation`, `useAdminGet`). Build one `useAction({url, method, successMsg})` hook returning `{run, busy}` with messageAr-aware error toasting + invalidation; also resolves M-1.
- [x] **M-9 The `audit()` helper is copy-pasted 6 times** — `center-people.ts:35-59`, `center-academic.ts:22-30`, `center-money.ts:21-29`, `center-operations.ts:39-47`, `center-platform.ts:17-26`, plus `writeAudit` in `center-control.ts:31`; 46+ call sites. One `writeAdminAudit(tx, actor, spec)` — pairs with H-3. **DONE 2026-09-01, completed 2026-09-05:** the six `center-*` copies were replaced on 2026-09-01 by one `writeAdminAudit(tx, actor, spec)` (+ a `recordAdminAudit(actor, spec)` convenience) in `packages/server-core/src/audit/admin-audit.ts`, re-exported through the app's usual shim. Three OLDER independent helpers (`platform.ts`, `admin-users.ts`, `rooms-split.ts`) and a dead `audit()` in `center-academic.ts` were outside that count and survived until 2026-09-05; they are gone now, and `writeAdminAudit` accepts a bare `{ id }` actor plus an optional caller IP so those files could adopt it without faking a session.
- [ ] **M-10 List-screen scaffolding re-implemented ~16 times** while the shared TanStack `DataTable` (`packages/ui`, 496 lines: sorting/selection/pagination) has only 5 consumers; 7 screens repeat the identical `useList` + q/status/page + `Math.ceil(total/20)` shell; 7 duplicate a `Record<string, StatusTone>` map. Build `useListScreen` + a `ListShell`, share `statusTone()`.
- [ ] **M-11 react-hook-form adoption is ZERO** while `@repo/ui/components/form.tsx` (RHF + zod resolver) exists and ERP uses it in 16 files; ~19 dialogs hand-roll `useState<Record>` field state; `entity-dialog.tsx:71-73` re-implements required-field validation. Extend `EntityDialog` (only 2 consumers today) and adopt RHF for complex dialogs.
- [ ] **M-12 Pagination parse/clamp re-rolled in 10 service files** (25 occurrences) with inconsistent caps (`PAGE_MAX=100` vs `MAX_LIMIT=200`). One `parsePageLimit` in `@repo/server-core/validation/common.ts`.

### DB / server
- [x] **M-13 Points administration loses actor attribution** — `points-admin.ts:10,26,36,63`: all four write fns call `platformDb(fn)` without `{ actorId }` → auto-audit rows have `actor_id = NULL`; rule mutations are effectively anonymous. **DONE 2026-09-01:** all four pass `{ actorId }`; `updatePointsRule` and `deletePointsRule` gained the `adminId` their siblings already took, and `points/rules/[id]/route.ts` passes it.
- [x] **M-14 Catalog CRUD entirely unaudited** — `packages/server-core/src/services/catalog/catalog-admin.ts`: create/update across all entities, `deleteOffering` (hard delete, line 242), approve/reject subject requests — no audit rows, no actor ctx. **DONE 2026-09-01:** all 18 write functions take `actor: SessionUser`, run under `{ actorId }`, and write their audit row **in the same transaction** as the write with before/after state (`catalog.system_created`, `catalog.offering_deleted`, `catalog.subject_request_approved`, …). All 16 catalog routes pass the actor; `apps/erp/tests/db/catalog-onboarding.test.ts` updated for the new signatures.
- [ ] **M-15 Reason-less parallel path for center deactivation** — `POST /centers/[id]/toggle` → `toggleCenter` (`platform.ts:175-195`) suspends a center + all its admins with no reason and a thin audit, while `setCenterStatus` (`center-control.ts:52`) requires a reason, snapshots, and notifies. Endpoint has no UI caller (superseded by `/status`) — same one-mechanism concern as C-2. Candidate for removal (asking first, per rules).
- [ ] **M-16 Unbounded list reads** — `listRegistrations` (`platform.ts:22`, no `take` on the centers half; the "active" tab of the queue returns every active center); `teacherStatement` (`finance-reports.ts:81-89`) loads ALL session ids for a teacher into an `IN` clause with no date filter on the session fetch.
- [x] **M-17 3 sequential full-ledger aggregates in `platformKpis`** (`platform-dashboard.ts:192-200`) — wrap in `Promise.all`; Neon round-trips are the dominant cost. Same file `:112-127` (oldestBeneficiary) is 2 more sequential awaits. **DONE 2026-09-01:** `platformKpis` folds its 6 counts + 3 aggregates into one `Promise.all` (4 round-trips → 1). `oldestBeneficiary` was a ternary — only ONE of its two awaits ever ran, so `Promise.all` there would have ADDED a query; the name is instead resolved by a `LEFT JOIN` inside the existing parallel batch (`beneficiary_id` is polymorphic, so Prisma cannot join it), removing the sequential round-trip entirely.

### Accessibility
- [ ] **M-18 Sibling `<Label>` without `htmlFor`** — `requests-tab.tsx:225-302`, `offerings-tab.tsx:219-255`; div-as-label in `collab-request-dialog.tsx:190-195`. Programmatically unlabeled inputs.
- [ ] **M-19 `aria-sort` never set** on sortable headers — `packages/ui/src/components/data-table.tsx:204-241`; one-line kit fix, all tables both apps.
- [ ] **M-20 `security-screen.tsx:283`** — confirm-password `PasswordInput` has no accessible name at all.
- [ ] **M-21 Placeholder-as-label** on 8 filter bars + OTP inputs (`two-factor/page.tsx:55`, `security-screen.tsx:343`) + `deletion-queue-screen.tsx:220` textarea. Cheapest fix: `aria-label` prop on `SearchInput` defaulted from placeholder.
- [ ] **M-22 Zero `aria-invalid`/`aria-describedby` in the whole app** — form errors never associated with fields (the kit's Input already styles `aria-invalid:`; nothing sets it). Pairs with M-7/M-11.
- [ ] **M-23 Sidebar current page not announced** — `packages/ui/src/components/sidebar.tsx:518,684`: `data-active` only, no `aria-current="page"` (bottom nav does it right). One-line kit fix, all 9 portals.
- [ ] **M-24 Hand-rolled tabs without tablist semantics** — `messaging-screen.tsx:124-136`; Radix Tabs already in the kit.
- [ ] **M-25 Double `<h1>` per screen + headings mostly absent** — shell h1 (`app-shell.tsx:626`) + PageHeader h1 (`page-header.tsx:26`); `CardTitle` is a div so section titles aren't headings (8 real h2s across all features).

---

## LOW

- [ ] **L-1** `teacher-agreements/[id]/approve/route.ts:15` — `parseJson(...).catch(() => ({}))` swallows ALL validation failures, not just empty body: malformed `effectiveFrom` silently discarded, approval proceeds with `now()`.
- [ ] **L-2** Agreement decide races (`server-core/finance/agreements.ts:128-180`) — read-check-update; P2002 from the partial unique returns a generic 409 rather than a domain message; double-approve of the same proposal silently overwrites `approvedBy`.
- [ ] **L-3** `notify()` after commit has no failure isolation in callers (`approvePayout`, `refundLessonForStudent`, `setCenterStatus`, approve/reject center/teacher) — a committed write can surface as a 500 if the in-app notification insert throws. Wrap + log, as `sendMail` already is.
- [ ] **L-4** Impersonation audit written BEFORE `auth.api.impersonateUser` (`impersonate/route.ts:18-21`) — failure leaves an audit claiming a start that never happened.
- [ ] **L-5** `generateInvoice` (`server-core/finance/invoices.ts:90-91`) — `periodStart/End` unvalidated → `new Date("garbage")` → 500; no audit row / actor for an accountant-reachable write.
- [ ] **L-6** `adminMarkPaymentRefunded` (`center-money.ts:98-116`) — read-then-update; concurrent double-mark converges but writes duplicate audit rows.
- [ ] **L-7** `listAuditActions` (`audit-log.ts:88-95`) — Prisma in-memory `distinct` over an append-only table; `groupBy` is DB-side and exact. (Endpoint currently uncalled — see L-9.)
- [ ] **L-8** ConfirmDialog fire-and-forget — `packages/ui confirm-dialog.tsx:148-153`: closes immediately, no busy state, can't stay open on error; `offerings-tab.tsx:161`, `user-detail-screen.tsx:514,528`.
- [x] **L-9 Dead/uncalled endpoints — 55 of 209 v1 route files (~26%) have no client caller.** Whole subsystems with zero UI: points/gamification (4 routes), platform-wide blacklist (5), platform students directory (5), invoices incl. PDF + send-email (4), finance reports trial-balance/refunds/statements (4), finance transactions (2), walk-in/counter check-in family (7). Individually orphaned: 3 dashboard chart endpoints (`kpis`, `revenue-chart`, `user-growth-chart` — the dashboard only calls `decision-queue`), `audit-logs/actions`, `notifications/history`, `users/[id]/permissions` (see C-2), `messaging/messages/[id]` DELETE, `centers/[id]/toggle` (see M-15), `students/[studentId]/membership`, roster lookup ×2, session bulk attendance, money payment detail + refund, 5 of 17 oversight mirrors, `admin/accountants` POST (only way to provision an accountant, no UI), `finance/payouts/bulk-approve`, `finance/refunds`, `finance/dashboard/revenue-chart`. **Per your rules nothing gets deleted without asking** — this list is the menu: for each family, decide build-the-UI vs remove-the-route vs keep-deliberately. Several are also the unaudited/weak paths flagged above (C-2, M-15).
  **DONE 2026-09-05 — the twelve routes VERIFICATION_REPORT.md L-9 found with no caller
  were deleted** (`admin/centers/[id]/money/payments/[paymentId]/refund` POST,
  `admin/users/[id]/permissions` GET, `admin/whatsapp-messages/[id]`,
  `admin/subscriptions/[id]`, `admin/payment-intents/[id]`, `finance/payment-intents`
  and `/[id]`, `finance/subscriptions/[id]`, `finance/transactions/[id]`,
  `finance/dashboard/revenue-chart`, `finance/payouts/bulk-approve`, `finance/refunds`
  POST+GET), each re-checked for a literal or template caller in both apps first
  (0 hits; the only `revenue-chart` caller is the separate `admin/dashboard/revenue-chart`).
  Five service functions became unreferenced with them and went too:
  `bulkApprovePayouts`, `getTransaction`, `getUserPermissions`, `getPaymentIntent`,
  `getSubscription`. `security/csp-report` stays — it is the browser's CSP sink.
  Route files 200 → 188. The families this line lists as "whole subsystems with zero
  UI" (points, blacklist, students directory, invoices, finance reports, transactions)
  have since had their screens built and are no longer dead.
- [ ] **L-10** Misc UI polish: `subjects-tab.tsx:150` DataTable without `emptyState`; messaging role filter shows raw keys; notifications `markAllRead` unguarded; `use-tour-gate.ts:24-27` empty catch; Enter doesn't submit in most dialogs; `registrations-queue` approve is single-click while reject needs a reason; `offerings-tab.tsx:138` screen-wide busy for row toggles.
- [ ] **L-11** A11y misc: hardcoded English sr-only strings in kit (`spinner.tsx:9` "Loading", dialog/sheet "Close", data-table checkbox fallbacks); read-notification cards at `opacity-65` land near ~2.9:1 contrast; `structure-tab.tsx:204-217` row buttons handle Enter but not Space and nest interactive controls; two tight-but-passing contrast pairs (amber-on-amber-soft 4.59:1, table header 4.58:1 at 10px uppercase — zero margin).
- [ ] **L-12** Perf misc: `optimizePackageImports: ["@repo/ui"]` worth adding (`@repo/ui/components/charts` is a barrel re-exporting all 8 recharts files); catalog reference-data `staleTime` is a safe candidate but belongs to the explicitly post-launch caching pass — flagged, not recommended now.
- [ ] **L-13** `requireRole` called inline 442 times — a composed `withRole("super_admin", handler)` would save 2 lines × ~200 routes. Optional polish.

---

## Libraries — verdict: no new dependency is justified

Everything hand-rolled that a library should do is already covered by libraries **in the repo**: TanStack Table (installed, wrapped, under-used — M-10), react-hook-form + zod (installed via @repo/ui, unused — M-11), sonner toasts (used), exceljs/pdf-lib server-side (used), `@repo/ui/lib/format` dates (used, only 9 stray `new Date(` in features), server-core token-bucket rate limiter (shimmed correctly). The settlement export honors the "export runs the same service the screen runs" invariant. Recommendation: adopt what's installed; add nothing.

## Architecture — verdict: sound; the gap is a missing shared CLIENT kernel

Layering verified clean: 0 feature files import prisma, 0 services import React, pages are thin mounts (271 lines across 31 pages), routes → `withErrors` + `requireRole` → services → server-core → prisma. The server-side shim pattern works and has no duplication. The one structural gap is that there is a shared *server* kernel but no shared *client* kernel (H-6). Scale pressure points, addressed better by the M-8/M-10 abstractions than by folder moves: `academic-tabs.tsx` 1,114 lines, `people-tabs.tsx` 857, `centers-screen.tsx` 854, `operations-tabs.tsx` 792, `payouts-screen.tsx` 714.

## What is already solid (verified — do not re-fix)

- Authorization uniform: 209× super_admin-only + 31× finance guards, fail-closed; sessions re-check `users.status` + 2FA.
- Error envelope: `withErrors` on 208/211 routes, P2002→409, P2025→404, production masking; no raw Prisma leaks.
- Validation near-universal: `parseJson` + zod `.strict()`, `z.uuid()`, shared money schema (int piasters, cap).
- Transactions real: `platformDb`/`withTenant` interactive tx with COMMIT-window-safe retry; payouts/refunds/blacklist/deletion/move-student all single-tx.
- Payout engine exemplary on races: `updateMany where status='pending'` claims, conditional decrements + DB CHECKs, `FOR UPDATE` generation, idempotent requests via migration 70's unique.
- Error localization end-to-end (localizeApiError: offline/timeout/401-auto-signout/403/409/422/5xx, messageAr wins in Arabic); busy discipline in money/destructive flows (TwoStepCommit, reason dialogs that stay open on failure); 403 rendered as a distinct "denied" state; exports use `toast.loading` → same-id resolution; view-as detects popup blocking explicitly.
- A11y baseline strong: all 19 dialog surfaces on Radix (focus trap/Escape/return free), `lang`+`dir` per locale, global reduced-motion, systematic focus-visible, labeled header controls, `role="status"` skeletons/spinners, DataTable loading/error rows announced.
- No client N+1, no polling, oversight tabs gated by `enabled`, heavy libs server-only, detail payloads fetched on row-open only.

## No dead components

Every file in `src/features/**` and `src/components/**` has at least one importer. The dead weight is entirely on the API side (L-9).

---

## Proposed Phase 2 order (pending your approval)

1. **Critical DB/audit integrity:** C-1, C-2 (delete or reroute), C-4 (migration plan presented separately for approval), H-3 + M-9 (one shared tx-audit helper), M-13, M-14.
2. **C-3 decision** — your call on the invariant text vs the money routes; I only edit docs or code after you choose.
3. **Live UI bugs:** H-1 (badge), H-2 (deletion note), H-4 (catalog error states), M-2..M-6.
4. **Language sweep:** H-5.
5. **Shared abstractions, incremental with per-screen verification:** H-6 (client.ts merge first), M-8 (+M-1), M-10, H-8 (debounce hook), M-11, M-12.
6. **A11y kit fixes (each one fixes N screens):** H-7, M-19, M-21, M-23, then per-screen items.
7. **Perf:** H-9, M-16, M-17, L-7, L-12.
8. **Dead-endpoint decisions (L-9):** you pick keep/build/remove per family; I act on the picks.
9. Low bucket last.

Each fix = one focused commit (message text provided to you; you run git, per the binding git rule). Phase 3 runs lint/type-check/tests/build + manual verification of the critical flows.
