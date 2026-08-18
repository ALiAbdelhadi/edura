# Lesson times are a 12-hour clock with the day period in words (2026-08-14, Ali)

`16:00–18:00` on the schedule became `4:00 عصرًا – 6:00 مساءً`. Ali's request, and
the reason is the audience: a center's counter is staffed by people who do not
read a 24-hour clock, and the product had been asking them to.

1. **THIS WAS THE ONE TIME IN THE PRODUCT THAT NEVER MET `Intl`.**
   `schedule_patterns.start_time` / `sessions.start_time` are bare `HH:MM`
   strings meaning CENTER WALL-CLOCK, not instants — so they were never `Date`s
   and every screen printed the raw column. Every OTHER time here (audit rows,
   chat timestamps, session lists) already rendered 12-hour through Intl, so the
   schedule was the odd one out as well as the unreadable one.
2. **`formatClock` / `formatClockRange` in `@repo/ui/lib/format`, and nothing
   else decides what a time says.** Both apps' `useFormatters` bind them to the
   locale; `clockParts` returns the face and the period separately for the
   components below. 20 render sites in `apps/erp` + 3 in `apps/superadmin`.
3. **A WORD, NOT A LETTER — `4:00 عصرًا`, not `4:00 م`.** That is the whole ask:
   a receptionist reads a word faster than an initial, and مساءً/صباحًا is what
   they would say out loud. Five Egyptian buckets — ليلًا (00–04), صباحًا (05–11),
   ظهرًا (12), عصرًا (13–17), مساءً (18–23).
4. **CLDR's own `dayPeriod` is deliberately NOT used**, and this is the trap
   worth remembering: `ar-EG` renders 00:15 as «في المساء» — the wrong half of
   the day. It is right at most hours and wrong at the one a reader would most
   misread. Held by a test, not by this paragraph.
5. **DIGITS STAY LATIN**, per the numeral rule in `format.ts` — a clock time is
   data, and `4:00 م` is already what the Intl timestamps elsewhere produce. Ali
   typed his example in Arabic-Indic; that is how he types, not a request to
   make the schedule the only Arabic-Indic figure in the product.
6. **THE WHOLE TIME IS ONE LTR ISLAND, period word included** — the same
   treatment `formatDate` already gets under `ar`. For a RANGE this is not
   cosmetic: two separately isolated times in an RTL row lay out right-to-left,
   so `4:00 – 6:00` renders as `6:00 – 4:00` and a lesson appears to end before
   it starts. That failure was already found once here (the comment in
   `admin-schedule-screen.tsx`); its fix is now the component's, and a test
   asserts there is exactly ONE island so nobody "tidies" it back.
7. **THE MONO TRAP, FOURTH OCCURRENCE.** A clock time is a figure, so it belongs
   in `<Num>` — but `<Num>` is IBM Plex Mono, which ships no Arabic glyphs, so
   `عصرًا` inside one falls into another family silently. `<Num.Clock>` /
   `<Num.ClockRange>` therefore set the NUMERALS mono and the period word in the
   body face: geometry shared, family switched, exactly as everywhere else this
   trap appears.
8. **Three `Num` implementations still exist** (`@repo/ui`, `apps/erp/src/
   components/ledger`, `apps/erp/src/features/admin/ledger/num.tsx` — the last
   two are the documented portal-local stand-ins), so each gained the same three
   members. Only the MARKUP is repeated, as it already was; what a time SAYS
   comes from `clockParts` in one place.
9. **The guided tours were converted too** (`Num.ClockText`, which reads the
   joined `"16:00 – 17:30"` literals the emulator worlds hold). A tour that shows
   a 24-hour clock while the product it demonstrates shows a 12-hour one teaches
   the wrong screen. No world datum changed.
10. **The period is written ONCE when both ends share it** — `8:00 – 10:00 مساءً`
    but `10:00 صباحًا – 12:00 ظهرًا`. And a value that is not a clock is returned
    UNTOUCHED: these come from optional schedule patterns, and a row showing its
    own raw text is a better failure than one showing `NaN:00`.

**No database migration, no schema change, no API change, no i18n key added** —
the period words live in the formatter because they are a property of the hour,
not a translatable string a locale can drop.

Proof: `apps/erp/tests/unit/format-clock.test.ts` **14/14** — every bucket, the
`00:15` CLDR trap, the never-abbreviate-to-ص/م sweep across all 24 hours, the
single-island assertions, and the untouched-passthrough cases. Regressions:
`check-types` **9/9**, `bun run build` **3/3**, unit **erp 1140 pass / 1 skip
(73 files)**, **superadmin 106**, lint error-parity at the recorded baseline
(erp 14, superadmin 2 — all pre-existing in privacy/terms/use-chat/sw.js).
Verified live in the browser on dev as a center admin and as a student, in
**Arabic/RTL** and **English/LTR**, light and dark: the week schedule, the
classes table, and the student's schedule all read `4:00 عصرًا – 6:00 مساءً` /
`4:00 – 6:00 PM`, with the numerals measured in IBM Plex Mono and the period
word in IBM Plex Sans Arabic, left-to-right, start first.

**Not verified in the browser:** the counter board's lesson chips (the dev
center had no lesson today for either teacher, so no chip renders) and the
`apps/superadmin` screens (behind a 2FA login Claude will not enter). Both use
the same two components as the verified screens and are covered by typecheck and
build.
