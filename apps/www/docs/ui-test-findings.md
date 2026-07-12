# UI test findings — `claude/test-ui-issues-SsbWQ`

Test run on 2026-05-11 against a fresh `pnpm install && pnpm build && next start`
with an in-memory MongoDB seeded via `pnpm seed` (script:
`scripts/ui-test-setup.mjs`). UI traversal executed by Playwright/Chromium
(`scripts/ui-probe.mjs`); screenshots, per-page console/network captures and
the full machine-readable report live under `tests/ui-probe/`.

## Build / static checks
- `pnpm install` — clean.
- `pnpm build` — succeeds, no warnings.
- `pnpm typecheck` — passes.
- `pnpm lint` — blocked: Next.js asks for an interactive `eslint --init` choice
  because no `.eslintrc.*` is committed; CI cannot run as-is.

## Reproduce
```
node scripts/ui-test-setup.mjs &     # boots mongo-memory + seed + next start
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/ui-probe.mjs
```
The probe walks every dashboard route for admin/teacher/student/parent and
writes screenshots + `tests/ui-probe/report.json`.

## Headline result
**0 of 26 visited pages were clean** (every dashboard surface emits at least
one console error, network failure, or rendering bug). Several pages crash
into the "Application error" boundary. The login page itself is unusable in
the browser even with valid credentials.

---

## Critical bugs

### 1. Login page is non-functional — submit reloads the page
**Where:** `app/login/page.tsx`
**Symptom:** clicking *Sign in* (or pressing Enter) reloads `/login` instead of
authenticating. Playwright sees the submit button "detach" every retry because
the page keeps navigating to itself. Manual sanity check matches.
**Cause:** the AntD `<Form onFinish={() => doLogin()}>` runs the JS handler,
but the form has no submit-intercept guard for the case where `getSession()`
is racing and the AntD form does a natural submit before `onFinish` fires. The
JS handler also calls `router.push(next)` but never `preventDefault`s the
native submit. Combined with `htmlType="submit"` on the button and no Form.Item
binding for the inputs, the browser falls back to a `GET /login` submission.
**Fix:** bind email/password through `Form.Item` `name=` so AntD owns the
state and prevents default; or replace `htmlType="submit"` with `htmlType="button"`
and trigger `doLogin` from `onClick`.

### 2. `/api/v1/auth/login` returns an already-expired cookie when `E2E=1`
**Where:** `app/api/v1/auth/login/route.ts:84-93`
**Symptom:** under `E2E=1` (used by `scripts/e2e-runner.mjs`) the `Set-Cookie`
header is `Max-Age=0`, so the browser discards the session token immediately
even though the JSON envelope reports `success: true`. UI tests that go through
the real form silently fail authentication.
**Cause:** intentional workaround for Newman's cookie jar — comments at
`route.ts:79` explain it — but the same env var is set whenever `tsx`/Next runs
under that script, so it poisons any real-browser session run with the same
harness. Today this is the reason every UI E2E run is broken.
**Fix:** gate the expired-cookie behaviour behind something Newman-specific
(e.g. a custom request header from the Postman pre-request script) instead of
a process env var, or only apply it when the request comes from the Newman
user-agent.

### 3. Refine `authProvider.check()` puts `/login` into an infinite loop
**Where:** `lib/refine/authProvider.ts:49-74`, called from the Refine provider
mounted in `components/providers/AppProviders.tsx`.
**Symptom:** while sitting on `/login`, the browser fires `/api/v1/me` dozens
of times per second; each call returns 401 and Refine's `redirectTo: "/login"`
re-pushes the same route. The page never settles, which is why the login form
sometimes paints blank — by the time the AntD inputs are committed the
component has been unmounted and remounted. The same loop is the reason
`api/v1/me` shows up as the top "console error" entry on every page.
**Fix:** `check()` must not return `redirectTo` when the current pathname
already is the redirect target. Either consult `window.location.pathname`
inside `check`, or supply Refine with a `getRoutes`/`Authenticated` boundary
that whitelists `/login`.

### 4. Two admin/teacher pages crash into the error boundary
**Where:** `/dashboard/admin/enrollment-requests`, `/dashboard/teacher/centers`.
**Symptom:** full-page replacement with *"Application error: a client-side
exception has occurred"* (`tests/ui-probe/admin-dashboard_admin_enrollment-requests.png`,
`teacher-dashboard_teacher_centers.png`).
**Cause from console:**
- *enrollment-requests* → `Minified React error #31; object with keys {_id,
  email, name, id}` — a populated user document is being rendered directly as
  a JSX child (need `student.name` instead of `student`).
- *teacher/centers* → `TypeError: D.filter is not a function` thrown inside
  `app/dashboard/teacher/centers/page-*.js` — the page expects an array but
  receives an object (likely the `{ data: [...] }` envelope was not unwrapped).

### 5. Brand logo renders as cropped `edu` / `ra` fragments
**Where:** `components/refine/DashboardShell.tsx:138-150` and `app/login/page.tsx:89`.
**Symptom:** every dashboard screenshot shows the corner glyph as `edu ra Edura`
— the SVG already contains the wordmark, but the shell ALSO renders a `Text`
label and the SVG's 520×200 viewBox is squeezed into 28px height so its
internal "edu" + "ra" texts cluster against the icon (see any dashboard
screenshot under `tests/ui-probe/`).
**Fix:** either (a) drop the duplicate `<Text>Edura</Text>` and use the wordmark
SVG directly, or (b) use an icon-only SVG (viewBox `0 0 200 200`) when the
sidebar is collapsed, plus the wordmark when expanded.

---

## High-severity functional bugs

### 6. Admin overview shows empty stats with seeded data
**Where:** `tests/ui-probe/admin-dashboard_admin.png`.
**Symptom:** "Total Revenue $0", "Attendance Rate 0%", "Active Sessions 0",
"Pending enrollment requests 0", "Fee defaulters 0" while the database has
69 payments, 136 attendance records, 48 sessions, 3 pending enrollment
requests. Either the dashboard is fetching the wrong endpoint or it's
discarding the response envelope.
**Action:** check `/api/v1/dashboards/admin` (or whichever stat endpoint feeds
those tiles) and verify the response shape matches what the page expects.

### 7. Student dashboard prints `undefined%`
**Where:** `tests/ui-probe/login-fail-student.png` (the page is actually
rendered before redirect).
**Symptom:** "Attendance Rate undefined%". Recent grades all display "0%".
**Cause:** the page formats `value + "%"` without a numeric guard, and the
attendance value field is missing from the API response for students.

### 8. Parent dashboard shows a **negative payment**
**Where:** `tests/ui-probe/parent-dashboard_parent.png`.
**Symptom:** "Mathematics — Grade 12 (Scientific) -EGP 200" in the *Recent
Payments* list.
**Likely cause:** the API returns a refund/reversal row and the UI does not
distinguish between charges and refunds (or the seed inserts a negative
amount where it should be a credit). Either way the UI presents it as a
positive-amount entry with a leading minus sign, which is misleading.

### 9. Parent pages call attendance/grades without `studentId`
**Where:** `/dashboard/parent/*` issue these requests:
- `/api/v1/grades` → 422 `studentId is required`
- `/api/v1/me/attendance` → 403 `studentId required for parent`
**Cause:** the parent dashboard renders before the "selected child" state is
populated. Either default to the first linked child or short-circuit the
fetch until a child is selected.

### 10. Teacher assignments page calls a forbidden admin endpoint
**Where:** `/dashboard/teacher/assignments`.
**Symptom:** `/api/v1/roster/students` → 403 `Role 'teacher' is not allowed
(need one of: center_admin)`.
**Fix:** teachers should fetch their roster via the teacher-scoped endpoint
(`/api/v1/teachers/[teacherId]/students` or similar) instead of the admin
roster endpoint.

### 11. Student login flow races to `/login`
**Where:** the probe failed the *student* role with
`Navigation to /dashboard interrupted by navigation to /login`. Admin/teacher/
parent worked but student did not — likely the same race in
`app/dashboard/page.tsx` against Refine's `check()` for the `student` role.

---

## Minor issues

- `/api/v1/health` returns 404 — there is a `/api/v1/_ping` but no `/health`.
  The Next.js build output also has no public health endpoint other than
  `_ping`; consider aliasing it or documenting the actual name.
- Every page emits `Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID`
  for `https://telemetry.refine.dev/telemetry` — disable the Refine telemetry
  client in `Refine` options or self-host so production deployments don't
  spray noise into every browser console.
- `pnpm lint` cannot run unattended; add a committed `.eslintrc.json` (e.g.
  `{ "extends": "next/core-web-vitals" }`).

---

## Suggested triage order
1. Fix the **login page form** (#1) so any UI testing is possible at all.
2. Fix the **Refine check() loop** (#3) so the login page actually paints.
3. Fix the **API/UI contract mismatch** behind the two crashing pages (#4).
4. Wire up the parent dashboard's `studentId` selection (#9) and the teacher
   roster endpoint (#10) — these are 3- to 5-line fixes.
5. Tackle the dashboard stat tiles (#6, #7, #8).
6. Clean up the logo (#5) and lint config (last bullet).

Full machine-readable issue list: `tests/ui-probe/report.json`.
