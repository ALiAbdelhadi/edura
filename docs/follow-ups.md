# Follow-ups

Things found while doing something else, that are nobody's current task. Each
entry names how it was found, what is true today, and what it would take to close.
**None of these belong to `cleanup/performance`** — they were surfaced by it and
deliberately left out of it.

---

## 1. `bun run lint` has been broken repo-wide, and CI never noticed

**Found:** 2026-08-27, running V6 as a verification gate during the cleanup pass.

`bun run lint` exits **127**:

```
Failed:    @repo/ui#lint, realtime#lint
 ERROR  run failed: command  exited (127)
```

`packages/ui` and `apps/realtime` each declare a `lint` script (`eslint .`) but
neither declares `eslint` as a devDependency, so the binary is not on the path in
those workspaces. This is exactly what `knip` reports as "unlisted binaries (3)" —
the third is `apps/erp/package.json`'s reference to `tools/help-shots/optimise.sh`.

**Why it went unnoticed:** `.github/workflows/ci.yml` runs install → generate →
`check-types` → `test:unit` → `build`. It never runs `lint`. So the repo-wide task
has been failing for as long as those two scripts have existed, with nothing
watching.

**What is under it.** With the two broken workspaces skipped, the surviving
suites are not clean either:

| Workspace | Errors | Warnings | What the errors are |
|---|---:|---:|---|
| `apps/erp` | 62 | many | mostly `react/no-unescaped-entities` (an apostrophe in JSX text), plus one `@typescript-eslint/no-this-alias` |
| `apps/superadmin` | 2 | 69 | React Compiler `Cannot call impure function during render` — `audit-log-screen.tsx:99` and `notifications-screen.tsx:98` |

The two superadmin errors are the interesting ones: the React Compiler rule fires
on something impure being called during render, which is a correctness smell
rather than a style nit, and both files are back-office screens.

**To close:** declare `eslint` in the two workspaces (or drop their `lint`
scripts if they are not meant to be linted), then decide whether the 64 errors are
fixed or the rules relaxed — and add `lint` to CI, because a gate nobody runs is
not a gate.

---

## 2. `bun audit`: 9 → 5. The remaining five are documented, not pending

**Found:** 2026-08-27, verifying that a dependency-removal batch had not changed
the security posture. **Worked 2026-08-27** on `security/audit-2026-08-27`.
Full analysis: [docs/security/dependency-audit-2026-08-27.md](security/dependency-audit-2026-08-27.md).

### The runtime claim in the original entry was wrong

This entry used to close by saying "`posthog-js` is a runtime dependency that
ships to the browser, so the dompurify one is not purely build-time the way the
July batch was." **That does not follow, and the measurement says otherwise.**

`posthog-js` does ship to the browser — `posthog-client.ts` is `"use client"`
and imports it. The error was assuming that a browser-shipped package drags its
whole dependency list into the browser with it. It does not:

- `dist/module.js` — the entry a bundler resolves, since the package has no
  `exports` map — contains **zero** occurrences of `dompurify`.
- dompurify appears in exactly two files, `dist/product-tours.js` and
  `dist/product-tours-preview.js`, and **nothing imports them**. `module.js`
  reaches them through
  `__PosthogExtensions__.loadExternalDependency(instance, "product-tours", cb)`,
  which injects a remote `<script>` from `<api_host>/static/…`.
- Our `api_host` is `/ingest`, a same-origin rewrite to PostHog. So that bundle
  is fetched **from PostHog's servers at runtime**, never from our build. If
  product tours were ever switched on, the browser would run whatever version
  PostHog serves — no pin of ours can influence it.
- No first-party `dompurify` / `DOMPurify` usage exists in `apps/*/src` or
  `packages/*/src`.

**All nine were build-time, CLI-time or server-side.** The one other candidate —
`fast-uri`, which `bun audit` attributes to `workspace:edura › @hookform/resolvers`
— is an artifact of how the audit walks peers: `ajv` is an *optional peer* of
`@hookform/resolvers`, not a dependency, and all 16 call sites in the repo import
`@hookform/resolvers/zod`. The real edge is
`fast-uri ← ajv@8 ← ajv-formats ← schema-utils ← webpack`.

**Do not re-raise posthog-js as a browser-runtime XSS exposure.** Re-check it
only if posthog-js starts importing dompurify from `module.js`, or if we ever
add first-party DOM sanitisation.

### What was applied

Four overrides, all patched **within the same major**, all verified at the
consumer link rather than only at the top of the tree:

| Package | Was | Now | Consumer proven relinked |
|---|---|---|---|
| `dompurify` | 3.4.12 | 3.4.14 | `posthog-js@1.409.5` |
| `fast-uri` | 3.1.4 | 3.1.6 | `ajv@8.20.0` |
| `js-yaml` | 4.3.0 | 4.3.2 | `@eslint/eslintrc@3.3.6` |
| `nanoid` | 3.3.16 | 3.3.18 | `postcss@8.5.23` |

The inert `"uuid@8": "^11.1.1"` override was removed — see below.

Verified: `bun audit` **9 → 5**, `bun run check-types` 9/9, `bun run build`
3/3 apps, erp route census unchanged at **342 ƒ / 3 ○ / 31 ●**.

### The mechanism finding — this is the part worth keeping

**`bun` 1.3.12 silently ignores `"pkg@major"` override keys, and ignores
npm-style nested override objects.** Only a flat, unversioned key works, and
only after `bun install --force` — a plain `bun install` adds the new version at
the top of the tree while leaving every transitive consumer linked to the old
one, which looks like success in `ls node_modules` and is not.

Proven by controlled comparison, same install, same position in the lock:

- `"dompurify": "^3.4.14"` and `"fast-uri": "^3.1.6"` (unversioned) → **moved**.
- `"js-yaml@4"` and `"nanoid@3"` → **did not move**; rewritten unversioned, both
  moved immediately.
- Removing `"brace-expansion@1/@2/@5"` entirely changed **no** resolution, and
  neither did `bun update brace-expansion` or nested
  `{"eslint": {"brace-expansion": "…"}}`.

**Consequence: CLAUDE.md's "Dependency overrides" bullet was wrong about its own
mechanism** — it credited the July cleanup to `minimatch@3`, `brace-expansion@1`,
`brace-expansion@2`, `picomatch@2`, `picomatch@4`, `postcss@8` and `uuid@8`,
and **every one of those keys is inert**. Those advisories cleared because the
packages moved on their own. **Both were fixed 2026-08-27:** the bullet is
rewritten, and all seven keys are REMOVED from `package.json` — a key that does
nothing while looking like protection is worse than no key. Removing the six
survivors and re-resolving left all **1296** lock resolutions byte-identical,
which is the proof it was safe. The root `brace-expansion` *direct dependency*
was kept, but the old rationale for it (that it "anchors" those pins) is void
along with the pins; re-checking it is its own small task.

### The five that remain, and why each stays

- **`brace-expansion` ×3 (high) — cannot be expressed, not deferred.** Two
  vulnerable copies need opposite fixes: `minimatch@3.1.5` → `brace-expansion`
  1.1.16 (needs ^1.1.18) and `minimatch@10.2.5` → 5.0.8 (needs ^5.0.9).
  `minimatch@5.1.9` → 2.1.4 is in none of the three ranges and is already clean.
  Since bun honours only a flat tree-wide key, one version must serve all three
  — and it cannot: v1 does `module.exports = expandTop` (callable), while v5's
  CJS build exports `{EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand}` (an object).
  Measured directly: `require()`ing v5 yields `typeof === "object"`, so
  `minimatch@3`'s `expand(pattern)` at `minimatch.js:10` would throw, taking
  eslint, `eslint-config-next`, `@serwist/next` and `@sentry/nextjs` with it.
  Forcing v1 breaks `minimatch@10` symmetrically. Every path is lint/build
  tooling and the brace patterns fed to it are our own glob configs, so the DoS
  has no untrusted input. **Left as-is deliberately**; it clears when a consumer
  bumps its minimatch.
- **`uuid` (moderate) — not reachable.** GHSA-w5hq-g745-h8pq is a bounds check in
  `v3`/`v5`/`v6` *when `buf` is provided*. `exceljs` imports `{v4: uuidv4}` at
  `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js:1` and calls `uuidv4()` with
  no arguments, at two sites. Neither the affected functions nor the affected
  parameter is used. Server-side only (`settlement-export.ts`, no `"use client"`).
  The fix is a 3-major jump into a CJS consumer; not worth it.
- **`deepmerge-ts` (high) — no in-major fix exists.** 7.1.6 is the newest v7 and
  is still inside `<8.0.0`. `@prisma/config@7.9.0` depends on **exactly `7.1.5`**.
  Stack exhaustion on recursive object graphs, where the input is our own
  `prisma.config.ts` — not attacker-controlled, and a CLI rather than a served
  surface. Clears when Prisma bumps `@prisma/config`.

**To close:** nothing, for these five. Re-run `bun audit` when eslint,
typescript-eslint, glob or prisma next move.

---

## 3. Two superadmin screens call an impure function during render

Sub-item of #1, listed separately because it is a behaviour question rather than
a tooling one: `apps/superadmin/src/features/admin/audit-log-screen.tsx:99` and
`apps/superadmin/src/features/notifications/notifications-screen.tsx:98`. Under
the React Compiler these are errors, not warnings. Worth reading before the next
compiler upgrade decides them for us.


---

## 4. The Playwright suite — three specs revived and wired to CI; two gaps left

**Found:** 2026-08-27, trying to use it as a verification gate. **Worked the same
day.** Full record:
[docs/testing/playwright-revival-analysis.md](testing/playwright-revival-analysis.md).

`helpers.ts` waited on `.ant-layout-content`, gone since the shadcn migration, so
six spec files (not seven — `parent-pay.spec.ts` never used the helper) timed out
before asserting anything. Nothing in CI ran `test:pw`, which is why a suite that
could not pass stayed in the tree: the `db` job's "E2E smoke" step runs
`test:e2e`, a different file (`tests/e2e/smoke.e2e.ts`).

**Done.** Locale pinned; `data-slot="portal-content"` added to the app-shell and
`data-slot="form-error"` to the login banner; `navigateTo` re-pointed;
`auth.spec.ts` **13/13**, `role-guard.spec.ts` **4/4** (its two sidebar tests
DELETED — they asserted an IA the `sidebar-ia` pass replaced),
`navigation.spec.ts` rewritten to **30/30** with real assertions and a
`storageState` setup project. A new `e2e-playwright` CI job runs the three,
**one job per spec**, each on its own runner with its own seeded Postgres.

### 4a. `navigation.spec.ts`'s route lists are stale

Every path it sweeps still exists, but each portal has gained screens since the
lists were written, and the sweep does not see them:

| Portal | Missing from the sweep |
|---|---|
| student | `/subjects` `/reviews` `/wallet` `/subscriptions` `/id` `/messages` |
| teacher | `/attendance` `/door` `/wallet` `/centers` `/team` |
| admin | `/counter` `/checkin` `/collaborations` `/expenses` `/external-teachers` `/staff` `/audit` |
| parent | `/pay` `/wallet` `/oversight` `/subscriptions` |

**To close:** add them a portal at a time and see which fail. Several will —
they need data 4b is about, and the sweep asserts the content region is
non-empty. Widening it is also not free against the rate limit: the sweep already
lands close to better-auth's global 120-requests-per-60s cap, and doubling it may
need the file split across two CI jobs the way the three specs already are.

### 4b. The fixture-blocked specs need a real dev seed

`admin-students`, `teacher-gradebook`, `parent-portal` and `student-dashboard`
are untouched and still fail — on **data**, not selectors. Measured on dev
2026-08-27: **0 centers, 0 courses, 0 enrollments, 0 grades, 0 subscriptions**
against 264 users. Every assertion about a roster, a gradebook, a stats tile or a
payable lesson has nothing behind it. `parent-pay.spec.ts` is blocked the same
way despite never having used the broken helper.

Note this is a DEV problem, not a CI one: the new `e2e-playwright` job seeds its
own container with all four demo seeds, so a spec that needs a course would have
one there. The gap is that dev — where these are actually run and debugged — was
wiped to a production-equivalent state on 2026-07-31 and never re-seeded.

**To close:** run the demo seeds against dev (`bun run seed` + `preview-seed`),
or decide these specs should build their own fixtures per-run. Two of them are
worth the trouble: `teacher-gradebook`'s save/discard dirty-state is the most
valuable assertion in the suite and nothing else covers it, and
`admin-students`' invite-modal validation is real behaviour. Two need rewriting
first regardless — `parent-portal` and `student-dashboard` assert **GPA**, a
metric that no longer exists anywhere in the product (replaced by "Overall" /
"Overall percentage"), and student KPI labels that were renamed.

---

## 5. `bun --bun next start` cannot serve a production build

**Found:** 2026-08-27, standing up a production server to run the rendering gates.

`apps/erp`'s `start` script is `bun --bun next start -p 3003`. Against a current
build it dies loading the middleware bundle:

```
⨯ TypeError: Expected CommonJS module to have a function wrapper.
  If you weren't messing around with Bun's internals, this is a bug in Bun
    at 10846 (.next/server/middleware.js:1:28963)
```

Every request then returns 500. `npx next start` (Node) serves the same build
correctly, which is how the gates were run.

**Why it matters beyond local convenience:** CLAUDE.md's "Runtime: Bun-only
surface" section records `bun --bun next start` as the official production
runtime, proven on 2026-07-31. That proof predates Next 16.3 and the `proxy.ts`
middleware. Vercel does not use `next start`, so production is probably
unaffected — but the claim in CLAUDE.md is no longer true as written, and anyone
self-hosting by following it gets a 500 on every route.

**To close:** re-test after the next Bun or Next upgrade; until then either
correct the CLAUDE.md claim or change the script to Node.

---

## 6. Every portal load produces a `401 /api/v1/me`

**Found:** 2026-08-27, by the gate-4 smoke, which logs non-2xx responses.

All four portals (student, parent, teacher, center admin) emit exactly one
`401 /api/v1/me` on load. It originates in `lib/refine/auth-provider.ts:92` —
`check()` calls `currentSession()` and falls back to `api.get("me")` when the
better-auth client session has not resolved yet, so the fallback fires
unauthenticated and 401s before the session lands.

It is harmless today (the console error is the only symptom; the portal renders)
and pre-existing — the cleanup branch never touched `auth-provider.ts`. But
`docs/decisions/server-side-portal-gate.md` moved the portal gate to the server
specifically to stop the browser asking questions the server had already
answered, and this is one of those questions still being asked.

**To close:** have `check()` await the client session rather than racing it, or
drop the fallback now that the server gate decides entitlement before the portal
renders.

---

## 7. `blacklistCenter` is a complete implementation with no door

> **CLOSED 2026-09-12 — deleted, option two.** Centre-level blacklisting is not
> a capability the platform offers. The deciding evidence was that nothing could
> undo it: `setCenterStatus` refuses to reactivate out of `blacklisted`, and
> `admin-users.ts` answers "Lift the blacklist first" — but a centre has no
> `blacklist_entries` row to lift, because that table targets users. So the
> service was a one-way door that suspended every admin of a centre for good,
> while every other blacklist in the product is reversible by design. Deactivating
> (`POST /api/v1/admin/centers/[id]/status`) already blocks a centre and suspends
> its admins, requires a reason, audits, and can be undone. The misleading
> "use the registration or blacklist flow" message in `setCenterStatus` was
> corrected, and `m15-one-suspension-path.test.ts` now pins three status writers
> instead of four. `blacklisted` survives as a `CenterStatus` enum value no door
> sets; removing it is a migration, and `setCenterStatus` refuses a row still
> carrying it rather than ignoring it.

**Found:** 2026-09-12, by the first `knip` run in this repo
(`bun run check:dead-code`).

`blacklistCenter` (`apps/superadmin/src/lib/services/admin/platform.ts:201`) is
thirty lines of finished, audited logic: it refuses an empty reason, refuses a
centre already blacklisted, sets `centers.status = 'blacklisted'`, suspends
every `center_admin` attached to it, writes a `center.blacklisted` admin audit
row, and notifies. Nothing calls it. Its two siblings in the same file,
`approveCenter` and `rejectCenter`, each have a route
(`/api/v1/admin/centers/[id]/{approve,reject}`); this one does not.

The blacklist surface that does exist is a different thing: the centre
oversight screen's blacklist tab lists `BlacklistEntry[]` for **students at**
a centre (`operations-tabs.tsx:812`), not the blacklisting of a centre itself.
So there is currently no way for a super admin to blacklist a centre, and the
code that would do it sits unreachable.

It was left in place deliberately during the 2026-09-12 cleanup. Deleting
working audited money-adjacent logic, or adding a route that suspends every
admin of a centre, are both product decisions rather than cleanup.

**To close, pick one:**
- wire `POST /api/v1/admin/centers/[id]/blacklist` (`withRole("super_admin")`,
  reason required, audited — the service already does all of it), or
- delete `blacklistCenter` and say in the commit that centre-level blacklisting
  is not a capability the platform offers.

---

## 8. Eight functions in `apps/erp` that nothing calls

> **CLOSED 2026-09-12 — all eight deleted.** None had a natural caller, and each
> was checked against the code that would have used it rather than against the
> tool that flagged it. `ensureTeacherProfile` upserts outside a transaction, so
> neither real caller (`register.ts`, `invite-accept.ts`) could use it — both must
> create the profile atomically with the user. `getUnreadTotal` is a strict subset
> of `getUnreadCounts`, which is wired. `syncGroup` is a manual re-sync door with
> no route; `chat-groups.ts` already calls `syncGroupMembers` on group creation.
> `countDoorRecords` counts door records globally while `useAttendanceSync` counts
> per teacher itself; `clearAttendanceOutbox` is an unwired "drop the offline
> queue". `trackLandingCta` duplicates what the two real CTA sites already do
> through `track(ANALYTICS_EVENTS.LANDING_CTA_CLICKED, …)`. `letterToNumeric` has
> no place in the contract: a letter grade travels the wire as the number 0–4 and
> the server validates it with `numericToLetter`, the inverse.
>
> **`revalidateCatalogCache` was deleted and its absence documented in place**, in
> `catalog-cache.ts`. It could never have worked from here: the catalog is written
> only by `apps/superadmin`, and `revalidateTag` invalidates the cache of the
> process that runs it. Closing that properly needs an internal revalidate
> endpoint over `INTERNAL_API_SECRET`, which is caching work CLAUDE.md defers to
> the post-launch rendering pass. So the 300s expire is now the stated freshness
> guarantee for the catalog in the ERP — a decision, which is what the entry below
> asked for, rather than an accident.

**Found:** 2026-09-12, same `knip` run as #7. Of 75 exports it flagged, 60 were
false positives (used through a deep import rather than the barrel) and most of
the rest were merely over-exported. These eight are declared, complete, and
referenced nowhere at all. None was deleted: each is a capability someone built
and never wired, so removing it is a product decision.

**`revalidateCatalogCache` — the one worth reading.**
`src/lib/services/catalog/catalog-cache.ts:7`. The catalog is cached with
`"use cache"` + `cacheTag(CATALOG_CACHE_TAG)` and a 60s stale / 300s expire
window (`catalog-read.ts:8-10`). This function calls `revalidateTag` on that
exact tag. Nothing calls it, so a catalog edit is visible to the ERP only when
the window lapses.

It is probably stranded by architecture rather than forgotten: the catalog CRUD
lives in **`apps/superadmin`**, and `revalidateTag` only invalidates the cache
of the app whose process runs it. A superadmin mutation cannot reach the ERP's
cache. Closing it needs a deliberate mechanism (an internal revalidate endpoint
on the ERP called by the back office over `INTERNAL_API_SECRET`, the same bridge
`chat-notify` uses), not a function call. Until then the 300s staleness is the
real behaviour, which is defensible for reference data that changes rarely — but
it should be a decision, not an accident.

**The other seven**, each `file:line`, all unreferenced:

| Symbol | Location | What it would do |
|---|---|---|
| `ensureTeacherProfile` | `services/auth/register.ts:306` | idempotent upsert of a missing `teacher_profiles` row |
| `getUnreadTotal` | `services/messages/messages.ts:101` | total unread count across conversations |
| `syncGroup` | `services/messages/messages.ts:265` | group-membership sync |
| `countDoorRecords` | `lib/pwa/attendance-outbox.ts:77` | size of the offline door-checkin queue |
| `clearAttendanceOutbox` | `lib/pwa/attendance-outbox.ts:111` | drop that queue |
| `trackLandingCta` | `lib/observability/analytics-provider.tsx:37` | PostHog event for marketing CTAs |
| `letterToNumeric` | `services/grades/grades.ts:20` | letter grade → number (its inverse `numericToLetter` IS used) |

**To close:** wire the ones that should exist, delete the ones that should not,
and say which in the commit. `bun run check:dead-code` re-lists them.

---

## 9. Five workspaces declare `@repo/typescript-config` and never extend it

> **CLOSED 2026-09-12 — first option.** The five dropped the unused
> devDependency. Declaring and extending now name the same three workspaces
> (`apps/realtime`, `packages/database`, `packages/ui`), so the dependency graph
> stops claiming a relationship that does not exist. Actually extending the shared
> config in ten workspaces stays open as its own change: it rewrites compiler
> options everywhere and belongs in a commit about that.

**Found:** 2026-09-12, by `bun run check:dead-code` on `apps/www`.

`@repo/typescript-config` exists to be inherited through `tsconfig.json`
`extends`. Three workspaces do that and are correct:

| Workspace | extends |
|---|---|
| `apps/realtime` | `@repo/typescript-config/base.json` |
| `packages/database` | `@repo/typescript-config/base.json` |
| `packages/ui` | `@repo/typescript-config/react-library.json` |

Five more declare it as a devDependency but their `tsconfig.json` has no
`extends` at all, so each carries a full standalone compiler configuration:
`apps/www`, `packages/client-core`, `packages/observability`,
`packages/server-core`, `packages/notifications`. (`apps/erp` and
`apps/superadmin` also have no `extends`, but do not declare the dependency
either, so they are merely inconsistent, not wrong.)

Nothing is broken — every workspace type-checks, and `bun run check-types` is
10/10. The cost is that the shared config governs three workspaces out of ten,
so "the repo's TypeScript settings" is not a thing that exists in one place, and
a compiler-option change has to be made seven times.

It was left alone during the 2026-09-12 cleanup because it is a cross-workspace
decision and removing a `workspace:*` dependency rewrites `bun.lock`, which is
not something to slip into an unrelated commit.

**To close, pick one:**
- have the five drop the unused devDependency (smallest change, keeps the
  standalone configs), or
- have them actually `extend` the shared config and delete the duplicated
  compiler options (the reason the package exists).

---

## 10. 272 unreferenced i18n keys — and the blind spot that hid three quarters of them

**Found:** 2026-09-12, wiring `bun run check:i18n-dead-keys`
(`scripts/i18n-dead-keys.ts`, which existed but had no invoker).

> **CLOSED 2026-09-12 — the tool was fixed first, then all 272 keys deleted.**

**The scanner was reading a fraction of each dictionary.** It opened
`messages/en.json` and `messages/ar.json` and stopped there. But neither app
loads only those: each has a `messages/en/*.json` directory too, and its own
`src/lib/i18n/index.ts` decides how every split file is mounted — some under a
namespace (`teacher: teacherEn`), some spread at the root (`...studentEn`).
A filename convention would have been wrong for `apps/erp`, which does both. So
the scanner now reads that loader and rebuilds each dictionary the way the app
assembles it. **erp went from 755 keys scanned to 4366** — the tool had been
reporting on 17% of the app and calling it a clean bill.

That is why the original count of 58 was not a smaller version of this problem;
it was a different measurement.

**Nothing was deleted on the scanner's word.** The reason the first pass refused
to treat its output as a delete list still stands: a key assembled at runtime
cannot be proven dead from one pass, and a wrong deletion puts a raw key on
screen, in Arabic, in front of a centre operator. Two independent checks were
run instead:

1. **Every template-literal key site in both apps was enumerated** and checked
   against every candidate. The composed shapes are `status.${s}`, `roles.${r}`,
   `${stem}_one|_two|_few|_many`, `blacklist.level_${l}`, `steps.${id}.title`
   and about twenty more — none of which can build a `*Fail`, `*Error` or
   `need*` key. The `ac_*` / `op_*` / `pp_*` / `pf_*` shape that made the first
   pass cautious turned out to be manual namespacing inside `oversight.*`, not
   composition. Two sites use a runtime *namespace* (`useTranslations(asKey(ns))`,
   both in `guided-tour.tsx`) and they read `steps.<id>.*`; the dead
   `shared.tour*` keys belong to the tour implementation that one replaced.
2. **A whole-repo substring search** for each candidate's leaf, over every file
   type including tests. 223 of 272 occur nowhere at all. The other 49 are
   coincidences — `approveFailed` a local variable, `security.actionFailed` a
   different key, `form.clearErrors` a React Hook Form method, and common words
   like `duration`, `score`, `language`.

**What they were.** Mostly per-screen failure strings orphaned by the UI-state
overhaul, which moved error text to the shared `apiErrorMessage` (code →
localized) in `packages/ui`; plus the previous guided tour's labels, an
`adminHome.dashboard_*` family from a rewritten dashboard, and erp's
`landing.hero.*` / `landing.how.*`, left behind when the landing page moved to
`apps/www`.

**The compile-time net matters here.** `Messages = typeof enMerged`, so any
literal `t("deletedKey")` becomes a type error. `bun run check-types` recompiled
both apps and stayed 10/10 after 544 removals (272 keys × two locales), which is
what turns "we grepped carefully" into a check.

The scanner also grew the header it had been missing — the closing line said
"see the header" and pointed at nothing, the comment having been removed in the
2026-08-28 comment strip.

---

## 11. The Neon retry proof runs nowhere and reports PASS

> **CLOSED 2026-09-12 — first option, made loud.** `tx-retry-boundary.test.ts`
> now exits `SUITE_SKIP_EXIT` (3, exported from `db-guard.ts`) instead of 0, and
> `run-db-suites.ts` prints a SKIP badge, counts the suite as `declined`, and says
> so in its closing note: *"1 suite(s) DECLINED to run here and proved nothing"*.
> A declined suite is excluded from the `unparsed` tally and from the
> infra-blip retry, so the runner neither re-runs it nor scores it green. The proof
> still has to be run against Neon to mean anything —
> `bun run db:neon:env && bun run test:db --only tx-retry-boundary` — but it can no
> longer report PASS for work it did not do.

**Found:** 2026-09-12, from the DB runner's own closing note —
`2 suite(s) printed no "N passed, M failed" line and were scored by exit code
only`.

`apps/erp/tests/db/tx-retry-boundary.test.ts` begins with
`if (process.env.DATABASE_DRIVER === "pg")`, prints `SKIPPED`, and exits 0. The
runner records **PASS**. The suite's own message explains why it refuses: it
drops a real Neon WebSocket to prove the COMMIT-window retry boundary, and a
plain Postgres connection has no socket to drop, so the proof would be vacuous.

`DATABASE_DRIVER=pg` is set in both local `.env.test` files and on all three DB
jobs in `ci.yml`. **So the proof never executes, anywhere, and shows green in
both places.** The fix it guards is real: dropped Neon WebSockets reaching
Prisma as non-Errors killed whole suites, which is why the retry boundary
exists.

The other suite in that note, `h1-payout-race.test.ts`, is sound — it prints no
count line but sets `process.exitCode` from the proof result, so it can fail.

**To close, pick one:**
- exit non-zero when it cannot run, so the gap is loud (CI goes red until
  someone runs it against Neon, which is the point of a proof), or
- run it on a schedule against the Neon test branch
  (`bun run db:neon:env && bun run test:db --only tx-retry-boundary`), or
- accept it and leave the note in `CLAUDE.md`, knowing the retry boundary is
  unproven by CI.

---

## 12. A demo seed permanently edits non-demo platform money config

> **CLOSED 2026-09-12.** `room-rate-demo-seed.ts` no longer creates or updates
> the `scope: "global"` `commission_settings` row. It gives OFOK a centre-scoped
> cap, and only when the platform has none, so running the demo seed can no longer
> flip `hall-booking` A4 red by filling in a globally-scoped value that A4 asserts
> is absent. No `is_demo` purge was needed because the seed no longer writes
> anything a purge would have to reverse.

**Found:** CLAUDE.md has warned about this since 2026-08-28; confirmed still
loaded on 2026-09-12 while wiring the seed scripts.

`packages/database/prisma/room-rate-demo-seed.ts:195,203` writes
`centerPerStudentBp: FALLBACK_GLOBAL_BP` onto the **global**
`commission_settings` row, and the `else if` branch fills that column in even
when the row already exists.

That row is platform money configuration, not demo data. It carries no
`is_demo` flag, so **no demo purge reverses it** — `bun run seed:roomrate-demo`
leaves a permanent edit to how the platform splits money behind. It also makes
`hall-booking` A4 go red, because that assertion only holds while the value is
absent, which is how ten days were once lost to a withdrawn "known-and-fine"
note in `CLAUDE.md`.

**To close:** have the seed scope the rate to the centre or room it is
demonstrating (both are supported — `room > center > global`) and never touch
the `global` row; or, if a global fallback is genuinely needed for the demo,
write it, record the previous value, and restore it in the same script's purge
path.

---

## 13. Four `@repo/ui` components no app imports, and one of them is a fork

> **CLOSED 2026-09-12.** The fork (`wordmark.tsx`) and `lib/chart-tokens.ts` were
> deleted; the others were kept and are reachable. Verified by consumer, not by the
> tool: `edura-mark` looked like fourteen uses and was two — the other twelve hits
> were the static `.svg` asset of the same name.

**Found:** 2026-09-12. `knip` cannot see this: every file under
`packages/ui/src` is a public entry point via the `"./components/*"` export, so
nothing there can ever be reported unused. The question has to be asked from
the consumer side — which components do the apps actually import.

`breadcrumb`, `radio-group`, `slider`, `wordmark` are imported by no app and no
package. (Two looked referenced and are not: the only "breadcrumb" hit is
Sentry's `beforeBreadcrumb`, and the only "radio-group" hit is Radix's
`DropdownMenuRadioGroup` inside `dropdown-menu.tsx`. Different words.)

**Three of them are ordinary inventory.** `breadcrumb`, `radio-group` and
`slider` are shadcn primitives, and a copy-in design system holding a primitive
nobody has needed yet is normal. They cost nothing at runtime. Deliberately not
deleted: `CLAUDE.md`'s design rules say additions and refinements are fine but
silent deletions are not, and re-adding one is a single CLI command.

**`wordmark` is different — it is a fork.** `packages/ui/src/components/wordmark.tsx`
exports a `Wordmark` taking a `Locale` and full span props. Nothing imports it.
Meanwhile `apps/www/src/components/mark.tsx` defines its own simpler `Wordmark`,
and neither the ERP nor the back office renders a wordmark component at all.
So the shared design system carries a branding component that lost to a local
copy, which is exactly the drift a shared package exists to prevent.

**To close, pick one:** have `apps/www` import the shared component (and give it
whatever props the marketing type scale needs), or delete the shared one and
accept that the wordmark is a marketing-site concern. Either is fine; carrying
both is the problem.

**Adjacent, not a defect:** 10 components are imported by exactly one consumer
(9 by erp, 1 by superadmin). That is a fair question for a *shared* package but
not a bug, and moving them would be churn.

---

## 14. `portalForRole` is derived twice

> **CLOSED 2026-09-12.** `packages/server-core/src/auth/login-policy.ts` now owns
> the single map (`PORTAL_SEGMENT_BY_ROLE` + `portalSegmentForRole`), beside
> `canSignIn`, because "which app may this role sign into" and "where does it land
> inside" are the same class of question. The ERP's `PORTAL_BY_ROLE` and
> `uiRoleForRole` are derived from it rather than agreeing with it by hand, so a
> seventh role is added in one place instead of three.

**Found:** 2026-09-12, comparing functions exported by both `server-core` and an
app. Only two names collide across 121 kernel modules, and one of them
(`listCollaborationRequests`) is a genuine pair — the kernel's takes a
`SessionUser` and scopes to that teacher or centre, the back office's takes
filters and reads platform-wide. Different questions, correctly separate.

`portalForRole` is the real one. `packages/server-core/src/services/notifications/deep-link.ts:179`
returns a portal NAME (`center_admin → "admin"`, `center_staff → "staff"`, the
rest map to themselves). `apps/erp/src/lib/auth/portal.ts:12` returns a portal
PATH from `PORTAL_BY_ROLE` (`center_admin → "/dashboard/admin"`, …).

They agree today — I compared all six roles and the mapping is identical, only
the return shape differs. The cost is that the role-to-portal mapping is written
twice, in two packages, with nothing tying them together. Add a seventh role and
you must remember both; miss one and either a notification deep link or the
portal gate sends that role somewhere wrong.

Small, and both are correct right now, which is why it is here rather than
fixed. **To close:** have the kernel own the segment map and let the ERP derive
its path from it (`/dashboard/${segment}`), so there is one list of roles.

---

## 15. Five packages are never linted, including the shared kernel

> **CLOSED 2026-09-12.** `packages/{server-core,database,client-core,notifications,observability}`
> each gained an `eslint.config.mjs` and a `lint` script. `bun run lint` is now
> 10/10 tasks with 0 errors.

**Found:** 2026-09-12, sweeping the two config packages.

`bun run lint` prints `Running lint in 12 packages` and then
`Tasks: 5 successful, 5 total`. Turbo runs the task only where it is defined,
and only five workspaces define it: the four apps and `packages/ui`.

Never linted, because they have neither a `lint` script nor an
`eslint.config.*`:

| Workspace | What is in it |
|---|---|
| `packages/server-core` | **the shared kernel — 121 modules of money, auth, validation** |
| `packages/database` | Prisma client, RLS wrappers, extensions, seeds |
| `packages/client-core` | shared client hooks |
| `packages/notifications` | mail / WhatsApp / push egress |
| `packages/observability` | Sentry + PostHog wiring |

(The two config packages are also unlinted, which is fine — they hold config,
not source.)

This is not a silent failure in the sense of hiding a known bug; typecheck at
10/10 and the DB suites cover behaviour. But every ESLint rule the four apps are
held to — the `@typescript-eslint` set, unused-expression checks, whatever the
shared config enforces — stops at the package boundary, and the money engine is
on the far side of it.

**To close:** add `"lint": "eslint ."` plus an `eslint.config.mjs` extending
`@repo/eslint-config/base` to each of the five. Expect a first run to be noisy;
do it one package at a time so the diff stays readable, and start with
`server-core`.

**Two shared configs for Next apps that no Next app uses**, found in the same
sweep and worth deciding alongside:

- `packages/eslint-config/next.js` (exported as `./next-js`) — zero consumers.
  All three Next apps use `./next-app`, which builds on `eslint-config-next`
  directly rather than on this file. Superseded, with a live replacement.
- `packages/typescript-config/nextjs.json` — zero consumers, because no app
  `extends` anything (see #9). **Do not delete this one**: if #9 is closed by
  having the apps inherit the shared config, this is the file they would
  inherit.
