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
`apps/superadmin/src/lib/services/admin/global-search.ts`, route
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
