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

---

## The modal — the last stock surface (2026-08-20, Ali: "تصميم dialog-model … قديم جدا")

He was right, and the reason is specific rather than a matter of taste: the
dialog was **still stock shadcn**. Every other surface a reader meets through a
Radix portal — the command palette, the phone drawer, the identity menu — had
been brought into the 2026 chrome. The dialog never opted in, so it carried
`bg-background`, `rounded-lg` (8px), Tailwind's soot `shadow-lg`, a `bg-black/50`
scrim and `zoom-in-95`. Five defaults, not one of them a decision anybody made
about this product. That is what "old" was.

**No new direction was chosen, and that is the first decision.** The repo has
one (`chrome-2026`), and a design system already in the repo outranks any
skill. The whole change is the dialog consuming `--chrome-*` like everything
else. No new font, no new hue, no second animation vocabulary.

1. **THE REPO'S OWN RULE KILLED THE OBVIOUS MOVE.** A frosted, blurred scrim is
   what "modern modal" means to most people in 2026. `chrome-2026.css` already
   refuses it in writing — the direction is *away* from frosted depth
   ("Anti-Liquid Glass"), and a `backdrop-filter` is the one effect that costs
   real frames on the counter machine a centre actually owns. So the scrim
   stayed FLAT and changed hue instead: `--chrome-scrim` derives from
   `--chrome-shadow-color`, for the reason the elevation tokens already state —
   a neutral black over a warm ground reads as DIRT, the accent's hue reads as
   light being blocked.

2. **WHERE THE LOOK LIVES IS A SPLIT, NOT A PREFERENCE.** Colour, hairline,
   radius, elevation and motion are in `chrome-2026.css` keyed on `data-slot`.
   Everything a call site overrides — `max-width`, padding, `overflow`, layout —
   stayed a Tailwind utility in the component, because **29 of the 50 dialogs in
   this repo pass their own `sm:max-w-*`** and a plain CSS rule would tie with
   those on specificity and be settled by bundle order.

3. **`p-6` AND `gap-4` ARE UNCHANGED, DELIBERATELY.** Most call sites put their
   body straight into `DialogContent` and inherit both. Moving the padding into
   sub-components would have re-spaced every dialog in the product as a side
   effect of a reskin. The header and footer bands sit ON TOP of that padding
   via `-mx-6 -mt-6 / -mb-6`, so nothing at a call site had to change.

4. **THE REAL BUG WAS NOT VISUAL.** The old panel had NO max-height. A long form
   on a 720px laptop pushed its own submit button past the bottom of the screen
   with nothing on screen to say so. The panel now has a cap
   (`min(100svh - 4rem, 44rem)`), scrolls, and its header and footer are
   **sticky** — so the title and the actions hold their place while the body
   moves under them. Sticky rather than a new `DialogBody` sub-component: fifty
   call sites, zero adoption cost. `overflow-y-auto` and not `overflow-hidden`,
   because a clipped dialog is strictly worse than today's overflowing one.

5. **THE ONE DELIBERATE RISK: PHONES GET A BOTTOM SHEET.** Below `sm` the panel
   is attached to the bottom edge, full width, top corners rounded, entering
   from the edge it is attached to. `CONSTITUTION.md` §5 describes the person
   this product is hardest on — a receptionist standing one-handed with a queue
   in front of them — and a card floating in the middle of a 390px screen puts
   every control at the top of the reach arc. The footer follows: `flex-col`
   rather than `flex-col-reverse`, so the primary action (last in the DOM by
   this repo's consistent convention) sits LOWEST, nearest the thumb. Desktop
   ordering is unchanged.

6. **THE SHEET AND THE ALERT DIALOG CAME ALONG, AND HAD TO.** The phone nav
   drawer's scrim was `bg-black/50` too; a soot scrim beside a tinted one, on
   the same screen minutes apart, reads as one of them being broken. The alert
   dialog takes the surface, radius, scrim and motion but is deliberately
   EXCLUDED from the header/footer bands: a confirm box is short, never scrolls,
   and its header is a centred title beside an optional media tile — banding it
   would draw two rules around three lines of text.

7. **MOTION: two bands, no third.** In at `--chrome-base` (220ms), out at
   `--chrome-fast` (140ms), both on `--chrome-ease`. The exit is shorter because
   a reader who has decided to dismiss has already moved on. Reduced motion
   needed no rule of its own — the media query at the top of the sheet takes
   both bands to 0ms. This does NOT spend the money path's single-animation
   budget: that budget is the seal, and a modal arriving is chrome. The keyframe
   animates `scale`, an independent CSS property, precisely so it cannot fight
   the `translate` utilities that centre the panel.

8. **ACCESSIBILITY, measured not assumed.** The close control was a bare 16px
   glyph at `opacity: 0.7` — under the 24×24 minimum WCAG 2.2 §2.5.8 sets for a
   pointer target, with the weakest hover signal available. It is now a 32px
   square that fills on hover and takes a real focus ring. The header is
   start-aligned in both scripts rather than `text-center sm:text-start`, and
   `leading-6` replaces `leading-none`, which clipped the Arabic descenders in
   ي and ج.

9. **The palette got an explicit width.** It had been inheriting the dialog's
   `sm:max-w-sm` — 384px for a surface that draws a title, a subtitle and a
   trailing code on one row, and truncated all three. Set to `sm:max-w-xl` as a
   decision rather than left to inherit the new default.

**Verified live in the browser**, not read as source: Arabic/RTL and English/LTR,
light and dark, desktop and 375px. Computed values off the running page —
`border-radius: 16px` (was 8), `box-shadow: none` in dark (the tokens making
elevation lightness-plus-hairline, which the old `shadow-lg` violated),
scrim `oklch(0.25 0.092 275 / 0.5)`, header `position: sticky; top: -24px`. The
12-field dialog was scrolled end to end with both bands holding their place —
the case that previously lost its own submit button. On the phone form the
primary action renders lowest, as intended.

Regressions: `check-types` **9/9**, `bun run build` **3/3**, ERP unit
**1281 pass / 1 skip (79 files)** — `design-tokens`, `app-shell-chrome` and
`design-contrast` all green, which is the guard that would have caught a second
palette. The two suites failing are another session's in-flight work and contain
none of this change: `route-conventions` (their new `v1/auth/view-as/claim`
route) and `tailwind-dead-classes` (`bg-sheet-2` / `bg-page/95` in `apps/www`, a
directory this change does not touch).
