# Seed Data Gap Analysis

> ## ⚠️ STALE — DO NOT TREAT AS CURRENT
>
> **Last accurate: the pre-Prisma era.** This analysis
> cross-references the **pre-Prisma data model** and a seed layout
> (`seed/center.ts`, `seed/users.ts`, …) that no longer exist. The project now
> seeds **Neon Postgres via Prisma** (`packages/database/prisma/seed.ts` plus
> the per-feature demo seeds), so the collection names, counts, and source-file
> paths in the tables below do not map to the current codebase.
>
> The PRD compliance audit independently flags this document as stale — see
> [../product/prd-compliance-audit.md](../product/prd-compliance-audit.md).
>
> Kept for historical reference and because the *gap-thinking* is still useful.
> For current seed/demo-data rules see the `is_demo` conventions in
> [CLAUDE.md](../../CLAUDE.md). Verify against the codebase before acting on
> anything in this file.

> Cross-reference of the pre-Prisma entity set vs what `bun run seed` actually
> creates. Identifies what's missing for production demo readiness.

---

## Current Seed Coverage

| Entity | Seeded? | Count | Source file |
|------------|---------|-------|-------------|
| Center | Yes | 1 (NILE01) | `seed/center.ts` |
| Room | Yes | 6 | `seed/center.ts` |
| User | Yes | 19 (1 admin + 6 teachers + 10 students + 2 parents) | `seed/users.ts` |
| CenterAdminProfile | Yes | 1 | `seed/users.ts` |
| TeacherProfile | Yes | 6 (with subjects, bio, qualifications) | `seed/users.ts` |
| StudentProfile | Yes | 10 (with familyLinkCode) | `seed/users.ts` |
| ParentProfile | Yes | 2 | `seed/users.ts` |
| CenterTeacherAffiliation | Yes | 6 (all status=active) | `seed/users.ts` |
| CenterStudentRoster | Yes | 10 (all active, not blacklisted) | `seed/users.ts` |
| ParentStudentLink | Yes | 2 (both status=approved) | `seed/users.ts` |
| Course | Yes | 6 | `seed/courses.ts` |
| Enrollment | Yes | ~35 (varies by course) | `seed/courses.ts` |
| Session | Yes | 48 (8 per course: 5 past, 3 future) | `seed/sessions.ts` |
| AttendanceRecord | Yes | ~175 (past sessions × enrolled students) | `seed/sessions.ts` |
| Grade | Yes | 18 (3 per course) with student scores | `seed/grades.ts` |
| Payment | Yes | ~70 (2 per enrolled student) + 1 refund | `seed/finances.ts` |
| Expense | Yes | 6 (one per category) | `seed/finances.ts` |
| Review | Yes | 8 | `seed/reviews.ts` |
| EnrollmentRequest | Yes | 3 (pending) | `seed/relational.ts` |
| Notification | Yes | 8 (2 per role type, all unread) | `seed/relational.ts` |
| **Material** | **No** | 0 | — |
| **UserDeviceToken** | **No** | 0 | — |
| **InviteToken** | **No** | 0 | consumed on use, not needed |
| **PasswordResetToken** | **No** | 0 | consumed on use, not needed |

---

## Missing Seed Data

### 1. Materials — No seeded files (P1)

**Impact:** Teacher Materials page shows empty list. Student Materials page is empty. Download flow untestable.

**What's needed:**
- 2-3 materials per course (12-18 total)
- Each needs a Cloudinary URL (or placeholder) since the model stores a cloud file reference
- Types: `lecture`, `homework`, `exam`

**Challenge:** Materials require actual file uploads to Cloudinary. Options:
1. Seed with placeholder Cloudinary URLs pointing to a pre-uploaded sample PDF
2. Upload real sample PDFs during seed via Cloudinary API
3. Accept empty materials list and note it as "upload during demo"

**Recommendation:** Option 3 for now — the upload flow itself needs manual testing anyway. Add a note in the RUNBOOK that the tester should upload 2-3 PDFs per course during manual QA.

---

### 2. Device Tokens — No FCM tokens (P3)

**Impact:** Push notifications won't fire during demo. Only in-app notifications work.

**What's needed:** Nothing — device tokens are registered by real mobile/web clients. Cannot be pre-seeded meaningfully.

**Recommendation:** No action. Document that push notifications require a real device registration first.

---

### 3. Multi-Center Data — Only one center (P2)

**Impact:**
- Search endpoints (`/search/centers`, `/search/courses`, `/search/teachers`) only return one center
- Cross-center access control can't be demonstrated
- Geo-search with `distanceKm` filter not meaningful with 1 location

**What's needed:**
- 2-3 additional centers in different cities (e.g., Alexandria, Giza)
- Each with 1-2 teachers, 2-3 students, 1-2 courses
- Different subjects and locations for search diversity

---

### 4. Notifications — Limited variety (P2)

**Impact:** Only 8 notifications (2 per role), all unread. Doesn't test:
- Read vs unread mix
- Many notification types
- Pagination (need 20+ for parent/student)
- Different time ranges ("5m ago" vs "3 days ago")

**What's needed:**
- 10-20 notifications per key user (Lina, Hossam, Admin, Mona)
- Mix of read and unread
- Multiple types: `material_uploaded`, `grade_posted`, `session_cancelled`, `session_postponed`, `enrollment_request_approved`, `absence_marked`, `payment_recorded`, `broadcast`
- Spread across last 7 days for varied timestamps

---

### 5. Parent Links — Only approved links (P2)

**Impact:** Cannot demo the pending → approve/reject flow. Both seeded links are pre-approved via `family_code` path.

**What's needed:**
- 1 pending parent link (initiated by email, awaiting student approval)
- 1 rejected parent link (for history)

**Possible approach:** Seed a 3rd parent (e.g., `fatima.mother@email.eg`) with a pending link to Fatima Al-Zahraa.

---

### 6. Enrollment Requests — Only pending requests (P3)

**Impact:** Admin can only see pending requests. No approved/declined history for demo.

**What's needed:**
- 2-3 approved enrollment requests (historical)
- 1-2 declined requests with reasons

---

### 7. Sessions — No postponed sessions (P3)

**Impact:** Cannot demo the "postponed" status tag or the postponement flow result.

**What's needed:**
- 1-2 sessions with status=`postponed`, `postponedFromDate` set, `cancelReason` with reason

---

### 8. Blacklisted Student — None seeded (P3)

**Impact:** Admin students page shows no blacklisted students. Cannot demo the blacklist indicator.

**What's needed:** Not recommended to seed — blacklisting is destructive and would prevent that student from enrolling. Better to test live.

---

### 9. Course with status=cancelled — None seeded (P3)

**Impact:** No cancelled course visible in admin classes list.

**What's needed:** Consider adding a 7th course that was cancelled (historical), so the status badge shows.

---

## Summary: What to Add

### Must-have for production demo (P1)

| Gap | Action | Effort |
|-----|--------|--------|
| Materials | Manual upload during QA, OR seed with placeholder URLs | Low |

### Should-have for complete demo (P2)

| Gap | Action | Effort |
|-----|--------|--------|
| Multi-center | Add `seed/centers-extra.ts` with 2 more centers | Medium |
| Notifications variety | Expand `seed/relational.ts` to 15-20 per user | Low |
| Parent link states | Add 3rd parent with pending link | Low |

### Nice-to-have (P3)

| Gap | Action | Effort |
|-----|--------|--------|
| Enrollment request history | Add approved/declined rows in `seed/relational.ts` | Low |
| Postponed session | Set 1 session to postponed in `seed/sessions.ts` | Low |
| Cancelled course | Add 7th course with status=cancelled | Low |

---

## Seed vs Frontend Expectations

The frontend (`lib/mockData.ts`) is aligned with seed data — both reference the
same Nile Academy users and structure. The mock data provides:
- Navigation items per role
- Default user names (Lina, Hossam, Mostafa, Mona)
- Color schemes per role

All dashboard screens fetch from live API endpoints and depend on seeded data
being present. If `bun run seed` hasn't run, dashboards show zeros/empty lists.

---

## Checklist Before Production Demo

```
[ ] Seed a fresh environment in order: db:label -> db:bootstrap-role -> migrate deploy -> seed -> db:verify
[ ] Verify admin login: admin@nile-academy.eg / Passw0rd!
[ ] Verify admin dashboard shows non-zero counts
[ ] Verify teacher login: hossam.aziz@nile-academy.eg / Passw0rd!
[ ] Verify student login: lina.hassan@student.nile-academy.eg / Passw0rd!
[ ] Verify parent login: mona.hassan@email.eg / Passw0rd!
[ ] Upload 2-3 sample PDFs as teacher Hossam (Materials page)
[ ] Verify search returns center in /search/centers
[ ] Verify notifications bell shows unread count
[ ] Verify enrollment requests visible on admin portal
```
