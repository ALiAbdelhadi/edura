# Student ID card + student code v2 (built 2026-08-02 — awaiting review)

Every student now carries a card: their own eight-character ID, a QR the counter
can scan, a guilloché engraving unique to them, and two ways to take it with
them (print → PDF, and a PNG for WhatsApp).

1. **THE CODE CARRIES NO PERSONAL DATA (binding).** The ask was for a code built
   out of the student's initial, birth date and phone digits. It is NOT built
   that way, for two reasons that only surface after launch: (a) inside eight
   characters that space is small enough for two real children in one
   governorate to COLLIDE, and this code is what attendance and cash run on;
   (b) it is printed, scanned and read aloud across a counter, and nearly every
   student here is a MINOR — a code you can read a child's birthday out of leaks
   it to everyone handed the card. The body is instead DERIVED FROM THE STUDENT
   (a SHA-256 of their own `student_profiles.id`) so it is theirs and
   reproducible from their record, but one-way, and its input carries nothing
   personal even if reversed.
2. **THE CHECK CHARACTER IS THE POINT.** `G7K3M2QF` = system letter + 6-char
   body + check character. Every old `STU-000123` neighboured another valid
   code, so ONE mistyped digit at the counter resolved to a DIFFERENT CHILD,
   silently. The alphabet is Crockford base32 minus Z — **31 symbols, and 31
   being PRIME is the guarantee**: with weights 1..7 no single wrong character
   and no swap of two neighbours can produce a valid code. Both classes are
   ALWAYS caught, not usually caught.
3. **The letter encodes the education SYSTEM, not the stage** (G/A/B from the
   new `education_systems.code_letter`; `X` = not chosen yet). A student moves
   from preparatory to secondary; they do not move from Azhari to General. A
   stage letter would need re-issuing every couple of years — meaning either a
   lying letter or a second table to keep old cards resolvable.
4. **ISSUANCE IS ONCE-ONLY, and enforced, not intended.** The profile row exists
   before onboarding picks a system, so a student is born with a pending `X`
   code (real, valid, usable — a walk-in can pay cash on it). It becomes final
   in `completeStudentOnboarding`, in the SAME transaction, via
   `finalizeStudentCode`, whose update is written `WHERE student_code LIKE 'X%'`
   — so no later call, from anywhere, can move an issued code.
5. **TWO IMPLEMENTATIONS, HELD BY A PROOF.** `gen_student_code()` mints inside
   the INSERT so no creation path (register, invite claim, walk-in, temp
   student, manual student, every seed) changed; the TypeScript twin
   (`@repo/database/student-code`, dependency-free so the browser and the
   counter share it) verifies. A drift test generates 400 codes with the SQL
   function and verifies every one in TypeScript. A CHECK constraint holds the
   alphabet AND the check character, so no writer can store a code the counter
   would reject.
6. **THE CARD CARRIES THE LEAST THAT IS USEFUL** — name, code, system, grade,
   track. No phone, email, date of birth, national ID or money; the proof
   asserts the exact key set, because "we did not put the phone on it" is a
   claim about the object, not about intent. ~~**The QR holds the code and
   nothing else** — no token, no URL~~ — so a photographed card grants nobody
   anything, and an ordinary keyboard-wedge barcode scanner works with zero
   server change.
   > **AMENDED 2026-08-09 (Ali) — the QR is now a SIGNED URL.** See "Student
   > card QR → a signed credential" above. The struck sentence is history: the
   > bare code made forgery undetectable and revocation impossible. What did NOT
   > change is everything else in this decision — the QR still carries no name,
   > grade, birth date, phone or bearer token, a photographed card still grants
   > nobody anything, and the code still sits in the payload in plain sight so
   > the keyboard-wedge scanner keeps working with zero server change.
7. **A GUILLOCHÉ, NOT A GRADIENT.** The request was "a different gradient per
   student"; `design/CONSTITUTION.md` §4 forbids exactly that on student
   surfaces ("fills and tiles — never a new hue, never a gradient"). Uniqueness
   is carried by the engine-turned rosette instead — five varying axes rather
   than one, drawn from the student's own id, in the three accents §4 already
   permits "for orientation and identity". Deterministic and stored NOWHERE, so
   a card printed today and one printed in two years are the same card.
8. **Exports: both, from one layout.** PDF via a print route OUTSIDE /dashboard
   (the receipt's pattern — the browser's own engine shapes Arabic correctly,
   zero dependency, ID-1 at 85.6×54mm). PNG via `<canvas>` using the SAME
   `rosettePoints` geometry and colours READ OFF the live card, with
   `navigator.share` on phones — because on this platform the card's real
   destination is WhatsApp.
9. **Who may see it:** the student, and a parent with an APPROVED link — through
   `assertApprovedChild`, the gate every parent money path already uses. No new
   authorization logic. Center staff printing cards was NOT built.
10. **THE ISSUER MARK IS THE EXISTING LOGO, ENGRAVED — not a second one.**
    `public/edura-mark.svg` could not go on the card as it stands: it is a
    violet→indigo GRADIENT on a filled tile plus `#00b473` and `#ffc6c6`, three
    hues the Ledger palette does not contain and the one device §4 forbids on a
    student surface — and a filled gradient tile fights an engraving anyway. So
    `@repo/ui/lib/edura-mark.ts` re-draws the SAME logo in one ink at hairline
    weight, the way an engraved document carries a crest rather than a
    letterhead. It is **reduced to the open book and its spine**: the cap,
    tassel and stud are shapes at 200px and a smudge at 30px, which is the size
    a card's issuer mark actually renders at. It is drawn in `--indigo` for
    EVERY student, deliberately not in the per-student accent — a logo that
    changed colour per holder stops being a logo; the brand is constant, the
    rosette is the identity. Path DATA, not markup, so the card's SVG feeds it
    to `<path d>` and the PNG exporter feeds the same strings to `new Path2D()`
    — one geometry, three surfaces. **Designing a new brand mark was NOT done:
    that is a decision wider than this card, and a second logo beside the first
    is a second answer to what the product looks like.**

Migration `20260803110000_student_code_v2` (adds `education_systems.code_letter`,
rewrites the legacy `STU-` rows, adds the CHECK).
**[dev, applied 2026-08-02] — 48 migrations, verify-db 27/27;
`expected-db-shape.json` updated to 48.**
**[production, APPLIED 2026-08-02] — 48 migrations, verify-db 27/27.** It was
applied BEFORE this code deploys, which is the order the bootstrap lesson above
exists to enforce. Production held exactly ONE student (`STU-000001`) with zero
attendance, enrollments, subscriptions or money rows referencing it, so the
rewrite touched one row nobody had used a code on; it is now `GV9H49TJ`. Checked
after applying, against production: the code verifies in TypeScript, the catalog
carries G/A/B, and the CHECK constraint actually REJECTS a wrong check character
(23514) rather than merely existing.
**[test] NOT applied — the test database refuses both roles on disk
(`edura_app` and `neondb_owner` both fail password authentication in
`apps/www/.env.test` and `packages/database/.env.test`). Pre-existing and
unrelated to this change, but it means the db suite below has never run and
`verify-db` against test will report 47 ≠ 48 until the credentials are
refreshed.**

The rewrite lands rows on pending codes; `bun run db:finalize-codes --write`
(idempotent, safe against any environment) issues the final letter for anyone
already onboarded — 12 codes on dev, 1 on production.

Proof: unit `student-code.test.ts` **14/14** (including every single-character
mistype of five real codes — 1200 of them — and every adjacent transposition)
and `student-identity.test.ts` **8/8** (determinism, 5000 seeds without a
repeated pattern). `apps/www/tests/db/student-id-card.test.ts` is written but
**NOT YET RUN — the test database rejects both roles on disk (`edura_app` and
`neondb_owner`), a pre-existing credential problem unrelated to this change.**
The SQL↔TypeScript agreement was proven against DEV read-only instead (1000
`student_code_for()` codes, 0 rejected; 30,000 mutations, 0 slipped through).
Regressions green: root `bun run check-types` 9/9, www unit **236 pass/1 skip**,
`bun run build` both apps, lint error-parity (14 errors, all in files this
change does not touch). Verified live in the browser on dev: card, PNG export,
print route, account-page card, dark mode, and two students side by side with
different letters and visibly different engravings.

Found while building this, FIXED ON MAIN, not here: `DataRightsCard` and the
student/parent wallet screens threw on first paint (`exports.find is not a
function`) because `useCustom` defaults its payload to a frozen empty OBJECT,
so the idiomatic `?? []` never fires. Surfaced because the ID card lives on the
settings screen. This branch carried a local narrowing for it and that was
REVERTED once main's `7e25b80` turned out to already own the problem properly —
one `asArray()` helper across every affected screen plus a unit test, rather
than a hand-rolled `Array.isArray` per file. A second answer to a solved
problem is worse than no answer; take main's on merge.

Demo data: `prisma/student-id-demo-seed.ts` (`bun run seed:studentid-demo`,
`--purge` to remove) — six students, one per education system so the letters
come out G…/A…/B… beside each other, plus one deliberately left without a system
so the pending state is visible. Zero money rows.
