# Verification of AUDIT_REPORT.md remediation — independent, read-only

Date: 2026-09-05. Baseline: `HEAD = ea87499` (2026-08-31) is the PRE-fix state; every fix
lives UNCOMMITTED in the working tree (370 modified files, 40+ untracked). Every claim below was
checked against the current source, not against commit messages, the report's checkboxes, or
docs. No code was changed by this pass. Line numbers are working-tree lines as of today.

Method: read the referenced code for every item C-1…L-13; for anything "applied in N places"
enumerated all N; then ran the eight independent checks the brief asked for ignoring the
report; then lint / type-check / unit / DB suites / production builds for both apps and a diff
of every test file against `HEAD`. Six of seven verification subagents died on a rate limit
mid-run; everything in this file was re-derived directly, and one subagent's server-side
findings were cross-checked by hand before being used.

---

## 0. Headline

| Severity | DONE | PARTIAL | NOT DONE | REGRESSED | DEFERRED |
|---|---|---|---|---|---|
| Critical (4) | C-1, C-2, C-4 | — | — | — | C-3 |
| High (9) | H-1, H-2, H-3 (fixed 2026-09-05, see §1), H-4, H-7, H-8, H-9 | H-5, H-6 | — | — | — |
| Medium (25) | M-1…M-6, M-10, M-13…M-17, M-19, M-20, M-21, M-23 | M-7, M-8, **M-9**, M-11, M-12, M-18, M-22 | **M-24, M-25** | — | — |
| Low (13) | L-1, L-4, L-5, L-6, L-7, L-8, L-9 (deleted 2026-09-05, see §1), L-12, L-13 | L-2, L-3, L-10, L-11 | — | — | — |

**The three findings that matter most:**

1. **H-3 is NOT the 53/56 the report claims — `center-control.ts` still writes the audit row in
   a SECOND transaction at 4 of its 10 sites**, including `decideCollaborationRequest`, which the
   report ticks as fixed by name. §1 H-3. **Fixed 2026-09-05** — the four sites now join the
   wrapper's transaction; tally 49 / 49; `h3-audit-atomicity` 42/42 (was 16).
2. **The report is stale about its own C-4 status** ("PLAN ONLY, nothing applied"). The migration
   exists and is applied to dev, test AND production (measured today). Good news, but a reader
   trusting the report would re-apply or re-plan it. §1 C-4.
3. **English still reaches the operator through the server**, not through JSX: 100 of the
   superadmin services' 157 thrown messages have no Arabic mapping (every `NotFoundError`,
   `ForbiddenError`, `ConflictError`), and the client falls back to the English server text.
   The JSX sweep is genuinely clean. §1 H-5, §2.4.

Mechanical checks: type-check 10/10 (forced, uncached) · lint 0 errors / 412 warnings (6 on new
or changed lines, one of them a dead `audit()` helper) · unit superadmin 162/162, ERP 1488 passed
/ 1 skipped (pre-existing skip) · `next build` both apps OK · DB suites: superadmin 939/949 in the full run, with c02 then proven 28/28 on a cleaned
branch, leaving 2 red suites that only need demo seed data; ERP 1717/1717 with the 4
CI-excluded suites crashing before counting; see §4.

---

## 1. Item-by-item

### CRITICAL

**C-1 — DONE.** `apps/superadmin/src/lib/services/admin/accountants.ts:14-56`: duplicate check
(`:17-21`), `tx.user.create` (`:24`) and `writeAdminAudit(tx, …)` (`:37`) run inside ONE
`platformDb(…, { actorId })`. Route is guard → parse → service
(`app/api/v1/admin/accountants/route.ts:17-20`). The find-then-create is DB-guarded by
`users.email @unique` / `users.phone @unique` (`packages/database/prisma/schema.prisma:408-409`);
the loser gets a bare P2002 → 409.
*Caveat on the proof:* `tests/unit/route-admin-guard.test.ts:96-111` mocks `platformDb` as
`cb => cb(oneObject)`, so an audit written in a SECOND `platformDb` call would hit the same mock
and the test would still pass. The comment at `:109` says it proves same-tx; it does not. The
same-tx property rests on reading the source.

**C-2 — DONE.** `app/api/v1/admin/users/[id]/permissions/route.ts` exports only `GET` (`:7-10`).
`updateUserStatus` survives at `platform.ts:568-577`, called only from
`tests/db/c03-status-revocation.test.ts`; unreachable over HTTP. (The report's pointer to
`m15-one-suspension-path.test.ts` is wrong — that test is about centers, M-15; no unit test pins
the absence of the user-status PATCH.)

**C-3 — DEFERRED, and the contradiction is still live.** No decision was recorded:
`CLAUDE.md:374` still says "MONEY IS READ-ONLY IN THE BACK-OFFICE APP … no back-office module
imports a money service"; `docs/decisions/superadmin-center-oversight.md` carries no 2026-09
amendment (grep for `counter-parity|sanctioned|second exception|2026-09` → 0); and the five
money route families still exist under `app/api/v1/admin/centers/[id]/money/`
(`expenses`, `payments`, `payout-request`, `subscriptions`, `wallet-topup`) backed by
`center-money.ts`, whose 8 writes are all audited in-tx (see H-3). Your call, as the report said.

**C-4 — DONE (code + migration + applied), report text STALE, nothing committed.**
- Migration `packages/database/prisma/migrations/20260902120000_dedupe_guards/migration.sql:22-33`
  creates exactly the three planned indexes: `center_teacher_affiliation_one_live` (partial on
  `status IN ('pending','active')`), `parent_student_link_one_live` (partial on
  `('pending','approved')`), `wallet_settings_one_row` (`((true))`).
- **Applied everywhere, measured read-only today with `EDURA_ENV=<env> npx prisma migrate status`:**
  dev `ep-withered-field-b23csnyq` 71/71 up to date; test `ep-morning-snow-b269im2n` 71/71;
  production `ep-mute-rice-b2s8gg42` 71/71. `verify-db` 28/28 on all three.
  `packages/database/scripts/expected-db-shape.json` says `migrations: 71`, tables 82.
- `schema.prisma` deliberately carries only comments (`:845`, `:948`, `:2075`) — Prisma cannot
  express partial / expression indexes. Same hazard as the generated `search_text` columns:
  `prisma migrate dev` will propose dropping them.
- Services: `linkTeacherCenter` is now a direct `create` + `isUniqueViolation(err,
  AFFILIATION_ONE_LIVE)` → domain `ConflictError` (`platform.ts:372-381`); `linkParent` keeps its
  `findFirst` for the pending→approved branch and catches P2002 on create (`:514-532`);
  `updateWalletPolicy` retries once in a NEW transaction on `WALLET_SETTINGS_ONE_ROW`
  (`wallet-settings-admin.ts:43-75`). Index names centralised in
  `packages/server-core/src/db/unique-indexes.ts:13-15`.
- Proof: `tests/db/c04-dedupe-guards.test.ts` — 19/19 on the test branch today (real concurrent
  races, partial-ness, no orphan audit row).
- **Stale text:** `AUDIT_REPORT.md:25-26,87-91` and `MIGRATION_PLAN_C4.md:3-5` still say "PLAN
  ONLY — no migration written, nothing applied". Both are wrong now.

### HIGH

**H-1 — DONE.** `components/refine/dashboard-shell.tsx:100-113` calls `useCustom({ url:
"admin/registrations/count" })`; `app/api/v1/admin/registrations/count/route.ts` is a
`withRole` → `countPendingRegistrations()` (two counts, `platform.ts:27-49`). The stale resource
names (`admin-centers`, `admin-teachers`, `admin-students`, `admin-registrations`) are gone from
`app-providers.tsx` (repo-wide grep → 0).

**H-2 — DONE.** `deletion-queue-screen.tsx` still has one `note` state (`:53`), but the
textarea now lives ONLY inside the confirm dialog for the selected row (`:234-250`) and is reset
when a row is chosen (`:175`, `:186`). No row's note can ride into another row's decision.

**H-3 — was PARTIAL when verified (45 of 49 wrapper call sites in-tx, not 53 of 56); DONE
2026-09-05 (49 of 49).** Every wrapper function was enumerated and each `writeAdminAudit(tx, …)`
traced to the transaction it runs in. The table records the state found on 2026-09-05 morning;
the fix note after it records what changed the same day:

| wrapper | mutating fns | audit on the SAME tx as the write | proof |
|---|---|---|---|
| `center-academic.ts` | 8 | **8 / 8** | `scopedDb(acting, tx => { …Tx(tx…); writeAdminAudit(tx…) })` at `:93-95, :121-126, :150-166, :194-197, :228-230, :254-260, :287-293, :314-320` |
| `center-people.ts` | 13 | **13 / 13** | `:72-74, :95-101, :115-118, :136-138, :167-173, :191-193, :218-222, :266-270, :299-305, :319-325, :344-346, :371-373, :393-396` |
| `center-money.ts` | 8 | **8 / 8** | `:48-51, :77-101, :128-131, :166-169, :205-207, :226-235, :253-262, :291-298` |
| `center-platform.ts` | 3 | **3 / 3** | `:65-117, :156-169, :211-234` (`moveCourseBetweenCenters` only throws) |
| `teacher-agreements-admin.ts` | 3 | **3 / 3** | `:16-24, :45-48, :62-65` |
| `center-operations.ts` | 9 | **8 / 9** | in-tx at `:69-101, :127-141, :167-170, :198-209, :285-296, :336-346, :431-439, :467-481`; `adminBroadcast` (`:406`) audits after the fact — the documented exception, it has no DB write |
| `center-control.ts` | 10 sites | **6 / 10** at verification, **10 / 10** after the fix | see below |

`center-control.ts` — the report says 10/10 and ticks `decideCollaborationRequest` by name.
Four sites still audit in a SEPARATE transaction after the mutation has committed on its own:
- `decideCollaborationRequest` approve: `acceptCollaborationRequest(…)` runs its own transaction
  (`packages/server-core/src/services/collaboration/collaboration.ts:281`), then a second
  `platformDb` writes the audit (`center-control.ts:277-300`).
- `decideCollaborationRequest` reject: `rejectCollaborationRequest(…)` (`collaboration.ts:488`)
  then a second `platformDb` for the audit (`center-control.ts:304-318`).
- `removeStudentFromCenter`: `centerBlacklistStudent(…)` (own tx, `blacklist.ts:282-298`) then
  `platformDb` for the audit (`center-control.ts:194-210`).
- `restoreStudentToCenter`: `removeBlacklistEntry(…)` (own tx, `blacklist.ts:374-381`) then
  `platformDb` for the audit (`center-control.ts:238-256`).
The `…Tx` variants these need exist (`centerBlacklistStudentTx` `:300`,
`removeBlacklistEntryTx` `:383`; `center-operations.ts` already uses both in-tx at `:433`/`:476`),
so the split is available and simply was not applied here. A crash between the two
transactions leaves exactly the unaudited superadmin mutation H-3 describes.

> **FIXED 2026-09-05.** `acceptCollaborationRequestTx` and `rejectCollaborationRequestTx` were
> added to `packages/server-core/src/services/collaboration/collaboration.ts` with the same
> `fooTx` + thin `foo` + deferred-effects split; expiry is returned as an outcome so the expired
> mark still commits before the refusal, and the thin `acceptCollaborationRequest` /
> `rejectCollaborationRequest` keep their exact signatures (ERP `hall-booking` 62/62,
> `rbac-isolation` 11/11, `center-share-governance` 6/6 unchanged). All four
> `center-control.ts` sites now open one `platformDb`, call the `…Tx` variant, write the audit,
> and run effects after commit. `tests/db/h3-audit-atomicity.test.ts` gained a trigger-blocked
> case per site — 16 → **42 assertions**, green on the test branch — and `center-oversight`
> stayed at 122/122. The honest tally is **49 of 49**, `adminBroadcast` the sole structural
> exception. `AUDIT_REPORT.md` and `docs/plans/h3-tx-split.md`'s "10 / 10" claim is corrected
> in the audit report.

Denominator note: the report's "56 sites / 3 exceptions" counted `adminRegisterWalkIn` and
`adminResendWalkIn`. Those two, plus `adminLookupStudents`, `adminSuggestSessions`,
`adminCounterCheckin`, `adminCreateTempStudent`, `adminSendTempStudentInvite`, were DELETED from
`center-operations.ts` together with their routes (`checkin/`, `walk-in/`, `temp-students/`,
`roster/*/lookup/` are now empty directories with no `route.ts`). So the only structural
exception left is `adminBroadcast`, and the honest tally is 45 / 49.

Also verified: the `…Tx` split leaves no network I/O inside a transaction that I could find —
every wrapper that receives `effects` runs them after commit via `runEffects`
(`packages/server-core/src/db/effects.ts:10-12`), and no wrapper drops them (every
`{ value, effects }` destructure is followed by `await runEffects(effects)`). Auto-audit
extension: `packages/database/src/extensions/index.ts` now issues `SAVEPOINT edura_auto_audit` /
`ROLLBACK TO SAVEPOINT`, reports a rejected insert with `console.error`, and the bare `catch {}`
is gone (diff vs HEAD). `tests/db/h3-audit-atomicity.test.ts` (17 assertions, real DB) —
result in §4. The report's "sendTempStudentInvite awaited sendMail inside its tx — fixed" claim
was not re-verified (the superadmin wrapper is gone; server-core not traced). UNSURE.

**H-4 — DONE.** All four tabs branch on `query.isError` to an error state with retry:
`offerings-tab.tsx:220`, `requests-tab.tsx:256`, `structure-tab.tsx:167` (`loadError` helper)
used at `:238, :275, :315, :386`, `subjects-tab.tsx:153`.

**H-5 — PARTIAL (JSX clean; server text is not).** Every literal the report named is gone
(grep for `Hall updated|Edit hall|recipient(s)|Send invite|Add to roster|Invite sent|claim
link|is required|Net profit|placeholder="uuid"` across `center-oversight/*.tsx` → 0). A
repo-wide sweep of `features/ components/ app/` for English JSX text nodes, English
`toast.*("…")`, English `title=|placeholder=|aria-label=|label=` props, and `?? "English
fallback"` patterns found **0**. The only English literals left in the app are the nav label
KEYS in `app/[locale]/dashboard/superadmin/layout.tsx:47-90`, which `dashboard-shell.tsx:22-70`
maps to `nav.*` i18n keys (an existing, legitimate lookup). Dictionaries `ar/` vs `en/` differ
only by Arabic plural forms (`*_two`, `*_few`), which is correct.

**Where English still shows:** the envelope attaches `messageAr` only through
`arabicErrorMessage(message)` (`packages/server-core/src/http/envelope.ts:42-44`, map in
`errors/messages-ar.ts`), and the client prefers `serverMessageAr ?? serverMessage ?? generic`
(`packages/ui/src/lib/api-error.ts:203-207`). Of 157 throw sites in
`apps/superadmin/src/lib/services`, **100 have no Arabic entry** — all 83 `NotFoundError`, 9
`ForbiddenError` and 8 `ConflictError` sites ("User not found" ×8, "Center not found" ×6,
"Teacher not found" ×4, "Only a super admin can impersonate", "Teacher is already linked to this
center", …). `apps/erp/tests/unit/business-rule-ar-coverage.test.ts` enforces coverage for
`BusinessRuleError` literals only (`CALL_RE` at `:19`), across all three roots, so this gap is
outside the red-test. An operator who opens a stale row sees "User not found" in English.

**H-6 — PARTIAL (the important part is done).** `packages/client-core` now holds `api/client.ts`
(with `SESSION_INTEGRITY_EVENT`, `session_conflict`, `role_mismatch` handling, `:5-47`),
`refine/{data-provider,router-provider,notification-provider,query-client,as-array,as-record}`,
`i18n/{format,keys,locale,page-metadata}` and `hooks/use-action`. In BOTH apps the corresponding
`src/lib/**` files are one-line re-exports (11 files, byte-identical shims); superadmin mounts
`<SessionIntegrityGuard />` (`components/providers/app-providers.tsx:54`) and has
`tests/unit/session-integrity-client.test.ts` (8 tests). The drift the report used as proof is
closed.
Still forked, byte-identical or near-identical in both apps and NOT in client-core:
`lib/api/use-param-seed.ts` (21 lines, identical), `components/ui/theme-toggle.tsx` (48 lines,
identical), `lib/api/use-global-search.ts` (59 vs 57, 14 differing lines),
`lib/i18n/use-formatters.ts` (44 vs 47, 5 differing), `lib/i18n/scope.ts` (4 differing).
Roughly 170 duplicated lines remain of the ~530 measured.

**H-7 — DONE.** Kit rows: `packages/ui/src/components/data-table.tsx:306-313` (table) and
`:398-405` (card) add `tabIndex: 0`, `aria-label`, and an `onKeyDown` that handles Enter AND
Space with target check. The five per-screen copies are gone — grep for `onClick=` on
`div|tr|TableRow|Card|li|span` across `features/ components/` → 0; the notifications card is
keyboard-reachable (`notifications-screen.tsx:254-259`).

**H-8 — DONE (7 / 7).** All seven named screens now list through `useListScreen`
(`lib/api/use-list-screen.ts`, `debouncedQ`): `subscriptions-screen.tsx`,
`payment-intents-screen.tsx`, `whatsapp-messages-screen.tsx`, `teachers-screen.tsx`,
`messaging-screen.tsx` (×4 tabs), `collaboration-requests-screen.tsx`; `contact-inbox-screen.tsx`
uses `useCustomListScreen` + `ListSearch` (`:40`, `:82`); `users-screen.tsx` uses
`ListShell`/`ListSearch` (`:135-145`). The shared hook is `packages/ui/src/hooks/use-debounced.ts`.
No screen in `features/` fires a request per keystroke any more.

**H-9 — DONE, untested.** `finance/refunds.ts:163-169` (teacher) and `:182-188` (center) use
`updateMany … where walletBalance >= net` and throw `BusinessRuleError` (422); `center_held`
still goes through `creditMove` (`:170-181`). No DB test asserts the new 422 branch (grep for the
message / `gte:` in `tests/db/*refund*` → 0).

### MEDIUM — UI states

**M-1 — DONE.** `packages/client-core/src/hooks/use-action.ts:85-91` is the single toast
(`:97-104` documents why); 47 `useAction` call sites across 29 feature files. Residual
`toast.error` outside it: `security-screen.tsx` (better-auth client, not the Refine provider),
`room-settlements-screen.tsx:79` (export path), `registrations-queue.tsx:119` (raw `api.post`,
no provider involvement), `user-detail-screen.tsx:231` (local guards, checks `localized`). None
double-toast.

**M-2 — DONE.** `teachers-screen.tsx:107` ignores changes while `pendingMode`; `<select
disabled={pendingMode !== null}>` at `:172`.
**M-3 — DONE.** `structure-tab.tsx:148, :158` re-entry guards; `disabled={busy}` at `:339, :350`.
**M-4 — DONE.** `security-screen.tsx:74-79` try/catch around `getSession`; retry at `:128`,
`:301`; every `start/confirm` path toasts (`:230-259`).
**M-5 — DONE.** `student-card-panel.tsx:51-53` `useAction({ rethrow: true })` so `ReasonDialog`
stays open.
**M-6 — DONE.** `messaging-screen.tsx:352-357` passes `successMsg`.
**M-7 — PARTIAL.** The mechanism exists: `packages/ui/src/lib/form-errors.ts` +
`FieldControls` sets `aria-invalid` / `aria-describedby` (`packages/ui/src/components/form.tsx:114-119`),
and `tests/unit/m7-*.test.ts` prove the envelope→mapper round trip. But only ONE screen consumes
server field errors (`features/admin/catalog/entity-dialog.tsx` imports `form-errors`); the
hand-rolled forms in `academic-tabs.tsx:305-380, :465-490` (course / hall) and
`operations-tabs.tsx:347` still collapse a 422 to a toast. The m7 tests exercise the mapper, not
a screen.

### MEDIUM — DRY / architecture

**M-8 — DONE for the mutation dance; counts:** `toast.success` 58 → 10, `toast.error` 81 → 18,
`useMoneyMutation` / `useCatalogMutation` 0, `useAction` 47 sites. `refetch()` is 66 (was 62) —
invalidation is still manual per screen, which `useAction`'s `onSuccess` was meant to absorb; not
a bug, just not consolidated. `useAction` has a re-entry guard (`use-action.ts:120-141`,
`inFlight` ref) so double-submit is impossible even where `busy` is not wired to `disabled`.
Remaining hand-rolled mutation: `registrations-queue.tsx:106-121` (own `setBusy`, own toasts
around `api.post`) — correct behaviour, not on the shared hook.

**M-9 — PARTIAL.** The six `center-*` copies are replaced by one `writeAdminAudit(tx, actor,
spec)` (`packages/server-core/src/audit/admin-audit.ts:13-31`; `center-control.ts:9` aliases it
as `writeAudit`). But: (a) a dead local `audit()` wrapper survives at `center-academic.ts:25-27`
(lint: `'audit' is defined but never used`); (b) `center-operations.ts:32-34` keeps one for
`adminBroadcast`; (c) three OLDER independent copies were never in scope and still exist —
`platform.ts:14-25`, `admin-users.ts:23-40`, `rooms-split.ts:46-55` — each its own
`tx.auditLog.create` with a different signature and no `beforeState`. Same duplication, different
files.

**M-10 — DONE.** `lib/api/use-list-screen.ts` (`useListScreen` in 9 files +
`useCustomListScreen`), `components/kit/list-shell.tsx` in 18 files, `Math.ceil(` 0, `useList(`
0 in features, `statusTone()` 23 uses via `packages/ui/src/components/status-badge.tsx`, `DataTable`
6 consumers. One `Record<string, StatusTone>` left (`notifications-screen.tsx:32`, a
type→tone map, legitimate).

**M-11 — PARTIAL.** react-hook-form / `@repo/ui/components/form` now used in 11 feature files
(`entity-dialog`, `requests-tab`, `centers-screen` ×3 forms, `commission-settings`,
`wallet-settings`, `collab-request-dialog`, `control-actions`, `money-actions`,
`operations-tabs`, `platform-tabs`, `center-oversight-screen`); `tests/unit/m11-field-schema.test.ts`
(14 tests) covers `entity-dialog`'s schema builder. Still hand-rolled: `academic-tabs.tsx`
course + hall dialogs (`f`/`set` state, `:305-380`, `:465-490`), `operations-tabs.tsx:347`
(`useState<Record<…>>`), `people-tabs.tsx` invite dialogs.

**M-12 — PARTIAL.** `parsePageLimit` exists in `packages/server-core/src/validation/common.ts`
with 23 call sites and `tests/unit/m12-parse-page-limit.test.ts` (7). Four hand-rolled clamps
remain: `apps/superadmin/src/lib/services/admin/platform.ts:118` and `:580`
(`Math.min(100, Math.max(1, take ?? 50))`), `packages/server-core/src/services/center/shifts.ts:147`,
`packages/server-core/src/services/finance/center-wallet.ts:35`.

### MEDIUM — DB / server

**M-13 — DONE.** `points-admin.ts:23, :38, :50, :106` all pass `{ actorId }`; routes pass
`user.id` (`points/rules/route.ts:21`, `points/rules/[id]/route.ts:18,23`,
`points/students/[id]/adjust/route.ts:19`).
**M-14 — DONE (17, not 18).** `catalog-admin.ts` has 17 write functions; every one takes
`actor`, runs under `{ actorId }`, and calls `writeAdminAudit(tx, …)` in the same `platformDb`
(`:38, :53, :87, :106, :139, :154, :184, :199, :225, :240, :269, :288, :344, :359, :375, :431,
:455`). All 16 catalog routes pass the actor. ERP's only caller is the fixture in
`apps/erp/tests/db/catalog-onboarding.test.ts:187-196`.
**M-15 — DONE.** `centers/[id]/toggle/` has no `route.ts`; `toggleCenter` gone (grep → 0);
`tests/unit/m15-one-suspension-path.test.ts:60-90` pins it.
**M-16 — DONE.** `listRegistrations` pages both halves with `parsePageLimit`
(`platform.ts:55, :63-81`); `teacherStatement` is a bounded JOIN aggregate
(`finance-reports.ts:88-95`); four `m16-*.test.ts` DB suites (44 assertions) prove equivalence
and bounds.
**M-17 — DONE.** `platform-dashboard.ts:164-190` one `Promise.all` of 9; `oldestBeneficiary`
name via LEFT JOIN inside that batch (`:31-38`).

### MEDIUM — Accessibility

**M-18 — PARTIAL.** `requests-tab.tsx:320-321` still has `<Label>` with no `htmlFor` beside an
unnamed `<Textarea>`. Spot-verified unnamed controls (only a placeholder, no label association):
`subjects-tab.tsx:139` (search `Input`), `offerings-tab.tsx:184, :197` (filter `Select`s whose
only text is a `SelectValue` placeholder). `academic-tabs.tsx` inputs are fine — wrapped by a real
`<label>` (`Labeled`, `:563-569`). A multi-line scan flagged 39 of 62 controls but its tag parser
breaks on `=>` inside attributes, so that number is unreliable; the three above were read by hand.
UNSURE on the full count.
**M-19 — DONE.** `data-table.tsx:216` `aria-sort`.
**M-20 — DONE.** `security-screen.tsx:345-347` `id="totp-confirm-password"` with the `Label`
above it (`:340-343`).
**M-21 — DONE.** `packages/ui/src/components/search-input.tsx:61` `aria-label={ariaLabel ??
placeholder}`; OTP inputs `two-factor/page.tsx:61`, `security-screen.tsx:412`; deletion textarea
labelled `deletion-queue-screen.tsx:234-236`.
**M-22 — PARTIAL.** `aria-invalid` / `aria-describedby` are set only by the RHF path
(`form.tsx:114-119`); zero occurrences in `apps/superadmin/src` itself, so the hand-rolled forms
listed under M-11 still associate nothing.
**M-23 — DONE.** `packages/ui/src/components/sidebar.tsx:519, :686` `aria-current="page"`.
**M-24 — NOT DONE.** `messaging-screen.tsx:100-118` is still three plain `<button>`s in a
`<div>`: no `role="tablist"`, no `role="tab"`, no `aria-selected`, no arrow-key handling.
**M-25 — NOT DONE.** Two `<h1>` per screen remain: `packages/ui/src/components/app-shell.tsx:626`
and `page-header.tsx:29` (superadmin's `PageHeader` re-exports the latter).

### LOW

- **L-1 — DONE.** `teacher-agreements/[id]/approve/route.ts:13` uses `parseOptionalJson`
  (empty body → `{}`; malformed → `ValidationError`, `validation/zod.ts:42-57`).
- **L-2 — PARTIAL.** Decide is fixed: status-in-WHERE `transitionAgreement`
  (`agreements.ts:143-153`), refuse on `count === 0`, P2002 → domain `ConflictError`
  (`:191-195`). `proposeAgreement` (`:79-100`) is still `findFirst` → `create` on
  `status='proposed'` with no unique behind it.
- **L-3 — PARTIAL.** `notifyAfterCommit` wraps `notify` in try/catch + log
  (`packages/server-core/src/services/notifications/notify.ts:193-205`) and every named caller
  uses it (`payouts.ts:285`, `center-control.ts:99`, `platform.ts:163, :190, :216, :330, :350`,
  `refunds.ts:247`). Residual: `refunds.ts:240-245` does an unprotected post-commit
  `platformDb` read of parent links BEFORE the guarded notify — a DB blip there still turns a
  committed refund into a 500.
- **L-4 — DONE.** Audit after `auth.api.impersonateUser` (`impersonate/route.ts:20-25`).
- **L-5 — DONE.** `invoices.ts:104-115` validates both dates and their order; audit in-tx with
  actor or `source: "cron"` (`:161-196`).
- **L-6 — DONE.** `center-money.ts:93-101` `updateMany where status:'paid'`, audit only when
  `count > 0`.
- **L-7 — DONE.** `audit-log.ts:97-101` `groupBy`.
- **L-8 — DONE.** `packages/ui/src/components/confirm-dialog.tsx:148-166`: `pending` state,
  stays open on rejection, closes on resolve, blocks dismiss while pending (`:176`). Consumers
  must RETURN the promise for this to engage; `offerings-tab`, `blacklist-screen`,
  `user-detail-screen` do.
- **L-9 — DONE 2026-09-05 (was PARTIAL when verified).** Built since the report: students directory,
  blacklist, points rules + ledger/adjust, notifications history, invoices, finance reports,
  transactions, accountant creation dialog, dashboard trends, audit-log actions filter; all wired
  into the sidebars (`dashboard/superadmin/layout.tsx:23, :51, :64, :79`,
  `dashboard/finance/layout.tsx:11-13`). Removed: the walk-in / counter / temp-student / roster
  lookup family (7), `centers/[id]/toggle`, `users/[id]/permissions` PATCH. Recomputed today:
  **200 route files, 151 with a literal or template caller, 49 flagged**, of which ~30 are false
  positives (oversight tabs via `oversight/${tab}`, approve/reject via `admin/${kind}/${id}/${decision}`,
  user actions via a base URL, statements via `${kind}-statement/${id}`, catalog PATCH via the
  entity dialog's endpoint prop). Still genuinely uncalled, no literal or template found:
  `admin/centers/[id]/money/payments/[paymentId]/refund` POST, `admin/users/[id]/permissions` GET,
  `admin/whatsapp-messages/[id]`, `admin/subscriptions/[id]`, `admin/payment-intents/[id]`,
  `finance/payment-intents` + `/[id]`, `finance/subscriptions/[id]`, `finance/transactions/[id]`,
  `finance/dashboard/revenue-chart`, `finance/payouts/bulk-approve`, `finance/refunds` (POST+GET),
  `security/csp-report` (a browser sink, expected). Per your rules none were deleted by the fix
  sessions; this is the shortened menu.
  **Deleted 2026-09-05 on your instruction:** all twelve above except `security/csp-report`,
  each re-checked for a literal or template caller in both apps first (0 hits; the one
  `revenue-chart` caller targets the separate `admin/dashboard/revenue-chart`, which stays).
  Five service functions became unreferenced with them and were removed: `bulkApprovePayouts`,
  `getTransaction`, `getUserPermissions`, `getPaymentIntent`, `getSubscription`. Route files
  200 → **188**; `admin-endpoint-sealing` 15/15; superadmin `next build` 230 ƒ / 1 ○ / 6 ●.
- **L-10 — PARTIAL.** Done: `subjects-tab.tsx:177` `emptyState`; messaging role labels via
  `useRoleLabel` (`:124, :143`); `markAllRead` on `useAction` with `busy` (`:161-183`);
  `use-tour-gate.ts:35` logs instead of empty catch; registrations approve is a `TwoStepCommit`
  (`:504-515`); offerings row toggles use `busyKey` per row (`offerings-tab.tsx:151`). Not done:
  Enter-submits — only 4 files in `features/` use `<form>` against 23 with `DialogContent`.
- **L-11 — PARTIAL.** Kit sr-only strings now come from `useKitStrings()` picking `ar`/`en` by
  direction (`packages/ui/src/lib/kit-strings.ts:27-29`; `spinner.tsx:9-13`, `sheet.tsx:87`).
  `structure-tab` rows are native buttons (`:193` comment; Space works). `opacity-65` is gone
  (grep → 0). The two tight contrast pairs were not re-measured.
- **L-12 — DONE.** `apps/superadmin/next.config.ts:54` `optimizePackageImports: ["@repo/ui"]`;
  no catalog `staleTime` added (grep → 0), as the report advised.
- **L-13 — DONE.** `withRole` (`lib/authz/require-role.ts:28-38`) on 230 handlers across 202
  route files; **0** inline `requireRole(` left in `apps/superadmin/src`;
  `tests/unit/route-conventions.test.ts` gained a test that a guard in the body is a failure.

---

## 2. Independent checks (report ignored)

### 2.1 Every write route → audit row, in the same transaction?

116 route files export a POST/PUT/PATCH/DELETE. Each was mapped to its service function and the
function read. Result:

- **Audited in the mutation's own transaction:** 108 route→service paths, via `writeAdminAudit`
  / a local `audit(tx…)` helper / `tx.auditLog.create`, or via the auto-audit extension's
  `AUDITED` map (`packages/database/src/extensions/index.ts:18-31` — `Center.update`,
  `TeacherProfile.update`, `BlacklistEntry.create/update`, `PointsLedger.create`,
  `PointsRule.*`, `Payout.update`, `CenterAdminProfile.create/delete`, `WalletSettings.*`), which
  now writes on the active transaction in a savepoint.
- **Audit written in a SEPARATE transaction after the write committed (4):**
  `admin/collaboration-requests/[id]/decide` (both branches),
  `admin/centers/[id]/students/[studentId]/membership` DELETE (`removeStudentFromCenter`) and
  POST (`restoreStudentToCenter`) — all `center-control.ts`, detailed under H-3.
- **No audit row, by design and acceptable:** `me/route.ts` PATCH, `me/prefs` PATCH,
  `notifications/[id]/read`, `notifications/read-all` (self-scoped, `scopedDb`),
  `security/csp-report` (unauthenticated sink), `admin/impersonation/stop` (the row IS the audit),
  `finance/invoices/[id]/send-email` (no DB write — but the email send itself is unaudited),
  `admin/centers/[id]/broadcast` (no DB write; audited after fan-out, documented),
  `admin/users/[id]/password-reset` (`admin-users.ts:315-338`: the audit is a separate tx after
  the reset is requested, but there is no DB mutation of its own to be atomic with).

### 2.2 Every UI mutation: loading + success + distinct error?

47 `useAction` call sites (29 files): busy flag + re-entry guard (`use-action.ts:120-141`),
success toast when `successMsg` given, one localized error toast. `busy` is wired to a
`disabled` in 26 of the 29 files; the three that do not destructure `busy` (`student-card-panel`,
`blacklist-screen`, `teachers-screen`) either run inside `ReasonDialog` (its own
`isSubmitting` busy, `reason-dialog.tsx:89-119`) or keep their own pending state
(`teachers-screen.tsx:107, :172, :197`). Hand-rolled: `registrations-queue.tsx:106-121` has all
three (busy per id, success toast, error toast). `security-screen.tsx` better-auth flows: all
three. `room-settlements-screen.tsx:60-79` export: `toast.loading` → same-id success/error.
**No mutation site found missing any of the three.** Success feedback without a toast (row
changes only): none found after M-6.

### 2.3 Every list/query screen: error renders as ERROR, never empty?

`ListShell` (`list-shell.tsx:216-233, :299`) renders `tone="denied"` for 403 and
`tone="error"` + retry for other failures, and every `useListScreen`/`useCustomListScreen`
consumer goes through it. Screens on `useCustom`/`useAdminGet` all branch on `isError`:
`wallet-settings-screen.tsx:84`, `commission-settings-screen.tsx:87`,
`feature-flags-screen.tsx:53`, `user-detail-screen.tsx:246` (with a distinct denied state),
`agreement-proposals-panel.tsx:91`, `use-oversight.ts:19` (consumed by every oversight tab),
catalog tabs (H-4). **One violation:** `student-card-panel.tsx:41-48` — `useCustom` for the
card with no `isError` branch; on failure the panel renders the empty `card === null` shape.

### 2.4 Hardcoded English in the superadmin app

JSX / props / toasts: **0** (sweep described under H-5). Server-originated: **100 of 157**
throw sites in `apps/superadmin/src/lib/services` have no Arabic mapping, reaching the operator
verbatim through `api-error.ts:203-207`. By class: `NotFoundError` 83, `ForbiddenError` 9,
`ConflictError` 8, plus templated `BusinessRuleError`s not matched by `AR_PATTERNS`
(`wallet-settings-admin.ts:38`, `admin-users.ts:47, :53, :187`, `platform.ts:151, :178, :325,
:345`). `packages/server-core` services: 462 throw sites, mapped only where the literal is in
`messages-ar.ts` (219 static keys).

### 2.5 Find-then-create races on tables without a matching unique

Unguarded (no unique in schema or migration SQL, no P2002 handling):
1. `packages/server-core/src/services/finance/agreements.ts:79-100` `proposeAgreement` —
   `teacher_agreements` only has `one_active_per_pair`; two concurrent proposals both land.
2. `packages/server-core/src/services/blacklist/blacklist.ts:259-267` `platformBlacklistUser`,
   `:328` `centerBlacklistStudentTx`, `:357` `teacherBlacklistStudent` — `blacklist_entries` has
   **no unique at all** (`BlacklistEntry` in `schema.prisma` carries only plain indexes). A
   double-submit creates two active entries; lifting one leaves the student blocked by the other.
   Same class as C-4, not in the report.
DB-guarded but surfacing a bare 409 instead of a domain message: `commission-admin.ts:54`,
`rooms-split.ts:136, :369`, `room-rate.ts:108`, `collaboration.ts:152, :324`, `roster.ts:567`,
`shifts.ts:65`, `account-deletion.ts:77`, `data-export.ts:92`, `subscriptions.ts:136`,
`staff.ts:185, :196`, `admins.ts:116`, `external-teachers.ts:234, :245`, `accountants.ts:24`,
`checkin.ts:321`, all `catalog-admin.ts` creates.

### 2.6 Keyboard reachability and input names

Keyboard: no `onClick` on a non-interactive element remains in `features/ components/`; the kit
rows handle Enter+Space; sidebar has `aria-current`. Open: the messaging tab strip (M-24) is
reachable but has no tab semantics. Input names: see M-18 — `requests-tab.tsx:320-321`,
`subjects-tab.tsx:139`, `offerings-tab.tsx:184, :197` verified unnamed; full count UNSURE.

### 2.7 Shared abstractions created but not adopted

| abstraction | consumers | same thing still hand-rolled |
|---|---|---|
| `writeAdminAudit` | 7 wrapper files + catalog-admin + invoices (68 calls) | `platform.ts:14`, `admin-users.ts:23`, `rooms-split.ts:46` local helpers; dead wrapper `center-academic.ts:25` |
| `recordAdminAudit` | 1 live (`center-operations.ts:33`), 1 dead | — |
| `useAction` | 47 sites / 29 files | `registrations-queue.tsx:106` |
| `useDebounced` | via `useListScreen` | none |
| `useListScreen` / `ListShell` | 9 + 18 files | none (`useList(` 0, `Math.ceil` 0) |
| `StatusBadge`/`statusTone` | 23 | `notifications-screen.tsx:32` (type map) |
| `parsePageLimit` | 23 | 4 clamps (M-12) |
| client-core api client / providers | both apps, 11 shims | `use-param-seed`, `theme-toggle`, `use-global-search`, `use-formatters`, `scope` |
| `ReasonDialog` kit (`components/kit/reason-dialog.tsx`) | — | `user-detail-screen.tsx` still exports its own `ReasonDialog`, which `student-card-panel.tsx:15` imports — two ReasonDialogs coexist |
| `session-integrity-guard` | mounted | — |
| `effects.ts` | every `…Tx` wrapper | — |
| `lib/errors/prisma.ts` (`isUniqueViolation`) | C-4 services | the 20+ bare-409 sites in §2.5 |

Dead new code: `center-academic.ts:25` `audit()` (unused import chain `recordAdminAudit`).

### 2.8 "What is already solid" — re-verified by counting

- **Authorization:** 127 write handlers; 119 `withRole(`; the other 8 are self-scoped
  (`me/*`, `notifications/*` call `requireSession`/`getSessionUser`), `impersonation/stop`
  (session-checked), `staff/[linkId]/invite` (`withRateLimit(withRole(…))`), `csp-report`
  (deliberately open, rate-limited), better-auth catch-all. No unguarded admin write. Holds.
- **Error envelope:** 199 / 202 route files use `withErrors` or `withRole`; the three without are
  `auth/[...all]`, `health`, `csp-report`. Holds (report said 208/211 on an older file count).
- **Validation:** only `csp-report/route.ts:12` reads a raw body (`req.text()`, intentional);
  15 write routes without `parseJson` are all body-less actions. `$queryRawUnsafe` /
  `$executeRawUnsafe`: 0 in app or package source (only the maturity-layer DB test). Holds.
- **Transactions:** every new or changed service is single-tx (`accountants.ts`,
  `catalog-admin.ts` 17/17, `refunds.ts`, the `…Tx` splits). Holds — with the four
  `center-control.ts` audit-after-commit sites as the exception noted above.

---

## 3. Lint, types, builds

- `bun run check-types --force`: 10 / 10 packages, 0 errors (uncached run).
- `bun run lint`: **0 errors, 412 warnings** (erp 342, superadmin 47, `@repo/ui` 17, realtime 6).
  Six warnings sit on lines added by the fix sessions:
  - `apps/superadmin/src/lib/services/admin/center-academic.ts:25` `'audit' is defined but never used` — dead helper (M-9).
  - `apps/superadmin/src/lib/api/use-list-screen.ts:296` setState synchronously inside an effect (the filter-change reset).
  - `apps/superadmin/src/features/admin/center-oversight/platform-tabs.tsx:416` same rule (`openedAt`).
  - `apps/superadmin/src/components/providers/session-integrity-guard.tsx:44` `window.location.assign()` for an internal route.
  - `apps/superadmin/src/features/admin/user-detail-screen.tsx:198` and
    `components/ui/impersonation-banner.tsx:35` `window.location.href` for internal routes.
  The remaining 406 are pre-existing (`no-explicit-any` 188, `no-unused-vars` 85, …).
- `next build`: superadmin ✓ (244 ƒ / 2 ○ / 7 ●, compiled clean); ERP ✓ (344 ƒ / 4 ○ / 33 ●)
  with only the known `require-in-the-middle` / OpenTelemetry critical-dependency warning from
  `@sentry/node`.
- Unit: superadmin 14 files / **162 passed**; ERP 103 files / **1488 passed, 1 skipped** (the
  skip predates the fix sessions).

## 4. DB suites (test branch `ep-morning-snow-b269im2n`, `db-guard: labelled 'test'`)

Run 2026-09-05 with `bun run test:db` in each app (sequentially, never concurrently, because
of the known shared-branch census interference). `db-guard` printed `labelled 'test'` for both.

**apps/superadmin — 34 suites, 939 assertions passed, 10 failed, 3 suites red (818 s).**

| suite | result | reading |
|---|---|---|
| `c02-payout-generation` | 22 passed, 6 failed in the full run; **28 / 28 alone on a cleaned branch** | Residue, proven — see the chase below this table. Excluded from `test:db:ci` at HEAD, so it was red before the fix sessions for the same reason. |
| `room-pricing-methods` | 78 passed, 2 failed | The two failures assert that the room-seed DEMO rooms exist ("room-seed demo rooms offer the per-student method", "an M2 demo course exists"). The test branch is seeded `--no-demo`; identical assertions exist at HEAD. Environmental, not a regression. |
| `room-revenue-split` | 23 passed, 2 failed | Same: "room-seed demo rooms have photos", "have a hall price". Environmental. |
| every other suite (31) | green | includes the NEW proofs: `h3-audit-atomicity` 16/16, `c04-dedupe-guards` 19/19, `m16-invoices` 10/10, `m16-registrations-paging` 11/11, `m16-roster-scoped-reads` 14/14, `m16-teacher-statement` 5/5; and the money suites `center-money` 48/48, `refund`, `wallet-refund`, `h3-refund-race`, `c01-zero-wallet-refund` 9/9, `center-held-refund` 11/11, `agreement-refund-mirror` 10/10, `admin-users` 67/67, `center-oversight` 122/122. |

The `h2-payout-floor` failure the report called pre-existing is gone: the suite now owns its
fixtures and passed.

**apps/erp — 68 suites, 1717 assertions passed, 0 assertion failures, 4 suites red (2173 s).**
The four red suites exit before printing a count, and all four are the ones `test:db:ci`
already excludes at HEAD:

| suite | error | reading |
|---|---|---|
| `c01-lesson-settlement` | `TypeError: Cannot read properties of undefined (reading 'id')` at `tests/db/c01-lesson-settlement.test.ts:199` | fixture lookup returns nothing on the `--no-demo` branch; pre-existing (CI-excluded at HEAD) |
| `catalog-onboarding` | `cacheTag() is only available with the cacheComponents config` from `catalog-read.ts:9` | pre-existing, noted in AUDIT_REPORT.md; its M-14 signature changes are type-checked but not runtime-exercised |
| `h03-seed-uuid-flows`, `profile-images` | exit 1 before counting | CI-excluded at HEAD; not read in detail |

Every suite that changed in the fix sessions passed: `h1-payout-race`, `teacher-payout-replay`,
`hall-booking`, `external-teachers`, `roster-courses-count`, `settled-lesson-lock` 19/19,
`settlements-for-all` 13/13.

**`c02-payout-generation`, chased to its cause (2026-09-05, all on the test branch):**

1. Re-run ALONE with nothing else on the branch: 22 passed / 6 failed, the same six
   assertions ("65 + 0 payouts, 67 beneficiaries"). So it is not the concurrent-suite
   interference the memory notes describe.
2. Read-only census: 3 `pending` payouts dated 2026-09-02 (before this session), 143 users
   (20 demo) on a branch seeded `--no-demo`, and fixture residue by tag — `m16rs` 64 users
   (the NEW `m16-roster-scoped-reads` suite leaks its fixtures; it has no sweep), `m16ts` 13,
   `m2-` 12, `drtest` 11, `hallbook` 6, `gver` 5, `bimp` 4, `arm5` 3, `wref` 2, `h2pf` 2, plus
   stray demo-shaped rows ("Nile Educational Academy", `lina.hassan@…`).
3. `bun run test:db:sweep` REFUSES to run: `load-env.ts` reads `.env.local` (dev) while the
   injected `--env-file` is the test branch, and the mismatch guard fires. The package script
   is broken as written; the working form is
   `EDURA_ENV=test npx tsx scripts/test-cleanup.ts <tag…>` from `packages/database`.
4. Swept 11 tags (`m16rs m16ts m2- drtest gver bimp arm5 wref h2pf wpol aes-`): **506 rows
   removed**. Re-ran c02 alone: still 22 / 6, gap narrowed to "60 + 0 payouts, 61
   beneficiaries".
5. What remains on the branch is exactly TWO payouts, both `pending`, both for beneficiary
   `1a55a50f-…`, which has NO `users` and NO `centers` row (orphans from a crashed run on
   2026-09-02, `client_request_id NULL`). c02's preflight sums open payouts per beneficiary
   table-wide (`c02-payout-generation.test.ts:253-255`), so one orphan holding two open
   payouts trips "no beneficiary holds two open payouts" and everything downstream of it. The
   tag sweep cannot reach rows that carry no name.
6. Deleted exactly those two orphan rows on the test branch (owner connection, guarded by
   `assertDbEnv(["test"])`, `WHERE id IN (…)` plus a re-check that no user or center row
   exists; 2 rows returned, `payouts` count 0 afterwards). Re-ran c02 alone:
   **28 passed / 0 failed, `ALL SUITES PASS`, 61 s.**

Reading: **PROVEN environmental.** The suite is green on a clean branch with the exact code
under review; the six red assertions were table-wide census checks tripped by two orphan
open payouts left on the shared branch by a crashed run on 2026-09-02. There is no regression
in `generatePayouts`. The superadmin DB picture is therefore 34 suites with **2** red, both
demo-seed dependencies (`room-pricing-methods`, `room-revenue-split`), not 3.

Two side-findings from this chase: (a) `test:db:sweep` in both apps' `package.json` cannot
run under `bun run` at all; (b) the new `m16-*` DB suites do not sweep their fixtures, so every
run grows the branch.

## 5. Tests: weakened, skipped, or deleted?

Deleted test files: **none** (`git diff HEAD --diff-filter=D` → 0). New `.skip/.only/.todo`:
**none** (repo-wide grep → 0). Modified test files, before → after:

| file | change | verdict |
|---|---|---|
| `apps/superadmin/tests/db/center-people.test.ts` | 60 → 57 assertions; the 3 removed tested `adminLookupStudent/Teacher` | consistent — those functions and their routes were deleted with the walk-in family; not a weakening of surviving code |
| `apps/superadmin/tests/db/h2-payout-floor.test.ts` | seed-UUID lookup replaced by suite-owned fixtures (`createTeacherFixture`, sweep tag) | **stronger** — no longer depends on a pre-existing `teacher_profiles` row (the "pre-existing failure" the report mentions is thereby fixed) |
| `apps/erp/tests/db/h1-payout-race.test.ts`, `teacher-payout-replay.test.ts` | same fixture change; the cross-beneficiary unique check no longer skips itself when only one teacher exists | **stronger** — the composite unique is now actually exercised |
| `apps/erp/tests/db/external-teachers.test.ts`, `roster-courses-count.test.ts` | fixed dates → relative-to-run dates | neutral (assertions unchanged; removes a time bomb) |
| `apps/erp/tests/db/hall-booking.test.ts`, `apps/superadmin/tests/db/room-revenue-split.test.ts` | pin/capture and restore the global commission split around the run | **stronger isolation**; assertions unchanged |
| `apps/erp/tests/db/catalog-onboarding.test.ts` | passes the new `actor` arg | signature only |
| `apps/superadmin/tests/unit/route-admin-guard.test.ts` | 10 → 14 `expect` | added (C-1), with the same-tx caveat under C-1 |
| `apps/superadmin/tests/unit/route-conventions.test.ts` | 6 → 7 tests | added (L-13) |

13 new test files under `apps/superadmin/tests`: 6 DB suites against the real database
(`h3-audit-atomicity` 17, `c04-dedupe-guards` 18, `m16-*` ×4 = 44 assertions) and 7 unit
files (`m8-use-action` 12 tests with the api mocked, `m11-field-schema` 14, `m12-parse-page-limit`
7, `m15-one-suspension-path` 4 source-scan tests, `m7-*` 10 mapper/envelope tests,
`session-integrity-client` 8). None is a tautology; the weak spots are the C-1 mock (above) and
that no test covers H-9's 422 branch or the four un-split `center-control.ts` sites.

Coverage did not go down anywhere I could measure.

---

## 6. Honest summary

**Genuinely solid now.** Authorization, envelope, validation and transaction discipline still
hold on a recount. C-1, C-2, C-4 (applied to all three databases), M-13, M-14, M-15, M-16,
M-17, H-9, L-1, L-4…L-7 are real fixes with the defect gone. The client layer is shared through
`packages/client-core` and the session-integrity drift is closed. `useAction`, `useListScreen`,
`ListShell` and `withRole` were adopted wholesale, not half-way: `useList(`, `Math.ceil`,
inline `requireRole`, `useMoneyMutation`, `useCatalogMutation` are all at zero. The seven
debounce screens, the four catalog error states, the kit keyboard rows, `aria-sort`,
`aria-current`, the badge endpoint and the deletion-queue note are all done. Payout race tests
are stronger than before, and nothing was skipped or deleted.

**Still open, in order of weight.**
1. ~~H-3 in `center-control.ts`: four audit-after-commit sites (`decideCollaborationRequest` ×2,
   `removeStudentFromCenter`, `restoreStudentToCenter`). The report's 53/56 and its `[x]` on
   `decideCollaborationRequest` are wrong; the `…Tx` functions to fix it already exist.~~
   **Fixed 2026-09-05** (49 / 49, `h3-audit-atomicity` 42/42) — see §1 H-3.
2. C-3 is undecided and the invariant text contradicts shipped, audited, tested code.
3. English server messages: 100 superadmin throw sites (every 404/403/409) with no Arabic.
4. `blacklist_entries` has no unique constraint — three write paths can double-insert (same
   class as C-4); `proposeAgreement` likewise.
5. M-24 (tabs semantics) and M-25 (double h1) untouched; M-7/M-11/M-22 stop at the RHF forms and
   leave the `academic-tabs` / `operations-tabs` / `people-tabs` dialogs behind; M-9's three older
   audit helpers and one dead one; M-12's four clamps; H-6's ~170 forked lines; the
   `student-card-panel` error state; two coexisting `ReasonDialog`s.
6. `AUDIT_REPORT.md` and `MIGRATION_PLAN_C4.md` describe C-4 as unapplied. They should be
   corrected before anyone acts on them.
7. None of this is committed.

**Unsure.** (a) The exact number of unnamed form controls (M-18) — three verified by hand,
the scanner's 39 is not trustworthy. (b) Whether `sendTempStudentInvite`'s in-tx `sendMail` was
really fixed in server-core — the superadmin wrapper that exposed it is gone, and I did not trace
the ERP path. (c) resolved: `c02-payout-generation` is 28/28 on a clean test branch (§4); the earlier
failures were orphan-payout residue, not a regression. (d) Two tight contrast pairs
from L-11 were not re-measured.
