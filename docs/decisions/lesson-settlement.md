# Lesson settlement: the trigger, the price, the basis (built 2026-08-09 — awaiting review)

Found by walking a fictitious center end to end on dev (register → approve →
onboard → hall → collaboration request → accept → walk-in cash → counter
check-in → settle → reports). Everything above the money engine worked; the
engine's TRIGGER and its PRICE did not.

1. **CASH WAS COLLECTED AND NOBODY WAS PAID.** A group created by ACCEPTING a
   collaboration request is born `price: 0` ("unpriced until the owner
   configures plans") and is then priced through `pricePerSession`, which is
   what the counter charges. `distributeSessionRevenue` derived the lesson's
   value from `course.price / plannedSessions` ALONE, so every such lesson
   settled at ZERO: the Payment, its receipt and its ledger row were all
   correct, the teacher's and the center's wallets got nothing, and the
   `distributedAt` claim made it PERMANENT — the lesson can never be settled
   again, even after someone fixes the price. Proven both ways: a lesson with
   one paying present student settled 0/0/0, and the same lesson at the same
   rates settled 50 EGP → platform 7.50 / center 7.50 / teacher 35.00 once the
   price was readable.
2. **ONE DERIVATION, `resolveLessonPrice` (binding).** There were THREE copies
   of "what is one lesson worth" and TWO OF THEM DISAGREED: the engine read
   `price / plannedSessions`, the back office's own settlement PREVIEW read
   `pricePerSession` first. **[dev, measured 2026-08-09]** 13 of the 14 courses
   carrying both prices disagree, often by 2-3x (56.25 vs 150.00 EGP a lesson) —
   so the confirm dialog quoted one amount and the ledger wrote another, which
   is precisely the lie `design/CONSTITUTION.md` §1 forbids. The engine, the
   back-office preview and the new www preview now call one function.
3. **AN UNPRICED LESSON REFUSES TO COMPLETE.** Settling it looks harmless (every
   share is zero) and is the worst outcome available: zero-value ledger rows, a
   zero `session_settlement`, and a claimed `distributedAt`. It now throws, so
   the whole transaction rolls back — including `status: "completed"` — and the
   lesson stays settleable once priced. This is the SAME posture the Method-2
   fee guard already had (proof VP6); Method 1 simply lacked it. The guard sits
   AFTER the branch resolution so M2's more specific diagnosis still wins.
4. **WHAT ONE LESSON IS WORTH IS NOW THE COURSE'S CHOICE** —
   `courses.settlement_basis`, because a course carrying both prices is
   genuinely ambiguous (a full-term enrolment amortises cheaper per lesson than
   a drop-in pass, and both numbers are real). Leaving it to whichever function
   read the row first is what produced #2.
   - `course_price` — `price / plannedSessions`. **The DEFAULT, and exactly the
     pre-existing behaviour, so no live course re-rates.** Falls back to
     `pricePerSession` when the legacy column is unset — that fallback is what
     fixes #1.
   - `session_price` — `pricePerSession`, the value of one lesson by definition.
   - `subscription` — each PRESENT student settles at what THEIR OWN coverage
     paid: a single-session pass at its price; a monthly plan at its price over
     **the lessons its period actually contains, COUNTED from the schedule**,
     never guessed from `daysOfWeek`; no live coverage → 0. The only basis that
     can never distribute money the platform did not collect. The ledger records
     each attendee at their own price.
5. **"Unpriced" means NOBODY here is priced.** Under `subscription` one unpaid
   attendee among several is a truthful nil contribution, not a misconfigured
   lesson, and must not block the others.
6. **THE TRIGGER HAD NO UI AT ALL.** `POST /api/v1/sessions/[id]/complete` had
   ZERO callers in `apps/www`; the only surface that could settle a lesson was
   `apps/superadmin`'s center-oversight tab, and no cron did it either. A center
   could take cash and mark attendance while the teacher's wallet stayed empty
   until Edura staff closed the lesson by hand, per center, one at a time. Now:
   the TEACHER closes it at the end of taking attendance, and the CENTER closes
   it from any lesson in the week schedule. **Same component, same preview, same
   guards** — the center was not given a second, looser way to move money.
7. **THE BUTTON CARRIES THE LEDGER'S OWN ARITHMETIC.** `previewSessionSettlement`
   (read-only twin of `completeSession`, guarded by the SAME `assertMaySettle`,
   because a preview showing money is not a lesser permission) runs the same
   price resolver, the same `economicsAt` and the same `computeLessonSplit` —
   including the per-student loop — so the quoted figure and the written figure
   are one expression rather than two that agree today. Every reason the button
   must not be live (cancelled / already settled / nobody present / unpriced /
   hall fee exceeds the price / teacher-direct) is decided ON THE SERVER and
   rendered as prose, never as a disabled control the reader must interrogate.
8. **Reads and arithmetic were split** (`loadLessonRates` + the pure
   `economicsAt`) so the per-student loop costs no extra queries and the preview
   cannot drift from the settlement.

Migration `20260809120000_course_settlement_basis` (additive: new enum +
`courses.settlement_basis NOT NULL DEFAULT 'course_price'`), with a
`rollback.sql` that states its cost plainly — dropping the column discards every
operator choice and silently reverts future lessons to the old rule.
**[dev, APPLIED 2026-08-09] — verify-db 27/27.**
**[production, APPLIED 2026-08-09] — 48 → 49 migrations, 79 tables unchanged,
every other check green.** Applied BEFORE the code that needs it deploys, which
is the order the bootstrap lesson in Conventions exists to enforce. Checked
against production after applying: the enum carries
`course_price, session_price, subscription`; the column is `NOT NULL DEFAULT
'course_price'`; and **zero** of its courses sit on anything other than the
pre-existing behaviour — which is the whole safety argument for the default,
verified rather than asserted.
**[test] THERE IS NO TEST DATABASE TO APPLY IT TO — verified 2026-08-09, and
Ali's decision is to leave it that way.** Both `.env.test` files (www and
packages/database) point at the DEV endpoint, and `db-guard` against them
reports `labelled 'dev'` — so "test" on this machine IS dev, which already has
this migration. The historical branch on disk (`ep-dry-shape-asv1ah7y`) is
reachable but EMPTY and UNLABELLED: 0 tables, no `_prisma_migrations`, no
`edura-env:*` marker — so `db-guard` would refuse it as a target anyway. This is
the 2026-08-03 decision above still holding, not a gap someone forgot to close;
do NOT read any `[test]` line in this file as work pending.

> **ONLY THIS MIGRATION WAS APPLIED TO PRODUCTION, deliberately.** Production had
> FOUR pending at that moment; the other three
> (`20260809140000_student_qr_credential`,
> `20260809160000_guardian_verification_purpose`,
> `20260809160100_guardian_email_verified`) belong to a CONCURRENT, UNMERGED
> workstream whose code is not deployed. `apply-migrations.mjs` is all-or-nothing,
> so running it would have applied them too — precisely the failure recorded in
> Conventions (`contact_submissions` ahead of `maturity_layer`) that cost a live
> outage. This one sorts FIRST among the pending set, so production is left with a
> contiguous prefix and no gap.
>
> Dev is a different story: it stands at 50 because
> `20260809140000_student_qr_credential` WAS applied there — not as a decision
> about that feature, but because its un-applied schema change had broken the
> SHARED generated Prisma client (`qr_version` selected but absent), failing every
> DB suite for everyone. `expected-db-shape.json` was bumped 48 → 50 to match dev,
> which is why **verify-db against production reports 49 ≠ 50** — a shared-baseline
> artifact, not a production defect.

Three smaller findings from the same walkthrough, fixed:
- **Auto-created group titles were ENGLISH** on an Arabic-first product
  (`subject.nameEn ?? subject.nameAr`), and the track suffix read `nameEn`
  ALONE so a track with no English name vanished from the title — two groups of
  the same subject and grade in different tracks then shared one name.
- **`pending` and `suspended` shared one login message**, whose copy says
  "suspended, contact support" — shown to a center sixty seconds after the
  signup screen promised a review. `ACCOUNT_PENDING` is now its own code,
  disclosed only after a correct password (the same proof-of-ownership gate
  `ACCOUNT_INACTIVE` already sat behind, so nothing new is revealed).
- **Cash was written to the points ledger as `online_payment`** with a reason
  saying "(cash)" — a row contradicting itself in an append-only ledger. The
  event now follows the method; `RULE_FALLBACK` borrows the online rule until a
  `cash_payment` rule is seeded, so the honest name cannot silently stop
  awarding points on an already-seeded environment.

A fourth suspected finding was INVESTIGATED AND REJECTED: the superadmin
registrations queue looked stale after an approval, but replaying the screen's
own POST-then-refetch sequence returns the updated list immediately (6/6). The
original observation was a page read before React re-rendered — recorded here
because "verify a suspected UI-wiring bug by reproducing it" is the lesson.

Proofs: settlement basis **9/9** (all three bases, including two attendees of
ONE lesson settling at 25000 and 10000 with the ledger recording each at their
own price), quote-equals-ledger **13/13** (every figure, both wallets, and the
button disappearing once settled), login doors **4/4**, Arabic title **4/4**,
cash points **5/5**, registrations contract **6/6**. Regressions green: root
`check-types` 9/9, www unit **575 pass/1 skip**, l1 11/11, external-teachers
104/104, wallet 20/20, hall-booking 62/62, invite-claim 107/107, c03 30/30,
c04-login-parity 76/76, registration-doors 17/17, center-oversight 122/122,
room-pricing-methods 78/79 (the 1 failure — a demo center carrying a ledger row
— pre-exists on main and was reproduced with these changes stashed).

**Deliberately NOT done:** a monthly-only course (a `pricePerMonth` with no
`pricePerSession`) still resolves to no lesson value under `course_price`, and
now refuses loudly instead of settling zero — deriving one would mean inventing
lessons-per-month. `subscription` is the answer for those courses. Nothing was
back-filled: lessons settled at zero before this change stay settled, because
the ledger is append-only and a retroactive re-rate is what M4.5 forbids; if any
exist in a live environment they need their own approved correction.
