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
