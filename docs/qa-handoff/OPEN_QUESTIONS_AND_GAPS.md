# Edura — Open Questions and Gaps

| Item | Value |
|---|---|
| Document | OPEN_QUESTIONS_AND_GAPS.md (5 of 5 in `docs/qa-handoff/`) |
| Baseline | Repository `main` at commit `f7e33102`, inspected 2026-11-01 |
| Gaps | 275 |
| Product Owner questions | 146 |
| FRs without a test case | 0 |

## Status labels
| Label | Meaning |
|---|---|
| IMPLEMENTED | Present in code and consistent with the recorded intent (still needs testing) |
| PARTIALLY IMPLEMENTED | Some of the expected behaviour exists; the rest does not |
| NOT IMPLEMENTED | Expected by the recorded intent or the domain, absent from code |
| UNCLEAR | The code does something, but the intended behaviour cannot be determined |
| CONFLICTING | Code and recorded intent (decision records, project rules) disagree, or two parts of the code disagree |
| RISK | A security or data-integrity risk found during inspection |
| MISSING VALIDATION / MISSING ERROR HANDLING / MISSING PERMISSION | A specific defect class found during inspection |
| MISSING AUTOMATED TEST | Important behaviour with no automated regression test in the repository |

## 1. Implementation status of the functional requirements
| Implementation status | FRs |
|---|---|
| IMPLEMENTED | 350 |
| UNSPECIFIED | 166 |
| PARTIALLY IMPLEMENTED | 59 |
| IMPLEMENTED · PRIORITY: CRITICAL | 15 |
| IMPLEMENTED · PRIORITY: HIGH | 14 |
| UNCLEAR | 8 |
| CONFLICTING | 7 |
| IMPLEMENTED · PRIORITY: MEDIUM | 6 |
| NOT IMPLEMENTED | 4 |
| PARTIALLY IMPLEMENTED · PRIORITY: HIGH | 1 |

## 2. Critical items for the Product Owner and tech lead
The items below are the ones most likely to change test outcomes or block release. Each references the
detailed entry in §4.

These findings come from reading the source code. None of them has been reproduced against a running environment yet. Each must be confirmed by a test case before it is logged as a defect.

### 2.1 Release blockers: a core flow cannot be tested end-to-end

| # | Item | Why it blocks |
|---|---|---|
| 1 | GAP-076 — Paymob sandbox/live checkout is not wired | Online card payment has no working path outside mock mode. Every online-payment test case can only run against the mock driver. |
| 2 | GAP-224 — Accountant "Online payments" page targets a route that does not exist | The accountant's online-payments screen cannot load data, so its test cases fail at step 1. |
| 3 | GAP-136 — Mail layer conflicts with the project notes | Only SMTP and console mail exist on `main`; the Resend driver is on an unmerged branch. Invite, reset and guardian-verification e-mails need a configured SMTP sink in the test environment. |
| 4 | GAP-275 — The test-credentials guide lists accounts that no seed creates | Testers following the guide will try seven accounts that do not exist. Use the seeded accounts in QA_TEST_PLAN §5.4. |

### 2.2 Authorization and account security

| # | Item |
|---|---|
| 5 | GAP-001 — Legacy invite accept resolves the account by e-mail, not by user id |
| 6 | GAP-002 — Reset password does not re-check account status and leaves sibling tokens live |
| 7 | GAP-006 — Shared demo password is shipped inside the message catalog (shown on non-production login) |
| 8 | GAP-009 — Back-office signed-out bounce is client-side only |
| 9 | GAP-032 — A removed co-admin keeps the center in the live session |
| 10 | GAP-038 — Commit-time import and manual create attach another center's student |
| 11 | GAP-093 — GET /grades has no role gate |
| 12 | GAP-119 — Bare student code resolves for any signed-in viewer |
| 13 | GAP-243 — Guided-tour pages have no explicit role check |
| 14 | GAP-260 — `scopedDb` turns RLS off for every role except center_admin (tenant isolation relies on application checks alone for the other roles) |
| 15 | GAP-263 — A soft-deleted user can be re-activated, and `findUnique` still returns them |
| 16 | GAP-185 — Centre activate/deactivate overwrites every admin status, including blacklisted admins |

### 2.3 Child safety and messaging

| # | Item |
|---|---|
| 17 | GAP-134 — Guardian lock, relationship and matrix are not re-checked on existing conversations or groups |
| 18 | GAP-133 — `guardian_required` returns HTTP 500 over REST |
| 19 | GAP-137 — Report accepts an unvalidated reportedUserId |
| 20 | GAP-138 — Push subscription endpoint is not allow-listed and can be taken over |
| 21 | GAP-118 — One approved parent per student is not enforced by the database |

### 2.4 Money, attendance and settlement correctness

| # | Item |
|---|---|
| 22 | GAP-054 — Center admins cannot cancel or postpone a session (only the assigned teacher can) |
| 23 | GAP-058 — Offline sync bypasses the 7-day edit window |
| 24 | GAP-060 — Counter check-in: no session-date check, and a mode B downgrade |
| 25 | GAP-062 — A future or postponed lesson can be completed (and so settled) |
| 26 | GAP-079 — Per-session pass expiry uses UTC day, not Cairo |
| 27 | GAP-083 — `payments` rows keep the UPDATE privilege |
| 28 | GAP-215 — Payout request idempotency key is optional and the dialog may not send one (double-submit risk) |
| 29 | GAP-225 — Accountant may export session settlements but may not list them |
| 30 | GAP-160 — Student dashboard uses UTC day, not Cairo |
| 31 | GAP-164 — Today's takings counts failed and pending payments |

### 2.5 Operations and data lifecycle

| # | Item |
|---|---|
| 32 | GAP-188 — Two conflicting meanings of "approve a deletion"; anonymize is unreachable |
| 33 | GAP-239 — Offline attendance outbox is not cleared on logout (shared counter devices) |
| 34 | GAP-269 — Demo purge leaves money rows behind |
| 35 | GAP-272 — uat-seed is designed to run against production |
| 36 | GAP-017 — Anonymous course read exposes internal money configuration (revenue split) |


## 3. Gap index
| Status label | Count |
|---|---|
| UNSPECIFIED | 164 |
| PARTIALLY IMPLEMENTED | 26 |
| UNCLEAR | 24 |
| RISK | 24 |
| CONFLICTING | 17 |
| MISSING VALIDATION | 5 |
| NOT IMPLEMENTED | 4 |
| MISSING AUTOMATED TEST | 4 |
| MISSING PERMISSION | 3 |
| MISSING ERROR HANDLING | 3 |
| IMPLEMENTED | 1 |

| Gap ID | Module | Status | Title |
|---|---|---|---|
| GAP-001 | Authentication, Accounts & Onboarding | UNSPECIFIED | Legacy invite accept resolves the account by e-mail, not by user id |
| GAP-002 | Authentication, Accounts & Onboarding | UNSPECIFIED | Reset password does not re-check account status and leaves sibling tokens live |
| GAP-003 | Authentication, Accounts & Onboarding | UNSPECIFIED | First-credentials claim does not bump `token_version` |
| GAP-004 | Authentication, Accounts & Onboarding | UNSPECIFIED | Back-office per-e-mail limiter refills one token per minute |
| GAP-005 | Authentication, Accounts & Onboarding | UNSPECIFIED | `VIEW_AS_SECRET` has a development fallback |
| GAP-006 | Authentication, Accounts & Onboarding | UNSPECIFIED | Shared demo password is shipped inside the message catalog |
| GAP-007 | Authentication, Accounts & Onboarding | UNSPECIFIED | Guardian verification returns one identical message for every failure |
| GAP-008 | Authentication, Accounts & Onboarding | UNSPECIFIED | Login page still writes the dead `edura_state` localStorage key |
| GAP-009 | Authentication, Accounts & Onboarding | UNSPECIFIED | Back-office signed-out bounce is client-side only |
| GAP-010 | Authentication, Accounts & Onboarding | UNSPECIFIED | `PATCH /api/v1/me` silently drops unknown fields |
| GAP-011 | Authentication, Accounts & Onboarding | UNSPECIFIED | No back-office self-service password reset |
| GAP-012 | Authentication, Accounts & Onboarding | UNSPECIFIED | Automated test coverage holes |
| GAP-013 | Authentication, Accounts & Onboarding | UNSPECIFIED | Rate limits depend on a shared store and a trusted client-IP header |
| GAP-014 | Authentication, Accounts & Onboarding | UNSPECIFIED | Claiming an invite while signed in as another user gives no warning |
| GAP-015 | Authentication, Accounts & Onboarding | UNSPECIFIED | Phone numbers are not normalised before the uniqueness check |
| GAP-016 | Authentication, Accounts & Onboarding | UNSPECIFIED | Reuse of a soft-deleted account's e-mail is undefined |
| GAP-017 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Anonymous course read exposes internal money configuration |
| GAP-018 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Global search has no maximum query length and no rate limit |
| GAP-019 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Contact form has no spam control, duplicate detection or staff notification |
| GAP-020 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | www contact form offers fewer subjects than the API accepts |
| GAP-021 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | ERP command palette hides search failures as "nothing found" |
| GAP-022 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Discovery numeric and geo parameters are not validated |
| GAP-023 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | External (shell) teachers appear in teacher-days but not in teacher search |
| GAP-024 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | ERP sitemap lists authentication pages and the ERP host has no robots.txt |
| GAP-025 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Pricing silently falls back to code defaults |
| GAP-026 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Two parallel marketing sites carry overlapping pages |
| GAP-027 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | www catalogue copy is static |
| GAP-028 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Rate-limit bucket behind the www contact proxy is not established |
| GAP-029 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Demo rows are visible on public surfaces |
| GAP-030 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Missing automated tests for several public paths |
| GAP-031 | Catalog, Discovery, Search & Public Site | UNSPECIFIED | Course detail ignores course and centre status |
| GAP-032 | Center Administration | UNSPECIFIED | A removed co-admin keeps the center in the live session |
| GAP-033 | Center Administration | UNSPECIFIED | A co-admin invite cannot be accepted |
| GAP-034 | Center Administration | UNSPECIFIED | Two blacklist representations |
| GAP-035 | Center Administration | UNSPECIFIED | Walk-in and temp-student duplicate detection bypass the "same child" rule |
| GAP-036 | Center Administration | UNSPECIFIED | Key precedence differs from the decision record |
| GAP-037 | Center Administration | UNSPECIFIED | Center-admin mutations are largely unaudited |
| GAP-038 | Center Administration | UNSPECIFIED | Commit-time import and manual create attach another center's student |
| GAP-039 | Center Administration | UNSPECIFIED | Manual create with a courseId skips the blacklist |
| GAP-040 | Center Administration | UNSPECIFIED | A former center can still read a removed student |
| GAP-041 | Center Administration | UNSPECIFIED | Re-registering a temp student overwrites it |
| GAP-042 | Center Administration | UNSPECIFIED | Temp-student invite channel is a stub; staff cannot use the shared routes |
| GAP-043 | Center Administration | UNSPECIFIED | The guardian-contact rate limit can be spread across students |
| GAP-044 | Center Administration | UNSPECIFIED | Roster student/teacher invites have no consumer, and tokens leak |
| GAP-045 | Center Administration | UNSPECIFIED | Center profile update validation is thin |
| GAP-046 | Center Administration | UNSPECIFIED | Audit-log filters are not validated |
| GAP-047 | Center Administration | UNSPECIFIED | Inconsistent input rules for the same entity |
| GAP-048 | Center Administration | UNSPECIFIED | Converting to enrolled reactivates a suspended account |
| GAP-049 | Center Administration | UNSPECIFIED | Off-system teacher removal and settlement edges (Payments hand-off) |
| GAP-050 | Center Administration | UNSPECIFIED | Group capacity check is count-then-insert |
| GAP-051 | Center Administration | UNSPECIFIED | UI and API disagree |
| GAP-052 | Center Administration | UNSPECIFIED | Missing field validation (import, rooms) |
| GAP-053 | Center Administration | UNSPECIFIED | Missing automated tests |
| GAP-054 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Center admins cannot cancel or postpone a session |
| GAP-055 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Cancel and postpone have no state guard beyond "completed" |
| GAP-056 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | No start-before-end or HH:MM range check on session times |
| GAP-057 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Suggestions use a UTC day, the counter board uses a Cairo day |
| GAP-058 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Offline sync bypasses the 7-day edit window |
| GAP-059 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Direct enroll has no capacity check; approve can race |
| GAP-060 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Counter check-in: no session-date check, and a mode B downgrade |
| GAP-061 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Cancel/postpone notifications skip parents and teacher-direct courses |
| GAP-062 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | A future or postponed lesson can be completed |
| GAP-063 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | `sessions` has no row-level security |
| GAP-064 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | No reopen control in the UI |
| GAP-065 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Offline sync writes `centerId ""` for teacher-direct courses |
| GAP-066 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | `/me/attendance` maps "excused" to "late" |
| GAP-067 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Parent read of an attendance register with several children |
| GAP-068 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Enrollment request: wrong status code and missing checks |
| GAP-069 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | The "expired" status update is likely rolled back |
| GAP-070 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Reassigning a teacher checks no clashes and notifies nobody |
| GAP-071 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Postponed sessions are missing at the counter |
| GAP-072 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Door ignores the mode and accepts a duplicate scan |
| GAP-073 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | The student's course list includes courses they are not enrolled in |
| GAP-074 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Teacher coverage has no UI caller |
| GAP-075 | Courses, Sessions, Enrollment & Attendance | UNSPECIFIED | Missing automated tests |
| GAP-076 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Paymob sandbox/live checkout is not wired |
| GAP-077 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | No gateway or wallet refund channel at the counter |
| GAP-078 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Client/server validation drift on three money forms |
| GAP-079 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Per-session pass expiry uses UTC day, not Cairo |
| GAP-080 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Shift list upper date bound is UTC |
| GAP-081 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Expense delete is a hard delete |
| GAP-082 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Expense date and PATCH fields are under-validated |
| GAP-083 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | `payments` rows keep the UPDATE privilege |
| GAP-084 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Center credit top-up bounds are hard-coded |
| GAP-085 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Cash wallet top-up at the counter has no server bounds |
| GAP-086 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Parent "Pay" dialog mints a new idempotency key per click |
| GAP-087 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Availability probe fails open |
| GAP-088 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | `staff/finance` page has no page-level role guard |
| GAP-089 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Points claw-back window is 10 seconds |
| GAP-090 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Counter payment allowed with no open shift |
| GAP-091 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | No automated tests for several PAY FRs |
| GAP-092 | Payments, Subscriptions, Wallets & Settlement | UNSPECIFIED | Inconsistent EGP rounding across money pages |
| GAP-093 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | GET /grades has no role gate |
| GAP-094 | Teacher Portal, Assistants, Collaboration & Academic Content | CONFLICTING | Upload size limit differs between UI and server |
| GAP-095 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | GET /reviews filters are open to any authenticated role |
| GAP-096 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Delegation audit is best effort and thin |
| GAP-097 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Assistant already on another team gives a generic error |
| GAP-098 | Teacher Portal, Assistants, Collaboration & Academic Content | CONFLICTING | Team screen capability text omits collaborations |
| GAP-099 | Teacher Portal, Assistants, Collaboration & Academic Content | CONFLICTING | proposedCenterShare is accepted but ignored |
| GAP-100 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Grade maxScore and name validation |
| GAP-101 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Material type and title not validated |
| GAP-102 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Replacing a material file can lose the old file |
| GAP-103 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Notification failure may fail the upload |
| GAP-104 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Expired affiliation accept may not persist the expired status |
| GAP-105 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Eligible-teachers list returns teacher emails |
| GAP-106 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Malformed invite body is silently accepted |
| GAP-107 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Rate limiting is only on the assistant invite route |
| GAP-108 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Public handle card not inspected |
| GAP-109 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Blacklist and temporary student have no UI entry point in scope |
| GAP-110 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | Collaboration time strings not range-checked |
| GAP-111 | Teacher Portal, Assistants, Collaboration & Academic Content | PARTIALLY IMPLEMENTED | No pagination and silent filter handling on request list |
| GAP-112 | Teacher Portal, Assistants, Collaboration & Academic Content | NOT IMPLEMENTED | Missing automated tests for the highest-risk flows |
| GAP-113 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Several UI screens not inspected line by line |
| GAP-114 | Teacher Portal, Assistants, Collaboration & Academic Content | NOT IMPLEMENTED | No review delete, hide or moderation route |
| GAP-115 | Teacher Portal, Assistants, Collaboration & Academic Content | UNCLEAR | Team notes route and service not read |
| GAP-116 | Student & Parent Portals | UNSPECIFIED | Parent and student isolation is application-level only |
| GAP-117 | Student & Parent Portals | UNSPECIFIED | Account enumeration through link lookups |
| GAP-118 | Student & Parent Portals | UNSPECIFIED | One approved parent per student is not enforced by the database |
| GAP-119 | Student & Parent Portals | UNSPECIFIED | Bare student code resolves for any signed-in viewer |
| GAP-120 | Student & Parent Portals | UNSPECIFIED | No rate limit on link, scan, card, rotate or oversight routes |
| GAP-121 | Student & Parent Portals | UNSPECIFIED | Family code and phone matching is exact |
| GAP-122 | Student & Parent Portals | UNSPECIFIED | Parent UI cannot send a phone number |
| GAP-123 | Student & Parent Portals | UNSPECIFIED | No notification to the initiator on approve, reject or revoke; notify failure after commit |
| GAP-124 | Student & Parent Portals | UNSPECIFIED | Checklist 'blocking' flag does not match the card gate |
| GAP-125 | Student & Parent Portals | UNSPECIFIED | Print route returns the generic 404 page for every failure |
| GAP-126 | Student & Parent Portals | UNSPECIFIED | Roster choice endpoint has no UI caller |
| GAP-127 | Student & Parent Portals | UNSPECIFIED | Non-numeric `beforeSeq` / `limit` on the oversight thread route |
| GAP-128 | Student & Parent Portals | UNSPECIFIED | Brief expects a student subject-request lifecycle; code has teacher-only requests |
| GAP-129 | Student & Parent Portals | UNSPECIFIED | Revoke / cancel controls missing in the UI |
| GAP-130 | Student & Parent Portals | UNSPECIFIED | Development fallback secret for card signing |
| GAP-131 | Student & Parent Portals | UNSPECIFIED | No direct automated tests for linking, scope and scan tiers |
| GAP-132 | Student & Parent Portals | UNSPECIFIED | Parent portal Playwright spec appears stale |
| GAP-133 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | `guardian_required` returns HTTP 500 over REST |
| GAP-134 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Guardian lock, relationship and matrix are not re-checked on existing conversations or groups |
| GAP-135 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Gate order differs from the decision document |
| GAP-136 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Mail layer conflicts with the project notes |
| GAP-137 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Report accepts an unvalidated reportedUserId |
| GAP-138 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Push subscription endpoint is not allow-listed and can be taken over |
| GAP-139 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Broadcast validation and abuse limits missing |
| GAP-140 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Center broadcast reaches only enrolled students and parents |
| GAP-141 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Unread notification counter is inconsistent |
| GAP-142 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Notifications screen shows only the 20 newest |
| GAP-143 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Assistant messaging has no UI page |
| GAP-144 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | FCM_PUSH_TYPES is dead code |
| GAP-145 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | REST client maps every 403 to the blocked notice |
| GAP-146 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Socket authorization is never re-validated; presence is per process |
| GAP-147 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Most messaging REST routes have no rate limit |
| GAP-148 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Conversation list accepts garbage `before` and `limit` |
| GAP-149 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Whitespace-only body is rejected with the wrong status |
| GAP-150 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Mock modes report success |
| GAP-151 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Stale documentation path for WhatsApp templates |
| GAP-152 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Automated test coverage gaps |
| GAP-153 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Block has no relationship or role restriction |
| GAP-154 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Recipient status is not checked for existing threads or notifications |
| GAP-155 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Message attachments not implemented |
| GAP-156 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | No user-facing delete or edit of a message |
| GAP-157 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Back-office messaging and group sync triggers not inspected |
| GAP-158 | Messaging, Notifications & Communication Integrations | UNSPECIFIED | Cron secrets and schedule are not verifiable from the repository |
| GAP-159 | Reports, Dashboards & Exports | CONFLICTING | Export registry has 9 keys, decision doc says 8 |
| GAP-160 | Reports, Dashboards & Exports | CONFLICTING | Student dashboard uses UTC day, not Cairo |
| GAP-161 | Reports, Dashboards & Exports | CONFLICTING | Attendance rate has two definitions; late is counted nowhere as present |
| GAP-162 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Net profit / export totals are all-time without a range while monthly rows are 6 months |
| GAP-163 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Admin KPIs are all-time beside a 6-month chart |
| GAP-164 | Reports, Dashboards & Exports | CONFLICTING | Today's takings counts failed and pending payments |
| GAP-165 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Fill rate uncapped, 0 for null capacity, ignores date range and provenance in net-profit |
| GAP-166 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Enrollment funnel omits cancelled and is not cumulative |
| GAP-167 | Reports, Dashboards & Exports | MISSING VALIDATION | Garbage date probably returns 500 |
| GAP-168 | Reports, Dashboards & Exports | MISSING VALIDATION | from after to is not validated |
| GAP-169 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Print route drops provenance and the login redirect drops the query |
| GAP-170 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Admin home API runs all analytics queries though home shows a few |
| GAP-171 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Raw enum values and English month labels in UI/print |
| GAP-172 | Reports, Dashboards & Exports | MISSING PERMISSION | Non-manager staff opening /dashboard/staff/reports sees load error |
| GAP-173 | Reports, Dashboards & Exports | CONFLICTING | Manager nav has 9 items; sidebar-ia.md says max 8 |
| GAP-174 | Reports, Dashboards & Exports | UNCLEAR | Net-profit ignores granularity; fill-rate/funnel calls send ignored params |
| GAP-175 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Export menu offers money reports to a manager who will be refused |
| GAP-176 | Reports, Dashboards & Exports | RISK | No rate limit and no row cap on exports/timeseries/takings list |
| GAP-177 | Reports, Dashboards & Exports | UNCLEAR | Parent home sums come from list results (first page) and paid ignores refunds |
| GAP-178 | Reports, Dashboards & Exports | CONFLICTING | Digest day and schedule conflict with the decision doc |
| GAP-179 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Digest week is UTC while report days are Cairo |
| GAP-180 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | Student count is enrolments, not distinct students |
| GAP-181 | Reports, Dashboards & Exports | PARTIALLY IMPLEMENTED | CSV 'Exported' timestamp and filename date are UTC |
| GAP-182 | Reports, Dashboards & Exports | UNCLEAR | Fee defaulter definition is net-of-payments, not course-matched |
| GAP-183 | Reports, Dashboards & Exports | MISSING AUTOMATED TEST | Missing automated tests for route role scoping of dashboards, print page, staff reports screen, teacher/parent/admin home UI |
| GAP-184 | Super Admin Platform Operations | UNSPECIFIED | Platform blacklist add and lift are audited only by the best-effort auto-audit hook |
| GAP-185 | Super Admin Platform Operations | UNSPECIFIED | Centre activate/deactivate overwrites every admin status, including blacklisted admins |
| GAP-186 | Super Admin Platform Operations | UNSPECIFIED | `impersonation/stop` has no role guard |
| GAP-187 | Super Admin Platform Operations | UNSPECIFIED | Teacher blacklist state is incomplete in the UI |
| GAP-188 | Super Admin Platform Operations | UNSPECIFIED | Two conflicting meanings of "approve a deletion"; anonymize is unreachable; note optional vs required |
| GAP-189 | Super Admin Platform Operations | UNSPECIFIED | Rejecting a centre registration suspends all its admins |
| GAP-190 | Super Admin Platform Operations | UNSPECIFIED | Centre-scoped member deactivate changes the user's global status |
| GAP-191 | Super Admin Platform Operations | UNSPECIFIED | Roster invite routes return the raw invite token outside production |
| GAP-192 | Super Admin Platform Operations | UNSPECIFIED | Password-reset audit is written after the email is sent, outside the transaction |
| GAP-193 | Super Admin Platform Operations | UNSPECIFIED | `students/[id]` takes a profile id while sibling routes take a user id |
| GAP-194 | Super Admin Platform Operations | UNSPECIFIED | Parent-link rows record "parent" as the initiator when the super admin acted |
| GAP-195 | Super Admin Platform Operations | UNSPECIFIED | Rejected teachers do not appear in the Registrations "rejected" tab |
| GAP-196 | Super Admin Platform Operations | UNSPECIFIED | The three blacklist doors return different success codes |
| GAP-197 | Super Admin Platform Operations | UNSPECIFIED | No rate limit on sensitive back-office writes |
| GAP-198 | Super Admin Platform Operations | UNSPECIFIED | Audit-log filters are not validated |
| GAP-199 | Super Admin Platform Operations | UNSPECIFIED | No self-protection on revoke sessions, reset 2FA or password reset |
| GAP-200 | Super Admin Platform Operations | UNSPECIFIED | Catalog links and offerings are hard-deleted |
| GAP-201 | Super Admin Platform Operations | UNSPECIFIED | WhatsApp message detail route is missing |
| GAP-202 | Super Admin Platform Operations | UNSPECIFIED | Home "Cycle statement" link points to a missing page |
| GAP-203 | Super Admin Platform Operations | UNSPECIFIED | "Erase details now" is irreversible and has no confirmation |
| GAP-204 | Super Admin Platform Operations | UNSPECIFIED | Students guardian picker is statically empty |
| GAP-205 | Super Admin Platform Operations | UNSPECIFIED | Centre header says money is "never editable here", but the Money tab moves money |
| GAP-206 | Super Admin Platform Operations | UNSPECIFIED | Instant state changes without confirmation |
| GAP-207 | Super Admin Platform Operations | UNSPECIFIED | Silent failures on several screens |
| GAP-208 | Super Admin Platform Operations | UNSPECIFIED | Collaborations page is read-only although a decide API exists |
| GAP-209 | Super Admin Platform Operations | UNSPECIFIED | Teacher PATCH skips the Egyptian phone rule |
| GAP-210 | Super Admin Platform Operations | UNSPECIFIED | Arabic UI gaps and raw English values |
| GAP-211 | Super Admin Platform Operations | UNSPECIFIED | Catalog update, delete, link rules and subject-request review have no automated test |
| GAP-212 | Super Admin Platform Operations | UNSPECIFIED | Registration decisions and attendance mode have no automated test |
| GAP-213 | Finance & Accounting (Back-office) | CONFLICTING | Invoice type `student_invoice` accepted by the schema, rejected by the service |
| GAP-214 | Finance & Accounting (Back-office) | PARTIALLY IMPLEMENTED | `cancelled` payouts are invisible to the back-office counts and filters |
| GAP-215 | Finance & Accounting (Back-office) | MISSING VALIDATION | Payout request idempotency key is optional and the dialog may not send one |
| GAP-216 | Finance & Accounting (Back-office) | IMPLEMENTED | Wallet policy update audit comes from the auto-audit extension, not `writeAdminAudit` |
| GAP-217 | Finance & Accounting (Back-office) | RISK | Rejecting an approved payout overwrites `approvedBy` |
| GAP-218 | Finance & Accounting (Back-office) | RISK | Points rules CRUD writes no audit row |
| GAP-219 | Finance & Accounting (Back-office) | CONFLICTING | Expense category `maintenance` exists in the DB enum but not in the route schema |
| GAP-220 | Finance & Accounting (Back-office) | RISK | No rate limiting on any finance money route |
| GAP-221 | Finance & Accounting (Back-office) | RISK | Hard result caps without pagination or a total |
| GAP-222 | Finance & Accounting (Back-office) | CONFLICTING | Expense delete is a hard delete, against the soft-delete convention |
| GAP-223 | Finance & Accounting (Back-office) | UNCLEAR | No back-office screen found that triggers a refund |
| GAP-224 | Finance & Accounting (Back-office) | NOT IMPLEMENTED | Accountant "Online payments" page targets a route that does not exist |
| GAP-225 | Finance & Accounting (Back-office) | MISSING PERMISSION | Accountant may export session settlements but may not list them |
| GAP-226 | Finance & Accounting (Back-office) | UNCLEAR | Back-office wallet top-up may bypass the student wallet policy |
| GAP-227 | Finance & Accounting (Back-office) | MISSING AUTOMATED TEST | Automated test coverage gaps |
| GAP-228 | Finance & Accounting (Back-office) | RISK | Sending an invoice by email leaves no audit row |
| GAP-229 | Finance & Accounting (Back-office) | UNCLEAR | Two people, not three, suffice for a payout (generator may also pay) |
| GAP-230 | Finance & Accounting (Back-office) | NOT IMPLEMENTED | Invoice statuses `paid` / `void` are unreachable from the back office |
| GAP-231 | Finance & Accounting (Back-office) | RISK | Finance alert thresholds are hard-coded |
| GAP-232 | Finance & Accounting (Back-office) | UNCLEAR | Per-student (M2) rate accepts a zero fee |
| GAP-233 | Finance & Accounting (Back-office) | RISK | Settlement export truncates at 5000 rows while the screen total shows everything |
| GAP-234 | Finance & Accounting (Back-office) | UNCLEAR | Invoice generation entry point and revenue report have no confirmed UI |
| GAP-235 | Finance & Accounting (Back-office) | MISSING VALIDATION | Inconsistent handling of a non-numeric `page` parameter across listings |
| GAP-236 | Platform, Infrastructure & Non-Functional | CONFLICTING | Stale document says cron jobs are unscheduled |
| GAP-237 | Platform, Infrastructure & Non-Functional | UNCLEAR | Stray `echo` inside the `env:` block of the cron workflow |
| GAP-238 | Platform, Infrastructure & Non-Functional | MISSING ERROR HANDLING | Month-end statements swallow per-item errors |
| GAP-239 | Platform, Infrastructure & Non-Functional | RISK | Offline attendance outbox is not cleared on logout |
| GAP-240 | Platform, Infrastructure & Non-Functional | PARTIALLY IMPLEMENTED | Manifest declares only SVG icons |
| GAP-241 | Platform, Infrastructure & Non-Functional | RISK | Unauthenticated or secret-only endpoints have no rate limit |
| GAP-242 | Platform, Infrastructure & Non-Functional | RISK | Client-IP trust depends on correct hop configuration |
| GAP-243 | Platform, Infrastructure & Non-Functional | MISSING PERMISSION | Guided-tour pages have no explicit role check |
| GAP-244 | Platform, Infrastructure & Non-Functional | CONFLICTING | Backup runbook says the schedule is off; workflow schedules it |
| GAP-245 | Platform, Infrastructure & Non-Functional | CONFLICTING | Environment documentation is stale on mail provider |
| GAP-246 | Platform, Infrastructure & Non-Functional | UNCLEAR | Cron boundaries use UTC while the platform clock is Cairo |
| GAP-247 | Platform, Infrastructure & Non-Functional | UNCLEAR | Subscription expiry has daily granularity |
| GAP-248 | Platform, Infrastructure & Non-Functional | RISK | Cron jobs silently truncate at fixed batch sizes |
| GAP-249 | Platform, Infrastructure & Non-Functional | UNCLEAR | Deep mail health result shape is unverified |
| GAP-250 | Platform, Infrastructure & Non-Functional | UNCLEAR | Details not verified in this pass |
| GAP-251 | Platform, Infrastructure & Non-Functional | RISK | Health endpoint reveals limiter mode publicly |
| GAP-252 | Platform, Infrastructure & Non-Functional | MISSING ERROR HANDLING | CSP report endpoint silently drops unparseable bodies |
| GAP-253 | Platform, Infrastructure & Non-Functional | RISK | Weaker CSP spots and a report-only footgun |
| GAP-254 | Platform, Infrastructure & Non-Functional | UNCLEAR | Database recovery layers cannot be verified from the repository |
| GAP-255 | Platform, Infrastructure & Non-Functional | MISSING AUTOMATED TEST | Missing automated tests for scheduled jobs and infrastructure |
| GAP-256 | Platform, Infrastructure & Non-Functional | UNCLEAR | No CORS layer found |
| GAP-257 | Platform, Infrastructure & Non-Functional | RISK | Service worker takes over immediately and caches personal API data |
| GAP-258 | Platform, Infrastructure & Non-Functional | PARTIALLY IMPLEMENTED | Load and endurance coverage is local and partial |
| GAP-259 | Platform, Infrastructure & Non-Functional | UNCLEAR | Monitoring and alerting configuration cannot be verified |
| GAP-260 | Data Model & Data Integrity | RISK | `scopedDb` turns RLS off for every role except center_admin |
| GAP-261 | Data Model & Data Integrity | RISK | 43 tables have no row-level security |
| GAP-262 | Data Model & Data Integrity | RISK | REVOKEs are skipped silently when `edura_app` is missing at migration time |
| GAP-263 | Data Model & Data Integrity | RISK | A soft-deleted user can be re-activated, and `findUnique` still returns them |
| GAP-264 | Data Model & Data Integrity | RISK | Re-activating a center re-activates every admin, including ones suspended on their own |
| GAP-265 | Data Model & Data Integrity | RISK | Lifting a platform blacklist sets the user active unconditionally |
| GAP-266 | Data Model & Data Integrity | MISSING ERROR HANDLING | An auto-audit failure is swallowed; the write still commits |
| GAP-267 | Data Model & Data Integrity | UNCLEAR | Refund transactions stay `pending` |
| GAP-268 | Data Model & Data Integrity | UNCLEAR | Enum values that nothing writes |
| GAP-269 | Data Model & Data Integrity | RISK | Demo purge leaves money rows behind |
| GAP-270 | Data Model & Data Integrity | MISSING VALIDATION | `session_settlements.session_id` has no foreign key |
| GAP-271 | Data Model & Data Integrity | RISK | Seed falls back to a built-in password and to fallback staff emails outside production |
| GAP-272 | Data Model & Data Integrity | RISK | uat-seed is designed to run against production |
| GAP-273 | Data Model & Data Integrity | CONFLICTING | `is_demo` on child tables conflicts with the root-entities rule |
| GAP-274 | Data Model & Data Integrity | MISSING AUTOMATED TEST | Seven DB suites are excluded from the local run |
| GAP-275 | Data Model & Data Integrity | CONFLICTING | The test-credentials guide lists accounts that no seed creates |

## 4. Gaps and questions by module
Each module lists its gaps (`GAP-###`, with status, evidence, impact on testing and a recommendation)
followed by its questions for the Product Owner (`Q-###`, with context and why it matters).

### 4.1. Authentication, Accounts & Onboarding

#### Gaps

##### GAP-001 — Legacy invite accept resolves the account by e-mail, not by user id
- **Status:** RISK
- **Evidence:** `packages/server-core/src/services/auth/invite-accept.ts:30` — `tx.user.findFirst({ where: { email: row.email } })`; the token row's purpose is not checked. (`:44` does bump `tokenVersion`, so sessions are revoked.)
- **Impact on testing:** an invite whose target user has since changed e-mail, or an invite row with a NULL e-mail, can activate the wrong row or none; TC-033 is exploratory.
- **Recommendation:** resolve by `row.userId` + purpose; add a DB test for the changed-e-mail case.

##### GAP-002 — Reset password does not re-check account status and leaves sibling tokens live
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `packages/server-core/src/services/auth/password-reset.ts:29` (forgot only issues for `status: "active"`), `:100-116` (`resetPassword` checks the token only; no `status` check; other unexpired tokens for the same user are not marked used).
- **Impact on testing:** TC-029/030 may pass "as implemented" while violating the one-suspension-mechanism intent if the account was suspended after the mail went out.
- **Recommendation:** on reset, require `status='active'` and mark all other open tokens for the user as used.

##### GAP-003 — First-credentials claim does not bump `token_version`
- **Status:** UNCLEAR
- **Evidence:** `packages/server-core/src/services/account/credentials.ts:44` sets `status: "active"` and the hash; no `tokenVersion` increment (contrast `invite-accept.ts:44`, `password-reset.ts:112`).
- **Impact on testing:** any session minted from the same claim link before credentials were set stays valid (TC-058).
- **Recommendation:** product owner decides (Q-010); if sessions must be unique, increment `tokenVersion` and re-mint the current one.

##### GAP-004 — Back-office per-e-mail limiter refills one token per minute
- **Status:** RISK
- **Evidence:** `packages/server-core/src/backoffice-auth/create-auth.ts:51-52` (`LOGIN_EMAIL_CAP = 5`, `LOGIN_EMAIL_RATE = 1`).
- **Impact on testing:** five wrong attempts from anyone who knows a staff e-mail lock the real operator out for up to a minute per retry (TC-104); testers sharing one staff account will trip it.
- **Recommendation:** accept as a deliberate hardening or raise the refill; document it in the test guide.

##### GAP-005 — `VIEW_AS_SECRET` has a development fallback
- **Status:** RISK (low)
- **Evidence:** `packages/server-core/src/auth/view-as-token.ts:18-22` — production refuses to start without it; non-production uses a fallback.
- **Impact on testing:** a preview/staging deploy with `NODE_ENV !== production` signs handoff tokens with a known value; view-as tests there are not representative.
- **Recommendation:** set the variable in every hosted environment; assert at boot when `VERCEL` is set.

##### GAP-006 — Shared demo password is shipped inside the message catalog
- **Status:** RISK
- **Evidence:** `apps/erp/src/messages/en.json:168` (`auth.demoPasswordHint` embeds the value); rendered by `apps/erp/src/app/[locale]/login/page.tsx:30` (`SHOW_QUICK_LOGINS = NODE_ENV !== "production"`) and `:315`.
- **Impact on testing:** any non-production build (including hosted previews) shows demo credentials on the login page; the catalog is bundled into every build regardless of the flag.
- **Recommendation:** move the hint out of the catalog into a dev-only module, or gate on an explicit `SHOW_DEMO_LOGINS` env; confirm production renders nothing (TC-001 precondition).

##### GAP-007 — Guardian verification returns one identical message for every failure
- **Status:** UNCLEAR
- **Evidence:** `packages/server-core/src/services/invites/guardian-verification.ts:80,92,93,95` — invalid, bad signature, already used and stale e-mail all throw "This link is not valid or has expired".
- **Impact on testing:** TC-096 cannot distinguish a used link from a stale one; may be deliberate anti-enumeration.
- **Recommendation:** product owner confirms (Q-009); if deliberate, record it as a rule.

##### GAP-008 — Login page still writes the dead `edura_state` localStorage key
- **Status:** UNCLEAR
- **Evidence:** `apps/erp/src/app/[locale]/login/page.tsx:83,115`; `docs/decisions/server-side-portal-gate.md:78-79,108` says nothing reads it and the write "stays".
- **Impact on testing:** none functionally; a tester may report it as a leak of state to the browser.
- **Recommendation:** remove the write or document it as intentional (Q-004).

##### GAP-009 — Back-office signed-out bounce is client-side only
- **Status:** RISK
- **Evidence:** `apps/superadmin/src/app/[locale]/dashboard/layout.tsx:19-22` redirects only for missing 2FA; `apps/superadmin/src/lib/server/ssr-session.ts:8` returns `user: null` and leaves routing to the layout; the redirect to `/login` lives in the Refine auth provider (`apps/superadmin/src/lib/refine/auth-provider.ts:69,92`).
- **Impact on testing:** with JavaScript disabled or before hydration, a signed-out visitor may see the dashboard shell (no data — APIs are fail-closed). TC-110.
- **Recommendation:** add a server-side `if (!user) redirect(/login)` in the dashboard layout, mirroring the ERP portal gate.

##### GAP-010 — `PATCH /api/v1/me` silently drops unknown fields
- **Status:** MISSING VALIDATION
- **Evidence:** `apps/api/src/routes/v1/me/route.ts:41` (`patchSchema = z.object({...})` without `.strict()`), so `role`, `status`, `email` in the body are ignored rather than rejected.
- **Impact on testing:** TC-046 passes on safety but a client bug (wrong field name) fails silently.
- **Recommendation:** `.strict()` and return 400 `validation_error` with the offending field.

##### GAP-011 — No back-office self-service password reset
- **Status:** NOT IMPLEMENTED
- **Evidence:** `apps/superadmin/src/app/[locale]/` contains only `login`, `two-factor`, `two-factor-setup`, `dashboard`; the catalog has "Forgot password?" / "Check your email" strings but no page or route uses them; `sendResetPassword` is deliberately unset (`packages/server-core/src/backoffice-auth/create-auth.ts`).
- **Impact on testing:** a locked-out staff member needs a super_admin (Superadmin Operations module) to reset; no test possible here.
- **Recommendation:** product owner decides (Q-003); remove the dead strings if not wanted.

##### GAP-012 — Automated test coverage holes
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** no test file references `register/center` (FR-009), `/me/email` + `/me/email/confirm` (FR-019/020), ERP 2FA enable/disable (FR-005), `/me/prefs` (FR-022), `/me/profile-checklist` (FR-032), `/me/delete-request` (FR-033) — see `rtm.md` "Existing automated tests".
- **Impact on testing:** these rely entirely on manual TCs.
- **Recommendation:** add DB tests for FR-009, 019/020 and 033 first (state-changing).

##### GAP-013 — Rate limits depend on a shared store and a trusted client-IP header
- **Status:** RISK
- **Evidence:** `packages/server-core/src/rate-limit/require-shared-store.ts:1-25` (in-memory fallback without `REDIS_URL`; `ALLOW_UNSHARED_RATE_LIMIT=1` escape hatch; `TRUSTED_CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` on Vercel); `apps/erp/src/proxy.ts:78`.
- **Impact on testing:** every 429 test (TC-007/008/010/021/026/037/050/071/097/104/107) is only meaningful against one instance or with Redis configured; a wrong hop count lets a client choose its own IP.
- **Recommendation:** run limiter TCs with `REDIS_URL` set; verify the configured header in each hosted environment.

##### GAP-014 — Claiming an invite while signed in as another user gives no warning
- **Status:** UNCLEAR
- **Evidence:** `apps/erp/src/app/[locale]/claim/page.tsx:30-90` goes straight to `POST /api/auth/invite-token/claim`; no check of the current session first.
- **Impact on testing:** EC-028 — a parent opening a child's link on a shared phone silently switches accounts.
- **Recommendation:** show "You are signed in as X — continue as Y?" before claiming (Q-008).

##### GAP-015 — Phone numbers are not normalised before the uniqueness check
- **Status:** MISSING VALIDATION
- **Evidence:** `packages/shared/src/phone.ts:1` accepts both `+20…` and `0…`; `packages/server-core/src/services/auth/register.ts:99` only trims, `:60` compares the raw string.
- **Impact on testing:** the same number can register twice (TC-019); the "one definition of the same child" invariant (`findStudentByKeys`) may also see two spellings — cross-check with Center Administration's importer.
- **Recommendation:** normalise to one canonical form (Q-006) at every write and in `findStudentByKeys`.

##### GAP-016 — Reuse of a soft-deleted account's e-mail is undefined
- **Status:** UNCLEAR
- **Evidence:** `register.ts:60` uniqueness query does not filter `status`/`deletedAt`; whether the DB unique index includes deleted rows was not inspected (Data Model module).
- **Impact on testing:** EC-016 — a user who deleted their account cannot re-register with the same e-mail, or can and collides with the old row.
- **Recommendation:** product owner decides (Q-007); add a TC once decided.

#### Product-owner questions

##### Q-001 — May an accountant mint a view-as handoff, or only a super_admin?
- Context: `permissions.md` marks the mint side (Superadmin Operations) as UNKNOWN for `accountant`; the claim side accepts whatever was minted.
- Why it matters: decides whether TC-037 needs an accountant variant and whether finance staff can act inside ERP tenants.

##### Q-002 — Is subject auto-assignment expected to WRITE rows at onboarding, or is read-time derivation from the track the intended design?
- Context: `complete*Onboarding` stores system/stage/grade/track; the subjects page derives subjects from the track at read time (FR-026).
- Why it matters: determines whether a DB assertion on a `student_subjects`-style table belongs in TC-068.

##### Q-003 — Should back-office staff have a self-service password reset?
- Context: GAP-011; catalog strings exist, no route/page.
- Why it matters: lockout recovery path for the only two roles that can move money in the back-office.

##### Q-004 — Should the dead `edura_state` localStorage write be removed?
- Context: GAP-008.
- Why it matters: testers will flag browser-stored state; the decision doc says it is harmless.

##### Q-005 — After one reset token is used, should the user's other open reset tokens die, and should a suspended account be able to complete a reset?
- Context: GAP-002.
- Why it matters: defines the expected result of TC-029/030.

##### Q-006 — What is the canonical stored phone format (`01…` or `+201…`)?
- Context: GAP-015.
- Why it matters: uniqueness, WhatsApp delivery, and the walk-in "same child" match all key on the phone.

##### Q-007 — May a soft-deleted account's e-mail be registered again?
- Context: GAP-016 / EC-016.
- Why it matters: data-rights deletion promises vs. account recovery.

##### Q-008 — When a signed-in user opens another person's claim link, switch silently, warn, or refuse?
- Context: GAP-014.
- Why it matters: shared family phones are the norm for the target audience.

##### Q-009 — Is the single generic guardian-verification failure message deliberate?
- Context: GAP-007.
- Why it matters: support cannot tell "used" from "stale"; if deliberate it becomes a rule.

##### Q-010 — Should setting first credentials revoke sessions minted from the claim link?
- Context: GAP-003.
- Why it matters: a link forwarded to two devices leaves both signed in after one sets the password.

### 4.2. Catalog, Discovery, Search & Public Site

Labels used: CONFLICTING, RISK, MISSING VALIDATION, MISSING ERROR HANDLING, MISSING PERMISSION, MISSING AUTOMATED TEST, and the implementation statuses PARTIALLY IMPLEMENTED, NOT IMPLEMENTED, UNCLEAR. Severity is the analyst's estimate for release triage (High, Medium, Low), not a product decision. Where the product owner's intent is not documented, the item is raised as a question (Q-CAT) and the observed behaviour is recorded as a defect candidate, not as a verdict.

#### Gaps

##### GAP-017 — Anonymous course read exposes internal money configuration
- Label: CONFLICTING, RISK. Severity: High.
- Observation: `GET /api/v1/courses/[id]` (apps/api/src/routes/v1/courses/[id]/route.ts, `getCourseDetail` with `COURSE_COLUMNS`) is a public read. The row it returns includes `splitPlatformBp`, `splitTeacherBp`, `splitCenterBp`, `pricingMethod`, `m2CenterFee`, `m2CenterBp`, `settlementBasis`, `status`, `dataSource`, `isDemo`, `searchText`, `teacherId`, `defaultRoomId`.
- Why it matters: the revenue split between platform, teacher and centre is commercially sensitive and is not shown anywhere on the public course page. No decision document read in this analysis states that it is intended to be public.
- Related: FR-057, NFR-025, TC-148 (field exposure), Q-017.
- Suggested resolution: return an explicit public projection (title, schedule, price, seats, teacher and centre names) instead of the full row.

##### GAP-018 — Global search has no maximum query length and no rate limit
- Label: MISSING VALIDATION, RISK. Severity: Medium.
- Observation: `GET /api/v1/search` enforces only a minimum of 2 characters (`MIN_QUERY_LENGTH`). There is no cap on `q` and no `withRateLimit` wrapper (the discovery routes have 60 per minute). Each request runs up to one scan of 120 candidate rows per permitted provider per kind.
- Why it matters: a signed-in user can send very long or very frequent queries; the cost is borne by the database.
- Related: FR-068, EC-069, NFR-023, TC-167, TC-168, Q-021.

##### GAP-019 — Contact form has no spam control, duplicate detection or staff notification
- Label: RISK, MISSING VALIDATION. Severity: Medium.
- Observation: `POST /api/v1/contact` is unauthenticated. Protection is only the IP token bucket (burst 5, 3 per minute) and the strict body schema. No captcha, honeypot, duplicate detection or content filter exists in the route or in `recordContactSubmission`; no email, WhatsApp or in-app notification is sent when a submission is stored.
- Why it matters: spam fills the table silently and a genuine lead may sit unread. Where staff read submissions is not established (Q-015).
- Related: FR-082, FR-083, FR-094, EC-120, TC-198, TC-201, Q-015.

##### GAP-020 — www contact form offers fewer subjects than the API accepts
- Label: PARTIALLY IMPLEMENTED. Severity: Low.
- Observation: the API enum is demo, pricing, support, partnership, other; the www form lists only pricing, support, other (apps/www/src/components/contact-form.tsx:11). A visitor on the marketing site cannot ask for a demo or a partnership through the form.
- Related: FR-094, EC-123, TC-217.

##### GAP-021 — ERP command palette hides search failures as "nothing found"
- Label: MISSING ERROR HANDLING. Severity: Medium.
- Observation: apps/erp/src/components/refine/dashboard-shell.tsx:193 does not pass an error to the palette, so a failed request shows the empty-state text. The superadmin shell (apps/superadmin/.../dashboard-shell.tsx:167) does display an error. This contradicts the project rule that an error must not look like an empty result (memory note on the UI-state overhaul).
- Related: FR-079, FR-080, EC-091, NFR-035, TC-189, TC-191.

##### GAP-022 — Discovery numeric and geo parameters are not validated
- Label: MISSING VALIDATION. Severity: Low.
- Observation: `priceMin`, `priceMax`, `minRating`, `nearLat`, `nearLng`, `distanceKm` are not range checked or rejected with 400. Non-numeric or reversed ranges are handled implicitly (empty result, ignored filter or NaN). The tester should confirm that none produces a 500.
- Related: FR-049, FR-054, EC-094, EC-095, EC-098, TC-129, TC-136.

##### GAP-023 — External (shell) teachers appear in teacher-days but not in teacher search
- Label: CONFLICTING. Severity: Low.
- Observation: `discovery.ts` filters teacher-days with `status in ("active","shell")` (about line 473) while the teacher search and public profile gates require `active`. An external teacher can therefore be bookable by day but invisible in the teachers list.
- Whether this is intended is not documented (the external-teachers decision concerns money and login, not discovery).
- Related: FR-051, FR-053, EC-100, TC-132.

##### GAP-024 — ERP sitemap lists authentication pages and the ERP host has no robots.txt
- Label: PARTIALLY IMPLEMENTED. Severity: Low.
- Observation: apps/erp/src/app/sitemap.ts includes `/login`, `/register`, `/forgot-password` beside marketing pages and handles. No `robots.txt` route exists in the ERP app. Sitemap hygiene (only indexable, public pages) is therefore weaker than on www, where robots.txt is present.
- Related: FR-064, NFR-041, TC-160.

##### GAP-025 — Pricing silently falls back to code defaults
- Label: MISSING ERROR HANDLING. Severity: Medium.
- Observation: `services/pricing/public-rates.ts` returns code-default examples with `live:false` when the global commission row is missing or unreadable. The page shows no warning, so a public page could display figures that differ from the configured commission without anyone noticing.
- Related: FR-085, BR-080, EC-124, TC-204.

##### GAP-026 — Two parallel marketing sites carry overlapping pages
- Label: CONFLICTING. Severity: Low.
- Observation: both the ERP app (pricing, faq, contact, privacy, terms, help, changelog) and apps/www (pricing, faq, contact, privacy, terms, trust) host marketing pages. Wording, prices and legal text can drift. Which host is canonical for search engines is not stated.
- Related: FR-091, FR-093, FR-096, Q-019.

##### GAP-027 — www catalogue copy is static
- Label: UNCLEAR, RISK. Severity: Low.
- Observation: apps/www/src/lib/catalog.ts and catalog-data.ts hold the educational catalogue shown on the marketing site as static data. No test compares it with the database catalogue, so the two can diverge after a catalogue change.
- Related: FR-098, TC-222.

##### GAP-028 — Rate-limit bucket behind the www contact proxy is not established
- Label: RISK, UNCLEAR. Severity: Medium.
- Observation: the www site forwards the form through its own `/api/contact` route to the API. The limiter keys on `pathname:ip`. If the proxy does not pass the visitor's address, every www visitor shares the proxy's bucket (burst 5, 3 per minute), so a few submissions could lock out all visitors; if it passes a spoofable header, the limit can be bypassed. The behaviour on the deployed environment is not proven by code reading alone.
- Related: FR-082, FR-094, EC-120, EC-121, TC-218.

##### GAP-029 — Demo rows are visible on public surfaces
- Label: RISK. Severity: Low (becomes High if the purge is skipped).
- Observation: discovery, profiles and the sitemap have no `is_demo` filter. In development and test, seeded demo centres and teachers are publicly listed. The project rule is that demo data is wiped before launch; there is no automated guard that fails if a public read returns an `is_demo` row in production.
- Related: FR-049, EC-136, NFR-046, TC-141.

##### GAP-030 — Missing automated tests for several public paths
- Label: MISSING AUTOMATED TEST. Severity: Medium.
- Observation: from a search of the test folders, no test exercises these paths: the contact route handler (only the route-conventions allowlist mentions it); `getPricingExamples` fallback beyond the verbatim-data check in apps/api/tests/unit/public-reads.test.ts; the catalog tree and subjects routes (covered only indirectly by apps/erp/tests/db/catalog-onboarding.test.ts); the discovery filters (price, days, time bucket, geo, paging clamps); the ERP and www sitemaps and robots; the whole apps/www app (no test file found); the `[...rest]` 404 and `help/[slug]` pages; and the palette error state.
- Related: FR-043, FR-049, FR-082, FR-085, FR-091, FR-095, FR-096.

##### GAP-031 — Course detail ignores course and centre status
- Label: MISSING PERMISSION. Severity: High.
- Observation: `GET /api/v1/courses/[id]` has no status filter, unlike search and the public profile. A draft, cancelled or archived course, or a course of a suspended centre, is readable by anyone who has or guesses the identifier. The public page `/courses/[id]` renders from the same read. Identifiers are UUIDs, so guessing is not practical, but links shared earlier remain live after a suspension.
- Related: FR-057, BR-056, BR-057, EC-106, TC-147, Q-012.

#### Open questions for the product owner

##### Q-011 — Failure response when a parent requests a child they are not linked to
Code requires an approved link (`assertParentOfApprovedChild`) but the status and message sent on failure were not confirmed (403 versus 404). Needed for TC-124 and TC-131. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-012 — Public pages and API for a suspended or inactive centre
What must `/centers/[id]`, `/api/v1/centers/[id]` and `/api/v1/courses/[id]` show once a centre is suspended: not-found, a notice, or the data? Search already hides it. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-013 — Request enrollment while signed out
The course page posts to enrolment requests; the outcome for an anonymous visitor (redirect to sign-in, message, or error) is not established. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-014 — Production value of PUBLIC_ROOT_DOMAIN
Tenant sub-domain routing is dormant when unset. Whether production sets it, and whether centres are promised handle sub-domains, is not documented. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-015 — Who reads contact submissions and how they are notified
The service stores rows only. The back-office reader and any notification expectation (response-time promise on the form) are not established in this module. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-016 — Approval of legal wording
Privacy and terms pages are static text in the repo. Who approves them and which version applies at launch is not documented. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-017 — Are course split and pricing-method fields meant to be public
Confirm whether any of the fields listed in GAP-017 may be exposed to anonymous callers. If not, the fix and the expected response shape must be agreed. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-018 — Suspended or soft-deleted users in search results
For students, teachers and staff inside a centre, should a suspended or soft-deleted user still be found (with a status badge) or be hidden? The provider code was not shown to filter consistently across kinds. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-019 — Canonical marketing site
Which host (ERP marketing pages or apps/www) is the one search engines should index for pricing, FAQ, contact and legal pages, and should the other redirect? UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-020 — Public visibility of demo rows before launch
Confirm that the pre-launch purge is the only protection, or whether public reads should also filter `is_demo` in production. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-021 — Limits for global search
What maximum query length and request rate are acceptable for global search (compare 60 per minute on discovery)? UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

#### Existing automated coverage found (for the tester's orientation)

| Area | Test file | What it covers |
|---|---|---|
| Global search scope | apps/erp/tests/db/global-search.test.ts | Per-role providers, tiers, masking |
| Back-office search | apps/superadmin/tests/db/global-search | Provider table by back-office role |
| Normalisation | apps/erp/tests/db/search-normalize.test.ts, apps/erp/tests/unit/search-text-arabic | Arabic and digit folding |
| Centre directory | apps/erp/tests/db/center-directory-search.test.ts | Directory search |
| Public handles | apps/erp/tests/db/public-handles.test.ts, apps/erp/tests/unit/public-handle-host | Status gate, host parsing |
| Public reads | apps/api/tests/unit/public-reads.test.ts | Profile cache/fresh split, pricing verbatim, sitemap-handles |
| Palette | apps/erp/tests/unit/palette-search | Palette hook |
| Catalog | apps/erp/tests/db/catalog-onboarding.test.ts, second-language-scoping | Catalog selection, second language |
| Meeting link | apps/erp/tests/db/diff02-meeting-link-coverage.test.ts | Paid credential rule |
| Route conventions | apps/api/tests/unit/route-conventions.test.ts | Rate-limit and CDN allowlist |
| Gaps | see GAP-030 | |

### 4.3. Center Administration

Path prefixes as in fr.md (`R/`, `SV/`, `SC/`, `ET`, `MS`, `MG`).

#### Gaps

##### GAP-032 — A removed co-admin keeps the center in the live session
- **Status:** RISK / MISSING PERMISSION
- **Evidence:** the session's centerId is resolved once, when the session is created (SC/erp-auth/create-auth.ts:192-203). `removeCenterAdmin` hard-deletes the `center_admin_profiles` row and writes no audit row (SV/center/admins.ts:37-73). Center-admin routes read `acting.centerId` from the session (SC/authz/center-actor.ts:22-47).
- **Impact on testing:** after removal, a request from the removed admin's existing session must be tested on every center_admin route. Expected per product intent: 403. Code suggests the request succeeds until the session expires.
- **Recommendation:** revoke the target's sessions on removal (or re-check the profile per request), and audit the removal.

##### GAP-033 — A co-admin invite cannot be accepted
- **Status:** NOT IMPLEMENTED
- **Evidence:** `admin_invite` tokens are created (SV/center/admins.ts:111,127), but the purpose is not in CLAIMABLE (SV/invites/invite-token.ts:18-35). A new email gets a shell center_admin with no `center_admin_profiles` row for the center, and the raw token is mailed. An existing user is not checked for role.
- **Impact on testing:** the end-to-end co-admin flow cannot pass. WF-032 is blocked.
- **Recommendation:** make the purpose claimable with a profile insert on claim, or remove the endpoint. Refuse existing users of another role.

##### GAP-034 — Two blacklist representations
- **Status:** CONFLICTING
- **Evidence:** `PATCH /roster/students/[id]` `{blacklisted}` sets only `center_student_roster.blacklisted/blacklistReason`. It writes no `blacklist_entries` row, no cascade, no audit and no notification, and it is allowed for manager (SV/center/roster.ts:284-295; R/roster/students/[studentId]/route.ts:31-37). `POST /center/blacklist` (center_admin only) creates an entry with cascade (SV/blacklist/blacklist.ts:38-60,317-368). Enforcement reads `blacklist_entries` in `assertNotBlacklisted` (SV/blacklist/blacklist.ts:245-268) but reads the roster flag in SV/enrollments/requests.ts:108, SV/center/enrollments.ts:104 and MS:377-381. ui.md: the UI uses the PATCH flag.
- **Impact on testing:** a student blacklisted from the UI may still pass paths that read entries, will not appear in `GET /center/blacklist`, and cannot be lifted through `DELETE /center/blacklist/[id]`.
- **Recommendation:** pick one canonical writer (Q-022). Route the PATCH flag through `centerBlacklistStudentTx` or drop it.

##### GAP-035 — Walk-in and temp-student duplicate detection bypass the "same child" rule
- **Status:** CONFLICTING
- **Evidence:** walk-in matches on exact normalised phone among non-shell, non-deleted users (SV/walk-in/walk-in.ts:154-171). The temp student matches on trimmed phone only (SV/temp-students/temp-students.ts:24-36). Neither uses `findStudentByKeys` / national ID (MS:120-194). The invariant is in docs/decisions/bulk-student-import.md:8-13.
- **Impact on testing:** the same child registered by walk-in with a phone variant (e.g. `01…` vs `+20…` in the temp route) can produce two accounts.
- **Recommendation:** route both through `findStudentByKeys` (Q-024).

##### GAP-036 — Key precedence differs from the decision record
- **Status:** CONFLICTING
- **Evidence:** the code checks national ID, then student code, then phone (MS:124-191). docs/decisions/external-teachers.md:26 says it looks up by phone and then by national ID.
- **Impact on testing:** a row whose phone matches child A and whose national ID matches child B links to B in code but to A per the document.
- **Recommendation:** confirm the intended precedence (Q-026) and align the document or the code.

##### GAP-037 — Center-admin mutations are largely unaudited
- **Status:** RISK
- **Evidence:** the wrapper audit runs only for center_staff (SC/authz/center-actor.ts:86-141), and a failed audit insert is swallowed. Unaudited center_admin writes: staff update/remove (SV/center/staff.ts:345-429), centers/me PATCH (SV/center/center-profile.ts:26-37), co-admin remove (SV/center/admins.ts:37-73), roster remove (SV/center/roster.ts:318-330), rooms (SV/rooms/manage-rooms.ts:26-99) and the roster blacklist flag.
- **Impact on testing:** an audit-log test can only assert rows for staff and for the explicitly audited services.
- **Recommendation:** audit center_admin writes (Q-028). Fail closed or alert on audit write errors.

##### GAP-038 — Commit-time import and manual create attach another center's student
- **Status:** RISK
- **Evidence:** a commit-time import match is upserted onto this roster and its studentCode returned, even when the student was not on the roster (SV/center/bulk-import-students.ts:249-264,302-325). The dry run masks the same match (:226-247). Manual create does the same (MS:238-322,341-348). Walk-in deliberately refuses this (SV/walk-in/walk-in.ts:175-196).
- **Impact on testing:** a manager who knows a phone or national ID can enroll another center's child on their roster and learn the child's code, with no notification to the student.
- **Recommendation:** treat a foreign match like walk-in (masked, not attached) or require a notified add (Q-025).

##### GAP-039 — Manual create with a courseId skips the blacklist
- **Status:** RISK / MISSING VALIDATION
- **Evidence:** `createManualStudent` → `enrollInTeacherCourseTx` without reading `roster.blacklisted` (MS:302-331). `enrollManualStudent` does check it (MS:375-381). Re-activating a left roster row keeps the old flag (MS:316-320).
- **Impact on testing:** a blacklisted student can be enrolled through the create path.
- **Recommendation:** apply the same blacklist check in both paths.

##### GAP-040 — A former center can still read a removed student
- **Status:** RISK
- **Evidence:** `getRosterStudent` finds the roster row without `leftAt: null` (SV/center/roster.ts:165-190), while list and membership checks require it (SV/center/roster.ts:29-107; SV/center/roster-membership.ts:13-40).
- **Impact on testing:** after FR-120, `GET /roster/students/[id]` still returns profile data and wallet balance.
- **Recommendation:** add `leftAt: null`.

##### GAP-041 — Re-registering a temp student overwrites it
- **Status:** MISSING VALIDATION
- **Evidence:** the profile upsert updates fullName and grade and issues a new inviteCode on every call (SV/temp-students/temp-students.ts:40-58).
- **Impact on testing:** a second registration with the same phone silently renames the shell and invalidates an invite code already handed out.
- **Recommendation:** return the existing shell, or ask before overwriting.

##### GAP-042 — Temp-student invite channel is a stub; staff cannot use the shared routes
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** delivery goes to `${phone}@sms.local` (SV/temp-students/temp-students.ts:144). `temp-students` and `send-invite` use `delegatedWithCenter` without staffAllow (R/temp-students/route.ts:18; R/temp-students/[id]/send-invite/route.ts:9).
- **Impact on testing:** no real message is delivered. A receptionist gets 403 on send-invite.
- **Recommendation:** confirm the channel (Q-027).

##### GAP-043 — The guardian-contact rate limit can be spread across students
- **Status:** RISK
- **Evidence:** the key is `${pathname}:${ip}` (SC/rate-limit/middleware.ts:14), and the student id is part of the pathname (R/center/students/[id]/guardian-contact/route.ts:26-41).
- **Impact on testing:** 20 reads per student per window, unlimited across students. Every read is still audited (SV/students/guardian-contact-access.ts:4-25).
- **Recommendation:** key this limit per actor.

##### GAP-044 — Roster student/teacher invites have no consumer, and tokens leak
- **Status:** NOT IMPLEMENTED / RISK
- **Evidence:** the purposes `student_activation` and `teacher_activation` (SV/center/roster.ts:389,416,640) are not claimable (SV/invites/invite-token.ts:18-35). The raw token is mailed and is returned in `meta.inviteToken` whenever `NODE_ENV !== "production"` or `E2E=1` (R/roster/students/invite/route.ts:12,20; R/roster/teachers/invite/route.ts:14,22).
- **Impact on testing:** these flows cannot complete. On a non-production host, the token is visible to the caller.
- **Recommendation:** decide the acceptance path (Q-031) or remove the routes.

##### GAP-045 — Center profile update validation is thin
- **Status:** MISSING VALIDATION
- **Evidence:** coordinates are not range-checked; phone and whatsapp are free strings; description and address have no maximum (R/centers/me/route.ts:12-31; SV/center/center-profile.ts:26-37).
- **Impact on testing:** out-of-range coordinates and very long strings are accepted.
- **Recommendation:** validate lng ±180 / lat ±90, check the phone format, cap lengths.

##### GAP-046 — Audit-log filters are not validated
- **Status:** MISSING VALIDATION / MISSING ERROR HANDLING
- **Evidence:** the raw query is passed through (R/center/audit-logs/route.ts:8). `actorId` goes straight into Prisma, and `new Date(from)` is unchecked (SV/center/center-audit.ts:40-50).
- **Impact on testing:** a bad uuid gives 404 (P2023 mapping); an invalid date gives 500.
- **Recommendation:** add a Zod query schema that returns 400.

##### GAP-047 — Inconsistent input rules for the same entity
- **Status:** MISSING VALIDATION
- **Evidence:** a staff invite with an invalid locale is silently dropped by `.catch` (R/center/staff/[id]/invite/route.ts). The temp-student routes disagree: center route fullName min 1, grade max 50 (R/center/temp-students/route.ts:8-11) vs shared route min 2, max 60 (R/temp-students/route.ts:10-14).
- **Impact on testing:** a one-letter name passes one route and fails the other.
- **Recommendation:** share one schema.

##### GAP-048 — Converting to enrolled reactivates a suspended account
- **Status:** RISK
- **Evidence:** `user.status` is set to `active` (password set) or `shell` regardless of its previous value, and `deletedAt` is cleared (ET:707-714).
- **Impact on testing:** a suspended or soft-deleted teacher regains access through conversion, which bypasses the single suspension mechanism.
- **Recommendation:** refuse conversion when the status is suspended or deleted.

##### GAP-049 — Off-system teacher removal and settlement edges (Payments hand-off)
- **Status:** RISK
- **Evidence:** removal checks only active groups, not the owed balance (ET:586-599). Settlement has a conditional decrement against the owed amount (SV/external-teachers/reconciliation.ts:210-219), but no idempotency key and no check for overlapping periods.
- **Impact on testing:** a double-submitted settlement within the owed amount records two payouts. A removed teacher may still be owed money.
- **Recommendation:** hand to "Payments, Subscriptions, Wallets & Settlement". Add an idempotency key and warn on a balance when removing.

##### GAP-050 — Group capacity check is count-then-insert
- **Status:** RISK
- **Evidence:** the active enrollment count is compared to maxStudents before the create (MS:426-440).
- **Impact on testing:** concurrent enrollments can exceed capacity.
- **Recommendation:** use the conditional decrement or a locked count, as the main enrollment engine does.

##### GAP-051 — UI and API disagree
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence (ui.md):**
  - A receptionist sees Blacklist, Edit and Import controls that return 403.
  - The staff layout has no sub-role gate.
  - There is no UI for guardian contact or co-admins.
  - Hardcoded /dashboard/admin links appear in staff views.
  - Room delete copy says "can't be undone", but the room is only deactivated.
  - Photo limit: 5 MB on the client vs 4 MB on the server (SC/media/images.ts:6).
  - The import dialog has no client size limit, and its loop keeps running after close.
  - Settle amount is unchecked; convert has no confirm.
  - A staff role-change error shows "Couldn't load this data."
  - CopyableText labels are hardcoded in English.
- **Impact on testing:** UI tests must expect 403 toasts for receptionists, and must check the messages.
- **Recommendation:** gate controls by sub-role; fix copy and limits.

##### GAP-052 — Missing field validation (import, rooms)
- **Status:** MISSING VALIDATION
- **Evidence:** the import stores guardianEmail with `norm` only (SV/center/bulk-import-students.ts:277). Room capacity has no maximum (SV/rooms/rooms.ts:35,46). `updateRoom` does not reject an inactive room (SV/rooms/manage-rooms.ts:46-79), while photo upload does (SV/rooms/rooms.ts:92).
- **Impact on testing:** invalid guardian emails reach the child-safety gate; capacity 1,000,000 is accepted.
- **Recommendation:** validate the email; set a capacity maximum (Q-030); refuse updates to inactive rooms.

##### GAP-053 — Missing automated tests
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** no test found under apps/*/tests for:
  - co-admin invite and remove (SV/center/admins.ts);
  - centers/me PATCH;
  - audit-log filters (SV/center/center-audit.ts);
  - walk-in vs import de-duplication;
  - roster PATCH blacklist vs entries;
  - `getRosterStudent` after removal;
  - manual create with courseId on a blacklisted student.
- **Impact on testing:** regressions in these paths go unseen.
- **Recommendation:** add DB tests for the FRs listed under "No automated test was found" in rtm.md.

#### Open questions

##### Q-022 — Which blacklist path is canonical?
Should the roster `blacklisted` flag (PATCH, manager allowed) remain, or must every center block go through `blacklist_entries` with cascade, audit and notification? (GAP-034)

##### Q-023 — Co-admin lifecycle
Should removing a co-admin end their sessions immediately, and should `admin_invite` be claimable (with a profile created on claim)? (GAP-032, GAP-033)

##### Q-024 — Walk-in de-duplication key
Should walk-in and temp-student registration use `findStudentByKeys` (national ID, code, phone variants)? (GAP-035)

##### Q-025 — Foreign matches on import or manual create
Should a commit-time import or manual create silently attach a student held by another center and return their code? (GAP-038)

##### Q-026 — Key precedence
Is the intended precedence national ID → code → phone (code) or phone → national ID (docs/decisions/external-teachers.md:26)? (GAP-036)

##### Q-027 — Temp-student invite channel
What real channel (SMS, WhatsApp) should deliver the temp-student invite code? (GAP-042)

##### Q-028 — Audit scope for center_admin
Which center_admin actions must appear in the center audit log? (GAP-037)

##### Q-029 — Scan tier for back-office roles
What should a super_admin or accountant session see when scanning a card? (FR-153)

##### Q-030 — Room limits
What is the maximum room capacity, and is the facilities list free text or a fixed set? (GAP-052)

##### Q-031 — Roster invites
How is a roster student or teacher invite (`student_activation`, `teacher_activation`) meant to be accepted? (GAP-044)

### 4.4. Courses, Sessions, Enrollment & Attendance

Paths are relative to the repo root. `packages/server-core/src/services` is abbreviated as `services/`. Every Q entry is UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

#### Gaps

##### GAP-054 — Center admins cannot cancel or postpone a session
- **Label:** CONFLICTING
- **Evidence:** The cancel and postpone routes admit `center_admin` (`apps/api/src/routes/v1/sessions/[id]/cancel/route.ts:9-19`, `.../postpone/route.ts:10-26`). The services then compare `existing.teacherId !== teacherId` and throw "Only the assigned teacher can cancel this session" / "Only the assigned teacher can postpone this session" (`services/session-actions/session-actions.ts:52-53`, `:129-130`). The admin schedule has no cancel or postpone control (ui.md).
- **Impact on testing:** The API admits a role that always gets 403. TC-405 records the actual outcome. Testers cannot judge pass or fail until the intent is known.
- **Recommendation:** Decide Q-032. Then either remove `center_admin` from the guard, or pass the session's teacher id for an admin of that center and audit it.

##### GAP-055 — Cancel and postpone have no state guard beyond "completed"
- **Label:** MISSING VALIDATION
- **Evidence:** The only state checks are `status === "completed" || distributedAt` (`session-actions.ts:56`, `:133`). A cancelled session can be cancelled again or postponed (WF-034).
- **Impact on testing:** A cancelled lesson can come back as "postponed", which revives it. Repeated cancels send repeated notifications.
- **Recommendation:** Refuse cancel on a cancelled session, and postpone on a cancelled one, with a 422.

##### GAP-056 — No start-before-end or HH:MM range check on session times
- **Label:** MISSING VALIDATION
- **Evidence:** Course create/patch schedule patterns and the postpone body take `startTime`/`endTime` strings. No `start < end` comparison was found in `services/center/courses.ts` or `session-actions.ts:115-170`.
- **Impact on testing:** TC-409 expects refusal. Inverted slots also distort conflict detection (FR-183).
- **Recommendation:** Validate the HH:MM format, the 00–23 / 00–59 ranges, and start < end in the shared schema.

##### GAP-057 — Suggestions use a UTC day, the counter board uses a Cairo day
- **Label:** CONFLICTING
- **Evidence:** `dayBounds` in `services/attendance/checkin.ts:23-29` uses `setUTCHours(0,0,0,0)`. `todayBounds` in `services/attendance/counter.ts:24-29` is built from `todayKey(now)`, a Cairo-formatted day.
- **Impact on testing:** Between 00:00 and 02:00/03:00 Cairo time, the board and the suggestion list can show different days (TC-436).
- **Recommendation:** Use one Cairo day helper for both reads.

##### GAP-058 — Offline sync bypasses the 7-day edit window
- **Label:** CONFLICTING
- **Evidence:** `services/attendance/sync.ts` checks only `lessonClosed` (cancelled/completed/distributed, `sync.ts:68-69`, `lesson-lock.ts:8-14`). It never calls `isLocked` (`attendance.ts:24-29`), whose 7-day rule forces a reopen for the online register (FR-192, FR-193).
- **Impact on testing:** A device can write attendance for an old, unsettled lesson that the online register would refuse (TC-444). Old offline records change who gets charged at settlement.
- **Recommendation:** Decide Q-035. If the window applies, return a `conflict` with a "window_closed" reason.

##### GAP-059 — Direct enroll has no capacity check; approve can race
- **Label:** RISK
- **Evidence:** Direct enroll (`services/center/enrollments.ts:81-130`) checks only duplicates ("Student already enrolled in this course"). Approve counts active enrollments, then compares with `maxStudents` (`:228-232`), with no row lock. No DB unique constraint on an active enrollment per student and course was found.
- **Impact on testing:** A course can go over capacity (TC-456). Two approvals at once can both pass.
- **Recommendation:** Decide Q-034. Lock the course row before counting, and add a partial unique index on active enrollments.

##### GAP-060 — Counter check-in: no session-date check, and a mode B downgrade
- **Label:** RISK
- **Evidence:** `counterCheckin` (`services/attendance/checkin.ts:262-395`) checks cancelled, `lessonClosed` and the center, but not the session date. Its derived status is `present` only when the mode is counter_only or `doorAt` exists. In mode B this overwrites a register "present" (set by the teacher) and an "absent" with `counter_only`.
- **Impact on testing:** Staff can check a student into next week's lesson. A late counter scan can drop a student out of settlement (FR-188 counts only present).
- **Recommendation:** Decide Q-033 and Q-039. Keep an existing "present" status.

##### GAP-061 — Cancel/postpone notifications skip parents and teacher-direct courses
- **Label:** CONFLICTING
- **Evidence:** Recipients come from `resolveSessionAudience` only when the course has a center; otherwise `centerId` is "" and no audience is resolved (`session-actions.ts:73-75`, `:176-178`). No parent lookup was found there. The teacher UI says: "The reason reaches students and parents, so write it clearly." (`apps/erp/src/messages/en/teacher.json:622`).
- **Impact on testing:** A parent is not told that a lesson they paid for was cancelled. Tests of teacher-direct courses expect no notification.
- **Recommendation:** Decide Q-036. Either notify approved guardians and teacher-direct enrollees, or change the copy.

##### GAP-062 — A future or postponed lesson can be completed
- **Label:** RISK
- **Evidence:** `completeSessionTx` (`services/finance/distribution.ts:631-656`) refuses only "A cancelled session cannot be completed". No date check and no "postponed" check.
- **Impact on testing:** Revenue can be settled before the lesson takes place. Hand-off: "Payments, Subscriptions, Wallets & Settlement".
- **Recommendation:** Decide Q-038. Refuse completion before the session's date and start time.

##### GAP-063 — `sessions` has no row-level security
- **Label:** RISK
- **Evidence:** `packages/database/prisma/migrations/00000000000001_rls_and_constraints/migration.sql:80-84` says `sessions` stays app-layer scoped (via its course), and that adding RLS needs `center_id` copied onto sessions, deferred. The conflict detector matches the same teacher across centers (`services/sessions/conflict-detector.ts`), so a 409 `conflicts` payload may describe another center's session.
- **Impact on testing:** Tenancy rests on each service's own checks. TC-402 and TC-398 should inspect the 409 payload for foreign data.
- **Recommendation:** Return only "teacher busy" for foreign conflicts. Track the RLS item. Hand-off: "Platform, Security & NFR".

##### GAP-064 — No reopen control in the UI
- **Label:** PARTIALLY IMPLEMENTED
- **Evidence:** `POST /attendance/reopen` exists (`services/attendance/attendance.ts:250-300`). No ERP page calls it (ui.md, "Not found in the UI").
- **Impact on testing:** TC-423 to TC-425 must be run against the API. A locked register shows the reopen hint with no button.
- **Recommendation:** Add a reopen action for teachers, admins and managers.

##### GAP-065 — Offline sync writes `centerId ""` for teacher-direct courses
- **Label:** UNCLEAR
- **Evidence:** `centerByCourse.get(session.courseId) ?? ""` (`services/attendance/sync.ts:57`, `:67`).
- **Impact on testing:** It is unknown whether an empty string is stored or used to scope reads. Teacher-direct attendance may not show in reports.
- **Recommendation:** Store null for teacher-direct, or confirm that "" is intended.

##### GAP-066 — `/me/attendance` maps "excused" to "late"
- **Label:** UNCLEAR
- **Evidence:** `services/me/attendance.ts:61`: present stays present, excused becomes "late", every other status (late, counter_only, absent) becomes "absent".
- **Impact on testing:** A student and parent see a counter-only or genuinely late child as absent, and an excused child as late (TC-445).
- **Recommendation:** Decide Q-037.

##### GAP-067 — Parent read of an attendance register with several children
- **Label:** UNCLEAR
- **Evidence:** The parent branch of the register read (`services/attendance/attendance.ts:33` onward) scopes by linked children. The UI has no parent register page (ui.md).
- **Impact on testing:** What a parent with two children in the same lesson sees is not defined.
- **Recommendation:** Confirm the parent's view: only own children's rows, or no register access.

##### GAP-068 — Enrollment request: wrong status code and missing checks
- **Label:** MISSING VALIDATION
- **Evidence:** `createEnrollmentRequest` throws `ForbiddenError("Course not found")` (403, not 404) (`services/enrollments/requests.ts:95`, `:99`). No check for a cancelled course and no capacity check were found in `requests.ts:83-140`.
- **Impact on testing:** Requests for a cancelled or full course are accepted and only fail at approval.
- **Recommendation:** Return 404; refuse cancelled courses; warn when full. Decide Q-040.

##### GAP-069 — The "expired" status update is likely rolled back
- **Label:** UNCLEAR
- **Evidence:** Approve sets the request to "expired" then throws `ExpiredError` in the same transaction (`services/center/enrollments.ts:221-222`).
- **Impact on testing:** After a 410, the request may still read "pending" until the lazy expiry on list (FR-207).
- **Recommendation:** Write the expiry outside the failing transaction, or rely only on lazy expiry. Confirm by DB test.

##### GAP-070 — Reassigning a teacher checks no clashes and notifies nobody
- **Label:** MISSING VALIDATION
- **Evidence:** `reassignCourseTeacherTx` (`services/center/courses.ts:461-476`) checks the new teacher's affiliation only. No conflict detector call and no `notify` were found.
- **Impact on testing:** The new teacher can be double-booked. Students and both teachers are not told (TC-397).
- **Recommendation:** Run the conflict detector on future sessions; notify both teachers and enrollees.

##### GAP-071 — Postponed sessions are missing at the counter
- **Label:** RISK
- **Evidence:** Suggestions filter `status: "scheduled"` (`services/attendance/checkin.ts:163`). The counter board reads use the same status.
- **Impact on testing:** A lesson postponed to today cannot be picked at the counter.
- **Recommendation:** Decide Q-041. Include `postponed` sessions whose new date is today.

##### GAP-072 — Door ignores the mode and accepts a duplicate scan
- **Label:** UNCLEAR
- **Evidence:** `doorTransitionTx` (`services/attendance/checkin.ts:411-497`) does not read the teacher's mode. A repeated scan returns `already_present` with 200.
- **Impact on testing:** In mode A the door screen still works. Whether that is a fault is not defined.
- **Recommendation:** Confirm whether the door applies only in mode B.

##### GAP-073 — The student's course list includes courses they are not enrolled in
- **Label:** UNCLEAR
- **Evidence:** The student branch of `listCourses` (`services/courses/list-courses.ts`) returns courses tied to the student's enrollments in any status, including unenrolled and cancelled ones (TC-384 note).
- **Impact on testing:** The expected list for a student who left a course is not defined.
- **Recommendation:** Confirm whether only active enrollments are listed.

##### GAP-074 — Teacher coverage has no UI caller
- **Label:** PARTIALLY IMPLEMENTED
- **Evidence:** `GET /teacher/coverage` (`services/subscriptions/teacher-coverage.ts`) is not called by any ERP page (ui.md).
- **Impact on testing:** FR-204 can be tested by API only.
- **Recommendation:** Wire it into the teacher attendance or class page, or mark it API-only.

##### GAP-075 — Missing automated tests
- **Label:** MISSING AUTOMATED TEST
- **Evidence:** No test was found for any of these:
  - anonymous course browse and its rate limit;
  - cancel course;
  - reassign course teacher;
  - direct-enroll capacity;
  - the Cairo/UTC day boundary;
  - the unpriced-lesson completion refusal (`services/finance/distribution.ts:285`; a search for the message across `apps/*/tests` found nothing).

  See rtm.md "Existing automated tests".
- **Impact on testing:** Regressions in the binding invariant "an unpriced lesson refuses to complete" would go unnoticed.
- **Recommendation:** Add DB tests, the unpriced refusal first.

#### Questions for the product owner

##### Q-032 — May center admins cancel or postpone a lesson?
- **Context:** The route admits them; the service refuses (GAP-054).
- **Why it matters:** It decides the expected result of TC-405 and whether the admin schedule needs controls.

##### Q-033 — May the counter check a student into a lesson on another day?
- **Context:** `counterCheckin` has no date check (GAP-060).
- **Why it matters:** Early check-ins can trigger payment and mark attendance for a lesson not yet held.

##### Q-034 — Does direct enrollment respect the course capacity?
- **Context:** Approval enforces `maxStudents`, direct enroll does not (GAP-059).
- **Why it matters:** Hall capacity and fire-safety limits; the TC-456 expected result.

##### Q-035 — Should offline sync obey the 7-day edit window?
- **Context:** Sync checks only closed lessons (GAP-058).
- **Why it matters:** It decides whether old offline records can change who is charged.

##### Q-036 — Should parents be notified when a lesson is cancelled or postponed?
- **Context:** The copy promises it; the code does not (GAP-061).
- **Why it matters:** Parents pay; a missed cancellation is a support and trust problem.

##### Q-037 — What are the correct status labels on `/me/attendance`?
- **Context:** excused → late, late/counter_only → absent (GAP-066).
- **Why it matters:** Parents read this as their child's record.

##### Q-038 — May a lesson be completed (settled) before it takes place?
- **Context:** No date guard on completion (GAP-062).
- **Why it matters:** Money moves on completion.

##### Q-039 — In mode B, should a counter scan downgrade a "present" set by the teacher?
- **Context:** GAP-060.
- **Why it matters:** Only "present" students are settled.

##### Q-040 — Should students be able to request a cancelled or full course?
- **Context:** GAP-068.
- **Why it matters:** It decides the expected results for enrollment-request negative tests.

##### Q-041 — Should a lesson postponed to today appear at the counter?
- **Context:** Only "scheduled" sessions are suggested (GAP-071).
- **Why it matters:** The daily counter workflow fails silently for postponed lessons.

##### Q-042 — May an assistant create a teacher-direct course?
- **Context:** The route sends assistants to the teacher-direct branch; the service says "Teacher only" (`services/center/courses.ts:188`, FR-177).
- **Why it matters:** It decides the assistant column in permissions.md and an FR-177 test.

### 4.5. Payments, Subscriptions, Wallets & Settlement

#### Gaps

##### GAP-076 — Paymob sandbox/live checkout is not wired
- **Status:** NOT IMPLEMENTED
- **Evidence:** `packages/server-core/src/services/payments/gateway/paymob-driver.ts:13,92` throws "Paymob checkout is not wired yet — run with PAYMENTS_MODE=mock for now"; `gateway/index.ts:28` refuses mock in production.
- **Impact on testing:** Every online-payment FR (FR-225–018, 025) can be tested only in mock mode. Production cannot start a real checkout; a production deploy with `PAYMENTS_MODE=sandbox|live` returns 500 on initiate/checkout (EC-267).
- **Recommendation:** Treat online payments as "mock-verified only" in the QA report; schedule sandbox tests once the driver lands, re-running TC-490–049 against the Paymob sandbox.

##### GAP-077 — No gateway or wallet refund channel at the counter
- **Status:** NOT IMPLEMENTED (by design)
- **Evidence:** `packages/server-core/src/services/payments/refund-payment.ts:20-26` `COUNTER_REFUND_CHANNELS = ["cash_drawer","bank_transfer"]`; service guard message "This refund channel is not available yet".
- **Impact on testing:** An online (card) payment can only be refunded by cash or bank transfer at the counter; there is no automated reversal to the card. Testers must not expect a gateway refund.
- **Recommendation:** Confirm roadmap with the product owner (Q-046); add a negative test (TC-483) only.

##### GAP-078 — Client/server validation drift on three money forms
- **Status:** MISSING VALIDATION
- **Evidence:** ui.md findings: admin Record Payment requires a class client-side while `POST /api/v1/payments` accepts `courseId` undefined (`payments/payments.ts:31-134`); center credit top-up UI checks only the minimum while the service enforces 1,000–5,000,000 (`center-credit-topup.ts`); expense description limit 300 exists only in the client (`expenses/route.ts` has no max).
- **Impact on testing:** API tests and UI tests produce different results for the same input; a tester may report a "bug" that is a door difference.
- **Recommendation:** Align zod route schemas with the client rules (or drop the client-only rules); test both doors (TC-467, 067, 091).

##### GAP-079 — Per-session pass expiry uses UTC day, not Cairo
- **Status:** CONFLICTING
- **Evidence:** `packages/server-core/src/services/subscriptions/subscriptions.ts:994` `setUTCHours`; the money-day decision is Cairo (`packages/server-core/src/lib/day-range.ts:10-25`, `docs/decisions/money-day-boundary.md`).
- **Impact on testing:** A pass for a session at 22:00–23:59 Cairo may remain `active` up to 2 h into the next Cairo day; coverage/attendance tests near midnight will disagree with BR-206.
- **Recommendation:** Switch the sweep to the Cairo day helper; until then record TC results near midnight as "known conflict".

##### GAP-080 — Shift list upper date bound is UTC
- **Status:** CONFLICTING
- **Evidence:** `packages/server-core/src/services/shifts/shifts.ts:173` appends `T23:59:59.999Z` to the `to` date.
- **Impact on testing:** Shifts closed 22:00–23:59 UTC (00:00–01:59 Cairo) are grouped into the previous day's filter; reconciliation reports by day differ from the Cairo-based payments list (FR-218).
- **Recommendation:** Use `day-range.ts` for both bounds; TC-541 records the current grouping.

##### GAP-081 — Expense delete is a hard delete
- **Status:** CONFLICTING
- **Evidence:** `packages/server-core/src/services/expenses/expenses.ts:112` `delete`; project convention "Destructive operations use soft-delete" (`CLAUDE.md`).
- **Impact on testing:** A deleted expense leaves no audit trail; finance reports change retroactively.
- **Recommendation:** Add `deletedAt` and filter it in list/report queries; TC-556 verifies current behaviour.

##### GAP-082 — Expense date and PATCH fields are under-validated
- **Status:** MISSING VALIDATION
- **Evidence:** `apps/api/src/routes/v1/expenses/route.ts` validates `expenseDate` with a `YYYY-MM-DD` regex only (2026-13-45 passes); PATCH `category`/`expenseDate` are forwarded without re-validation in `expenses.ts`.
- **Impact on testing:** Invalid dates may surface as 500 or as a silently wrong date; category can be set to a value outside `EXPENSE_CATEGORIES` through PATCH.
- **Recommendation:** Use a real date parser in zod and re-apply the create schema on PATCH; TC-555 step 4.

##### GAP-083 — `payments` rows keep the UPDATE privilege
- **Status:** RISK
- **Evidence:** `packages/database/prisma/migrations/20260909120100_money_tables_revoke/migration.sql:24` revokes DELETE only; `refunded_amount`, `refundConfirmedAt` are updated in place by design (`refund-payment.ts:242,471-562`).
- **Impact on testing:** Amount or method of a historical receipt can be changed by any code path with `edura_app`; no DB-level guard exists. Not testable through the API (no route updates amount), so it is a code-review item.
- **Recommendation:** Add a trigger or column-level privilege that blocks updates to `amount`, `payment_method`, `student_id` after insert; document the allowed mutable columns.

##### GAP-084 — Center credit top-up bounds are hard-coded
- **Status:** UNCLEAR
- **Evidence:** `packages/server-core/src/services/wallet/center-credit-topup.ts` constants 1_000 and 5_000_000; student/parent top-ups read `wallet_settings` (`wallet.ts:92-117`).
- **Impact on testing:** Back-office changes to `wallet_settings` do not affect centre credit; testers must use two different bound sources.
- **Recommendation:** Confirm whether centre credit should follow a settings row (Q-047).

##### GAP-085 — Cash wallet top-up at the counter has no server bounds
- **Status:** MISSING VALIDATION
- **Evidence:** `packages/server-core/src/services/wallet/cash-topup.ts:29-100` checks positivity and roster only; no min/max.
- **Impact on testing:** A counter top-up of 1 piaster or 99,999,900 piasters is accepted, unlike the online door (EC-289).
- **Recommendation:** Apply the same `wallet_settings` bounds or confirm the exemption (Q-047).

##### GAP-086 — Parent "Pay" dialog mints a new idempotency key per click
- **Status:** RISK
- **Evidence:** ui.md finding on `/[locale]/dashboard/parent/pay`; the server in-flight guard (`subscriptions.ts:516-554`) catches the second checkout for the same course only.
- **Impact on testing:** Double-click creates two intents when the first has not yet created its subscription; relies on the 422 guard rather than idempotency.
- **Recommendation:** Generate the key once per dialog open and reuse it on retries (as the student page does); TC-515 covers the server side.

##### GAP-087 — Availability probe fails open
- **Status:** RISK
- **Evidence:** ui.md: client treats a failed `GET /api/v1/payments/availability` as "available" and shows card buttons.
- **Impact on testing:** With the API down or online payments disabled, users see card options that then fail with 500/422.
- **Recommendation:** Fail closed (hide card buttons until the probe returns `available:true`).

##### GAP-088 — `staff/finance` page has no page-level role guard
- **Status:** MISSING PERMISSION
- **Evidence:** ui.md finding on `apps/erp/src/app/[locale]/dashboard/staff/finance`; data still comes from role-guarded API routes.
- **Impact on testing:** A receptionist can open the page shell; API calls return 403 so no data leaks, but the UI shows error states instead of redirecting.
- **Recommendation:** Add the same `requireRole` page guard the other staff pages use; test with TC-527 variant (receptionist opens the page).

##### GAP-089 — Points claw-back window is 10 seconds
- **Status:** UNCLEAR
- **Evidence:** `packages/server-core/src/services/gamification/points.ts` claw-back only when the refund occurs within 10 s of the award.
- **Impact on testing:** Almost every real refund keeps the points (EC-295); testers cannot tell intended from accidental.
- **Recommendation:** Product owner to confirm (Q-048); TC-553 documents behaviour.

##### GAP-090 — Counter payment allowed with no open shift
- **Status:** UNCLEAR
- **Evidence:** `payments/payments.ts:31-134` stamps `shiftId` from the open shift if any, else `null` (EC-281).
- **Impact on testing:** Cash recorded outside a shift never appears in `expectedCash`/`variance`; reconciliation cannot be complete.
- **Recommendation:** Either block cash methods without an open shift or report "unshifted cash" separately (Q-049).

##### GAP-091 — No automated tests for several PAY FRs
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** rtm.md "Existing automated tests": nothing found for FR-225/011, 016, 023, 025, 031, 037, 038/039, 042, 045.
- **Impact on testing:** Regressions in cash wallet top-up, centre credit top-up, expenses and settlement preview are caught only manually.
- **Recommendation:** Add DB-suite tests for cash-topup, center-credit-topup and expenses first (money paths), then preview and pricing.

##### GAP-092 — Inconsistent EGP rounding across money pages
- **Status:** UNCLEAR
- **Evidence:** ui.md: some pages show piasters/100 with two decimals, others round to whole EGP.
- **Impact on testing:** The same amount appears as "38.46" on one screen and "38" on another; visual comparisons fail.
- **Recommendation:** One shared formatter (`useFormatters`) everywhere; UI test TC-529 and the fees page should agree.

#### Open questions for the product owner

##### Q-043 — Should assistants be able to trigger session settlement on the teacher's behalf?
Context: assistants are excluded from wallet/payout (`.claude/rules/domain-decisions.md:66-69`), but completing a session (owned by "Courses, Sessions & Attendance") moves money (FR-259). Why it matters: decides whether TC-560/097 need an assistant variant and whether attribution rows are required.

##### Q-044 — Is the Cairo day the rule for every money sweep and report (GAP-079/05)?
Context: `money-day-boundary.md` says Cairo; two code paths use UTC. Why it matters: midnight behaviour of pass expiry and shift reports.

##### Q-045 — Should expenses be soft-deleted like every other destructive operation (GAP-081)?
Context: `CLAUDE.md` convention vs `expenses.ts:112`. Why it matters: audit trail and historical finance reports.

##### Q-046 — Will a gateway (card) refund channel be added, and who may use it (GAP-077)?
Context: online payments can only be refunded by cash/bank transfer. Why it matters: refund SLA to parents; whether to plan tests now.

##### Q-047 — What is the single source of truth for top-up bounds (student, parent, counter, centre credit) (GAP-084/10)?
Context: `wallet_settings` for student/parent online; hard-coded for centre credit; none for counter cash top-ups. Why it matters: boundary tests need one expected value per door.

##### Q-048 — Is the 10-second points claw-back window intended (GAP-089)?
Context: a refund 11 s after payment keeps the points. Why it matters: gamification fairness and the expected result of TC-553.

##### Q-049 — May cash be recorded with no open shift (GAP-090)?
Context: `shiftId` null is accepted. Why it matters: shift reconciliation completeness; TC-465 preconditions.

##### Q-050 — Must payout requests carry bank details at request time?
Context: `POST …/payout-request` takes `{amount?, clientRequestId}` only; payment details are held elsewhere (back-office module). Why it matters: whether a payout can be approved without a bank account on file — UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-051 — Are `needs_review` intents expected to be resolved within a time limit, and by whom?
Context: `payment-intents.ts:264-316` parks mismatches and notifies finance; no SLA in code (NFR-108). Why it matters: a paid customer with no active subscription waits indefinitely.

### 4.6. Teacher Portal, Assistants, Collaboration & Academic Content

Status labels used: IMPLEMENTED, PARTIALLY IMPLEMENTED, NOT IMPLEMENTED, UNCLEAR, CONFLICTING. A gap also carries a category (RISK, MISSING PERMISSION, MISSING VALIDATION, MISSING ERROR HANDLING, MISSING AUTOMATED TEST, NOT INSPECTED).

#### Gaps

##### GAP-093 — GET /grades has no role gate
- Status: PARTIALLY IMPLEMENTED (RISK / MISSING PERMISSION).
- Evidence: apps/api grades route and services/grades/grades.ts listGrades: where clause is left empty for center_staff, super_admin and accountant; these roles run in platform context (db/scope.ts:24), so every grade and score is returned.
- Impact on testing: a tester must try GET /grades as center_staff and accountant and expect refusal or tenant scoping; the product owner may state it is intended (Q-059).
- Recommendation: confirm intent; if unintended, add a role gate or centre scoping and an automated test.

##### GAP-094 — Upload size limit differs between UI and server
- Status: CONFLICTING.
- Evidence: teacher-materials-screen.tsx:75 MAX_UPLOAD_BYTES 20 MB and catalog text "max 20MB"; services/materials/materials.ts enforces 10 MB; teacher guide also says 20 MB.
- Impact on testing: a 10-20 MB PDF passes the UI and fails at the server.
- Recommendation: align both and the guide (Q-052).

##### GAP-095 — GET /reviews filters are open to any authenticated role
- Status: PARTIALLY IMPLEMENTED (RISK / MISSING PERMISSION).
- Evidence: reviews service uses platformDb with optional teacherId, studentId, courseId filters and no role check; response includes student names and comment text.
- Impact on testing: a student can list another student's reviews with studentId; a teacher can list other teachers' reviews. Privacy exposure.
- Recommendation: confirm who may see what (Q-055) and restrict.

##### GAP-096 — Delegation audit is best effort and thin
- Status: PARTIALLY IMPLEMENTED.
- Evidence: authz/teacher-actor.ts delegated(): a failed audit write is only logged; the entry stores only path and method (action assistant.<method>, onBehalfOf).
- Impact on testing: cannot prove what an assistant changed; failure path cannot be observed from the UI.
- Recommendation: decide if audit failure must fail the action and whether changed values are recorded.

##### GAP-097 — Assistant already on another team gives a generic error
- Status: PARTIALLY IMPLEMENTED.
- Evidence: unique index teacher_assistants_one_active_teacher_per_assistant; P2002 mapped to 409 "A record with these unique values already exists".
- Impact on testing: message is not actionable for the teacher.
- Recommendation: specific message.

##### GAP-098 — Team screen capability text omits collaborations
- Status: CONFLICTING.
- Evidence: panel "Exactly what an assistant can do" does not mention collaboration requests or affiliations, yet the code lets assistants act on them (approved decision 9: everything except wallet/payouts and managing assistants).
- Impact on testing: expected assistant rights differ between UI text and API.
- Recommendation: update the text or restrict (Q-063).

##### GAP-099 — proposedCenterShare is accepted but ignored
- Status: CONFLICTING.
- Evidence: collaboration create route schema accepts proposedCenterShare; service stores 0 and the UI shows "Set by platform".
- Impact on testing: a value sent through the API is silently discarded.
- Recommendation: reject the field or document it (Q-061).

##### GAP-100 — Grade maxScore and name validation
- Status: PARTIALLY IMPLEMENTED (MISSING VALIDATION).
- Evidence: zod allows a non-integer maxScore while Grade.maxScore is an Int; PATCH can lower maxScore below stored scores and can change a letter grade's max (forced to 4 on create); name has no trim or length cap; date check is a regex only, not a calendar check.
- Impact on testing: outcomes for 10.5, shrinking max, 2026-02-31 are undefined (likely 500 or inconsistent data).
- Recommendation: validate integer, forbid shrinking below existing scores, trim and cap name, parse the date.

##### GAP-101 — Material type and title not validated
- Status: PARTIALLY IMPLEMENTED (MISSING VALIDATION).
- Evidence: materials service passes type through to the enum column; title has no length limit.
- Impact on testing: type=banana probably gives 500 instead of 400.
- Recommendation: validate against Lecture, Homework, Exam, Other and cap title.

##### GAP-102 — Replacing a material file can lose the old file
- Status: PARTIALLY IMPLEMENTED (MISSING ERROR HANDLING).
- Evidence: materials.ts PATCH path destroys the old Cloudinary asset before the new upload succeeds.
- Impact on testing: simulate storage failure on replace and check that the material still downloads.
- Recommendation: upload first, then delete the old asset.

##### GAP-103 — Notification failure may fail the upload
- Status: UNCLEAR.
- Evidence: material-uploaded notification is awaited in the create path; whether errors are swallowed was not confirmed.
- Impact on testing: material may exist even though the API returned an error.
- Recommendation: confirm and make notification fire-and-forget.

##### GAP-104 — Expired affiliation accept may not persist the expired status
- Status: UNCLEAR.
- Evidence: acceptAffiliation writes status expired and then throws inside the same transaction, so the write may roll back.
- Impact on testing: the row may stay pending after the error until the sweep job runs.
- Recommendation: confirm by test.

##### GAP-105 — Eligible-teachers list returns teacher emails
- Status: PARTIALLY IMPLEMENTED (RISK).
- Evidence: GET /reviews/eligible response includes teacher email.
- Impact on testing: check whether students should see teacher emails.
- Recommendation: confirm and remove if not needed (NFR-123).

##### GAP-106 — Malformed invite body is silently accepted
- Status: PARTIALLY IMPLEMENTED.
- Evidence: invite route falls back to locale ar when the body cannot be parsed.
- Impact on testing: a bad body returns success with Arabic mail instead of 400.
- Recommendation: low priority; return 400.

##### GAP-107 — Rate limiting is only on the assistant invite route
- Status: PARTIALLY IMPLEMENTED.
- Evidence: withRateLimit used in assistants/[id]/invite/route.ts only (10 burst, 10 per minute). No limit declared on uploads, accept, review creation. Global or edge limiter UNKNOWN.
- Impact on testing: abuse tests (upload flood) cannot be assumed to be blocked.
- Recommendation: confirm platform-level limiter.

##### GAP-108 — Public handle card not inspected
- Status: UNCLEAR.
- Evidence: PublicHandleCard appears on teacher settings; its behaviour and API were not read.
- Impact on testing: no test cases written for it.
- Recommendation: add scope after product owner input.

##### GAP-109 — Blacklist and temporary student have no UI entry point in scope
- Status: UNCLEAR.
- Evidence: routes exist (teacher/blacklist, teacher/temp-students) but no teacher page in the module's page list calls them; they may be used from other modules' screens.
- Impact on testing: tests are API-level only (TC for FR-271, 010, 011).
- Recommendation: confirm where the UI lives.

##### GAP-110 — Collaboration time strings not range-checked
- Status: PARTIALLY IMPLEMENTED (MISSING VALIDATION).
- Evidence: startTime and endTime pass a HH:MM regex, so 99:99 is accepted; only endTime greater than startTime is compared as text.
- Impact on testing: invalid times can produce bad sessions on accept.
- Recommendation: validate 00:00..23:59.

##### GAP-111 — No pagination and silent filter handling on request list
- Status: PARTIALLY IMPLEMENTED.
- Evidence: collaboration.ts list capped at 100 rows; unknown status value is ignored.
- Impact on testing: centres with more than 100 requests lose rows.
- Recommendation: add paging and validate status.

##### GAP-112 — Missing automated tests for the highest-risk flows
- Status: NOT IMPLEMENTED (MISSING AUTOMATED TEST).
- Evidence: no test found for assistant revoke end to end, review eligibility, grade score boundaries, collaboration accept happy path beyond hall-booking, GET /grades role scoping, or cross-teacher reads of grades (only l08 header scope).
- Impact on testing: manual coverage is the only protection.
- Recommendation: add the tests in tc.md as automation candidates.

##### GAP-113 — Several UI screens not inspected line by line
- Status: UNCLEAR (NOT INSPECTED).
- Evidence: teacher-team-screen, gradebook, materials, reviews, dashboard, student grades, materials, reviews, find-teacher, emulators and team-notes-board were read via message catalogs and the teacher guide only.
- Impact on testing: ui.md strings for those screens should be checked on the running app.
- Recommendation: tester updates Actual Result notes.

##### GAP-114 — No review delete, hide or moderation route
- Status: NOT IMPLEMENTED.
- Evidence: reviews routes are create, list, eligible, edit only.
- Impact on testing: abusive or mistaken reviews cannot be removed by any role in this module.
- Recommendation: product decision (Q-060).

##### GAP-115 — Team notes route and service not read
- Status: UNCLEAR (NOT INSPECTED).
- Evidence: team-notes routes were listed as reference only; docs/decisions/team-notes.md and tests/db/team-notes.test.ts exist.
- Impact on testing: FR-308 has one test case and no validation rules.
- Recommendation: separate review.

#### Open questions for the product owner

##### Q-052 — What is the correct maximum PDF size, 10 MB or 20 MB?
UI and guide say 20 MB, server says 10 MB (GAP-094).

##### Q-053 — Should two open requests for the same teacher, centre and subject but a different grade be blocked?
Currently blocked because the index key has no grade or hall (EC-311).

##### Q-054 — May a request be rejected or cancelled after its expiry date but before the sweep?
Currently allowed (EC-314).

##### Q-055 — Who may read reviews, and may students see other students' reviews and names?
Currently any authenticated role with filters (GAP-095).

##### Q-056 — How long is a signed material download link valid, and is it revoked when the student is unenrolled?
UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (EC-350).

##### Q-057 — Does revoking an assistant end their live sessions immediately and what happens to their open conversations?
Link check happens per call; websocket or chat sessions not verified (FR-267).

##### Q-058 — Does a resent invite invalidate earlier invite links?
UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (FR-266).

##### Q-059 — Should centre staff, accountants or super admins read every grade through GET /grades?
GAP-093.

##### Q-060 — Should teachers or admins be able to reply to, hide or delete reviews?
GAP-114.

##### Q-061 — Should proposedCenterShare be removed from the API or honoured?
GAP-099.

##### Q-062 — May a teacher change the price of a class created by accepting a collaboration, and who sets the centre share?
The teacher guide carries a "[Needs confirmation from the team...]" note.

##### Q-063 — May assistants accept or reject collaboration requests and centre invitations on behalf of the teacher?
Code allows it; team screen text does not say so (GAP-098).

### 4.7. Student & Parent Portals

Status labels follow the brief. Every entry has code evidence; unknowns are marked `UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION`.

#### Gaps

##### GAP-116 — Parent and student isolation is application-level only
- **Status:** RISK
- **Evidence:** `packages/server-core/src/db/scope.ts:13-28` gives tenant context only to a center_admin with a center; every other role, including parent and student, runs in platform context. `packages/server-core/src/services/parent-links/parent-links.ts` uses `scopedDb`.
- **Impact on testing:** A missed ownership check on any parent/student route is a direct horizontal data leak, with no database policy as a safety net. Every route taking `studentId` must be tested with a foreign id.
- **Recommendation:** Keep the studentId-tampering cases (TC-686, TC-690, TC-709, TC-712, TC-727) in every regression run; consider a database policy or a shared guard test.

##### GAP-117 — Account enumeration through link lookups
- **Status:** RISK
- **Evidence:** `packages/server-core/src/services/parent-links/parent-links.ts:54-76` returns 404 'Student not found' / 'Parent not found' versus 201 for a real account, to any signed-in parent or student.
- **Impact on testing:** A signed-in user can probe whether an email or phone belongs to a student or parent. Testers should confirm the behaviour and the absence of throttling.
- **Recommendation:** Product owner to decide the acceptable disclosure level (Q-064); add a rate limit and/or a neutral response.

##### GAP-118 — One approved parent per student is not enforced by the database
- **Status:** MISSING VALIDATION
- **Evidence:** Check-then-write in `packages/server-core/src/services/parent-links/parent-links.ts:78-86` and `packages/server-core/src/services/parent-links/parent-links.ts:152-155` with no row lock; index `parent_student_link_one_live` covers only the (parent, student) pair.
- **Impact on testing:** Two simultaneous approvals could leave a student with two approved parents. Concurrency result is unverified (TC-680 records it).
- **Recommendation:** Add a partial unique index on approved links per student or lock the student row inside the transaction.

##### GAP-119 — Bare student code resolves for any signed-in viewer
- **Status:** RISK
- **Evidence:** `packages/server-core/src/services/students/student-scan.ts:47-50`: anonymous bare code gives `invalid`, signed-in bare code resolves with the signed_in tier (masked name/phone).
- **Impact on testing:** A signed-in user (including any parent or student) who knows or guesses a student code can see masked identity data without holding the QR.
- **Recommendation:** Product owner to confirm intent (Q-067); if unintended, require the signature for non-staff viewers.

##### GAP-120 — No rate limit on link, scan, card, rotate or oversight routes
- **Status:** MISSING PERMISSION
- **Evidence:** `apps/api/src/routes/v1/search/courses/route.ts:8-43` is the only route in the module wrapped with `withRateLimit`; the public scan route and `POST /parent-links` have none (`packages/server-core/src/rate-limit/middleware.ts`).
- **Impact on testing:** Code guessing against the scan route and family-code guessing against `POST /parent-links` are not throttled. Testers cannot rely on a 429 for these routes.
- **Recommendation:** Specify limits per route (Q-070) and add automated tests.

##### GAP-121 — Family code and phone matching is exact
- **Status:** RISK
- **Evidence:** Family-code lookup `packages/server-core/src/services/parent-links/parent-links.ts:44-53` and phone lookup `packages/server-core/src/services/parent-links/parent-links.ts:54-76` compare the raw string: lower case, trailing spaces, '+20' or spaces cause 404.
- **Impact on testing:** Real users typing codes or phone numbers in a different format will be told the code or person does not exist.
- **Recommendation:** Decide a normalisation rule (Q-066) and test it.

##### GAP-122 — Parent UI cannot send a phone number
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `apps/erp/src/features/parent/parent-linking-screen.tsx` validates the field with `z.string().email(...)` and never sends `phone`; the API accepts `phone`.
- **Impact on testing:** The phone path is only reachable by calling the API directly. UI tests will see 'Invalid email address.' for a phone.
- **Recommendation:** Either allow phone in the form or remove the phone path; update the field label 'Student Email or Phone'.

##### GAP-123 — No notification to the initiator on approve, reject or revoke; notify failure after commit
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `packages/server-core/src/services/parent-links/parent-links.ts:111` calls `notify` after the link transaction for new pending requests only; no equivalent for approve/reject/revoke.
- **Impact on testing:** The initiating party must poll the links list to learn the outcome. A failing `notify` after commit could return an error although the link exists (UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION).
- **Recommendation:** Confirm whether outcome notifications are required; wrap notify so it cannot fail the request.

##### GAP-124 — Checklist 'blocking' flag does not match the card gate
- **Status:** CONFLICTING
- **Evidence:** `packages/server-core/src/services/students/student-card.ts:276-294` marks name and phone `blocking:false`, guardianEmail and academic `blocking:true`; `packages/server-core/src/services/students/student-card.ts:301` and `:350` require every item done.
- **Impact on testing:** A student missing only a phone is labelled non-blocking but still gets no card (422 PROFILE_INCOMPLETE).
- **Recommendation:** Align the label with the gate or relax the gate (Q-071).

##### GAP-125 — Print route returns the generic 404 page for every failure
- **Status:** MISSING ERROR HANDLING
- **Evidence:** `/student-id/print` renders a 404 for incomplete profile, pending code, wrong studentId and non-approved parent alike.
- **Impact on testing:** A tester cannot distinguish 'no card yet' from 'not allowed'; paper layout and RTL print fidelity were not inspected.
- **Recommendation:** Show a specific message for incomplete profile; verify print layout manually.

##### GAP-126 — Roster choice endpoint has no UI caller
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `POST /api/v1/me/roster/choice` exists; no caller found under `apps/erp/src` (searched `roster/choice`).
- **Impact on testing:** The feature is testable only through the API; side effects on subscriptions and attendance at the left centers are unspecified (Q-069).
- **Recommendation:** Confirm whether a UI is planned; define side effects before testing.

##### GAP-127 — Non-numeric `beforeSeq` / `limit` on the oversight thread route
- **Status:** MISSING VALIDATION
- **Evidence:** The thread route parses both with `Number()`; NaN behaviour is not guarded in the code reviewed.
- **Impact on testing:** Possible 500 or silently ignored parameter. Result recorded by TC-727.
- **Recommendation:** Validate with zod and return 400.

##### GAP-128 — Brief expects a student subject-request lifecycle; code has teacher-only requests
- **Status:** CONFLICTING
- **Evidence:** `POST /api/v1/me/subject-requests` and `GET /api/v1/me/subjects` are teacher-guarded; no student route or page exists.
- **Impact on testing:** A student-side lifecycle cannot be tested because it does not exist. Only create and de-duplicate are testable.
- **Recommendation:** Product owner to confirm scope (Q-068).

##### GAP-129 — Revoke / cancel controls missing in the UI
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `parent-linking-screen.tsx` shows Revoke only on approved rows and no action on a parent's own pending row; the student family screen has no revoke control, while `DELETE /api/v1/parent-links/{id}` allows both parties.
- **Impact on testing:** A student cannot unlink a parent and a parent cannot cancel a pending request from the UI; testers must use the API for those paths.
- **Recommendation:** Add the controls or document that they are API-only (Q-072).

##### GAP-130 — Development fallback secret for card signing
- **Status:** RISK
- **Evidence:** `packages/server-core/src/services/students/student-qr.ts:16-20`: outside production a built-in fallback is used when `STUDENT_QR_SECRET` is unset.
- **Impact on testing:** A non-production environment without the variable signs cards with a publicly known key; cards from it verify on any other environment lacking the variable.
- **Recommendation:** Set the variable in every shared environment; test the production fail-closed path in an isolated environment only.

##### GAP-131 — No direct automated tests for linking, scope and scan tiers
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** Searched `apps/*/tests` and `packages/*/tests`: no test calls `parent-links` create/approve/reject/revoke, family-code rotation, `scope=all`, the scan tiers through the route, roster choice or subject requests (see rtm.md).
- **Impact on testing:** The highest-risk behaviours rely entirely on manual testing.
- **Recommendation:** Add DB-level tests for the cases in TC-649 to TC-682.

##### GAP-132 — Parent portal Playwright spec appears stale
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** `apps/erp/tests/playwright/parent-portal.spec.ts` uses `.ant-*` selectors and expects 'Enter the family code', while the UI shows 'Please enter a family code.' (`apps/erp/src/messages/en/parent.json:95`).
- **Impact on testing:** The spec probably fails or is skipped; it gives no regression protection.
- **Recommendation:** Rewrite against the current UI.

#### Open questions for the product owner

##### Q-064 — Should account lookups by email or phone reveal whether the account exists?
- **Context and why it matters:** Today the response differs (GAP-117). Determines the expected result for TC-657 and any throttling. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-065 — Should a student have more than one approved guardian?
- **Context and why it matters:** FR-322 and BR-268 enforce exactly one approved parent. Divorced or two-parent families may need two. Decides whether the single-parent guard is a defect or a rule. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-066 — What normalisation applies to family codes and phone numbers?
- **Context and why it matters:** Both are matched exactly today (GAP-121). Affects whether lower case, spaces and '+20' formats should succeed. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-067 — Is disclosure of masked identity for a bare student code to signed-in users intended?
- **Context and why it matters:** GAP-119. Decides whether a signed-in parent or student seeing masked data from a bare code is expected. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-068 — Should students be able to file subject requests, and is a request lifecycle (review, status) in scope?
- **Context and why it matters:** Only a teacher-side create exists (FR-342, GAP-128). The testing focus listed a lifecycle. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-069 — What happens to subscriptions and attendance at the centers a student leaves via roster choice?
- **Context and why it matters:** FR-338, GAP-126. Needed to write expected results for the roster choice tests. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-070 — What rate-limit policy applies to link creation, scan, card and rotate routes?
- **Context and why it matters:** GAP-120. Without numbers, no pass/fail threshold can be tested. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-071 — Should the card gate require every checklist item, or only those flagged blocking?
- **Context and why it matters:** GAP-124. Decides whether TC-689 is a defect. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-072 — Should students be able to revoke a parent, and parents cancel a pending request, from the UI?
- **Context and why it matters:** GAP-129. Decides whether the missing controls are defects. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-073 — Should rotating the family code also cancel pending requests, and should the old code be remembered?
- **Context and why it matters:** BR-272 says rotation changes only the code. Pending requests created with the old code survive today. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

##### Q-074 — What do the student and parent settings pages and Find a Teacher internals contain?
- **Context and why it matters:** FR-337 and FR-348 are UNCLEAR; these pages were not inspected in depth. UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION.

### 4.8. Messaging, Notifications & Communication Integrations

#### Gaps

##### GAP-133 — `guardian_required` returns HTTP 500 over REST

- **Status:** MISSING ERROR HANDLING
- **Evidence:** services/messages/messages.ts:21-40 (toAppError maps recipient_not_found, policy_denied, no_relationship, not_participant, blocked, rate_limited, invalid_body; `guardian_required` falls to the default 500 `internal`). UI `TERMINAL_SEND_CODES` lacks it, so the client retries over REST and shows only a generic failure. FR-350, FR-353, FR-374, BR-298, EC-426.
- **Impact on testing:** A locked minor who starts a conversation sees a generic error instead of the lock explanation; testers will report a server fault. The socket ack does carry the code, so REST and websocket behave differently.
- **Recommendation:** Map `guardian_required` to 403 with the documented lock message and add it to the UI terminal codes; show a lock banner.

##### GAP-134 — Guardian lock, relationship and matrix are not re-checked on existing conversations or groups

- **Status:** CONFLICTING
- **Evidence:** chat.ts `appendMessage` checks only the block; decision doc docs/decisions/email-invites-guardian.md says the lock is the single rule. BR-304, BR-303, FR-360, EC-419, EC-420.
- **Impact on testing:** A minor whose guardian email is removed, or a student unenrolled from a teacher, keeps messaging an old thread. Test cases for the lock must cover new threads only unless the owner decides otherwise.
- **Recommendation:** Decide with the Product Owner (Q-076); if the rule must hold, re-run the gate in appendMessage and group posting.

##### GAP-135 — Gate order differs from the decision document

- **Status:** CONFLICTING
- **Evidence:** chat-scope.ts `assertCanReach` (~line 799) consumes the new-conversation rate limit before matrix, relationship, lock and block checks. BR-297, BR-308.
- **Impact on testing:** Denied attempts (for example blocked or unrelated users) still spend the 10-token bucket; a tester may hit 429 before seeing the real denial.
- **Recommendation:** Move the limiter after the permission checks, or update the decision document.

##### GAP-136 — Mail layer conflicts with the project notes

- **Status:** CONFLICTING
- **Evidence:** Main checkout mail service supports provider console or smtp with one MAIL_FROM (BR-331, FR-403). The project memory and brief describe Resend with hello@ / auth@ senders; that code exists only in a git worktree, not in /Users/ali/edura main.
- **Impact on testing:** Email test cases (invites, digest, guardian verification) cannot be run against Resend behaviour; provider in production is UNKNOWN.
- **Recommendation:** Confirm the production provider (Q-075) and align code or documentation.

##### GAP-137 — Report accepts an unvalidated reportedUserId

- **Status:** MISSING VALIDATION
- **Evidence:** chat-safety.ts `fileReport`: a client-supplied reportedUserId overrides the derived counterpart with no existence or relationship check; a group messageId is not matched to the group. FR-368, FR-370, BR-313, EC-442, EC-443, EC-444.
- **Impact on testing:** Any user can file reports naming arbitrary users, notifying all super_admins and possibly setting involvesMinor wrongly. No rate limit on the route.
- **Recommendation:** Validate the reported user as a participant or group member, check the messageId, and rate-limit reports.

##### GAP-138 — Push subscription endpoint is not allow-listed and can be taken over

- **Status:** RISK
- **Evidence:** me/push-subscription/route.ts:19 uses `z.string().url()`; registration is delete-then-create (BR-318). FR-394, EC-457, EC-458.
- **Impact on testing:** The server will POST to any registered URL (SSRF risk). A second user registering the same endpoint steals the subscription.
- **Recommendation:** Restrict endpoints to known push-service hosts and require https; reject endpoints owned by another user (Q-081).

##### GAP-139 — Broadcast validation and abuse limits missing

- **Status:** MISSING VALIDATION
- **Evidence:** notifications/broadcast/route.ts:15 and the broadcast service: scope course without courseId throws a plain Error (500); title and body have no maximum length; no rate limit; ownership of courseId by the caller's center not confirmed; uses `user.centerId!`. FR-392, BR-317, EC-452, EC-453, EC-454.
- **Impact on testing:** Broadcast tests must expect 500 for a missing courseId. Possible notification flooding and cross-center targeting is UNKNOWN.
- **Recommendation:** Return 400 for missing courseId, cap lengths, rate-limit, and verify the course belongs to the center (Q-087).

##### GAP-140 — Center broadcast reaches only enrolled students and parents

- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** Broadcast service resolves recipients through active enrollments. FR-392, BR-317, EC-455.
- **Impact on testing:** Roster students without an active enrollment, teachers and staff receive nothing; the UI text may promise more.
- **Recommendation:** Confirm intended audience with the Product Owner.

##### GAP-141 — Unread notification counter is inconsistent

- **Status:** CONFLICTING
- **Evidence:** `getUnreadCounts` counts rows with readAt null, but mark-read sets only `read = true`. The /me/unread-counts route has no frontend caller. FR-387, FR-390, BR-336, EC-451.
- **Impact on testing:** Counter never drops after reading; latent because nothing calls it yet.
- **Recommendation:** Make both paths write the same field (Q-080).

##### GAP-142 — Notifications screen shows only the 20 newest

- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** NotificationsScreen requests the default page (20) with no pagination; the unread tab filters client side while Mark all read is server-wide. FR-389, FR-415, EC-450.
- **Impact on testing:** Older notifications are unreachable; unread tab can show zero while unread items exist beyond 20.
- **Recommendation:** Add pagination or a larger page size (Q-082).

##### GAP-143 — Assistant messaging has no UI page

- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** Assistant messages page redirects; API allows assistants in the matrix. FR-416, EC-476.
- **Impact on testing:** API test cases for assistants pass but cannot be executed through the UI.
- **Recommendation:** Confirm whether assistants should have a messaging UI (Q-079).

##### GAP-144 — FCM_PUSH_TYPES is dead code

- **Status:** UNCLEAR
- **Evidence:** Constant exists in the notifications code but is not referenced; CHANNEL_MATRIX decides channels. FR-388, BR-315.
- **Impact on testing:** Testers may assume push is restricted to that list; it is not.
- **Recommendation:** Remove or wire it in; document actual push behaviour.

##### GAP-145 — REST client maps every 403 to the blocked notice

- **Status:** MISSING ERROR HANDLING
- **Evidence:** Chat client shows 'You can no longer send messages in this conversation.' for policy_denied, no_relationship, not_participant and blocked alike. FR-353, FR-411.
- **Impact on testing:** Users blocked, unrelated or denied by policy see the same message; error text cannot be asserted per cause.
- **Recommendation:** Return distinct messages per code (Q-086).

##### GAP-146 — Socket authorization is never re-validated; presence is per process

- **Status:** RISK
- **Evidence:** apps/realtime/src/server.ts checks the 60 s token at connect only; presence registry is in memory. FR-383, FR-357, BR-326, EC-434, EC-473.
- **Impact on testing:** A suspended or logged-out user keeps receiving and sending events until the socket closes. Behaviour with several realtime instances is UNKNOWN.
- **Recommendation:** Re-check status on events or force disconnect on suspension; confirm deployment topology (Q-085).

##### GAP-147 — Most messaging REST routes have no rate limit

- **Status:** MISSING VALIDATION
- **Evidence:** Only the send paths use the token bucket; blocks, reports, contacts, list, mute, read and oversight routes have no limiter. Only guardian-contact, guardian-verification and guardian/verify use withRateLimit. FR-362.
- **Impact on testing:** Abuse or load tests will not meet throttling on these routes.
- **Recommendation:** Add limits on reports and blocks at minimum.

##### GAP-148 — Conversation list accepts garbage `before` and `limit`

- **Status:** MISSING VALIDATION
- **Evidence:** GET /messages/conversations parses `before` and `limit` without zod validation; garbage yields Invalid Date or NaN. FR-351, BR-338, EC-437.
- **Impact on testing:** Expected status for malformed pagination is undefined; may return 500.
- **Recommendation:** Validate with zod and return 400.

##### GAP-149 — Whitespace-only body is rejected with the wrong status

- **Status:** MISSING VALIDATION
- **Evidence:** zod min(1) accepts spaces; the service rejects as invalid_body and the API returns 422 `business_rule` rather than 400 `validation_error`. FR-363, BR-305, EC-427.
- **Impact on testing:** Tests asserting 400 for blank messages fail.
- **Recommendation:** Trim in the schema or document 422.

##### GAP-150 — Mock modes report success

- **Status:** RISK
- **Evidence:** WHATSAPP_MODE defaults to mock and returns ok with a wamid.MOCK id; SMS has only a console driver; PUSH_MODE=mock; mail console. FR-398, FR-399, FR-400, FR-403, BR-320, BR-321, BR-331, EC-460, EC-461, EC-462, EC-465.
- **Impact on testing:** Delivery cannot be verified in lower environments; a production deployment missing variables looks healthy while nothing is delivered.
- **Recommendation:** Expose the active mode to operators; fail loudly in production.

##### GAP-151 — Stale documentation path for WhatsApp templates

- **Status:** UNCLEAR
- **Evidence:** docs/guides/whatsapp-templates.md cites apps/www/src/lib/services/whatsapp/templates.ts; the code is in packages/server-core/src/services/whatsapp/templates.ts. FR-400.
- **Impact on testing:** Testers following the guide cannot find the templates.
- **Recommendation:** Update the guide.

##### GAP-152 — Automated test coverage gaps

- **Status:** MISSING AUTOMATED TEST
- **Evidence:** No tests for apps/realtime; none for the group guardian lock, the `guardian_required` HTTP mapping, broadcast, report forgery or the existing-thread bypass; messaging-scope.test.ts has no guardian references; NULL due-date locked case not asserted (docs/reports/guardian-gate-findings.md). See the Existing automated tests table in rtm.md.
- **Impact on testing:** These areas rely on manual testing only.
- **Recommendation:** Add the listed tests before release.

##### GAP-153 — Block has no relationship or role restriction

- **Status:** UNCLEAR
- **Evidence:** chat-safety.ts `blockUser`: any existing user can be blocked, including super_admins; the adult-blocks-minor flag applies to adult roles only. FR-364, FR-369, BR-311, BR-312.
- **Impact on testing:** Parents blocking a minor's teacher, or users blocking staff, raise no flag; intended behaviour unclear.
- **Recommendation:** Confirm scope of the flag (Q-078).

##### GAP-154 — Recipient status is not checked for existing threads or notifications

- **Status:** RISK
- **Evidence:** appendMessage does not verify the recipient is active; `notify()` ignores user status. FR-388, EC-456.
- **Impact on testing:** Suspended or deleted users still receive rows, push and email.
- **Recommendation:** Filter by users.status in notify and appendMessage.

##### GAP-155 — Message attachments not implemented

- **Status:** NOT IMPLEMENTED
- **Evidence:** FR-417. No upload field in the message schema or composer.
- **Impact on testing:** No attachment test cases possible; ensure product expectation is text only.
- **Recommendation:** Confirm out of scope.

##### GAP-156 — No user-facing delete or edit of a message

- **Status:** UNCLEAR
- **Evidence:** `softDeleteMessage` exists in chat.ts but no route uses it; admin path unknown. FR-418.
- **Impact on testing:** The 'Message removed' display cannot be triggered by testers except through the database.
- **Recommendation:** Confirm who may remove messages and expose it.

##### GAP-157 — Back-office messaging and group sync triggers not inspected

- **Status:** UNCLEAR
- **Evidence:** services admin/messaging.ts and admin/whatsapp-messages.ts were not inspected; triggers calling group membership sync are unknown. FR-375.
- **Impact on testing:** Superadmin message oversight and roster-change behaviour cannot be specified.
- **Recommendation:** Cover in a follow-up review.

##### GAP-158 — Cron secrets and schedule are not verifiable from the repository

- **Status:** UNCLEAR
- **Evidence:** .github/workflows/cron.yml needs CRON_SECRET and CRON_BASE_URL repository secrets. FR-407, FR-410, EC-470.
- **Impact on testing:** If missing, reminders and the weekly digest never run and nothing alerts.
- **Recommendation:** Confirm configuration (Q-083).

#### Questions for the Product Owner

##### Q-075 — Is production email sent through Resend or SMTP?

- **Context and why it matters:** The main checkout has smtp/console only; notes mention Resend with two senders. Decides how GAP-136 is closed and which email test cases apply.

##### Q-076 — Must the guardian lock and relationship be enforced on existing conversations and groups?

- **Context and why it matters:** Code enforces them only for new conversations (GAP-134). Child-safety expectation versus current behaviour.

##### Q-077 — Should the lock require a VERIFIED guardian email?

- **Context and why it matters:** Current decision (2026-08-09) accepts an unverified email. Verification flow exists (FR-408, FR-409).

##### Q-078 — Should the adult-blocks-minor safety flag apply to parents and other roles, and may users block anyone?

- **Context and why it matters:** See GAP-153. Affects moderation workload and the report queue.

##### Q-079 — Should assistants get a messaging page?

- **Context and why it matters:** API permits assistants; UI redirects (GAP-143).

##### Q-080 — Which field defines an unread notification, read or readAt?

- **Context and why it matters:** See GAP-141. Determines badge behaviour.

##### Q-081 — Should push subscription endpoints be restricted to known push hosts and be non-transferable?

- **Context and why it matters:** See GAP-138; security versus compatibility with browsers.

##### Q-082 — Should the notifications page paginate, and with what page size?

- **Context and why it matters:** See GAP-142. No limit is specified.

##### Q-083 — Are CRON_SECRET and CRON_BASE_URL configured in production and who monitors the cron jobs?

- **Context and why it matters:** See GAP-158. Missing configuration silently stops digests and reminders.

##### Q-084 — Should `guardian_required` return 403 with a localised lock message over REST?

- **Context and why it matters:** See GAP-133. The documented user message exists only for the directory.

##### Q-085 — Does the realtime server run as a single instance in production, and what is the target concurrent load?

- **Context and why it matters:** Presence is in memory (GAP-146). Needed for NFR targets (NFR-160).

##### Q-086 — Should the chat client distinguish 403 reasons (blocked, no relationship, policy)?

- **Context and why it matters:** See GAP-145. Affects user-facing wording and test assertions.

##### Q-087 — What limits and audience should center broadcasts have (length, rate, scope, course ownership)?

- **Context and why it matters:** See GAP-139 and GAP-140. Nothing is specified.

### 4.9. Reports, Dashboards & Exports

##### GAP-159 — Export registry has 9 keys, decision doc says 8
- Status: CONFLICTING
- Evidence: report-export.ts registry (net-profit, revenue-by-course, revenue-timeseries, expenses-timeseries, expenses, shift-reconciliation, course-fill-rates, attendance-by-course, enrollment-funnel) vs docs/decisions/report-export.md (5 accountant + 3 manager).
- Impact on testing: Tester cannot tell if shift-reconciliation is in scope; expected report list differs.
- Recommendation: Update the doc or confirm shift-reconciliation is intended.

##### GAP-160 — Student dashboard uses UTC day, not Cairo
- Status: CONFLICTING
- Evidence: services/dashboards/student.ts uses setUTCHours(0,0,0,0); docs/decisions/money-day-boundary.md says Cairo for every service reporting activity.
- Impact on testing: Between 00:00 and about 03:00 Cairo (04:00 in DST) 'today' is yesterday.
- Recommendation: Use platformTodayWindow / startOfPlatformDay.

##### GAP-161 — Attendance rate has two definitions; late is counted nowhere as present
- Status: CONFLICTING
- Evidence: Dashboards: present / ALL records (reports.ts:845,1003, student.ts). By-course report: present / (present+absent+excused), ignores late, removed, counter_only (reports.ts:396).
- Impact on testing: Same centre shows different attendance percentages on home and reports; reconciliation tests must use the right formula per screen.
- Recommendation: Product owner to define one rate (Q-089).

##### GAP-162 — Net profit / export totals are all-time without a range while monthly rows are 6 months
- Status: PARTIALLY IMPLEMENTED
- Evidence: reports.ts:749 (totals unfiltered, monthly default 6 months); export totalRow vs monthly rows.
- Impact on testing: The total row does not equal the sum of the rows in the same file or screen.
- Recommendation: Default the period or label totals as all-time; test with and without range.

##### GAP-163 — Admin KPIs are all-time beside a 6-month chart
- Status: PARTIALLY IMPLEMENTED
- Evidence: admin-dashboard.tsx calls dashboards/admin with no period; label adminHome.queue_allTime ('All time'); getAdminDashboard.
- Impact on testing: Users may read revenue as current-period.
- Recommendation: Add a period selector or label clearly.

##### GAP-164 — Today's takings counts failed and pending payments
- Status: CONFLICTING
- Evidence: admin-dashboard.tsx TodayTakingsCard uses listPayments (no status filter) + takingsOf; reports revenue excludes failed/pending.
- Impact on testing: Takings card can exceed the reports revenue for the same day.
- Recommendation: Filter statuses or reuse the revenue service.

##### GAP-165 — Fill rate uncapped, 0 for null capacity, ignores date range and provenance in net-profit
- Status: PARTIALLY IMPLEMENTED
- Evidence: reports.ts:362; net-profit calls fill rates unfiltered.
- Impact on testing: 110% shown for over-capacity; screen sends from/to that the endpoint ignores.
- Recommendation: Decide capping and labelling (Q-095).

##### GAP-166 — Enrollment funnel omits cancelled and is not cumulative
- Status: PARTIALLY IMPLEMENTED
- Evidence: reports.ts:447 groups pending, approved, declined, expired only.
- Impact on testing: Stage counts do not sum to requests submitted.
- Recommendation: Confirm intended stages (Q-093).

##### GAP-167 — Garbage date probably returns 500
- Status: MISSING VALIDATION
- Evidence: day-range.ts dayRange -> platformDayKey -> todayKey(new Date('x')) -> Intl format throws RangeError; routes revenue/expenses/net-profit/attendance have no zod.
- Impact on testing: Negative test outcome unverified; static analysis only.
- Recommendation: Add zod date schema; tester to confirm status.

##### GAP-168 — from after to is not validated
- Status: MISSING VALIDATION
- Evidence: No check in routes or dayRange.
- Impact on testing: Silent empty report.
- Recommendation: Reject with 422.

##### GAP-169 — Print route drops provenance and the login redirect drops the query
- Status: PARTIALLY IMPLEMENTED
- Evidence: reports/print/route.ts; print/page.tsx redirect callbackUrl without query.
- Impact on testing: Print can differ from screen/export with filters; user returns to a blank print page after relogin.
- Recommendation: Forward provenance and the full URL.

##### GAP-170 — Admin home API runs all analytics queries though home shows a few
- Status: PARTIALLY IMPLEMENTED
- Evidence: getAdminDashboard runs 7 parallel queries; admin-dashboard.tsx uses totals, counts, attendanceRate. Binding invariant: on-demand reads.
- Impact on testing: Potential violation of the on-demand-reads invariant; performance on large centres.
- Recommendation: Split analytics from the home payload.

##### GAP-171 — Raw enum values and English month labels in UI/print
- Status: PARTIALLY IMPLEMENTED
- Evidence: Expense donut labels, print text columns, month labels 'Jan 26' (reports.ts, print/page.tsx).
- Impact on testing: Arabic users see English/enum text.
- Recommendation: Localize.

##### GAP-172 — Non-manager staff opening /dashboard/staff/reports sees load error
- Status: MISSING PERMISSION
- Evidence: center-staff-reports-screen.tsx calls dashboards/admin (MANAGER); page not gated per sub-role.
- Impact on testing: Expect friendly 'not allowed' state instead of 'load failed'.
- Recommendation: Gate in the page.

##### GAP-173 — Manager nav has 9 items; sidebar-ia.md says max 8
- Status: CONFLICTING
- Evidence: portal-chrome.tsx; docs/decisions/sidebar-ia.md.
- Impact on testing: Nav conformance test fails against the doc.
- Recommendation: Update the doc or trim the nav.

##### GAP-174 — Net-profit ignores granularity; fill-rate/funnel calls send ignored params
- Status: UNCLEAR
- Evidence: net-profit route; admin-reports-screen.tsx.
- Impact on testing: Toggling week/month must not change net-profit; testers should not expect it.
- Recommendation: Clean up params.

##### GAP-175 — Export menu offers money reports to a manager who will be refused
- Status: PARTIALLY IMPLEMENTED
- Evidence: report-export-menu.tsx lists items without role; server returns 422 forbidden_report.
- Impact on testing: A manager sees a failing option.
- Recommendation: Hide by role.

##### GAP-176 — No rate limit and no row cap on exports/timeseries/takings list
- Status: RISK
- Evidence: grep found no rateLimit in reports or dashboards routes; expenses-timeseries loads all rows; takings list pagination off.
- Impact on testing: Volume and abuse tests may degrade the service.
- Recommendation: Add caps and a limiter.

##### GAP-177 — Parent home sums come from list results (first page) and paid ignores refunds
- Status: UNCLEAR
- Evidence: parent-dashboard.tsx (useList grades/payments; paid = sum of amount > 0).
- Impact on testing: Totals could be partial for children with many rows; 'fees paid' differs from net.
- Recommendation: Use a server aggregate.

##### GAP-178 — Digest day and schedule conflict with the decision doc
- Status: CONFLICTING
- Evidence: weekly-center-digest.md says 'Monday email' but cron.yml `0 2 * * 0` is Sunday 02:00 UTC; doc states CRON_BASE_URL and CRON_SECRET were not set (inert).
- Impact on testing: Digest may never run in production; day differs from the doc.
- Recommendation: Confirm the schedule and secrets.

##### GAP-179 — Digest week is UTC while report days are Cairo
- Status: PARTIALLY IMPLEMENTED
- Evidence: jobs.ts lastWeekRange uses UTC and toDateKey; getNetProfitReport converts the keys as Cairo days; sessionsCount uses UTC window.
- Impact on testing: Session count can differ from the report's week by up to a few hours.
- Recommendation: Use Cairo bounds.

##### GAP-180 — Student count is enrolments, not distinct students
- Status: PARTIALLY IMPLEMENTED
- Evidence: getAdminDashboard totals.students; getTeacherDashboard activeStudents.
- Impact on testing: A student in two courses counts twice.
- Recommendation: Q-090.

##### GAP-181 — CSV 'Exported' timestamp and filename date are UTC
- Status: PARTIALLY IMPLEMENTED
- Evidence: report-export.ts, reports/export/route.ts.
- Impact on testing: Near midnight Cairo the file date can be the previous day.
- Recommendation: Use Cairo.

##### GAP-182 — Fee defaulter definition is net-of-payments, not course-matched
- Status: UNCLEAR
- Evidence: getAdminDashboard feeDefaulters formula (BR-349).
- Impact on testing: A student overpaid on one course can mask unpaid fees on another.
- Recommendation: Q-088.

##### GAP-183 — Missing automated tests for route role scoping of dashboards, print page, staff reports screen, teacher/parent/admin home UI
- Status: MISSING AUTOMATED TEST
- Evidence: tests listing shows unit/db tests for exports, day bounds, period buckets, takings, admin period, teacher counter-only, digest, nav parity; e2e only navigation.spec and student-dashboard.spec.
- Impact on testing: Manual coverage is essential for these.
- Recommendation: Add tests.

##### Q-088 — Revenue definition: confirm revenue = payments not failed/pending, net of refund rows, dated by paidAt?
- Context / why it matters: Code implements this; docs describe it indirectly. Determines every expected number.

##### Q-089 — Which statuses count towards attendance rate (late? excused?) and should the home and the report use one definition?
- Context / why it matters: Two formulas exist (GAP-161).

##### Q-090 — Should 'students' on the dashboards be distinct students or active enrolments?
- Context / why it matters: Currently enrolments (GAP-180).

##### Q-091 — Are XLSX or PDF exports required, or are CSV and browser print sufficient?
- Context / why it matters: Only CSV and print exist; BRIEF mentions CSV/XLSX/PDF.

##### Q-092 — What is the intended digest day, and are the cron secrets configured in production?
- Context / why it matters: Doc: Monday; cron: Sunday 02:00 UTC; doc: secrets unset.

##### Q-093 — Should the enrollment funnel include cancelled and be cumulative?
- Context / why it matters: Affects expected stage counts.

##### Q-094 — Should the centre accountant have a reports landing page and read access to dashboards/admin?
- Context / why it matters: Accountant has no Reports page; only exports and finance screen.

##### Q-095 — Should fill rate be capped at 100 and shown for courses without capacity?
- Context / why it matters: Currently uncapped, 0 for null capacity.

##### Q-096 — Should the default reports period be all-time, or the current month?
- Context / why it matters: Totals are all-time while charts are 6 months.

### 4.10. Super Admin Platform Operations

Module: Super Admin Platform Operations (apps/superadmin + apps/admin-api, non-money). Path shorthand: `svc/` = `packages/server-core/src/`, `R/` = `apps/admin-api/src/routes/`, `CO/` = `apps/superadmin/src/components/superadmin/center-oversight/`, `F/` = `apps/superadmin/src/components/superadmin/`.

#### Gaps

##### GAP-184 — Platform blacklist add and lift are audited only by the best-effort auto-audit hook
- **Status:** RISK
- **Evidence:** `svc/services/blacklist/blacklist.ts` (`platformBlacklistUser`, `removeBlacklistEntryTx`) does not call `writeAdminAudit` (`svc/audit/admin-audit.ts:38`). The audit row comes from the Prisma auto-audit extension: `packages/database/src/extensions/index.ts:21-35` maps `BlacklistEntry.create` → `blacklist.added` and `BlacklistEntry.update` → `blacklist.changed`; `:203-214` stamps `targetType = "blacklistentry"`, `targetId` = the entry id (not the user id) and the actor from the request context; `:163-192` writes it under a savepoint, so a failed audit insert is rolled back, only logged with `console.error`, and the blacklist still commits. Covered by `apps/superadmin/tests/db/admin02-back-office-audit.test.ts:42-48`. Doors: `R/v1/admin/users/[id]/blacklist`, `R/v1/admin/students/[id]/blacklist`, `R/v1/admin/teachers/[id]/blacklist`; lift `R/v1/admin/blacklist/[id]/remove`. FR-480, FR-481.
- **Impact on testing:** An audit row is expected (`blacklist.added` / `blacklist.changed`), but filtering the Audit log viewer (FR-501) by the user's id will not find it — search by the entry id. Unlike `writeAdminAudit` writes (`h3-audit-atomicity.test.ts`), the most severe account action can commit with no audit row if the audit insert fails. The cascade (enrolments → `unenrolled`) is journalled in `BlacklistCascadeAction`, not in `audit_logs`.
- **Recommendation:** Confirm whether best-effort auditing is acceptable for blacklisting; if not, write an explicit audit row keyed by the user id through `writeAdminAudit` in the same transaction.

##### GAP-185 — Centre activate/deactivate overwrites every admin status, including blacklisted admins
- **Status:** RISK
- **Evidence:** `svc/backoffice/admin/center-control.ts:30-110`. Activate sets every centre-admin user to `active` and deactivate sets every one to `suspended`, whatever their current status. Contrast `setUserSuspended` (`svc/backoffice/admin/admin-users.ts:165`), which refuses a blacklisted account. FR-454, BR-378.
- **Impact on testing:** Reactivating a centre can silently un-blacklist a platform-blacklisted admin. The `BlacklistEntry` stays active while `users.status` becomes `active`. This needs a dedicated TC.
- **Recommendation:** Skip, or refuse, admins whose status is `blacklisted` (and those individually suspended) in the cascade. See Q-098.

##### GAP-186 — `impersonation/stop` has no role guard
- **Status:** MISSING PERMISSION
- **Evidence:** `R/v1/admin/impersonation/stop/route.ts:10-12` uses `withErrors` and `getSessionUser()` instead of `withRole`. The only check is better-auth `stopImpersonating`, which raises "No impersonation is active for this session". FR-491.
- **Impact on testing:** Low practical risk, because the call only ends an active impersonation. But it is the only `v1/admin/**` route outside the role guard, and `route-admin-guard.test.ts` must allow it. Test it with a non-impersonated session (expect 422) and an accountant session.
- **Recommendation:** Document it as an intended exception, or wrap it in a session-only guard that is named explicitly.

##### GAP-187 — Teacher blacklist state is incomplete in the UI
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** The Teachers list Status filter omits "blacklisted" (`F/teachers-screen.tsx:46`). The teacher detail page has no lift action, and the list and detail screens word the blacklist dialog differently (ui.md, Notes Part A). FR-471, FR-480.
- **Impact on testing:** Blacklisted teachers cannot be filtered, and a lift has to go through the Blacklist ledger page (FR-481).
- **Recommendation:** Add the filter option and a lift link to the ledger entry.

##### GAP-188 — Two conflicting meanings of "approve a deletion"; anonymize is unreachable; note optional vs required
- **Status:** CONFLICTING
- **Evidence:**
  - The centre path (`svc/backoffice/admin/center-operations.ts:319-365`, which calls `approveDeletionRequestTx`) soft-deletes the user and keeps history.
  - The platform path (`svc/services/data-rights/account-deletion.ts`, `approveDeletion`) scrubs personal data at once and sets `anonymizedAt`, so `anonymizeApproved` always fails with "Already anonymized".
  - The route schema makes `note` optional (`R/v1/admin/deletion-requests/[id]/route.ts:13-14`), but the service throws 422 "A review note is required to approve a deletion".
  - FR-470, FR-499.
- **Impact on testing:** The expected result of "approve" depends on which screen is used, and that cannot be fixed until the product owner decides (Q-097). The `anonymize` decision can only be tested as a failure.
- **Recommendation:** Settle one meaning, remove or repurpose `anonymize`, and align the route schema with the service.

##### GAP-189 — Rejecting a centre registration suspends all its admins
- **Status:** UNCLEAR
- **Evidence:** `svc/backoffice/admin/platform.ts` (`rejectCenter`), FR-452, BR-376. Every centre-admin user is set to `suspended` on reject.
- **Impact on testing:** A rejected owner cannot sign in to correct and resubmit, and there is no re-apply flow. Testers need the intended outcome (Q-103).
- **Recommendation:** Confirm whether rejection is meant to be final.

##### GAP-190 — Centre-scoped member deactivate changes the user's global status
- **Status:** CONFLICTING
- **Evidence:** `svc/backoffice/admin/center-control.ts:120-196` writes `users.status`, while the audit row carries `scope: kind` and `centerId`. FR-461, BR-380.
- **Impact on testing:** Deactivating a teacher "at centre A" also locks them out of centre B and out of direct teaching. The expected result is ambiguous (Q-099).
- **Recommendation:** Either rename the action to "Suspend account (platform-wide)", or use a centre-scoped flag (affiliation or roster status).

##### GAP-191 — Roster invite routes return the raw invite token outside production
- **Status:** RISK
- **Evidence:** `R/v1/admin/centers/[id]/roster/students/invite/route.ts:14,20` and `R/v1/admin/centers/[id]/roster/teachers/invite/route.ts:14,20`: `LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1"`, and the response puts `meta.inviteToken` in the body. BR-397.
- **Impact on testing:** A staging or preview deployment that is not built with `NODE_ENV=production`, or that has `E2E=1`, exposes a claimable credential in the response.
- **Recommendation:** Gate the token on an explicit test-only flag that the boot check refuses in deployed environments. Add a TC that asserts its absence in production builds.

##### GAP-192 — Password-reset audit is written after the email is sent, outside the transaction
- **Status:** MISSING ERROR HANDLING
- **Evidence:** `svc/backoffice/admin/admin-users.ts:307-345`: `requestPasswordReset` runs at `:328`, then `audit(... "user.password_reset_sent" ...)` runs in a separate `platformDb` call at `:333`. FR-489, BR-399.
- **Impact on testing:** If the audit write fails, the reset link has still gone out with no audit row. This breaks the "audit in the same transaction" rule followed elsewhere (`h3-audit-atomicity.test.ts`).
- **Recommendation:** Write an "intent" audit row before sending, or record the send result in the same transaction.

##### GAP-193 — `students/[id]` takes a profile id while sibling routes take a user id
- **Status:** CONFLICTING
- **Evidence:** FR-478 and FR-479 (`svc/backoffice/admin/platform.ts:487-600`): the student detail and unlink-parent routes look up `studentProfile.id`, but `students/[id]/blacklist` passes the id to the blacklist service as a user id.
- **Impact on testing:** The same id does not work on every `students/[id]/*` route, which can give 404s or act on the wrong record. Test data must include both ids.
- **Recommendation:** Use one id kind across `students/[id]/**`.

##### GAP-194 — Parent-link rows record "parent" as the initiator when the super admin acted
- **Status:** RISK
- **Evidence:** `svc/backoffice/admin/platform.ts:527-600` (`linkParent`, `unlinkParent`): the link row's initiator / revoker field is set to the parent role, not to an admin actor. FR-479.
- **Impact on testing:** The ERP link history attributes the action to the parent. Only the admin audit row shows the true actor.
- **Recommendation:** Record an `admin` initiator, or the actor id, on the link row.

##### GAP-195 — Rejected teachers do not appear in the Registrations "rejected" tab
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** FR-450 and FR-473: teacher reject sets `users.status` to a value that the registrations "rejected" filter does not query (`svc/backoffice/admin/platform.ts`, registrations list).
- **Impact on testing:** After a rejection the teacher disappears from the queue, and testers cannot confirm the outcome from the Registrations page.
- **Recommendation:** Include rejected teachers in the rejected tab (Q-105).

##### GAP-196 — The three blacklist doors return different success codes
- **Status:** UNCLEAR
- **Evidence:** `R/v1/admin/users/[id]/blacklist/route.ts` returns 201; the students and teachers doors return 200 (api.md). FR-480.
- **Impact on testing:** Contract tests must assert per door. Clients that check `=== 201` break on two of the three.
- **Recommendation:** Pick one status code.

##### GAP-197 — No rate limit on sensitive back-office writes
- **Status:** RISK
- **Evidence:** Of 145 routes, only `R/v1/admin/centers/[id]/staff/[linkId]/invite/route.ts:10` (10/min) and `R/v1/security/csp-report/route.ts:19` (60/min) use `withRateLimit`. View-as mint (`users/[id]/view-as`), password reset, 2FA reset and blacklist have none. BR-401.
- **Impact on testing:** A stolen super-admin session can mint view-as tokens and send reset emails without throttling. The ERP claim side does have a limit of 10 per 10 s per IP (`svc/erp-auth/view-as-plugin.ts`).
- **Recommendation:** Add per-actor limits to view-as, password reset and the reset-2FA routes.

##### GAP-198 — Audit-log filters are not validated
- **Status:** MISSING VALIDATION
- **Evidence:** `R/v1/admin/audit-logs/route.ts` passes the raw query to `listAuditLogs` (`svc/backoffice/admin/audit-log.ts:17-32`). `from` and `to` become `new Date(value)` with no check (an invalid date reaches Prisma), and `targetId`, `actorId` and `centerId` are used on UUID columns unchecked. FR-501.
- **Impact on testing:** `?from=abc` or `?targetId=123` is expected to produce a 500, not a 400.
- **Recommendation:** Add a zod query schema.

##### GAP-199 — No self-protection on revoke sessions, reset 2FA or password reset
- **Status:** MISSING VALIDATION
- **Evidence:** `refuseSelf` (`svc/backoffice/admin/admin-users.ts:51-55`) is called only at `:171` (suspend/reinstate), `:351` (impersonate) and `:378` (view-as). `revokeAllSessions` (`:209`), `resetTwoFactor` (`:268`) and `sendPasswordReset` (`:307`) do not call it. FR-487, FR-488, FR-489, BR-390.
- **Impact on testing:** A super admin can reset their own 2FA, which locks them out of back-office access (BR-371). They can also revoke all of their own sessions.
- **Recommendation:** Refuse self on reset-2FA at least, or route it to the own Security page (FR-512).

##### GAP-200 — Catalog links and offerings are hard-deleted
- **Status:** CONFLICTING
- **Evidence:** `svc/services/catalog/catalog-admin.ts:239` (`tx.gradeLevelTrack.delete`) and `:374` (`tx.subjectOffering.delete`, audit `catalog.offering_deleted`). The project convention is soft-delete (CLAUDE.md "Destructive operations use soft-delete"). FR-495, FR-497, BR-396.
- **Impact on testing:** Deleting an offering that students' tracks rely on removes the subject from auto-assignment for new students. Test what happens to existing students' subjects and to history.
- **Recommendation:** Soft-delete, or deactivate (offerings already have an active toggle). See Q-100.

##### GAP-201 — WhatsApp message detail route is missing
- **Status:** CONFLICTING
- **Evidence:** The UI detail dialog calls `GET admin/whatsapp-messages/{id}`, but only the list route is registered (`apps/admin-api/src/routes/index.ts:399`). ui.md Notes Part B item 1. FR-504.
- **Impact on testing:** Opening a message's detail is expected to fail (404). TCs record this as a known defect.
- **Recommendation:** Add the detail route, or render the detail from the list row.

##### GAP-202 — Home "Cycle statement" link points to a missing page
- **Status:** NOT IMPLEMENTED
- **Evidence:** The Home link goes to `/dashboard/superadmin/reports`, and no such page exists in `apps/superadmin/src/app/[locale]/dashboard/superadmin/` (ui.md Notes Part B item 2). FR-449.
- **Impact on testing:** The link produces a 404.
- **Recommendation:** Point it to the finance statement page, or remove it.

##### GAP-203 — "Erase details now" is irreversible and has no confirmation
- **Status:** MISSING VALIDATION
- **Evidence:** `deletion-queue-screen.tsx:194-202`: no confirm dialog and no note field. FR-499.
- **Impact on testing:** One click triggers an irreversible action.
- **Recommendation:** Add a confirm dialog with a required note.

##### GAP-204 — Students guardian picker is statically empty
- **Status:** UNCLEAR
- **Evidence:** `students-screen.tsx:196-205` calls `admin/users?role=parent&limit=100` and reads an array, but the route returns `{users, nextCursor}` and paginates on `take`, not `limit` (`svc/backoffice/admin/admin-users.ts:57-65`). FR-479.
- **Impact on testing:** Linking a parent from the UI is likely impossible, so only the API path can be tested.
- **Recommendation:** Read `data.users` and send `take`.

##### GAP-205 — Centre header says money is "never editable here", but the Money tab moves money
- **Status:** CONFLICTING
- **Evidence:** Catalog `oversight.headerDesc` ("Financial records are visible but never editable here.") versus `CO/money-actions.tsx:163-581`. FR-453, FR-469.
- **Impact on testing:** Users are told something false about where money can move. The CLAUDE.md invariant states the back office is "not read-only".
- **Recommendation:** Correct the copy (EN and AR).

##### GAP-206 — Instant state changes without confirmation
- **Status:** RISK
- **Evidence:**
  - Link-centre fires on pick (`F/teachers-screen.tsx:69-72`); the attendance-mode select (`:102-105`); the staff sub-role select (`CO/people-tabs.tsx:561-571`); attendance corrections (`CO/operations-tabs.tsx:522`).
  - Feature-flag toggle, catalog unlink-track, offering toggle, contact "Spam" and messaging report decisions (ui.md Notes Part B item 6).
  - FR-475, FR-476, FR-500.
- **Impact on testing:** A mis-click commits an audited change straight away.
- **Recommendation:** Confirm destructive or cross-tenant changes at least.

##### GAP-207 — Silent failures on several screens
- **Status:** MISSING ERROR HANDLING
- **Evidence:** ui.md Notes Part B item 12:
  - Platform KPI cards show 0 on a failed request (FR-449).
  - Notifications ignores a mark-read failure (FR-508).
  - The Security session list ignores the better-auth `{error}` (FR-512).
  - The Collaborations detail dialog has no error branch (FR-502).
- **Impact on testing:** A failure looks like real data (zero) or an endless spinner.
- **Recommendation:** Use the shared error state (`QuerySection`).

##### GAP-208 — Collaborations page is read-only although a decide API exists
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:** `R/v1/admin/collaboration-requests/[id]/decide` exists (super_admin only, 422 "This request has expired"). The page subtitle says "Accepting one creates…", but the page has no accept/reject control (ui.md Notes Part B item 14). FR-502.
- **Impact on testing:** The decision can be tested only through the API.
- **Recommendation:** Add the controls, or drop the subtitle claim (Q-104).

##### GAP-209 — Teacher PATCH skips the Egyptian phone rule
- **Status:** MISSING VALIDATION
- **Evidence:** `R/v1/admin/teachers/[id]/route.ts:21` (`phone: z.string().trim().max(40)`) versus create at `R/v1/admin/teachers/route.ts:28` (`phoneSchema`). FR-471, FR-472.
- **Impact on testing:** Edit accepts phone numbers that create would reject, which breaks WhatsApp delivery and uniqueness checks.
- **Recommendation:** Use `phoneSchema` on PATCH.

##### GAP-210 — Arabic UI gaps and raw English values
- **Status:** PARTIALLY IMPLEMENTED
- **Evidence:**
  - The sidebar `NAV_KEY` lacks Blacklist, Points and Notification log; raw `suspended`/`active` literals appear in status dialogs; WhatsApp, messaging and notification enums are shown untranslated (ui.md Notes Part A, Part B items 7-8).
  - The Reports tab shows raw JSON (`CO/platform-tabs.tsx:123-124`).
  - FR-448, FR-469, FR-504.
- **Impact on testing:** Arabic-locale TCs fail on these labels.
- **Recommendation:** Add catalog keys.

##### GAP-211 — Catalog update, delete, link rules and subject-request review have no automated test
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** `apps/erp/tests/db/catalog-onboarding.test.ts:189-210` drives only the create path of `svc/services/catalog/catalog-admin.ts` (`createSystem`, `createStage`, `createGradeLevel`, `createSubject`, `createOffering`) and checks the new rows reach the onboarding tree. No test file found that calls the catalog update or delete functions, the grade↔track link rules, or the subject-request review. FR-494 – FR-498.
- **Impact on testing:** The catalog is permanent reference data (never purged); duplicate code (409), cross-stage link (400) and hard delete (GAP-200) are checked only manually.
- **Recommendation:** Extend the DB suite to update/delete, link rules and subject-request review.

##### GAP-212 — Registration decisions and attendance mode have no automated test
- **Status:** MISSING AUTOMATED TEST
- **Evidence:** `svc/backoffice/admin/platform.ts:152` (`approveCenter`), `:185` (`rejectCenter`), `:293` (`setTeacherAttendanceMode`), `:317` (`approveTeacher`), `:342` (`rejectTeacher`) are not referenced by any `*.test.ts` under `apps/` or `packages/` (searched by function name). FR-451, FR-452, FR-473, FR-475. Full list of untested FRs: rtm.md, "Existing automated tests".
- **Impact on testing:** The centre approval lifecycle — including GAP-189 (reject suspends admins) — is verified only by the manual TCs in tc.md.
- **Recommendation:** Add a DB suite for the four registration decisions (status, admin account status, notification, audit row) and the attendance-mode toggle.

#### Product-owner questions

##### Q-097 — What does "approve a deletion request" mean?
- **Context:** The centre path soft-deletes and keeps history; the platform path scrubs personal data at once (GAP-188, FR-470, FR-499).
- **Why it matters:** Data-rights compliance and the expected result of every deletion TC depend on it. Is the `anonymize` step meant to be a separate, delayed step?

##### Q-098 — Should reactivating a centre restore admins who were individually suspended or blacklisted?
- **Context:** The cascade overwrites every admin status (GAP-185, FR-454).
- **Why it matters:** It can undo a platform blacklist without a lift record.

##### Q-099 — Is the centre-workspace member deactivate meant to be platform-wide?
- **Context:** It writes the global `users.status` (GAP-190, FR-461).
- **Why it matters:** A teacher at several centres is locked out everywhere.

##### Q-100 — May catalog links and offerings be hard-deleted?
- **Context:** `catalog-admin.ts:239,374` (GAP-200).
- **Why it matters:** The catalog is permanent reference data. Its effect on enrolled students' subject lists is undefined.

##### Q-101 — Should an accountant reach the own Security page and the global search?
- **Context:** `v1/search` admits accountants (api.md). The Security page and `v1/me` admit any back-office session. Every other `v1/admin/**` route in this module is super_admin only (FR-448, FR-507, FR-512).
- **Why it matters:** It decides the expected result of the accountant permission matrix TCs.

##### Q-102 — What happens to a moved student's open subscriptions and enrolments at the source centre?
- **Context:** FR-482 moves roster membership only. Money is out of this module.
- **Why it matters:** A student might keep paid access at the old centre, or lose it unrefunded.

##### Q-103 — Is a centre rejection final, and should it suspend the owner's account?
- **Context:** GAP-189, FR-452.
- **Why it matters:** It decides whether a resubmission flow should be tested.

##### Q-104 — Should the super admin decide collaboration requests from the UI?
- **Context:** The API exists but the page is read-only (GAP-208, FR-502).
- **Why it matters:** It decides the scope of the UI TCs.

##### Q-105 — Where should rejected teacher registrations be listed?
- **Context:** GAP-195, FR-450.
- **Why it matters:** The audit trail is otherwise the only place a rejection is visible.

##### Q-106 — Should `inviteToken` ever be echoed on a deployed non-production environment?
- **Context:** GAP-191.
- **Why it matters:** Staging is reachable from outside, and the token is a claim credential.

### 4.11. Finance & Accounting (Back-office)

Scope: Finance & Accounting (Back-office). Each gap names its status label, evidence (`path:line`, repo-relative), the effect on testing, and a recommendation. Anything that could not be verified in code is marked `UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION` and turned into a question in the second section. Nothing here was executed against a database; all findings are from reading the code.

#### Gaps

##### GAP-213 — Invoice type `student_invoice` accepted by the schema, rejected by the service
- Status: CONFLICTING
- Evidence: route zod for `POST finance/invoices` accepts the full Prisma `InvoiceType` enum including `student_invoice`; `packages/server-core/src/services/finance/invoices.ts:146` throws `BusinessRuleError("Unsupported invoice type: student_invoice")`. Referenced by FR-523, EC-578, TC-1109.
- Impact on testing: a valid-looking request returns 422 rather than 400; the test oracle must expect the 422 message, and the UI (if any form exists) cannot be checked for a disabled option because the type is not surfaced.
- Recommendation: narrow the zod enum to the two supported types (`teacher_statement`, `payment_receipt`) so the contract and the service agree, or implement the student invoice. Product decision: Q-115.

##### GAP-214 — `cancelled` payouts are invisible to the back-office counts and filters
- Status: PARTIALLY IMPLEMENTED
- Evidence: `payoutStatusCounts` and the `PayoutsScreen` `STATUSES` tabs cover `pending | approved | paid | rejected` only (`apps/superadmin/src/features/payouts/payouts-screen.tsx`); the ERP beneficiary can cancel a pending payout (`payout-cancel.ts`, owned by "Payments, Subscriptions, Wallets & Settlement"), producing status `cancelled`. Referenced by FR-526, EC-571, TC-1115.
- Impact on testing: a row the accountant was looking at disappears from every tab with no explanation; reconciliation of "payouts generated vs payouts decided" cannot be done from the screen alone.
- Recommendation: add a `cancelled` tab and count, or show a cancelled badge in a history view; until then testers must query the API with `status=cancelled` directly.

##### GAP-215 — Payout request idempotency key is optional and the dialog may not send one
- Status: MISSING VALIDATION
- Evidence: `requestCenterPayoutTx` only de-duplicates when `clientRequestId` is present (`packages/server-core/src/backoffice/admin/center-wallet.ts:66-75`); the route schema has `clientRequestId?: string 8–64` (`api.md`, `POST /admin/centers/:id/money/payout-request`). Whether `oversight.ma_*` "Request payout" dialog sends one: UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION. Referenced by FR-545, EC-573, TC-1167.
- Impact on testing: a double-click with a partial amount creates two pending payouts; TC-1167 must be run both with and without a key.
- Recommendation: make the superadmin dialog always generate a key and make the key required on the route (the ERP counterpart already carries one). Question Q-121.

##### GAP-216 — Wallet policy update audit comes from the auto-audit extension, not `writeAdminAudit`
- Status: IMPLEMENTED
- Evidence: `updateWalletPolicy` (`packages/server-core/src/backoffice/settings/wallet-settings-admin.ts:24-53`) calls no audit writer; the Prisma extension `AUDITED` map covers `WalletSettings.create/update` → `wallet_settings.updated` (`packages/database/src/extensions/index.ts:33-34`). Referenced by FR-534, TC-1141.
- Impact on testing: the audit row exists but carries the extension's shape (actor + after-state), not the before/after + IP spec of `writeAdminAudit`; the test must assert the `wallet_settings.updated` action, not an explicit action name.
- Recommendation: none required; document the two shapes for the tester. Resolved during analysis — kept here because TC-1141 and FR-534 cite it.

##### GAP-217 — Rejecting an approved payout overwrites `approvedBy`
- Status: RISK
- Evidence: `rejectPayout` writes `approvedBy: actor.id` on the row regardless of previous value (`packages/server-core/src/backoffice/finance/payouts.ts:399-401`); the original approver survives only in the `payout.approved` audit row. Referenced by FR-530, EC-572, TC-1129.
- Impact on testing: the payouts table cannot be used to prove who approved a rejected payout; the tester must join `audit_logs`.
- Recommendation: store the rejecter in a dedicated column (`rejectedBy`) or leave `approvedBy` untouched on reject.

##### GAP-218 — Points rules CRUD writes no audit row
- Status: RISK
- Evidence: `points-admin.ts` rule create/update/delete call no `writeAdminAudit`; the `AUDITED` map lists only `PointsLedger.create` → `points.adjusted` (`packages/database/src/extensions/index.ts:26`), so manual adjustments ARE audited but rule changes are not. Referenced by FR-540, BR-403, TC-1156.
- Impact on testing: "every superadmin write goes to an audit log" (CLAUDE.md "Conventions") cannot be asserted for points rules.
- Recommendation: add `PointsRule.*` to the `AUDITED` map or an explicit `writeAdminAudit` in the rule functions.

##### GAP-219 — Expense category `maintenance` exists in the DB enum but not in the route schema
- Status: CONFLICTING
- Evidence: `packages/server-core/src/services/expenses/expenses.ts:12` lists `"maintenance"` among the categories; the back-office route zod enum has six values (no `maintenance`), so the API returns 400 for a value the DB accepts. Referenced by FR-546, EC-584, TC-1170.
- Impact on testing: expenses recorded by the ERP centre with `maintenance` display in the back office but cannot be created or edited there; the select in the UI shows six options.
- Recommendation: derive the route enum from the service constant.

##### GAP-220 — No rate limiting on any finance money route
- Status: RISK
- Evidence: `withRateLimit` is used only in `apps/admin-api/src/routes/v1/security/csp-report/route.ts` and `apps/admin-api/src/routes/v1/admin/centers/[id]/staff/[linkId]/invite/route.ts`; none of `finance/payouts/**`, `finance/refunds`, `admin/centers/:id/money/**` carries it. Referenced by NFR-224, TC-1174.
- Impact on testing: a load or abuse test can only verify that correctness guards (maker-checker, unique indexes, conditional decrement) hold under bursts — there is no 429 to assert.
- Recommendation: per-user limit on `POST finance/payouts`, `…/pay`, `POST finance/refunds` and the four centre money routes. Product decision on limits: Q-118.

##### GAP-221 — Hard result caps without pagination or a total
- Status: RISK
- Evidence: `listPayouts` `take: 200`; `listAgreementProposals` ≤ 200 (`agreements.ts:240-247`); `refundsReport` ≤ 500 and `revenueReport` ≤ 300 buckets (`finance-reports.ts`); `listCenterPayouts` ≤ 100 (`center-wallet.ts`). No `meta.total` and no "truncated" signal on these. Referenced by NFR-225, EC-591, TC-1103.
- Impact on testing: on a seeded dataset above the cap the screen silently omits rows; reconciliation tests must bound their data or query the DB directly.
- Recommendation: add `page/limit` + `meta.total` (as `finance/transactions` already has) or at least a truncation flag like the settlement export header.

##### GAP-222 — Expense delete is a hard delete, against the soft-delete convention
- Status: CONFLICTING
- Evidence: `deleteExpenseTx` runs `tx.expense.delete(...)` (`packages/server-core/src/services/expenses/expenses.ts:112`); CLAUDE.md "Conventions" states "Destructive operations use soft-delete". The back-office wrapper does write `center.expense_deleted` via `writeAdminAudit` (`center-money.ts:213-214`). Referenced by FR-546, TC-1169.
- Impact on testing: after TC-1169 the row is gone; only the audit row proves it existed; the dashboard "Expenses" KPI changes retroactively.
- Recommendation: product decision whether expenses are exempt from soft delete (Q-114); if not, add `deletedAt`.

##### GAP-223 — No back-office screen found that triggers a refund
- Status: UNCLEAR
- Evidence: `POST finance/refunds` exists and is `super_admin` only (`refunds.ts`); no component under `apps/superadmin/src/features/**` inspected calls it (`ui.md` "Not in this module"). Referenced by FR-532.
- Impact on testing: WF-094 can be tested only through the API (TC-1132 … TC-1137); no UI test case exists for refunds.
- Recommendation: confirm the intended entry point (Q-109); if the refund is meant to be API-only for now, say so in the handbook.

##### GAP-224 — Accountant "Online payments" page targets a route that does not exist
- Status: NOT IMPLEMENTED
- Evidence: `apps/superadmin/src/app/[locale]/dashboard/finance/payments/page.tsx` renders `PaymentIntentsScreen` with `apiBase` `finance/payment-intents`; the only route is `admin/payment-intents` (`super_admin`). Referenced by FR-517, TC-1100, `permissions.md`, `inventory.md`.
- Impact on testing: the accountant page is a guaranteed error state; TC-1100 documents the failure, not a feature.
- Recommendation: add `finance/payment-intents` under `withRole(["accountant","super_admin"])` or remove the page from the accountant navigation. Question Q-117.

##### GAP-225 — Accountant may export session settlements but may not list them
- Status: MISSING PERMISSION
- Evidence: `admin/session-settlements/export` is `withRole(["accountant","super_admin"])`; `admin/session-settlements` (list) and the `/dashboard/superadmin/settlements` page are `super_admin` only (`permissions.md`). Referenced by FR-537, FR-538, EC-588, TC-1152.
- Impact on testing: the accountant can obtain the data only by calling the export URL by hand; the role matrix cannot be tested consistently.
- Recommendation: align the two routes to the same tier (Q-116).

##### GAP-226 — Back-office wallet top-up may bypass the student wallet policy
- Status: UNCLEAR
- Evidence: `adminTopUpWallet` runs the same `*Tx` the ERP counter runs (`center-money.ts:82`); whether that `*Tx` applies the `minTopup`/`maxTopup` policy from `wallet_settings` is not visible in the back-office file — UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION. Referenced by FR-543, TC-1163.
- Impact on testing: TC-1163 has no oracle for an out-of-policy amount.
- Recommendation: confirm with the owner of the ERP engine ("Payments, Subscriptions, Wallets & Settlement") and record the answer in the test (Q-111).

##### GAP-227 — Automated test coverage gaps
- Status: MISSING AUTOMATED TEST
- Evidence: no test file found (file-name search of `apps/superadmin/tests`, `apps/admin-api/tests`, `packages/server-core`) for: finance dashboard and alerts (FR-513/002), back-office listings (FR-515/004/005), revenue report / trial balance / refunds report (FR-518/007/008), invoice PDF and send-by-email (FR-524/013), payout counts / reject / receipt (FR-526/018/019), settlement export headers and truncation (FR-538), points rules and adjustments (FR-540/029), centre payout request and expenses via the back office (FR-545/034). No browser end-to-end test for any finance screen. See `rtm.md` "Existing automated tests".
- Impact on testing: these FRs rely entirely on the manual cases in `tc.md`; regressions in report totals would not be caught by CI.
- Recommendation: prioritise DB-suite tests for the trial balance (BR-level reconciliation), the refunds report, and the settlement export, since they are the reconciliation evidence the accountant relies on.

##### GAP-228 — Sending an invoice by email leaves no audit row
- Status: RISK
- Evidence: `sendInvoiceEmail` (`packages/server-core/src/services/finance/invoices.ts:235-247`) reads the invoice, sends mail and returns `{sent:true, to}`; no `writeAdminAudit` and no auto-audited model write occurs. Referenced by FR-525, TC-1112.
- Impact on testing: "who sent which invoice to whom, when" cannot be proven after the fact; TC-1112 can only assert the response.
- Recommendation: write an explicit `invoice.emailed` audit row with recipient and actor.

##### GAP-229 — Two people, not three, suffice for a payout (generator may also pay)
- Status: UNCLEAR
- Evidence: `approvePayout` blocks the generator (`payouts.ts:264-266`); `payPayout` blocks only the approver (`payouts.ts:320-322`); nothing blocks the generator from marking paid. Referenced by EC-568, TC-1125, BR-415.
- Impact on testing: the maker-checker test matrix has one cell (generator = payer) whose expected result is not specified.
- Recommendation: product decision Q-107; if three distinct people are required, add the check in `payPayout`.

##### GAP-230 — Invoice statuses `paid` / `void` are unreachable from the back office
- Status: NOT IMPLEMENTED
- Evidence: no route under `finance/invoices/**` changes `status`; the enum exists in Prisma (`workflows.md` WF-096 "Status transitions"). Referenced by EC-601, FR-522.
- Impact on testing: the status column and its filter can only be tested with the value `issued` unless rows are seeded directly.
- Recommendation: confirm the lifecycle (Q-113); if invoices are informational only, remove the unused statuses from the filter.

##### GAP-231 — Finance alert thresholds are hard-coded
- Status: RISK
- Evidence: `financeAlerts` counts refunds "over 50,000 EGP" with a constant (`packages/server-core/src/backoffice/finance/finance-reports.ts:296-304`; threshold constant `5_000_000` piasters cited in FR-514). Referenced by FR-514, TC-1094.
- Impact on testing: the alert can only be triggered by seeding a refund above 50,000 EGP; no configuration path to test.
- Recommendation: none for QA; product may want a setting (Q-110).

##### GAP-232 — Per-student (M2) rate accepts a zero fee
- Status: UNCLEAR
- Evidence: the per-student-rate refine accepts `fee: 0` because `moneySchema` is `0..99_999_900` (EC-582); a zero centre share per attending student may or may not be intended. Referenced by FR-536, TC-1147.
- Impact on testing: TC-1147 records the behaviour but cannot judge it.
- Recommendation: product decision Q-112; if zero is invalid, use `.positive()` as the payment routes do.

##### GAP-233 — Settlement export truncates at 5000 rows while the screen total shows everything
- Status: RISK
- Evidence: `settlement-export.ts` `MAX_ROWS = 5000` with header `x-edura-truncated: true`; the screen total comes from the paged list (EC-577). Referenced by FR-538, TC-1151.
- Impact on testing: an accountant comparing the Excel total to the screen total sees a mismatch by design; the UI shows no banner for the header (toast strings `exportReady`/`exportFailed` only).
- Recommendation: surface the truncation header as a visible toast, or paginate the export by period.

##### GAP-234 — Invoice generation entry point and revenue report have no confirmed UI
- Status: UNCLEAR
- Evidence: `InvoicesScreen` strings cover list / PDF / email only — a "generate" form was not found (`ui.md` Invoices); `FinanceReportsScreen` has four tabs and none for `finance/reports/revenue` (`ui.md` Finance reports). Referenced by FR-518, FR-523.
- Impact on testing: TC-1101 and TC-1108 … TC-1110 are API-only; no UI steps can be written.
- Recommendation: confirm whether generation is manual, scheduled, or API-only, and whether the revenue report is meant to be visible (Q-119, Q-120).

##### GAP-235 — Inconsistent handling of a non-numeric `page` parameter across listings
- Status: MISSING VALIDATION
- Evidence: `admin/session-settlements` rejects `page=abc` with 400 (route regex `/^\d+$/`); `finance/transactions` clamps the same input to page 1 via `parsePageLimit` (EC-592). Referenced by FR-515, FR-537.
- Impact on testing: negative-input tests need a per-route oracle.
- Recommendation: use `parsePageLimit` everywhere.

#### Open questions for the Product Owner

##### Q-107 — Payout segregation of duties
Must the person who generated a payout also be barred from marking it paid (three distinct people), or are two distinct people (generator ≠ approver, approver ≠ payer) sufficient as the code enforces today? (GAP-229, EC-568)

##### Q-108 — Visibility of cancelled payouts
Should accountants see payouts the beneficiary cancelled from the ERP, as a tab, a count, or a history entry? (GAP-214)

##### Q-109 — Where does a super admin trigger a refund?
No back-office screen calling `POST finance/refunds` was found. Is the refund meant to be API-only, is a screen missing, or is it reached through "view as"? (GAP-223)

##### Q-110 — Finance alert thresholds
Is "refunds over 50,000 EGP" (and the other alert thresholds) a fixed product rule, or should it be configurable per deployment? (GAP-231)

##### Q-111 — Wallet policy on back-office top-ups
Does the student wallet top-up policy (minimum / maximum) apply when a super admin tops up a wallet on behalf of a centre, or only to online/ERP top-ups? (GAP-226)

##### Q-112 — Zero per-student fee
Is a per-attending-student (M2) fee of 0 EGP a valid configuration (centre takes nothing per student), or should it be rejected? (GAP-232)

##### Q-113 — Invoice lifecycle
How do invoices reach `paid` or `void`? If there is no such flow, should the statuses be removed from the UI filter? (GAP-230)

##### Q-114 — Expense deletion
Are centre expenses exempt from the soft-delete convention (they are hard-deleted today), or should a `deletedAt` be added? (GAP-222)

##### Q-115 — Student invoices
Is `student_invoice` a planned type (keep it in the schema, mark unsupported) or dead (remove from the enum)? (GAP-213)

##### Q-116 — Accountant access to session settlements
Should the accountant be able to list session settlements on screen (today: export only), or should the export also be restricted to `super_admin`? (GAP-225)

##### Q-117 — Accountant access to online payment intents
Should accountants see Paymob payment intents? If yes, a `finance/payment-intents` route is needed; if no, the accountant page should be removed. (GAP-224)

##### Q-118 — Rate limits on money routes
What per-user rate (requests per minute) is acceptable for payout generation / pay / refund / centre money actions? (GAP-220)

##### Q-119 — Invoice generation trigger
Is invoice generation manual (an accountant action), scheduled (month-end job), or both? Should the Invoices screen expose a generate form? (GAP-234)

##### Q-120 — Revenue report on screen
Should the revenue report (`finance/reports/revenue`) be a tab in Finance reports, or remain API-only? (GAP-234)

##### Q-121 — Idempotency key on payout requests
Should the back-office "Request payout" dialog always send a `clientRequestId`, and should the route require it? (GAP-215)

##### Q-122 — Unknown transaction type filter
On `finance/transactions`, should an unknown `type` value return 400 or be ignored (current behaviour not determined from the route)? (FR-515)

##### Q-123 — Trial balance with invalid dates
Should `from` / `to` on the trial balance be validated strictly (400) rather than parsed leniently? (FR-519)

##### Q-124 — Result caps
Are the fixed caps (200 payouts, 200 agreements, 500 refund rows, 300 revenue buckets, 100 centre payouts, 5000 export rows) acceptable for a centre's monthly volume, or must these listings paginate? (GAP-221, GAP-233)

### 4.12. Platform, Infrastructure & Non-Functional

Labels: CONFLICTING, UNCLEAR, PARTIALLY IMPLEMENTED, RISK, MISSING VALIDATION, MISSING ERROR HANDLING, MISSING PERMISSION, MISSING AUTOMATED TEST.

##### GAP-236 — Stale document says cron jobs are unscheduled
- Status label: CONFLICTING
- Evidence: `docs/reports/cron-jobs-unscheduled.md` states the jobs have no scheduler, but `.github/workflows/cron.yml:33-40` schedules all nine jobs on four cron expressions.
- Impact on testing: A tester following the document would conclude background expiry never runs, or would skip testing the scheduler.
- Recommendation: Treat the workflow as truth; confirm in the GitHub repository that secrets `CRON_SECRET` and `CRON_BASE_URL` exist and that recent runs are green (cannot be verified here). Update or delete the document (Q-125).

##### GAP-237 — Stray `echo` inside the `env:` block of the cron workflow
- Status label: UNCLEAR
- Evidence: `.github/workflows/cron.yml` lines 45-46 place `echo "This tick runs: $JOBS"` inside the `env:` mapping of the step that resolves the job list. YAML reads it as a bogus environment key, so the line is never executed as a command.
- Impact on testing: The log line the author intended never appears; no functional effect expected. Needs a look at a real run log.
- Recommendation: Move the echo into the `run:` script or delete it. Verify one real workflow run executes all expected jobs.

##### GAP-238 — Month-end statements swallow per-item errors
- Status label: MISSING ERROR HANDLING
- Evidence: `packages/server-core/src/services/cron/jobs.ts:27-86` wraps each statement in an empty `catch {}` (FR-561). The endpoint answers 200 and the counts only include successes; nothing is logged or audited for a failed teacher or center.
- Impact on testing: A statement can be missing with no signal. Testers must compare expected statement counts against invoices after each run.
- Recommendation: Count and return `failed`, log each failure with the owner id (as the weekly digest does) and alert (Q-126).

##### GAP-239 — Offline attendance outbox is not cleared on logout
- Status label: RISK
- Evidence: `purge-caches.ts` clears Cache Storage and `edura_state` but not IndexedDB `edura-offline`; sync filters rows by `teacherId` (`attendance-outbox.ts:180`). On a shared device a second teacher's login keeps the first teacher's unsynced rows on disk.
- Impact on testing: Privacy and data-integrity test on shared devices: queue rows, log out, log in as another teacher, inspect IndexedDB.
- Recommendation: Decide whether unsynced rows must survive logout (Q-131). If not, delete the store on logout, or force a flush before logout.

##### GAP-240 — Manifest declares only SVG icons
- Status label: PARTIALLY IMPLEMENTED
- Evidence: `apps/erp/src/app/manifest.ts:5-33` lists `/edura-mark.svg` and `/edura-maskable.svg`. The project memory records that the OS needs PNG icons for installation. An `apple-touch-icon.png` exists.
- Impact on testing: The install prompt may not appear, or the installed icon may be blank, on Android or Windows.
- Recommendation: Test installation on Android Chrome and desktop Chrome/Edge. Provide 192 and 512 px PNG icons if it fails (Q-130).

##### GAP-241 — Unauthenticated or secret-only endpoints have no rate limit
- Status label: RISK
- Evidence: No `withRateLimit` on admin-api `/api/health`, `/api/v1/_ping`, `/api/v1/internal/*` and `/api/v1/cron/[job]`. Health on api is limited, but its sibling on admin-api is not; `_ping` and the health probe each run a database query.
- Impact on testing: A flood can consume database connections (the load report shows a pool of 10). Secret-guarded endpoints are protected by the secret only.
- Recommendation: Add per-IP limits to the unauthenticated ones or confirm the edge platform limits them (Q-135). Include a controlled flood test on a test environment.

##### GAP-242 — Client-IP trust depends on correct hop configuration
- Status label: RISK
- Evidence: `require-shared-store.ts` notes that `TRUSTED_PROXY_HOPS=1` satisfies the boot guard but is only correct for one proxy layer; one hop off lets a client-supplied X-Forwarded-For prefix choose its own limiter key. The recommended setting is `TRUSTED_CLIENT_IP_HEADER=x-vercel-forwarded-for`. The project memory records that the Vercel XFF behaviour is unproven.
- Impact on testing: Brute-force protection on login and OTP can be bypassed if mis-set.
- Recommendation: Verify on the real deployment that rotating `X-Forwarded-For` does not reset a limit. Record the production values (names only) in the test report.

##### GAP-243 — Guided-tour pages have no explicit role check
- Status label: MISSING PERMISSION
- Evidence: The tour pages for admin, teacher, parent and assistant do not call a role guard in the page file (FR-586). Protection depends on the dashboard layout, which belongs to the role modules.
- Impact on testing: A user of the wrong role may open another role's tour URL and see its emulated screens (sample data only).
- Recommendation: Test all 8 roles against all 4 tour URLs. Add an explicit guard if any are reachable (Q-128).

##### GAP-244 — Backup runbook says the schedule is off; workflow schedules it
- Status label: CONFLICTING
- Evidence: `docs/runbooks/backup-restore.md` says "the SCHEDULE IS OFF, see section 3" and was last verified 2026-08-02; `.github/workflows/backup.yml` now schedules nightly `30 2 * * *` and weekly `0 4 * * 1`.
- Impact on testing: Unknown whether production backups actually run today.
- Recommendation: Check the Actions history and the object-storage bucket listing. Update the runbook.

##### GAP-245 — Environment documentation is stale on mail provider
- Status label: CONFLICTING
- Evidence: Project memory records that mail moved to the Resend HTTP API on 2026-10-18, but `docs/architecture/backend-separation/env-vars.md` still lists `SMTP_*`; the name `RESEND_API_KEY` was not found in the files read.
- Impact on testing: The tester cannot be sure which variables the mail path needs (affects the deep health probe, digests, statements).
- Recommendation: Confirm the exact mail variables (Q-132) and update the document.

##### GAP-246 — Cron boundaries use UTC while the platform clock is Cairo
- Status label: UNCLEAR
- Evidence: Weekly digest and month-end use UTC weeks and months, per-session pass expiry uses the UTC day start, while lesson reminders use `PLATFORM_TIME_ZONE`. Egypt's local day starts 2 to 3 hours before UTC.
- Impact on testing: Boundary tests near midnight Cairo time may behave differently from user expectation (for example an invoice for the "previous month" cut at 02:00 or 03:00 Cairo time).
- Recommendation: Confirm intended behaviour (Q-133) and test around the boundaries with a controlled clock.

##### GAP-247 — Subscription expiry has daily granularity
- Status label: UNCLEAR
- Evidence: `expire-subscriptions` runs once a day (01:30 UTC). A subscription whose `periodEnd` passes at any other time stays `active` until the next run, so access may last up to about a day past `periodEnd`. Whether access checks also compare `periodEnd` directly is outside this module.
- Impact on testing: Testers cannot rely on the status flipping at the exact end time.
- Recommendation: Confirm intent (Q-136); test the access check separately from the sweep.

##### GAP-248 — Cron jobs silently truncate at fixed batch sizes
- Status label: RISK
- Evidence: Limits: lesson reminders 500 sessions, renewal reminders 1 000 per bucket, guardian reminders 2 000, weekly digest 5 000 centers, subscription pass paging 2 000. Rows beyond a limit are not processed in that run and no warning is returned.
- Impact on testing: Scale tests with large data may find missing notifications.
- Recommendation: Return a `truncated` flag or loop until done; add a scale test.

##### GAP-249 — Deep mail health result shape is unverified
- Status label: UNCLEAR
- Evidence: The `mail` field produced by `verifySmtp` was not inspected, and it is unknown how it behaves when the provider is not SMTP (see GAP-245).
- Impact on testing: Cannot define the expected value of `mail`.
- Recommendation: Read `verifySmtp` and document the shape (Q-132).

##### GAP-250 — Details not verified in this pass
- Status label: UNCLEAR
- Evidence: Not verified: the exact batch size of the data-export worker (code shows a take of 10 near line 53, the earlier read said 5); the return shape of renewal reminders and collaboration expiry; the HTTP code zod validation errors produce on revalidate; whether 5xx bodies ever include internal details; the body of realtime `/healthz`; behaviour of Docker/Railway files other than the two json files read.
- Impact on testing: Test cases that depend on these state the unknown in Notes.
- Recommendation: Product owner or developer to confirm.

##### GAP-251 — Health endpoint reveals limiter mode publicly
- Status label: RISK
- Evidence: The unauthenticated health body includes `rateLimiter: "shared" | "local"`; `local` tells an attacker the limits are per instance and bypassable by spreading requests.
- Impact on testing: Low severity information disclosure; useful to monitors.
- Recommendation: Keep for operators but consider showing it only to the deep-check secret.

##### GAP-252 — CSP report endpoint silently drops unparseable bodies
- Status label: MISSING ERROR HANDLING
- Evidence: A body that is not JSON returns 204 and is ignored (FR-565). A broken report pipeline would look identical to a healthy quiet one.
- Impact on testing: No negative signal if Sentry forwarding stops.
- Recommendation: Count dropped reports or send a periodic test report.

##### GAP-253 — Weaker CSP spots and a report-only footgun
- Status label: RISK
- Evidence: `style-src` keeps `'unsafe-inline'` in the ERP; the www site CSP allows inline scripts (FR-574); `CSP_MODE=report-only` turns enforcement off silently if left set in production.
- Impact on testing: Cross-site-scripting defence is weaker than the ERP script policy implies.
- Recommendation: Confirm intent (Q-129). Add a smoke check that production sends `Content-Security-Policy`, not `-Report-Only`.

##### GAP-254 — Database recovery layers cannot be verified from the repository
- Status label: UNCLEAR
- Evidence: Neon PITR window, plan tier, B2/S3 bucket lifecycle rules and the date of the last successful restore test on production data are not visible in the repo (FR-593).
- Impact on testing: Backup and recovery testing can only be done on a test copy.
- Recommendation: Product owner to supply the facts (Q-127) and run a timed restore drill.

##### GAP-255 — Missing automated tests for scheduled jobs and infrastructure
- Status label: MISSING AUTOMATED TEST
- Evidence: No test found for `runMonthEndStatements`, `runDataExportJob` through the cron route, `expirePaymentIntents` on its own, or the cron scheduler; no test for the manifest, the push subscription hook, the install prompt, the purge-on-logout function, the boot assertions as a whole or the backup scripts' retention. Present: lesson, renewal and weekly digest DB tests, a batching unit test, guardian reminders inside `invite-claim.test.ts`, subscriptions sweep inside `h03-capture-outcomes.test.ts`, collaboration expiry inside `hall-booking.test.ts`.
- Impact on testing: Higher manual-test priority for the uncovered features.
- Recommendation: Add tests for the listed items.

##### GAP-256 — No CORS layer found
- Status label: UNCLEAR
- Evidence: No CORS middleware was found in service-kit, server-core http/auth, the services or the ERP proxy. The architecture is same-origin via Vercel rewrites. Origin trust for auth is configured through the auth library's trusted-origins (owned by the authentication module).
- Impact on testing: Cross-origin calls from other sites are expected to fail; this is untested.
- Recommendation: Test a cross-origin fetch with credentials and a preflight against both services; confirm that failure is intended.

##### GAP-257 — Service worker takes over immediately and caches personal API data
- Status label: RISK
- Evidence: `skipWaiting` and `clientsClaim` are on, and per-user API GET responses stay cached up to 24 h after last use (`sw.ts:32-46`).
- Impact on testing: After a deploy an open tab may run old page code against a new service worker; on a shared device another person could read cached responses offline if logout purge fails.
- Recommendation: Test deploy-while-open and logout-then-offline reads.

##### GAP-258 — Load and endurance coverage is local and partial
- Status label: PARTIALLY IMPLEMENTED
- Evidence: The k6 harness refuses non-localhost targets and the 2026-09-20 campaign ran against a local database (`tests/load/README.md`, `docs/reports/load-test-2026-09-20.md`). It found a connection-pool deadlock (fixed) and a single-thread ceiling. No spike, soak/endurance or production-like test is documented.
- Impact on testing: Spike and endurance requirements cannot be marked verified.
- Recommendation: Run spike and soak tests on a production-like test environment (never on production).

##### GAP-259 — Monitoring and alerting configuration cannot be verified
- Status label: UNCLEAR
- Evidence: The uptime runbook exists, but whether an external monitor, Sentry alert rules and who receives them are configured is not visible in the repo.
- Impact on testing: Cannot confirm detection of failures such as a degraded health check or a red cron run.
- Recommendation: Product owner to confirm (Q-138).

#### Questions for the Product Owner

##### Q-125 — Which scheduler runs the nine background jobs in production, and are `CRON_SECRET` and `CRON_BASE_URL` configured?
- Context: The workflow exists, a document says the jobs are unscheduled (GAP-236).
- Why it matters: Decides whether expiry, reminders and statements can be accepted as working.

##### Q-126 — What is the expected behaviour when a month-end statement fails for one teacher or center?
- Context: The job swallows errors (GAP-238).
- Why it matters: Defines the pass/fail rule and the alert path.

##### Q-127 — What are the Neon PITR window, the bucket retention and the date of the last production restore drill?
- Context: Not visible in the repo (GAP-254).
- Why it matters: Recovery objectives cannot be accepted without them.

##### Q-128 — Must each tour page be restricted to its own role?
- Context: No guard in the page files (GAP-243).
- Why it matters: Authorization test expectation.

##### Q-129 — Is the weaker content security policy on the marketing site and `style-src 'unsafe-inline'` accepted?
- Context: GAP-253.
- Why it matters: Security test expectation.

##### Q-130 — Is the SVG-only manifest icon set sufficient, or must PNG icons exist?
- Context: GAP-240.
- Why it matters: Install acceptance criteria.

##### Q-131 — Should unsynced offline attendance survive logout?
- Context: GAP-239.
- Why it matters: Shared-device privacy expectation.

##### Q-132 — Which mail provider and variables are authoritative in production (Resend or SMTP), and what does the deep health `mail` field return?
- Context: GAP-245, GAP-249.
- Why it matters: Mail-dependent jobs and the deep probe cannot be tested without it.

##### Q-133 — Should digests, statements and pass expiry follow Cairo time instead of UTC?
- Context: GAP-246.
- Why it matters: Boundary expectations.

##### Q-134 — What availability, response-time and recovery targets does the business require?
- Context: No numeric targets in code; the load report gives measurements only.
- Why it matters: Non-functional acceptance values are RECOMMENDATIONS until confirmed.

##### Q-135 — Should the unauthenticated and secret-only endpoints have their own rate limits?
- Context: GAP-241.
- Why it matters: Security test expectation.

##### Q-136 — Is up to one day of access beyond `periodEnd` acceptable?
- Context: GAP-247.
- Why it matters: Subscription-expiry acceptance criteria.

##### Q-137 — Which browsers, operating systems and devices must be supported?
- Context: No support matrix found in the repository.
- Why it matters: Defines compatibility and responsive test scope.

##### Q-138 — Who receives alerts for a failing health check, a red cron run, a failed backup and Sentry errors?
- Context: GAP-259.
- Why it matters: Operations acceptance.

### 4.13. Data Model & Data Integrity

Each gap names the code that shows it. "Impact on testing" says what a tester must do differently until the gap is closed. Every SQL check in this module runs on the LOCAL test database `edura_test` (`edura-env:test`) only.

##### GAP-260 — `scopedDb` turns RLS off for every role except center_admin

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/server-core/src/db/scope.ts:13-35 (bypass at :24-27); packages/database/src/client.ts:185-204 |
| Detail | `scopedDb` sets the tenant GUC only for `center_admin`. Every other role, including `center_staff`, `teacher`, `parent` and `student`, gets a platform-bypass client. For those roles, tenancy depends only on the WHERE clauses in each service. Center staff are kept in their own center by `authorizeCenterActor` (packages/server-core/src/authz/center-actor.ts:49-75), not by RLS. |
| Impact on testing | RLS isolation tests (TC-1265..004) prove the database layer only. Cross-tenant reads by staff/teacher/parent/student must be tested through the API in the role modules. |
| Recommendation | Decide whether `center_staff` should run under `withTenant` (Q-139). Keep the IDOR suites (poc-m01-staff-session-idor, sessions-staff-scope) mandatory in CI. |

##### GAP-261 — 43 tables have no row-level security

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | apps/erp/tests/db/rls-table-set.test.ts:15-25 (the 41 FORCE-RLS tables); data.md "Tenancy" column (tables marked app-layer) |
| Detail | 84 tables exist. 41 have FORCE RLS. The remaining 43 rely on application WHERE clauses. They include users, student_profiles, wallet_ledger, parent_wallet_ledger, payment_intents, conversation_messages and auth_sessions. |
| Impact on testing | Isolation for these tables cannot be proven with SQL as `edura_app`. It needs API-level tests per role. |
| Recommendation | Document which of the 43 tables are intentionally global, and add RLS where per-tenant data is held. |

##### GAP-262 — REVOKEs are skipped silently when `edura_app` is missing at migration time

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/database/prisma/migrations/20260912120000_users_revoke_delete/migration.sql:12; packages/database/prisma/migrations/20260802100100_maturity_layer/migration.sql:193; packages/database/prisma/migrations/20260723120100_blacklist_cascade_journal/migration.sql:86 |
| Detail | REVOKE / GRANT blocks run inside `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edura_app')`. A database migrated before the role exists gets no append-only or no-delete protection. The bootstrap script and verify-db are the only backstop. |
| Impact on testing | Always run verify-db (TC-1334/071) after preparing a database. The grant TCs (TC-1276..017, TC-1322) assume the role existed during migration. |
| Recommendation | Make bootstrap fail the deploy if grants drift, or re-apply the grant map from bootstrap-app-role.ts. |

##### GAP-263 — A soft-deleted user can be re-activated, and `findUnique` still returns them

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/server-core/src/backoffice/admin/admin-users.ts:175-190; packages/database/src/extensions/index.ts:81-123 (findUnique not filtered) |
| Detail | `updateUserStatus` changes `status` without checking `deleted_at`. The soft-delete extension filters list reads but not `findUnique`, so code that looks a user up by id or email still sees a deleted row. |
| Impact on testing | TC-1282 records the current behaviour. Role modules should test login and lookup for a deleted user. |
| Recommendation | Product decision (Q-140). Then either refuse status changes on deleted users or document the restore path. |

##### GAP-264 — Re-activating a center re-activates every admin, including ones suspended on their own

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/server-core/src/backoffice/admin/center-control.ts:73-80 |
| Detail | Reactivation sets `status='active'` on all of the center's admins. It does not restore each admin's previous status. |
| Impact on testing | Test suspend admin → suspend center → reactivate center, and record the admin's final status. |
| Recommendation | Q-141. |

##### GAP-265 — Lifting a platform blacklist sets the user active unconditionally

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/server-core/src/services/blacklist/blacklist.ts:426-427 |
| Detail | Lifting the blacklist sets `status='active'` even when the account was suspended or deleted for another reason before or during the blacklist. |
| Impact on testing | Test a user who is both suspended and blacklisted, then lift the blacklist. |
| Recommendation | Restore the status recorded before the blacklist, or refuse when another reason is still active. |

##### GAP-266 — An auto-audit failure is swallowed; the write still commits

| Field | Value |
|---|---|
| Status | MISSING ERROR HANDLING |
| Evidence | packages/database/src/extensions/index.ts:158-248 (audit insert inside a savepoint; the error is caught) |
| Detail | An audited model write commits even if its `audit_logs` row fails to insert. The money paths that write their own audit rows are not affected. |
| Impact on testing | TC-1323 only proves the happy path. A forced audit failure cannot be produced without changing the code. |
| Recommendation | Q-143. At minimum, log/alert on a swallowed audit failure. |

##### GAP-267 — Refund transactions stay `pending`

| Field | Value |
|---|---|
| Status | UNCLEAR |
| Evidence | packages/database/prisma/schema.prisma:1375 (`TransactionStatus @default(pending)`) |
| Detail | Reversal rows in `transactions` are inserted with the default status. No code path found that moves them to a final status. |
| Impact on testing | Reports that filter on transaction status may leave refunds out. Expected values are UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION. |
| Recommendation | Confirm the intended final status of a refund transaction. |

##### GAP-268 — Enum values that nothing writes

| Field | Value |
|---|---|
| Status | UNCLEAR |
| Evidence | packages/database/prisma/schema.prisma:115-117 (CourseStatus.ended), :123-125 (SessionStatus.ongoing), :330-333 (InvoiceStatus incl. void) |
| Detail | No service writes `SessionStatus.ongoing`, `CourseStatus.ended`, or the InvoiceStatus values `paid` and `void` (data.md "Enums and status transitions"). |
| Impact on testing | No TC can reach these states through the product. |
| Recommendation | Q-144. |

##### GAP-269 — Demo purge leaves money rows behind

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/database/prisma/owner-purge.ts:15-54 |
| Detail | The owner purge deletes payments and the student/parent wallet ledgers. It does not delete `center_wallet_ledger`, `transactions`, `session_settlements`, or teacher-direct payments written by HTTP money seeds. Those tables are append-only for `edura_app` and do not carry `is_demo`. |
| Impact on testing | After a money demo seed + purge, a test database is not clean (TC-1328). Rebuild edura_test from scratch (WF-116) before money test runs. |
| Recommendation | Extend owner-purge to every money table the seeds write, keyed on the seeded ids. |

##### GAP-270 — `session_settlements.session_id` has no foreign key

| Field | Value |
|---|---|
| Status | MISSING VALIDATION |
| Evidence | packages/database/prisma/schema.prisma:2509-2513 (`sessionId String @unique`, no `@relation`) |
| Detail | A settlement can point at a session id that does not exist. Combined with the no-DELETE grant on settlements, an orphan can never be cleaned up by the app. |
| Impact on testing | TC-1300..038 insert settlements with any uuid. Insert-with-unknown-session succeeds. |
| Recommendation | Add the FK (Restrict), or document why it is loose. |

##### GAP-271 — Seed falls back to a built-in password and to fallback staff emails outside production

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/database/prisma/seed.ts:8 (SEED_PASSWORD fallback), :20-34 (production-only checks), :95-104 (fallback superadmin / accountant emails) |
| Detail | Outside production, seed.ts falls back to a built-in default password when SEED_PASSWORD is unset. It also creates `superadmin@edura.eg` / `accountant@edura.eg` when the SEED_* variables are unset. In production, the variables are required. |
| Impact on testing | A dev or test database seeded without SEED_PASSWORD has a well-known password on platform staff. For login tests, use the accounts in docs/guides/test-credentials.md. |
| Recommendation | Require SEED_PASSWORD on every environment. |

##### GAP-272 — uat-seed is designed to run against production

| Field | Value |
|---|---|
| Status | RISK |
| Evidence | packages/database/prisma/uat-seed.ts:4-5, :402-405, :409 (`--yes` required) |
| Detail | The UAT seed documents `EDURA_ENV=production` as its intended target. It writes 12 accounts and center UATC to the live database (no money). It is guarded only by the explicit `--yes` flag. |
| Impact on testing | UAT accounts may exist in production. Exclude them from production data checks. |
| Recommendation | Q-145. |

##### GAP-273 — `is_demo` on child tables conflicts with the root-entities rule

| Field | Value |
|---|---|
| Status | CONFLICTING |
| Evidence | packages/database/prisma/migrations/20260718000000_is_demo_flag/migration.sql:8-30; packages/database/prisma/schema.prisma:446,674,1110,1678,1745,2312 |
| Detail | The is_demo migration puts the flag on root entities only. Later models (subscriptions, conversations, groups) carry their own `is_demo`. Money ledgers carry none. A purge keyed on `is_demo` alone therefore misses ledger rows. |
| Impact on testing | "Demo data is purgeable" (FR-623) is PARTIALLY IMPLEMENTED. |
| Recommendation | Q-142. |

##### GAP-274 — Seven DB suites are excluded from the local run

| Field | Value |
|---|---|
| Status | MISSING AUTOMATED TEST |
| Evidence | apps/erp/package.json:37-39 (catalog-onboarding, c01-lesson-settlement, h03-seed-uuid-flows, profile-images); apps/superadmin/package.json:17,23 (c02-payout-generation, room-pricing-methods, room-revenue-split) |
| Detail | These suites never run with `test:db:local`, and most are also excluded from `test:db:ci`. Lesson settlement, payout generation and the seed-UUID flows are therefore not checked automatically. |
| Impact on testing | Cover the affected FRs (FR-609, FR-623, FR-629) manually with the TCs in tc.md. |
| Recommendation | Fix and re-enable the suites, or record why each is excluded. |

##### GAP-275 — The test-credentials guide lists accounts that no seed creates

| Field | Value |
|---|---|
| Status | CONFLICTING |
| Evidence | docs/guides/test-credentials.md:7-30 vs packages/database/prisma/seed.ts:45-340 (no other seed in packages/database/prisma mentions these emails) |
| Detail | The guide lists 11 accounts. Seven of them are created by no seed in the repo: teachers hana.rashidi@, nourhan.mostafa@ and kareem.salah@; students ahmed.mostafa@, sara.elsayed@ and omar.khaled@; parent tarek.mostafa@. The seeded assistant sara.fawzy@nile-academy.eg is not listed. |
| Impact on testing | On a freshly prepared test database, logins for those seven accounts fail. Testers must use the 4 seeded NILE accounts plus the assistant, or create the others by hand. |
| Recommendation | Update the guide to match seed.ts, or add the missing accounts to a demo seed. |

##### Q-139 — Should `scopedDb` use `withTenant` for center_staff (and other center-bound roles)?
Today only center_admin gets RLS; everyone else bypasses (GAP-260).

##### Q-140 — Should a soft-deleted user be re-activatable, and should `findUnique` return deleted users?
See GAP-263 and EC-669.

##### Q-141 — When a center is re-activated, should admins who were individually suspended stay suspended?
See GAP-264.

##### Q-142 — Is `is_demo` intended on subscriptions, conversations and groups, and how should demo money rows be purged?
See GAP-269 and GAP-273.

##### Q-143 — Should a failed audit-log insert fail the write it audits?
See GAP-266.

##### Q-144 — Are `SessionStatus.ongoing`, `CourseStatus.ended` and InvoiceStatus `paid`/`void` meant to be used, or are they dead values?
See GAP-268.

##### Q-145 — Is running uat-seed against production approved, and who removes its rows before launch?
See GAP-272.

##### Q-146 — Is it intended that wipe-data truncates the reference catalog on dev and test?
packages/database/scripts/wipe-data.ts. The convention says the catalog always stays, but that rule is stated for the pre-launch purge in production.

## 5. Requirements without test cases
Every functional requirement has at least one linked test case.

## 6. Cross-cutting questions for the Product Owner
| ID | Question | Why it matters |
|---|---|---|
| X-1 | Which deployment is the official test/staging environment for independent QA, and does it have its own database, Paymob sandbox keys and a WhatsApp sandbox? | Testing on dev or production is not acceptable; the plan assumes an isolated environment. |
| X-2 | What are the performance targets (response time per key endpoint, concurrent counters per centre, concurrent users platform-wide)? | No targets exist in the code; performance results cannot pass or fail without them. |
| X-3 | Which browsers, devices and OS versions must be supported (including the installed PWA)? | Defines the compatibility matrix. |
| X-4 | What accessibility level is required (e.g. WCAG 2.1 AA)? | No level is specified in the code. |
| X-5 | Will the test environment load both the main demo seed and the UAT seed, who holds the platform (`super_admin`, `accountant`) logins, and can the project provision an external (shell) teacher and an adult verified student? Should `docs/guides/test-credentials.md` be corrected to match the seeds? | Authorization and horizontal-escalation tests need every role and two tenants; the credentials guide lists seven accounts no seed creates and omits the seeded assistant, staff and platform accounts. |
| X-6 | Who signs off UAT for each role, and which real centres will take part? | UAT exit criterion. |
| X-7 | What is the backup recovery-point and recovery-time objective, and may QA run a restore drill on a copy? | Release-readiness criterion 9. |
| X-8 | Is a controlled live Paymob transaction (smallest amount, refunded) permitted before launch, and who approves it? | Sandbox success does not prove live configuration. |
