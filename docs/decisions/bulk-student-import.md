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

## What a real Egyptian export threw at it (2026-09-20)

The proof above imported clean files. Measured against the files a centre
actually exports, six rows of it failed or, worse, quietly created a second
record for a child the platform already held. Each is now fixed in the ONE
definition of "the same child", never beside it.

1. **A PHONE HAS TWO SPELLINGS IN THIS DATABASE AND THE IMPORTER KNEW ONLY ONE.**
   The walk-in counter stores `+201XXXXXXXXX` (`normalizeEgyptPhone`);
   self-registration stores `01XXXXXXXXX`. The importer stored whatever the cell
   said, so a child who walked in yesterday was imported today as a SECOND child —
   two records, two student codes, one kid. `findStudentByKeys` now looks up both
   spellings (`egyptPhoneVariants`), and the importer canonicalises to the
   counter's `+20` form before it writes. Arabic-Indic digits (`٠١٠…`), spaces,
   dashes and the leading zero Excel strips off a number column all resolve to the
   same child. A value that is not an Egyptian mobile now REFUSES the row instead
   of being stored as text nobody can dial and no lookup can match.
2. **`\d` IS ASCII-ONLY IN JAVASCRIPT**, so a national ID typed on an Arabic
   keyboard was stripped to nothing and reported as "must be 14 digits", which is
   true and useless. `toLatinDigits` runs first. Excel's `3.08010E+13` gets its own
   message naming the fix (format the column as Text), because that is the single
   most common thing Excel does to a 14-digit number.
3. **THE ARABIC-WINDOWS EXCEL FILE IS SEMICOLON-SEPARATED AND WINDOWS-1256.**
   Both were refused: the delimiter left the whole line in one cell, and reading
   1256 bytes as UTF-8 turns every name into replacement characters. The parser
   now detects `;`, and the dialog decodes UTF-8 strictly and falls back to
   Windows-1256 when the bytes are not valid UTF-8.
4. **HEADER MATCHING WAS AN EXACT-STRING ALIAS LIST**, so "اسم الطالب رباعي" and
   "موبايل ولى الامر" mapped to nothing — and a missing phone column is silent:
   400 students import with no dedup key at all. Matching now folds hamza, ta
   marbuta, alef maqsura, tatweel and punctuation, then falls back to keywords.
   A header naming a group, teacher, subject or school is explicitly NOT a student
   name, so "اسم المجموعة" cannot become a child.
5. **COLUMNS THAT ARE NOT IMPORTED ARE NOW NAMED BACK TO THE CENTRE.** A file
   carrying الصف / المجموعة / المتبقي imported the names and dropped the rest
   without a word — the centre's reasonable reading was that its groups and
   balances had come across. The preview lists what was read and what was ignored.
   The refusal message for a file with no name column lists the headers it did
   find, which is what turns "no name column" into a fixable sentence.
6. **IN-FILE DUPLICATES WERE ONLY DETECTED INSIDE ONE CHUNK.** The upload is 20
   rows per request, so the same child on line 3 and line 250 previewed as two new
   students (at commit the second row reuses the first one's record, so no second
   record was ever created — the PREVIEW was the lie). Each row now echoes its own
   normalised keys and `mergeSummaries` folds them across chunks. Blank lines in
   the middle of a sheet no longer shift the reported line numbers either.

Proof: the DB suite is **62/62** (the four phone spellings of one walk-in child,
the cross-format in-file duplicate, both junk-phone refusals, the stored `+20`
form, the scientific-notation reason, the semicolon file and the ignored-column
report); `student-csv.test.ts` and the new `student-import-chunks.test.ts` cover
the parser, the chunker, the Windows-1256 decoder and the cross-chunk merge.
NOTE: the suite's own fixture used 12-digit "phones" — the old importer accepted
them because it validated nothing.

**Still deliberately NOT imported: money and history.** A centre's balances,
attendance, groups and payments do not come across, by rule 2 above. That is a
decision, not a gap — but it is the centre's first question, so say it before
they ask.

**No database migration, no schema change.**

Proof: `apps/erp/tests/db/bulk-import-students.test.ts` **43/43** (live DB, real
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
