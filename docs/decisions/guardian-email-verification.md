# Guardian email verification (built 2026-08-09 — awaiting review)

`guardian_email` was stored and never proven — a student could type a friend's
address, and on this platform that address is what the child-safety gate treats
as adult oversight. Verification makes the claim checkable: the address itself
receives a link and someone has to click it. Kernel
`packages/server-core/src/services/invites/guardian-verification.ts`; public
page `/[locale]/guardian/verify`; a notice on the student dashboard.

1. **THE TOKEN MINTS NO SESSION, AND THAT IS THE WHOLE SECURITY ARGUMENT.** The
   invite machinery next door turns a token into a LOGIN — `CLAIMABLE` maps a
   purpose to the exactly-one role it may resolve into. A guardian is not a
   user of this platform, so if verification rode that path anyone holding a
   child's guardian address would receive a session. `guardian_email_verification`
   is therefore deliberately ABSENT from `CLAIMABLE`, and `confirmGuardianEmail`
   can do exactly one thing: stamp two columns. Proven by driving the REAL
   better-auth claim door with a real guardian token and watching it refuse.
2. **THE STAMP IS BOUND TO THE ADDRESS IT PROVED.** Two columns, not one:
   `guardian_email_verified_at` AND `guardian_email_verified_value`. A lone
   timestamp keeps saying "verified" after somebody edits the address, so a
   proof earned by one inbox would be inherited by the next. Every reader
   compares the stored value against the current `guardian_email` and treats a
   mismatch as unverified — so editing the address silently un-verifies it.
3. **THE STUDENT NEVER CHOOSES THE DESTINATION.** They may trigger a send; it
   always goes to the address on file. A student who could name the recipient
   could verify an address of their own choosing, which is the exact hole this
   closes. **The token is NOT returned** either — unlike a walk-in invite handed
   over a counter to someone standing there, this one exists to prove an address
   is reachable, so handing it back would defeat it entirely.
4. **THE PAGE RENDERS INERT — it does not confirm on load.** Mail scanners and
   link prefetchers follow URLs in email, and a single-use token burned by a
   scanner is a link the guardian can never use. The visitor presses a button.
5. **NO ORACLE.** Unknown, empty, expired, already-used, and mailed-to-an-
   address-that-has-since-changed all return the IDENTICAL message, so a prober
   cannot learn whether a token ever existed. The public endpoint is
   rate-limited, because an unauthenticated door that checks a secret is a door
   worth guessing at.
6. **A RESEND LEAVES ONE LIVE LINK.** Issuing invalidates any earlier unused
   token for the same student — two live links for two addresses is how a stale
   one confirms an address nobody re-checked. Only the SHA-256 of a token is
   persisted; the raw value is never written to any row.
7. **THE MESSAGING GATE WAS DELIBERATELY NOT FLIPPED (Ali's decision,
   2026-08-09).** `chat-guardian.ts` still opens on a guardian email being
   PRESENT, exactly as before. Requiring verification would lock adult-facing
   messaging for every minor whose guardian has not yet clicked a link they were
   never sent. `guardianVerificationStats()` reports `withGuardianEmail /
   verified / unverified` — that is the number to watch before flipping it. It
   is a function, not a screen; nothing renders it yet.
8. **The audit row carries NO actor.** A guardian is not a user, so
   `student.guardian_email_verified` records that THIS address was proven at
   THIS time — the fact worth keeping — and nothing about who clicked.

Migrations (additive only): `20260809160000_guardian_verification_purpose`
(enum value, own file — Postgres cannot USE a new enum value in the transaction
that adds it) and `20260809160100_guardian_email_verified` (two nullable
columns, NO backfill, so every existing student is UNVERIFIED, which is the
truth and locks nothing today per #7).
**[dev, APPLIED 2026-08-09] — 52 migrations, 79 tables, verify-db 27/27; both
columns and the enum value verified present.**
**[production, APPLIED 2026-08-09] — 50 → 52 migrations, verify-db 27/27,
applied BEFORE this code deploys, which is the order the bootstrap lesson in
Conventions exists to enforce.** A read-only pre-flight found production's
pending set was **exactly these two and nothing else**, so `apply-migrations.mjs`
being all-or-nothing did not bite and no migration had to be moved aside (the
workaround the student-QR section records) — they sort last, so production is
left with a contiguous prefix and no gap. Checked against production AFTER
applying: both columns present as nullable `timestamptz` / `text`; the enum
value present AND usable in a query (`'guardian_email_verification'::invite_purpose`
casts, which is what the "cannot USE a new value in the transaction that adds
it" rule is about); **zero rows carry a stamp, because there is no backfill and
every student is correctly UNVERIFIED**; and the data census is byte-identical
to the pre-flight (8 users / 2 centers / 1 student / 0 payments / 0 transactions
/ 2 invite_tokens / 80 tables).
**[test] there is no test database — `.env.test` points at DEV** (the 2026-08-03
decision), which already has them. Do not read this as work pending.

Proof: `apps/erp/tests/db/guardian-verification.test.ts` **51/51** (live DB,
real services, the real better-auth claim door) — the token hash never being
the token; the claim door refusing and leaving the token unburned with no
session row; the stamp, the burn and the actor-less audit row in one
transaction; all five failure modes returning one indistinguishable message;
an edited address un-verifying and its previously-clicked link ceasing to work,
asserted by SCANNING the old token rather than reading the column; a resend
leaving exactly one live link; and `guardianVerificationStats` accounting for
every student with an address. Unit: `guardian-verification.test.ts` **9/9**
(the purpose absent from CLAIMABLE, the address binding, `maskEmail`).

**Deliberately NOT built:** flipping the messaging gate (#7); and a superadmin
surface for the stats, which is where the flip decision will eventually be made.

Demo data: `prisma/guardian-verification-demo-seed.ts`
(`bun run seed:guardianver-demo`, `--purge` to remove) — five students, one per
state: verified; stored-but-unproven with a LIVE link; verified-then-EDITED (the
stamp is still on the row and every reader correctly reports unverified); an
EXPIRED link; and no guardian address at all. **The tokens are real and are
printed, because only a SHA-256 is ever stored** — a link cannot be recovered
from the database later, so it has to be minted by the seed and handed over now
(the same reason the walk-in seed prints its claim links). Zero money rows, and
no center: verification touches neither.
**One thing `--purge` cannot remove, and should not be able to:** clicking a
link writes a `student.guardian_email_verified` row, and `audit_logs` is REVOKEd
DELETE for the app role. The seed itself writes no audit row; only a click does,
and the purge says so rather than failing on it — which is how this was found
(the first version tried to delete it and got `42501`).
