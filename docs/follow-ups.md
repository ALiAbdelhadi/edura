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

## 2. `bun audit` reports 9 vulnerabilities; CLAUDE.md still claims zero

**Found:** 2026-08-27, verifying that a dependency-removal batch had not changed
the security posture.

`bun audit` reports **9 vulnerabilities (7 high, 2 moderate)**. The count is
byte-identical in the untouched `main` worktree and in `cleanup/performance`, so
the cleanup neither caused nor fixed any of it.

Two named while looking:

- `dompurify <=3.4.12`, reached through `workspace:edura › posthog-js` —
  moderate. GHSA-55q2-fjhq-7xh7: an `IN_PLACE` hook removal leaves a detached
  subtree executable, causing XSS.
- `deepmerge-ts <8.0.0`.

**What changed is the advisory database, not the tree.** CLAUDE.md's
"Dependency overrides" bullet records `bun audit` reporting **0 vulnerabilities**
on 2026-07-30, and that was true then. Everything above was published after it.
The staleness is now noted in CLAUDE.md itself, next to the original claim.

**To close:** re-run the 2026-07-20 exercise — pin patched versions within the
same major via root `overrides` where the fix is transitive, and decide
separately about anything on a runtime path. `posthog-js` is a runtime dependency
that ships to the browser, so the dompurify one is not purely build-time the way
the July batch was.

---

## 3. Two superadmin screens call an impure function during render

Sub-item of #1, listed separately because it is a behaviour question rather than
a tooling one: `apps/superadmin/src/features/admin/audit-log-screen.tsx:99` and
`apps/superadmin/src/features/notifications/notifications-screen.tsx:98`. Under
the React Compiler these are errors, not warnings. Worth reading before the next
compiler upgrade decides them for us.


---

## 4. The Playwright suite has been dead since the shadcn migration

**Found:** 2026-08-27, trying to use it as a verification gate.

`apps/erp/tests/playwright/helpers.ts:29` — `navigateTo()` waits up to 20 seconds
for `.ant-layout-content`. **AntD is entirely absent from `apps/erp/src`.** Seven
of the nine spec files call that helper, across 18 call sites, so they time out
before asserting anything:

`navigation.spec.ts`, `admin-students.spec.ts`, `role-guard.spec.ts`,
`parent-pay.spec.ts`, `student-dashboard.spec.ts`, `parent-portal.spec.ts`,
`teacher-gradebook.spec.ts`

The helper was last touched on 2026-08-18 and is untouched by the cleanup branch.
Like the lint task in #1, nothing in CI runs `test:pw`, which is why a suite that
cannot pass has stayed in the tree.

**To close:** replace the selector with one that exists (`main`, or the portal
chrome's `[data-portal]`). `apps/erp/tests/playwright/render-gates.spec.ts` on
`cleanup/performance` is a worked example that depends only on the HTTP response
and the console.

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
