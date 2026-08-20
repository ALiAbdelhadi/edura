# The portal gate moved to the server (built 2026-08-20 — awaiting review)

Ali, on the first-run experience: opening the ERP as a brand-new account showed
the whole portal first and *then* jumped to onboarding — "بكون انا اصلا شوفت كل
شئ في ERP" — and the app felt heavy generally, in a way he read as ordering
rather than speed.

He was reading it correctly. Nothing in this app decided who you were before it
drew for you. Signing in for the first time cost **seven sequential round trips
across four screens**, and every one of those screens was the browser asking a
question the server had already answered while rendering:

| # | screen | request |
|---|---|---|
| 1 | `/dashboard` — a client component painting a bare spinner | `/api/v1/me`, and on a 401 `sleep 1500ms` then `/api/v1/me` again |
| 2 | `RoleGuard` — a full-screen "جارٍ التحميل" | `/api/v1/me` **a second time**, via refine's `useGetIdentity` |
| 3 | `OnboardingGate` — **renders the entire portal**, then redirects | `/api/v1/me/onboarding` |
| 4 | `/onboarding` — a skeleton | `/api/v1/me`, then `/api/v1/me/onboarding` again |
| 5 | the wizard mounts | `/api/v1/catalog/tree` + `/api/v1/me/onboarding` a **third** time |

The 1500ms sleep at step 1 is the tell. It existed because the session cookie
was sometimes not yet readable *by the browser* right after sign-in — a race
that does not exist when the answer is read from the request's own cookies.

1. **THE DECISION MOVED, THE RULES DID NOT.** `lib/auth/portal-gate.ts` is one
   module with two functions. `requirePortal(role, locale)` guards a portal;
   `resolvePortalEntry(locale)` answers where `/dashboard` sends someone. Both
   read the SERVER session and both route through `portalForRole` — the single
   map that already existed. No new authority, no second source of truth: the
   loop-killing property proved in `tests/unit/account-switch-routing.test.ts`
   (a rejected identity is sent to a portal whose own gate accepts it) is
   unchanged, and that test now reads the gate instead of the deleted guard.
2. **THE ORDER IS THE BEHAVIOUR, so it is fixed and asserted:** identity, then
   role, then onboarding. A gate that checked onboarding first would run a
   profile query for a visitor who turns out to be signed out. The test asserts
   `isOnboardingComplete` is *not called* on the signed-out and back-office
   branches, because "it happens to be cheap today" is not a guarantee.
3. **`isOnboardingComplete` IS A NEW READ, NOT A NEW RULE.** It selects one
   boolean where `getOnboardingState` selects the whole payload — joined catalog
   names and the draft blob — which the gate has no use for. Parent, assistant
   and center_staff have no onboarding flow, so they cost **zero** queries;
   a `center_admin` with no center costs zero too, exactly as before.
4. **A MISSING PROFILE MEANS "DO NOT GATE", DELIBERATELY.** `getOnboardingState`
   throws `NotFoundError` there, and the old client gate swallowed that error and
   let the user through. Returning `false` instead would send them to
   `/onboarding`, whose own loader hits the same `NotFoundError` and bounces them
   to `/login` — a redirect loop in place of a broken profile row. A data problem
   must not become a lockout.
5. **EACH PORTAL IS NOW TWO FILES, AND ONE OF THEM IS UNCHANGED.** `layout.tsx`
   is a server component that runs the gate and renders `portal-chrome.tsx` —
   which is the old layout, byte-for-byte apart from the two deleted wrappers
   and its name. Every `navGroups`, `BAR_ORDER` and comment moved with it,
   because those are this product's information architecture
   ([sidebar-ia](sidebar-ia.md)) and had no business being re-litigated by a
   routing change. `tests/unit/portal-bottom-nav-parity.test.ts` follows the
   literals to their new home and still proves every sidebar destination is
   reachable on a phone.
6. **`RoleGuard` AND `OnboardingGate` ARE DELETED, not left dormant.** Both were
   pure redirect logic with a loading screen attached; keeping them would leave
   two places that answer "may this person be here", which is the drift this
   codebase keeps refusing. Nothing else imported either.
7. **THE STAFF PORTAL LOST ITS LOADING SCREEN TOO.** Its sub-role (receptionist
   / manager / center_accountant) drives the nav and used to arrive from a
   `fetch("center/staff/me")` in a client effect, behind a full-screen
   "جارٍ التحميل" — shown on *every* staff navigation. The layout now calls
   `getStaffMe` directly. THE PROPERTY THAT EFFECT EXISTED FOR SURVIVES: it is
   still a live, revocation-aware resolve, so a deactivated staff account has no
   active link, `getStaffMe` throws `ForbiddenError`, and they are sent to login
   on THIS request rather than at the session's expiry. The API remains the real
   security gate (default-closed center-actor); the nav filter it feeds is UX.
8. **THE WIZARD PAINTS FILLED.** `/onboarding` is now a server page that resolves
   session, role, completion, the email token, the catalog tree and the saved
   draft in ONE pass, and hands the last two down as `initial`. `useOnboarding`
   keeps its fetching path for any caller with no server data to give — the hook
   gained a parameter, not a rewrite. `?edit=1` still re-opens a finished
   wizard, and `mismatch` still does not block: the link was signed for a
   different student, but this one is signed in and entitled to onboard.
9. **`edura_state` WAS NOT REPRODUCED.** `/dashboard` used to write that
   localStorage blob. **Nothing in either app reads the key** — it is written at
   login as well, and everywhere else only removed. It is a display cache with
   no reader; the login write was left alone rather than widened.

**What this costs.** One indexed lookup by user id per portal entry, for the
three roles that have an onboarding flow. It replaces two full HTTP round trips
from the browser, and App Router does not re-render a layout for navigations
within it, so it is paid on entry rather than per screen.

**Proofs.** `tests/unit/portal-gate.test.ts` — 9 assertions, the mocked
`redirect()` throwing so a branch cannot fall through to a later one: signed-out
→ login with no profile query; a role www does not host → login, never a guessed
portal; a mismatched identity → its own portal in one hop; **an unfinished
student → the wizard with the portal never rendered**; a finished student
through; the locale carried. `resolvePortalEntry` is asserted for all six hosted
roles, and for the case that used to cost an extra hop — an unfinished user
arriving at `/dashboard` goes straight to the wizard rather than to a portal
whose gate would bounce them.

Alongside: `tsc --noEmit` clean, `next build` clean with every dashboard and
onboarding route resolving dynamic, eslint 0 errors, and 1235/1238 unit tests
green (the three exceptions are `route-conventions.test.ts` failing on an
untracked `v1/auth/view-as/claim` route belonging to a different workstream).
Signed-out probes against a private dev server confirmed `/ar/dashboard`,
`/ar/dashboard/student`, `/ar/dashboard/admin` and `/ar/onboarding` all serve
login markup with **zero dashboard markup** in the response body.

**Not done, and why.** No test account was created to click the first-run path
live; that branch is covered by the gate test instead. The login page's
`edura_state` write stays. And no caching was added anywhere — the post-launch
rendering pass in CLAUDE.md is a separate, measured piece of work, and none of
these reads are cacheable: they are per-user session state by definition.
