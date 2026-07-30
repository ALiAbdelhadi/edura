# Manual Testing Scenarios

> ## ⚠️ PARTIALLY STALE — VERIFY BEFORE USE
>
> **Last accurate: the Newman/MongoDB era (pre-Prisma migration).** This
> document is framed around a **Newman e2e harness that no longer exists** —
> the PRD compliance audit confirms `scripts/e2e-runner.mjs` and the
> `bun run test:e2e` script were never present post-migration
> ([../product/prd-compliance-audit.md](../product/prd-compliance-audit.md)).
> Any statement here about "what Newman covers" or "what Newman cannot test" is
> no longer a valid basis for deciding what needs manual testing.
>
> Route paths, roles, and screens also predate the `apps/superadmin` extraction,
> the subscriptions/money engine, collaboration requests, attendance modes, and
> the messaging layer — none of which are covered below.
>
> **The individual test scenarios themselves are still largely useful** as a
> manual QA checklist; it is the automation framing and the coverage claims that
> are outdated. Verify each scenario against the current codebase before relying
> on it, and treat the scenario list as incomplete rather than authoritative.

> Covers everything that Newman e2e cannot test: file uploads, email flows,
> frontend UI, rate limiting, edge cases, and visual verification.
>
> **Legend:** P = Priority (1 = critical, 2 = important, 3 = nice-to-have)

---

## 1. File Uploads (Materials) — P1

Newman cannot send multipart/form-data with real files. All material
upload/update/delete flows must be tested manually.

### 1.1 Upload Material (POST /materials)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Upload valid PDF | teacher1 | POST multipart: courseId, title="Lecture 1", type="lecture", file=sample.pdf (< 20 MB) | 201, material object with cloudinary URL |
| 2 | Upload PDF at size limit | teacher1 | file=exactly-20mb.pdf | 201 or 413 depending on limit enforcement |
| 3 | Upload PDF exceeding limit | teacher1 | file=25mb.pdf | 400/413 with size error |
| 4 | Upload non-PDF file | teacher1 | file=image.png | 400 validation error |
| 5 | Upload without file field | teacher1 | FormData with courseId + title but no file | 400/422 validation error |
| 6 | Upload to course not owned | teacher2 | courseId belongs to teacher1 | 403 |
| 7 | Upload to non-existent course | teacher1 | courseId=invalid | 404 |
| 8 | Upload without title | teacher1 | omit title field | 400 |
| 9 | Upload as student | student1 | valid payload | 403 |
| 10 | Verify enrolled students notified | teacher1 | upload, then check student1 notifications | notification with type="material_uploaded" appears |

### 1.2 Update Material (PATCH /materials/:id)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Update title only | teacher1 | PATCH title="Updated Lecture" | 200, title changed, file unchanged |
| 2 | Replace file | teacher1 | PATCH with new PDF | 200, new URL, old cloudinary resource deleted |
| 3 | Update as non-owner | teacher2 | PATCH teacher1's material | 403 |
| 4 | Replace with non-PDF | teacher1 | file=image.png | 400 |

### 1.3 Delete Material (DELETE /materials/:id)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Delete own material | teacher1 | DELETE | 200 `{ deleted: true }`, cloudinary resource removed |
| 2 | Delete as non-owner | teacher2 | DELETE teacher1's material | 403 |
| 3 | Delete as student | student1 | DELETE | 403 |
| 4 | Delete non-existent | teacher1 | invalid id | 404 |
| 5 | Download after delete | student1 | GET /materials/:id/download | 404 |

### 1.4 Download Material (GET /materials/:id/download)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Download as enrolled student | student1 | GET | 200 with signed URL |
| 2 | Download as non-enrolled student | student3 | GET | 403 |
| 3 | Download as course teacher | teacher1 | GET | 200 |
| 4 | Download as different teacher | teacher2 | GET | 403 |
| 5 | Download as center admin | admin1 | GET | 200 |
| 6 | Non-existent material | any | GET | 404 |

---

## 2. Admin Invite Accept Flow — P1

The admin invite endpoint (`POST /centers/me/admins/invite`) sends the invite
token via email only — it is NOT leaked in `meta`. The full flow must be tested
manually by reading the email/console output.

### 2.1 Invite Admin (POST /centers/me/admins/invite)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Invite new email | admin1 | `{ "email": "newadmin@test.edu" }` | 201 `{ invited: true, existingUser: false }`, shell user created, email sent with token |
| 2 | Invite existing active user | admin1 | email of an active user | 200 `{ invited: true, existingUser: true }` |
| 3 | Invite already-admin user | admin1 | email of admin1 or existing admin | 409 ConflictError |
| 4 | Invite as non-admin | teacher1 | valid email | 403 |
| 5 | Verify email content | — | read console/mail log | contains plain invite token, correct subject line |

### 2.2 Accept Admin Invite (POST /auth/invite/accept)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Accept with valid token | Copy token from email, POST with password | 200, user activated, CenterAdminProfile created |
| 2 | Accept with expired token | Wait > 7 days (or manipulate DB) | 410 Gone |
| 3 | Accept with consumed token | Reuse token | 410 Gone |
| 4 | Accept with invalid token | random string | 400/410 |
| 5 | Login after accept | POST /auth/login with new credentials | 200, role=center_admin |

### 2.3 Remove Admin (DELETE /centers/me/admins/:userId)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Remove other admin | admin1 | DELETE admin2 | 200 `{ removed: true }` |
| 2 | Remove yourself | admin1 | DELETE own userId | 403 "Cannot remove yourself" |
| 3 | Remove last admin | admin2 | DELETE admin1 (only remaining) | 422 "Cannot remove last admin" |
| 4 | Remove from different center | adminX | DELETE admin1 | 403 |

---

## 3. Session Attendance GET — Backend Bug — P1

`GET /sessions/:id/attendance` has a bug at line 32: `requireCenterScope(user, session.courseId)` passes `courseId` instead of the course's `centerId`. Admin GET always returns 403.

### 3.1 Verify Bug

| # | Scenario | Auth | Expected (current) | Expected (fixed) |
|---|----------|------|---------------------|-------------------|
| 1 | Admin GET attendance | admin1 | 403 Forbidden | 200 with records |
| 2 | Teacher GET own session | teacher1 | 200 | 200 |
| 3 | Teacher GET other's session | teacher2 | 403 | 403 |
| 4 | Student GET enrolled session | student1 | 200 (scoped in service) | 200 |

**Fix required:** Change `requireCenterScope(user, session.courseId)` to resolve the course's `centerId` first, similar to the PUT handler on lines 63-66 of the same file.

---

## 4. Parent Link Flows — Manual Approval Path — P1

Newman only tests the instant `family_code` path. The manual email/phone
approval path needs manual testing.

### 4.1 Link by Email (pending → approve/reject)

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Parent initiates with student email | parent1 | POST /parent-links `{ "email": "student@..." }` | 201, status=pending |
| 2 | Student sees pending link | student1 | GET /parent-links | link with status=pending |
| 3 | Student approves | student1 | POST /parent-links/:id/approve | 200, status=approved |
| 4 | Parent sees child | parent1 | GET /me/children | student appears |
| 5 | Student rejects instead | student1 | POST /parent-links/:id/reject | 200, status=rejected |
| 6 | Parent does not see child | parent1 | GET /me/children | empty |
| 7 | Duplicate pending link | parent1 | POST same email again | 409 |

### 4.2 Revoke Approved Link

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Parent revokes | parent1 | DELETE /parent-links/:id | 200, status=revoked |
| 2 | Student revokes | student1 | DELETE /parent-links/:id | 200, status=revoked |
| 3 | Revoke already revoked | parent1 | DELETE again | error or idempotent |
| 4 | Verify child removed | parent1 | GET /me/children | student no longer listed |

---

## 5. Teacher Affiliation — Leave Center — P2

### 5.1 DELETE /affiliations/:id

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Leave with no active courses | teacher2 | DELETE own affiliation | 200 `{ left: true }` |
| 2 | Leave with active courses | teacher1 | DELETE (has course) | 422 "Cannot leave with active courses" |
| 3 | Leave as wrong teacher | teacher2 | DELETE teacher1's affiliation | 403 |
| 4 | Verify removed from roster | admin1 | GET /roster/teachers | teacher2 gone |

### 5.2 POST /affiliations/:id/decline

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Decline pending affiliation | teacher | POST | 200 `{ declined: true }` |
| 2 | Decline already-accepted | teacher | POST | error (not pending) |

---

## 6. Enrollment Request — Student Withdrawal — P2

### 6.1 DELETE /enrollment-requests/:id

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Cancel own pending request | student | DELETE | 200 `{ cancelled: true }` |
| 2 | Cancel approved request | student | DELETE | 422 "Only pending requests can be cancelled" |
| 3 | Cancel other student's request | student2 | DELETE student1's request | 403 |
| 4 | Re-submit after cancel | student | POST /enrollment-requests | 201 new request |

---

## 7. Rate Limiting — P2

### 7.1 Login Rate Limit (10 req / 30 sec)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | 10 requests in 30s | send 10 POST /auth/login | all succeed |
| 2 | 11th request | send 1 more within window | 429 Too Many Requests |
| 3 | After window expires | wait 30s, send again | 200 |

### 7.2 Registration Rate Limit (20 req / 30 sec)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | 21 POST /auth/register/student in 30s | rapid-fire | 21st returns 429 |

### 7.3 Search Rate Limit (60 req / 60 sec)

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | 61 GET /search/centers in 60s | rapid-fire | 61st returns 429 |

---

## 8. Search & Pagination Edge Cases — P2

### 8.1 GET /search/centers

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | No filters | GET /search/centers | 200 with all centers |
| 2 | Text search | ?q=Bright | results matching name |
| 3 | Subject filter | ?subject=Mathematics | centers offering this subject |
| 4 | Geo search | ?nearLat=30.05&nearLng=31.35&distanceKm=10 | nearby centers |
| 5 | Page 2 | ?page=2&limit=5 | second page, no duplicates from page 1 |
| 6 | Page out of range | ?page=9999 | 200 with empty array |
| 7 | Negative limit | ?limit=-1 | defaults to 20 or error |
| 8 | Limit > 100 | ?limit=200 | caps at 100 |

### 8.2 GET /search/courses

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Price range | ?priceMin=10000&priceMax=50000 | filtered results |
| 2 | Day filter | ?daysOfWeek=1,3 | Mon+Wed courses |
| 3 | Min rating | ?minRating=4.0 | teacher rating >= 4.0 |
| 4 | Combined filters | subject + price + days | AND logic, narrowed results |
| 5 | priceMin > priceMax | ?priceMin=50000&priceMax=10000 | empty results or error |

---

## 9. Auth Edge Cases — P2

### 9.1 Token/Session Expiry

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Expired session cookie | Modify cookie expiry in browser | 401 on next API call |
| 2 | Invalid cookie value | Set cookie to garbage | 401 |
| 3 | Missing cookie | Remove cookie entirely | 401 |
| 4 | Tampered cookie | Change a character | 401 |

### 9.2 Cross-Center Access

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Admin A views Admin B's center | admin of center-B | GET /centers/me | sees own center only |
| 2 | Admin A enrolls in center-B course | admin-A | POST /enrollments with center-B courseId | 403 |
| 3 | Admin A removes center-B teacher | admin-A | DELETE /roster/teachers/:teacherFromB | 403 |
| 4 | Admin A invites admin to center-B | admin-A | POST /centers/me/admins/invite — goes to own center only | invite is scoped to admin-A's center |

### 9.3 Role Enforcement

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Student creates course | student1 | POST /courses | 403 |
| 2 | Parent records payment | parent1 | POST /payments | 403 |
| 3 | Teacher invites admin | teacher1 | POST /centers/me/admins/invite | 403 |
| 4 | Student creates expense | student1 | POST /expenses | 403 |
| 5 | Teacher cancels course | teacher1 | POST /courses/:id/cancel | 403 |

---

## 10. Course Scheduling Edge Cases — P2

### 10.1 Session Conflicts

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Same teacher, overlapping time/day | Create course A Mon 10-11, then course B Mon 10:30-11:30 for same teacher | 409 with conflict details |
| 2 | Same teacher, adjacent slots | Mon 10-11 then Mon 11-12 | 201 (no overlap) |
| 3 | Same room, overlapping | Course A room-X Mon 10-11, course B room-X Mon 10:30-11:30 different teacher | 409 room conflict |
| 4 | Different days, same time | Mon 10-11 and Tue 10-11 same teacher | 201 (no conflict) |

### 10.2 Schedule Pattern Boundaries

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | startDate = endDate | single day course | 201 with 0-1 sessions |
| 2 | startDate > endDate | invalid range | 400 validation error |
| 3 | daysOfWeek empty | `[]` | 400 "min 1" |
| 4 | daysOfWeek invalid | `[7]` | 400 "max 6" |
| 5 | startTime > endTime | "14:00" to "10:00" | 400 or generates correctly (wraps?) |
| 6 | Invalid time format | "2pm" instead of "14:00" | 400 regex validation |

---

## 11. Attendance PATCH (Single Record) — P2

### 11.1 PATCH /attendance/:id

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Change present to absent | admin1 | `{ "status": "absent" }` | 200 updated record |
| 2 | Change to excused | admin1 | `{ "status": "excused" }` | 200 |
| 3 | Invalid status | admin1 | `{ "status": "late" }` | 400 validation error |
| 4 | Non-existent record | admin1 | invalid id | 404 |
| 5 | As non-admin | teacher1 | PATCH | 403 |

---

## 12. Email & Notification Verification — P2

These are side effects of other API calls. Verify by reading console output
(MAIL_PROVIDER=console) or checking the notifications list.

### 12.1 Emails Sent

| Trigger | Expected Email |
|---------|----------------|
| POST /roster/teachers/invite | "You have been invited to teach at a center" with token |
| POST /roster/students/invite | "You have been invited to join as a student" with token |
| POST /centers/me/admins/invite | "You have been invited to join as a center admin" with token |
| POST /courses/:id/cancel | notification to enrolled students (check if email sent) |
| Material uploaded | notification to enrolled students |

### 12.2 In-App Notifications Generated

| Trigger | Expected Notification Type |
|---------|---------------------------|
| Material uploaded | material_uploaded |
| Session cancelled | session_cancelled |
| Session postponed | session_postponed |
| Enrollment approved | enrollment_request_approved |
| Payment recorded | payment_recorded |
| Grade posted | grade_posted |
| Attendance marked absent | absence_marked |
| Admin broadcast | broadcast |

### 12.3 FCM Push Notifications

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Register device token | POST /me/device-tokens `{ "token": "fcm...", "platform": "web" }` | 201 |
| 2 | Trigger notification | e.g., admin broadcasts | push received on device |
| 3 | Unregister token | DELETE /me/device-tokens/:token | 200, no further pushes |

---

## 13. Frontend UI Testing — P1

### 13.1 Login Page

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Valid login | Enter email + password, submit | Redirect to /dashboard |
| 2 | Invalid credentials | Wrong password | Error message displayed |
| 3 | Empty fields | Submit without filling | Client-side validation prevents submit |
| 4 | Quick-login buttons | Click "Admin" demo button | Auto-fills and logs in as admin |
| 5 | Logout + re-login | Logout, verify redirect to /login, login again | Clean session |

### 13.2 Admin Dashboard

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Stats display | Navigate to admin dashboard | Total students, teachers, active classes, revenue shown |
| 2 | Students page | Navigate, search by name | Filtered results, blacklist/unblacklist actions work |
| 3 | Blacklist student | Click blacklist, enter reason, confirm | Status changes to "Blacklisted" |
| 4 | Teachers page | Navigate, invite teacher (email) | Modal form, success message, teacher appears with "Pending" status |
| 5 | Classes page | View classes, cancel a class | Confirmation dialog, status changes |
| 6 | Fees page | Record payment (student, course, amount) | Payment appears in log, amount formatted as EGP |
| 7 | Rooms page | Create room, edit name, delete | CRUD operations with confirmation |
| 8 | Enrollment requests | Approve request | Student enrolled, request removed from list |
| 9 | Decline request | Enter reason, confirm | Request marked declined |
| 10 | Reports page | View revenue/expenses/profit | Charts render, currency formatted |

### 13.3 Teacher Dashboard

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Stats display | Navigate | Classes today, pending grades, total students, attendance % |
| 2 | Classes page | Select course, view sessions | Session list with cancel/postpone actions |
| 3 | Cancel session | Click cancel, enter reason | Session marked cancelled, students notified |
| 4 | Postpone session | Pick new date/time, enter reason | Session rescheduled, conflict check runs |
| 5 | Grades page | Select course, edit scores inline, save | Scores saved, students see updated grades |
| 6 | Materials page | Upload PDF, verify in list | File appears with title, type tag, size |
| 7 | Download material | Click download | PDF opens in new tab |
| 8 | Delete material | Click delete, confirm | Material removed from list |

### 13.4 Student Dashboard

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Stats display | Navigate | Attendance rate, assignments due, average grade |
| 2 | Schedule page | Select day (Mon-Sat) | Sessions for that day shown |
| 3 | Grades page | View grades | GPA, best subject, subject performance table |
| 4 | Materials page | View enrolled course materials | PDF list with download buttons |
| 5 | Reviews page | See eligible teachers, write review | Star rating + comment modal, review appears in list |
| 6 | Edit review | Click edit on existing review | Modal pre-filled, save updates |
| 7 | Family code | View code, copy to clipboard | Code displayed, copy button works |
| 8 | Rotate code | Click rotate, confirm | New code shown, old code invalidated |
| 9 | Attendance page | View calendar | 28-day grid with P/A/L indicators |

### 13.5 Parent Dashboard

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Child selector | Switch between children (if multiple) | All stats update for selected child |
| 2 | Progress page | View grades, GPA, best subject | Data matches student's actual grades |
| 3 | Fees page | View payment history | Amounts formatted, refunds shown in orange |
| 4 | Family linking — by code | Enter student's family code | Link created instantly (approved) |
| 5 | Family linking — by email | Enter student's email | Link created as "pending", awaits student approval |
| 6 | Attendance page | View child's attendance | Calendar with present/absent/late indicators |

### 13.6 Responsive Design

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Mobile sidebar | Resize to < 768px | Sidebar hidden, hamburger menu appears |
| 2 | Mobile navigation | Tap hamburger, select item | Menu opens, navigates, auto-closes |
| 3 | Mobile tables | View any table on mobile | Horizontal scroll enabled |
| 4 | Mobile cards | View stat cards | Stack vertically |
| 5 | Mobile modals | Open any modal | Full-width, scrollable |

### 13.7 Notifications UI

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Bell icon | Click notifications bell | Navigate to notifications page |
| 2 | Unread notification | View list | Unread items have full opacity, read items faded |
| 3 | Mark as read | Click unread notification | Opacity changes |
| 4 | Mark all read | Click "Mark all read" | All notifications faded |
| 5 | Type tags | View different notification types | Correct colors: blue (absence), orange (cancelled), green (payment), purple (enrollment), geekblue (grade) |

---

## 14. Device Token Management — P3

### 14.1 POST /me/device-tokens

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Register web token | any user | `{ "token": "abc", "platform": "web" }` | 201 `{ registered: true }` |
| 2 | Register same token twice | any user | POST same token | upsert, lastSeenAt updated |
| 3 | Invalid platform | any user | `{ "platform": "windows" }` | 400 |
| 4 | Empty token | any user | `{ "token": "" }` | 400 |

### 14.2 DELETE /me/device-tokens/:token

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Unregister own token | user who registered | DELETE | 200 `{ unregistered: true }` |
| 2 | Non-existent token | any user | DELETE random | 404 |
| 3 | Re-register after unregister | any user | POST again | 201 |

---

## 15. Family Code Edge Cases — P3

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Parent uses old code after rotate | parent1 | Student rotates, parent uses old code | 404 "Student not found" |
| 2 | Parent uses new code | parent1 | Use freshly rotated code | 201 link approved |
| 3 | Non-student calls rotate | parent1 | POST /me/family-code/rotate | 403 |
| 4 | Code format | student | GET /me/family-code | 10-12 char alphanumeric string |

---

## 16. Financial Reports Edge Cases — P3

| # | Scenario | Auth | Steps | Expected |
|---|----------|------|-------|----------|
| 1 | Reports with date range | admin1 | ?from=2026-01-01&to=2026-06-01 | filtered results |
| 2 | Reports no data in range | admin1 | ?from=2099-01-01&to=2099-12-31 | zeros or empty |
| 3 | Revenue after payment | admin1 | create payment, then GET /reports/revenue | amount reflected |
| 4 | Net profit calculation | admin1 | GET /reports/net-profit | revenue - expenses |

---

## Known Backend Issues

| # | File | Line | Issue | Impact |
|---|------|------|-------|--------|
| 1 | `app/api/v1/sessions/[id]/attendance/route.ts` | 32 | `requireCenterScope(user, session.courseId)` passes courseId instead of centerId | Admin GET attendance always returns 403 |
| 2 | `app/api/v1/centers/me/admins/invite/route.ts` | — | Invite token not leaked in `meta` when E2E=1, unlike teacher/student invites | Cannot be tested by Newman |
