# Cleanup plan — Phase 2, 2.5, 2.6 (execution checklist)

**Status: NOT STARTED. Nothing in this file has been executed.** Awaiting the go-ahead.

Evidence: [docs/reports/cleanup-audit-2026-08-27.md](docs/reports/cleanup-audit-2026-08-27.md).
Every deletion below is proven unreferenced by two independent methods (knip@5 with tests registered
as entry points, plus a per-file alias-specifier grep scoped to the file's own workspace).

Phase 3 (rendering, route-by-route) is **not** in this file — it cannot be itemized until each route
is classified against a build. It gets `cleanup-plan-phase3.md`. The one Phase 3 item already proven
is recorded as **I-3.0** at the end.

---

## Decisions applied (Ali, 2026-08-27)

| # | Decision | Effect on this file |
|---|---|---|
| 1 | Delete `first-run-tour.tsx`, repoint the two comments | **I-2.5.2** now approved, no longer blocked |
| 2 | Keep `brace-expansion`, document why in CLAUDE.md | new item **I-2.9.1** |
| 3 | Gitignore `swe-worker-*.js` and untrack it | new item **I-2.9.2** |
| 4 | Add the `postcss` declaration to `apps/superadmin` | new item **I-2.9.3** |
| 5 | Keep `@react-email/components` — closed, no further checks | removed from scope entirely |
| 6 | Promote `lib/refine/*` and `csp-report` only; leave `header-quick-settings` and the tour components duplicated | **I-2.6a.2** split into **I-2.6a.2** (promote) and **I-2.6a.3** (explicitly do nothing) |
| 7 | Legal pages: one source in a shared package — **later REVERSED once measured**: removed from this cleanup | see "Removed from scope" |
| 8 | Remove `next-themes` from `packages/ui`, provider untouched | folded into **I-2.6.8** |
| 9 | Cairo `HH:mm` helper only if all three option objects are byte-identical; invoice formatters and idempotency keys removed from this cleanup | **they are not identical — see "Stopped under decision 9" below. All of Batch 2.5c is out.** |

**Written up separately, as instructed, before anything else:**
[bug-daykey.md](bug-daykey.md) — the `YYYY-MM-DD` day-key discrepancy. Not fixed here, not
refactored around here.

---

## Stopped under decision 9 — the three clock formatters are NOT byte-identical

The condition was: proceed only if all three `Intl.DateTimeFormat` option objects are byte-identical.
They are not. Two of three match; the third differs.

```ts
// apps/erp/src/features/admin/center-day.ts:13
new Intl.DateTimeFormat("en-GB", { timeZone: PLATFORM_TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })

// apps/erp/src/features/teacher/teacher-dashboard.tsx:54   ← identical to the above
new Intl.DateTimeFormat("en-GB", { timeZone: PLATFORM_TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })

// packages/server-core/src/services/attendance/counter.ts:40   ← DIFFERENT
new Intl.DateTimeFormat("en-GB", { timeZone: PLATFORM_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false })
```

The third expresses the 24-hour clock as **`hour12: false`** where the other two use
**`hourCycle: "h23"`**. Those are not synonyms in the spec: `hour12: false` is permitted to resolve
to `h23` **or `h24`**, and `h24` renders midnight as `24:00`. In `counter.ts` the value is compared
against a session's `startTime` with `start <= hhmm && hhmm < end`, so a `24:00` would sort above
every `startTime` and misjudge which lesson is running — on the counter check-in path.

**Measured, both engines, at three Cairo instants** (00:15, 00:00, 23:45):

| Instant (UTC) | `hourCycle: "h23"` | `hour12: false` | same? |
|---|---|---|---|
| `2026-08-26T21:15:00Z` | `00:15` | `00:15` | yes |
| `2026-08-26T21:00:00Z` | `00:00` | `00:00` | yes |
| `2026-08-27T20:45:00Z` | `23:45` | `23:45` | yes |

`resolvedOptions().hourCycle` reports `h23` for both, under Bun 1.3.12 (JSC) **and** Node 24 (V8).

**So: the source differs, the behaviour today does not.** The risk is latent, not live — it depends
on an engine/ICU resolution the code does not pin. Per your instruction I have stopped and reported
rather than merging. Two ways forward, your call, neither in this branch:

- treat it as a one-line hardening fix — change `counter.ts` to `hourCycle: "h23"` so all three
  state the same thing, then the merge becomes trivial; or
- leave all three alone.

**I-2.5c.1, I-2.5c.2 and I-2.5c.3 are removed from this cleanup.** The invoice formatters and the
idempotency keys are separate bug-fix tasks per decision 9.

---

## Standing rules

- Branch `cleanup/performance`, cut from a clean `main`. Never commit to `main`, never push.
- One commit per batch. `<type>(<area>): P<batch> <summary>`.
- No behaviour change, no UI change. Anything that turns out to change either stops and is re-listed.
- Money, auth, attendance and messaging paths are not touched by Phase 2 at all.

### Verification command reference

| ID | Command | Meaning |
|---|---|---|
| **V1** | `bun run check-types` | 9/9 workspaces. **The real type gate** — erp sets `ignoreBuildErrors: true`, so a green build proves nothing about types. Never skip. |
| **V2** | `bun run --filter edura test:unit` | expect 98 files, 1436 passed / 1 skipped |
| **V3** | `bun run --filter superadmin test:unit` | expect 7 files, 106 passed |
| **V4** | `bun run --filter edura build:light` | `SERWIST_DISABLE=1 next build --webpack` |
| **V5** | `bun run build` | all three apps, Serwist + Sentry on. Phase-gate only |
| **V6** | `bun run lint` | eslint across workspaces |
| **V7** | `bun install` then `git diff --stat bun.lock` | lockfile moved only in the intended batch |

---

## P0 — Preconditions (blocking, in order)

- [ ] **I-0.1** — Ali commits or stashes the 20 modified files on `main`
  - **Action:** MANUAL (Ali). Claude does not commit to `main`.
  - **Before → After:** `git status --short` lists 20 `M` entries → lists none.
  - **Dependencies:** none. **Blocks everything else in this file.**
  - **Verification:** `git status --short` has no `M` lines.

- [ ] **I-0.2** — Create the branch
  - **Action:** `git switch -c cleanup/performance`
  - **Dependencies:** I-0.1.
  - **Verification:** `git branch --show-current` prints `cleanup/performance`.

- [ ] **I-0.3** — Commit the audit artifacts and the knip config
  - **Action:** MOVE into the branch's first commit: `docs/reports/cleanup-audit-2026-08-27.md`,
    `cleanup-plan-phase2.md`, `bug-daykey.md`, plus a new root `knip.json`.
  - **Before → After:** repo root has no `knip.json` → has one, workspace-aware, with
    `"bun": false` and `"playwright": false` under `apps/erp` (both plugins crash on `test:e2e`'s
    file-path argument with `ENOTDIR`).
  - **Dependencies:** I-0.2.
  - **Verification:** `npx knip@5 --no-progress` completes and reports 25 unused files.
  - **Commit:** `chore(cleanup): P0 audit report, day-key bug write-up, knip config`

- [ ] **I-0.4** — Capture the i18n dead-key baseline **(Batch 2.8 is unrunnable without it)**
  - **Action:** ADD `scripts/i18n-dead-keys.ts` implementing the matcher documented in
    [docs/reports/cleanup-notes.md](docs/reports/cleanup-notes.md) — a key is LIVE if any suffix of
    its dotted path appears inside quotes, **or** its namespace is completed at runtime
    (`` t(`studentWallet.type_${e.type}`) ``), **or** it is referenced from `.mdx`. Run it at this
    commit and SAVE the output to `docs/reports/i18n-dead-keys-baseline.txt`.
  - **Before → After:** no matcher exists in the repo (the method is prose in `cleanup-notes.md`
    only) → a runnable script plus a committed baseline file listing every key the matcher calls
    dead **at the P0 commit**.
  - **Why it is a P0 item and not part of 2.8:** the documented method is a **diff of two runs**.
    Run two happens after Batch 2.7; run one has to be taken before any deletion changes the source.
    Once Phase 2 has started, the baseline is unrecoverable without checking out `main` again.
  - **Dependencies:** I-0.2.
  - **Verification:** the script runs clean; the output file is non-empty and its key count is
    recorded in the commit body; re-running it twice at the same commit produces identical output.
  - **Commit:** `chore(i18n): P0 add the dead-key matcher and capture its baseline`

---

## Phase 2 — Deletions

### Batch 2.1 — erp service shims left by the Step-2 extraction (13 files)

Each is a one-line `export * from "@repo/server-core/…"` under a 0–3 line header comment. The
implementation is in `packages/server-core` and is untouched. Deleting a shim removes an alias, not
a capability.

- [ ] **I-2.1.1** — `apps/erp/src/lib/services/whatsapp/index.ts`
- [ ] **I-2.1.2** — `apps/erp/src/lib/services/whatsapp/send.ts`
- [ ] **I-2.1.3** — `apps/erp/src/lib/services/whatsapp/templates.ts`
- [ ] **I-2.1.4** — `apps/erp/src/lib/services/whatsapp/types.ts`
- [ ] **I-2.1.5** — `apps/erp/src/lib/services/whatsapp/phone.ts`
- [ ] **I-2.1.6** — `apps/erp/src/lib/services/whatsapp/mock-driver.ts`
- [ ] **I-2.1.7** — `apps/erp/src/lib/services/whatsapp/cloud-api-driver.ts`
- [ ] **I-2.1.8** — `apps/erp/src/lib/services/sms/sms-channel.ts`
- [ ] **I-2.1.9** — `apps/erp/src/lib/services/fcm/fcm-channel.ts`
- [ ] **I-2.1.10** — `apps/erp/src/lib/services/webpush/web-push-channel.ts`
- [ ] **I-2.1.11** — `apps/erp/src/lib/services/sessions/session-generator.ts`
- [ ] **I-2.1.12** — `apps/erp/src/lib/services/sessions/conflict-detector.ts`
- [ ] **I-2.1.13** — `apps/erp/src/lib/services/invites/recipient.ts`

  - **Action (all 13):** DELETE the file.
  - **Before → After (representative, I-2.1.1):**
    ```ts
    // Moved to the shared kernel so apps/superadmin can run the SAME center
    // capability against any center (Phase 1 — People). Re-export shim: every
    // www import path and behaviour is unchanged.
    export * from "@repo/server-core/services/whatsapp/index";
    ```
    → file removed. **No call site is edited** — nothing in `apps/erp` imports
    `@/lib/services/{whatsapp,sms,fcm,webpush}/*`, `@/lib/services/sessions/session-generator`,
    `@/lib/services/sessions/conflict-detector`, or `@/lib/services/invites/recipient`.
  - **Also DELETE the now-empty directories:** `apps/erp/src/lib/services/whatsapp/`, `.../sms/`,
    `.../fcm/`, `.../webpush/`. **Do NOT delete** `.../sessions/` (keeps `enrich.ts`) or
    `.../invites/` (keeps `deliver.ts`, `guardian-contact.ts`, `invite-token.ts`).
  - **Dependencies:** I-0.2 only.
  - **Verification:** V1, V2, plus
    `grep -rn "lib/services/\(whatsapp\|sms\|fcm\|webpush\)" apps/erp/src apps/erp/tests` → nothing.
  - **Commit:** `chore(dead-code): P2.1 drop 13 erp re-export shims superseded by @repo/server-core`

### Batch 2.2 — mail shims (3 files)

- [ ] **I-2.2.1** — `apps/erp/src/lib/mail/send.ts` — DELETE. Content is exactly
  `export * from "@repo/server-core/mail/send";`
- [ ] **I-2.2.2** — `apps/erp/src/lib/mail/templates.ts` — DELETE.
  `export * from "@repo/server-core/mail/templates";`
- [ ] **I-2.2.3** — `apps/superadmin/src/lib/mail/send.ts` — DELETE. Same one-liner.
  - **Also DELETE:** `apps/erp/src/lib/mail/` and `apps/superadmin/src/lib/mail/` — both empty after.
  - **Dependencies:** I-0.2.
  - **Verification:** V1, V2, V3, plus `grep -rn "@/lib/mail" apps` → nothing.
  - **Commit:** `chore(dead-code): P2.2 drop the three mail re-export shims`

### Batch 2.3 — superadmin points shim (1 file)

- [ ] **I-2.3.1** — `apps/superadmin/src/lib/services/points/points.ts`
  - **Action:** DELETE. `export * from "@repo/server-core/services/points/points";`
  - **Keep the directory** — `points-admin.ts` stays.
  - **Dependencies:** I-0.2.
  - **Verification:** V1, V3, plus `grep -rn "services/points/points\"" apps/superadmin` → nothing.
  - **Commit:** `chore(dead-code): P2.3 drop the superadmin points re-export shim`

### Batch 2.4 — superadmin UI shims superseded by `@repo/ui` (6 files)

erp's identically-named shims are **live** (7 erp screens import `@/components/charts`, 8 import
`@/components/kit/password-input`). This batch is `apps/superadmin` only.

- [ ] **I-2.4.1** — `apps/superadmin/src/components/kit/combobox.tsx` — DELETE
  (`export { Combobox, type ComboboxOption } from "@repo/ui/components/combobox";`)
- [ ] **I-2.4.2** — `apps/superadmin/src/components/kit/description-list.tsx` — DELETE
- [ ] **I-2.4.3** — `apps/superadmin/src/components/kit/password-input.tsx` — DELETE
- [ ] **I-2.4.4** — `apps/superadmin/src/components/kit/stat-card.tsx` — DELETE. Its docblock says
  "when the count reaches zero this file is deleted." In superadmin it has.
- [ ] **I-2.4.5** — `apps/superadmin/src/components/charts/index.ts` — DELETE
- [ ] **I-2.4.6** — `apps/superadmin/src/components/charts/heatmap-calendar.tsx` — DELETE
  - **I-2.4.5 and I-2.4.6 must be deleted in the same step** — 2.4.5 is the only importer of 2.4.6.
    Deleting either alone leaves a dangling import or a re-orphaned file.
  - **Also DELETE:** `apps/superadmin/src/components/charts/` — empty after. **Keep**
    `apps/superadmin/src/components/kit/` — 6 components remain.
  - **Dependencies:** I-0.2.
  - **Verification:** V1, V3, V6, plus
    `grep -rn "components/kit/\(combobox\|description-list\|password-input\|stat-card\)\|components/charts" apps/superadmin`
    → nothing. Then `bun run --filter superadmin build`.
  - **Commit:** `chore(dead-code): P2.4 drop 6 superadmin UI shims now served by @repo/ui`

### Batch 2.5 — orphaned code (2 files, both approved)

- [ ] **I-2.5.1** — `apps/erp/src/lib/constants/subjects.ts`
  - **Action:** DELETE (29 lines: `SUBJECTS`, `type Subject`, `isSubject`).
  - **Before → After:** file removed. Nothing imports it. The real subject source is the Egyptian
    catalog; the only other `SUBJECTS` is a private const in
    `apps/erp/src/features/marketing/contact-form.tsx:52`, untouched.
  - **Also DELETE** `apps/erp/src/lib/constants/` only if it holds nothing else — check first.
  - **Dependencies:** I-0.2.
  - **Verification:** V1, V2, plus `grep -rn "lib/constants/subjects" apps` → nothing.

- [ ] **I-2.5.2** — `apps/erp/src/features/emulator/first-run-tour.tsx` — **approved (decision 1)**
  - **Action:** DELETE (76 lines, `FirstRunTour`), **and** REPLACE the citing comment in both files:
    - `apps/erp/src/features/tour/use-tour-gate.ts:20`
    - `apps/superadmin/src/features/tour/use-tour-gate.ts:20`
    - **Before:** `` * This is the same contract `features/emulator/first-run-tour.tsx` implements ``
    - **After:** `` * This is the same contract `features/tour/first-run.tsx` implements ``
  - **Order:** edit both comments **in the same commit** as the deletion, so the tree never holds a
    comment pointing at a file that is gone.
  - **Dependencies:** I-0.2.
  - **Verification:** V1, V2, V3, plus `grep -rn "first-run-tour" apps` → nothing.
  - **Commit (both items):** `chore(dead-code): P2.5 drop the orphaned SUBJECTS list and emulator tour`

### Batch 2.6 — unused dependency declarations (14 declarations, 0 code changes)

The only batch permitted to move `bun.lock`.

- [ ] **I-2.6.1** — `apps/erp/package.json` — REMOVE `next-cloudinary` (zero mentions repo-wide)
- [ ] **I-2.6.2** — `apps/erp/package.json` — REMOVE `pdf-lib` (erp mentions it only in comments;
  the sole importer is `apps/superadmin/src/lib/services/finance/invoice-pdf.ts`, which declares it)
- [ ] **I-2.6.3** — `apps/erp/package.json` — REMOVE `posthog-node` (only
  `packages/server-core/src/services/analytics/posthog-server.ts` imports it)
- [ ] **I-2.6.4** — `apps/erp/package.json` — REMOVE `web-push` **and** `@types/web-push`
  - **Dependency: must run AFTER I-2.1.10**, which deletes erp's dead `web-push-channel.ts`.
- [ ] **I-2.6.5** — `apps/erp/package.json` + `apps/superadmin/package.json` — REMOVE `recharts`
  (imported only inside `packages/ui/src/components/charts/*`, which declares it)
- [ ] **I-2.6.6** — `apps/erp/package.json` + `apps/superadmin/package.json` — REMOVE
  `@tanstack/react-table` (only `packages/ui/src/components/data-table.tsx` imports it)
  - **Dependency: run AFTER I-2.4** for the superadmin half.
- [ ] **I-2.6.7** — `apps/superadmin/package.json` — REMOVE `dayjs` (zero mentions in
  `apps/superadmin/src`; erp uses it in 7 files and declares it separately)
- [ ] **I-2.6.8** — `packages/ui/package.json` — REMOVE `@hookform/resolvers`, `date-fns`, `zod`,
  **and `next-themes` (decision 8)**
  - **Decision 8 is explicit: `packages/ui/src/components/theme-mode-provider.tsx` is NOT touched.**
    Only the unused declaration goes. `sonner.tsx:12`'s comment — "next-themes, which this repo does
    not mount" — becomes literally true of the manifest as well as the code.
- [ ] **I-2.6.9** — `packages/server-core/package.json` — REMOVE `nodemailer` and
  `@types/nodemailer` (zero imports in `packages/server-core/src`; the transport is in
  `packages/notifications`, which declares it)

  - **Action (all):** REPLACE the dependency block, then `bun install`.
  - **Before → After (representative, I-2.6.1):**
    ```jsonc
    // apps/erp/package.json, "dependencies"
    -   "next-cloudinary": "^<version>",
    ```
  - **Explicitly NOT removed** (false positives, audit §2b): `tailwindcss`, `tw-animate-css`
    (referenced from CSS), `@prisma/client` + `@prisma/client-runtime-utils` (generated client),
    `@repo/typescript-config`, `@repo/eslint-config` (`extends`), `@neondatabase/serverless`, `ws`,
    `@types/ws` (strings in superadmin's `serverExternalPackages`), `brace-expansion` (decision 2),
    `@react-email/components` (decision 5 — closed).
  - **Dependencies:** I-2.1 and I-2.4 per the per-item notes.
  - **Verification:** V7, then V1, V2, V3, then **V5 (full build)** — a wrongly-removed dependency
    surfaces at bundle time, not at typecheck. Then `bun audit` still reports 0 vulnerabilities.
  - **Commit:** `chore(deps): P2.6 drop 14 unused dependency declarations`

### Batch 2.7 — unused exports (narrow, opportunistic)

Do **not** sweep all 243. Many vanish once 2.1–2.5 land; about half the rest are exported types
whose export *is* the module's public shape. Re-run knip after 2.6, then act only on:

- [ ] **I-2.7.1** — `apps/erp/src/components/charts/index.ts` — REFACTOR: narrow the re-export list.
  13 names unused (`ChartFrame`, `ChartLegend`, `ChartTooltip`, `ProgressArcChart`, `SERIES_COLORS`,
  `TRACK_COLOR`, `seriesColor`, + 6 types). **The file stays** — 7 erp screens import it.
- [ ] **I-2.7.2** — `apps/erp/src/lib/analytics/transforms.ts` — DELETE the 7 uncalled transforms
  (`revenueVsExpensesLineSeries`, `attendanceByCourseBarData`, `courseFillRateBarData`,
  `scoreDistributionBarData`, `studentGradeTrendLineSeries`, `paymentTrendLineSeries`,
  `subjectComparisonBarData`). Check each against the dashboards first — these are the shape of
  charts that may be about to be built.
- [ ] **I-2.7.3** — `apps/erp/src/lib/pwa/attendance-outbox.ts` — 9 unused exports incl.
  `clearAttendanceOutbox`. **SENSITIVE (attendance). REPORT ONLY — do not delete in this pass.**
  - **Excluded from this and every Phase 2 batch:** `apps/erp/src/lib/services/wallet/wallet.ts` and
    `parent-wallet.ts`. knip reports `walletCredit`, `walletDebit`, `reconcileWallet`,
    `INSUFFICIENT_WALLET` and others as unused. **These are money primitives. A reported-unused
    money export is a question about call paths, not a cleanup item.** Not touched.
  - **Dependencies:** I-2.1 … I-2.6 done, then a fresh knip run.
  - **Verification:** V1, V2, V4.
  - **Commit:** `refactor(dead-code): P2.7 narrow unused export surface`

### Batch 2.8 — dead i18n keys

- [ ] **I-2.8.1** — Run the two-commit matcher from
  [docs/reports/cleanup-notes.md](docs/reports/cleanup-notes.md) — the only method proven on this
  repo (suffix match, runtime-completed namespaces like `` t(`studentWallet.type_${e.type}`) ``,
  `.mdx` scan). Run it at the P0 baseline commit **and** after 2.7, then diff.
  - **Action:** DELETE only keys dead in **both** runs, from **both** `ar` and `en`. Keys matched by
    any dynamic pattern are never deleted.
  - **Dependencies:** all of Phase 2. The first run must be taken at the baseline commit — if
    missed, re-run against `main` before deleting anything.
  - **Verification:** V1, V2, the i18n-parity suite (61 tests) green, plus a manual `ar` + `en`
    render of one screen per portal.
  - **Commit:** `chore(i18n): P2.8 remove translation keys dead in both matcher runs`

### Batch 2.9 — hygiene items from decisions 2, 3 and 4

- [ ] **I-2.9.1** — `CLAUDE.md` — document why `brace-expansion` is a root dependency (decision 2)
  - **Action:** REFACTOR (docs). ADD a note in the "Dependency overrides" bullet under **Security
    remediation progress**, next to the existing 2026-07-20 entry.
  - **Before → After:** the bullet lists the overrides and ends at `bun audit` reporting 0
    vulnerabilities → the same bullet gains a sentence of the form: *"`brace-expansion` is also
    declared as a root **dependency** (`^5.0.9`) on purpose. The `brace-expansion@1` / `@2` entries
    in `overrides` pin the patched versions of the transitive copies; the root declaration is what
    anchors them. It is not application code and `knip` will report it as unused every time —
    do not remove it."*
  - **Dependencies:** none.
  - **Verification:** read-back only; no command. `bun audit` still reports 0 vulnerabilities.

- [ ] **I-2.9.2** — `apps/erp/public/swe-worker-f61931bc2770d10b.js` (decision 3)
  - **Action:** DELETE from git tracking and IGNORE going forward.
    - `git rm --cached apps/erp/public/swe-worker-*.js` (file stays on disk; it is a Serwist build
      artifact and a local build regenerates it)
    - ADD to `.gitignore`:
      ```
      # Serwist build artifacts (regenerated by `next build`)
      apps/erp/public/swe-worker-*.js
      ```
  - **Check first:** whether `apps/erp/public/sw.js` (44 KB, also Serwist-generated) is tracked. If
    it is, it belongs in the same ignore rule — but **confirm the offline page still works from a
    clean checkout before ignoring `sw.js`**, since a missing service worker is a silent PWA
    regression. If in doubt, ignore only `swe-worker-*.js` as instructed and list `sw.js` as a
    follow-up.
  - **Dependencies:** none.
  - **Verification:** `git status --short` shows the file as untracked-and-ignored; V4 regenerates
    it; the PWA still registers its service worker in a browser check.

- [ ] **I-2.9.3** — `apps/superadmin/package.json` — ADD the `postcss` devDependency (decision 4)
  - **Action:** REPLACE the `devDependencies` block to add `postcss` at the version already resolved
    in `bun.lock` (match `apps/erp`'s declaration so the two apps do not float apart).
  - **Before → After:** `apps/superadmin/postcss.config.mjs` names `postcss` with nothing declaring
    it → the declaration exists.
  - **Dependencies:** best folded into I-2.6's `bun install` so the lockfile moves once.
  - **Verification:** V7, `npx knip@5` no longer reports it as *unlisted*, `bun run --filter
    superadmin build` green.
  - **Commit:** `chore(repo): P2.9 gitignore the Serwist artifact, declare postcss, document brace-expansion`

---

## Phase 2.5 — Replace hand-written code with built-ins / installed libraries

No new dependency is installed anywhere in this phase. **Batch 2.5c is deleted from the plan** — see
"Stopped under decision 9" above.

### Batch 2.5a — mechanical, low risk

- [ ] **I-2.5a.1** — `admin-audit-screen.tsx:102`, `audit-log-screen.tsx:91`, both apps'
  `lib/refine/router-provider.ts:117-118`, `admin-users.ts:167`,
  `packages/ui/src/components/bottom-nav.tsx:116`, `student-qr.ts:179`
  - **Action:** REPLACE `arr[arr.length - 1]` → `arr.at(-1)`, `arr[arr.length - 2]` → `arr.at(-2)`.
  - **Watch:** `.at()` is typed `T | undefined` where `arr[i]` was `T`. If a site would need a new
    `!` to compile, **leave that site alone** — a non-null assertion is not an improvement.
  - **Dependency:** the two `router-provider.ts` sites are **superseded by I-2.6a.2** (the file is
    being promoted to a package). Do them there, not here, or skip them if 2.6a.2 lands first.
  - **Verification:** V1, V2.

- [ ] **I-2.5a.2** — `packages/server-core/.../sessions/conflict-detector.ts:81-87`,
  `admin-schedule-screen.tsx:114-120`, `apps/erp/src/app/api/v1/centers/[id]/rooms/route.ts:87-91`,
  `packages/server-core/.../subscriptions/teacher-coverage.ts:154-158`
  - **Action:** REPLACE the `new Map()` + get/push/set bucketing loop with `Map.groupBy` (ES2024),
    or `Object.groupBy` where a plain record is wanted.
  - **Before → After (shape):**
    ```ts
    const byRoom = new Map<string, Session[]>();
    for (const s of sessions) {
      const list = byRoom.get(s.roomId) ?? [];
      list.push(s);
      byRoom.set(s.roomId, list);
    }
    ```
    →
    ```ts
    const byRoom = Map.groupBy(sessions, (s) => s.roomId);
    ```
  - **Verification:** V1, V2.

- [ ] **I-2.5a.3** — `apps/erp/src/lib/services/attendance/sync.ts:161-164` — **SEPARATE COMMIT**
  - Same replacement as I-2.5a.2, but this one re-spreads the array every iteration, so it is
    O(n²) today — the only one of the five with a performance argument.
  - **SENSITIVE (attendance).** Its own commit, alone, nothing else in it.
  - **Verification:** V1, V2, plus `bun run --filter edura test:db` attendance suites in a
    coordinated serial window (shared dev DB — never concurrent with Ali).

- [ ] **I-2.5a.4** — `apps/erp/src/app/[locale]/register/page.tsx:169`,
  `apps/erp/src/app/[locale]/claim/page.tsx:69`
  - **Action:** REPLACE the inline `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` test with zod, already imported in
    `register/page.tsx` (line 136 uses `.refine` with `EGYPT_PHONE_RE`).
  - **Before → After:** `if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))` →
    `if (!z.string().email().safeParse(email).success)`
  - **Watch — behaviour change:** zod's rule is stricter than the regex, so an address accepted
    today could start being rejected **on signup and on invite claim**. Confirm against real test
    addresses before committing, or skip this item.
  - **Verification:** V1, V2, plus a manual register and claim submission in both locales.

- [ ] **I-2.5a.5** — `apps/erp/src/features/onboarding/student-wizard.tsx:110-111`
  - **Action:** REPLACE string-concat query building with `URLSearchParams`.
  - **Before:** ``const q = sel.trackId ? `&trackId=${sel.trackId}` : "";``
  - **After:** build the whole query via `new URLSearchParams({...})`, interpolate once.
  - **Verification:** V1, V2, plus one pass through the onboarding wizard.

- [ ] **I-2.5a.6** — `apps/realtime/src/server.ts` — 4 `console.log` calls
  - **Action:** NONE PROPOSED — **recommend keeping them.** It is a standalone socket process where
    stdout *is* the log, and `@repo/observability` is a policy module about what Sentry and PostHog
    may see, not a logger. Listed only because the original brief asked for console.log removal.
  - **Verification if changed anyway:** `bun run --filter realtime check-types`; start the server
    and confirm the boot line still prints.

- [ ] **I-2.5a.7** — `apps/realtime/src/internal.ts:39-57`
  - **Action:** REPLACE the manual `req.on('data'/'end'/'error')` accumulation in `readBody()` with
    `import { text } from "node:stream/consumers"`. **Keep the 256 KB cap** — it is the reason the
    hand-rolled version exists and must survive the swap.
  - **Verification:** `bun run --filter realtime check-types`; exercise the internal endpoint.

### Batch 2.5b — consolidation onto existing helpers (medium risk)

- [ ] **I-2.5b.1** — 11 call sites: `guardian-verify-screen.tsx:73`, `admin-rooms-screen.tsx:250`,
  `student-import-dialog.tsx:32`, `profile-image-card.tsx:44`, `use-onboarding.ts:9,16`,
  `teacher-wizard.tsx:81`, `student-wizard.tsx:101,111`, `registrations-queue.tsx:100`,
  `use-catalog-mutation.ts:20`, `impersonation-banner.tsx:47`
  - **Action:** REPLACE raw `fetch` + manual `res.ok` + `await res.json()` + hand-lifted
    `{error:{message}}` unwrapping with the configured `ky` client at
    `apps/erp/src/lib/api/client.ts` / `apps/superadmin/src/lib/api/client.ts`.
  - **Not cosmetic:** the raw sites **skip the session-integrity handling**, so a revoked session
    behaves differently on those 11 screens than everywhere else in the app.
  - **Order:** one screen per commit — each has its own error UI.
  - **Verification:** V1, V2, plus a manual pass of each screen's success path **and** error path
    (force a 400).

- [ ] **I-2.5b.2** — `super-admin-dashboard.tsx:358`, `finance-dashboard.tsx:242`,
  `reports/print/page.tsx:70`, `centers/[id]/page.tsx:122`, `courses/[id]/page.tsx:175`,
  `features/admin/ledger/num.tsx:138`, `attendance-screen.tsx:67`
  - **Action:** REPLACE local `new Intl.NumberFormat(...)` / bare `toLocaleString()` + `/100` +
    literal `EGP`/`ج.م` with `formatEGP` / `formatShortEGP` / `formatNumber` from
    `packages/ui/src/lib/format.ts` (re-exported by both apps' `lib/i18n/format.ts`).
  - **SENSITIVE:** two render money. Prove digit-for-digit equality per site (Arabic-Indic digits and
    separator included) on a real value before and after.
  - **Verification:** V1, V2, plus a screenshot diff of each surface in `ar` and `en`.

- [ ] **I-2.5b.3** — `team-notes-board.tsx:86-98`, `notifications-screen.tsx:123-135`
  - **Action:** REPLACE the byte-identical `timeAgo()` ladder with next-intl's
    `useFormatter().relativeTime()`.
  - **Watch — visible copy change:** the built-in handles Arabic dual/plural agreement where the
    ladder interpolates `formatNumber`. Read the new `ar` strings at 1 minute, 1 hour, 2 hours,
    1 day and 3 days before committing.
  - **Do not fold in** superadmin's `notifications-screen.tsx:96-121` `TimeAgo` — it is deliberately
    different (Arabic dual agreement via `ProseCount`).
  - **Verification:** V1, V2, plus the five rendered `ar` strings above.

- [ ] **I-2.5b.4** — `admin-schedule-screen.tsx:51-63`, `features/sessions/session-time.ts:98-105`,
  `lib/analytics/transforms.ts:191-212`
  - **Action:** REPLACE hand-written `startOfWeek`/`addDays` (`setDate(getDate()-getDay())`) with
    `dayjs` (already imported in 6 erp files).
  - **Dependency: after I-2.6.8**, so it is settled which date library survives. Do **not** pull
    `date-fns` into erp app code once 2.6.8 removes it from `packages/ui`.
  - **Watch:** week start. `getDay()` is Sunday-based and `session-time.ts:98` documents Sunday-first
    deliberately, to match the attendance heatmap. Preserve exactly what the current code produces.
  - **BLOCKED on [bug-daykey.md](bug-daykey.md):** `session-time.ts:98-105` is inside the module
    that write-up covers. **Do not touch `session-time.ts` in this cleanup at all** — refactoring
    around an open bug is what the instruction forbids. Do the other two sites; leave this one until
    the day-key bug is fixed on its own branch.
  - **Verification:** V1, V2, plus comparing the rendered week strip against `main` for the same
    date, both locales.

- [ ] **I-2.5b.5** — `collaboration-panel.tsx:432-440`, `teacher-create-group-dialog.tsx:64-68`,
  `center-oversight/collab-request-dialog.tsx:69-73`
  - **Action:** REFACTOR the three identical time-slot generators into one exported helper in
    `packages/ui/src/lib/format.ts`, beside the existing `formatClock`. Three occurrences — clears
    the 3rd-occurrence bar.
  - **Verification:** V1, V2, V3, plus opening all three dialogs and confirming identical options.

- [ ] **I-2.5b.6** — `apps/erp/src/lib/api/use-global-search.ts:42-49`,
  `apps/superadmin/src/lib/api/use-global-search.ts:46-53`, `collaboration-panel.tsx:458-462`
  - **Action:** REFACTOR three hand-rolled debounces into one `useDebounced` hook in `@repo/ui`.
    (No lodash in this tree, so the hook body stays hand-written — dedupe, not a library swap.)
  - **`chat-screen.tsx:869,901-909` is deliberately EXCLUDED** — messaging, and its debounce is
    entangled with the socket lifecycle. Left as the fourth copy.
  - **Verification:** V1, V2, V3, plus typing in the ⌘K palette in both apps and watching the
    request count in the network panel.

- [ ] **I-2.5b.7** — `packages/ui/src/components/charts/donut-chart.tsx:18`,
  `packages/ui/src/components/calendar.tsx:44`
  - **Action:** REPLACE `value.toLocaleString()` / `toLocaleString("default", {month:"short"})` with
    `formatNumber(value, locale)` and a locale-aware month name.
  - **This is a bug fix, not cleanup:** both render English under `ar` today. It changes visible
    output on purpose — flagged so it is not mistaken for a no-op refactor.
  - **Verification:** V1, V3, plus rendering the donut and the calendar in `ar`.

---

## Phase 2.6 — DRY pass

- [ ] **I-2.6a.1** — `apps/erp/src/features/admin/ledger/fonts.ts` +
  `apps/erp/src/components/ledger/fonts.ts`
  - **Action:** REFACTOR — two `IBM_Plex_Mono` `next/font` loaders in one app. Keep one, repoint the
    other's importers.
  - **Why beyond tidiness:** two `next/font` loader calls for the same family can emit two font
    instances and two CSS variables.
  - **Verification:** V1, V4, plus confirming a single `--font-plex-mono` in the built CSS and that
    the ledger screens render unchanged.

- [ ] **I-2.6a.2** — promote the byte-identical infra to a package (**decision 6**)
  - **Measured, `diff` exit-clean, byte-identical between `apps/erp` and `apps/superadmin`:**

    | File | Lines | diff |
    |---|---:|---:|
    | `src/lib/refine/data-provider.ts` | 303 | 0 |
    | `src/lib/refine/router-provider.ts` | 158 | 0 |
    | `src/lib/refine/as-record.ts` | 59 | 0 |
    | `src/lib/refine/as-array.ts` | 36 | 0 |
    | `src/lib/refine/index.ts` | 8 | 0 |
    | `src/lib/observability/csp-report.ts` | 116 | 0 |
    | `src/app/api/v1/security/csp-report/route.ts` | 51 | 0 |

    **731 identical lines**, each existing twice.
  - **`src/lib/refine/auth-provider.ts` is EXCLUDED** — it is **not** byte-identical (131 lines vs
    106, 54 diff lines), and decision 6's criterion is byte-identical infra. It is also the auth
    boundary, where the two apps differ on purpose. **Both copies stay.**
  - **Action:** MOVE the seven files above into a package and re-export from both apps.
    - `lib/refine/*` → a new `packages/refine` (it depends on `@refinedev/core`, which
      `packages/server-core` must not pull in, and it is client code, which does not belong in a
      server kernel).
    - `lib/observability/csp-report.ts` → `packages/observability`, which already exists for exactly
      this kind of policy module and is dependency-free by design.
    - The `csp-report/route.ts` handler stays a route in each app (Next requires the file at the
      path) but shrinks to a thin re-export of the shared handler.
  - **Before → After (shape):**
    ```ts
    // apps/erp/src/lib/refine/data-provider.ts   — 303 lines
    // apps/superadmin/src/lib/refine/data-provider.ts — the same 303 lines
    ```
    →
    ```ts
    // packages/refine/src/data-provider.ts — the 303 lines, once
    // both apps: import { dataProvider } from "@repo/refine/data-provider";
    ```
  - **Import-site rule:** update the call sites to import from the package directly. **Do not leave
    a re-export shim at the old path** — that is precisely the debt Batch 2.1 is deleting.
  - **Dependencies:** none, but it supersedes the two `router-provider.ts` sites in I-2.5a.1.
  - **Verification:** V1, V2, V3, V5, plus a login and a ⌘K search in **both** apps, plus one
    deliberate CSP violation per app confirming the report still posts.
  - **Commit:** `refactor(dry): P2.6 promote 731 lines of byte-identical infra to packages`

- [ ] **I-2.6a.3** — `components/ui/header-quick-settings.tsx` (75 lines ×2),
  `features/tour/guided-tour.tsx` (89 ×2), `features/tour/use-tour-gate.ts` (58 ×2)
  - **Action:** **NONE. Leave both copies (decision 6).** Recorded so the duplication is not
    re-flagged as an oversight by the next audit. Rationale, per the decision: this is UI that may
    legitimately diverge between the operator-facing ERP and the back office.
  - **Note:** `use-tour-gate.ts` still gets its comment repointed by **I-2.5.2** in both apps — that
    is a comment fix, not a merge.

- [ ] **I-2.6a.5** — NOT RECOMMENDED, no action: the emulator cluster (~800 duplicated lines across
  `features/{admin,teacher,student,parent,assistant}/emulator/*`). Demo surface; the five roles'
  scripts legitimately differ; merging risks exactly the over-abstraction the brief warns against.
  Recorded so the number is not mistaken for an oversight.

- [ ] **I-2.6a.6** — NOT RECOMMENDED, no action: `admin/center-staff-screen.tsx` ↔
  `teacher/teacher-team-screen.tsx` (122), `parent-wallet-screen` ↔ `student-wallet-screen` (65),
  `parent-recent-attendance` ↔ `student-recent-attendance` (64). Center staff and teacher assistants
  are **different delegation models** with different permission sets; parent and student wallets are
  **different money entities** with a decision doc behind them. The "looks the same, is not the same"
  cases. Left alone deliberately.

---

## Phase 3 — the one item already proven (full plan in `cleanup-plan-phase3.md`)

- [ ] **I-3.0** — `apps/erp/src/app/[locale]/layout.tsx:143`
  - **Action:** REFACTOR — stop calling `await getSessionUser()` in the root layout.
  - **Before:**
    ```tsx
    const actor = await getSessionUser();
    const analyticsSession = actor
      ? { id: actor.id, role: actor.role, centerId: actor.centerId ?? null }
      : null;
    // …
    <AnalyticsProvider session={analyticsSession}>
    ```
  - **After:** `AnalyticsProvider` resolves the actor client-side (it is already `"use client"` and
    already re-identifies on `session?.id` change), so the layout reads no cookies.
  - **Why:** that one `await` is why **all 122 erp pages build as ƒ** despite `generateStaticParams`
    on the layout and on `/help`, `/faq`, `/terms`, `/privacy`, `/changelog` and `/contact`
    individually. `apps/superadmin/src/app/[locale]/layout.tsx` does **not** make the call — which is
    exactly why its `/login` and `/two-factor` prerender as ●.
  - **Cost:** PostHog identifies one client round-trip later instead of on first render — what
    superadmin already lives with.
  - **Dependencies:** none technically, but it belongs in Phase 3 behind the four proof gates, not
    in Phase 2.
  - **Verification:** V5, then diff the route census against the baseline (erp: 357 ƒ / 3 ○ / 0 ●) —
    public and auth routes should flip to ○/●, and **no dashboard route may flip without its own
    gate**. Then grep every emitted `.next/server/app/**/*.html` for seeded user names, emails,
    wallet amounts and cookie names: zero hits required.

---

## Removed from scope

| Item | Why |
|---|---|
| `I-2.5c.1` Cairo `HH:mm` helper | decision 9 condition not met — the three option objects differ (`hour12:false` vs `hourCycle:"h23"`). Reported above |
| `I-2.5c.2` invoice money formatters | decision 9 — separate bug-fix task |
| `I-2.5c.3` payment idempotency keys | decision 9 — separate bug-fix task |
| `@react-email/components` check | decision 5 — closed |
| Legal pages, one source (was I-2.6a.4) | **not a refactor — a legal-text reconciliation.** Measured: `privacy/page.tsx` 277 lines (erp) vs 316 (www) with 578 diff lines; `terms/page.tsx` 192 vs 226 with 403. Two different architectures (inline `{ar ? … : …}` JSX under `LegalPage` vs `getPages(locale).legal` under `PageFrame`), and the texts have **diverged on substance** — www names Law 151/2020 data rights in Settings, erp's does not. Merging would publish one version's legal claims under the other's URL. Needs counsel, not a commit |
| `session-time.ts` week helpers | blocked by [bug-daykey.md](bug-daykey.md); no refactoring around an open bug |
| `chat-screen.tsx` debounce | messaging, entangled with the socket lifecycle |
| `wallet.ts` / `parent-wallet.ts` unused exports | money primitives |
| `<img>` → `next/image` | all 16 carry comments explaining why `next/image` does not apply (SVG, Cloudinary) |
