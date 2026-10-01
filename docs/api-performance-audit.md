# API performance and infrastructure-cost audit — 2026-09-27

Scope: every HTTP endpoint and every data-fetching screen in `apps/erp` and
`apps/superadmin`, plus the database layer they share. Goal: fewer requests,
fewer queries and fewer round trips per request, at the lowest hosting and
database cost, without changing money, auth or child-safety behaviour.

Environment: everything below was measured or verified against the **local test
database** (`edura-env:test`, `localhost:5432/edura_test`). Nothing was applied to
dev (`ep-withered-field-b23csnyq`), Neon test (`ep-morning-snow-b269im2n`) or
production (`ep-mute-rice-b2s8gg42`). See "Pre-deploy steps".

The full endpoint inventory (method, route, handler, auth, queries per request,
callers, trigger frequency, shared vs user-specific) is in
[api-performance-audit-inventory.md](api-performance-audit-inventory.md).

Earlier reports this builds on (not repeated here):
`docs/reports/api-modernization-audit.md`,
`docs/reports/rendering-optimization-plan.md`,
`docs/reports/load-test-2026-09-20.md`.

---

## 1. Project summary

| Part | What it is |
|---|---|
| `apps/erp` | Next 16 App Router, client-rendered SPA (every page `"use client"`), 243 route handlers under `/api/v1`, all `force-dynamic`. Four roles: center, teacher, parent, student (+ assistants, center staff). |
| `apps/superadmin` | Same stack, 211 route handlers, 2 staff roles (super admin, accountant). Very low traffic. |
| `apps/www` | Marketing site. Out of scope. |
| `apps/realtime` | Socket.IO on Railway (chat fan-out). Out of scope. |
| Client data layer | Refine v5 over TanStack Query, `ky`. Global defaults: `staleTime 0`, refetch on mount and on window focus — deliberate, for live money/attendance. Opt-in presets in `packages/client-core/src/refine/freshness.ts` (`reference` 5 min, `discovery` 60 s, `list` 30 s), guarded by `tests/unit/query-freshness-scope.test.ts`. |
| Database | Postgres on Neon (eu-central-1), Prisma 7 with the Neon WebSocket adapter in production. Row-level security through `scopedDb` / `platformDb`: every call is an interactive transaction (`BEGIN` + `set_config` + N statements + `COMMIT` = N+3 round trips). |
| Cache | Next `"use cache"` already covers public data (catalog, discovery, public profiles), with cross-app invalidation through `/api/v1/internal/revalidate`. Redis (`ioredis`, `REDIS_URL`) is used only by the rate limiter. |
| Media | Cloudinary, deterministic public ids, served from Cloudinary's CDN (already optimal). |
| Jobs | Vercel cron → `apps/erp/src/lib/services/cron/jobs.ts`. Post-response work through `after()` (`lib/http/after.ts` `runAfter`). |
| Tests | Vitest unit suites; DB suites via `run-db-suites.ts` against a guarded test DB. |
| External clients | None. No mobile app or third-party consumer exists in or outside the repo, so the web apps are the only API clients. All changes still keep the API backward compatible (new params optional). |

---

## 2. Top problems, ranked by cost

1. **Vercel functions ran in the wrong region.** `vercel.json` pinned no region
   (default `iad1`, US-East) while the database is in Frankfurt. A typical request
   makes ~14 database round trips, each ~90 ms across the Atlantic: **~1.2–1.3 s of
   pure DB wait per request**, against ~15–30 ms in `fra1`. This outweighs every
   other finding combined. Fixed (`regions: ["fra1"]`), which is also the closest
   region to Egypt.
2. **Fixed per-request transaction overhead.** Every `scopedDb` call costs 3 extra
   round trips; a GET spends ~5 round trips before the handler runs (9 for
   assistants/staff). Partly fixed by merging sibling transactions (`/me`, team
   notes, student dashboard). The remaining structural fixes touch auth and are
   listed under "Needs a decision".
3. **N+1 query loops on hot paths:** attendance bulk marking (43 round trips for a
   class of 40), offline attendance sync (~3 per record), teacher-dashboard
   counter-only probe (N HTTP requests × 2 transactions), roster teachers
   (2 per teacher), chat oversight (up to 4 per child), broadcast / parent
   fallback (1 per student), session generation conflict checks (1–2 per date),
   cron reminders (500–6000 transactions per run). All fixed.
4. **Unbounded reads:** `GET /sessions` returned every session ever for student
   dashboards, schedules and parent next-lesson; students' grade lists loaded the
   whole class's scores. Fixed with date windows and an optional `limit`.
5. **Client refetch amplification:** duplicate queries for the same data under
   different keys (`/me`, `me/children`, pending enrollment requests), a second
   list fetch after every mutation, `invalidates: ["all"]` refetching every active
   query, un-debounced search, dialog data loaded on page mount. Fixed.
6. **Notification work on the response path:** chat messages, reports, grade
   entry and attendance sync waited for in-app inserts, contact lookups and
   FCM/web-push before responding. Moved after the response (`runAfter` +
   `notifyAfterCommit`).
7. **Missing indexes** for the queries above (notifications, audit logs,
   subscriptions, attendance, payments, wallet ledgers, sessions, grades).
   Added as one additive migration.
8. **Pool size ignored in production.** `DATABASE_POOL_MAX` only applied to the
   `pg` driver; the Neon pool used the default (10 connections, 10 s idle), so
   warm instances kept dropping sockets. Fixed.

---

## 3. Findings table

Impact = effect on DB load / requests / latency. Effort and Risk: S / M / L.
Status: ✅ done in this pass · ⏸ needs Ali's decision · 📝 documented only.

| Endpoint / Screen | Problem | Fix | Impact | Effort | Risk | Status |
|---|---|---|---|---|---|---|
| All erp + superadmin functions | Default region iad1, DB in Frankfurt | `"regions": ["fra1"]` in both `vercel.json` | ~1.2 s → ~20 ms DB wait per request | S | S | ✅ |
| DB client (Neon driver) | `DATABASE_POOL_MAX` ignored; 10 s idle | `max` from env, `idleTimeoutMillis: 30000` | Fewer socket re-handshakes on warm instances | S | S | ✅ |
| `POST attendance/bulk` (`bulkMarkAttendanceTx`) | Per-row upsert | 1 read + `createMany(skipDuplicates)` + 1 `updateMany` per status; per-row fallback on a short count | Class of 40: 43 → 5–8 round trips | M | M | ✅ |
| `POST attendance/sync` (offline outbox) | ~3 queries per record; session locks in input order (deadlock between two syncs) | IN-preloads, session locks taken in sorted id order before the loop, one `createMany`; notify after commit | 100 records: ~303 → ~k+6 round trips | M | M | ✅ |
| Teacher dashboard | `CounterOnlyProbe` = 1 HTTP request per today's session | `counterOnlyToday` in the dashboard payload | HTTP per mount 5+N → 5 | S | S | ✅ |
| `getTeacherDashboard`, `getAdminDashboard`, student dashboard route | 2 attendance counts over all history | One `groupBy status` | −1 query each | S | S | ✅ |
| `GET dashboards/student` | 2 transactions | Grade trend runs in the same transaction; independent reads in `Promise.all` | 2 tx → 1 tx (−3 round trips) | S | S | ✅ |
| `getAdminDashboard` | Returned full `todaySessions` rows | `todaySessionCount` | Smaller payload, cheaper query | S | S | ✅ |
| `GET /sessions` (student dashboard, schedule, parent next lesson) | All sessions ever; duplicated enrollment query | `from`/`to` window + optional `limit` (≤ 500); dropped the duplicate query | Rows: all history → one week / from today; enrollment queries 2 → 1 | S | S | ✅ |
| Parent next-lesson card | Enrollments list + sessions list | Sessions by `studentId` (server scopes to the child) | HTTP per mount 2 → 1 | S | S | ✅ |
| `listRosterTeachers` (center + superadmin) | 2 queries per teacher | One course query + one review `groupBy` | 3+2N → 5 | S | S | ✅ |
| `GET grades` (student/parent) | Loaded the whole class's scores, filtered in JS | Include only the child's scores | Rows ÷ class size | S | S | ✅ |
| `POST grades/scores` | ~3 transactions per student for notifications, inline | One batched parent lookup, after the response | Response path: 1 + ~3N tx → 1 tx | S | S | ✅ |
| `PATCH notifications/[id]/read` | Read then update | One scoped `update`; P2025 → 404 | 2 → 1 | S | S | ✅ |
| `GET team-notes` | 2 transactions; unbounded | One transaction; cap 500 (pinned, then newest) | 2 tx → 1 tx | S | S | ✅ |
| `GET materials` | Full rows incl. storage URLs | 10-field select | Smaller payload; storage URLs no longer in the list | S | S | ✅ |
| `GET /courses` (signed-out browse) | Unauthenticated, unbounded, not rate limited | 60/min per IP (same as `/search/courses`), `take: 500` | Abuse ceiling on a public endpoint | S | S | ✅ |
| `GET /me` (assistant) | 3 transactions | 1 transaction, same auth checks | 3 tx → 1 tx | S | M | ✅ |
| Session generator (course create, collaboration accept) | Conflict query per occurrence | One range query + per-day bucketing | 1+N → 2 (3 with clashes) | M | M | ✅ |
| Chat oversight (`listOversightChildren`) | Up to 4 queries per child | Batched; minor status from the single `minorStudentIds` rule | 2+4N → ≤ 5 | M | M | ✅ |
| Chat contacts (`listContacts`) | Same edge lookup repeated per call | Per-call memo, never on the `assertCanReach` / `narrowTo` path | Parent: ~20 → 17 queries per search | S | M | ✅ |
| Chat send / group post / report | Notifications inline on the response path | `runAfter(() => notifyAfterCommit(...))` | Response path loses all notification work | S | S | ✅ |
| `POST notifications/broadcast`, superadmin `adminBroadcast` | Parent fallback 1 query per student | `withParentFallbackMany` (IN, chunked) | 1+N → 2 | S | S | ✅ |
| `me/unread-counts` (no current caller) | 2 aggregates per child | 2 `groupBy` | 2N → 2 | S | S | ✅ |
| Cron: lesson reminders | 500 transactions | 1 enrollment query | 500 → 1 | S | S | ✅ |
| Cron: renewal reminders | Dedupe per enrollment | One `notification.findMany` + one course query per bucket | ~6000 → 3 tx | M | S | ✅ |
| Cron: weekly digest | Centers one at a time; one failure stops the run | Concurrency 4, errors per center | Wall time ÷ ~4, isolated failures | S | S | ✅ |
| Find-teacher screen | 1 request per keystroke | 250 ms debounce | ~1 request per pause | S | S | ✅ |
| Admin fees screen | Dialog pickers loaded on mount and focus | Load only while a dialog is open | Mount 10 → 8, focus 10 → 8 | S | S | ✅ |
| Settings, assistant strip, teacher classes | Second `/me` fetch under a different key | Read `useGetIdentity` | Mount 1 → 0, focus 2 → 1 | S | S | ✅ |
| Admin students + shell badge | Pending requests fetched twice under different keys | Same key + `list` preset | Mount 2 → 0–1 | S | S | ✅ |
| Parent wallet | `me/children` fetched twice | Share the shell's query | Mount 1 → 0 | S | S | ✅ |
| 7 screens with mutations | Refetch after Refine already invalidated | Removed the extra `refetch()` | 2 → 1 fetch per mutation | S | S | ✅ |
| Teacher affiliations | `invalidates: ["all"]` refetched every active query | `["list"]` | Every mutation stops refetching badges/counts | S | S | ✅ |
| 10 non-money list screens | Refetch on every focus | `list` preset (30 s) | −1 request per focus each | S | S | ✅ |
| 13 query shapes | No supporting index | Migration `20260927120000_performance_indexes` | Index scans instead of seq scans as tables grow | S | S | ✅ |
| Every request | Session read = 2 round trips (`relationJoins` off) | Enable `relationJoins` preview | −1 round trip on every API call | S | M | ⏸ |
| Assistant / staff requests | Actor lookup in its own transaction (+3 round trips) | Fold into the handler's transaction | −3 round trips per staff request | M | M (authz) | ⏸ |
| Admin dashboard | 7 parallel transactions (7 of 10 pool slots) | Merge into 1–2 transactions | Pool pressure ↓, page slightly slower | M | M | ⏸ |
| `countFeeDefaulters` | All active enrollments × all-time payments | Period bound or compute-on-write rollup | Large on big centers | M | H (money) | ⏸ |
| `GET payments` (money list), enrollments, enrollment-requests, `me/attendance` | Ignore `page`/`pageSize` | Honour paging with a documented default | Bounded payloads | M | M (money list) | ⏸ |
| Month-end statements cron | Per-center sequential money reads | Batch reads | Cron time only | M | H (money) | ⏸ |
| Wallet history | `transactions` OR on from/to entity | Index P2 + query rewrite | Faster wallet screens | M | H (money) | ⏸ |
| Superadmin finance dashboard / center finance summary | Full-history scans on every visit | Period default or rollup | 2 users; low | M | H (money) | ⏸ |
| `createCollaborationRequestTx` | Awaits `resolveCenterAdmins` (own tx) inside a tx — pool deadlock class | Pass `tx` through | Removes a deadlock under load | S | M | ⏸ |
| `POST notifications/broadcast` | `notify()` itself still inline | Split `notify.ts` into persist (inline) + dispatch (after) | Broadcast latency | M | M | ⏸ |
| Superadmin: `sendInvoiceEmail`, `adminBroadcast` | SMTP / fan-out inline | `runAfter` | Latency, 2 users | S | S | 📝 |
| Superadmin global search | Centers `ILIKE` without trigram index | `pg_trgm` GIN index | 2 users; low | S | S | 📝 |
| `GET enrollment-requests`, `GET team-notes` | Writes inside a GET | Move to explicit POST | Correctness/caching hygiene | M | M | 📝 |
| Notifications | `read` flag and `readAt` both exist | Pick one | Correctness, not load | M | M | 📝 |
| All private GETs | No ETag | Private weak ETag → 304 | Bandwidth only; DB work unchanged | M | S | 📝 |

---

## 4. Caching decision (Redis and HTTP)

**No new shared Redis cache in this pass.** Reasons:

- Everything public and shared (education catalog, discovery, public teacher and
  center profiles, public course pages) is already cached by Next `"use cache"`
  with tag invalidation from both apps.
- Everything hot that is left is per-user or per-tenant money, wallets,
  subscriptions, attendance, messaging or notifications. The repo's binding rule
  forbids caching those, and so does this task's own constraint.
- Superadmin has two users; a cache there saves nothing measurable.

Adding Redis where it does not remove load would add a dependency, an
invalidation surface and a failure mode for no gain. The two candidates below are
designed so they can be built when traffic justifies it.

### Candidate A — Redis-backed Next cache handler (shared, public data only)

Replace the in-memory per-instance `"use cache"` store with a Redis handler so
all Vercel instances share one copy.

| Item | Value |
|---|---|
| Keys | `edura:next-cache:v1:<cache-key>` (Next's own key), tags as `edura:next-tag:v1:<tag>` → set of keys |
| Data | Only what is already under `"use cache"`: `catalog`, `discovery`, `public-profile:<handle>`, `public-course:<id>` |
| TTL | Unchanged from the `cacheLife` profiles in code (catalog: hours; discovery/public profiles: minutes) |
| Invalidation | Existing `revalidateTag` calls and `/api/v1/internal/revalidate` delete the tag's key set |
| Stampede | Next dedupes concurrent fills per instance; across instances use `SET key val NX PX 10000` as a fill lock and serve stale while one instance refills |
| Fallback | Handler catches every Redis error and falls through to the in-memory store, which falls through to the DB |
| Env | Reuse `REDIS_URL`; add `CACHE_REDIS_DISABLED=1` as a kill switch |

### Candidate B — per-tenant memo for non-money reference data

Only for center-scoped data that changes rarely and is not money, attendance or
personal: halls/rooms list, subject list per center, center profile header.

| Item | Value |
|---|---|
| Keys | `edura:t:<centerId>:rooms:v1`, `edura:t:<centerId>:subjects:v1`, `edura:t:<centerId>:profile:v1` — always scoped by the tenant id taken from the authenticated session, never from the request |
| TTL | 300 s |
| Invalidation | Delete the key in the same service function that writes the row, after commit |
| Stampede | `SET NX` fill lock + 50 ms retry, then fall through to the DB |
| Fallback | Any Redis error → read from the DB |
| Never | Wallets, balances, payments, subscriptions, attendance, grades, messages, notifications, anything keyed by user |

### HTTP caching

- Public GETs already cached by Next can send `Cache-Control: public,
  s-maxage=60, stale-while-revalidate=300` at the edge; they already go through
  `"use cache"`, so the win is small.
- Private GETs: a weak ETag computed from the response body only saves
  bandwidth; the DB work still runs. Low priority.
- Compression is already on (Vercel edge gzip/brotli).

---

## 5. Measured before / after

Counts come from code paths and unit tests that assert query counts
(`attendance-batch-writes`, `n1-batch3-reads`, `messaging-batching`,
`cron-jobs-batching`, `sessions-route-window`, `dashboards-*`). Round-trip counts
include `BEGIN` / `set_config` / `COMMIT`.

| Path | Before | After |
|---|---|---|
| DB wait per typical request (region) | ~1.2–1.3 s (iad1 → Frankfurt) | ~15–30 ms (fra1) |
| Mark attendance, class of 40 | 43 round trips | 5–8 |
| Offline sync, 100 records | ~303 + k | k + 6 |
| Teacher dashboard mount, N sessions today | 5 + N HTTP, +2N transactions | 5 HTTP |
| Student dashboard route | 2 transactions, 13–14 statements | 1 transaction, 12–13 statements |
| Parent next-lesson card | 2 HTTP, all sessions of all children | 1 HTTP, one child from today |
| Roster teachers, N teachers | 3 + 2N queries | 5 |
| Chat oversight, N children | 2 + up to 4N queries | ≤ 5 |
| Broadcast parent fallback, N students | 1 + N | 2 |
| Session generation, N dates | 1 + N (up to 2N) | 2 (3 with clashes) |
| Grade entry, N students (response path) | 1 + ~3N transactions | 1 |
| `/me` for assistants | 3 transactions | 1 |
| Notification mark-read | 2 queries | 1 |
| Cron lesson reminders | ~500 transactions | 1 query |
| Cron renewal reminders | ~6000 transactions | 3 |
| Admin fees screen mount / focus | 10 / 10 requests | 8 / 8 |
| Settings screen mount / focus | 1 / 2 `/me` requests | 0 / 1 |
| Any mutation on 7 screens | 2 list fetches | 1 |
| Teacher affiliations mutation | every active query refetched | its own list only |
| Find-teacher typing "محمد" | 4 requests | 1 |

Test results after all batches (local, `edura-env:test`):

- `check-types`: erp, superadmin, server-core, database, client-core — pass.
- Unit: erp 126 files, 1676 passed, 1 skipped (baseline 120 files, 1644 passed);
  superadmin 16 files, 175 passed.
- DB suites covering every changed query: erp 22 suites, 619 assertions, 0 failed;
  superadmin 7 suites, 223 assertions, 0 failed.
- Independent review of the whole diff: 0 bugs, 3 low risks, all fixed and
  re-tested (oversight count cap, course cap for signed-in callers, lock order).
- `next build` for erp and superadmin: pass.
- Migration: applied to the local test DB; `verify-db.ts` 0 FAIL, 82 migrations;
  `prisma migrate diff` shows no new drift.

---

## 6. Product changes

Visible or contract-level changes made in this pass:

1. **Teacher dashboard:** the "counter check-in only" tile now comes from the
   dashboard payload (`counterOnlyToday`) instead of one probe per session. Same
   number, one request.
2. **Admin dashboard payload:** `todaySessions` (full rows) replaced by
   `todaySessionCount`. Its only reader, `admin-dashboard.tsx`, was updated.
3. **Schedule screen:** loads one week at a time; moving to another week fetches
   that week.
4. **Student dashboard and parent next-lesson:** show sessions from today onward
   (up to 50) instead of loading all history.
5. **`GET /sessions`:** new optional `limit` (max 500). `from`/`to` were already
   supported. Callers that send neither get the same result as before.
6. **Team notes:** a board shows and marks as seen at most 500 notes (pinned
   first, then newest).
7. **Materials list:** no longer includes `cloudinaryPublicId`, `cloudinaryUrl`,
   `externalUrl`. Downloads still go through `/materials/[id]/download`, which
   checks access. No screen read those fields.
8. **Signed-out course browse:** rate limited to 60 requests/min per IP, capped
   at 500 courses; may now return 429. Signed-in callers are neither limited nor
   capped.
9. **Notifications for chat messages, reports, grades and offline attendance
   sync** are sent right after the response instead of before it. A notification
   failure is now logged instead of failing a request whose data was already
   saved (attendance sync previously returned 500 after saving).
10. **Find a teacher:** search runs after a 250 ms pause in typing.
11. **Admin fees:** the student/course pickers load when a payment or
    subscription dialog opens (a brief loading state in the dialog).
12. **Settings:** if `/me` fails, the screen shows its load-error panel.
13. **List screens with the 30 s `list` preset** (audit log, enrollment requests,
    rooms, collaboration requests, recent attendance cards, center profile, profile
    image, parent links, gradebook) no longer refetch on every window focus
    within 30 s. They still refetch after any mutation on the same resource.

---

## 7. Implementation order and batches

Commits were not made by Claude (repo rule: Ali runs git). One suggested commit
per batch, in this order:

| # | Batch | Files |
|---|---|---|
| 0 | Infra: region + pool | `apps/erp/vercel.json`, `apps/superadmin/vercel.json`, `packages/database/src/client.ts` |
| 1 | Client request reduction | `apps/erp/src/features/**` (find-teacher, admin-fees, settings, assistant strip, teacher-classes, admin-students, parent-wallet, parent-linking, admin-teachers, student-family-code, teacher-gradebook, student-reviews, teacher-affiliations, list-preset screens) |
| 2 | Sessions window + dashboards | `api/v1/sessions/route.ts`, `api/v1/dashboards/student/route.ts`, `server-core/services/reports/reports.ts`, student/parent/teacher/admin dashboard + schedule screens, tests |
| 3 | Server N+1 | `roster.ts`, `grades.ts`, `notifications/[id]/read`, `team-notes.ts`, `materials.ts`, `courses/route.ts`, `me/route.ts`, `session-generator.ts`, `tests/unit/n1-batch3-reads.test.ts` |
| 4 | Messaging | `chat-oversight.ts`, `chat-scope.ts`, `messages.ts`, `fanout.ts`, `notifications/broadcast/route.ts`, `tests/unit/messaging-batching.test.ts` |
| 5 | Cron | `cron/jobs.ts`, `tests/unit/cron-jobs-batching.test.ts` |
| 6 | Attendance writes | `attendance.ts`, `attendance/sync.ts`, `tests/unit/attendance-batch-writes.test.ts`, `tests/db/offline-sync.test.ts` |
| 7 | Indexes | `migrations/20260927120000_performance_indexes/`, `schema.prisma`, `scripts/expected-db-shape.json`, `.claude/rules/db-and-migrations.md` |
| 8 | This report | `docs/api-performance-audit.md`, `docs/api-performance-audit-inventory.md` |

Suggested commit messages:

```
perf(infra): run functions in fra1 next to Neon and honour DATABASE_POOL_MAX

Pin erp and superadmin Vercel functions to fra1 (Neon is eu-central-1);
each DB round trip drops from ~90 ms to ~1-2 ms. Pass max and a 30 s idle
timeout to the Neon pool so warm instances keep their sockets.
```

```
perf(erp-client): cut duplicate and redundant fetches

Debounce find-teacher search, load fee dialog pickers only when a dialog
is open, share /me, me/children and pending-request queries with the
shell, drop refetch() after Refine mutations, invalidate only the list in
teacher affiliations, and add the list preset to non-money list screens.
```

```
perf(dashboards): bound session reads and remove per-session probes

GET /sessions takes an optional limit; student dashboard, schedule and
parent next-lesson request a date window. Teacher dashboard returns
counterOnlyToday instead of one probe per session. Attendance counts use
one groupBy; the student dashboard runs in a single transaction; the
admin dashboard returns todaySessionCount.
```

```
perf(server): remove N+1 loops in roster, grades, sessions and /me

Batch roster teacher reads, load only the child's own scores, notify on
grade entry after the response, mark notifications read in one update,
merge team-notes and assistant /me transactions, select only used
material fields, rate-limit anonymous course browse, and check session
conflicts with one range query.
```

```
perf(messaging): batch oversight and parent fallback, notify after commit

listOversightChildren and withParentFallbackMany use set queries;
listContacts memoises repeated edge lookups within one call; chat
messages, group posts and reports send notifications after the response.
```

```
perf(cron): batch reminder queries and run the weekly digest concurrently
```

```
perf(attendance): batch bulk marking and offline sync writes
```

```
perf(db): add indexes for hot notification, audit, attendance, payment,
session and grade queries

Additive only. CONCURRENTLY statements for large tables are in the
migration header.
```

```
docs: API performance and infrastructure-cost audit
```

---

## 8. Environment variables

No new variables.

| Variable | Change |
|---|---|
| `DATABASE_POOL_MAX` | Now also applies to the Neon (`ws`) driver used in production. Default 10. Keep ≤ 10 per instance on Vercel. |
| `REDIS_URL` | Unchanged (rate limiter only). Candidate A/B above would reuse it. |

Vercel region is set in `vercel.json` (`regions: ["fra1"]`), not an env var.

---

## 9. Pre-deploy steps

1. **Vercel region.** After deploying, open each project (erp, superadmin) →
   Settings → Functions and confirm the region shows `fra1` (Frankfurt). If the
   project setting overrides the file, set it there too.
2. **Migration `20260927120000_performance_indexes`** — additive, no code depends
   on it, so it can go before or after the app deploy. Run from
   `packages/database`, and read the `Datasource "db": … at "<host>"` line Prisma
   prints before trusting anything after it.

   Dev (expect `ep-withered-field-b23csnyq`):
   ```bash
   EDURA_ENV=dev npx prisma migrate deploy
   EDURA_ENV=dev npx tsx scripts/verify-db.ts
   ```

   Production (expect `ep-mute-rice-b2s8gg42`):
   ```bash
   export DIRECT_URL="$(grep -E '^DIRECT_URL=' .env.production | cut -d= -f2- | tr -d "\"'")"
   psql "$DIRECT_URL" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('notifications','audit_logs','subscriptions','attendance_records','payments','wallet_ledger','parent_wallet_ledger','sessions','grades') ORDER BY 2 DESC"
   ```
   For any table above ~100k rows, first run that table's
   `CREATE INDEX CONCURRENTLY IF NOT EXISTS …` lines from the migration header
   through `psql "$DIRECT_URL"`, one statement at a time (the migration then
   no-ops for them). `prisma migrate deploy` runs each migration in a
   transaction, so it cannot use `CONCURRENTLY` itself. Then:
   ```bash
   DIRECT_URL="$DIRECT_URL&connect_timeout=60&pool_timeout=60" EDURA_ENV=production EDURA_ALLOW_ENV_OVERRIDE=1 npx prisma migrate deploy
   EDURA_ENV=production npx tsx scripts/verify-db.ts
   ```
   `verify-db.ts` should report 82 migrations.
3. Run `graphify update .` after committing.

---

## 10. Needs Ali's decision (not done)

Each of these touches auth, money or shared behaviour, so none was changed.

1. **Enable Prisma `relationJoins`** — saves 1 round trip on every authenticated
   request (session + user in one query). Preview feature; needs a full DB-suite
   run.
2. **Actor lookup inside the handler's transaction** for assistants and center
   staff — saves 3 round trips per staff request. It changes where authorization
   is resolved.
3. **Merge the admin dashboard's 7 transactions** into 1–2 — frees pool
   connections; inside one transaction the reads run one after another, so the
   page gets slightly slower.
4. **Money reads:** `countFeeDefaulters` (unbounded), paging for `GET payments`,
   month-end statement batching, the `transactions` from/to index (P2) with a
   wallet history rewrite, superadmin finance full-history scans.
5. **Collaboration request deadlock** (`collaboration.ts:177`,
   `createCollaborationRequestTx → resolveCenterAdmins`).
6. **Split `notify.ts` into persist + dispatch**, so broadcast can insert rows
   inline and push after the response.
7. **Redis candidates A and B** (section 4), when traffic justifies them.

Also found (not performance): superadmin `platform-tabs.tsx:84-88` reads
`totalStudents`, `activeClasses`, `totalRevenue`, which the payload does not
contain, so those tiles always show 0.
