# Approved decisions 2026-07-18 (full text)

Moved verbatim from CLAUDE.md on 2026-09-27 to cut per-session tokens. History and measurements; the live rules are in CLAUDE.md and `.claude/rules/`.

## Approved decisions (2026-07-18)

The implementation roadmap is the 10-step order in
[docs/architecture/architecture-review.md](../architecture/architecture-review.md) §5 (Step 0 done).
Work stops after each step for review before the next begins.

> **TERMINOLOGY WARNING:** in this codebase `dashboard/admin` is the **CENTER**
> portal (role `center_admin`) — it stays in apps/erp, untouched. The app being
> extracted is the SUPER ADMIN platform portal (`dashboard/superadmin` +
> `/api/v1/admin/**`). The new app is named **`apps/superadmin`** — NOT
> `apps/admin` — to avoid confusion with the center portal.

1. **Back-office**: ONE internal app, `apps/superadmin`, hosting two staff roles:
   `super_admin` (full platform control — everything from `dashboard/superadmin`
   + `/api/v1/admin/**`) and `accountant` (`/dashboard/finance` +
   `/api/v1/finance/**` as a restricted portal; finance screens ONLY, enforced at
   the API layer, not just navigation). Its sign-in door (NextAuth
   `authorize()` then; better-auth + `login-policy.ts` since 2026-08-01)
   accepts only those two roles. Own subdomain + own cookie names, fully
   separated from erp sessions. apps/erp keeps only: center, teacher, parent,
   student, assistant.
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
