# The day boundary for money — Cairo, everywhere (built 2026-08-20 — awaiting review)

The counter resolved "today" on the Cairo clock. The books resolved it on UTC.
So the same cash could sit on two different days depending on which screen you
asked, and nothing in the product said which one was right.

This picks Cairo, for every range filter and every "today" window on the money
and reporting services, and writes down what is deliberately left alone.

---

## The finding

`getAdminDashboard` and `dateFilter` in
`packages/server-core/src/services/reports/reports.ts` built their day bounds
with `startOfUtcDay` / `endOfUtcDay`. The counter board resolves its day through
`todayKey()` / `PLATFORM_TIME_ZONE` — deliberately, and documented in
[counter-board](counter-board.md) #4.

Cairo is UTC+2, and UTC+3 while DST is in force. So between midnight and
02:00/03:00 Cairo, the UTC calendar day is still **yesterday**:

- A payment taken at 01:00 Cairo was filed by the counter under today, and by
  every report under yesterday.
- The center home's "today's sessions" showed **yesterday's** lessons to anyone
  still closing up after midnight.

Small for a center that shuts at 22:00. Not small once a screen is *labelled*
"كاش النهاردة", which the center IA pass does — a figure under that heading is a
claim about a specific day, and it was answering about a different one for the
first two or three hours of it.

## The decision

**A day is a Cairo day, on every service that reports money or activity.** The
platform is Egyptian, its centers keep Egyptian hours, and its operators
reconcile a drawer against a wall clock on the wall in front of them. There is
no second business timezone to be right for.

The bounds live in exactly two places and nowhere else:

- `lib/date-key.ts` — `startOfPlatformDay(key)` / `endOfPlatformDay(key)`, the
  instants a Cairo calendar day spans, plus `platformDayKey` (which day does
  this filter value mean) and `shiftDayKey`.
- `lib/day-range.ts` — `dayRange(from, to)`, the inclusive range every money
  filter is built from, and `platformTodayWindow()`, the half-open current-day
  window the dashboards use.

`reports.ts` no longer holds a private copy of either. It held one, and that is
precisely why `listPayments` grew a *second* one and got the `to` end wrong —
see the sibling fix in the commit before this.

## Why not "store an offset" or "make it configurable"

**Not a fixed `+02:00`.** Egypt suspended DST in 2015 and reinstated it in 2023.
An assumed offset is wrong for roughly half of every year, and wrong in a way
that looks like a rounding error rather than a timezone bug. The bounds resolve
through ICU (`Intl.DateTimeFormat` with `PLATFORM_TIME_ZONE`) at the instant in
question, so a future rule change arrives with the platform's tzdata.

**Not per-center configurable.** Egypt has one timezone. A per-center setting
would add a column, a migration, a settings screen and a second thing that can
be wrong, to express a difference that does not exist. If the product ever sells
outside Egypt, `PLATFORM_TIME_ZONE` is the one constant to widen, and the
"east of UTC" caveat below is the thing to re-check.

## The two DST days, which is where this kind of code usually breaks

Both are measured against real ICU data in
`apps/erp/tests/unit/platform-day-bounds.test.ts`, not asserted from the rule.

- **Spring forward** — clocks jump 00:00 → 01:00, so **midnight does not exist**
  on that day. `startOfPlatformDay` resolves to 01:00, the first instant the day
  actually has. The day is 23 hours long.
- **Fall back** — clocks drop 24:00 → 23:00, so **23:00–23:59:59.999 happens
  twice**. `endOfPlatformDay` resolves to the *second* occurrence. Resolving to
  the first would cut an hour of trading out of the day's takings, silently. The
  day is 25 hours long.

The resolver takes two passes for this reason and this reason only: the UTC
offset is itself a function of the instant, so the first guess reads the offset
in force at the wrong moment — and on a transition day that is the other side of
the change.

## One helper serves date-only columns too — and why that is not luck

`payments.paid_at` and `expenses.expense_date` are true timestamps.
`sessions.date` and `grades.date` are days, anchored at **midnight UTC**.

A Cairo day `D` spans `[D-1 21:00Z, D 20:59:59.999Z]` (or 22:00Z / 21:59:59.999Z
outside DST). The anchor `D 00:00Z` falls **inside** that window; `D-1 00:00Z`
and `D+1 00:00Z` fall outside it. So a Cairo range selects exactly the right
date-only rows, and no second helper is needed.

**That holds because Cairo is EAST of UTC.** A platform timezone west of UTC
would push the window start past midnight-UTC and begin dropping date-only rows
with no error. Anyone widening `PLATFORM_TIME_ZONE` has to revisit this
paragraph; the property is asserted in the test file so it fails loudly rather
than quietly.

## Bounds and buckets move together, or money disappears

The timeseries reports have two independent derivations of "which day is this":
the **bounds** the query selects on, and the **bucket** each returned row is
added to. Re-pointing only the bounds would have created a new defect worse than
the one being fixed:

> A payment at 00:30 Cairo on 1 September is 21:30Z on 31 August. Cairo bounds
> select it. A UTC bucket key files it under `2026-08`. A September-onward series
> has no such bucket, so the row is **dropped** — money inside the range,
> appearing in no bar of the chart, with no error raised anywhere.

So `getPeriodKey` and `buildPeriodKeys` were moved to the Cairo calendar in the
same change, and `apps/erp/tests/unit/reports-period-buckets.test.ts` asserts
the invariant directly: **the sum of the buckets equals the sum of the rows the
query returned.**

The period arithmetic ("five months back", "eight weeks back") now runs on
calendar keys rather than by subtracting from an instant. Subtracting months
from an instant and then taking day bounds derives the day twice, and the two
derivations disagree for exactly the hours this whole document is about.

## What was deliberately NOT changed

- **`toDateKey`.** It reads the UTC calendar day off a value that is *already a
  day*, which is right, and is what `lib/date-key.ts` was written to keep
  separate from `todayKey`. Nothing here touches it.
- **Stored `session.date` anchoring.** Sessions are still written at midnight
  UTC by `session-generator.ts`. Re-anchoring them would be a data migration
  across every existing row to fix a problem the read side already handles
  correctly — see the section above.
- **`startTime` / `endTime`.** Bare `HH:MM` strings meaning center wall-clock,
  exactly as [counter-board](counter-board.md) #4 describes. They have no
  timezone in them because they are not instants.
- **The counter, attendance and settlement paths.** They were already on this
  clock. This change moves the books *to* them, not the other way round.
- **Any UI, portal, chrome or i18n file.** The screens pass the same
  `from` / `to` strings they always did; what those strings mean is now resolved
  in one place on the server.

## Proofs

- `apps/erp/tests/unit/platform-day-bounds.test.ts` — 20 assertions. Ordinary
  days, both DST transitions against live ICU data, tightness to the
  millisecond, consecutive days abutting with no unowned instant, date-only
  column selection, and the headline scenario: cash at 01:00 Cairo lands on that
  Cairo day in the books and is refused by yesterday's range.
- `apps/erp/tests/unit/reports-period-buckets.test.ts` — 6 assertions. Bounds
  and buckets agree at the boundary where they would not; nothing selected falls
  outside every bucket; empty buckets still emitted across a year boundary.
- `apps/erp/tests/unit/payments-day-range.test.ts` — the sibling end-of-day fix,
  and the assertion that the Fees log and the Fees P&L bound their range
  identically.
