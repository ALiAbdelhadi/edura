---
paths:
  - "apps/*/src/**"
  - "packages/*/src/**"
  - "packages/database/prisma/schema.prisma"
  - "docs/decisions/**"
---

## Descoped (not building)

Permanently dropped (2026-07-21). Do NOT build, scaffold, or re-add them; skip
them in any design or spec — their absence is intentional.

1. **AI bot / chatbot / AI assistant** — no support bot, academic bot, AI tutor,
   or any AI-assistant surface. The `chatbot_config` / `chatbot_faq` /
   `chatbot_conversations` tables stay inert: do NOT wire any AI logic to them;
   removing them is a DB migration that needs its own approved plan.
2. **Scholarships** — no entity, application flow, or UI.
3. **Bookstore** — no catalog, store, or purchase flow.
4. **Videos / video lessons** — no pre-recorded library, player, or upload
   surface. This does NOT touch "lessons" in the money/attendance sense — a
   `lesson` = a live class `Session` (the fee/points/attendance engine), which is
   core and untouched.

## Deferred (revisit later)

Paused, not killed. Do NOT build now or keep placeholder UI; revisit only when
explicitly requested with business rules defined.

1. **Debt / credit (pay-later)** — deferred 2026-07-21 as high-risk money
   functionality until the rules exist (who grants debt, limits, repayment,
   interest). The wallet is the foundation if/when it is built. The accounting
   `credit`/`debit` ledger entries are the double-entry money engine, NOT this
   feature. Skip any pay-later / installments / "بالأجل" surface in a design.

## Post-launch improvements (do NOT implement now)

1. **Next.js 16 rendering + caching pass** — measured, one batch at a time.
   **HARD CONSTRAINTS:** never cache money, wallet balances, subscriptions,
   attendance, messaging, auth/session, or any per-user or stateful data —
   those stay dynamic and fresh every request.

## Approved decisions (2026-07-18) — items

The roadmap is the 10-step order in
[architecture-review](../../docs/architecture/architecture-review.md) §5; work stops
after each step for review.

1. Back-office: `apps/superadmin`, roles `super_admin` + `accountant` (finance
   only, enforced at the API); own door, subdomain and cookies. apps/erp keeps
   center, teacher, parent, student, assistant.
2. Subscriptions: MONTHLY (manual renewal) and PER-SESSION pass, enabled and
   priced per course. Subscription WRAPS enrollment. Counter takes cash for one
   session + check-in in ONE step. Teacher-direct courses: nullable
   `Course.centerId`, no shadow centers.
3. Collaboration requests REPLACE `ClassroomBooking` and absorb the affiliation
   invite; they carry `proposedCenterShare`.
4. Attendance: per-teacher mode, default `counter_only`; door check-in by the
   teacher's assistant. Counter-without-door in `counter_and_door` mode does NOT
   count as present.
5. WhatsApp: Meta Cloud API behind an abstraction + mock mode; no OTP yet.
6. `is_demo` on root entities only (users, centers, courses); quick-login gated
   behind `NODE_ENV !== "production"`; all non-seed data wiped before launch.
7. Paymob: card iframe + mobile wallets only; mock-first.
8. Schema drift: done (Step 0).
9. Assistants: exactly ONE teacher per assistant (partial unique on
   `assistantId` where `removedAt IS NULL`); delegation = everything EXCEPT
   wallet/payouts/financial settings and managing other assistants; every action
   audited "assistant X on behalf of teacher Y".
10. Superadmin auto-CRUD + custom screens, audit-log viewer, dashboard counters.
11. Paymob foundation done; cash mirrors to the Transaction ledger since Step 4.

Full text → [approved-decisions](../../docs/claude/approved-decisions.md)

## Shipped work — awaiting review

Full write-ups live in `docs/decisions/`. Each records what was built, why the
alternative was rejected, its proofs, and what was deliberately NOT done. Read
the relevant one before touching the system it describes — the reasoning is the
point, not the changelog.

| Decision | What it covers |
|---|---|
| [messaging](../../docs/decisions/messaging.md) | Relationship-scoped messaging, one authorization module, parent oversight |
| [team-notes](../../docs/decisions/team-notes.md) | Internal to-do board for center staff / teacher assistants |
| [superadmin-center-oversight](../../docs/decisions/superadmin-center-oversight.md) | Cross-center read visibility + six audited control ops |
| [email-invites-guardian](../../docs/decisions/email-invites-guardian.md) | Email-first invites, one claim kernel, guardian contact |
| [parent-pays-lesson](../../docs/decisions/parent-pays-lesson.md) | Parent activates and pays for a child's lesson; parent wallet |
| [admin-user-directory](../../docs/decisions/admin-user-directory.md) | Platform user directory + audited admin actions, bounded impersonation |
| [better-auth-migration](../../docs/decisions/better-auth-migration.md) | next-auth → better-auth 1.6.25, DB sessions, hard revocation, 2FA |
| [operational-layer](../../docs/decisions/operational-layer.md) | Notifications, Sentry/PostHog, health checks, backups |
| [student-id-card](../../docs/decisions/student-id-card.md) | Student ID card + student code v2 (check character, guilloché) |
| [student-card-qr](../../docs/decisions/student-card-qr.md) | The card QR as a signed credential; tiered scan page; on-demand reads |
| [external-teachers](../../docs/decisions/external-teachers.md) | Off-system teachers a center runs by manual entry |
| [classical-ledger-redesign](../../docs/decisions/classical-ledger-redesign.md) | The "Classical Ledger" visual language + the five role pages |
| [counter-board](../../docs/decisions/counter-board.md) | The counter board — the center's first screen |
| [lesson-settlement](../../docs/decisions/lesson-settlement.md) | Settlement trigger, price and basis; `settlement_basis` |
| [bulk-student-import](../../docs/decisions/bulk-student-import.md) | CSV roster import, per-row transactions, dry run |
| [report-export](../../docs/decisions/report-export.md) | Report export — CSV and the print route |
| [weekly-center-digest](../../docs/decisions/weekly-center-digest.md) | The owner's Monday email; idempotency as an audit row |
| [guardian-email-verification](../../docs/decisions/guardian-email-verification.md) | Proving a guardian address without minting a session |
| [showcase-is-public-site](../../docs/decisions/showcase-is-public-site.md) | showcase = the public site, www = the app (HISTORY — apps/showcase deleted 2026-08-18; www is now the marketing site, apps/erp is the app) |
| [global-search](../../docs/decisions/global-search.md) | The ⌘K palette finds records, in both apps |
| [sidebar-ia](../../docs/decisions/sidebar-ia.md) | Sidebar information architecture across all 8 portals |
| [typescript-7-next-16](../../docs/decisions/typescript-7-next-16.md) | TypeScript 7 + Next.js 16.3 upgrade (two TypeScripts on purpose) |
| [portal-design-pass](../../docs/decisions/portal-design-pass.md) | Defect pass across student/parent/teacher/center portals |
| [lesson-times-12h](../../docs/decisions/lesson-times-12h.md) | 12-hour clock with the day period in words |
| [superadmin-view-as](../../docs/decisions/superadmin-view-as.md) | The back office reaches every ERP role via a signed handoff; the money qualifier |
| [parent-portal-dedup](../../docs/decisions/parent-portal-dedup.md) | Parent portal de-duplication (no capability removed) |
| [self-service-corrections](../../docs/decisions/self-service-corrections.md) | Login email, guardian contact and academic answers stop being write-once |
| [student-portal-dedup](../../docs/decisions/student-portal-dedup.md) | Student portal de-duplication (no capability removed) |
| [course-delivery-and-teacher-day](../../docs/decisions/course-delivery-and-teacher-day.md) | Course `delivery_mode` (onsite/online/hybrid) + "find a teacher by day"; the meeting link as a paid credential |
| [server-side-portal-gate](../../docs/decisions/server-side-portal-gate.md) | The portal/onboarding gate moved from the browser to the server |
| [public-handles](../../docs/decisions/public-handles.md) | One public name per centre/teacher (`/p/[handle]` today, `<handle>.<root>` when the domain exists); status-gated public page; auth never on a subdomain |
| [money-day-boundary](../../docs/decisions/money-day-boundary.md) | The day boundary for money is Cairo everywhere; the counter and the books had disagreed (UTC vs Cairo) |
| [attendance-reopen-settlement](../../docs/decisions/attendance-reopen-settlement.md) | T-9: the attendance edit window yields to an unsettled lesson |
| [backend-separation](../../docs/decisions/backend-separation.md) | Backend moves out of the Next apps into Bun + Hono services (`apps/api`, `apps/admin-api`); phase 1 put every service in `packages/server-core` (Next-free); phase 3 moved every ERP route to `apps/api`; phase 4 made `apps/erp` frontend-only (no route files, lint-enforced, unconditional rewrites); phase 5 did the same for `apps/superadmin` → `apps/admin-api`, on the shared `@repo/service-kit` host |
