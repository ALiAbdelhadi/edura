# Portal design pass — student · parent · teacher · center (2026-08-14 — awaiting review)

A defect pass across the four www portals. **No portal was reskinned**, and that
was the main scope decision: `design/CONSTITUTION.md` records the Ledger VISUAL
system as retired (2026-08-11) with the portals to be redesigned, so re-jacketing
ten uniformly-shadcn teacher screens onto a retired system would have been a
large investment in a direction already slated for replacement. What was fixed is
defects — the things that stay wrong under any future skin.

1. **THE ATTENDANCE CALENDAR COULD NOT EXPRESS "NOTHING HAPPENED".** Its cell type
   was `{date, value}` with thresholds, so every value mapped to one of three
   saturated status colours and a day with no lesson was inexpressible. The
   screen therefore drew only the days that HAD a record — four records became
   four ~110px slabs labelled `Jul 19` in English on an Arabic page, under an
   eyebrow reading "28 days" and a title reading "28 records". Rebuilt as a real
   28-day grid with a fourth `none` tone plus a `blank` pad, soft fills with
   hairline rings (so the day number sits on `--ink`, a pair §6.6 already
   verifies), localized weekday headers, and the block anchored to the page's
   start edge while day order stays LTR (§6.4).
2. **ONE GRADING LADDER, and the gradebook was the copy left behind.** The
   teacher's gradebook carried its own cut-offs (`>=90 / >=75 / else`) against
   `@repo/database/grading-scale`'s 85/75/65/50 — and had NO FAILING BAND, so a
   child at 30% and a child at 70% were the same amber to the teacher while the
   family's screen said ضعيف and مقبول. The file already imported `GRADE_BANDS`
   and simply did not use it here. This is the exact drift that module's header
   was written to end.
3. **PERCENTAGES WERE WRITTEN TWO WAYS.** ~20 sites rendered a literal Latin `%`
   beside neighbours using `formatPercent` (Arabic `٪`) — twice on a single
   dashboard row. `formatPercent` gained an opt-in `decimals` (the shape
   `formatEGP` already uses) because the center's profit margin was
   `.toFixed(1)`, which fixes the separator and the digits to Latin BEFORE the
   locale is consulted; it was the one figure on that screen the formatter could
   not reach.
4. **THREE SCREENS RECREATED** (student reviews, family code, subjects) — the only
   shadcn outliers inside an otherwise-Ledger portal. Each also lost a real
   defect: duplicated counters restating the list beneath them, a page title
   printed twice, a client schema rejecting the phone numbers its own label
   invites, prices interpolated unisolated into Arabic button labels, and a
   `void refreshKey` that meant a successful payment never refreshed the list.
5. **22 OF 34 NOTIFICATION TYPES HAD NO TRANSLATION**, so the shared notifications
   screen — rendered by ALL SIX portals — fell back to raw English `snake_case`
   as a badge in the Arabic UI. Now zero missing in both locales, asserted by
   diffing the enum against the keys.
6. **`toLocaleDateString()` WITH NO LOCALE** in the student and parent session
   pickers (copy-pasted), formatting in the BROWSER's locale; and
   `/api/v1/dashboards/student` hardcoded `toLocaleDateString("en")`, so the
   SERVER picked English for every reader. The route now returns ISO and the
   client formats it — sole consumer verified first.
7. **THE ASSISTANT PORTAL OWNS NO SCREENS** — measured, not assumed: all ten of its
   routes render other features' screens (five from `features/teacher`, plus
   attendance / team-notes / notifications / settings). Its design is inherited,
   so the teacher and notification fixes land there automatically.

**Closed WITHOUT change, each verified rather than assumed:** the teacher home's
two charts are not duplicates (trend and grade-LOAD vs per-session composition
and score DISTRIBUTION); chart colours that looked like drift
(`--success`/`--destructive`/`--primary`/`--chart-*`) are all aliases of the four
Ledger colours; the sidebar that looked clipped scrolls correctly
(`overflowY: auto`, 696 > 563); and `Money` differing between the student kit
(negative = red, a wallet outflow) and the parent kit (negative = ink, an unpaid
balance is "waiting", never red) is two correct semantics, not drift.

### Session expiry no longer hangs the dashboards

`edura:auth-error` was dispatched on every bare 401 and **nothing in the app ever
listened for it**, so an expired session left every dashboard rendering its
loading skeleton for ever — a screen saying "fetching" about a request that
already had its final answer. The plain 401 now travels on the SAME
`SESSION_INTEGRITY_EVENT` channel as `session_conflict` and `role_mismatch`
(one event, one guard, rather than a second mechanism beside the first), as
reason `session_expired`.

- **THE LOOP GUARD IS THE LOAD-BEARING PART.** The login screen itself reads `me`
  and is answered 401, correctly, every time it renders. So expiry is acted on
  ONLY where `portalFromPath` returns a portal — otherwise the login page would
  send itself to the login page for ever. Pinned by `session-integrity.test.ts`.
- Only expiry carries `?next=`: the other two end a session BECAUSE the screen
  could not be trusted to name the reader, so returning them to it is the last
  thing to do. Expiry has no such doubt, and losing someone's place to a timeout
  is a small cruelty the `next` parameter already existed to avoid.
- The notice is its own sentence with a clock, not the shield: nothing was wrong
  with the browser or the account, and telling that reader about credentials
  would invent a security incident out of the passage of time.

Verified end to end by deleting the demo admin's `auth_sessions` rows (cookie
kept, exactly what expiry leaves behind): the dashboard redirected to
`/ar/login?reason=session_expired&next=%2Far%2Fdashboard%2Fadmin%2Freports`,
and signing in returned to that page.

### `db:reconcile-wallets` — the repair the drift check never had

`reconcileWallet()` in server-core CHECKS that `cached == SUM(delta) == newest
balanceAfter` and the wallet screen shows a red banner when it fails, but nothing
in the repo could REPAIR it, so the only answer to a drifted cache was to edit a
money column by hand.

- Writes the CACHE ONLY, and only to the figure the ledger already states, so it
  cannot invent money — it never inserts, edits or deletes a ledger row.
- **REFUSES PRODUCTION** (`assertNotProduction`, the guard `db:wipe` uses): a
  drifted cache in production means a writer skipped the primitive, and papering
  over that hides a live bug. There, find the writer first.
- If `SUM(delta)` and the newest `balanceAfter` disagree with EACH OTHER the
  ledger is internally inconsistent, no cache value is correct, and the row is
  reported and SKIPPED — that needs a person's decision, not a script's.
- Aggregates in one grouped query per ledger. The first version looped per
  profile and timed out the transaction at 20s. **Both ledgers key on the USER
  id** (`wallet_ledger.student_id`, `parent_wallet_ledger.parent_id` — neither
  declares an FK relation, and joining them to `*_profiles.id` silently matches
  nothing, which is how the first audit "found" zero rows).

**[dev, 2026-08-14]** one drift, and the cause was NOT a code defect: the seed
that writes it (`preview-seed.ts`) is correct and idempotent, two other seeded
students were exactly consistent, and Lina's ledger was internally consistent
(sum == newest == 40000) with only the cached column at 0. Repaired; a second run
reports nothing.

### Known, NOT fixed: ICU plurals render Latin digits in Arabic

`4 قرارات بانتظارك` and `أكملت 4 من 5` show Latin digits in Arabic prose, where
§6.3 specifies Arabic-Indic. Cause, measured: `Intl.NumberFormat('ar')` resolves
its numbering system to **`latn`**, while `'ar-EG'` resolves to **`arab`**.
next-intl runs with locale `"ar"`, so every ICU `#` in every Arabic plural is
Latin, while the app's own `formatProseCount` uses `ar-EG` and is Arabic-Indic.

Giving next-intl `ar-EG` would fix it and would also make `useLocale()` return
`"ar-EG"` — and **32 call sites branch on `locale === "ar"`**, every one of which
would silently take its English/LTR branch. That needs its own plan and
verification, not a design pass. ~6 strings are affected.

### Shared-layer note

`packages/ui/components/charts/heatmap-calendar.tsx` was changed without the
`REQUESTS.md` entry the constitution asks for, because that file was deleted on
2026-08-11 along with the five-session protocol it served. Blast radius verified
instead: **one JSX render site repo-wide** (`features/attendance/
attendance-screen.tsx`); `apps/superadmin` re-exports the component and the
`HeatmapCell` type but never renders one or constructs a cell, and its typecheck
stayed green throughout.

Proofs: `check-types` 9/9, `bun run build` 3/3, unit **1119 pass / 1 skip** (up
from 1116 — three new branches on the expiry rule), lint at the recorded
baseline of **14 errors**, all pre-existing in privacy/terms/use-chat/a db
test/the generated `sw.js`. Verified in the browser across the four portals in
Arabic/RTL and English/LTR, light and dark.

**NOT verified in the browser:** `apps/superadmin` (2FA login whose credentials
Claude will not enter) and the assistant portal (no quick-login tile; its screens
are the teacher's, which were verified).
