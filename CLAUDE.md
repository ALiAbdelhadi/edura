# Project Context

Education platform for the Egyptian market (K-12 private lessons / teaching centers).

## Apps & Roles
- `www` app (existing): four roles — Center, Teacher, Parent, Student.
- `admin` app (separate, to be built): Super Admin only — full control over every
  entity in the database. No superadmin functionality may ever exist in the www app.

## Core Domain Rules
- Onboarding: each student selects an academic year + detailed track (شعبة).
  Subjects are auto-assigned from a track-to-subject mapping. The subjects/classes
  page shows ONLY the student's track subjects by default, with a separate
  "browse all subjects" search mode.
- Subscriptions: a student subscribes either to an individual Teacher or to a Center.
- Payments: online via Paymob (foundation + sandbox + mock mode), or cash at the
  center (walk-in, recorded by center staff).
- Walk-in registration at a center creates a student account and sends a WhatsApp
  message containing the Student ID + a secure tokenized link to complete onboarding.
- Attendance at centers is a per-teacher setting with two modes:
  (A) counter check-in only, or (B) counter check-in + a second check-in at the
  classroom door.
- Teachers and Centers can send each other collaboration requests (subject, year,
  hall, schedule, optional expected student count). Either side accepts/rejects;
  acceptance creates the class/schedule.
- Teachers can delegate management to Assistant accounts acting on their behalf,
  with audit attribution.

## Descoped (not building)

These four systems are **permanently dropped** from the roadmap (decided
2026-07-21). Do NOT build them, do NOT scaffold routes/screens/nav entries for
them, and do NOT re-add them to the roadmap. If a Stitch design (or any future
spec) includes them, skip those parts — treat their absence as intentional, not
a gap to fill.

1. **AI bot / chatbot / AI assistant** — no support bot, academic bot, AI tutor,
   or any AI-assistant surface. (The `chatbot_config` / `chatbot_faq` /
   `chatbot_conversations` tables in `schema.prisma` were always schema-only with
   no logic wired; they stay inert — do NOT wire any AI logic to them. Removing
   the tables is a DB migration and would need its own approved plan; leaving
   them dormant is fine.)
2. **Scholarships** — no scholarship entity, application flow, or UI.
3. **Bookstore** — no book catalog, store, or purchase flow.
4. **Videos / video lessons** — no pre-recorded video-lesson library, player, or
   content-upload surface. NOTE: this does NOT touch "lessons" in the money/
   attendance sense — in this codebase a `lesson` = a live class `Session`
   (the fee/points/attendance engine), which is core and untouched.

As of 2026-07-21 none of these four had any UI entry point in `apps/www` or
`apps/superadmin` (verified by search) — nothing was built, so nothing was
removed. This section is the guard so they are never revisited.

## Deferred (revisit later)

Unlike the Descoped systems above (permanently dropped), these are paused — not
killed. Do NOT build them now, and strip/hide any placeholder UI for them from
both the app and any designs. Revisit only when explicitly requested with the
business rules defined.

1. **Debt / credit (pay-later)** — deferred (decided 2026-07-21). Debt/credit
   (pay-later) is high-risk money functionality; deferred until explicitly
   needed with defined business rules (who can grant debt, limits, repayment,
   interest). The wallet is built and is the foundation if/when we do it.
   As of 2026-07-21 there is NO debt/pay-later feature, schema table, i18n
   string, or placeholder UI anywhere (verified by search) — nothing was built,
   so nothing needed removing. (The accounting `credit`/`debit` entries in the
   Transaction ledger are the double-entry money engine, NOT this feature —
   they stay.) If a Stitch design (or any future spec) includes a pay-later /
   installments / "بالأجل" surface, skip it — treat its absence as intentional.

## Post-launch improvements (do NOT implement now)

Recorded 2026-07-25. These are tasks for AFTER launch. Do not start them while
the launch path (DB separation, remaining fixes, hosting) is in progress.

1. **Next.js 16 rendering + caching optimization pass** — review pages/routes
   and apply the right rendering strategy (SSR / static / streaming) and
   selective `'use cache'` where it genuinely helps.
   **HARD CONSTRAINTS:** never cache money, wallet balances, subscriptions,
   attendance, messaging, auth/session, or any per-user or stateful data —
   those stay dynamic and fresh every request.
   **Approach:** measure real traffic first to find actual slow paths, then
   optimize those specific pages one batch at a time with review — NOT a
   repo-wide sweep. This is a performance refinement for after launch, done
   carefully, not a pre-launch task.

## Conventions

> **STATE CLAIMS MUST NAME THEIR ENVIRONMENT (binding, added 2026-07-26).**
> There are three databases — `dev`, `test`, `production` — each carrying its
> environment as a label INSIDE it (`edura-env:<env>`; see
> `packages/database/scripts/db-guard.ts`). Any sentence in this file asserting
> that something is *applied, in force, present, seeded, or wiped* MUST say which
> environment it is true of. An unqualified "applied" reads as "everywhere" and
> has already misled: the guardian migrations were applied to dev only, while
> this file said "applied" flatly, and production was two migrations behind
> without anyone noticing. Behaviour and policy claims ("the gate is
> default-closed") need no qualifier — only claims about the state of a
> database, an environment, or a deployment do.
>
> Environment state changes without a commit, so this file goes stale silently.
> `packages/database/scripts/verify-db.ts` is read-only and safe against any
> target: prefer running it over trusting a sentence written here.

- All demo/seed data is flagged `is_demo = true` so it can be purged later.
  Purgeable `is_demo` demo data is wiped before launch. This NEVER includes the
  permanent reference data — the Egyptian education catalog (systems / stages /
  grades / tracks / subjects / offerings) and my real superadmin/accountant
  accounts — which always stay.
  **[dev, verified 2026-07-26]** the catalog is present (3 systems / 45 subjects
  / 27 grade levels) and the real operator account exists. **[production,
  verified 2026-07-26]** the database is an EMPTY SCHEMA SHELL — 68 tables, zero
  rows, no catalog, no super_admin, no accountant. It has never been seeded.
  Bootstrap order for a fresh environment: `label-db` → `bootstrap-app-role` →
  `prisma migrate deploy` → `seed` → `verify-db`.
- **Realistic demo data during development:** whenever building a new
  feature/screen/system, also seed enough realistic demo data (flagged
  `is_demo = true`) so I can view and test it as if it were real — populated
  screens, not empty states. Keep all demo data in clearly-labeled,
  cleanly-removable seed scripts. NEVER let demo data write to the money
  ledger, wallets, or finance tables unless the feature being built IS a money
  feature and I've approved its plan — and even then, flag it `is_demo` and
  keep it purgeable. This demo data is for my preview only and gets wiped
  before launch (Step 10 style).
- Secrets only via env vars (e.g. PAYMOB_*, WHATSAPP_*). Never hardcode.
- Destructive operations use soft-delete; all superadmin writes go to an audit log.
- Prefer incremental, migration-safe schema changes.
- Git: Claude never runs git add/commit/push and never adds a Co-Authored-By or
  any other trailer to commit messages. Claude only provides the commit message
  text; I run all git commands myself.

## Approved decisions (2026-07-18)

The implementation roadmap is the 10-step order in
[docs/architecture/architecture-review.md](docs/architecture/architecture-review.md) §5 (Step 0 done).
Work stops after each step for review before the next begins.

> **TERMINOLOGY WARNING:** in this codebase `dashboard/admin` is the **CENTER**
> portal (role `center_admin`) — it stays in www, untouched. The app being
> extracted is the SUPER ADMIN platform portal (`dashboard/superadmin` +
> `/api/v1/admin/**`). The new app is named **`apps/superadmin`** — NOT
> `apps/admin` — to avoid confusion with the center portal.

1. **Back-office**: ONE internal app, `apps/superadmin`, hosting two staff roles:
   `super_admin` (full platform control — everything from `dashboard/superadmin`
   + `/api/v1/admin/**`) and `accountant` (`/dashboard/finance` +
   `/api/v1/finance/**` as a restricted portal; finance screens ONLY, enforced at
   the API layer, not just navigation). Its NextAuth `authorize()` accepts only
   those two roles. Own subdomain + own cookie names, fully separated from www
   sessions. www keeps only: center, teacher, parent, student, assistant.
   Superadmin live chat is dropped for now (broadcast notifications only).
2. **Subscriptions & pricing**: both payment plans supported — MONTHLY (one
   month, manual renewal by paying again, online or cash; no auto-charge) and
   PER-SESSION (pay-as-you-go, modeled as a single-session pass tied to a
   specific session). The course owner configures which plans are enabled per
   course and their prices (`pricePerMonth`, `pricePerSession`; at least one
   enabled); the student/parent picks at checkout. Subscription WRAPS
   enrollment: enrollment stays the roster link; the subscription/pass is the
   payment coverage that access/attendance checks consult. Flow: pick target
   (teacher or center) → pick course/group → pick plan → pay → coverage +
   enrollment created together. Center counter must support cash for a single
   session + counter check-in in ONE step (the classic Egyptian center
   workflow). Teacher-direct courses: nullable `Course.centerId` with
   teacher-owned semantics (NO shadow centers), optional free-text location
   (own venue or online), money split = platform commission only.
3. **Collaboration requests REPLACE `ClassroomBooking` and absorb the
   affiliation invite** (pre-launch, prefer the clean model). The request
   carries `proposedCenterShare` so the money engine keeps working.
4. **Attendance modes**: global per-teacher setting, default `counter_only`.
   Counter check-in = center front-desk staff; in `counter_only` mode that
   single check-in marks the student attending the specific session they chose.
   In `counter_and_door` mode the door check-in at the hall entrance is done by
   the TEACHER'S ASSISTANT (teacher's own account as fallback). Counter without
   door = a distinct "counter_only" status that does NOT count as present,
   flagged visibly to the teacher. Manual Student ID entry required; QR
   scanning supported where simple.
5. **WhatsApp**: Meta WhatsApp Business Cloud API as the real driver behind an
   abstraction + a mock/log mode. No verified business number yet → run mock
   and prepare templates for Meta approval. Design so OTP/phone verification
   can be added later; OTP itself is out of scope this phase.
6. **`is_demo`**: flag root entities only (users, centers, courses); children
   inherit by ancestry. The Egyptian education catalog is permanent reference
   data — do NOT flag it. Hardcoded quick-login buttons gated behind
   `NODE_ENV !== "production"`.
   **Leftover legacy data (decided 2026-07-18; recounted 2026-07-26):**
   unflagged rows created by past live-DB test runs (not by the seed, no stable
   identifiers) stay untouched for now. **[dev, measured 2026-07-26]** the count
   is now **378 unflagged users / 124 centers / 130 courses** — the figures
   originally recorded here (~144 / 21 / 19) were from 2026-07-18 and had grown
   2.6–7× by the time anyone looked again. Among those users are **41 non-demo
   `super_admin` accounts leaked by DB test fixtures** (see
   docs/reports/seed-and-fixture-findings.md). Treat any count in this file as a
   snapshot with a date, never as current. **[production]** zero of any of it. Before launch, ALL non-seed
   data gets wiped — this is on the Step 9 (deprecation & hardening) checklist
   in docs/architecture/architecture-review.md; do not attempt to flag it by heuristic.
   **Step 9 wipe note (added in Step 4):** cash payments recorded BEFORE the
   Step 4 ledger reconciliation were never mirrored to the Transaction ledger
   (forward-only reconciliation, deliberately not backfilled) — they are part
   of the pre-launch wipe; do not read pre-Step-4 cash history as
   ledger-complete.
7. **Paymob**: card iframe + mobile wallets only; kiosk/Aman and Fawry out of
   scope this phase. Mock-first with the paymob driver ready; `PAYMOB_*` env
   keys arrive when the account is created.
8. **Schema drift**: approved and done (Step 0) — `schema.prisma` restored from
   the generated client; the two untracked migrations committed.
9. **Assistants**: an assistant serves EXACTLY ONE teacher — enforce in schema
   with a partial unique on `assistantId` where `removedAt IS NULL`. Delegation
   default = everything the teacher can do (attendance incl. door check-ins,
   grades, materials, schedules, collaboration requests, attendance-mode
   setting, messaging) EXCEPT wallet/payouts/financial settings and managing
   other assistants. Audit every action as "assistant X on behalf of teacher Y".
10. **Step 2 follow-on (approved 2026-07-18 — schedule right after the Step 2
    review, before Step 3):** in `apps/superadmin`, add generic auto-CRUD
    screens for every entity plus custom screens for the important ones
    (users, centers, teachers, subscriptions, payments), an audit-log viewer
    UI, and a dashboard home with counters (students / teachers / centers /
    active subscriptions / total revenue). Every list view gets search,
    filters, and pagination; destructive actions use soft-delete. This was
    deliberately deferred out of Step 2, which was extraction only.
11. **Step 3 done — Paymob foundation (2026-07-19).** Gateway abstraction +
    working mock driver (default, `PAYMENTS_MODE=mock`), EMPTY paymob driver
    stub (TODOs mark where auth token → order → payment key → iframe/redirect
    and HMAC verification go — real API deliberately not integrated),
    `payment_intents` table, initiate + HMAC-verified idempotent webhook,
    amount always from the server-side intent. Successful online settlement
    writes Payment + **Transaction** + points + notification.

    > **✅ LEDGER RECONCILIATION — DONE in Step 4 (2026-07-19):** cash
    > payments now mirror to the Transaction ledger (type payment/refund,
    > method cash) in the same DB transaction as the Payment row; the
    > "online payments only" caveat notes were removed. Forward-only: cash
    > payments recorded BEFORE Step 4 were never mirrored — see the Step 9
    > wipe note in decision #6.

## Messaging (built 2026-07-22 — awaiting review)

Relationship-scoped messaging with a child-safety layer. Built ON TOP of the
existing chat system (conversations/messages, apps/realtime Socket.IO, the
shared ChatScreen) — nothing was rebuilt.

1. **ONE authorization module**: `packages/database/src/queries/chat-scope.ts`.
   A single `EDGES` table defines every relationship, PARAMETERIZED rather than
   duplicated: `narrowTo` set = "can this actor reach THIS user?" (the gate),
   unset = "who can they reach?" (the directory). `assertCanReach` and
   `listContacts` are the two consumers, so the auto-search can never offer
   someone the gate would reject — a drift test asserts set-equality.
   Gate order: matrix (chat-policy.ts) → relationship (EDGES) → **guardian
   channel (chat-guardian.ts, added 2026-07-25)** → block → rate limit.
   **Default-deny**: `EDGES[role] ?? []`, and a center-staff sub-role not
   named on an edge cannot use it. New roles fail closed with no denylist.
2. **Matrix change (reverses the old assistant-first rule).** Students and
   parents now message their own teachers DIRECTLY (`student/parent → teacher`
   were previously absent; `teacher → student/parent` were "escalation"). No
   pair is escalation-mode any more. The assistant-first convention survives as
   UI ordering only, not as an authorization rule.
3. **center_staff got a messaging surface** (was an empty matrix row), scoped by
   preset sub-role: receptionist → families, manager → the whole center scope,
   **center_accountant → nobody** (that tier appears on no edge).
4. **No impersonation in messaging.** Unlike Step 8's `delegated()`, an
   assistant/staff member messages AS THEMSELVES, scoped by their principal —
   an adult must never talk to a minor behind another identity.
5. **DEFAULT-MINOR (binding).** `isMinor()` in `chat-minors.ts` is the single
   implementation, written as one POSITIVE adult condition:
   `adult = dateOfBirth AND dateOfBirthVerifiedAt AND age >= 18`. Missing,
   unverified, or under-18 all mean MINOR with parent oversight ACTIVE. New
   columns `student_profiles.date_of_birth` + `date_of_birth_verified_at/by`;
   no backfill, so students default to minor — intended, not a gap.
   **[dev, measured 2026-07-26]** this is no longer universal: of 230
   `student_profiles`, **225 have a NULL `date_of_birth` and 3 carry a
   verification stamp** — so a handful now resolve as ADULTS and sit outside
   parent oversight. The default is still minor; "every existing student is a
   minor", as this line previously read, is not. **[production]** the columns
   exist but there are no student rows at all.
6. **Parent oversight** = protective transparency, not surveillance:
   strictly read-only (never touches unread counters or read receipts — proven),
   no write path in UI or API, only MINOR children with an APPROVED link, only
   threads with ADULTS, and a persistent disclosure banner shown to BOTH sides.
7. **Retention**: append-only; soft-delete keeps the body (participants see
   "message removed", the super-admin log does not). `/dashboard/superadmin/
   messaging` = log search + read-only thread viewer + reports queue + blocks;
   **opening a thread writes a `messaging.thread_viewed` audit row.**
8. **Rate limiting**: `ChatLimiter` is a REQUIRED parameter on `appendMessage`/
   `getOrCreateConversation`/`postGroupMessage`, so a transport that forgets one
   fails to COMPILE. This closed a real gap — the socket path (the PRIMARY send
   path) bypasses Next middleware and was previously unlimited. Buckets key on
   USER id, not IP.
9. **Block/report**: enforced inside `assertCanReach`, so no entry point can
   bypass them. A block halts BOTH directions, deletes no history, and never
   hides a thread from parent oversight or the super-admin log. An ADULT
   blocking a MINOR auto-files a `safety_concern` report.
10. **Groups**: `group_members` is a fanout CACHE only — `assertGroupAccess`
    re-derives live per user, so a dropped student is denied even with a stale
    cached row (proven). Announcement-shaped (`owner_only` default).

Migration `20260722200000_messaging_scope_groups_safety` (additive only).
Proofs: `apps/www/tests/db/messaging-scope.test.ts` **87/87**, unit
`tests/unit/messaging-matrix.test.ts` 12/12. Regressions green: rbac-isolation
11/11, center-staff-delegation 55/55, unit suite 85 pass/1 skip, typecheck 5/5,
`pnpm build` both apps. Demo data: `prisma/messaging-demo-seed.ts`
(`--purge` to remove), two centers so isolation is visible in the preview.

## Superadmin center oversight (built 2026-07-25 — awaiting review)

Cross-center read visibility + a CLOSED SET of audited control operations, in
`apps/superadmin` only. Built on the existing systems; nothing was rebuilt.

1. **Two modules, one boundary.** `center-oversight.ts` READS (no mutation, and
   it imports nothing that mutates); `center-control.ts` ACTS. "Superadmin sees
   all money but moves none" is checkable by reading one import list.
2. **Read visibility** — pick any center, see rooms, teachers, students,
   courses, sessions, enrollments, subscriptions, attendance, staff, pending
   items, AND all six money ledgers scoped to it (transactions, payments,
   payouts, session_settlements, invoices, wallet_ledger) plus the cached
   wallet balance and the existing `centerStatement`. Rows with a NULL
   `center_id` are teacher-direct and are never folded into a center's books.
3. **Six control ops**, each mutating + writing ONE `audit_logs` row (actor,
   action, target, center, before, after, ip, timestamp) in the SAME
   transaction — so a write cannot commit without its audit row:
   `center.activated/deactivated`, `user.activated/deactivated` (scoped to
   members of that center), `center.student_removed/restored`,
   `collaboration_request.approved/rejected`, `center.profile_updated`,
   `center.room_created/updated/activated/deactivated`.
   `on_behalf_of` is left NULL on purpose — that column means "assistant X for
   teacher Y" (Step 8); a super admin acts as themselves.
4. **MONEY IS READ-ONLY, and superadmin is NOT exempt.** Both apps connect as
   the same `edura_app` role; `platformDb` only sets the `app.bypass_rls` GUC,
   which RLS policies read and table GRANTs do not. So the existing REVOKEs
   still bite: UPDATE/DELETE on `transactions`, `points_ledger`,
   `session_settlements`, `audit_logs` and DELETE on `invoices`/`payouts` all
   fail with `permission denied` for a super admin (proven). No GRANT, no
   second DB role, no `$queryRawUnsafe` was added. `wallet_ledger` still has no
   DB-level REVOKE (deliberate, see migration `20260722000100_student_wallet`)
   — it is held by `immutableExtension` at runtime; the proof reports this
   honestly rather than claiming a guarantee that is not there.
5. **Revenue split / commission % are NOT editable here** (decided 2026-07-25).
   The center-profile allowlist is `.strict()` and excludes them, plus
   walletBalance / receiptSeq / status / shortId / entityType / isDemo /
   ownerUserId. Splits keep their dedicated pricing flow with snapshot-on-create
   + new-courses-only semantics — one money-sensitive number, one edit path.
6. **Deactivation reuses C-03**, not a new mechanism: the status write passes
   through `sessionRevocationExtension`, so `token_version` bumps in the same
   statement and the next request is unauthenticated. Enrollments are NOT
   touched by a deactivation.
7. **The only enrollment-removing op reuses H-04** — it routes through
   `centerBlacklistStudent`, so `blacklist_cascade_actions` journals each
   withdrawal and "restore" replays it. `centerBlacklistStudent` gained an
   optional explicit `centerId` (superadmin has no session centerId); a
   non-super_admin naming another center is refused in the service.
8. **Shared-kernel move (pure, with shims).** `collaboration.ts` moved to
   `@repo/server-core/services/collaboration` — same precedent as
   `blacklist.ts` — along with `session-generator`, `conflict-detector`,
   notification `fanout`, and `assertMethod2Enablable`. www re-exports all of
   them, so every www import path and behaviour is unchanged. The ONE addition
   is `opts.as = "platform_override"`, default-closed (defaults to `"party"`
   and re-checks `role === "super_admin"` inside `assertResponder`).
9. **Audit-log viewer** (roadmap decision #10, never built until now):
   `/dashboard/superadmin/audit` + an Audit tab on each center. `audit_logs` is
   REVOKEd UPDATE/DELETE, so the trail cannot be edited from any surface.

**No database migration was required.** Proof: `apps/superadmin/tests/db/
center-oversight.test.ts` **119/119** (live DB, real services + real NextAuth
callbacks + real DB role). Regressions green: `pnpm check-types` 5/5, `pnpm
build` both apps, www unit 111 pass/1 skip, rbac-isolation 11/11, h04 44/44,
c03 www 26/26 + superadmin 15/15, c04 72/72 + 26/26, messaging-scope 87/87,
center-staff-delegation 55/55, l1 12/12, refund 13/13, h2 7/7, h3 6/6,
room-pricing-methods 47/47, center-share-admin 11/11. Demo data:
`prisma/center-oversight-demo-seed.ts` (`--purge` to remove) — two centers, and
**zero money rows** (per the Conventions rule), so the Finance tab is
legitimately empty for demo centers.

## Email invites + guardian channel (built 2026-07-25 — awaiting review)

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
**[dev, verified 2026-07-26] APPLIED — 36 migrations. [production, verified
2026-07-26] NOT APPLIED — 34 migrations; production is behind by exactly these
two.** Consequence: `guardian_contact_due_at` does not exist there, so the
`guardian-contact-reminders` cron job ERRORS on production rather than no-oping.
Applying them is part of the production bootstrap. Proof: `apps/www/tests/db/invite-claim.test.ts` **107/107** (live
DB, real services + real NextAuth providers + the real me/credentials route).
Regressions green: `pnpm check-types` 5/5, `pnpm build` both apps, www unit
111 pass/1 skip, messaging-scope 87/87, c04 72/72, center-staff-delegation
55/55, rbac-isolation 11/11, l1 12/12, m5 10/10.

### Optional env vars added
- `INVITE_CHANNELS` — `email` (default) | `email,whatsapp` | `whatsapp`.
- `INVITE_TOKEN_TTL_HOURS` — default 168 (falls back to `WALKIN_TOKEN_TTL_HOURS`).
- `GUARDIAN_EMAIL_GRACE_DAYS` — default 14.
- `GUARDIAN_REMINDER_EVERY_DAYS` — default 3.

## Stitch MCP design workflow (binding rules, added 2026-07-20)

The Stitch MCP (Google's design tool) is connected. When working with designs
from Stitch:

1. **Read, then implement faithfully.** Use Stitch to READ and understand the
   designs, then implement them in the existing UI, matching the design's
   layout, spacing, colors, and components.
2. **Additive only on existing work.** Applying a design must never delete,
   remove, or break any existing feature, screen, route, or functionality. If
   a design appears to REPLACE something that already exists, STOP and ask
   before removing anything — additions and refinements are fine, silent
   deletions are not.
3. **Never weaken what we built.** The security fixes, the money engine, the
   auth/session model, RLS/data-isolation, and the assistant delegation
   boundary are untouchable. A design change must never weaken them — UI
   changes stay on the presentation layer.
4. **Database changes require an approved plan first.** If a design genuinely
   requires a schema change, propose one — but ALWAYS present the plan first
   (exact schema change + migration) and WAIT for approval before touching the
   DB. Never modify the database silently. Same additive, migration-safe
   discipline as the rest of the project.
5. **One design system.** Follow the existing conventions — @repo/ui
   components, Tailwind v4 tokens, RTL/Arabic support. Do not introduce a
   parallel styling approach.

## Security remediation progress (BATCH 1 + BATCH 2, from docs/security/security-audit.md)

Findings fixed one-at-a-time, each with a proof, stop-per-fix. See
docs/security/security-audit.md for the full report and severities.

**DONE (reviewed + accepted):**
- **C1** — mock payment gateway can't settle real money in prod (PAYMENTS_MODE
  must be explicit; PAYMOB_HMAC_SECRET required, no fallback; mock-complete
  404s in prod; timingSafeEqual HMAC compare).
- **C2 + H5** — login rate-limiting + dummy-hash constant-time compare in BOTH
  apps' NextAuth authorize() (closes brute-force + email enumeration).
- **H1** — payout-request TOCTOU: `SELECT … FOR UPDATE` on the beneficiary in
  teacher/center wallet + generatePayouts.
- **H2** — payout-settlement floor: conditional decrement (updateMany where
  balance >= net) + DB `CHECK (wallet_balance >= 0)`.
  **[dev, verified 2026-07-26]** DONE — `centers_wallet_balance_nonneg` is
  `convalidated = true`, zero negative rows, minimum balance 0. The legacy
  -2600 row is gone (the Step 9 wipe removed it) and the constraint was
  validated afterwards. **[production, verified 2026-07-26]** the constraint
  exists but is still `NOT VALID` — validating it there is part of the
  production bootstrap, not a leftover from the wipe. The note that previously
  stood here ("NOT VALID — one legacy -2600 row left; VALIDATE after") read as a
  pending dev TODO and was wrong in both directions.
- **H3** — refund double-refund TOCTOU: partial unique
  `transactions_one_refund_per_payment` on (reversal_of_id) WHERE type='refund'.
- **H4** — security headers on both apps (HSTS, nosniff, Referrer-Policy,
  X-Frame-Options DENY/superadmin + SAMEORIGIN/www) + a **Report-Only** CSP
  (allows Cloudinary img, the realtime socket connect-src on www, Paymob
  frame-src on www; self-hosted fonts). CSP still needs tightening to a
  nonce-based script-src before flipping to enforce.
- **M1** — webhook claim + settlement in ONE transaction (self-heals on
  redelivery; no charged-but-empty intent); idempotent replay preserved.
- **M2** — split the shared secret: REALTIME_JWT_SECRET + INTERNAL_API_SECRET
  are dedicated + required in prod (fail closed); NEXTAUTH_SECRET fallback is
  dev-only.

**REMAINING (in priority order):**
- **M3** — shared-store (Redis) rate limiter + trusted client-IP hop.
  *Implemented + proven, awaiting review* (adds REDIS_URL / TRUSTED_PROXY_HOPS /
  TRUSTED_CLIENT_IP_HEADER; falls back to in-memory when REDIS_URL unset).
- **M4** — return a generic "Internal error" for unhandled errors in prod (stop
  leaking raw err.message).
- **M7** — cron auth: require CRON_SECRET unconditionally (fail closed if
  unset) and drop the side-effectful GET alias.
  *Done (2026-07-20):* `authorized()` returns false when CRON_SECRET is unset
  in EVERY env (no `NODE_ENV` bypass); `GET = POST` alias removed so the
  data-mutating jobs are POST-only (plain GET → 405). Proof in
  apps/www/tests/unit/m7-cron-auth.test.ts.
- **Dependency overrides** — pnpm `overrides` to clear the 13 dev/build-time
  advisories (all transitive tooling; no runtime-path exposure).
  *Done (2026-07-20):* root `package.json` `pnpm.overrides` forces the patched
  version WITHIN THE SAME MAJOR for minimatch (^3.1.5), flatted (^3.4.2),
  brace-expansion@1 (^1.1.16), picomatch@2 (^2.3.2) + picomatch@4 (^4.0.5),
  @hono/node-server (^1.19.14), postcss@8 (^8.5.20), uuid@8 (→ ^11.1.1 for
  next-auth). `pnpm audit` now reports **0 vulnerabilities**; typecheck (5/5),
  www unit suite (48 pass/1 skip), and `pnpm build` (both apps) all green. No
  security-sensitive runtime dep (next/react/next-auth/prisma/bcryptjs/zod/
  jose/socket.io/ioredis) was bumped — deliberately out of scope.
- Then the lighter: **M5** (temp-students/[id]/send-invite ownership check),
  **M6** (materials %PDF- magic-byte check), **M8** (kill $queryRawUnsafe).
- Then **Step 10** — final cleanup pass (batch the remaining L-findings; flip
  the CSP to enforce; VALIDATE the centers wallet CHECK after the Step 9 wipe).

### BATCH 3 (L-findings)
- **L1** — password reset/change now invalidates pre-existing 30-day JWT
  sessions (server-side revocation for otherwise-stateless tokens).
  *Done (2026-07-20 — awaiting review):* new `users.token_version` int
  (migration `20260720180000_user_token_version`, default 0, backfilled 0 so
  no one is logged out on deploy). Every JWT records `ver` at issue time (both
  apps' `authorize` return it + the manual `/api/v1/auth/login` encode); the
  NextAuth `jwt` callback re-reads `token_version` on EVERY request and strips
  all claims (→ no session user → logged out) when the token's `ver` trails the
  column or the user row is gone. `resetPassword` bumps `token_version` in the
  SAME tx as the new hash. The check lives in BOTH apps' callbacks, and the
  column is shared, so a reset also revokes a stolen super_admin/accountant
  session. Cost: one indexed PK lookup per request (cacheable later). Proof
  (live DB, real authorize + jwt/session callbacks + real resetPassword),
  12/12: apps/www/tests/db/l1-session-invalidation.test.ts — pre-reset token
  accepted → reset bumps ver → same token now rejected → unrelated session
  still valid → old password stops working → fresh login (ver 1) accepted.
  Note: `me/credentials` (set-once first password for walk-ins) deliberately
  NOT bumped — no prior password to revoke.

### Env vars now REQUIRED in production (deployment must set these)
Missing any of these fails closed (refuse to boot / hard error) — by design.
- `PAYMENTS_MODE` — must be explicit: `mock` | `sandbox` | `live` (C1).
- `PAYMOB_HMAC_SECRET` — required in prod, no fallback (C1).
- `REALTIME_JWT_SECRET` — dedicated realtime handshake secret (M2).
- `INTERNAL_API_SECRET` — dedicated server↔server bridge secret (M2).
- `CRON_SECRET` — guards `/api/v1/cron/[job]`; required in EVERY environment
  (endpoint fails closed / rejects all requests when unset, no bypass) (M7).

(Recommended once M3 lands: `REDIS_URL` for a shared rate-limit store across
instances, `TRUSTED_PROXY_HOPS` matching the deploy's proxy depth.)
