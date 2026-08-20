# Self-service corrections — a person can fix their own data

**Status:** built, awaiting review. **Date:** 2026-08-20.

## The problem

Three of the fields this product cares most about were **write-once**:

| Field | Written by | Editable by the person it describes |
|---|---|---|
| `users.email` (login address) | registration, or a receptionist at a walk-in counter | **no** |
| `student_profiles.guardian_email` / `guardian_phone` | the counter, or a banner that appears only while the email is MISSING | **no** — the banner disappeared the moment one was saved |
| education system / grade / track / second language | the onboarding wizard, once | **no** — `/onboarding` bounces a completed account to the dashboard |

Every one of them is a field a *third party* usually types. Our operators are
counter staff working from a number read aloud across a desk
([edura-operator-audience]); our students are children. A typo in any of the
three was permanent from the family's side, and the only remedy was asking
platform staff to edit the row.

The academic one is the loudest: the wizard's answers decide which subjects the
whole app shows a student. A wrong track on day one meant a subject list for
someone else's education, forever.

## What was built

Four cards on the existing settings screen — the screen every role already has —
plus one new route.

* **`EmailCard`** (every role) → `POST /api/v1/me/email`.
* **`GuardianContactCard`** (student, always — not only while missing) and
  **`ChildrenGuardianCards`** (parent, one per approved child) → the existing
  `POST /api/v1/me/guardian-contact`.
* **`OnboardingProfileCard`** (student / teacher / center owner) → a link to
  `/onboarding?edit=1`, the escape hatch the page already supported and nothing
  linked to.

## What was deliberately NOT done

* **No second writer, anywhere.** The guardian card and the parent's cards call
  `setGuardianContact` — the same function the counter and the banner call, so
  the audit row, the "must be a different adult" rule and the un-verification of
  an edited address all hold without being restated. The academic card calls
  nothing: it links to the wizard, whose `POST /me/onboarding` re-validates the
  whole system→stage→grade→track chain and whose student-code issuance is
  once-only, so re-running it cannot move a code already printed on a card.
* **No email-verification flow was invented.** `email_verified` drops to false
  on change, because the flag means "mail was seen to reach this inbox" and it
  has not. Wiring better-auth's confirmation endpoint to a user-facing screen is
  its own piece of work, and faking the flag would have been worse than leaving
  it honest.
* **Date of birth stays superadmin-only.** It has exactly one writer today
  (`verify-dob`), which sets the value and the evidence stamp together. A
  self-service DOB field would be either inert (unverified, changing nothing) or
  a way to overwrite evidenced data — and the default-minor rule is not a place
  to add a second writer for no gain.
* **National ID stays with center staff.** It is the manual-entry dedup key —
  the definition of "the same child" ([bulk-student-import]) — not a profile
  detail.
* **The session survives an email change.** The credential did not change.
  Signing someone out for fixing a typo teaches them not to fix typos.

## The rules that make widening the write surface safe

1. **A credentialed account re-proves its password.** The login email is the
   recovery address: whoever holds it can request a reset, so a borrowed
   unlocked phone must not be enough to redirect it. A wrong password is a
   **400, not a 401** — the same choice `me/password` made, because a typo must
   not read to the client as a dead session.
2. **An account with NO password is exempt.** A walk-in student who has not
   claimed credentials has nothing to prove, and refusing would lock out exactly
   the people this feature exists for.
3. **The guardian address stays a different adult's, from BOTH sides.**
   `setGuardianContact` already refused a guardian email equal to the student's
   own login email. The email route now refuses the mirror image. Without it a
   minor could satisfy the child-safety gate by editing the *other* side of the
   comparison — one rule, two doors, asserted together so they cannot drift.
4. **The change is on the record.** One `audit_logs` row, `user.email_changed`,
   naming the actor and both addresses.

## Two corrections that came with it

* **`users.name` now reaches `student_profiles.full_name`.** Every reader
  prefers `users.name` and falls back to the profile — *except global search*,
  which FILTERS on `full_name` in SQL. So a student who corrected a misspelled
  name stopped being findable by the corrected spelling at the very counter that
  has to find them.
* **A guardian PHONE saved beside an email already on file no longer starts an
  escalation clock.** `setGuardianContact` tested only the INCOMING email when
  deciding whether to stamp `guardian_contact_due_at`. That was harmless while
  the only caller was a banner that never sent a phone alone; the settings card
  does. It now also checks the address already on file, and no longer re-stamps
  a clock that is already running — re-stamping hands back time the deadline had
  already spent.
* A duplicate phone on `PATCH /me` used to surface the raw P2002 as "A record
  with these unique values already exists" — true, unactionable, and naming no
  field. Both routes now pre-check and name the field. The UNIQUE indexes remain
  the authority.

## Proof

`apps/erp/tests/db/self-service-profile.test.ts` — 23 assertions, green against
dev, driving the REAL route handlers (only the cookie→session read at the edge
is stubbed, via `__setSessionOverrideForTests`): wrong password refused as 400
with the row unchanged, omitted password refused, correct password changes it,
`email_verified` false after, exactly one audit row and no second row on a
re-save, a passwordless account exempt, both directions of the guardian
collision refused, a live duplicate address 409 (against the CURRENT address —
a vacated one is legitimately free again), name mirrored to `full_name`,
duplicate phone 409 naming the field, and no escalation clock started for a
family that already supplied an email.

[edura-operator-audience]: ../../CLAUDE.md
[bulk-student-import]: bulk-student-import.md
