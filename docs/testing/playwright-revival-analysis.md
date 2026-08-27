# The Playwright suite — what is dead, what is worth reviving

Analysis 2026-08-27, branch `test/playwright-revival-analysis`. Follow-up:
[docs/follow-ups.md](../follow-ups.md) entry 4.

**Steps 1–4 are DONE, and `navigation.spec.ts` is rewritten** — see the two
sections at the end. `auth` 13/13, `role-guard` 4/4, `navigation` 30/30 clean.
Step 4 (fixtures) and step 6 (CI) remain, and the four fixture-blocked specs are
untouched.

---

## First: three facts in follow-up #4 are wrong

| Claim | Actual |
|---|---|
| "Seven of the nine spec files call that helper" | **Six** call `navigateTo`. The 18 call sites is right. |
| `parent-pay.spec.ts` is one of the seven | It does **not** import `./helpers` at all. Its two `.ant-*` hits are inside a header comment saying it deliberately avoids them. |
| `auth.spec.ts` is unaffected | It imports `login`/`quickLogin` but never `navigateTo`, so it does not hang — yet 2 of its 12 tests assert on `.ant-alert*` and can never pass. |

Actual `navigateTo` callers: `navigation` (4), `student-dashboard` (5),
`parent-portal` (4), `role-guard` (2), `admin-students` (2),
`teacher-gradebook` (1).

## Second: the selector is not the blocker. The data is.

Read-only census of **dev** (2026-08-27), the database the suite runs against:

```
users 264 · student_profiles 92 · sessions 302
centers 0 · courses 0 · enrollments 0 · grades 0
subscriptions 0 · attendance_records 0 · center_staff 0
```

All four fixture accounts in `helpers.ts` exist and are `active` (`is_demo=true`),
so **login works** — that is why `render-gates.spec.ts`, which needs nothing but a
session, passes today. But there is **no center, no course, no enrollment and no
grade in the entire database.** Every assertion about a roster, a gradebook, a
stats tile or a payable lesson has nothing behind it.

**Fixing every selector in this suite would revive the navigation and auth specs
and almost nothing else.** Whoever picks this up should treat fixtures as the
first task, not the last.

(`admin@nile-academy.eg` is a `center_admin`, and there are zero centers. Note
also that two probes minutes apart counted 240 then 264 users — something else
was writing to dev at the time. Re-measure before trusting a number here; see the
"dev-DB suite interference" note in the memory index.)

## Third: `.ant-layout-content` has no drop-in, and #4's suggestions do not exist

Follow-up #4 proposes "`main`, or the portal chrome's `[data-portal]`". Measured:
**there is no `<main>` in the portal chrome, and `data-portal` is unrelated** — it
is set on `<html>` by the admin ledger's `portal-scope.tsx` for CSS scoping only.

The element that actually replaced `.ant-layout-content` is in
[app-shell.tsx:667](../../packages/ui/src/components/app-shell.tsx#L667):

```tsx
<div tabIndex={0} role="region" aria-label={translateNav(screenLabel)} …>
  {children}
</div>
```

So the literal equivalent is `getByRole("region")`. Two better options, because
that label is per-screen and the role is generic:

1. **`page.getByRole("heading", { level: 1 })`** — every portal screen renders
   `<PageHeader>`, which is the only `<h1>` ([page-header.tsx:29](../../packages/ui/src/components/page-header.tsx#L29)). It waits for the screen's own content rather than for its frame.
2. **Add one `data-slot="portal-content"`** to that div. One line, and the whole
   suite gets a stable anchor that is not an accident of styling. Recommended.

### Full selector map

| AntD selector | Replacement | Note |
|---|---|---|
| `.ant-layout-content` | `[role="region"]`, or `getByRole("heading",{level:1})` | see above |
| `.ant-spin-spinning` | `[role="status"]` (`spinner.tsx:8`) | but see `waitForTableLoad` below |
| `.ant-menu` | `[data-slot="sidebar"]` / `[data-slot="sidebar-menu"]` | |
| `.ant-table` | `[data-slot="table"]` | |
| `.ant-table-row` | `[data-slot="table-row"]` | |
| `.ant-card` | `[data-slot="card"]` | |
| `.ant-card-head-title` | `[data-slot="card-title"]` | |
| `.ant-alert` / `.ant-alert-error` | `[data-slot="alert"]`; the login error is `role="alert"` (`login/page.tsx:246`) | |
| `.ant-tag` | `[data-slot="status-badge"]` | already done once, in `student-dashboard.spec.ts:46` |
| `.ant-select*` | `[data-slot="select"]` / `getByRole("combobox")` | |
| `.ant-input` | `[data-slot="input"]` | |
| `.ant-input-search-button` | a plain `getByRole("button")` | no equivalent component |
| `.ant-statistic-content-value` | **none** | `stat-card-legacy.tsx` and `metric-card.tsx` carry no `data-slot` and no role. Assert on text, or add a slot. |

## Fourth: two cross-cutting traps that a selector swap would not fix

**Locale is unpinned, and the default is Arabic.** `routing.ts` sets
`localePrefix: "always"` with `defaultLocale: "ar"`. Every path in the six broken
specs is unprefixed (`/dashboard/student`), so the landing locale is decided by
the browser's `Accept-Language` and `localeDetection: true`. `playwright.config.ts`
sets no `locale` in `use`. It happens to work while Chrome sends `en-US`; every
English string assertion in the suite rests on that. `render-gates.spec.ts` and
`parent-pay.spec.ts` both hardcode `/en/` — copy that, or pin
`use: { locale: "en-US" }`.

**Several tests are vacuous and would stay vacuous.** A selector that matches zero
elements makes `toHaveCount(0)` trivially true and makes
`if (await x.isVisible().catch(() => false))` skip the body silently:

- `navigation.spec.ts` — all 26 tests assert only `.ant-alert-error` count 0. That
  passed under AntD's absence and asserts nothing.
- `teacher-gradebook.spec.ts` — 3 of 5 tests are wrapped in `isVisible()` guards.
- `admin-students.spec.ts` — the approve/decline test is guarded the same way.
- `auth.spec.ts` — the last test waits for `/(login|dashboard)/`, which matches
  either outcome.
- `helpers.ts` `waitForTableLoad` ends in `.catch(() => {})`, so it already
  resolves unconditionally and has never waited for anything.

Reviving these means **rewriting the assertions**, not re-pointing the selectors.
A green run that proves nothing is worse than the current red one.

---

## Per-spec verdict

### ✅ Revive first — no fixtures needed

**`auth.spec.ts`** (12 tests, not hanging) — login page render, invalid
credentials, empty fields, 4 manual logins, 4 quick-logins, unauthenticated
redirect. *Still worth covering:* **yes, highest value in the suite.** It is the
only browser-level coverage of the better-auth login door, and the fixture users
all exist, so it can pass today. *Work:* swap `.ant-alert*` → `role="alert"`; make
the last test assert `/login` rather than either-or. Note the quick-login tiles
are dev-only by design (`NODE_ENV !== "production"`), which is fine for a dev run.

**`role-guard.spec.ts`** (5 tests) — 3 cross-portal redirect tests + 2 sidebar
tests. *Still worth covering:* **yes for the redirects** — they now exercise the
server-side `requirePortal` gate, a real security boundary that moved recently
(`server-side-portal-gate`), and they need no data. *Work:* replace
`waitForTimeout(3_000)` with an assertion on the redirected URL; that pattern is
flaky and slow. **The 2 sidebar tests should be dropped or rewritten from
scratch:** they assert a flat menu with "Overview"/"Students"/"Teachers", and the
sidebar was regrouped into labelled groups by the `sidebar-ia` pass, so those
labels describe an IA that no longer exists. They also duplicate what the
redirect tests prove.

**`navigation.spec.ts`** (26 tests) — a route smoke sweep per role. *Still worth
covering:* **yes, and it is the best value-per-line in the suite** — but as a
rewrite, not a repair. Its assertion is vacuous (above), and its route lists are
stale: student is missing `/subjects`, `/reviews`, `/wallet`, `/subscriptions`,
`/id`, `/messages`; teacher is missing `/attendance`, `/door`, `/wallet`,
`/centers`, `/team`; admin is missing `/counter`, `/checkin`, `/collaborations`,
`/expenses`, `/external-teachers`, `/staff`, `/audit`; parent is missing `/pay`,
`/wallet`, `/oversight`, `/subscriptions`. **Every path the spec currently names
still exists** — nothing was removed, only added. *Work:* assert an `<h1>` renders
and collect console errors, the way `render-gates.spec.ts` already does.

### ⚠️ Worth reviving, but blocked on fixtures

**`admin-students.spec.ts`** (6 tests) — roster stats, table, name search, the
invite-student modal's email validation, and the enrollment-requests page. *Still
worth covering:* **yes** — the invite validation is real behaviour and the flow is
intact: `/dashboard/admin/students` and `/dashboard/admin/enrollment-requests`
both exist, and "Total Students", "Pending Requests", "Blacklisted" and
"Search by name or email" are all still in the app. *Gotcha:* the modal title is
now **"Invite Student"**, capitalised (`admin-home.json:25`) — `getByText` is
case-sensitive, so use a regex. *Blocked:* needs a center with students; dev has
neither.

**`teacher-gradebook.spec.ts`** (5 tests) — course auto-select, grade table, save
disabled until edited, discard restores, switching course clears edits. *Still
worth covering:* **yes — the dirty-state behaviour is the most valuable assertion
in the whole suite** and nothing else covers it. *Work:* heaviest AntD dependency
here (9 selectors); and 3 of 5 tests must lose their `isVisible()` guards or they
will keep reporting green while asserting nothing. *Blocked:* 0 courses.

**`parent-pay.spec.ts`** (2 tests) — **not in scope of the helper problem at all**,
but listed here because it is blocked by the same missing data: it requires an
approved child with a payable course, and asserts a payable course is found. It
will fail on data, not on selectors.

### ✂️ Contains flows that no longer exist

**`parent-portal.spec.ts`** (7 tests) — splits cleanly in two.
*Keep:* the child-linking half — "Link a Child", "My Children", "By Family Code",
"By Email or Phone" all still exist, and `/dashboard/parent/children` is live.
*Rewrite:* the progress half asserts **"Overall GPA"**, and **GPA no longer exists
anywhere in the product** — `parent.json` now has `overall` / `overallPercent`
("Overall", "Overall percentage") and a band-with-count reason string. The metric
was replaced by an overall percentage, so the test describes a removed concept,
not a broken selector. "Attendance Rate" and "Subject Breakdown" survive.
*Note:* `.ant-statistic-content-value` has no replacement anchor at all.

**`student-dashboard.spec.ts`** (5 tests) — partially modernised already (someone
fixed the `.ant-tag` → `[data-slot="status-badge"]` line and left a good comment).
*Three assertions name labels that are gone:* the KPI tiles are now
**"Attendance"** and **"Average"** (`student.json:8-9`), not "Attendance Rate" and
"Average Grade"; **"Unread Messages" does not exist anywhere**; and the grades page
asserts **"Overall GPA"**, removed as above. *Keep:* "Today's Schedule",
"Subject Grades", the column-header assertions and the grade-letter validity loop
— all still real.

---

## Suggested order

1. **Pin the locale** in `playwright.config.ts` (`use: { locale: "en-US" }`) or
   prefix every path with `/en`. One line; without it everything else rests on a
   browser default.
2. **Add `data-slot="portal-content"`** to the app-shell content div, then rewrite
   `navigateTo` against it and delete `waitForTableLoad` (it has never waited).
3. **Revive `auth` + `role-guard` redirects + a rewritten `navigation`.** These
   need no fixtures and would give the repo a real E2E gate immediately.
4. **Decide the fixture story** — a seeded center with a course, a roster and
   grades, or per-spec setup. Nothing in the ⚠️ group can run until this exists.
5. **Then** `admin-students`, `teacher-gradebook`, and the two half-specs.
6. Add `test:pw` to CI once step 3 is green — per follow-up #1, a gate nobody runs
   is not a gate, and that is exactly how this suite rotted.


---

## What was done (2026-08-27)

Steps 1–4 of the order above, and nothing else. `bun run check-types` 9/9 (the
specs are inside `**/*.ts`, so they are typechecked) and `bun run build` 3/3, both
forced; erp census unchanged at 342 ƒ / 3 ○ / 31 ●.

| Spec | Result |
|---|---|
| `auth.spec.ts` | **13/13** — 12 clean + 1 flaky (green on retry) |
| `role-guard.spec.ts` | **4/4 clean** |

Run them against a dev server, not whatever is on 3002:

```bash
PW_BASE_URL=http://localhost:3099 bunx playwright test auth role-guard --project=chromium
```

1. **Locale pinned** — `use: { locale: "en-US" }`.
2. **`data-slot="portal-content"`** on the app-shell content div, plus
   **`data-slot="form-error"`** on the login error banner (not planned, but
   required — see below).
3. **`auth.spec.ts` revived**; `helpers.ts` `login`/`quickLogin` go to `/en/login`.
4. **`role-guard.spec.ts` cut to the four redirect tests.** The two sidebar tests
   were DELETED, not re-pointed: they asserted a flat `.ant-menu` of
   "Overview"/"Students"/"Teachers" and the `sidebar-ia` regroup replaced that IA,
   so re-pointing would have tested markup nobody designed. `waitForTimeout(3_000)`
   is gone — the gate sends a wrong-role caller to THEIR OWN portal
   (`portal-gate.ts:41`), so that exact destination is now asserted, which
   `not.toContain(forbidden)` never did (it also passed on an error page).
   A fourth test was added for the signed-out case.
5. **`navigateTo` re-pointed** at `[data-slot="portal-content"]` and proven to
   resolve. `waitForTableLoad` is still untouched and still a no-op.

### Four things the runs discovered

**A production server was squatting on port 3002.** `next start -p 3002` loads
`.env.production` — the **production database**. `reuseExistingServer: true` makes
Playwright adopt it silently, so every fixture login is refused and the dev-only
quick-login tiles are correctly absent. `playwright.config.ts` now honours
`PW_BASE_URL`. Check what is answering on the port before blaming a spec.

**`getByRole("alert")` is never unique.** Next renders its own always-present
`<div role="alert" id="__next-route-announcer__">`, so the bare role fails
Playwright strict mode. That is why the login banner needed
`data-slot="form-error"`.

**A redirect surfaces as `net::ERR_ABORTED` on `page.goto`.** Both the portal gate
and the locale middleware redirect while the navigation is in flight, which
supersedes it. `role-guard` and `navigateTo` both navigate with
`waitUntil: "commit"` and tolerate that specific error — documented at both call
sites, and safe because the assertion that follows proves where the browser
actually landed.

**THE SUITE TRIPS ITS OWN LOGIN RATE LIMITER, and this bounds how it can ever be
structured.** `auth.ts:174` sets better-auth's
`rateLimit.customRules["/sign-in/email"] = { window: 60, max: 20 }` — 20 sign-ins
per minute per IP. Measured directly against the dev server: attempts 1–19 return
200, attempt 20 onward returns **HTTP 429**. `auth.spec.ts` alone makes ~10 sign-in
POSTs and `role-guard.spec.ts` 3 more, so running them together (plus a retry) can
exceed it, and the failure looks like a wrong password rather than a limit.

Two consequences:

* **Any spec that logs in merely to *have* a session should use Playwright
  `storageState`** — sign in once per role, reuse the cookie. That is the only way
  `navigation.spec.ts` (26 logins) or the fixture-blocked specs can ever run in one
  pass. `auth.spec.ts` is the exception: logging in IS what it tests.
* **A rate-limited user is told their password is wrong.** better-auth's built-in
  limiter answers `{"message":"Too many requests. Please try again later."}`, which
  the login page's error mapping does not recognise, so it falls through to the
  generic "Invalid email or password". The page *has* a `RATE_LIMITED` branch, but
  it only matches the custom C2 hook's typed error, and the built-in limiter fires
  first. Not fixed here — flagged.

### One consequence to decide, deliberately not acted on

**RESOLVED — see the next section; the file was rewritten.** What follows is
the problem as it stood.

Re-pointing `navigateTo` meant **`navigation.spec.ts` PASSED — vacuously.**
Proven: `/dashboard/student/grades` went from a 20s timeout to green in 3.8s, and
its only assertion is `.ant-alert-error` count 0, which is trivially true with AntD
gone. All 26 of its tests are in that state, and the four fixture-blocked specs
will now fail on their real assertions instead of hanging on a selector — which is
better, but noisier. **Nothing was changed in those five files.** Rewriting
`navigation.spec.ts`'s assertions is the next decision, and it is a decision, not a
mechanical repair.


---

## `navigation.spec.ts`, rewritten (2026-08-27)

**30/30 clean** (4 setup + 26 tests, 1.6 min, zero flaky), from a drained rate
limit window. `check-types` 9/9, `build` 3/3, census 342 ƒ / 3 ○ / 31 ●.

### Sessions come from a setup project, because of a rate limit

`tests/playwright/auth.setup.ts` signs in once per role and parks the sessions in
`playwright/.auth/*.json` (gitignored — they are real cookies). A `setup` project
in `playwright.config.ts` runs it, and `chromium` depends on it, so any spec can
opt in with `test.use({ storageState })`. `auth.spec.ts` deliberately does not:
signing in is what it tests.

This is not a speed-up. The old file signed in before all 26 tests, and
`auth.ts:174` caps `/sign-in/email` at 20 per minute per IP, so it could never
complete a pass — and the failure presents as "Invalid email or password", not as
a limit. Four logins now cover the whole file.

### The assertions are new work, not a rename

The old file's only assertion, once per test, was
`expect(page.locator(".ant-alert-error")).toHaveCount(0)` — trivially true with
AntD gone. `[data-slot="alert"]` count 0 would have been just as true on a page
that never rendered. Each test now proves three things:

1. **The role could reach it** — the URL is still the requested path. The server
   gate bounces a caller to their own portal, to `/onboarding` or to `/login`, and
   every one of those renders a perfectly healthy page. Without this, a suite of
   redirects passes as a suite of working screens.
2. **The screen rendered, not just the shell** — the portal content region is
   present *and non-empty*. An empty region is what a crashed screen inside a
   working layout looks like.
3. **Nothing threw** — no uncaught page error, no console error, filtered exactly
   as `render-gates.spec.ts` filters (optional-asset 404s and 401s from optional
   probes are noise; hydration and identity failures are not). This is the
   "without errors" the file's title always claimed and never checked.

**Both were falsified before being trusted**, because "it passes" was the old
file's problem:

| Injected fault | Result |
|---|---|
| `/dashboard/admin/fees` added to the **student** list | **fails** — "student was redirected away from /dashboard/admin/fees"; the same path in the admin list passes |
| `/dashboard/student/no-such-screen` added | **fails** — no content region ever appears |

The route lists are unchanged on purpose. Every path in them still exists, but
each portal has gained screens since they were written (student `/subjects`
`/reviews` `/wallet` `/subscriptions` `/id` `/messages`; teacher `/attendance`
`/door` `/wallet` `/centers` `/team`; admin `/counter` `/checkin`
`/collaborations` `/expenses` `/external-teachers` `/staff` `/audit`; parent
`/pay` `/wallet` `/oversight` `/subscriptions`). Widening the sweep is a separate
decision — several of those need data this database does not have.

### The recurring flake is fixed at its cause

Every earlier run had one flaky login (student, then parent, then teacher —
never the same one twice). It was the dev server's first Turbopack compile of
that portal blowing `login()`'s 30s `waitForURL`. `login()` now takes a timeout,
`auth.setup.ts` passes 90s, and the `setup` project gets a 120s test timeout — so
setup absorbs every portal's cold compile once and later specs arrive warm. The
confirming run had zero flakes.

### THE REMAINING CONSTRAINT, AND IT IS THE APP'S, NOT THE SUITE'S

`auth.ts:174` also sets a **global** better-auth limit: `{ window: 60, max: 120 }`
across every `/api/auth/*` route. Each portal page load spends several of those on
session reads, so a 26-page sweep plus four logins lands close to the cap:

* From a **drained** window: 30/30 clean.
* A **second** sweep inside the same window fails at the tail — measured, the last
  five parent pages — with `Failed to load resource: ... 429 (Too Many Requests)`.
* Running `navigation`, `auth` and `role-guard` in **one** invocation fails the
  same way: 33 passed, 5 flaky, 9 failed, all on 429.
* Probed directly, `/api/auth/get-session` started returning 429 at request #54 of
  a run that followed an earlier one — the window is rolling, so budget carries.

**The 429s were NOT filtered out of the assertion, and should not be.** Hiding
them would rebuild exactly the vacuum this rewrite removed: the app really did
fail those requests, and the test is right to say so.

So today the three revived specs pass **per invocation, from a clear window**, and
not as one run. Closing that is an application-config decision, not a test one —
the limiter would need to not apply to an E2E environment (gated so it can never
be off in production). Flagged rather than done: it changes a security control.
