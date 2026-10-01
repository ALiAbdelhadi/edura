# DB suites (full history)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## The DB suites run against a LOCAL Postgres (decided 2026-09-06, Ali)

**`EDURA_ENV=test` now resolves to `localhost:5432/edura_test`, not to the Neon
`test` branch.** The suites are integration tests — real fixtures, real
transactions, a sweep afterwards — so every assertion was a round-trip to
eu-central-1 and latency, not work, was the cost. Measured the day of the
change, same machine, same suites:

| | Neon `test` branch | local Postgres |
|---|---|---|
| `apps/erp` DB suites | 3686.8s (mean 104s/suite) | **41.9s** — 66 suites, 1788 assertions |
| `apps/superadmin` DB suites | 2546.9s | **19.4s** — 33 suites, 879 assertions |
| `apps/erp` unit tests (no database) | 2.7s | 2.7s |

Roughly **90×**. The unit-test row is there to make the point: the work was
never the bottleneck.

- **Setup is one command, and it is a script, not a recipe to retype:**
  `bun run db:local` (`packages/database/scripts/local-test-db.sh`), `--reset`
  to rebuild from nothing. It mirrors what CI already does, so local and CI
  prove the same thing against the same shape: the database carries the
  `edura-env:test` label `db-guard` keys on, `edura_app` is NOBYPASSRLS so RLS
  is genuinely enforced, and `bootstrap-app-role` runs BEFORE any table exists —
  on a populated schema its `GRANT … ON ALL TABLES` would re-grant the
  UPDATE/DELETE that migration `00000000000003` revokes on the append-only
  ledger, which is why that script refuses there.
- **Switching is one word.** `bun run db:local:env` / `bun run db:neon:env`
  rewrite the DB lines in the three `.env.test` files and keep the other set
  beside them as `# NEON …` / `# LOCAL …` comments, so nothing has to be
  retyped from memory and the Neon branch stays one command away.
- **THE CLUSTER MUST BE UTC.** A Homebrew cluster inherits the machine's zone —
  `Africa/Cairo`, UTC+3 — and Neon runs GMT. That offset alone broke
  `invite-claim`, `view-as` and `guardian-verification`: a freshly minted
  view-as session looked three hours old and every expiry comparison flipped.
  The setup script sets `ALTER DATABASE … SET timezone TO 'UTC'`; a hand-built
  database that skips it fails exactly those three suites and nothing else,
  which is a confusing signature to debug from scratch.
- **`bun run test:db:local` in either app** runs everything that CAN run
  locally. Seven suites are excluded, in two groups, and the second group is the
  interesting one:
  - *needs a demo seed / Cloudinary* — `catalog-onboarding`,
    `c01-lesson-settlement`, `h03-seed-uuid-flows`, `profile-images` (erp),
    `room-pricing-methods`, `room-revenue-split` (superadmin). These fail on the
    Neon test branch too, for the same reason, and CI excludes the erp four
    already.
  - **`c02-payout-generation` CANNOT BE PROVEN LOCALLY, AND THAT IS NOT A BUG.**
    Its subject *is* latency: it proves a fix for a payout generator that blew
    the 20-second interactive-transaction ceiling. On a local database the
    pre-fix path finishes in 172 ms, the regression cannot be reproduced, and
    the proof collapses (16 passed / 12 failed). **Run it against Neon**:
    `(cd packages/database && bun run db:neon:env) && (cd apps/superadmin && bun run test:db --only c02-payout-generation)`.
    It passes there — 28/28, 136.8s.
  - **[SUPERSEDED 2026-09-12, same day: the suite now prints `DECLINED` and exits
    `SUITE_SKIP_EXIT`; the runner badges it SKIP, not PASS. It still runs nowhere
    but Neon.]** **AN EIGHTH SUITE EXCLUDES ITSELF, AND REPORTS PASS WHILE DOING IT
    (found 2026-09-12).** `apps/erp/tests/db/tx-retry-boundary.test.ts` opens
    with `if (process.env.DATABASE_DRIVER === "pg")`, prints
    `tx-retry-boundary: SKIPPED — DATABASE_DRIVER=pg`, and calls
    `process.exit(0)`. The runner scores it **PASS**. Its own message is honest
    about why — it drops a real Neon WebSocket to prove the COMMIT-window retry
    boundary, and a plain Postgres connection has no such socket, so the proof
    is "vacuous rather than passing".
    **`DATABASE_DRIVER=pg` is set in the local `.env.test` files AND on every DB
    job in `ci.yml` (lines 81, 248, 398), so this proof currently runs NOWHERE**
    while showing green in both places. That is the same failure mode `f7555a4`
    was written to stop — a skipped DB suite passing as green — arriving by a
    different route, because the suite exits 0 itself rather than being skipped
    by the runner.
    To actually exercise it: `(cd packages/database && bun run db:neon:env) && (cd apps/erp && bun run test:db
    --only tx-retry-boundary)`. It is the ONLY self-skipping suite; the runner's closing
    `printed no "N passed, M failed" line` note is what surfaces it, so read
    that note rather than the PASS column. (`h1-payout-race.test.ts` also prints
    no count line but is sound — it sets `process.exitCode` from the proof.)
- **Do NOT edit `.env.test` while a suite run is in flight.** Doing so mid-run
  made seven superadmin suites fail in 0.3s each with `load-env` refusing,
  because the parent's exported environment no longer matched the file the
  children read. The guard was right; the mistake was changing config under a
  running job.

The section below is the previous arrangement, kept because its reasoning about
labels and the guard still governs.

## The DB suites run against DEV (decided 2026-08-03, Ali) — SUPERSEDED 2026-08-31 / 2026-09-06

The `test` Neon branch was unreachable — `ep-shiny-waterfall-as6cxn8n` refused
BOTH roles, and the other endpoint on disk (`ep-dry-shape-asv1ah7y`) was an
empty, UNLABELLED database. CLAUDE.md had recorded the credential failure since
2026-08-02; what changed is `f7555a4`, which stopped letting a SKIPPED DB suite
pass as green. So a long-silent breakage became a deploy blocker, and Ali chose
to point the suites at **dev** rather than rebuild the test branch.

- **The default is still test-only.** Every suite, `run-db-suites.ts` and
  `pretest:db` name `["test"]` explicitly and were NOT edited (this bullet said
  "all 52 suites" until 2026-08-28; measured that day it is **89 suite files**,
  91 sources naming `["test"]` — treat the number as a snapshot, the rule as the
  point). A repo-wide loosening in git to express one local setup would have
  been the wrong trade.
  The widening is a single opt-in read in `db-guard.ts`:
  `EDURA_ALLOW_DB_ENVS=dev`.
  **[local, corrected 2026-08-28] IT LIVES IN `.env.local`, NOT `.env.test`.**
  **[superseded 2026-08-31: `.env.test` is back in both apps and `packages/database`,
  and `EDURA_ALLOW_DB_ENVS` was REMOVED from every `.env.local` — see the 2026-08-30
  block in Environment state.]**
  There is no `.env.test` anywhere any more — commits `1c28f86` and `67fdf90`
  left each package with exactly two env files, `.env.local` and
  `.env.production`, both gitignored — and `test:db` launches the suites with
  `tsx --env-file=.env.local`. Verified: all three of `apps/erp`,
  `apps/superadmin` and `packages/database` carry `EDURA_ALLOW_DB_ENVS=dev` in
  their `.env.local`, and all three point at dev. **[local, corrected
  2026-08-30] THE DEV ENDPOINT IS `ep-withered-field-b23csnyq`**, not the
  `ep-patient-scene-…` this file named until today — the branch was recreated
  and every `.env.local` already carries the new host. Measured that day: all
  three files agree on it, and all three roles (`edura_app` on the pooler,
  `neondb_owner` on the direct host) authenticate. Any earlier mention of
  `ep-patient-scene-…` below is history, not a lookup table.
  **CI DOES NOT SET THE VARIABLE AT ALL**, and does not need to: it provisions a
  throwaway Postgres per run and stamps it `COMMENT ON DATABASE … IS
  'edura-env:test'`, so the guard is satisfied by the label rather than
  bypassed by a widening. `.github/scripts/write-env-local.sh` is the single
  place CI's key list lives and `EDURA_ALLOW_DB_ENVS` is not in it.
- **PRODUCTION IS NEVER WIDENABLE.** Naming `production` in that variable is a
  hard error, not a wider permission — it fails loudly rather than being quietly
  dropped, because a silently ignored value leaves someone believing they hold a
  permission they do not. Proven: production is refused both with
  `EDURA_ALLOW_DB_ENVS=dev` and with `=production`.
- **Dev keeps its `edura-env:dev` label.** Relabelling it `test` was rejected:
  the label is what `db:wipe` keys on (dev/test only), so a dev database wearing
  a test label quietly becomes wipeable, and every environment claim in this file
  would start lying.
- **[dev, measured 2026-08-03]** residue is far smaller than the 2026-07-26
  history suggests — that is what `test-cleanup.ts` was written to fix. `l1`
  (13 assertions) left the census byte-identical; `wallet` + `wallet-no-cap`
  (27 assertions, real money paths) left **one extra `audit_logs` row** and
  nothing else. `audit_logs` is append-only, so such rows accumulate slowly and
  permanently. Run `bun run test:db:sweep` if fixtures ever do pile up.
- [VOID — never needed: CI provisions its own throwaway `edura-env:test` Postgres
  per run (see the CI bullet above); no workflow reads `TEST_*_URL`.]
