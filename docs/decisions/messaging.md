# Messaging (built 2026-07-22 — awaiting review)

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
`bun run build` both apps. Demo data: `prisma/messaging-demo-seed.ts`
(`--purge` to remove), two centers so isolation is visible in the preview.
