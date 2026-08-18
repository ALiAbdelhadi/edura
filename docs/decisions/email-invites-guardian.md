# Email invites + guardian channel (built 2026-07-25 — awaiting review)

EMAIL is now the primary invite/credential-delivery channel for everyone.
WhatsApp is DEMOTED, not deleted (no verified Meta number yet). Built on the
Step 7 tokenized single-use claim — nothing was rebuilt.

> **NOTE:** the mail layer is `@repo/server-core/mail/send.ts` — provider-agnostic
> **nodemailer over SMTP** (`MAIL_PROVIDER=console|smtp`), NOT the Resend SDK.
> It works with Resend's SMTP bridge; that is an env change, never a code one.

1. **ONE claim kernel**: `apps/www/src/lib/services/invites/invite-token.ts`.
   `CLAIMABLE` maps purpose → the exactly-one role it may resolve to
   (`walk_in_onboarding`→student, `assistant_invite`→assistant,
   `center_staff_invite`→center_staff). The NextAuth claim provider reads that
   table, so a token minted for one role can never open another — a lookup, not
   a branch someone can forget. Generalizing Step 7's provider LOOSENED NOTHING:
   all five gates hold, plus two new ones (the account must not be soft-deleted;
   the assistant/staff link must still be live, so revoking a membership kills
   an outstanding invite without hunting for the token). Provider id
   `invite-token`, with `walkin-token` kept as an alias so Step 7 callers and
   proofs are untouched.
2. **PART A — student invite is email-first.** Delivery channels are an env set
   (`INVITE_CHANNELS`, default `email`); the WhatsApp leg is the same
   `sendWhatsApp` call, just off by default, and returns `skipped` (not
   `failed`) so "we chose not to" is distinguishable from "it broke".
3. **Guardian contact, and where the invite goes.** Almost every student here is
   a MINOR (default-minor), so "email the student" is the wrong default.
   `resolveStudentInviteRecipient` resolves, strictest-trust first: approved
   parent link with an email → `student_profiles.guardian_email` → the
   student's own email **only if they are a VERIFIED adult** → nothing. There
   is deliberately NO fallback to a minor's own inbox.
   The walk-in counter captures guardian **email if available, else phone**
   (kept for the record + a future SMS/WhatsApp channel). **Registration is
   never blocked on either.**
4. **Phone-only minor** ⇒ no email is sent at all; the API returns the copyable
   one-time claim link for in-person handover (the guardian is standing at the
   counter) plus `guardianEmailRequired`, and the student sees a required
   "add a guardian email" notice on their dashboard.
5. **CHILD-SAFETY GATE (binding).** `chat-guardian.ts` is the single rule: a
   MINOR with no guardian EMAIL has adult-facing messaging LOCKED — teacher,
   assistant, center_admin, center_staff (`ADULT_ROLES`). A guardian PHONE does
   NOT satisfy it: email is the only guardian channel we can deliver on today.
   The gate is enforced in `assertCanReach` AND filtered in `listContacts` from
   the same predicate, so the directory can never offer what the gate refuses
   (the drift proof still asserts set-equality), and in `assertGroupAccess` for
   posting. **Everything else works normally** — paid classes, materials,
   grades, wallet, login. The account is NEVER suspended by this rule.
   Existing students with an APPROVED parent link carrying an email are
   unaffected (that is why messaging-scope stayed 87/87).
6. **Timeout ESCALATES, never punishes.** `guardian_contact_due_at`
   (`GUARDIAN_EMAIL_GRACE_DAYS`, default 14) is set when we learn a minor has
   no guardian email, and is NEVER reset by a re-send. Before it: periodic
   reminders (cron `guardian-contact-reminders`, idempotent per window) and a
   dismissable banner. After it: the banner becomes non-dismissable and the
   owning CENTER is notified. Passing it never suspends the account and never
   unlocks messaging.
7. **PART B — assistants and center staff get the same invite/claim.** The
   creator NO LONGER types a password (`password` removed from both create
   APIs). The account is created `status: "shell"` + `passwordHash: NULL`,
   an invite is emailed, and the invitee sets their OWN password via
   `me/credentials` (still strictly set-once — that one condition is what makes
   it safe for three roles instead of one; an invitee keeps the address they
   were invited at, only a phone-only student chooses one). Both create/resend
   responses return a **copyable fallback link**, because an email in spam must
   not strand a hire. Invites are audited (`assistant.invited`,
   `center_staff.invited`); the token itself is never written to any row.
   Re-inviting an already-claimed account is REFUSED — that would be a
   creator-controlled password-reset door.
8. **The staff no-password bug, fixed at the source.** The old invariant
   ("creator supplies a password") is replaced by: a staff/assistant account
   has EITHER a password OR a live invite — never neither. `createStaff` /
   `createAssistant` now accept `shell` as a legitimate existing state
   (previously they threw "not active" at an unclaimed invitee, which is what
   could strand one). Asserted, not commented.
9. **Guardian email is stored, NOT verified.** A student could type a friend's
   address. What we do enforce: it may not equal the student's own login email,
   every set writes an audit row, and a self-supplied one notifies the center so
   a human sees it. **Confirm-by-click verification of the guardian address is
   the recommended follow-on and was deliberately NOT built.**

Migrations (additive only): `20260725100000_invite_purposes_guardian_notice`
(enum values, own file — Postgres cannot USE a new enum value in the transaction
that adds it) and `20260725100100_guardian_contact` (5 nullable columns + index,
no backfill).
**[dev] APPLIED. [production, 2026-07-31] APPLIED — all 40 migrations deployed; production is no longer behind.** Consequence: `guardian_contact_due_at` does not exist there, so the
`guardian-contact-reminders` cron job ERRORS on production rather than no-oping.
Applying them is part of the production bootstrap. Proof: `apps/www/tests/db/invite-claim.test.ts` **107/107** (live
DB, real services + real NextAuth providers + the real me/credentials route).
Regressions green: `bun run check-types` 5/5, `bun run build` both apps, www unit
111 pass/1 skip, messaging-scope 87/87, c04 72/72, center-staff-delegation
55/55, rbac-isolation 11/11, l1 12/12, m5 10/10.

### Optional env vars added
- `INVITE_CHANNELS` — `email` (default) | `email,whatsapp` | `whatsapp`.
- `INVITE_TOKEN_TTL_HOURS` — default 168 (falls back to `WALKIN_TOKEN_TTL_HOURS`).
- `GUARDIAN_EMAIL_GRACE_DAYS` — default 14.
- `GUARDIAN_REMINDER_EVERY_DAYS` — default 3.
