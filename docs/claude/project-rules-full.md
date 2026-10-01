# Project rules (full text of sections compressed in CLAUDE.md)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

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

## Binding invariants

Rules that hold across the whole product. Each was decided once, for a reason
written down in the linked file — read that file before changing anything it
governs. Violating one of these is never a local change.

**Money**

- **MONEY DIRECTION IS UNCHANGED BY WHO PAID.** A parent-funded subscription
  still moves `student -> center/teacher` (`fromEntityId = studentId`); who paid
  is recorded on `payments.payer_user_id` + `Subscription.createdBy`, never by
  redirecting the ledger. → [parent-pays-lesson](../decisions/parent-pays-lesson.md)
- **NO SECOND MONEY ENGINE.** Every new money path routes through the existing
  primitives (`createWalkInSubscription`, `distributeSessionRevenue`, the H2
  conditional decrement). → [external-teachers](../decisions/external-teachers.md)
- **ONE DERIVATION OF WHAT A LESSON IS WORTH** — `resolveLessonPrice`. The
  engine, the back-office preview and the www preview all call it. An unpriced
  lesson REFUSES to complete rather than settling zero.
  → [lesson-settlement](../decisions/lesson-settlement.md)
- **MONEY IN THE BACK-OFFICE APP MOVES ONLY THROUGH SANCTIONED CENTRE
  FUNCTIONS, AUDITED — it is not "read-only", and this sentence used to say it
  was.** Corrected 2026-09-06 (docs/security/security-audit-2026-09-06.md M-08) because the invariant as
  written was false and reviewers were relying on it: `apps/superadmin` DOES
  write money in exactly four places — `adminRecordPayment`, `adminTopUpWallet`,
  `adminCreateWalkInSubscription` (`center-money.ts`, each = `superadminAsCenter`
  + the SAME `*Tx` function the ERP counter runs + `writeAdminAudit`), and
  `refundLessonForStudent` (`POST /api/v1/finance/refunds`, the settled-lesson
  clawback that reaches teacher/centre wallets, `super_admin` only since M-08).
  What IS true at the database: `transactions`, `points_ledger`,
  `session_settlements`, and since migration 77 the three wallet ledgers are
  append-only for `edura_app`, and `payments` cannot be deleted — for
  `super_admin` too. No GRANT and no second DB role was added, and no back-office
  module reimplements a money primitive (NO SECOND MONEY ENGINE still holds).
  **QUALIFIED 2026-08-20 — read this before quoting the rule:** a `super_admin`
  CAN now move money, by using "view as" to become an ERP user inside the ERP
  app, under that user's own session. Ali chose that explicitly over the
  recommended "block money routes during view-as". The capability comes from the
  target's session in the other app, never from a money surface added to
  apps/superadmin. Every such write still carries its own ledger row and audit,
  and the session behind it carries `impersonated_by`.
  → [superadmin-center-oversight](../decisions/superadmin-center-oversight.md),
  [superadmin-view-as](../decisions/superadmin-view-as.md)
- **AN EXPORT RUNS THE SAME SERVICE FUNCTION THE SCREEN RUNS.** A report that
  re-derives its own totals is a second set of books.
  → [report-export](../decisions/report-export.md)
- **THE COUNTER BOARD WRITES NOTHING OF ITS OWN** — three reads; every commit
  goes through `counterCheckin` and the existing per-session subscription.
  → [counter-board](../decisions/counter-board.md)

**Child safety and identity**

- **DEFAULT-MINOR.** `isMinor()` is one POSITIVE adult condition:
  `adult = dateOfBirth AND dateOfBirthVerifiedAt AND age >= 18`. Missing,
  unverified, or under-18 all mean MINOR with parent oversight ACTIVE.
  → [messaging](../decisions/messaging.md)
- **CHILD-SAFETY GATE.** A MINOR with no guardian EMAIL has adult-facing
  messaging LOCKED (`chat-guardian.ts`, the single rule). A guardian PHONE does
  NOT satisfy it. The account is never suspended by this rule.
  → [email-invites-guardian](../decisions/email-invites-guardian.md)
- **THE STUDENT CODE CARRIES NO PERSONAL DATA.** Derived from a SHA-256 of the
  student's own profile id — never from initials, birth date or phone. The check
  character is the point: no single mistype and no adjacent transposition can
  produce a valid code. → [student-id-card](../decisions/student-id-card.md)
- **THE CARD QR MINTS NO SESSION.** `guardian_email_verification` and the card
  credential are deliberately ABSENT from `CLAIMABLE`; a signed URL proves
  authenticity and allows revocation, and grants nobody anything.
  → [student-card-qr](../decisions/student-card-qr.md),
  [guardian-email-verification](../decisions/guardian-email-verification.md)
- **ONE DEFINITION OF "THE SAME CHILD"** — `findStudentByKeys` /
  `normalizeNationalId`. No importer, counter or seed may hold a second one, and
  there is no "create anyway" flag. → [bulk-student-import](../decisions/bulk-student-import.md)

**Auth and authorization**

- **ONE SUSPENSION MECHANISM.** Accounts are disabled through `users.status`
  (+ the 3-level blacklist). better-auth's `banned` / `ban_reason` / `ban_expires`
  columns are never written and `auth.api.banUser` is never called.
  → [admin-user-directory](../decisions/admin-user-directory.md)
- **`sendResetPassword` IS DELIBERATELY NOT SET, in both apps.** better-auth's
  own reset writer does not bump `users.token_version` — the write that fires
  `users_revoke_sessions` — so wiring it would silently undo L1. Reset stays on
  `requestPasswordReset`. → [operational-layer](../decisions/operational-layer.md)
- **AN EXTERNAL TEACHER IS A `users` ROW, NOT A NEW ENTITY** (role `teacher`,
  `status='shell'`, `password_hash NULL`). No login is enforced by the door that
  already exists. → [external-teachers](../decisions/external-teachers.md)
- **"VIEW AS" IS A SECOND DOOR, NOT A HOLE IN THE FIRST.** `login-policy.ts` is
  untouched — a `super_admin` still cannot type their way into the ERP — and no
  back-office cookie ever crosses. What crosses is a signed, 60-second,
  single-target handoff token; the ERP re-reads the actor and the target and
  mints its OWN session. In-app impersonation takes back-office targets and
  refuses ERP roles; view-as takes ERP roles and refuses back-office ones —
  exactly one mechanism per target. The one-hour window is enforced from
  `auth_sessions.created_at`, NOT `expires_at`, which better-auth's rolling
  refresh extends out from under any short expiry (measured: 3600s written,
  2592000s read back). → [superadmin-view-as](../decisions/superadmin-view-as.md)
- **GLOBAL SEARCH ADDS NO REACH.** Every provider reads what the caller's role
  already reads through an existing route, under the same tier constant and the
  same tenancy — and offers nothing the role cannot open.
  → [global-search](../decisions/global-search.md)

**Design and delivery**

- **TOKENS ARE RE-POINTED, NOT RENAMED.** Values move; names stay, because they
  are generated inside `@theme` and read by hundreds of call sites.
  → [classical-ledger-redesign](../decisions/classical-ledger-redesign.md)
- **ON-DEMAND READS — a DEFAULT, not a law.** A screen must not spend a query on
  something the reader has not asked to see; but the primary thing a page exists
  for still loads with the page. → [student-card-qr](../decisions/student-card-qr.md)

## Stitch MCP design workflow (binding rules, added 2026-07-20)

The Stitch MCP (Google's design tool) is connected. **[SUPERSEDED 2026-09-27: the
server was removed; the restore command is in `.claude/rules/design-stitch.md`.]** When working with designs
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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- **[SUPERSEDED 2026-09-27 by `.claude/rules/graphify.md`: query the graph for
  unfamiliar areas; skip it when the exact file is known.]** **Start EVERY task here.** Before reading, grepping, or planning anything in this
  repo, orient with the graph first: run `graphify query "<the task in one
  sentence>"` as the first tool call of the task. Only fall through to Grep/Read
  after the graph has pointed at the files — or when you already know the exact
  file and line you need to edit or debug. This applies to feature work, bug
  fixes, reviews and questions alike, not only to "where is X" questions.
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- [2026-09-27: no wiki is generated in this repo.] If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Every session opens with a ~400-token orientation digest (graph size, god nodes,
  community hubs, and whether the graph is STALE vs `HEAD`), injected by the
  `SessionStart` hook in `.claude/settings.json` →
  `.claude/hooks/graphify-session-digest.sh`. The digest is deliberately NOT the
  whole `GRAPH_REPORT.md` — that file is ~2.8k lines (~35k tokens) and injecting
  it every session would cost far more than it saves. If the digest says STALE,
  run `graphify update .` before trusting any query result.
