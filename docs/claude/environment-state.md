# Environment state (full log)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## Environment state

> **[dev, local test AND production, 2026-09-27] MIGRATION 82 —
> `20260927120000_performance_indexes`** (13 additive `CREATE INDEX IF NOT
> EXISTS`, no drops; see `docs/api-performance-audit.md`). Applied to local
> test, dev (`ep-withered-field-b23csnyq`) and production
> (`ep-mute-rice-b2s8gg42`); verify-db 0 FAIL on all three, shape 84 tables /
> 82 migrations. Production tables were near-empty (largest `audit_logs`, 11
> rows), so the in-transaction build was used and no `CONCURRENTLY` step was
> needed. Neon test (`ep-morning-snow-b269im2n`) not applied.

> **[dev, local test AND production, 2026-09-12] MIGRATIONS 80 AND 81 —
> `20260911120000_public_handles` and `20260912120000_users_revoke_delete`;
> verify-db 33/33 on all three, `expected-db-shape.json` at 81 (tables
> 83 → 84: migration 80 adds `public_handles`, 81 adds none).** 81 is
> `REVOKE DELETE ON users FROM edura_app` (new check
> `append-only: users`, DB-04 of the 2026-09-11 audit). Production
> (`ep-mute-rice-b2s8gg42`) took BOTH on 2026-09-12: `migrate status` listed
> exactly those two pending, and 80 was the public-handles table that had sat on
> dev and local test since 2026-09-09 — additive, no sibling branch owns either
> object, so applying them together was not the 2026-08-02 out-of-order trap.
> Schema went first; the public-handles and audit code deploy after.
>
> **`set -a; . ./.env.production; set +a` DOES NOT WORK, and the note further
> down this file that prescribes it is wrong.** Measured 2026-09-12 in zsh, on
> both the root and `packages/database` copies: the connection strings carry
> unquoted `&` (`?sslmode=require&channel_binding=require`), so the shell parses
> them as background operators and dies with `parse error near '&'` before
> exporting anything. Extract the one variable instead:
>
> ```bash
> export DIRECT_URL="$(grep -E '^DIRECT_URL=' .env.production | cut -d= -f2- | tr -d "\"'")"
> ```
>
> Then the `connect_timeout` deploy variant works as written. The FIRST
> `migrate status` still returned P1001 against a cold endpoint and the second,
> seconds later, succeeded — so retry once before diagnosing anything.
>
> Prisma cannot model a REVOKE, so `prisma migrate dev` will not notice
> it either way; `apps/erp/tests/db/c08-users-no-delete.test.ts` asserts it by
> privilege and by a raw app-role DELETE. NOTE: `tx.user.delete` / `deleteMany`
> through the client are SOFT deletes (the extension rewrites them to UPDATE) and
> keep working; only a raw DELETE, or tooling on the owner string, removes rows.

> **[dev, test (local + Neon) AND production, 2026-09-08] COURSE DELIVERY MODE —
> migration 79 `20260910120000_course_delivery_mode` applied on all four;
> verify-db 32/32 on each.** `expected-db-shape.json` is at 83 tables /
> 79 migrations (tables unchanged — a column is not a table). Each apply followed
> a read-only pre-flight (label read from the database, datasource host line
> checked, exactly one pending, row census before and after); production
> (`ep-mute-rice-b2s8gg42`) held 2 users / 0 courses / 0 payments /
> 0 transactions on both sides. Schema went first; the code may deploy.
>
> It adds `courses.delivery_mode` (`onsite` default | `online` | `hybrid`) and
> `courses.online_url`, plus CHECK `courses_delivery_mode_shape` — an ONSITE
> course may carry no meeting link. **Prisma cannot model that CHECK and
> `prisma migrate dev` WILL offer to drop it — refuse**;
> `apps/erp/tests/db/course-delivery-and-teacher-day.test.ts` asserts it by
> attempting the write. The opposite rule ("an online course must HAVE a link")
> is deliberately NOT in the database: a teacher creates the group before the
> meeting room exists, so it lives in `resolveDelivery()` where it can be relaxed
> without a migration.
>
> **THE MEETING LINK IS A PAID CREDENTIAL, NOT METADATA** — anyone holding it
> sits in the lesson free. It is excluded from every discovery read and redacted
> on `GET /api/v1/courses/[id]` (session-less) and on the `?centerId=` arm of
> `GET /api/v1/courses`. Full write-up:
> [course-delivery-and-teacher-day](../decisions/course-delivery-and-teacher-day.md).

> **[dev, test (local + Neon) AND production, 2026-09-06] SECURITY AUDIT
> REMEDIATION — migrations 76, 77, 78 applied on all four; verify-db 32/32 on
> each.** Production (`ep-mute-rice-b2s8gg42`) was applied by Ali after a
> read-only pre-flight (status listed exactly the three, census 16 users /
> 0 payments / 0 transactions before and after). `expected-db-shape.json` is at
> 83 tables / 78 migrations. Schema went first; the code may deploy. Full
> status, per finding, in docs/security/security-audit-2026-09-06.md §4 (the 2026-09-11 audit is `docs/audits/SECURITY_AUDIT.md`). One shell note: `$DIRECT_URL`
> is NOT in the interactive shell, so the `connect_timeout` deploy variant needs
> `set -a; . ./.env.production; set +a` first — a bare `$DIRECT_URL` produces
> `P1013 scheme not recognized`, not a connection error. **[CORRECTED
> 2026-09-12] that `set -a` recipe does not work in zsh** — the unquoted `&` in
> the connection strings is a parse error; see the migration-81 entry at the top
> of this section for the `grep`-one-variable form that does.
>
> | # | migration | what it adds |
> |---|---|---|
> | 76 | `20260909120000_needs_review_enum` | `payment_intent_status` += `needs_review` (own file: ADD VALUE cannot share a tx with a use) |
> | 77 | `20260909120100_money_tables_revoke` | `REVOKE UPDATE, DELETE` on `wallet_ledger`, `parent_wallet_ledger`, `center_wallet_ledger`; `REVOKE DELETE` on `payments` — the launch-hardening step the wallet migrations deferred. Demo seeds purge money rows through `prisma/owner-purge.ts` on `ADMIN_URL` now |
> | 78 | `20260909120200_payout_maker_checker_email_change` | `payouts.external_ref` (partial unique), `paid_by`, `generated_by`; `notification_type` += `payout_paid`; table `email_change_requests`; expression unique `audit_logs_view_as_jti` |
>
> Prisma cannot model the two partial/expression uniques or the REVOKEs;
> `prisma migrate dev` WILL offer to drop them — refuse. `c07-security-audit-guards`
> asserts each by definition. verify-db's `APPEND_ONLY` now names the three
> wallet ledgers and `payments` (28 → 32 checks).
>
> **THE ERP ROUTE CENSUS IS 360 ƒ / 3 ○ / 0 ●, not 342/3/31.** M-09's nonce CSP
> is minted per request in `src/proxy.ts` and the root layout reads `headers()`
> for it, so every page under `[locale]` renders dynamically; the 31 SSG pages
> (faq, terms, help, changelog…) are dynamic now. Inherent to a nonce CSP, not a
> regression to chase.

> **[dev, test AND production, 2026-09-06] THE REFUND WORK — migrations 73, 74
> and 75, verify-db 28/28 on all three.** `expected-db-shape.json` is at 75.
> Applied dev → test → production, each after a read-only pre-flight (datasource
> line read, label confirmed, pending list checked, row census before and after).
> Production was `edura-env:production` on `ep-mute-rice-b2s8gg42` with **0
> payments and 0 transactions before and after** — the schema went first, the
> code follows, which is the 2026-08-02 ordering lesson.
>
> | # | migration | what it adds |
> |---|---|---|
> | 73 | `20260906120000_refund_foundation` | `payments.reversal_of_id` + `refunded_total` + `client_request_id`, `transactions.payment_id`, 2 CHECKs, 3 indexes |
> | 74 | `20260907120000_refund_channel` | `refund_channel` enum + the four-column evidence block, 2 CHECKs, 1 partial unique |
> | 75 | `20260908120000_refund_multiple_partials` | drops `payments_one_refund_per_payment`; rebuilds `transactions_one_refund_per_payment` with `payment_id IS NULL` |
>
> **THERE IS ONE REFUND DOOR: `POST /api/v1/payments/[id]/refund`.**
> `recordPaymentTx` now REFUSES a negative amount outright — the same refusal
> `adminRecordCenterPayment` always made — so the contradiction where one app's
> sanctioned flow was the other app's only flow is gone. `signedMoneySchema` was
> deleted with it: its only caller let any value down to −99,999,900 piasters
> through as a "refund". A refund takes a POSITIVE amount and the sign belongs
> to the row the service writes.
>
> **OPTION B, NOT A** — the money leaves the way it arrived, and the platform
> records an obligation it then confirms. Option A (wallet credit) was REJECTED
> on the evidence in `WALLET_SPENDABILITY.md`: `walletDebit` has no
> user-reachable caller, `CounterMethod` excludes `wallet` so the counter cannot
> take it back, nothing converts a balance to cash, and the payer is usually a
> parent who can neither see nor spend what lands in their child's wallet.
> Do not "finish" Option A without closing those four gaps first.
>
> **`transactions.status` CANNOT ANSWER "WAS THIS REFUND PAID?"** The table has
> UPDATE revoked (migration `00000000000003`), so a refund row written `pending`
> at arming can NEVER become `completed`; confirmation appends a second
> `adjustment` row instead. The state lives on **`payments.refund_confirmed_at`**
> and every reader keys off it — `refundsReport`, the accountant dashboard and
> the superadmin decision-queue tile were all corrected to do so. Filtering
> those readers on `status:"completed"`, which REFUND_DECISION.md originally
> proposed, would show **zero refunds forever**.
>
> **A REFUND ENDS COVERAGE, NOT MEMBERSHIP.** A full refund cancels the
> subscription in the same transaction — that is what stops `distribution.ts`
> paying teacher and centre at every later lesson for a student who was refunded
> (§1.4). The `enrollments` row is deliberately untouched: decision #2 says the
> subscription is the payment coverage and the enrollment is the roster link, so
> a money correction must not silently rearrange a teacher's roster. A receipt
> whose lessons have ALREADY settled is refused here and belongs to
> `refundLessonForStudent`, which runs on `platformDb` and may reach the wallets
> ERP may not. That gate is per-STUDENT (`transactions type:"payment"`,
> `fromEntityId = studentId`, `lessonId` in the covered sessions), because a
> lesson settled for somebody else moved none of this student's money.
> `session_settlements` cannot answer it — it is `sessionId @unique`.
>
> **PRISMA CANNOT MODEL NINE OF THESE OBJECTS AND `prisma migrate dev` WILL
> OFFER TO DROP THEM:** four CHECKs (`payments_reversal_is_negative`,
> `payments_refunded_within_amount`, `payments_refund_channel_shape`,
> `payments_refund_confirmation_complete`), two partial unique indexes
> (`payments_refund_external_ref_unique`, `transactions_one_refund_per_payment`),
> the `payments_client_request_unique` shape, and both bare FKs. Refuse.
> `apps/erp/tests/db/c06-refund-guards.test.ts` asserts them by DEFINITION, not
> by name — an index rebuilt without its `WHERE`, or a confirmation CHECK
> relaxed to drop `refund_external_ref IS NOT NULL`, would still be present under
> the same name and would still be wrong.
>
> **`migrate deploy` AGAINST PRODUCTION NEEDS A LONGER CONNECT TIMEOUT.**
> Measured 2026-09-06: `psql` with the exact `DIRECT_URL` connected, `prisma
> migrate status` connected, and `prisma migrate deploy` returned **P1001
> "Can't reach database server"** three times in a row against
> `ep-mute-rice-b2s8gg42`. It is the migrate engine's short connect timeout
> against a cold Neon endpoint, not credentials and not the connection string —
> dev carries identical `sslmode=require&channel_binding=require` params and
> deployed fine. The fix, and it worked first try:
>
> ```bash
> DIRECT_URL="$DIRECT_URL&connect_timeout=60&pool_timeout=60" \
>   EDURA_ENV=production EDURA_ALLOW_ENV_OVERRIDE=1 npx prisma migrate deploy
> ```
>
> Do not read a P1001 here as "production is down" — probe it with `psql` first.
>
> **[production, WIPED CLEAN 2026-09-06 — second Step 9 run.]** Earlier the
> same day the census read 16 users (12 `is_demo`), 2 centres, 2 courses: the
> UAT set seeded 2026-08-31 (`*@uat.edura.eg`) plus two hand-made accounts from
> 2026-09-01. Ali ran `production-cleanup.ts census` then
> `cleanup --confirm=wipe-14-users` (two-man rule): 14 users, 2 centres, 23
> tables of residue removed in 3 passes, 2 staff kept, catalog identical,
> 6 sequences restarted. verify-db 32/32 immediately after; census now
> **2 users / 0 centres / 0 courses / 0 payments / 0 transactions / 45 subjects**.
> Money had never been touched (0 payments, 0 transactions before and after).

> **[ALL THREE ENVIRONMENTS REBUILT FROM SCRATCH, 2026-08-30.] Every endpoint
> named further down this file is dead.** A new Neon project was created with
> three branches, each bootstrapped in the order `label-db` →
> `bootstrap-app-role` → `prisma migrate deploy` → `seed` → `verify-db`:
>
> | env | endpoint | migrations | verify-db | data |
> |---|---|---|---|---|
> | dev | `ep-withered-field-b23csnyq` | 70 | 28/28 | demo seed — 7 users, 1 center, **0 ledger rows** |
> | test | `ep-morning-snow-b269im2n` | 70 | 28/28 | `--no-demo` — 2 staff, 45 subjects |
> | production | `ep-mute-rice-b2s8gg42` | 70 | 28/28 | `--no-demo` — 2 staff, 45 subjects, 411 offerings, 0 money |
>
> Shape is identical on all three: 82 tables / 6 sequences / 41 RLS tables /
> 62 policies / 70 migrations.
>
> **THE TEST BRANCH IS THE SECOND ONE OF THAT NAME.** The first
> (`ep-wandering-resonance-b25h9bvh`) stopped accepting BOTH roles mid-session —
> owner and `edura_app` together, which is the signature of a branch reset, not
> of a mistyped password. Its replacement was branched **from production**, so it
> arrived carrying production's label, its 82 tables and a copy of its rows;
> `label-db` reported `was: edura-env:production`. It was relabelled, its
> `edura_app` password re-synced with a bare `ALTER ROLE ... PASSWORD` (no GRANT
> touched — re-running `bootstrap-app-role` on a populated database would have
> re-granted the UPDATE/DELETE that migration `00000000000003` revokes on the
> append-only ledger, which is why that script refuses), then wiped and reseeded
> `--no-demo`. **A production clone wearing an `edura-env:test` label is
> wipeable by `db:wipe` and writable by 95 suites** — check `label-db`'s `was:`
> line whenever a branch is recreated. `edura_app` was created fresh on each with a new
> password; the old `ep-patient-scene` (dev) and `ep-solitary-river`
> (production) are gone.
>
> **`DIRECT_URL` IS THE OWNER STRING, NOT THE APP ROLE.** `prisma.config.ts`
> passes it as the migration datasource, and `bootstrap-app-role.ts` runs
> `REVOKE CREATE ON SCHEMA public FROM edura_app` — so the app role can never
> migrate, by design. Deriving it as `edura_app` produces
> `ERROR: permission denied for schema public` from `migrate deploy`, which is
> what happened on 2026-08-30 before it was corrected. `extensions/index.ts`
> states the rule: *"Migrations and bootstrap keep using DIRECT_URL / ADMIN_URL
> — those must never appear in a serving environment."* In
> `packages/database/.env.*` both are the owner; in the serving files neither
> belongs, and the root `.env.production` carries an `edura_app` `DIRECT_URL`
> only because `gen-vercel-env.py` emits that key to both Vercel projects.
>
> **`EDURA_ENV=test` NOW REACHES A REAL TEST BRANCH.** `load-env.ts` and
> `prisma.config.ts` resolved only `production` vs everything-else, so
> `EDURA_ENV=test` silently loaded `.env.local` — dev. Both now resolve
> `.env.${EDURA_ENV}` with `dev` mapping to `.env.local`, and an unrecognised
> value throws instead of defaulting.
>
> **THE DB SUITES NOW RUN AGAINST THE REAL TEST BRANCH** (2026-08-31). Both apps
> gained a gitignored `.env.test`, and all 16 `test:db*` / `pretest:db` scripts
> name it instead of `.env.local`. `EDURA_ALLOW_DB_ENVS` is GONE from all three
> `.env.local` files: with a genuinely `test`-labelled branch the guard passes on
> the label, and the widening was actively harmful — it turned "reached the wrong
> database" into a silent pass. Measured before removal: `pretest:db` printed
> `ok — labelled 'dev'` for a run whose command line said `.env.test`.
>
> **`EDURA_ENV=test` INSIDE THOSE FILES IS LOAD-BEARING.** Every script starts
> with `import "./load-env"`, which resolves `packages/database/.env.${EDURA_ENV}`.
> Without that line it resolves `.env.local` and dev's owner string arrives as
> `ADMIN_URL` — which `db-guard` prefers over `DATABASE_URL`, so the guard reports
> a different database than the suites write to.
>
> **`bun run` IS FINE FOR THE SUITES**, contrary to what the rule below implies:
> measured with a real package script, `tsx --env-file` overrides what bun
> injects, so `bun run test:db` and `npm run test:db` both reach test. The
> `npx` rule stays for the `scripts/*.ts` DB tooling, which takes no `--env-file`.

> **⚠ `bun run` REACHES DEV WHATEVER `EDURA_ENV` SAYS.** This is the mechanism
> behind the 2026-08-20 note further down, which recorded the symptom without
> the cause. Bun injects the CWD's `.env.local` into the child process, and
> dotenv does not override a variable that is already set — so the file
> `load-env.ts` picks is read and discarded. Measured 2026-08-30 with a known
> production value in place:
>
> ```
> EDURA_ENV=production bun run <script>  -> ep-patient-scene-...  (DEV)
> EDURA_ENV=production npx tsx <script>  -> the intended endpoint
> ```
>
> **Use `npx tsx` / `npx prisma` for anything that is not dev. Never
> `bun run db:*`.** `migrate deploy` run the wrong way applies to dev while
> printing that it is production.
> [2026-09-24: `scripts/*.ts` now REFUSE on a host mismatch (`load-env.ts`);
> `prisma.config.ts` has no such check, so the prisma half stands.]

> Per the Conventions rule above, every claim here names its environment.
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target: prefer running it over trusting a line written here.

> **EVERY PRISMA COMMAND AGAINST A NON-DEV DATABASE STARTS WITH `EDURA_ENV`.**
> Not a style preference — it is the ONLY input that selects the database, and
> every other way of pointing prisma somewhere reaches **dev**, silently:
>
> ```bash
> EDURA_ENV=production npx prisma migrate deploy   # from packages/database
> ```
>
> `prisma.config.ts` loads `.env.${EDURA_ENV}` (defaulting to `.env.local`, which is
> dev) and passes the resulting `DIRECT_URL` as the datasource. Sourcing
> `.env.production` into the shell first does NOT work: measured 2026-08-20,
> `set -a; . ./.env.production; npx prisma migrate status` reported it was
> connected to `ep-patient-scene-…` — **dev** — while the operator believed they
> were looking at production. The command printed a perfectly ordinary
> "2 migrations pending" against the wrong database. `migrate deploy` run the
> same way would have applied them there.
>
> So: read the `Datasource "db": … at "<host>"` line prisma prints on EVERY
> invocation and check the endpoint before trusting anything below it.
> Production is `ep-mute-rice-b2s8gg42` (was `ep-solitary-river-…` until the
> 2026-08-30 rebuild); dev is `ep-withered-field-b23csnyq`
> (corrected 2026-08-30 — the dev branch was recreated; the `ep-patient-scene-…`
> named in the 2026-08-20 incident above is the OLD dev host, kept only as the
> record of what was measured that day).
>
> The same variable is what arms the guard: with `EDURA_ENV=production`,
> `prisma.config.ts` REFUSES `migrate dev`, `migrate reset`, `db push` and
> `db execute` outright. Reaching production without it means reaching it with
> the safety off as well as by accident.
>
> `scripts/*.ts` (db-guard, verify-db, wipe-data, seeds) read the same variable
> through `scripts/load-env.ts`, so `EDURA_ENV=production npx tsx scripts/…`
> is the one form for those too.

- **[dev AND production, 2026-08-20]** **57 migrations, verify-db 28/28 on
  BOTH**, identical in shape (79 tables / 6 sequences / 38 RLS tables / 59
  policies / 57 migrations). The 57th is `20260820180000_search_text_remaining`:
  `search_text` on `student_profiles` and `rooms`, completing the rule that
  **EVERY TABLE A FREE-TEXT SEARCH REACHES CARRIES `search_text`** — six tables,
  and `apps/erp/tests/db/search-normalize.test.ts` asserts that set exactly, so
  a seventh column appearing (or one of these disappearing) is a red test.
  **WHY SIX AND NOT SEVENTY-NINE**, measured rather than assumed: 58 tables carry
  a candidate free-text column, but only six are reached by any search in the
  product — no Prisma `contains`, no refine `operator: "contains"`, nothing, on
  the other 52. A generated column there is write cost on every insert and update
  with no reader, and on `transactions` / `points_ledger` / `wallet_ledger` /
  `audit_logs` — append-only, money, highest volume — it is that cost per ledger
  row forever. The `chatbot_*` tables are descoped surface and were not touched.
  **`student_code` AND THE GUARDIAN COLUMNS ARE DELIBERATELY ABSENT** from the
  student haystack: the code is matched through `readStudentScan`, whose check
  character means a mistype resolves to NOBODY rather than to a different child,
  and a guardian's email or phone would make a CHILD findable by their parent's
  contact details. Both would widen reach, which global-search rule 1 forbids.
  **`lookupStudents` KEPT ITS JS DECIDE PASS**, and that is not redundancy: its
  haystack spans TWO tables (the profile's name/phone and the user row's), a
  generated column cannot reference another table, and a query naming a student
  by their user-row name and their profile phone satisfies the joined haystack
  and NEITHER column alone. The columns are its pre-filter; JS is its decision.
- **[dev AND production, 2026-08-20]** **56 migrations, verify-db 28/28 on
  BOTH** — the shape is identical again (79 tables / 6 sequences / 38 RLS tables
  / 59 policies / 56 migrations). The 56th is
  `20260820160000_search_text_columns`, applied to dev and then to production
  the same day; production's pre-flight showed exactly ONE pending migration
  with no sibling riding along, and 9 / 2 / 1 / 0 rows to backfill.
  It adds ONE `search_text` column to each of `users`, `centers`, `courses` and
  `contact_submissions`, **`GENERATED ALWAYS AS (edura_search_haystack(…))
  STORED`** — the row's searchable fields normalized, plus the same text with
  its spaces closed up, which is exactly what `matchesSearchTerms` compares. It
  also retires the five expression indexes from migration 55, whose query the
  application no longer issues. Tables stay 79: a column is not a table.
  **THE HAZARD, WRITTEN DOWN BECAUSE IT IS SILENT.** A STORED generated column
  is computed on WRITE. `CREATE OR REPLACE FUNCTION` on `edura_search_normalize`
  with a different body would NOT recompute the rows already stored, and the
  database would hold two definitions of the same word with nothing to say so.
  **Changing the normalizer requires rebuilding these columns.**
  `apps/erp/tests/db/search-normalize.test.ts` compares every stored value
  against a live call, which is what turns that into a red test rather than a
  quiet divergence — 43/43 on dev.
  **Prisma does not model generated columns**, so `prisma migrate dev` will
  propose turning them into ordinary ones. They are named in `schema.prisma`
  (with that warning on `User.searchText`) only so a typed `where` can filter
  them; writing to one fails at the database, which is a loud failure.
  Measured after applying, on production itself: all four columns report
  `is_generated = ALWAYS`, the four `*_search_text_trgm` indexes exist, zero
  expression indexes remain, zero desync rows, and data untouched (9 users /
  2 centers / 1 course / 0 payments / 0 transactions).
- **[dev, 2026-08-20]** **55 migrations, verify-db 28/28** — level with
  production again. The two were applied the same day and the same way
  (`npx prisma migrate deploy`, EDURA_ENV unset, which is what selects dev; the
  printed datasource read `ep-patient-scene-…`). Pre-flight matched production's:
  `centers_wallet_balance_nonneg` was already `convalidated`, no negative wallet
  balance, no `*_search_trgm` index yet. Data untouched: 257 users / 71 centers
  / 62 courses before and after.
  **The normalizer proven against real dev rows, which is the whole point:**
  searching `احمد` through `edura_search_normalize` returns 3 (أحمد الشناوي,
  أ. أحمد الشناوي, يوسف أحمد) where plain `ILIKE '%احمد%'` returns **0** — the
  exact failure the migration header measured on 2026-08-19.
- **[production, 2026-08-20]** **55 migrations, verify-db 28/28.** The two above
  were applied 2026-08-20 with `EDURA_ENV=production npx prisma migrate deploy`.
  Pre-flight (read-only) proved: the label reads `edura-env:production`, exactly
  those two were pending with no sibling riding along, `centers` held no negative
  wallet balance, and the five tables to be indexed held 9 / 2 / 1 / 0 rows — so
  the migration's own `NOT CONCURRENTLY` caveat did not bite. After: `pg_trgm`
  installed, `edura_search_normalize` present with EXECUTE granted to
  `edura_app`, five `*_search_trgm` indexes built, and the normalizer proven on
  production itself (`أحمد` == `احمد`, `فريدة` == `فريده`, `كنزي` == `كنزى`).
  `centers_wallet_balance_nonneg` was ALREADY `convalidated` there, so the first
  migration was the no-op its guard intends. Data untouched: 9 users / 2 centers
  / 1 course / 0 payments / 0 transactions, identical before and after.
  The 28th check is new — verify-db now asserts `convalidated` on that CHECK,
  which is the gap the first of these two migrations closes for fresh
  environments.
- **[2026-08-18, HISTORY — the two lines above supersede it]** 53 migrations,
  79 tables, verify-db 27/27, and dev and production identical in shape at that
  date (79 tables / 6 sequences / 38 RLS tables / 59 policies / 53 migrations).
  They are NO LONGER identical — see the dev line above. Bootstrapped
  2026-07-31; the
  `centers_wallet_balance_nonneg` CHECK is VALIDATED. Bootstrap order for a
  fresh environment: `label-db` → `bootstrap-app-role` → `prisma migrate deploy`
  → `seed` → `verify-db`.
  The 53rd is `20260818120000_review_per_lesson_unique`, applied to production
  BEFORE the code that needs it shipped — the order the 2026-08-02 outage note
  below demands. Pre-flight was read-only and is worth copying: `migrate status`
  proved exactly ONE migration was pending (no sibling branch riding along), and
  a SELECT proved `reviews` held 0 rows with no duplicate that either new index
  could reject.
- **[production, WIPED CLEAN 2026-08-26] MVP blocker #7 executed.** The
  walkthrough residue (7 users, 2 centers — Neyora + el maged, 1 course, 26
  sessions, 137 rows across 20 tables) was deleted via the migrate-production
  workflow's new `census`/`cleanup` modes (`packages/database/scripts/
  production-cleanup.ts` — census-then-confirm two-man rule, one transaction,
  catalog counts asserted identical inside it, sequences restarted so the
  first real receipt is 00001). KEPT: the two real staff accounts (super_admin
  + accountant) with their auth rows, the full catalog, and the config
  singletons. verify-db 28/28 immediately after, on ep-solitary-river. A fresh
  encrypted dump was uploaded to B2 minutes before the wipe (the weekly
  restore-proof step still fails on the known B2 key gap — blocker #5).
  Diagnosis note for future FK work: ON DELETE RESTRICT reports SQLSTATE
  23001, NOT 23503 — the first cleanup run failed exactly there.
- **[SUPERSEDED 2026-08-31 / 2026-09-06 — `.env.test` exists again in both apps and
  `packages/database`, and the suites run against a local `edura_test` Postgres; see
  "The DB suites run against a LOCAL Postgres" at the top.]**
  **[test] THERE IS NO TEST DATABASE, LOCALLY.** The three `.env.local` files
  point at DEV and `db-guard` reports them as `labelled 'dev'` — the 2026-08-03
  decision still holding, not a gap. Do NOT read any `[test]` line in a decision
  doc as work pending. (This sentence named `.env.test` until 2026-08-28; those
  files no longer exist — see the widening note in the DB-suites section above.)
  CI is the exception and always has been: it creates its own throwaway
  Postgres per run, labelled `edura-env:test`, so a genuinely test-labelled
  database does exist there.
  **[dev, 2026-08-28] THE `hall-booking` A4 WARNING THAT STOOD HERE IS
  WITHDRAWN — A4 PASSES.** It said A4 ("a per-student hall with NO configured
  rate is refused at REQUEST time") FAILS on dev because `commission_settings`
  carried a `global` row with `center_per_student_bp = 1500`. Measured
  2026-08-28, that column is **NULL** on dev; the `1500` on that row is
  `center_share_bp`, a DIFFERENT column. The full erp suite run the same day
  did not list `hall-booking` among its failures.
  **A note like this is more dangerous than the bug it describes**: for ten days
  it told every reader to dismiss a red A4 as known-and-fine, which is exactly
  how a real regression walks in unchallenged. Verify a claim like this against
  the database before repeating it.
  **THE UNDERLYING HAZARD IS REAL AND STILL LOADED**, which is probably what was
  measured in August: `packages/database/prisma/room-rate-demo-seed.ts` writes
  `centerPerStudentBp = 1500` onto the **global** `commission_settings` row —
  and its `else if` branch fills that column in even when the row already
  exists. That is a DEMO seed permanently mutating non-demo platform money
  config, which no `is_demo` purge reverses. Run that seed on any database and
  A4 goes red again, for the reason the withdrawn note described.
  A4 is also **not hermetic**: it asserts a refusal that only happens while a
  globally-scoped value is ABSENT, and the superadmin UI can set that value.
- **`expected-db-shape.json` was at 72 [dev, test AND production, 2026-09-05] —
  HISTORY, now 81; see the top of this section.**
  Migration 72 is `20260905120000_dedupe_guards_c5` — four partial unique
  indexes: one active blacklist entry per (target) at platform level, per
  (target, center) at center level, per (target, imposer) at teacher level, and
  one `proposed` teacher agreement per (center, teacher). Applied dev → test →
  production the same day, each after a read-only pre-flight
  (`scripts/dedupe-census.ts` 0 rows / 0 duplicates, datasource line read,
  exactly one pending); verify-db 28/28 on all three. Migration 71 is
  `20260902120000_dedupe_guards` (C-4), likewise on all three. Prisma cannot
  model any of these seven partial/expression indexes — `prisma migrate dev`
  WILL propose dropping them; refuse. `c04-dedupe-guards` and
  `c05-dedupe-guards` are what enforce them. Plans: MIGRATION_PLAN_C4.md,
  MIGRATION_PLAN_C5.md. The entry below is history from when the file was at 70.
- **`expected-db-shape.json` was committed at 70 [2026-08-31].** Migration 70
  (`20260831090000_payout_client_request_id` — `payouts.client_request_id`
  + composite unique on beneficiary+key) is applied to **dev [2026-08-31]**
  and **production [2026-08-31]**, verify-db 28/28 on both; production
  pre-flight proved exactly one pending migration, label
  `edura-env:production` on `ep-mute-rice-b2s8gg42`, and data untouched
  (2 users / 0 payouts / 0 transactions before and after). Applied BEFORE the
  payout code deploys, per the 2026-08-02 ordering lesson.
  **[test, 2026-08-31] RESOLVED — the entry that stood here is superseded.** It
  said test was stuck at 69, blocked on credentials, parked, with an "orphan"
  `apps/superadmin/.env.test` that "nothing reads". All three claims are wrong
  as of the same day, and acting on them would undo working configuration.
  What actually happened: `ep-wandering-resonance-b25h9bvh` stopped accepting
  BOTH roles at once — the signature of a branch reset, not a stale password —
  so the branch was replaced by `ep-morning-snow-b269im2n`. That replacement was
  cut FROM PRODUCTION (`label-db` reported `was: edura-env:production`), so it
  arrived with production's schema, its rows and an `edura_app` carrying
  production's password. It was relabelled, the role password re-synced with a
  bare `ALTER ROLE ... PASSWORD` — deliberately NOT `bootstrap-app-role`, which
  refuses on a populated schema because its `GRANT ... ON ALL TABLES` would
  re-grant the UPDATE/DELETE that migration `00000000000003` revokes on the
  append-only ledger — then wiped and reseeded `--no-demo`.
  Measured after: **70 migrations, verify-db 28/28**, 2 staff / 45 subjects /
  0 money, and `center-directory-search` green at 7/7.
  `apps/erp/.env.test` and `apps/superadmin/.env.test` are BOTH deliberate and
  BOTH read — all 16 `test:db*` / `pretest:db` scripts in the two apps name
  them. Do not delete them as orphans. Before this, the file was at 69
  and matched all three (measured 2026-08-30: 82 tables / 6 sequences /
  41 RLS tables / 62 policies / 69 migrations). The entry that stood here said it
  was pinned at 53 and trailing — it is not, and acting on that sentence would
  mean re-baselining a file that is already correct. A shape mismatch reported
  today is a real mismatch: investigate it, do not re-baseline it away.
- **[production Vercel, 2026-08-19] `STUDENT_QR_SECRET` IS GONE.**
  A 2026-08-09 entry (since removed from this file) recorded it as set on BOTH `edura-www` and `edura-superadmin`
  with the SAME value. Those projects were deleted (see the entry below), and
  the value lived ONLY on the dashboard — it is not in `.env.production` and not
  in the repo. It must be generated fresh and set, identically, on the ERP and
  superadmin projects. **[2026-08-19] A fresh one has now been generated and
  written to `.env.production`**, and carried identically into `.env-erp` and
  `.env-superadmin`. `qrSecret()`
  (`packages/server-core/src/services/students/student-qr.ts:15`) THROWS in
  production when it is unset; there is deliberately no fallback. Takes effect
  only on REDEPLOY, since Vercel bakes env at build time.
- **[production, 2026-08-19 — HISTORY: the projects were recreated;
  edura-erp.vercel.app answered on 2026-09-06, see below] THE VERCEL PROJECTS WERE
  DELETED — NOTHING IS DEPLOYED.** All three hosts return `x-vercel-error: DEPLOYMENT_NOT_FOUND`
  (measured 2026-08-19). Ali is recreating them; the full rebuild sheet —
  root dirs, the `turbo run build` exit-127 trap, and the per-project env
  matrix — is [vercel-project-recreate](../runbooks/vercel-project-recreate.md).
  Two independent breakages recorded there, neither caused by the deletion:
  mail was unconfigured (`SMTP_HOST=REPLACE`) with `INVITE_CHANNELS=email` and
  `WHATSAPP_MODE=mock`, so NO invite could be delivered at all — **[production,
  RESOLVED, measured 2026-09-06]** Gmail SMTP is wired AND `SMTP_PASS` is set on
  Vercel: `GET /api/health?deep=mail` against `edura-erp.vercel.app` returned
  `mail: { ok: true }`, i.e. a real SMTP handshake succeeded. The "only
  SMTP_PASS is outstanding" sentence in the runbook is stale; and `apps/www` needs
  `NEXT_PUBLIC_APP_ORIGIN` or every login/register CTA on the marketing site
  falls back to `http://localhost:3002`.
  The entry below is the hostname policy, which still holds:
- **[production, CORRECTED 2026-08-19] THE INTENDED HOSTS ARE THE VERCEL ONES.**
  `edura-erp.vercel.app`, `edura-www.vercel.app`, `edura-superadmin.vercel.app`.
  **`app.edura.eg` is NOT in use** — it has no DNS record and Ali does not use
  it. Do not put it in code, config or docs. A 2026-08-09 entry (since removed
  from this file) recorded `APP_BASE_URL` as pinned to `app.edura.eg`; that value emits links to a host
  that does not resolve, and the local `.env.production` has been corrected to
  `https://edura-erp.vercel.app` for all four of `NEXTAUTH_URL`, `APP_BASE_URL`,
  `APP_ORIGIN` and `APP_INTERNAL_URL`.
  **`.env.production` is gitignored and local-only** — production reads the
  Vercel dashboard, so the dashboard values still need changing there by hand;
  editing the file changes nothing a user sees.
  A claim/invite link belongs to the **ERP** host, not `edura-www`: it lands a
  student inside the app. `NEXTAUTH_URL` in that shared file is the ERP's —
  the per-project env sheets (root `.env-erp` / `.env-superadmin` /
  `.env-realtime`) are derived from the root `.env.production`, and superadmin
  signs in at its own host, so it must override it per project.
- **[2026-08-19] A DUPLICATE `appBaseUrl()` MADE `APP_BASE_URL` A NO-OP ON THE
  INVITE PATH.** `services/invites/invite-token.ts` defined its own copy that
  read `NEXTAUTH_URL` and fell back to `http://localhost:3002`, never consulting
  `APP_BASE_URL` — so walk-in claim links, guardian-verification links and
  welcome emails all ignored it. `http/app-url.ts` documents that this function
  "lived duplicated in five places"; this was the copy that survived. It now
  re-exports the canonical resolver. Anything that reasons about public link
  hosts before 2026-08-19 was reasoning about a value that did not apply.
- **[production Vercel, 2026-08-10]** `edura-showcase` live at
  `https://edura-showcase.vercel.app`. Vercel auto-detects Turbo and runs
  `turbo run build`, which dies on this Bun-only repo (`env: 'node'` not found,
  exit 127) — every project needs an explicit `buildCommand`.
- **[2026-08-30] BACKUPS ARE SCHEDULED AGAIN — and the entry that stood here was
  wrong in both halves.** It said there was no bucket and no `BACKUP_*` secrets.
  `gh secret list` shows **nine** of them, set 2026-08-08: `BACKUP_DIRECT_URL`,
  `BACKUP_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` / `_BUCKET` / `_ENDPOINT` /
  `_REGION`, `BACKUP_AGE_IDENTITY` / `_RECIPIENT`, `BACKUP_ALERT_EMAIL`.
  What was actually missing was the **trigger**: `backup.yml` carried only
  `workflow_dispatch`, while two jobs tested `github.event.schedule ==
  '30 2 * * *'` and `== '0 4 * * 1'` — conditions that could never be true. Both
  crons have been added, so the nightly dump and the weekly restore-proof now
  fire on their own.
  **`BACKUP_DIRECT_URL` was ALSO pointing at a database that no longer exists** —
  it was set on 2026-08-08 against `ep-solitary-river`, and the production branch
  was rebuilt as `ep-mute-rice-b2s8gg42` on 2026-08-30. It has been repointed at
  the new unpooled owner string. A configured backup aimed at a dead endpoint is
  worse than an unconfigured one: it looks like protection.
  → [backup-restore runbook](../runbooks/backup-restore.md)
- **[2026-09-06] CRON IS SCHEDULED.** `CRON_SECRET` and `CRON_BASE_URL`
  (`https://edura-erp.vercel.app`) are now repo secrets; the value matches the
  one Vercel runs with (proven: `POST /api/v1/cron/expire-payment-intents` with
  it returned 200 against production). The four schedules in
  `.github/workflows/cron.yml` fire on their own from this date. The entry below
  is history.
- **[HISTORY, 2026-08-09] NO SCHEDULED CRON JOB RUNS ANYWHERE.** Neither `CRON_BASE_URL` nor
  `CRON_SECRET` is set as a repo secret (verified 2026-08-09 with
  `gh secret list`). `CRON_SECRET` fails closed, so the schedule is inert rather
  than dangerous — but do not read `.github/workflows/cron.yml` existing as jobs
  being scheduled.
