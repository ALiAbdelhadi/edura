# Student portal de-duplication (2026-08-10, Ali — NO capability removed)

Same pass, applied to the student's home. Two sections went; the "up next"
card and the three record cards stayed.

1. **THE SCHEDULE WAS ON THE HOME THREE TIMES.** An "up next" card, a "today"
   list and a "this week" list sat one above the other — and `next` is
   literally `today[0]`, so the same lesson was printed twice within 150px.
   Both lists are what `/schedule` renders in full, with a day picker. The two
   lists are gone; **"up next" stays**, because a single next lesson is a
   genuine summary and exists in that form nowhere else.
2. **"Subject performance" was the `/grades` table, shortened** — it even
   carried its own "all grades" link, admitting as much. Gone; the average-grade
   card beside it already opens `/grades`.
3. **Already correct and left alone:** the three record cards (attendance,
   average, wallet balance) each link to the page that owns them — whoever built
   this screen had already applied the rule — and `/courses` was already a
   redirect into `/subjects`.

The home is now the guardian notices, the next lesson, and three figures that
open their own pages. The schedule and the grades are untouched at full size.
