# The counter board — the center's first screen (built 2026-08-09 — awaiting review)

The receptionist's ERP home is now the hall, not a menu: pick the teacher (the
one teaching at this minute is already picked), see today's lessons with their
counts, and work the roster in two tabs — **سجّلوا الحضور** (checked in, with the
number) and **كل الطلبة** (everyone, present or not) — with student search, card
scan, walk-in registration, cash collection and check-in all on the same screen.

1. **IT WRITES NOTHING OF ITS OWN.** `@repo/server-core/services/attendance/
   counter.ts` is three READS (`listCounterTeachers` / `listCounterSessions` /
   `counterRoster`) and imports nothing that mutates. Every commit still runs
   through `counterCheckin` and the existing per-session subscription — a second
   way to move money or mark attendance is the drift this codebase keeps
   refusing.
2. **ONE COMMIT FLOW, TWO SCREENS.** The check-in screen's collect-then-check-in
   sequence (with its self-heal on a timed-out charge and its
   "paid but not checked in" message) was LIFTED OUT to
   `features/admin/counter/use-checkin-commit.ts` and both screens now call it.
   Walk-in registration and the claim-link card moved the same way
   (`walk-in-panel.tsx`, `pending-invite-card.tsx`). `admin-checkin-screen.tsx`
   kept every behaviour; it is now a caller.
3. **BOTH DOORS STAY.** The board starts from a LESSON and finds the student;
   the check-in screen starts from a STUDENT (a card, a code) and finds their
   lesson. Neither is a lesser version of the other, so neither was removed —
   the board is `/dashboard/staff` (the portal cards moved below it) plus
   `/dashboard/{staff,admin}/counter`, and `/checkin` is untouched.
   `center_accountant` does NOT get the board: that tier is read-only and the
   routes refuse it (`allow: RECEPTION`), so it is absent, not disabled.
4. **THE CLOCK IS CAIRO'S.** `startTime`/`endTime` are bare `HH:MM` meaning
   center wall-clock; the server is UTC on Vercel. "Who is on now" resolves
   through `PLATFORM_TIME_ZONE`, and today's bounds are built from `todayKey()`
   rather than the instant — the same reasoning `lib/date-key.ts` was written
   for. Out of hours `defaultTeacherId` is NULL: a default guessed from nothing
   looks chosen.
5. **TENANCY IS STATED, NOT ASSUMED.** `sessions` has no `center_id` (it reaches
   the center through its course) and these reads run under `platformDb` like
   their neighbours in `checkin.ts`, so every query names `course: { centerId }`
   and `counterRoster` refuses a foreign session outright. Proven from both
   sides.
6. **THE TWO TABS ARE ONE LIST, AND A TRUE PARTITION.** The roster is a UNION —
   enrolled at this center, anyone holding a pass for this lesson, anyone with
   an attendance row — so a walk-in who paid but was never enrolled cannot
   vanish from the screen they were marked on. The tabs then split it in two:
   **سجّلوا الحضور** (`present`/`counter_only`) and **لم يسجّلوا** (everyone
   else). The second tab was "all students" until Ali corrected it
   (2026-08-09): that made tab 1 a subset of tab 2 — two views of the same rows
   — and left no single place answering the question a counter actually asks,
   which is who is still owed. The counts now add up to the roster, and nobody
   becomes unreachable because THE SEARCH SPANS THE WHOLE ROSTER regardless of
   which tab is open.
   **The work area renders unconditionally**, and that was a defect found the
   same day: it used to be gated on a chosen lesson, so a teacher with nothing
   scheduled today took the tabs, the student search AND the walk-in door off
   the screen with them — the operator was left holding a picker with nothing
   to do, which reads as a broken page rather than as an empty schedule. Only
   the ROSTER depends on a lesson; a student found by search while none is
   chosen shows «اختر الحصة أولًا» in place of the button, never a greyed one.
7. **THE LAYOUT WAS REWORKED AFTER THE FIRST REVIEW (Ali, 2026-08-09): the
   context is a CHOOSER, not a header.** Picking teacher and lesson is done
   once at the start of a shift and then almost never revisited, but it was
   taking the top half of the screen — a full-width picker, two labels and a
   WRAPPING grid of three-line lesson cards — so the operator scrolled past all
   of it to reach the first child every time. Now:
   - the whole context collapses to **one line** (teacher · time · group · room
     + «تغيير») the moment a lesson is chosen, and re-opens on tap. It opens by
     itself when nothing is chosen, because then it IS the task;
   - the lessons are **one horizontally-scrolling row** of fixed 168px chips
     instead of a wrapping grid. A wrapped grid reflowed into a different shape
     for every teacher, so the same control was never twice in the same place;
   - **finding a student is ONE row** — the box, the camera that fills it, and
     the door for someone not in the system — instead of three stacked rows,
     because they are all the same question;
   - the **status badge travels with the action**, not under the name: under the
     name it added a third line to every row and left the middle of the sheet
     empty, and the action column is FIXED-WIDTH so every button in the queue
     lands in the same place;
   - the **footer summary is gone**. It repeated the two numbers the tabs
     already carry, a scroll away from where they are read. The
     awaiting-door line moved ABOVE the list for the same reason: a status
     nobody scrolls to is not a status.
   Net effect: the first student sits at ~330px instead of ~640px, and a lesson
   of eight fits on one screen with nothing hidden.

   **And then the whole page went two-column (Ali, same review — "نستغل أفضل
   مساحة ممكنة").** The board, the shortcuts and the team board were three
   full-width bands stacked down the middle of a wide screen, each of them
   short, each with an empty column beside it. Now on `xl` the board takes the
   main column and the two small blocks form a side column beside it; the board
   itself no longer sits in a 768px cage (it fills what it is given, capped at
   1400px standalone so an ultrawide monitor cannot stretch a roster row to a
   metre); and the roster becomes **two columns of cards** at the same
   breakpoint, which halves the scroll for a lesson of 30 and keeps a name and
   its button close enough to read as one thing. The card being PAID FOR spans
   both columns — a card that doubles in height while its neighbour sits beside
   it drags the whole row and the operator loses their place mid-commit. Below
   `xl` every one of these collapses back to a single column, which is what a
   phone at the counter has anyway. The whole staff home now fits one screen.

   **DE-DUPLICATION PASS ACROSS THE CENTER PORTALS (Ali, 2026-08-10 — "بنمنع
   التكرار في الأقسام والصفحات" — NO capability removed).** The board's arrival
   left the same thing named several times over:
   - **`/dashboard/staff/counter` DELETED.** The staff home IS the board, so
     that route rendered a second copy of it at a second address. The owner's
     `/dashboard/admin/counter` stays — the owner's home is the dashboard, so
     there the board has no other home.
   - **The check-in screen keeps its page and loses its NAV ENTRY in both
     center portals.** The sidebar was advertising two ways to check somebody
     in and leaving the operator to work out which. It is now reached from the
     board's own search row («ابحث بكل حصص طالب»), which is the moment you
     want it — it answers a different question ("this student is in front of
     me, which of THEIR lessons is it?") and every behaviour of that screen is
     untouched.
   - **The staff home's four shortcut tiles DELETED.** All four pointed at
     pages the sidebar already lists, and two of them at the SAME page as each
     other (walk-in lives on the check-in screen, top-up on the student detail
     screen). With the subtitle's prose above them naming the same four
     capabilities, one screen said the same thing three times. The prose and
     the nav remain, so the two capabilities that are not their own page are
     still named. The now-unused `CARDS` table went with them rather than
     sitting as dead config.
   - **`/dashboard/assistant/messages` is now a REDIRECT** to the assistant's
     home, which already renders that exact inbox (its nav's "Messages" entry
     points at the home). Two addresses meant two scroll positions and two
     unread states for one conversation list. It is a redirect and not a
     deletion because the notifications screen builds `${portal}/messages` for
     every message deep link.
   - **The compact team-notes board came OFF the staff home too** (Ali,
     2026-08-10). It was left in place first, on the argument that a summary
     linking to its own full page is a hierarchy rather than a duplicate; Ali's
     call is that on this home it is still the same section twice, since
     `/notes` is a nav entry of its own. **One consequence worth knowing:**
     listing the board is what registers a read receipt, so staff receipts now
     register when they open `/notes` rather than on every visit to the home —
     the receipts still work, they just record reading rather than passing by.
     **The assistant's home lost its copy too** (Ali, same day), so the board
     now renders in exactly ONE place per portal — its own `/notes` page — and
     the assistant's home is the chat and nothing else.

     > **A BUG SURFACED BY MAKING `/notes` THE ONLY HOME.** `TeamNotesBoard`'s
     > loader did `setBoard(null)` on ANY error, and `!board` renders nothing
     > at all — so a request that was merely CANCELLED blanked the whole page.
     > React's development double-mount aborts the first fetch, which made
     > `/notes` reliably EMPTY in dev with a 200 response and the notes already
     > in hand. Invisible while a compact copy on the home was also fetching;
     > fatal once `/notes` became the only surface. The catch now keeps the
     > last good board instead of erasing it.
   - With the side column gone the staff home is a single full-width board, so
     the board's max-width cap now applies in embedded mode as well.

   **The staff home's own card grid went with it (Ali, same review).** Four
   76px tiles in a three-column grid orphaned the fourth on a row of its own
   with two-thirds of it empty — and the ragged row was the NORMAL case, since
   a receptionist has four entries and a manager five. Worse in meaning: the
   two loudest tiles were «تسجيل الحضور» and «تسجيل الطلاب الجدد», both of which
   the board directly above now performs without leaving the page, so the
   biggest objects on the screen pointed AWAY from the faster path. They are now
   a wrapping row of compact links under an «اختصارات» eyebrow, sharing a
   two-column row with the team-notes board on `lg` and stacking below it —
   two short blocks stacked down the middle of a wide screen left a column of
   empty page beside each. **No capability was removed**: every entry survives,
   because the label names the capability and several deliberately share a
   destination.
8. **A STUDENT OFF THE ROSTER IS REACHED, NOT REFUSED.** The search box filters
   the lesson; pressing Search runs the existing platform-wide
   `center/checkin/lookup`, and those rows carry the SAME actions pointed at the
   selected lesson. They are sent as `covered: true` deliberately — the server
   decides, and its `needs_payment` lands on the cash step. Guessing "uncovered"
   would prompt a family who had already paid.

**FOUND AND FIXED WHILE BUILDING THIS — `readApiError` had been silently losing
`code` and `details` since the ky 2.x upgrade.** ky pre-parses the error body
onto `error.data` and CONSUMES the response doing it ("error.response.json() and
other body methods will not work" — its own docs), so `response.clone().json()`
threw on every refusal and the function returned a bare status. The counter's
`needs_payment` recovery is a `catch` on `e.code`: with the code stripped, a
student whose coverage had lapsed since the screen last read it got a red
"فشل تسجيل الحضور" and the receptionist had no way forward — the 402 was arriving
correctly the whole time. `money-write.ts` now reads `error.data` first and keeps
the clone as a fallback. Reproduced on dev before and after.

**The same root cause was fixed at the three other call sites that read it the
same way** — `center-staff-screen.tsx` (create staff, resend invite) and
`teacher-team-screen.tsx` (create assistant). Each wrapped the read in
`.catch(() => null)`, so instead of throwing they had been quietly swallowing
the server's reason and showing a generic "failed" for every refusal. Nothing
else in either app reads a ky error body this way (checked repo-wide); the
Refine data provider already reads `error.data`.

**No database migration, no schema change.** New routes:
`GET /api/v1/center/counter/{teachers,sessions,roster}`, all
`centerStaff(..., { allow: RECEPTION })`. New i18n block `shared.counter.*`
(ar/en) and a `nav.counter` entry in both portals.

Proof: `apps/erp/tests/db/counter-board.test.ts` **39/39** (live DB, real
services) — the picker being a directory rather than a schedule, the Cairo clock
choosing the live lesson over the finished one, `?q=` never moving the default,
tenancy refused on all three reads, the union and its partition, and coverage
being a question about THIS lesson (a 2020 monthly window does not cover today).
Regressions green: root `check-types` 9/9, www unit **619 pass / 1 skip**,
`bun run build` 3/3, lint error-parity (12 errors, all pre-existing in
privacy/terms/use-chat). Verified live in the browser on dev in Arabic/RTL/dark
AND English/LTR/light: the board opening on the running lesson, both tabs and
their counts, cash collected on the board (Payment + Subscription + attendance
written, chips and tabs moving together), and an off-roster student reached by
name and checked in.

Demo data: `prisma/counter-demo-seed.ts` (`bun run seed:counter-demo`,
`--purge` to remove) — a center whose lesson times are computed from the CAIRO
clock at seed time, so one lesson is always running when you open it. Ten
students: eight on the live lesson, four on a later one, two enrolled nowhere so
the off-roster search has something real to find. **ZERO money rows**, so
everyone reads as unpaid and the checked-in tab starts empty — collect the cash
on the board and watch both tabs move, which runs the real money engine.
