# TypeScript 7 + Next.js 16.3 (upgraded 2026-08-12 — awaiting review)

Every app and package now typechecks with **TypeScript 7.0.2**, the native (Go)
compiler, and all three Next apps run **Next.js 16.3.0**. Ali's request,
2026-08-12. No schema change, no migration, no API change, no runtime code
change — the whole upgrade lives in manifests, four tsconfigs and three
`next.config.ts` files.

1. **THE MEASUREMENT, because "much faster" is the reason to do this at all.**
   `apps/www` cold `tsc --noEmit`, three runs each: TS 5.9.3 → 14.34 / 14.21 /
   14.03 s; TS 7.0.2 → 2.18 / 2.23 / 2.24 s. **6.4×.** Repo-wide
   `turbo run check-types --force` went 6.7 s → ~3.5 s.
   > **A benchmark trap worth knowing:** a torn `.next/dev/types/routes.d.ts`
   > (written live by a running dev server) makes `tsc` report parse errors and
   > finish in ~1.3 s — it never reaches the semantic pass. Any typecheck timing
   > that looks impossibly good is measuring a compiler that gave up. Check the
   > error list before trusting the clock.

2. **TypeScript 7 DOES NOT SHIP THE CLASSIC COMPILER API, and that is the fact
   every other decision here follows from.** Its `exports["."]` is
   `./lib/version.cjs` — `require("typescript")` returns a version string and
   nothing else; the real API is the new `typescript/unstable/*` surface, and
   there is **no `tsserver` binary** (an LSP replaces it). Anything that reached
   for `ts.createProgram` / `ts.SyntaxKind` breaks the moment it loads.

3. **`experimental.useTypeScriptCli: true` in ALL THREE next.configs.** Without
   it `next build` refuses to start: *"TypeScript 7.0.2 does not provide the
   compiler API required by Next.js."* With it, Next shells out to the `tsc`
   binary instead. **www needs it too, even though it sets
   `ignoreBuildErrors`** — the flag skips the type CHECK, but the setup step
   that writes `next-env.d.ts` loads the API regardless.

4. **`packages/eslint-config` STAYS ON TypeScript 5.9.3 — pinned, not
   forgotten.** `typescript-eslint` refuses TS 7 outright, in its own code
   (`if (versionMajor >= 7) throw`): *"typescript-eslint does not support TS
   7.0."* Its peer range is still `>=4.8.4 <6.1.0` as of 8.67.0. So the repo
   holds TWO TypeScripts on purpose: 7.0.2 for every `tsc`, 5.9.3 for the
   linter. Tracking issue: typescript-eslint#10940. The official alternative is
   TypeScript **6.0** (the JS compiler, still shipping `lib/typescript.js` and
   `tsserver`) side by side; 5.9.3 was chosen because it is stable and was
   already in the tree.

5. **THE THREE APPS NO LONGER IMPORT `eslint-config-next` DIRECTLY, and the
   reason is resolution, not style.** That preset depends on `typescript-eslint`,
   whose peer `typescript` resolves from whichever package imports it — so
   importing it from an app bound the linter to the app's TypeScript 7 and
   killed every lint run. `@repo/eslint-config/next-app` re-exports the SAME two
   presets (`core-web-vitals` + `typescript`) from a package pinned to 5.9.3.
   **No rule was added or removed**; the apps keep their own rule and ignore
   blocks. Retire the indirection when typescript-eslint supports TS >= 7.1.
   > This ALSO fixed a fragility that predates the upgrade: before the Next
   > bump the linter happened to resolve 5.9.3 through peer hoisting and worked
   > by luck. Bumping Next recomputed the peer set, bound it to 7.0.2, and
   > `bun run lint` died in all three apps. **Bun does not support nested
   > `overrides`** (`warn: Bun currently does not support nested "overrides"`),
   > so scoping the peer that way is not available — the import path is the only
   > lever.

6. **TS 7 DOES NOT AUTO-DISCOVER AMBIENT `@types` PACKAGES from
   `node_modules/@types` the way 5.x did.** Nearly everything survived because
   it arrives through a module specifier (`import … from "node:crypto"` pulls
   `@types/node` in), which hid the change. Two places relied on ambient
   discovery and were fixed by NAMING what they need:
   - `packages/observability` — dependency-free, reads only the `process`
     global, so nothing ever imported node types for it. Now
     `"types": ["node"]`, same as `packages/database` already had.
   - `apps/erp/tests/e2e/smoke.e2e.ts` — `/// <reference types="bun" />`, so
     `bun:test` resolves. `@types/bun` was the ONLY package www lost.

7. **`baseUrl` was REMOVED in TS 7** (`error TS5102`), so it is gone from
   `packages/ui/tsconfig.json`. The `paths` entry is unchanged and still
   correct: paths resolve relative to the tsconfig when there is no `baseUrl`.

8. **`agentRules: false` in all three next.configs.** Next 16.3 otherwise writes
   an `AGENTS.md` and a `CLAUDE.md` into each app on every dev boot — observed,
   not assumed (they appeared in `apps/www` during verification and were
   removed). This repo's agent instructions are authored at the root, and a
   generated per-app `CLAUDE.md` is loaded on top of them. Flip it back on
   deliberately if that generated file is ever wanted.

**Everything else needed no change.** `vitest` and `tsx` transpile through
esbuild and never touch the compiler; Prisma, the realtime app and CI are
unaffected (CI pins no TypeScript version); no repo code imports the `typescript`
package. Editors are unaffected too — there is no `.vscode` or `typescript.tsdk`
setting in the repo, so they use their own bundled TypeScript; running TS 7 in an
editor needs its new LSP.

Proofs: `check-types` **9/9**, `bun run build` **3/3**, unit **www 1107 pass / 1
skip, superadmin 106, showcase 22**, and lint ERROR parity exactly at the
recorded baseline — **www 14, superadmin 2, showcase 0**. Lint warnings are
**+6 in www and +6 in superadmin**, all of them the new
`@next/next/no-location-assign-relative-destination` rule in the 16.3 plugin, not
a regression. `next dev` verified on 16.3.0 + TS 7 by booting a scratch server
(`NEXT_DIST_DIR`, port 3099) so the running dev servers were never touched:
`/ar` returned 200, TypeScript was detected and configured normally.

**One operational note:** a dev server started before the upgrade serves 500s
afterwards — its `node_modules` changed underneath it and its build directory
belongs to the previous Next. Restart it; nothing else is wrong.

**Deliberately NOT done:** `packages/typescript-config` declares no `typescript`
of its own and resolves the root's 7.0.2 — left alone, it is a config-only
package. And nothing was migrated to the `typescript/unstable/*` API, because
nothing in this repo consumed the old one.
