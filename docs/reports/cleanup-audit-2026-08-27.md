# Cleanup & performance audit — Phase 1 (report only)

**Date:** 2026-08-27 · **Baseline commit:** `b305532` (working tree had 20 uncommitted files at
measurement time; none of them touch anything below) · **Status:** ANALYSIS ONLY — nothing was
deleted, moved, or edited to produce this document.

Scope, per Ali's decision: all four apps (`erp`, `superadmin`, `www`, `realtime`) and all seven
packages. This report is the approval gate: Phase 2 deletes only what is marked **YES** below.

---

## 0. Baseline (measured, this commit)

| Check | Result |
|---|---|
| `bun run check-types` | 9/9 workspaces green, 3.7 s |
| `bun run --filter edura test:unit` | 98 files, 1436 passed / 1 skipped |
| `bun run --filter superadmin test:unit` | 7 files, 106 passed |
| `bun run build` (all three Next apps) | green, 1 min 2 s wall |
| `apps/*/public` | erp 1.12 MB / 44 files · www 7.40 MB / 52 files · superadmin 8 KB / 2 files |

**Route census from that build** — this is the anchor every Phase 3 batch diffs against:

| App | ƒ dynamic | ○ static | ● SSG (prerendered params) |
|---|---:|---:|---:|
| erp | **357** | 3 | **0** |
| superadmin | 243 | 1 | 6 |
| www | 1 | 4 | 17 |

erp's three static routes are `/_not-found`, `/manifest.webmanifest`, `/sitemap.xml`. **Every one of
its 122 pages is server-rendered on every request** — including `/help`, `/faq`, `/terms`,
`/privacy`, `/changelog`, `/contact` and `/login`, all of which already declare
`generateStaticParams`. §7 explains why, and it is one line.

---

## 1. Unused files — 25 candidates, 25 confirmed unreferenced

Method: `knip@5` (workspace-aware, with every Next file convention, `middleware`, `instrumentation`,
`sw.ts`, sentry/next/vitest configs **and the test suites** registered as entry points, so
test-only code is never reported dead), then an independent per-file check that greps for the
module's alias specifier (`@/lib/...`) and same-directory relative imports **within that file's own
workspace**. Both passes agree on all 25. The workspace scoping matters: erp and superadmin hold
identically-named shim files, and a naive repo-wide grep marks each one alive because of the other.

### 1a. Extraction leftovers — re-export shims nothing imports (17 files, 2–5 lines each) — **YES**

When the back-office was extracted (Step 2) these services moved into `@repo/server-core` and a
one-line `export * from "@repo/server-core/…"` shim was left at the old path so no call site had to
change. Every call site has since moved to the package. `packages/server-core/src/services/` holds
the live twin of each one.

| File | Shim target |
|---|---|
| `apps/erp/src/lib/services/whatsapp/{index,send,templates,types,phone,mock-driver,cloud-api-driver}.ts` (7) | `@repo/server-core/services/whatsapp/*` |
| `apps/erp/src/lib/services/{sms/sms-channel,fcm/fcm-channel,webpush/web-push-channel}.ts` (3) | `@repo/server-core/services/*` |
| `apps/erp/src/lib/services/sessions/{session-generator,conflict-detector}.ts` (2) | `@repo/server-core/services/sessions/*` |
| `apps/erp/src/lib/services/invites/recipient.ts` | `@repo/server-core/services/invites/recipient` |
| `apps/erp/src/lib/mail/{send,templates}.ts` (2) | `@repo/server-core/mail/*` |
| `apps/superadmin/src/lib/mail/send.ts` | `@repo/server-core/mail/send` |
| `apps/superadmin/src/lib/services/points/points.ts` | `@repo/server-core/services/points/points` |

Deleting a shim removes an alias, not a capability — the implementation is untouched in the package.

### 1b. Superadmin UI shims superseded by `@repo/ui` (6 files) — **YES**

`combobox`, `description-list`, `password-input`, `stat-card` under
`apps/superadmin/src/components/kit/`, plus `charts/index.ts` and `charts/heatmap-calendar.tsx`.
Superadmin's own screens import from `@repo/ui` directly now. **erp's identically-named shims are
still live** (7 erp screens import `@/components/charts`, 8 import `@/components/kit/password-input`)
— they stay. `stat-card.tsx` carries a migration note saying it dies when its call-site count hits
zero; in superadmin it has.

### 1c. Genuinely orphaned code (2 files) — one YES, one NEEDS CONFIRMATION

| File | Lines | Verdict |
|---|---:|---|
| `apps/erp/src/lib/constants/subjects.ts` | 29 | **YES** — a hardcoded English subject list (`SUBJECTS`, `Subject`, `isSubject`). The real subject source is the Egyptian catalog (45 rows); the only other `SUBJECTS` in the app is a private one inside `features/marketing/contact-form.tsx`. |
| `apps/erp/src/features/emulator/first-run-tour.tsx` | 76 | **NEEDS CONFIRMATION** — a working `FirstRunTour` component nothing imports. The live tour is `features/tour/first-run.tsx`. Two files (`apps/erp` and `apps/superadmin` `features/tour/use-tour-gate.ts`) name this file **in a comment** as the reference implementation of the tour contract, so deleting it dangles that comment. Delete + fix both comments, or keep. Your call. |

---

## 2. Unused dependencies

Everything here was re-checked by hand; knip's raw list is roughly half false positives, and they
are false in an instructive way.

### 2a. Safe to remove — **YES** (13 declarations, 0 code changes)

| Workspace | Package | Evidence |
|---|---|---|
| apps/erp | `next-cloudinary` | zero mentions anywhere in the repo |
| apps/erp | `pdf-lib` | erp mentions it only in **comments**; the sole importer is `apps/superadmin/.../invoice-pdf.ts`, which declares it itself |
| apps/erp | `posthog-node` | only `packages/server-core/.../posthog-server.ts` imports it, and server-core declares it |
| apps/erp | `web-push` + `@types/web-push` | only `packages/server-core/.../web-push-channel.ts` imports it (erp's own copy is a dead shim, §1a) |
| apps/erp, apps/superadmin | `recharts` | imported only inside `packages/ui/src/components/charts/*`, which declares it |
| apps/erp, apps/superadmin | `@tanstack/react-table` | imported only by `packages/ui/src/components/data-table.tsx`, which declares it |
| apps/superadmin | `dayjs` | zero mentions in `apps/superadmin/src` (erp uses it in 7 files and declares it) |
| packages/ui | `@hookform/resolvers`, `date-fns`, `zod` | none appear in `packages/ui/src`; the importers (erp) declare all three themselves |
| packages/ui | `next-themes` | unused — but see §8.8: it is the library the 205-line hand-rolled `theme-mode-provider.tsx` reimplements, so "remove it" and "adopt it" are opposite answers. **Decide before Phase 2** |
| packages/server-core | `nodemailer` + `@types/nodemailer` | zero imports in `packages/server-core/src`; the mail transport lives in `packages/notifications` |

### 2b. Reported but **must stay** — false positives worth writing down

| Package | Where | Why knip is wrong |
|---|---|---|
| `@prisma/client`, `@prisma/client-runtime-utils` | packages/database | consumed by the generated client, which is outside the analysed graph |
| `tailwindcss`, `tw-animate-css` | erp, superadmin, www, ui | referenced from CSS (`@import` / `@plugin`), which knip does not parse |
| `@repo/typescript-config`, `@repo/eslint-config` | server-core, notifications, observability, www, ui | consumed through `tsconfig.json` / `eslint.config.mjs` extends |
| `@neondatabase/serverless`, `ws`, `@types/ws` | superadmin | named as strings in `next.config.ts` `serverExternalPackages` |
| `brace-expansion` | root | present **to anchor the security override** (`brace-expansion@1`/`@2` pins from the 2026-07-20 audit fix). Removing it could un-pin a patched transitive |
| `@react-email/components` | packages/notifications | used by `src/templates/layout.tsx`, which five live templates import — flagged for a reachability reason worth one look before touching, so: **NEEDS CONFIRMATION**, low value either way |
| `postcss` (reported *unlisted* in superadmin) | superadmin | `postcss.config.mjs` names it; adding it is a one-line hygiene fix, not a deletion — **NEEDS CONFIRMATION** |

---

## 3. Unused exports — 243 (188 erp, 54 superadmin, 6 www, 1 realtime, 1 database)

**Recommendation: do not sweep these.** Roughly half are exported *types* whose export is the
public shape of a module, and unexporting them is churn with no runtime effect. The subset worth
acting on, in Phase 2 after the file deletions land (many disappear on their own once §1 is gone):

- `apps/erp/src/components/charts/index.ts` — 13 unused re-exports; the file itself stays (7 screens
  import it), only the surface shrinks.
- `apps/erp/src/lib/analytics/transforms.ts` — 7 chart transforms nothing calls.
- `apps/erp/src/lib/pwa/attendance-outbox.ts` — 9, including `clearAttendanceOutbox`.
- Four `features/*/emulator/script.ts` files exporting the same four unused names — that is a
  duplication signal (§5), not four separate deletions.

**`apps/erp/src/lib/services/wallet/wallet.ts` and `parent-wallet.ts` are reported with unused
exports (`walletCredit`, `walletDebit`, `reconcileWallet`, `INSUFFICIENT_WALLET`, …). These are
money primitives. They are NOT on any delete list and will not be touched in this pass** — a
reported-unused money export is a question about call paths, not a cleanup item.

---

## 4. Public assets — nothing to delete

Checked with a matcher that treats an asset as alive if its path, its filename, **or any directory
on its path** is mentioned in source — the directory rule is what covers runtime-built paths like
`/help/${slug}-${locale}.webp`.

- erp: 44 files, 1 unreferenced — `swe-worker-f61931bc2770d10b.js`, a Serwist **build artifact**.
  It should be gitignored rather than deleted by hand — **NEEDS CONFIRMATION**.
- superadmin: 0 unreferenced. www: 0 unreferenced.

www's 7.40 MB under `public/system` is entirely referenced. It is a **Phase 4 compression** item,
not a deletion item.

---

## 5. Duplication (jscpd, ≥8 lines / 70 tokens): 368 clones, 8 810 of 216 934 lines (4.1 %)

Ranked by size. The DRY rule for this pass is "abstract on the 3rd occurrence" — two-app infra
copies are listed because they are byte-identical and drift silently, but each needs your yes.

| Lines | Locations | Note |
|---:|---|---|
| 303 | `apps/{erp,superadmin}/src/lib/refine/data-provider.ts` | identical Refine data provider |
| 158 | `apps/{erp,superadmin}/src/lib/refine/router-provider.ts` | identical |
| 141 | `apps/erp/src/features/{admin,teacher}/emulator/screens.tsx` | emulator/demo surface |
| 128 + 93 | `apps/erp` vs `apps/www` `[locale]/{privacy,terms}/page.tsx` | the legal copy exists twice |
| 122 | `admin/center-staff-screen.tsx` ↔ `teacher/teacher-team-screen.tsx` | staff vs assistants — **different concepts, likely keep separate** |
| 116 + 51 | `lib/observability/csp-report.ts` + `api/v1/security/csp-report/route.ts`, both apps | identical |
| 89 / 75 / 59 / 58 / 58 | `features/tour/guided-tour.tsx`, `components/ui/header-quick-settings.tsx`, `lib/refine/as-record.ts`, `lib/refine/auth-provider.ts`, `features/tour/use-tour-gate.ts` — each duplicated across the two apps | |
| ~800 total | `features/{admin,teacher,student,parent,assistant}/emulator/*` | the emulator screens are heavily copy-pasted between roles |
| 65 / 64 | `parent-wallet-screen` ↔ `student-wallet-screen`, `parent-recent-attendance` ↔ `student-recent-attendance` | two roles, similar shape — check the dedup decisions before merging |

The honest read: the `lib/refine/*` + `csp-report` + `header-quick-settings` + tour cluster is
~700 identical lines across two apps that a `packages/` module would hold once. The emulator
cluster is bigger but is demo surface. The wallet/attendance pairs are the ones most likely to be
"looks the same, is not the same".

---

## 6. Debug code

`console.log` in application source: **4**, all in `apps/realtime/src/server.ts` (a server process
where stdout logging is legitimate, but `@repo/observability` exists). Zero in erp, superadmin, www.
No commented-out code blocks of any size were found — the tree is unusually clean here, and the
20 uncommitted files on main are themselves a comment-stripping pass.

---

## 7. The headline rendering finding (Phase 3 preview, no action taken)

`apps/erp/src/app/[locale]/layout.tsx:143` calls `await getSessionUser()`.

That reads cookies in the **root layout of every page in the app**, which is why all 122 erp pages
build as ƒ despite `generateStaticParams` on the layout *and* on `/help`, `/faq`, `/terms`,
`/privacy`, `/changelog` and `/contact` individually. The value is used for exactly one thing:
handing `AnalyticsProvider` a `{id, role, centerId}` so PostHog can identify the person on the
first render instead of one client round-trip later.

`apps/superadmin/src/app/[locale]/layout.tsx` does **not** make that call — which is precisely why
superadmin's `/login`, `/two-factor` and `/two-factor-setup` prerender as ● while erp's `/login`
does not. The pattern that fixes erp is already running in this repo.

This is a Phase 3 change, gated by the four proofs in the plan. Noting it here because it reframes
the phase: the biggest rendering win is not 122 per-route decisions, it is one line plus the
per-portal work underneath it.

---

## 7b. Phase 2.5 input — hand-written code a built-in or an installed library already covers

Scanned all four apps and all packages. Ranked by lines removed. Nothing here is actioned yet;
anything marked **sensitive** does not move without your explicit yes.

| Where | Hand-written | Replacement | ~Lines | Risk |
|---|---|---|---:|---|
| `packages/ui/.../theme-mode-provider.tsx` | whole theme system — external store, localStorage, `matchMedia`, `data-theme` writing | `next-themes` (declared, unmounted) | 180 | medium — see §8.8 |
| 11 call sites across both apps (onboarding wizards, rooms, import dialog, registrations queue, impersonation banner…) | raw `fetch` + manual `res.ok` + envelope-error lifting | the configured `ky` client already at `src/lib/api/client.ts`, which does exactly that plus timeouts and session-integrity handling | 55 | medium |
| `admin-schedule-screen.tsx`, `sessions/session-time.ts`, `lib/analytics/transforms.ts` | `startOfWeek`/`addDays` via `setDate(getDate()-getDay())` | `dayjs` (already imported in 6 erp files) | 35 | medium |
| 7 dashboards/pages | local `new Intl.NumberFormat` + `/100` + literal `EGP`/`ج.م` | `formatEGP` / `formatShortEGP` / `formatNumber` in `packages/ui/src/lib/format.ts` | 30 | medium (2 are money surfaces — sensitive) |
| `team-notes-board.tsx`, `notifications-screen.tsx` | byte-identical `timeAgo()` minute/hour/day ladder | next-intl `useFormatter().relativeTime()` (Arabic plural agreement comes free) | 24 | medium |
| 5 services incl. `conflict-detector.ts`, `attendance/sync.ts` | `Map` + get/push/set bucketing (`sync.ts` re-spreads each iteration — O(n²)) | `Map.groupBy` / `Object.groupBy` | 25 | low |
| `center-day.ts`, `teacher-dashboard.tsx`, `services/attendance/counter.ts` | three separate Cairo `HH:mm` `Intl.DateTimeFormat` instances | one helper beside `PLATFORM_TIME_ZONE` | 20 | **sensitive** (counter timing) |
| 4 sites | hand-rolled debounce (2 identical hooks + 2 inline `setTimeout` dances) | one shared `useDebounced` in `@repo/ui` (no lodash in the tree — dedupe, not a swap) | 20 | low |
| 3 dialogs | identical time-slot generator loop | one helper next to `formatClock` | 18 | low |
| `apps/realtime/src/internal.ts` | manual `req.on('data'/'end')` body accumulation | `node:stream/consumers` `text()` (keep the 256 KB cap) | 14 | low |
| `invoice-pdf.ts` + `services/finance/invoices.ts` | two near-identical piaster→EGP formatters **that disagree on `maximumFractionDigits`** | one shared server money formatter | 10 | **sensitive** (invoice output) |
| 7 sites | `arr[arr.length - 1]` | `.at(-1)` | 7 | low |
| `admin-fees`, `parent-wallet`, `parent-pay` | inline `Date.now()+Math.random()` idempotency keys duplicating the documented helper | `newIdempotencyKey()` in `features/student/idempotency.ts` | 5 | **sensitive** (payment idempotency; the helper's docblock reserves this to the money owner) |
| `register/page.tsx`, `claim/page.tsx` | inline email regex | `z.string().email()` — zod is already used in the same file | 4 | low |
| `donut-chart.tsx`, `calendar.tsx` | `toLocaleString()` with no locale — silently English under `ar` | `formatNumber(value, locale)` / date-fns with locale | 2 | low, but a visible AR defect |

~14 smaller ones were seen and left out. Deliberately **excluded as domain logic, not reinvention**:
`date-key.ts`'s DST-aware Cairo resolution, `utils/random.ts`'s ambiguity-free alphabet, the contact
form's documented refusal of react-hook-form, and every bare `<img>` — each already carries a
comment saying `next/image` refuses SVG or that Cloudinary optimises it. **That last point retires
the pasted prompt's "replace all `<img>` with `next/image`" item: the 16 `<img>` tags are
deliberate, and I am not converting them without your say-so.**

### One possible real bug, found while scanning (not a cleanup item)

Three functions build a `YYYY-MM-DD` day key and **disagree about which day they mean**:
`features/admin/center-day.ts:24` reads the **UTC** day, `features/sessions/session-time.ts:48`
reads the **local** day, and `todayKey` in `packages/server-core/src/lib/date-key.ts` reads the
**Cairo** day. All three feed session/attendance day matching. `date-key.ts`'s own header says this
pattern "appeared 26 times" and that the module exists to end exactly this. Worth a look
independently of any refactor — for a lesson at 01:00 Cairo, UTC and Cairo are different days.

---

## 8. What needs your decision before Phase 2 starts

1. `first-run-tour.tsx` (76 lines) — delete and fix the two comments that cite it, or keep?
2. `brace-expansion` at the repo root — confirm it exists to anchor the security override (I read it
   that way and am leaving it).
3. `swe-worker-*.js` in `apps/erp/public` — gitignore it as a build artifact?
4. `postcss` unlisted in `apps/superadmin` — add the declaration?
5. `@react-email/components` in `packages/notifications` — verify before touching, or skip?
6. The `lib/refine/*` + `csp-report` + tour + `header-quick-settings` duplication across erp and
   superadmin (~700 identical lines): promote to a package in Phase 2.6, or leave two copies?
7. The legal pages duplicated between `apps/erp` and `apps/www` (221 lines): one source, or
   deliberate?
8. **`next-themes`** — remove it from `packages/ui` as an unused dependency, or adopt it and delete
   the 205-line hand-rolled `theme-mode-provider.tsx`? Adopting it is the bigger win but it changes
   how the theme boots (`theme-init.js` + `data-theme`), which is a behaviour surface. My
   recommendation: **remove the dependency now**, keep the hand-rolled provider — it works, it is
   proven in production, and swapping the theme engine is not what "cleanup" should mean.
9. The three sensitive Phase-2.5 items (Cairo `HH:mm` helper, the two disagreeing invoice money
   formatters, the inline idempotency keys) — approve individually or defer all three?

Everything marked **YES** above — 25 files, 13 dependency declarations — is proven unreferenced by
two independent methods and is what Phase 2 will delete, batch by batch, with
`bun run check-types` + `test:unit` green before each commit.
