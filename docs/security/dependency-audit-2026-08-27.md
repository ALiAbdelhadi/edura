# Dependency audit — 2026-08-27

Analysis pass on the 9 advisories recorded in
[docs/follow-ups.md](../follow-ups.md) entry 2, followed by the Tier A fix.

**Outcome: 9 → 5.** Four cleared; the other five are documented as staying, with
reasons, in §"What actually happened" at the end. Verified on
`security/audit-2026-08-27`: `bun run check-types` 9/9, `bun run build` 3/3
apps, erp route census unchanged at 342 ƒ / 3 ○ / 31 ●.

`bun audit` v1.3.12, tree unchanged since the entry was written.

**Count today: 9 advisories, still 9.** But 9 advisories is not 9 packages and
not 9 problems:

- **7 distinct packages.** `brace-expansion` accounts for three of the nine.
- **Two of the nine are the same advisory ID.** `GHSA-rgw5-rvv9-x895` is listed
  twice, once for `>=4.0.0 <5.0.9` and once for `<1.1.18`, because two different
  installed copies fall in two different ranges of the same disclosure.
- **One is not reachable at all** (`uuid`, below), and **one never reaches a
  browser despite the package that pulls it doing so** (`dompurify`, below).

---

## 1. The headline: dompurify does NOT ship to the browser

Entry 2 records `posthog-js` as "a runtime dependency that ships to the browser,
so the dompurify one is not purely build-time the way the July batch was." That
premise is half right and the conclusion does not follow.

`posthog-js` does ship to the browser — `apps/erp/src/lib/observability/posthog-client.ts`
is a `"use client"` module that does `import posthog from "posthog-js"`, mounted
by `analytics-provider.tsx`. That much is confirmed.

**But the dompurify it depends on is not in that import graph.** Measured:

| Check | Result |
|---|---|
| `dompurify` occurrences in `dist/module.js` (the bundler entry — the package has no `exports` map, so `module: dist/module.js` is what a bundler resolves) | **0** |
| Files under `posthog-js/dist/` that contain dompurify | `product-tours.js`, `product-tours-preview.js` **only** |
| How those are reached | not imported — `__PosthogExtensions__.loadExternalDependency(instance, "product-tours", cb)` in `module.js` |
| What `loadExternalDependency` does | injects a remote `<script>` from `<api_host>/static/…` |
| Our `api_host` | `/ingest`, a same-origin rewrite to PostHog (see `next.config.ts`) |
| First-party `dompurify` / `DOMPurify` usage anywhere in `apps/*/src`, `packages/*/src` | **none** |

So the product-tours bundle — the only place dompurify exists — is fetched at
runtime **from PostHog's own servers**, not from our build. The copy in our
lockfile is never executed by anything. Pinning it changes nothing a user
receives; if product tours were ever switched on, the browser would run whatever
version PostHog serves, which no override of ours can influence.

**Consequence for ordering:** dompurify is the *lowest*-value fix in the batch,
not the highest. Applying the override is audit hygiene (it clears the line from
`bun audit`), not a security fix. It is cheap and harmless, so it can ride along
— but it should not be the reason the batch happens.

## 2. Are any of the others runtime-reachable in the browser?

**No.** Every one of the seven is build-time, CLI-time, or server-side.

The one that looked like it might be is `fast-uri`, which `bun audit` attributes
to `workspace:edura › @hookform/resolvers` — and `@hookform/resolvers` very much
does ship to the browser (16 call sites in `apps/erp/src`). That edge is an
artifact of how `bun audit` walks peers:

- `ajv` is an **optional peer dependency** of `@hookform/resolvers`, not a real
  dependency. `@hookform/resolvers`' only true dependency is `@standard-schema/utils`.
- Every import in the repo is `@hookform/resolvers/**zod**`. The ajv resolver is
  never imported, so ajv is never installed on that path.
- The real edge is `fast-uri@3.1.4 ← ajv@8.20.0 ← ajv-formats@2.1.1 ←
  schema-utils@4.3.3 ← webpack@5.109.2`. Build-time.

---

## The nine, classified

| # | Package | Installed | Sev | Direct/transitive | Path into our tree | Reaches browser? |
|---|---|---|---|---|---|---|
| 1 | `dompurify` | 3.4.12 | moderate | transitive | `apps/erp` (`edura`) → `posthog-js@1.409.5` (a real `dependencies` edge) | **No** — see §1. Only in the remotely-loaded `product-tours` bundle |
| 2 | `deepmerge-ts` | 7.1.5 | high | transitive | `packages/database` → `prisma@7.9.0` (devDep) → `@prisma/config@7.9.0`, **exact pin `7.1.5`** | No — Prisma CLI / config load |
| 3 | `brace-expansion` | **1.1.16** | high ×2 | transitive (also a root *direct* dep, but at a clean version) | `minimatch@3.1.5` ← `eslint@9.39.5`, `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y` | No — lint |
| 4 | `brace-expansion` | **5.0.8** | high | transitive | `minimatch@10.2.5` ← `@typescript-eslint/typescript-estree` and ← `glob@13` | No — lint / tooling |
| 5 | `nanoid` | 3.3.16 | high | transitive | `postcss@8.5.23`, a **devDependency** of all three Next apps + `@tailwindcss/postcss` | No — CSS build |
| 6 | `uuid` | 8.3.2 | moderate | transitive | `apps/superadmin` → `exceljs@4.4.0` (runtime dep) | No — Node only, `settlement-export.ts` has no `"use client"` |
| 7 | `fast-uri` | 3.1.4 | high | transitive | `ajv@8.20.0` ← `ajv-formats` ← `schema-utils` ← `webpack` | No — bundler (see §2) |
| 8 | `js-yaml` | 4.3.0 | high | transitive | `@eslint/eslintrc@3.3.6` ← `eslint@9.39.5` | No — lint config load |

(Eight rows for nine advisories: `brace-expansion@1.1.16` carries two of them,
`GHSA-mh99-v99m-4gvg` and `GHSA-rgw5-rvv9-x895`.)

### Two things the audit output hides

**`brace-expansion@2.1.4` is clean and should not be touched.** The three
advisory ranges are `<1.1.17`, `<1.1.18`, and `>=4.0.0 <5.0.9`. 2.1.4 is in none
of them. It arrives via `minimatch@5.1.9 ← readdir-glob ← archiver ← exceljs` —
the one brace-expansion path that *is* server-runtime — and it is already safe.
The existing `"brace-expansion@2": "^2.1.4"` override stays exactly as it is.

**The root `"brace-expansion": "^5.0.9"` direct dependency does not dedupe the
nested copy.** It resolves to a clean 5.0.9, but `minimatch@10.2.5` pins
`brace-expansion: 5.0.8` and gets its own. So the direct dependency documented in
CLAUDE.md as the anchor is *not* covering the v5 line — an override is still
needed. (The direct dependency itself must stay; removing it un-pins the v1/v2
overrides, exactly as CLAUDE.md warns.)

---

## Proposed fixes — cheapest and safest first

### Tier A — in-major overrides, no behaviour change expected (6 advisories)

Every one of these has a patched release **inside the same major**, so this is
the same exercise as 2026-07-20. Add to root `package.json` `overrides`:

```json
"brace-expansion@1": "^1.1.18",
"brace-expansion@5": "^5.0.9",
"js-yaml@4":         "^4.3.2",
"nanoid@3":          "^3.3.18",
"fast-uri":          "^3.1.6",
"dompurify":         "^3.4.14"
```

Notes per line:

- **`brace-expansion@1`** — bump of the existing `^1.1.16` entry, not a new key.
  Patched at 1.1.18; 1.1.18 is the newest v1. Clears advisories 3 and one half of 4.
- **`brace-expansion@5`** — new key. `minimatch@10.2.5` asks for `^5.0.5`, so
  `^5.0.9` is inside its declared range; this is a dedupe, not a force.
- **`js-yaml@4`** — patched at 4.3.1, newest v4 is 4.3.2. `@eslint/eslintrc` asks
  for `^4.3.0`, so it is inside the declared range.
- **`nanoid@3`** — patched at 3.3.18, the newest v3. `postcss` asks for `^3.3.16`.
- **`fast-uri`** — unversioned key is fine here because only one copy exists
  (3.1.4). `ajv@8` asks for `^3.0.1`; `^3.1.6` is inside it. Use `fast-uri@3` if
  a v4 copy ever appears.
- **`dompurify`** — `posthog-js` asks for `^3.3.2`; 3.4.14 is inside it.
  **Cosmetic**, per §1 — include it only to keep `bun audit` at zero so the next
  real advisory is visible against a clean baseline.

Expected result: `bun audit` drops from 9 to 2.

### Tier B — needs a major bump, decide separately

**`uuid` 8.3.2 → 11.1.1 (exceljs).** Two separate facts:

1. **The advisory is not reachable.** GHSA-w5hq-g745-h8pq is a missing buffer
   bounds check in `v3`/`v5`/`v6` *when `buf` is provided*. `exceljs` imports
   `{v4: uuidv4}` at `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js:1` and
   calls `uuidv4()` with no arguments, at two sites. Neither the affected
   functions nor the affected parameter is used.
2. **The existing override is inert and should be cleaned up either way.** Root
   `package.json` carries `"uuid@8": "^11.1.1"`, it is present in `bun.lock`'s
   overrides block — and `bun.lock` still resolves `uuid@8.3.2`. CLAUDE.md
   records that override as having been added for `next-auth`, which the
   better-auth migration removed; its only remaining consumer is `exceljs`, and
   it is not taking effect there.

   **Recommendation:** leave the version alone, and treat the dead override as a
   separate small cleanup — either drop it (and accept one documented,
   unreachable moderate) or change the key to plain `"uuid": "^11.1.1"` and
   **verify the settlement export still writes a valid workbook**, since that
   forces a 3-major jump into a CJS consumer. I would not bundle that decision
   with Tier A.

**`deepmerge-ts` 7.1.5 → 8.0.2 (prisma).** No patched 7.x exists — 7.1.6 is the
newest v7 and is still inside the `<8.0.0` vulnerable range, so this cannot be
fixed in-major. Two reasons to leave it:

- `@prisma/config@7.9.0` depends on **exactly `7.1.5`**, not a range. An override
  to `^8.0.2` overrides a pin its author chose, against a package we do not
  control, in the tool that runs our migrations.
- The vulnerability is stack exhaustion when merging recursive object graphs.
  The input on this path is our own `packages/database/prisma.config.ts`. It is
  not attacker-controlled, and it is a CLI, not a served surface.

  **Recommendation:** leave it; it clears itself when Prisma bumps `@prisma/config`.

### Nothing in this batch has "no patched version at all"

Both Tier B items have a fix published; both are majors, and neither is
reachable. That is the whole of the difference between 9 and 2.

---

## What this changes in the docs

- `docs/follow-ups.md` entry 2's closing line — "`posthog-js` is a runtime
  dependency that ships to the browser, so the dompurify one is not purely
  build-time the way the July batch was" — is wrong on the part that matters.
  **All nine are build-time, CLI-time or server-side.** The July characterisation
  holds for this batch too.
- CLAUDE.md's "Dependency overrides" bullet already flags the "0 vulnerabilities"
  claim as stale. If Tier A is applied, that bullet needs the new baseline and
  the two documented exceptions, not another bare "0".


---

## What actually happened when Tier A was applied

Tier A predicted 9 → 2. It reached **9 → 5**. The gap is a property of `bun`,
not of the advisories, and it is the most reusable thing in this document.

### bun 1.3.12 ignores `"pkg@major"` override keys

Proven by controlled comparison — one install, keys in the same overrides block,
packages at the same (top) position in the lock:

| Key written | Honoured? |
|---|---|
| `"dompurify": "^3.4.14"` | **yes** |
| `"fast-uri": "^3.1.6"` | **yes** |
| `"js-yaml@4": "^4.3.2"` | no — stayed 4.3.0 |
| `"nanoid@3": "^3.3.18"` | no — stayed 3.3.16 |
| `"js-yaml": "^4.3.2"` (rewritten) | **yes** → 4.3.2 |
| `"nanoid": "^3.3.18"` (rewritten) | **yes** → 3.3.18 |
| `{"eslint": {"brace-expansion": "…"}}` (npm nested) | no |
| removing `brace-expansion@1/@2/@5` entirely | no change to any resolution |
| `bun update brace-expansion` | moved only the root direct copy |

**And a plain `bun install` is not enough.** After the first install, the audit
went 9 → 7 and both old and new versions sat in `node_modules/.bun`. The
consumers were still linked to the old ones — `posthog-js → dompurify@3.4.12`,
`ajv@8.20.0 → fast-uri@3.1.4` — while a fresh top-level copy of the patched
version existed that nothing used. `bun install --force` is what relinked them.

**So verify at the consumer, never at the top of the tree.** `ls node_modules`
showing the patched version proves nothing:

```bash
bun -e "console.log((await Bun.file(node_modules/.bun/posthog-js@1.409.5/node_modules/dompurify/package.json).json()).version)"
```

### This invalidates CLAUDE.md's account of the July batch

CLAUDE.md's "Dependency overrides" bullet says the 2026-07-20 batch "forces the
patched version WITHIN THE SAME MAJOR" through `minimatch@3`, `brace-expansion@1`,
`brace-expansion@2`, `picomatch@2`, `picomatch@4`, `postcss@8` and `uuid@8`.
**All seven keys are inert.** Those advisories are clear because the packages
moved on their own.

**Corrected 2026-08-27.** The bullet is rewritten, and all seven keys are removed
from `package.json`: a key that does nothing while looking like protection is
worse than no key. Safety proved before removing — dropping the six survivors and
re-resolving left all **1296** lock resolutions byte-identical, with `bun audit`
still 5, check-types 9/9 (forced), `bun run build` 3/3 (forced) and the erp
census still 342 ƒ / 3 ○ / 31 ●. The root `brace-expansion` **direct dependency**
was kept, but its stated rationale — that it "anchors" the `@1`/`@2` pins — is
void along with those pins, and its real effect is unverified.

### brace-expansion cannot be fixed, and that is a measurement

Two vulnerable copies need opposite fixes — `minimatch@3.1.5` needs
`^1.1.18`, `minimatch@10.2.5` needs `^5.0.9` — and bun offers only a flat
tree-wide key. One version must serve both, and no version can:

- v1 is `module.exports = expandTop` — callable.
- v5's CJS build exports `{EXPANSION_MAX, EXPANSION_MAX_LENGTH, expand}`.
  Measured: `require()` returns `typeof "object"`.

`minimatch@3` does `expand(pattern)` at `minimatch.js:10`, so forcing v5
tree-wide throws and takes eslint, `eslint-config-next`, `@serwist/next` and
`@sentry/nextjs` with it. Forcing v1 breaks `minimatch@10` symmetrically.
`minimatch@5.1.9 → 2.1.4` is in none of the three ranges and is already clean.

Left as-is deliberately: every path is lint/build tooling, and the brace patterns
reaching minimatch are our own glob configs, so the DoS has no untrusted input.

### Final state

| Advisory | Status |
|---|---|
| dompurify | **cleared** — posthog-js links 3.4.14 |
| fast-uri | **cleared** — ajv@8.20.0 links 3.1.6 |
| js-yaml | **cleared** — @eslint/eslintrc links 4.3.2 |
| nanoid | **cleared** — postcss@8.5.23 links 3.3.18 |
| brace-expansion ×3 | stays — inexpressible (above), lint/build only |
| uuid | stays — unreachable (v4 only, no `buf`), Tier B |
| deepmerge-ts | stays — no in-major fix, Tier B |

`"uuid@8": "^11.1.1"` was removed: its consumer (`next-auth`) is gone and the
key never did anything.
