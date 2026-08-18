# Superadmin center oversight (built 2026-07-25 — awaiting review)

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

   > **AMENDED 2026-08-01 (Ali) — the CENTER now prices its own hall's
   > per-attending-student rate.** Rationale: the center owns the hall. This
   > splits the two numbers that used to be lumped together as "superadmin-only
   > money config":
   > - **whole-room revenue split %** (platform/teacher/center) — UNCHANGED,
   >   still superadmin-only. That is the platform's cut.
   > - **per-attending-student rate** (`center_per_student_fee|bp`) — the
   >   center may now set it for its OWN halls, **bounded by the platform's
   >   published rate (center > global), which is the CEILING**. The bound is
   >   not optional politeness: a per-student-only hall deliberately shows NO
   >   price to the teacher at booking (the cost depends on attendance), so an
   >   unbounded center-set rate would take a share the teacher never saw and
   >   only discovers at settlement. The center must also quote in the SAME
   >   form the platform published (piasters vs basis points are not comparable
   >   without a lesson price). The superadmin is NOT bounded — it sets the
   >   ceiling.
   >
   > One implementation in `@repo/server-core/services/rooms/room-rate.ts`
   > (shape rules, row layout, ceiling, ownership, audit); apps/superadmin
   > re-exports the primitives so the two writers cannot drift, and the ONLY
   > difference between them is the ceiling. The center writes through
   > `POST/PATCH /api/v1/rooms` in the same transaction as the hall itself.
   > Every center-set rate writes an `m2_rate.room.updated` audit row attributed
   > to the center actor. Snapshot-on-create still holds: changing a hall's rate
   > never re-prices an existing course. Proof: room-pricing-methods **73/73**
   > (VP10).
   >
   > **The teacher SEES the rate at booking (added same day).** The asymmetry
   > the ceiling only bounded is now closed: `GET /api/v1/centers/[id]/rooms`
   > returns each hall's effective per-student rate (resolved room > center >
   > global by `resolveMethod2RatesForRooms`, one query for all halls), and the
   > collaboration panel shows it ON THE HALL CARD — so halls are compared on
   > it, not just confirmed after picking — plus an explicit line at the moment
   > the per-student method is chosen. `source` (room/center/global) is NOT
   > exposed: the teacher needs the number, not where the center got it. The
   > whole-room split % is still never sent to a teacher. A per-student-only
   > hall still hides its whole-room `price` (meaningless there) — the rate is
   > now what it shows instead. Proof: VP11 asserts the picker's batch resolver
   > returns exactly what the per-room resolver (the settlement engine) returns
   > at every precedence state, so a hall can never be quoted a price it does
   > not settle at.
   >
   > Demo data: `prisma/room-rate-demo-seed.ts` (`bun run seed:roomrate-demo`,
   > `--purge` to remove) — two centers whose six halls cover every state
   > (own rate under the cap / at the cap / inheriting / no per-student method),
   > one of them carrying a CENTER-level cap so `center > global` is visible,
   > plus a teacher to browse them. Zero money rows; the GLOBAL rate is
   > platform config, so the seed creates it only when missing and never
   > overwrites one you set.
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
callbacks + real DB role). Regressions green: `bun run check-types` 5/5, `bun run
build` both apps, www unit 111 pass/1 skip, rbac-isolation 11/11, h04 44/44,
c03 www 26/26 + superadmin 15/15, c04 72/72 + 26/26, messaging-scope 87/87,
center-staff-delegation 55/55, l1 12/12, refund 13/13, h2 7/7, h3 6/6,
room-pricing-methods 47/47, center-share-admin 11/11. Demo data:
`prisma/center-oversight-demo-seed.ts` (`--purge` to remove) — two centers, and
**zero money rows** (per the Conventions rule), so the Finance tab is
legitimately empty for demo centers.
