# Global search — the ⌘K palette finds RECORDS, not just screens (built 2026-08-15 — awaiting review)

Ali's request, 2026-08-15: "اجعله more advanced… اريد المستخدم يبحث علي اي حاجه
داخل المنصه يلاقيها". The palette searched destinations only ("where is the
counter?"); it now also answers "where is Mariam?", "which group is the French
one?", "who does receipt RCP-NILE-2026-00004 belong to?". Kernel
`packages/server-core/src/services/search/global-search.ts`, route
`GET /api/v1/search`, client `apps/erp/src/lib/api/use-global-search.ts`.

1. **IT ADDS NO REACH, and that is expressed as a TABLE rather than as prose.**
   Every provider reads what the caller's role ALREADY reads through an existing
   route, under the same tier constant and the same tenancy. `CENTER_PROVIDERS`
   carries a `tier` column that can be diffed by eye against the CAPABILITY MAP
   in `lib/authz/center-actor.ts` — a global search is the most tempting place
   in a product to widen a boundary quietly, because it is one query with no
   screen to review.
2. **IT OFFERS NOTHING THE ROLE CANNOT OPEN** (constitution §3: excluded
   capabilities are ABSENT, never disabled). So `portals` is a SECOND column
   beside `tier`, answering a different question: `tier` is "may they read it",
   `portals` is "does the screen this hit links to exist in the portal they are
   standing in". A manager passes the tier for courses and fails the portal —
   the staff portal has no classes screen — so the provider does not run for
   them at all rather than returning rows that 404.
3. **FREE TEXT IS NARROWER THAN AN IDENTIFIER, and for students this is NOT
   re-implemented.** `lookupStudents` already draws that line (roster-bounded
   for a name, platform-wide for a verified code or a full phone) with its own
   tiered disclosure, so it is called AS-IS. A second definition of "who may
   this center see" is exactly the drift this codebase keeps refusing. A child
   reached by code from another center comes back MASKED and pointed at
   `/checkin?code=…` — the counter, which is the only thing this center may
   legitimately do with a walk-in carrying somebody else's card — never at a
   record page.
4. **`center_accountant` IS A SIDEWAYS TIER, NOT A RUNG.** `centerHolds()` gives
   a manager the receptionist's tier (superset, as `RECEPTION` encodes) but does
   NOT let the accountant fall through to it: they reach receipts and nothing
   else. Proven in both directions — a student name finds an accountant nothing,
   and a receipt number finds a manager nothing.
5. **DESTINATIONS ARE MATCHED LOCALLY AND ALWAYS DRAWN FIRST.** An operator who
   typed two letters meaning "attendance" must not have their selection move
   under them when a student list lands 200ms later. Records arrive under their
   own kind headings below.
6. **cmdk's OWN FILTER IS OFF (`shouldFilter={false}`), and that is a
   correctness fix, not a preference.** Its fuzzy matcher would re-filter the
   SERVER's records against the raw query and silently drop a student found by
   phone number whose name does not contain those digits — matched on a column
   the client cannot see. Owning the match also drops fuzzy scoring, which
   accepts `wlt` for "wallet" and `sett` for both Settings and Settlements: on a
   counter, predictable beats clever.
7. **THE EMPTY STATE IS SUPPRESSED WHILE AN ANSWER IS COMING**, and `loading` is
   true whenever the LIVE query is ahead of the answer in hand — not merely
   while a request is in flight. Otherwise every search flashes "no results"
   before its results, and the gap between a keystroke and the 220ms debounce
   shows the PREVIOUS query's rows with nothing saying they are stale. The
   server echoes `q` back so the client can check that the answer it holds
   answers the question in the box.
8. **MONEY IS FORMATTED WHERE THE LOCALE IS.** `SearchHit.amount` is signed
   PIASTERS, a NUMBER, rendered by `formatEGP` in the palette — so a refund
   reads as `-25.00 ج.م` and needs no English `status` token beside it. For the
   same reason a hit carries no `isShell` flag and a hall shows its DESCRIPTION
   rather than a bare capacity: this kernel has no catalogue to label a naked
   number from, and `30` beside a hall name reads as a fragment.
9. **HAND-OFF PARAMETERS, ONE HELPER** (`lib/api/use-param-seed.ts`). Where a
   hit's destination is a LIST rather than a detail page, the href carries
   `?q=` (center classes) or `?courseId=` (teacher classes, teacher gradebook)
   and the screen seeds its own state from it ONCE — the same pattern the
   student-card QR already uses for `/checkin?code=`. The latch matters: without
   it the parameter stays in the URL and re-pushes the reader's own edits back
   to the value they arrived with. A teacher's STUDENT opens the gradebook of
   the group they are in, because the teacher portal has no student record page
   and inventing a link to one would be a hit that 404s.
10. **`apps/superadmin` followed the same day — see the section below.** It was
    deliberately left out of the first pass because its surfaces carry audit
    obligations of their own; Ali asked for it immediately after.

**No database migration, no schema change, no new read that any role did not
already hold.** New i18n keys are all under `shared.search*`.

Proof: `apps/erp/tests/db/global-search.test.ts` **33/33** (live DB, real
services, and the REAL `authorizeCenterActor` so the staff link resolves the way
a request resolves it) — per-kind tenancy for students / groups / halls / staff /
teachers / receipts; the whole tier map; a name failing and that same child's
code succeeding masked and pointed at the counter; an assistant seeing EXACTLY
the teacher's students and no centres; a PENDING parent link resolving to
nothing; a one-character query running no provider at all; every href landing
inside the portal that asked; and a census proving a search writes nothing, not
even an audit row. Unit: `tests/unit/palette-search.test.ts` **12/12** (the
both-scripts matcher, substring-not-fuzzy, grouping preserved, and the staleness
rule). Regressions: `check-types` **9/9**, `bun run build` **3/3**, erp unit
**1175 pass / 1 skip (75 files)**, superadmin unit **106**, DB
center-staff-delegation **55/55** and counter-board **39/39**, lint error-parity
at the recorded baseline (**14**, all pre-existing in
privacy/terms/use-chat/sw.js).

Verified live in the browser on dev, **Arabic/RTL and English/LTR, light and
dark**: a student found by name opening their record page; a group found by name
seeding the classes screen's own search box; a hall found with its description;
both receipts found by a partial receipt number with the refund reading as a
negative amount; a mixed query showing a destination group and a record group
together; the teacher portal finding their own student and opening that group's
gradebook pre-selected; and the parent portal finding their approved child.

**NOT verified in the browser:** the masked off-roster student (the dev database
holds no second center with a student to scan — it is covered by the DB proof,
which asserts both the mask and the `/checkin?code=` href), the staff portal's
three tiers (no quick-login tiles; covered by the same proof), and
`apps/superadmin` (2FA login Claude will not enter — and its palette is
unchanged by this work).

### The back office got it too (2026-08-15, Ali — same day)

`apps/superadmin`'s palette now finds records as well: any person on the
platform, any center, any online payment attempt. Service
`packages/server-core/src/backoffice/admin/global-search.ts`, route
`GET /api/v1/search`, wired through the same `AppShell` `search` prop.

1. **A SECOND IMPLEMENTATION, ONE CONTRACT — and that split is the decision.**
   It imports `SearchHit` / `SearchGroup` / `MIN_QUERY_LENGTH` / `PER_KIND` /
   `rankHits` from the shared kernel and owns its own providers, because what it
   reads is genuinely different: the ERP kernel reads ONE TENANT through
   `scopedDb`, this reads THE PLATFORM through `platformDb`. Folding them into
   one function would mean the shared kernel importing app services and, worse,
   a single `where` whose tenancy is a PARAMETER — and a tenancy that is a
   parameter is one somebody eventually passes wrong. What is shared is
   everything a reader can perceive: row shape, ordering, and the two-character
   floor.
2. **EACH PROVIDER CALLS THE SERVICE ITS OWN LIST SCREEN CALLS, AS-IS.**
   `listUsers` and `listPaymentIntents`, under the same `requireRole`. So the
   search cannot match a column the list would not, and cannot return a row the
   list would hide — proven with a soft-deleted user, which is excluded by the
   client extension rather than by a `where` this module re-wrote.
3. **NOTHING AUDITED IS REACHED FROM HERE, and that is the reason this app was
   held back a pass.** `buildStudentCard` writes `student.card_viewed` in the
   same transaction as its read precisely so a card view leaves a trace; a
   search that surfaced card data would be a second, quieter door onto an
   audited read. The module imports no money service and no card reader, writes
   no audit row of its own, and the proof asserts both by reading its source.
4. **PEOPLE ARE GROUPED BY ROLE, not lumped as one "user" kind.** The back
   office's directory is mostly names, and «الطلاب / المدرّسون / أولياء الأمور»
   is what makes twelve of them scannable — headings that are already translated
   and already meaningful, versus one undifferentiated run with an English enum
   in the subtitle. Four kinds were added to the shared union for it (`parent`,
   `assistant`, `center_admin`, `back_office`), plus `payment_intent`.
5. **THE STUDENT CODE RESOLVES HERE, and it is the one thing the users list
   cannot do.** `listUsers` matches name / email / phone; the code lives on
   `student_profiles`, so a receptionist ringing the back office reading
   `G7K3M2QF` off a card could not be helped from the one box. Not a widening —
   it lands on a user this role can already list, reached by an identifier the
   caller was handed. Case-insensitive, because nobody types a card in caps, and
   the code hit wins the dedup against a substring match on somebody's email.
6. **THE ACCOUNTANT HOLDS EXACTLY ONE PROVIDER, and that is not an oversight.**
   Payment attempts, at `/dashboard/finance/payments?q=…`. Its other screens
   (payouts, subscriptions, commission) carry no per-record destination and no
   identifier a human reads aloud — a UUID and a gateway ref are not things
   anyone searches by — so a hit for them would have nowhere honest to land. The
   proof asserts the accountant's result set EXACTLY (`payment_intent` and
   nothing else) rather than spot-checking one absence: the intent's payer bears
   the searched name, so "money only" and "nothing at all" are different
   outcomes and only the first is being claimed.
7. **ONE PROVIDER SERVES BOTH PORTALS because the SCREEN already does.**
   `PaymentIntentsScreen` takes `apiBase: "admin" | "finance"`; the hit's href
   just picks the portal from the caller's role, and `?q=` seeds the screen's
   own search box (`useParamSeed`, a deliberate fifteen-line twin of the ERP's —
   a shared package for one `useEffect` would cost both client bundles more than
   it saves).
8. **Centers are the one provider written from scratch** — `listCenters` filters
   by status and pages but has no `q`. Same table, same `platformDb`, and it
   matches the SHORT ID as well as the name, because that is what a center is
   referred to by over the phone.

**No database migration, no schema change, no new read that either role did not
already hold.** New i18n keys under `shared.search*` in both locales; the
placeholder changed from "اكتب اسم الشاشة…" to name records too.

Proof: `apps/superadmin/tests/db/global-search.test.ts` **27/27** (live DB, real
service) — all seven person kinds landing under their own role heading and a
teacher never under Students; the soft-deleted user absent; the student code
resolving, case-insensitively, badged, onto the user record page; a center by
short id; the exact accountant result set and every accountant href landing in
`/dashboard/finance`; the super admin reaching the same payment at their own
portal's copy; a one-character query running no provider; and a census proving
three dozen searches wrote no row and no audit entry. Regressions: root
`check-types` **9/9**, `bun run build` **3/3**, superadmin unit **106**, erp unit
**1175 pass / 1 skip**, the ERP's own `global-search` DB suite still **33/33**
after the shared-kernel edits, lint error-parity (**2**, both pre-existing).

**NOT verified in the browser — `apps/superadmin` is behind a 2FA login whose
credentials Claude will not enter, as with every previous change to this app.**
What WAS checked live: the new route answers **401** unauthenticated on the dev
server, so it exists, is wired, and fails closed. Everything else about it rests
on the 27/27 suite, typecheck and build. The palette component itself is the one
the ERP side was verified against in both scripts and both themes.

---

## The search did not work, and the reason was the Arabic (2026-08-20)

Ali, 2026-08-20: "البحث global … لا يعمل … المستخدم ممكن يخش يبحث علي اي حاجه".

Nothing was broken in the wiring. The palette fetched, the route authorized, the
providers ran, and the answer came back empty — because every one of those
providers compared BYTES. Prisma's `contains` with `mode: "insensitive"` is
`ILIKE`, and ILIKE folds ASCII case and nothing else. Measured against the dev
database before any change:

| stored | typed | rows |
|---|---|---|
| `أحمد` (3 rows) | `احمد` | **0** |
| `إيهاب` | `ايهاب` | **0** |
| `فريدة` | `فريده` | **0** |
| `كنزي` | `كنزى` | **0** |
| `ملك حسن` | `حسن ملك` | **0** |

An Egyptian typist omits the hamza (it needs Shift on the standard layout),
writes `ة` and `ه` interchangeably, does the same with `ى` and `ي`, and gives
the family name first about as often as last. Each of those returned an empty
list from a search that was working perfectly — which is worse than an error,
because at a counter it reads as *this child is not registered here*.

1. **ONE NORMALIZER, AND IT LIVES WHERE BOTH HALVES CAN REACH IT.**
   `@repo/database/search-text` — a pure string module importing nothing.
   `@repo/database` is the only package BOTH `@repo/server-core` (the query
   side) and `@repo/ui` (the palette's own destination matcher) already depend
   on, which is the same reason `chat-policy` lives there. A second copy would
   be a search that behaves differently depending on which box you typed into.
   It folds the hamza forms, `ة→ه`, `ى→ي`, the hamza carriers, the Persian
   shapes a mis-set phone keyboard emits, the tashkeel, the tatweel, the
   invisible bidi controls a paste drags along, and Arabic-Indic digits onto
   ASCII. It is NOT fuzzy: `wlt` still does not find «wallet», and a wrong
   letter still fails. It accepts the same letter written the way people write
   it, which is a different thing.

2. **TWO STAGES, BECAUSE THE DATABASE HOLDS THE RAW TEXT.** Normalizing the
   query alone fixes nothing — `«احمد»` still is not a substring of `«أحمد»`.
   So each provider NARROWS in SQL on `literalFragments` (the pieces of the
   query that survive normalization unchanged, and can therefore be compared
   byte-wise: `«احمد» → «حمد»`) and then DECIDES in JS with
   `matchesSearchTerms`. The narrowing is deliberately loose — `«حمد»` also
   matches `«محمد»` — and the only property it must have is that it can never
   EXCLUDE a row the full query would accept. That is asserted directly in
   `tests/unit/search-text-arabic.test.ts`.

3. **THE PRICE IS A WIDER `take`, NOT A WIDER READ.** `SEARCH_SCAN_LIMIT` (120)
   replaces `PER_KIND` at the SQL layer so the loose stage cannot fill the page
   with near-misses and push the real answer off the end. No provider's tenancy,
   tier or `where` scope changed: every one is still bounded to ONE center's
   roster, ONE teacher's courses or ONE parent's approved children BEFORE the
   cap applies. The tier table in `CENTER_PROVIDERS` is untouched.

4. **DIGITS ARE LITERAL-SAFE, AND THE PRICE IS PAID IN A SECOND OR-BRANCH.**
   Excluding them would have been tidier (`٠` folds onto `0`, so `0` is not
   strictly safe) but would have left every receipt number, phone and student
   code with NO usable fragment — and a receipt search would then scan and
   silently miss the 121st row. `fragmentVariants` sends a digit-bearing
   fragment twice, once per numeral system. The remaining gap is a value
   written in MIXED numerals, which no keyboard produces and which dev holds
   none of (measured: zero non-ASCII digits across `users.phone`,
   `student_profiles.phone`, `student_profiles.student_code`,
   `payments.receipt_number`).

5. **THE SCANNER'S URL IS READ RAW, AND THAT ORDERING IS LOAD-BEARING.** A
   keyboard-wedge scanner types the card's whole signed URL into the box, and
   normalization turns every `:` `/` `-` in it into a space. Normalizing before
   `readStudentScan` fed it a sentence and resolved a real card to NOBODY —
   caught by `student-qr-credential.test.ts`, which is why that suite asserts
   it. `lookupStudents` now reads the raw string first and retries with
   `normalizeIdentifier` only when the raw form is unreadable, which is the
   other hand: a code typed on an Arabic keypad, or read aloud and typed back
   with a dash.

6. **THE SAME FIX REACHES THE BOXES THAT ARE NOT THE PALETTE.** The defect was
   never specific to ⌘K — it was in every free-text filter in the product. The
   counter's `lookupStudents`, the counter board's teacher filter, the center's
   student roster and the external-teachers list all got the full two-stage
   match (each is already bounded to one center, so the JS pass is free). The
   roster's filter was additionally `startsWith`, which asked the operator to
   know how the row was created — a student registered «محمد أحمد سيد» was
   unreachable by «أحمد»; it is a contains-match now.

7. **THE PUBLIC DISCOVERY LISTS NARROW ONLY, AND THAT IS A DELIBERATE HALF.**
   `discovery.ts` is paginated (`skip`/`take`), and a JS filter applied after
   the page is cut returns a short page and a wrong total. So those three
   filters get the SQL narrowing without the decide pass: a search for «احمد»
   also shows «محمد». For a browse-and-filter screen that is the right trade —
   a few extra rows are a nuisance, an empty list is a dead end. An exact,
   paginable version needs the match to happen inside Postgres (an `IMMUTABLE`
   normalize function plus expression indexes), which is a MIGRATION and needs
   its own approved plan. It has not been written.

**No database migration, no schema change, no new read, no widened tier, and no
new i18n key.**

Proof — unit `apps/erp/tests/unit/search-text-arabic.test.ts` **29/29** (every
fold; word-order independence; the compound-name space so «عبدالرحمن» finds
«عبد الرحمن»; that a second word NARROWS; that it is not fuzzy; and the
pre-filter's safety property asserted directly). DB
`apps/erp/tests/db/global-search.test.ts` **41/41** — the 33 boundary
assertions unchanged, plus a §10 block through the REAL service and the REAL
`authorizeCenterActor`, opening with a CONTROL that asserts raw ILIKE still
finds nothing, so the assertions after it measure the fix and not the data.
Regressions: `check-types` **9/9** for every package touched, `bun run build`
**3/3**, full ERP DB corpus **44 suites / 1404 assertions** with only the three
pre-existing exclusions failing (`catalog-onboarding`, `h03-seed-uuid-flows`,
and `profile-images`, which needs `CLOUDINARY_*`).

Verified against the LIVE DEV DATABASE through `lookupStudents` itself:
«حمزة الشريف» found by «حمزه», «جنى وجدي» found by «جني», «حمزة الشريف» found by
«الشريف حمزه» — while a raw `ILIKE '%حمزه%'` against the same database still
returns 0 rows.

### The back office followed the same day (2026-08-20, Ali — "اعملها لل superadmin كمان")

`apps/superadmin` had the same defect everywhere, not only in its palette, so
all nine of its free-text filters were done rather than the one box.

1. **THE MATCHING IS NOW SHARED, WHICH THE ROW SHAPE ALREADY WAS.** The back
   office keeps its own providers — it reads THE PLATFORM through `platformDb`
   where the ERP kernel reads ONE TENANT through `scopedDb`, and a tenancy that
   is a parameter is a tenancy someone eventually passes wrong. But it now
   imports `@repo/database/search-text` alongside `SearchHit` / `rankHits`.
   Two palettes in one product that MATCH differently is a worse defect than
   either: an operator learns the rule once.

2. **WHERE THE DECIDE PASS LIVES DEPENDS ON WHO PAGINATES, and that is the only
   real design question in this pass.** Three shapes, applied by rule:

   | shape | treatment | why |
   |---|---|---|
   | not paginated (`centers`, the palette's `people` and `paymentIntents`) | full two-stage | it can slice, so it can decide |
   | a bounded sub-query (`collaboration`, `subscriptions`, the intents' payer lookup) | full two-stage | already capped at 500, so the JS pass is free |
   | a paginated list with a `count` (`listUsers`, `platform`, `contact-submissions`, `whatsapp-messages`, the intents' reference arm) | narrow only | a filter applied after the page is cut gives a short page and a wrong total |

   The narrow-only lists therefore return a SUPERSET: «احمد» also lists «محمد».
   The palette does NOT inherit that looseness — `people()` applies the exact
   pass itself over the superset `listUsers` hands it, which is why `take` there
   is now `SEARCH_SCAN_LIMIT` rather than `PER_KIND * 4`.

3. **`narrowQuery` EXISTS BECAUSE AN EMPTY `AND` IS "NO CONSTRAINT".**
   `narrowFragments` correctly returns `[]` for a query with nothing
   byte-comparable in it («اي»), and a provider that filters in JS afterwards
   handles that by scanning its own bounded set. A PAGINATED list has no such
   second chance: `where.AND = []` would have quietly returned the whole table
   for a query the operator typed in order to narrow it — a worse failure than
   the empty result this work exists to fix. `narrowQuery` falls back to
   comparing the raw query, which for a two-character all-fold-target query is
   exactly as good as the code was before any of this, and is never a wider
   read. Every paginated caller uses it.

4. **THE STUDENT CODE GOES THROUGH `normalizeIdentifier`.** `CODE_SHAPE` was
   tested against `q.trim().toUpperCase()`, so a code read down the phone and
   typed back with a dash — or with its digits on an Arabic keypad — failed the
   shape test and resolved to nobody. That is the exact call this provider
   exists to serve.

5. **`contact_submissions` was the one most certain to be broken in practice.**
   It holds a name, a subject and a free-text message written IN ARABIC by the
   public, straight off the marketing site, and it was searched byte-wise.

6. **NO TIER, ROLE OR `where` SCOPE CHANGED.** The `PROVIDERS` table and its
   `roles` column are untouched; `listUsers` and `listPaymentIntents` are still
   called as-is, so a search still cannot match a column the list screen would
   not, nor return a row the list would hide. Nothing audited is reached.

Proof: `apps/superadmin/tests/db/global-search.test.ts` **34/34** (was 27) — the
27 boundary assertions unchanged, plus a §7 block opening with the same CONTROL
that raw ILIKE still finds nothing, then the folds through the REAL
`backOfficeSearch` against the live DB, including the centers provider matching
on its AREA. Unit `search-text-arabic.test.ts` **33/33** (was 29) — the four new
ones pin `narrowQuery`'s floor, in particular that it NEVER returns an empty
`AND`. `check-types` **9/9**, `bun run build` **3/3**.

Note: `apps/superadmin/.env.test` did not exist, so that app's DB suites were
unrunnable locally. It is now a copy of the ERP's (both ungitted, both pointing
where that one points).

### The normalizer, in Postgres (2026-08-20, Ali — "اعمل الـ migration")

Migration `20260820120000_search_normalize`. **Written and proven; NOT applied
anywhere** — see the apply note at the end.

The application fix left the PAGINATED lists returning a superset, and said why:
a JS filter applied after the page is cut gives a short page and a wrong total,
so those queries can only NARROW. The only way to make them exact is to move the
comparison INSIDE the query, which needs the normalizer to exist in SQL.

1. **ADDITIVE, AND NOT A SCHEMA CHANGE.** One extension (`pg_trgm`), one
   function, five indexes. No table, column, constraint, enum or row is touched,
   which is why it could be written without a schema plan: `rollback.sql` drops
   exactly those and returns the database to its previous state. The only shape
   number that moves is the migration count (54 → 55) — no new table, sequence,
   RLS table or policy.

2. **`IMMUTABLE` IS A REQUIREMENT, NOT A LABEL.** An expression index cannot be
   built on anything weaker, and it is honestly true here: every builtin it calls
   is itself immutable (`normalize` reports `provolatile = 'i'` on PG 13+).
   `STRICT` so NULL in gives NULL out — otherwise a NULL column would normalize
   to the empty string and `WHERE f(col) LIKE '%…%'` would be accidentally TRUE
   for every row with no name.

3. **THE ONE PROPERTY THAT MATTERS IS MEASURED, NOT ASSERTED.** The SQL function
   and `normalizeSearchText` must produce BYTE-IDENTICAL output; two normalizers
   that disagree are two search engines, and a reader would learn one rule on the
   palette and a different one on the list below it. So
   `apps/erp/tests/db/search-normalize.test.ts` runs BOTH over (a) one case per
   fold rule, (b) EVERY DISTINCT VALUE in eight searchable columns on the live
   database, and (c) a fuzz pass whose alphabet is deliberately far wider than
   anything this product holds — Cyrillic, CJK, Hangul, emoji, Arabic
   presentation forms, full-width Latin, Unicode digraphs, and the invisible
   bidi/joiner controls a paste carries. The corpus is Arabic and Latin because
   that is what the data is; the divergence risk lives in what it does not hold
   yet.

4. **FIVE INDEXES, NOT EVERY SEARCHABLE COLUMN.** GIN + `gin_trgm_ops` on the
   NORMALIZED expression, because the query compares
   `edura_search_normalize(col) LIKE '%…%'` and an index on anything else cannot
   serve it. Each of the five is a free-text column on a paginated list a human
   searches by name; the ASCII-only columns (gateway references,
   `idempotency_key`, `provider_message_id`) are deliberately absent — ILIKE
   already served those and a trigram index there would be write cost for
   nothing. Not `CONCURRENTLY`, because prisma runs each migration in one
   transaction and `CREATE INDEX CONCURRENTLY` cannot; the tables are small
   today, and `IF NOT EXISTS` lets a large environment build them by hand first
   and make this a no-op.

Proof, measured against the LIVE DEV DATABASE with the whole migration applied
inside a transaction that was then rolled back — so dev is unchanged:

- the migration applies as one transaction with no error;
- the function reports `provolatile = i`, `proisstrict = true`,
  `proparallel = s`;
- all five indexes exist;
- **the planner uses them** — `Bitmap Index Scan on users_name_search_trgm`, so
  the index is load-bearing rather than decorative;
- on real dev rows, `«احمد»` finds «أحمد الشناوي», «أ. أحمد الشناوي» and
  «يوسف أحمد», while `name ILIKE '%احمد%'` against the same table still returns
  **0**;
- SQL and JS agree on **31/31** hand cases, **738/738** distinct real values, and
  **4000/4000** fuzzed strings.

**NOT APPLIED, and applying it is not a formality.** Two things have to be true
first, both of them lessons this file's own history records:

- `prisma migrate deploy` applies EVERY pending migration in name order, and dev
  currently has two pending — this one and `20260818130000_validate_centers_wallet_check`,
  which belongs to another workstream. It is guarded to be a no-op wherever the
  constraint is already validated (which dev is), but applying another branch's
  migration is not a decision to take silently.
- Nothing in the application calls `edura_search_normalize` yet, deliberately.
  Code that calls a function its database does not have turns every search into a
  500 — the 2026-08-02 outage, exactly. The order is: apply the migration, THEN
  ship code that uses it.

**WHAT IS STILL SUPERSET, AND THE ONE-LINE DECISION THAT WOULD FIX IT.** Prisma
cannot express `WHERE f(col) LIKE …` in a typed `where`, so the paginated lists
cannot use the function as written. The three ways out, and why only one is
worth doing:

- *Raw SQL for each list* — duplicates every existing filter, cursor and count
  into six hand-written queries. That is the drift this codebase keeps refusing.
- *A raw id pre-filter feeding `id: { in: … }`* — keeps all the Prisma filters,
  but the id set is unbounded: two characters against a platform-sized `users`
  table is tens of thousands of UUIDs in memory. Sound, and wrong at scale.
- *A `GENERATED ALWAYS AS (edura_search_normalize(col)) STORED` column* per
  searched column, indexed, and named in `schema.prisma`. Prisma then filters it
  with a plain `contains` — exact, indexed, paginated and counted, with no raw
  SQL and no duplicated logic. This is the right answer.

That last one adds COLUMNS to real tables, which under this file's own rules
needs an approved plan before anything touches the database. The plan is one
statement per column, e.g.

```sql
ALTER TABLE users
  ADD COLUMN name_norm text GENERATED ALWAYS AS (edura_search_normalize(name)) STORED;
```

plus the trigram index moving from the expression to the column, and the field
added to `schema.prisma`. Its one real cost is a footgun worth stating: Prisma
does not model generated columns, so `prisma migrate dev` would propose turning
them back into ordinary ones. This repo writes its migrations by hand and checks
shape with `verify-db`, so the exposure is a developer running `migrate dev` —
which is why it belongs in a decision Ali makes, not in this one.

### The generated columns — the paginated lists become exact (2026-08-20, Ali: "اعمل الـ generated columns")

Migration `20260820160000_search_text_columns`. **Applied to dev AND to
production**, in that order, before any code that reads the column shipped.

Migration 55 put the normalizer in the database, but Prisma cannot express
`WHERE f(col) LIKE …` in a typed `where`, so the paginated lists still could not
use it and were left returning a superset. A STORED generated column is the way
out that costs no second source of truth: Postgres maintains it, Prisma filters
it with a plain `contains`, and the result is exact, indexed, paginable AND
countable — all four at once, which was the thing that could not be had before.

1. **ONE COLUMN PER TABLE, NOT ONE PER FIELD.** Fourteen columns would have been
   the literal translation of what the lists search. One per table, holding
   every searchable field joined, is the same thing — and is exactly what the JS
   matcher already does: `matchesSearchTerms` joins the parts, normalizes once,
   and requires EVERY term to appear. `search_text` is that haystack,
   precomputed.

2. **IT CARRIES BOTH OF THE MATCHER'S CHANCES, which is why it is equal and not
   merely similar.** `matchesSearchTerms` tries the normalized haystack AND the
   same haystack with its spaces closed up, so «عبدالرحمن» finds «عبد الرحمن» —
   one Egyptian name written two ways. `edura_search_haystack` stores both
   halves in the one column, so `search_text LIKE '%term%'` is true in exactly
   the cases the JS matcher returns true. Measured before applying anything:
   **2056/2056** agreements over 257 real users × 8 queries, in a transaction
   that was then rolled back.

3. **A SEPARATE FUNCTION FROM THE NORMALIZER, because it answers a different
   question.** `edura_search_normalize` gives THE canonical form of a string;
   `edura_search_haystack` gives the form a ROW is findable by. Keeping them
   apart means the first stays the single definition of "the same word" and the
   second stays the single definition of "what a row is findable by".

4. **THE HAZARD IS SILENT, SO IT GOT AN ASSERTION RATHER THAN A PARAGRAPH.** A
   STORED column is computed on write; `CREATE OR REPLACE FUNCTION` on the
   normalizer would NOT recompute rows already stored, and the database would
   hold two definitions of the same word with nothing to say so. **Changing the
   normalizer requires rebuilding these columns.** The DB suite now compares
   every stored value against a live call, per table — a red line instead of a
   quiet divergence.

5. **THE FIVE EXPRESSION INDEXES FROM MIGRATION 55 WERE DROPPED.** They served
   `edura_search_normalize(col) LIKE …`, a query the application no longer
   issues. An index no reader can use is write cost with nothing on the other
   side of it. `rollback.sql` restores them.

6. **THE PRISMA COST, stated rather than discovered later.** Prisma does not
   model generated columns, so `migrate dev` will propose turning them into
   ordinary ones. They are named in `schema.prisma` only so a typed `where` can
   filter them, each carrying that warning; writing to one fails at the
   database, which is a loud failure and not a silent corruption. Checked before
   committing to the design: no `create`/`update` in this repo spreads a row
   into `users`, `centers`, `courses` or `contact_submissions`, so nothing
   existed that would start failing.

7. **NINE CALL SITES CONVERTED, and two deliberately not.** The three superadmin
   paginated lists (users directory, teacher directory, contact queue), the
   three `discovery` lists, and the three bounded sub-lookups (collaboration,
   subscriptions, payment-intents' payer) now filter the column. The sub-lookups
   lost their JS decide pass entirely — there is nothing left for it to decide.
   `whatsapp-messages` and the payment-intents REFERENCE arm keep `narrowQuery`:
   their columns are ASCII, ILIKE already served them, and a generated column
   there would be storage for nothing.

Proof — dev `apps/erp/tests/db/search-normalize.test.ts` **43/43** (was 35): the
function properties, every fold, every distinct value in eight columns, the fuzz
pass, the four indexes, plus the new `is_generated = ALWAYS` check per table, the
per-table desync check, and the row-by-row parity between `search_text` and
`matchesSearchTerms`. `verify-db` **28/28 on dev and on production**, both at 56
migrations and identical in shape. ERP DB suites `global-search` 41/41,
`counter-board` 39/39, `external-teachers` 104/104, `center-directory-search`
7/7; superadmin `admin-users` 67/67, `global-search` 34/34, `center-platform`
45/45, `center-people` 66/66, `center-collab-create` 29/29. `check-types` 9/9,
ERP unit 81 files / 1284 pass.

### "كمل على كل الجداول" — and why that turned out to be two (2026-08-20)

Migration `20260820180000_search_text_remaining`, on dev and production.

Ali asked to extend the generated columns to every table. Measured before
building anything, because "every table" is 79 of them:

| | |
|---|---|
| tables in the database | **79** |
| carrying a candidate free-text column | **58** |
| **actually reached by a free-text search** | **6** |
| already done in migration 56 | 4 |
| remaining | `student_profiles`, `rooms` |

The other 52 have **no code searching them** — no Prisma `contains`, no refine
`operator: "contains"`, nothing. A generated column there is write cost on every
insert and update with no reader on the other side, and on `transactions`,
`points_ledger`, `wallet_ledger` and `audit_logs` — append-only, money, the
highest-volume tables here — it is that cost per ledger row forever. The
`chatbot_*` tables are descoped product surface and were not touched at all.

So the deliverable is the *rule*, not the count: **every table a free-text search
reaches carries `search_text`.** One sentence, and the DB suite asserts that
exact set of six, so a column appearing or disappearing is a red line rather than
a discovery.

1. **`student_code` AND THE GUARDIAN COLUMNS ARE ABSENT FROM THE STUDENT
   HAYSTACK, and this is the decision in this migration.** Both would widen
   reach, which rule 1 above forbids. The code is matched through
   `readStudentScan`, whose check character means a single mistype resolves to
   NOBODY rather than to a different child; put it in a substring haystack and
   six characters of a code match again, which is the weaker rule the check
   character exists to replace. A guardian's email or phone would make a CHILD
   findable by their parent's contact details — nothing searches that today, and
   nothing should start because a column made it easy.

2. **`lookupStudents` KEEPS ITS JS DECIDE PASS, and that is not belt-and-braces.**
   Its haystack spans TWO tables — the profile's own name and phone, and the user
   row's name and phone — and a generated column cannot reference another table.
   A query naming the student by their user-row name and their profile phone
   satisfies the joined haystack `matchesSearchTerms` builds and satisfies
   NEITHER column alone. So the two columns are an OR'd pre-filter that cannot
   miss such a row (every term appears somewhere), and JS makes the decision.

3. **WHAT THESE TWO BUY, stated precisely.** Both call sites were ALREADY EXACT —
   they are not paginated, so they narrowed in SQL and decided in JS. What
   changes is the NARROWING: from a loose fragment (`contains 'حمد'`, which also
   matches «محمد») over an unindexed column, to a tight indexed match on the
   haystack. On `lookupStudents` that matters, because it is the counter search
   and it runs on every keystroke while somebody is standing at the desk.

Proof: `search-normalize.test.ts` **50/50** (was 43) — the new assertions are the
six-table invariant, plus `is_generated = ALWAYS`, the stored-vs-live desync check
and the field list for each new table. Parity measured before applying:
**455/455** over 300 student profiles. ERP DB `global-search` 41/41,
`counter-board` 39/39, `student-qr-credential` 88/88, `offline-sync` 27/27,
`center-directory-search` 7/7. `verify-db` **28/28 on dev and production**, both
at 57 migrations, identical in shape. `check-types` 9/9, ERP unit 1284,
superadmin unit 106.
