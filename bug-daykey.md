# Bug: two functions named `todayKey` answer different questions, and the portals disagree about what day it is

**Found:** 2026-08-27, while auditing for duplicated code. **Not a cleanup item.**
**Status:** unfixed, unreported before now. Nothing in `cleanup/performance` touches it, and nothing
in that branch refactors around it.
**Severity:** silent wrong-day matching on the student and parent portals for any device whose
timezone is not Africa/Cairo. No symptom at all on a Cairo device — which is why it has survived.

---

## The short version

There are **two exported functions called `todayKey`**, in two modules, imported by different
portals, and they resolve to different calendar days:

| Function | Module | Resolves to | Imported by |
|---|---|---|---|
| `todayKey()` | `packages/server-core/src/lib/date-key.ts:62` | the **Cairo** day (`Intl` with `timeZone: "Africa/Cairo"`) | center-admin portal |
| `todayKey()` | `apps/erp/src/features/sessions/session-time.ts:58` | the **device's local** day (`getFullYear/getMonth/getDate`) | student portal, parent portal |

They have the same name, the same signature, the same return shape, and no import in either file
would make a reader suspect the other exists.

`packages/server-core/src/lib/date-key.ts` opens with a 27-line header explaining that
`new Date().toISOString().slice(0,10)` "appeared 26 times" doing two different jobs, and that the
fix was to name the two questions separately so "at every call site you now have to say which
question you are asking." That module is correct and complete. The bug is that **a second, older
answer to the same question still exists next to it under the same name**, and the two portals that
matter most to parents are wired to the wrong one.

---

## The three implementations

### 1. Cairo — correct, and the intended one

`packages/server-core/src/lib/date-key.ts:62-64`

```ts
const KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: PLATFORM_TIME_ZONE,   // "Africa/Cairo"
  year: "numeric", month: "2-digit", day: "2-digit",
});
export function todayKey(now: Date = new Date()): string {
  return KEY_FORMAT.format(now);
}
```

Answers "what day is it, on the clock the business runs on". The same module also exports
`toDateKey` (reads the **UTC** day — correct for `@db.Date` columns, which Postgres hands back
anchored at midnight UTC) and `pickedDateKey` (reads **local** fields — correct for a value a date
picker produced at local midnight). **All three of those are deliberate and documented.** UTC vs
local vs Cairo is not by itself a bug; using the wrong one for the question is.

### 2. Device-local — the second `todayKey`

`apps/erp/src/features/sessions/session-time.ts:48-60`

```ts
/** `2026-08-20` — the calendar day, never shifted by a timezone. */
export function dateKeyOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today, in the reader's own zone, in the same shape as `dateKeyOf`. */
export function todayKey(now: Date = new Date()): string {
  return dateKeyOf(now);
}
```

Two things to note.

**The docblock on `dateKeyOf` is wrong in its second branch.** "never shifted by a timezone" holds
for the string branch (`slice(0,10)` of an ISO string is the UTC day the server sent, unshifted).
The `Date` branch reads local fields, which *is* shifted — by the device's offset. Both branches
live under one comment that claims neither shifts.

**`todayKey` here always takes the shifted branch**, because `new Date()` is a `Date`. Its own
comment is honest about it — "in the reader's own zone" — but the name is identical to the Cairo
one, and the difference is invisible at the import site:

```ts
import { todayKey } from "@repo/server-core/lib/date-key";       // Cairo
import { todayKey } from "@/features/sessions/session-time";      // the device
```

### 3. UTC-off-an-instant — a trap, currently unreached

`apps/erp/src/features/admin/center-day.ts:24-28, 37`

```ts
export function sessionDayKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);          // UTC day
}

export function liveNow(sessions, now = new Date(), todayKey?: string) {
  const day = todayKey ?? sessionDayKey(now.toISOString());   // ← UTC day of an INSTANT
  …
}
```

`sessionDayKey` itself is **fine** — it is `toDateKey` semantics applied to a session's `date`,
which is a `@db.Date` value anchored at midnight UTC. Reading the UTC day off that is right.

The defect is the **fallback on line 37**: it asks "what day is it now" by reading the UTC day of an
instant, which is exactly case 2 that `date-key.ts` was written to eliminate. From 00:00 until
02:00 (03:00 on DST) Cairo, the UTC date is still yesterday.

**It is not reached today.** The only production caller passes the day explicitly:

```
apps/erp/src/features/admin/admin-dashboard.tsx:19  import { shiftDayKey, todayKey } from "@repo/server-core/lib/date-key";
apps/erp/src/features/admin/admin-dashboard.tsx:74  const day = todayKey();          // Cairo — correct
apps/erp/src/features/admin/admin-dashboard.tsx:91  const running = liveNow(weekSessions, new Date(), day);
```

So the center portal is on Cairo and behaves correctly. But `liveNow`'s third parameter is
**optional**, and the next caller who omits it gets the UTC day with no warning. Listing it here as
a latent defect, not a live one.

---

## Who reads which

| Call site | `todayKey` it imports | Day it gets |
|---|---|---|
| `apps/erp/src/features/admin/admin-dashboard.tsx:74` | `@repo/server-core/lib/date-key` | **Cairo** ✅ |
| `apps/erp/src/features/student/student-dashboard.tsx:32,236` | `@/features/sessions/session-time` | **device** ⚠️ |
| `apps/erp/src/features/parent/child-next-lesson.tsx:9-13,119` | `@/features/sessions/session-time` | **device** ⚠️ |
| `apps/erp/src/features/parent/child-today-line.tsx:8` | `@/features/sessions/session-time` | **device** ⚠️ |
| `apps/erp/src/features/student/schedule-screen.tsx:100,110` | `weekDayKeys(new Date(), …)`, built from local fields | **device** ⚠️ |
| `packages/server-core/src/services/attendance/counter.ts` | Cairo throughout | **Cairo** ✅ |

The split is clean and unfortunate: **every server-side and center-facing path is on Cairo; the
student and parent portals are on whatever the device says.**

---

## Impact on session and attendance matching

The comparison that breaks is the same shape everywhere: a session's day key (UTC-anchored, from the
server) is compared for **string equality** against "today" (device-local, in the browser).

```ts
// student-dashboard.tsx:242,245
ahead.filter((s) => s !== next && dateKeyOf(s.date) === today).length
const nextIsToday = next ? dateKeyOf(next.date) === today : false;

// child-next-lesson.tsx:119
(s) => s !== next && dateKeyOf(s.date) === todayKey()
```

**Device in Cairo:** device day == Cairo day. Identical output. No symptom, ever. This is why the
divergence has never been reported.

**Device west of Cairo** (a parent working abroad, a device with the wrong timezone, a traveller,
an emulator left on UTC): between Cairo midnight and the device's midnight — 2 hours west of Cairo
in summer, 3 in winter — the two disagree by one day. In that window:

- **`child-today-line`** — the parent's headline answer to "هل ابني حضر النهاردة؟" — asks about the
  **device's** today. On a UTC device at 22:30 it is already 01:30 tomorrow in Cairo, so the line
  reports on a day the center has not started yet, and the lesson the child actually attended a few
  hours ago falls under "yesterday". The component **renders nothing when the day holds no record**,
  so the failure mode is a silently absent card, not a wrong one. A parent sees no answer instead of
  a wrong answer — better, but still wrong.
- **`child-next-lesson` / `student-dashboard`** — "how many more lessons today" and "is the next one
  today" both count against the wrong day, so the counter is off by a whole day's lessons in both
  directions depending on which side of the boundary you are on.
- **`schedule-screen`** — `weekDayKeys` builds the week strip from local fields, so on the boundary
  the highlighted "today" column is the wrong column, and the week can start a day early.

There is a **second, larger version of the same problem in the same module** that this write-up
should not bury:

```ts
// session-time.ts:63-67
export function startsAt(session: TimedSession): Date {
  const key = dateKeyOf(session.date);
  const clock = session.startTime || "00:00";
  return new Date(`${key}T${clock}:00`);      // no timezone suffix
}
```

`"2026-08-20T16:00:00"` with no zone is parsed as **device-local time**. A session's `startTime` is
a bare `HH:MM` that means *Cairo wall-clock* — `packages/server-core/src/services/attendance/counter.ts`
says so explicitly ("they mean Cairo wall-clock, because that is the clock the center's door runs
on"). So on a non-Cairo device every lesson's instant is off by the device's offset, which shifts:

- the ordering in `byStart` / `upcomingSessions`,
- the 45-minute `STILL_NOW_MS` "you are in the room now" window,
- which lesson is shown as "up next".

On a UTC device a 16:00 Cairo lesson is treated as starting at 16:00 UTC — 19:00 Cairo — so the
portal calls it upcoming for three hours after it ended.

**No money is mis-split by any of this.** Settlement, the counter, the door and the ledger all run
server-side on `date-key.ts`'s Cairo functions (`docs/decisions/money-day-boundary.md`). The damage
is confined to what the student and parent portals *display* and count.

---

## Why the tests do not catch it

`apps/erp/tests/unit/session-time.test.ts` asserts `dateKeyOf` against **string** inputs
(`dateKeyOf("2026-08-20T00:00:00.000Z") === "2026-08-20"`), which exercises the unshifted branch
only. Its one `Date` case, `dateKeyOf(new Date(2026, 7, 20, 13, 30))`, constructs the date from
**local** fields, so local-in/local-out agrees by construction.

`apps/erp/tests/unit/center-day.test.ts` always passes `liveNow` its third argument, so the UTC
fallback on line 37 is never executed.

Neither suite runs under a non-Cairo `TZ`. A single `TZ=UTC` run of the existing
`session-time.test.ts` would likely be enough to make this visible.

---

## Suggested shape of a fix (for the separate task — NOT this branch)

1. Delete `todayKey` from `apps/erp/src/features/sessions/session-time.ts` and have every caller
   import the Cairo one from `@repo/server-core/lib/date-key`. Two functions with one name is the
   root cause; removing the ambiguity is most of the fix.
2. Make `startsAt` construct its instant on the platform clock rather than by string-parsing a
   zoneless literal — `startOfPlatformDay` / `platformInstant` in `date-key.ts` already do this
   arithmetic, DST included.
3. Rewrite `dateKeyOf`'s docblock, or split the two branches: the string branch and the `Date`
   branch answer different questions and should not share a comment claiming neither shifts.
4. Make `liveNow`'s third parameter required, so the UTC fallback cannot be reached by omission.
5. Add a `TZ=UTC` run of the session-time and center-day suites to CI. Without it, any fix here is
   unprotected against the next regression, because the whole class of bug is invisible in Cairo.

Step 1 alone changes what the student and parent portals display for non-Cairo devices — it is a
behaviour change, deliberately, and it wants its own verification pass rather than riding along
inside a cleanup commit.
