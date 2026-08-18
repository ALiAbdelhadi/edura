# Bulk student import (built 2026-08-09 — awaiting review)

A center joining the platform uploads the spreadsheet it already runs on and
gets a roster. `packages/server-core/src/services/center/{student-csv,
bulk-import-students}.ts`, `POST /api/v1/center/students/import`, and a dialog
on the center's Students screen.

1. **ONE DEFINITION OF "THE SAME CHILD" (binding).** The importer does not
   decide dedup — it imports `findStudentByKeys` / `normalizeNationalId` from
   the manual-student module (exported additively; nothing there changed). A
   second definition living here could disagree with the counter's, which is
   the duplicate-record failure decision #2 of the off-system-teacher section
   exists to prevent. Reuse is automatic and there is NO "create anyway" flag.
2. **IMPORTING A NAME IS NOT A FINANCIAL EVENT.** No subscription, no payment,
   no enrolment into a group, no ledger row — the import creates-or-reuses one
   student per row and puts them on THIS center's roster, and that is the whole
   job. Coupling it to money would make a mistyped row cost somebody something.
   Asserted by COUNTING the money tables in the proof, not by reading the
   import list. It also notifies nobody: the rows are shell accounts with no
   login yet, and firing hundreds of notifications at accounts nobody can read
   is noise, not service.
3. **PER-ROW TRANSACTIONS, because Postgres aborts a whole transaction on a row
   error.** A file of 400 good rows and 3 bad ones imports the 400 and reports
   the 3. The cost is N transactions for N rows — the right trade for a
   one-time migration, and this is not a hot path.
4. **THE UI UPLOADS IN CHUNKS OF 20, and the reason was found the bad way.**
   Each row costs one transaction and ~8 round trips — **measured 2026-08-09**
   at ~1.3s/row against a remote Neon from a laptop. A 10.4s request against
   ky's 10s default client timeout reported FAILURE for an import that had
   SUCCEEDED. So a whole file cannot be one request (it also blows the
   serverless execution limit), and each chunk is a standalone CSV carrying the
   header plus a `lineOffset` — without which row 250 of the center's own
   spreadsheet is reported as "line 4" and nobody can find it.
5. **A DRY RUN WRITES NOTHING, not even the audit row.** The UI runs it first,
   so a center reads "312 new, 18 already known, 2 errors" BEFORE committing —
   the difference between an import you can trust and one you find out about
   afterwards.
6. **MANAGER, not the receptionist.** The counter flow is one child standing in
   front of you; this writes hundreds of roster rows in one call, which is an
   owner/manager decision (see the capability map in `lib/authz/center-actor.ts`).
   `MAX_IMPORT_ROWS` = 1000 per call, refused BEFORE any write.
7. **The parser is dependency-free and built for this market.** The Excel-on-
   Windows BOM is stripped, RFC-4180 quoting is handled (so a guardian name like
   `"محمد، أحمد"` survives), and headers match against an ALIAS table listing
   the Arabic column headings an Egyptian center actually types. It returns
   STRUCTURE and touches no database, so it unit-tests with no DB.

**No database migration, no schema change.**

Proof: `apps/www/tests/db/bulk-import-students.test.ts` **43/43** (live DB, real
center actor, real services) — reuse by phone and by national ID, per-row
isolation under a deliberately bad row, the row cap and the missing-name-column
refusal, the chunk `lineOffset` keeping original line numbers, cross-center
isolation, and a money census. Unit: `student-csv.test.ts` **16/16**.

**Deliberately NOT done:** native `.xlsx` (a parser dependency and a decision to
add one — CSV/TSV is what every spreadsheet exports via Save As); and batching
the dedup LOOKUP across a chunk, which is the next optimisation if centers
outgrow this and was refused here because it would mean a second definition of
"the same child" living beside `findStudentByKeys`.

Demo data: `prisma/bulk-import-demo-seed.ts` (`bun run seed:bulkimport-demo`,
`--purge` to remove) — a center, a MANAGER and a receptionist side by side (the
tier split is visible as a refusal), and **two ready-to-upload CSVs written to
`prisma/demo-files/bulk-import/`**, which is why this seed touches the
filesystem at all: a dialog with nothing to upload demonstrates nothing. The
roster is deliberately NOT empty — two children already exist, one findable by
PHONE and one by NATIONAL ID, and both are in the clean file, so the reuse is
visible rather than asserted (an import into an empty database would hide it).
The messy file carries a duplicate row, a nameless row and a child belonging to
ANOTHER center. **Verified 2026-08-09 by running the real importer against both
files:** clean → 10 would-create + 2 would-reuse; messy → 3 created, 1
duplicate-in-file, 1 error, 1 reused. Both files carry a UTF-8 BOM, as Excel on
Windows writes them. Zero money rows. `--purge` also removes whatever an actual
import created (reachable through the roster) and the generated files, which
are gitignored.
