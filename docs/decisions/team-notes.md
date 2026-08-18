# Team notes (built 2026-07-27 — awaiting review)

Internal to-do board for ONE team — center owner + center_staff, or teacher +
assistants — with status (open/done/declined), pinning, read receipts, and
notifications. Approved 2026-07-27; fills the deliberate staff↔staff /
assistant↔assistant hole WITHOUT touching the messaging matrix (chat-scope
EDGES unchanged — notes are non-conversational, every participant is an adult
staff role, so none of the child-safety machinery applies).

1. **Schema**: `team_notes` (nullable `center_id` XOR `teacher_id`, DB CHECK
   `team_notes_exactly_one_scope`; center rows RLS tenant-isolated like
   `center_staff`, teacher rows app-guarded like `teacher_assistants`) +
   `team_note_reads` (note_id+user_id unique; no center_id — reached only
   through an already-authorized note). Migrations
   `20260727100000_team_note_notification_types` (isolated enum ADD VALUEs:
   `team_note_created`, `team_note_status_changed`) and
   `20260727100100_team_notes`. **[dev + test, applied 2026-07-27] — 38
   migrations. [production, applied 2026-08-02] — production is no longer
   behind; it now stands at 43 migrations, verify-db 25/25.**
2. **Membership IS the gate.** One route pair (`/api/v1/team-notes`,
   `/team-notes/[id]`) wrapped in `delegatedWithCenter(..., {staffAllow: ALL
   three sub-roles})`: the wrappers' live-link resolution already proves team
   membership, and staff mutations get the on-behalf-of audit row for free.
   Authors write as THEMSELVES (caller id) — no impersonation, same principle
   as messaging.
3. **Read receipts on GET, deliberately**: listing the board IS the read
   (idempotent upsert), so the read-only `center_accountant` — whose mutations
   the method gate rejects and who gets `me.canWrite=false` (composer hidden)
   — still registers as having read. Each note shows "قرأها n/total — names".
4. **To-do semantics**: ANY team member flips status (open→done/declined or
   reopen); the author is notified when someone ELSE flips theirs, never on a
   self-flip. Body edit = author only. Pin/delete = author or LEAD (center:
   owner/manager; teacher side: teacher AND assistant per Step 8 full
   delegation; receptionist is a member, not a lead). Soft-delete only.
5. **Notifications**: two new `notification_type` values, CHANNEL_MATRIX rows
   in-app+push only, fanout resolvers `resolveCenterTeamPeers` /
   `resolveTeacherTeamPeers` in @repo/server-core (revocation-aware — a
   soft-removed member drops out of the fanout immediately, proven). Deep link
   `${portal}/notes` in the notifications screen. Side fix: the notifications
   screen's deep-link base now derives from the pathname (the old `params.role`
   read didn't exist on the fixed portal folders and always fell back to
   "student", mislinking staff/assistant/admin deep links).
6. **UI**: `TeamNotesBoard` (full + `compact`) — status-themed cards (done =
   success + strikethrough, declined = destructive + strikethrough), pinned
   first. Full board at `/dashboard/{admin,staff,teacher,assistant}/notes` +
   nav items; compact panel on the staff home, center-admin dashboard, and
   ABOVE the chat on the assistant home. i18n `teamNotes.*` ar/en.
7. Proof: `apps/www/tests/db/team-notes.test.ts` **47/47** (live DB, real
   center-actor + real resolveActingTeacher + real service; includes raw-RLS
   cross-center peek and the CHECK rejections). Regressions green: root
   check-types 6/6, www unit 111 pass/1 skip, rbac-isolation 11/11,
   center-staff-delegation 55/55, messaging-scope 87/87, l1 12/12, `bun run
   build` both apps. Demo data: `prisma/team-notes-demo-seed.ts`
   (`bun run seed:teamnotes-demo`, `--purge` to remove) — one center team + one
   teacher team, all states visible, zero money rows. Verified live in the
   browser on dev (staff home panel + full board, create + fanout rows).
