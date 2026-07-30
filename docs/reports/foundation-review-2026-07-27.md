# Foundation session — review against `00-FOUNDATION.md`, and the fixes

**Date:** 2026-07-27 · **Reviewer:** Claude
**Verdict:** the foundation was substantially delivered. Eight findings were raised; all
eight are now closed, plus three further defects found while closing them.

All fixes landed in the **main worktree** `/Users/ali/edura`, where the foundation actually
lives. Nothing was committed — per the project's git rule, commit messages only.

---

## Where the work is

The foundation is **uncommitted in the main worktree** `/Users/ali/edura` (branch `main`).
It is not on any branch. All `.claude/worktrees/*` sit on `1528c1e` and contain none of it,
including Step 0 and Step 1. A portal session branching from a worktree today gets nothing —
**this must be committed before the five sessions start.**

## The verification gate — now green, for the first time

The brief mandates "typecheck, both builds". None of it could run when this review started.

| Check | Before | After |
|---|---|---|
| `bun install` | **fails**; `node_modules` and the package store both empty | clean, all 7 build scripts run |
| `bun run check-types` | could not run | **6/6 pass** |
| `bun run build` | could not run | **both apps pass** (1m27s) |
| `bun run test:unit` (www) | could not run | **111 passed, 1 skipped** |
| `bun audit` | 22 vulns (1 critical, 9 high) | 13 (1 critical, 5 high) — see open item |

---

## Verified as delivered

| Item | Evidence |
|---|---|
| **A.2** contrast | `--ink-3: #707686`/`#888a84`, `--teal: #0a7a6f` in `globals.css:53,76,154`. Matches D-008/D-009; matrix in `CONSTITUTION.md §6.6`. |
| **A.3** charts | Hardcoded palette gone from `transforms.ts`; wrappers in `packages/ui/src/components/charts/`. |
| **A.4** token shim | `globals.css:181` marks layer 2 a migration shim with reason and an explicit exit path. |
| **B** logical properties | Confirmed, not converted — correctly. **Zero** physical properties in either app's source; the ~26 in `packages/ui` are Radix internals (centering, paired `data-[side]` offsets, `side`-aware rail geometry). All legitimate. |
| **B** icon flip | A **rule**, not a list (D-017), plus `<DirectionalIcon>`. |
| **C** `DataTable` | Three densities, `selectable`, `bulkActions`, `stickyFirstColumn`, `rowHref`, `rowDisabled`, `error` distinct from empty, `labels`. Complete. |
| **C** shim discipline | D-033 holds: `confirm-dialog.tsx` injects i18n; `page-header.tsx`/`combobox.tsx` are one-line re-exports. No call site forced to change. |
| **D** nav | **104 labels across 8 layouts, every one mapped to an i18n key; 104 hrefs, every one resolving to a real `page.tsx`.** Zero untranslated, zero duplicate Arabic values, zero phantom entries. |
| **E** documents | `CONSTITUTION.md`, `DECISIONS.md`, `REQUESTS.md` — standalone and covering the required sections. §2's derivation method and §3's per-role record table do the hard thing the brief asked for. |

---

## Findings, and how each was closed

### 1 — Install broken, `node_modules` destroyed → **FIXED**

Root `node_modules` and the package store were empty; a failed `bun install` had torn the store down.
It failed on policy: the regenerated lockfile carried `@rollup/rollup-*@4.62.3` published
inside the package manager's `minimumReleaseAge` window.

Fixed by `bun run clean --lockfile` + a fresh resolution, plus the two items below that a clean
install then exposed.

### 1a — `overrides` had gone silently inert → **FIXED** *(new)*

The package manager in use at the time (v11) no longer read the legacy overrides field in
`package.json` and warned that it was ignored. That field held the **security clearance for the 13 audit advisories** (`docs/security/security-audit.md`
§7) — so all 8 overrides had quietly stopped applying. Moved to `overrides:` in
the workspace config (their home at the time; now top-level `overrides` in `package.json`)
with the rationale preserved. This alone accounts for
9 of the 22 advisories.

### 1b — 7 dependency build scripts silently skipped → **FIXED** *(new)*

The package manager required explicit approval for dependency build scripts. `@prisma/engines`, `prisma`, `sharp`, `esbuild`,
`@swc/core`, `@parcel/watcher`, `unrs-resolver` were all being skipped — which fails at
*runtime*, not install. Declared in `allowBuilds:`; all seven now run. This is the status quo
ante, not a new grant.

### 2 — Out-of-scope dependency upgrade → **RESOLVED, and it was breaking the build**

The uncommitted tree carried an unattributed sweep: TypeScript 5.9.3 → **7.0.2**, Next
16.2.10 → 16.2.12, React 19.2.7 → 19.2.8, Tailwind 4.2 → 4.3, lucide, recharts.

It was **partial and broken**:

- `packages/server-core` was left at `next@16.2.10` and `typescript@5.9.3`, so two copies of
  Next existed and their `NextResponse` types were structurally incompatible — **9 type
  errors** in `teacher-actor.ts` / `center-actor.ts`. `eslint-config-next` was likewise still
  pinned to `16.2.10`, dragging in the second copy. Both aligned to `16.2.12`.
- **TypeScript 7.0.2 cannot build this app at all**:
  `Error: TypeScript 7.0.2 does not provide the compiler API required by Next.js. Enable
  experimental.useTypeScriptCli … or install TypeScript 6 instead.`
  **Reverted to 5.9.3 workspace-wide** — the version everything was verified against. The
  alternative is enabling `experimental.useTypeScriptCli`, which is a deliberate decision and
  not one this session should make.

The remaining bumps (Next, React, Tailwind, lucide, recharts) are left in place and now
typecheck and build cleanly. **They are still an undecided upgrade sitting in the same
uncommitted blob as the design work — stage design paths explicitly.**

### 3 — No cross-portal archetype matrix → **CLOSED**

Written into `design/DECISIONS.md` as **D-036** (the matrix, declared the single authority
over the portal-brief copies), plus D-037–D-040 for the specific corrections. Verified against
the route tree and import graph. Four brief rows were wrong:

- **Wallet is two archetypes, not one.** Student/parent carry top-up · refund · `balanceAfter` ·
  pay; the teacher screen carries payout requests · withdraw and has **no top-up and no
  refund**. Three briefs say "follow Teacher" — pointing two sessions at a screen missing both
  actions they need.
- **The parent wallet is in nobody's matrix.** `parent-wallet-screen.tsx` is 273 lines, the
  largest of the three, and appears in no brief. The parent session would have found an
  unowned wallet mid-flight.
- **There is no center wallet.** Two briefs list "center" as a wallet portal; `dashboard/admin`
  has fees/expenses/reports and no wallet or payout screen.
- **Notifications, settings and the attendance view are each a *single shared file*** rendered
  by all six portals — not a pattern for four sessions to each derive. The briefs tell four
  sessions they "may be first" on files none of them owns.

### 4 — No worktree plan → **CLOSED**

Written into `CONSTITUTION.md §7`. Ownership table, plus the measured boundary result: the
teacher+assistant and admin+staff pairs are **one session each**, because
`dashboard/assistant` imports **five** screens from `features/teacher` and `dashboard/staff`
imports **seven** from `features/admin`. Split either pair and both sessions edit the same
files. Also a recommendation per shared folder (convert here / assign / defer) with reasoning.

### 5 — Assignments leftovers → **CLOSED**

`student-dashboard.spec.ts` asserted `"Assignments Due"` was visible — the card was removed, so
**the test was failing**. Removed that assertion and the stale `"Due Soon"` one. Removed four
orphan keys (`assignmentsDue`, `dueSoon`, `assignment`, `due`) from superadmin's `{ar,en}/student.json`
(www's copy had already been cleaned).

### 5a — A test that could never fail → **FIXED** *(new)*

The same spec located grade badges by `.ant-tag`. **Ant Design is gone from this repo**, so the
selector matched zero elements and the validation loop below it ran zero times. Repointed to
`[data-slot="status-badge"]` with a non-zero-count assertion. `StatusBadge` was one of the few
`packages/ui` components with no `data-slot` hook (35 have one) — added.

`admin-students.spec.ts:68` has the same dead `.ant-tag` locator. Left alone: it is a
different spec and outside this finding — worth a follow-up.

### 6 — Unnamed table columns → **CLOSED, and wider than reported**

`registrations-queue.tsx` — the file the brief named — had **five** `header: ""` columns, not
three, and was completely untouched. Named all five. A repo-wide sweep then found **seven
more** across six files in both apps. All twelve are now named, via two new shared keys
(`common.colActions`, `common.colStatus`) in both apps and both locales. **Zero unnamed
columns remain.**

### 7 — `DESIGN.md` → **CLOSED**

There was no `DESIGN.md` at the repo root at all — yet all five portal briefs instruct sessions
to find and ignore it. Created it as a dated supersession notice plus a pointer to
`design/CONSTITUTION.md`, deliberately **not** a second copy of the spec — a vocabulary table
lets anyone recognise a stale EduConnect document on sight. Grepping for `#1E3A8A`, `#0D9488`,
`surface-container-`, `on-surface-variant` returns nothing repo-wide, so no other document
needed marking.

### 8 — Nav audit → **CLOSED**

Run and recorded above: 104 labels, 104 routes, all resolving. The three phantom entries the
brief named (AI, «المساعدة المالية», «إدارة الصلاحيات») exist in neither app — nothing to
remove.

> **A correction worth recording:** my first pass at this audit reported 24 unmapped labels in
> www and 13 in superadmin. That was a truncated regex reading `NAV_KEY` (58 and 45 entries
> respectively), not a real defect. Caught before it was reported as a finding. D-034's claim
> holds.

### 9 — Missing imports, two screens → **FIXED** *(new)*

`student-subjects-screen.tsx` and `parent-pay-screen.tsx` both used `Select` / `SelectContent`
/ `SelectItem` / `SelectTrigger` / `SelectValue` with no import — 8 type errors. Added. A
repo-wide sweep confirms no third file has the pattern.

---

## Open — needs your decision, not mine

**`bun audit`: 13 remaining, 1 critical + 5 high.** All are on genuine runtime dependencies,
which is a different situation from the original 13 advisories (`docs/security/security-audit.md`
§7 scoped those explicitly to dev/build-time tooling with "no runtime-path exposure"):

| Severity | Package | Needs | Path |
|---|---|---|---|
| **CRITICAL** | `next-auth` | ≥ 4.24.15 | pinned `4.24.14` in both apps |
| HIGH | `next-auth` | ≥ 4.24.15 | same |
| HIGH | `nodemailer` | ≥ 9.0.1 | via `next-auth` — and the mail layer is on the invite path |
| HIGH | `sharp` | ≥ 0.35.0 | via `next` |
| HIGH | `find-my-way` | ≥ 9.6.1 | via `prisma` dev tooling |
| HIGH | `brace-expansion` | ≥ 5.0.8 | the existing override targets `brace-expansion@1`; this is v5 |

`next-auth` is the auth/session model, which `CLAUDE.md` lists as untouchable and needing its
own plan. I have not touched it. **`CLAUDE.md`'s claim that `bun audit` reports 0
vulnerabilities is no longer true and should be corrected with a date.**

Also outstanding: the **dependency upgrade decision** (finding 2). Next/React/Tailwind/lucide/
recharts are bumped in the uncommitted tree and now build cleanly, but nobody decided that.

---

## Recommended order

1. Decide on the dependency upgrade, and stage it separately from the design work.
2. Address the `next-auth` critical.
3. Commit the foundation — until it is on a branch, the five portal sessions have nothing to
   build against.
4. Pick the shared-folder owners from `CONSTITUTION.md §7` before anyone starts.
