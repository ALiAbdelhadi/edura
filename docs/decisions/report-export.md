# Report export — CSV and print (built 2026-08-09 — awaiting review)

The numbers on the reports screen, in a file an accountant can open.
`packages/server-core/src/services/reports/report-export.ts` (the registry),
`GET /api/v1/reports/export`, the print route `/[locale]/reports/print`, and a
menu on the center reports screen.

1. **AN EXPORT RUNS THE SAME SERVICE FUNCTION THE SCREEN RUNS (binding).** The
   module issues NO queries of its own; every registry entry is a MAPPING from
   an existing report's output to columns and rows. A report that re-derives
   its own totals is a second set of books, and the first time the printed
   sheet disagrees with the dashboard nobody can say which one is wrong. The
   DB proof asserts this by calling both and comparing the figures, rather than
   by reading the code and agreeing it looks like a mapping.
2. **THE REPORT'S OWN TIER TRAVELS WITH IT.** Each of the 8 entries carries the
   staff tier its own endpoint uses (5 accountant, 3 manager), and the route
   reads `tier` from the registry rather than holding a list of its own — so
   opening a report to a tier can never quietly open its export to a different
   one. **The asymmetry that makes this worth guarding: the accountant tier is
   `center_accountant` ALONE — a manager may read attendance and fill rates but
   NOT revenue.** `tests/unit/report-export-tiers.test.ts` asserts set-equality
   against the real `ACCOUNTANT` / `MANAGER` constants in center-actor.ts,
   which the kernel cannot import.
3. **TWO GATES, and the second is the one that matters.** The route wrapper
   admits the UNION of both tiers (it takes one static allow-list and serves
   reports of both kinds); `buildReportExport` then applies THE SPECIFIC
   report's tier. Widening the wrapper without that second check would hand
   every manager the center's revenue. The owner (`staffRole` null) passes both.
4. **CSV, not `.xlsx`** — a real xlsx writer is a dependency, and CSV is what
   every spreadsheet on a center's desk opens. Two details make it actually
   work and are easy to get wrong: the **UTF-8 BOM** (without it Excel assumes
   the system codepage and every Arabic name becomes mojibake) and **formula
   neutralisation** (a course title beginning `=` `+` `-` `@` is EXECUTED when
   the file is opened — the classic CSV injection, and an accountant's machine
   is exactly where it pays off). Money is rendered as a plain decimal so Excel
   can SUM it; numbers are formatted by us and never pass through the
   neutraliser, so a negative amount keeps its minus sign and stays numeric.
5. **PDF IS THE PRINT ROUTE, not a dependency.** `/[locale]/reports/print` sits
   OUTSIDE `/dashboard` (the receipt and the student ID card set this
   precedent): no sidebar, no nav, no theme chrome fighting the printer, and
   the browser's own engine shapes Arabic correctly with zero dependency. It
   calls the SAME `buildReportExport`, under the same two gates.
6. **The menu lists every report and lets the SERVER refuse.** Which reports
   appear is not decided in the client — that would be a second copy of the
   money boundary. The cost is a refusal the operator can read; the benefit is
   one source of truth.

**No database migration, no schema change, no new read.**

Proof: `apps/www/tests/db/report-export.test.ts` **38/38** (live DB, real
reports, real `scopedDb`) — every export compared field-by-field against the
service the screen calls; the range narrowing the FILE and not merely the total
(an out-of-range receipt appears nowhere in it); a second center's money absent
from the first center's file; each tier refusal landing before any money is
read; all 8 entries loading against real data; the hostile course title
neutralised after a ROUND TRIP THROUGH POSTGRES (the unit test neutralises a
literal — the injection this defends against arrives as a title a user typed
and the database stored); and a census proving an export writes nothing, not
even an audit row. Unit: `report-export-csv.test.ts` **18/18**,
`report-export-tiers.test.ts` **7/7**, `route-reports-export.test.ts` **10/10**.

Demo data: `prisma/report-export-demo-seed.ts` (`bun run seed:reportexport-demo`,
`--purge` to remove) — one center, an owner, a MANAGER and a `center_accountant`
standing next to each other so the tier asymmetry is a thing you can sign in as,
three groups, six weeks of attendance, and an enrolment funnel carrying all four
statuses. **Fill rates vary on purpose (92% / 50% / 15%): a column where every
row reads 100% proves nothing about the report.** One group is deliberately
titled `=SUM(A1:A9) — مجموعة مراجعة نهائية`, which is the only way to SEE the
formula neutralisation — in the file it is prefixed with an apostrophe and
displays as text. **Verified 2026-08-09 against the seeded center:** the three
manager-tier exports return those exact figures, the CSV carries the BOM and the
neutralised title, and a manager asking for net-profit is refused.
**The five accountant-tier reports are EMPTY, and that is the Conventions rule
being obeyed, not an oversight** — a demo center must not carry invented revenue
in the same ledger every real report reads. Take one cash payment at the counter
and re-export: the numbers appear, which also demonstrates that the export reads
the ledger rather than a fixture. `--purge` clears any payment you took, so the
receipts are not stranded against a deleted center.
