# Edura — Requirement Traceability Matrix

| Item | Value |
|---|---|
| Document | REQUIREMENT_TRACEABILITY_MATRIX.md (4 of 5 in `docs/qa-handoff/`) |
| Baseline | Repository `main` at commit `f7e33102`, inspected 2026-11-01 |
| Functional requirements | 630 |
| Test cases | 1347 |
| FRs without a test case | 0 |

## How this matrix was built
The matrix is generated from the test cases themselves: every test case's `Requirement ID` field in
`DETAILED_TEST_CASES.md` is read and linked back to its FR in `PRD_QA_HANDOFF.md`. It therefore cannot
claim coverage that the test cases do not provide. Columns:

- **Implementation status** — from the FR (IMPLEMENTED, PARTIALLY IMPLEMENTED, NOT IMPLEMENTED, UNCLEAR, CONFLICTING).
- **Test Case IDs** — every test case that names the FR.
- **Test Types** — the union of those test cases' types.
- **Priority** — the highest priority among the linked test cases.

A row marked **NO TEST CASE** is a coverage gap and must be closed (or explicitly waived by the Product
Owner) before release.

## Coverage by module
| # | Module | FR range | FRs | TCs | Gaps |
|---|---|---|---|---|---|
| 1 | Authentication, Accounts & Onboarding | FR-001 – FR-041 | 41 | 114 | 16 |
| 2 | Catalog, Discovery, Search & Public Site | FR-042 – FR-099 | 58 | 114 | 15 |
| 3 | Center Administration | FR-100 – FR-172 | 73 | 153 | 22 |
| 4 | Courses, Sessions, Enrollment & Attendance | FR-173 – FR-215 | 43 | 83 | 22 |
| 5 | Payments, Subscriptions, Wallets & Settlement | FR-216 – FR-263 | 48 | 99 | 17 |
| 6 | Teacher Portal, Assistants, Collaboration & Academic Content | FR-264 – FR-310 | 47 | 83 | 23 |
| 7 | Student & Parent Portals | FR-311 – FR-348 | 38 | 92 | 17 |
| 8 | Messaging, Notifications & Communication Integrations | FR-349 – FR-418 | 70 | 157 | 26 |
| 9 | Reports, Dashboards & Exports | FR-419 – FR-447 | 29 | 65 | 25 |
| 10 | Super Admin Platform Operations | FR-448 – FR-512 | 65 | 131 | 29 |
| 11 | Finance & Accounting (Back-office) | FR-513 – FR-547 | 35 | 84 | 23 |
| 12 | Platform, Infrastructure & Non-Functional | FR-548 – FR-594 | 47 | 89 | 24 |
| 13 | Data Model & Data Integrity | FR-595 – FR-630 | 36 | 83 | 16 |
| | **Total** | | **630** | **1347** | **275** |

## Requirements without test cases
Every functional requirement has at least one linked test case.

## Matrix

### Authentication, Accounts & Onboarding

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-001 | ERP sign-in with email and password | IMPLEMENTED | TC-001, TC-002, TC-003 | Authorization, Functional, Negative | Critical |
| FR-002 | Account-state errors on sign-in (pending / inactive / rate-limited) | IMPLEMENTED | TC-004, TC-005, TC-006, TC-007, TC-008 | Boundary, Functional, Negative, Security | Critical |
| FR-003 | ERP two-factor challenge (TOTP or backup code) | IMPLEMENTED | TC-009, TC-010, TC-011 | Functional, Negative, Security | Critical |
| FR-004 | Sign out (all presented tokens) | IMPLEMENTED | TC-012, TC-013 | Functional, Security | Critical |
| FR-005 | Enable / disable own 2FA (ERP security settings) | IMPLEMENTED | TC-014, TC-015, TC-016 | Functional, Negative | Critical |
| FR-006 | Student self-registration | IMPLEMENTED | TC-017, TC-018, TC-019 | Boundary, Functional, Negative | High |
| FR-007 | Parent self-registration | IMPLEMENTED | TC-020, TC-021 | Functional, Negative | High |
| FR-008 | Teacher self-registration (pending approval) | IMPLEMENTED | TC-022, TC-023 | Boundary, Workflow | High |
| FR-009 | Center self-registration (center + pending admin) | IMPLEMENTED | TC-024, TC-025 | Functional, Negative | High |
| FR-010 | Forgot password (request reset link) | IMPLEMENTED | TC-026, TC-027, TC-028 | Boundary, Functional, Security | Critical |
| FR-011 | Reset password with token | PARTIALLY IMPLEMENTED (works; does not check `users.status`, leaves sibling tokens live — see GAP-002) | TC-029, TC-030, TC-031, TC-032 | Functional, Negative, Security | Critical |
| FR-012 | Accept a legacy invite (set password by token) | PARTIALLY IMPLEMENTED (user resolved by `row.email` with no purpose check — GAP-001) | TC-033, TC-034, TC-035 | Concurrency, Functional, Security | Critical |
| FR-013 | Claim an invite token (`/claim` → session for the invited user) | IMPLEMENTED | TC-036, TC-037, TC-038, TC-039 | Boundary, Negative, Security, Workflow | Critical |
| FR-014 | Claim a view-as handoff token | IMPLEMENTED | TC-040, TC-041, TC-042, TC-043, TC-044 | Authorization, Boundary, Integration, Security | Critical |
| FR-015 | Stop a view-as session | IMPLEMENTED | TC-045, TC-046 | Functional, Negative | Critical |
| FR-016 | Read own account (`GET /api/v1/me`) | IMPLEMENTED | TC-047, TC-048 | Functional, Negative | High |
| FR-017 | Update own profile (`PATCH /api/v1/me`) | IMPLEMENTED | TC-049, TC-050 | Functional, Security | High |
| FR-018 | Change own password (signs out every device) | IMPLEMENTED | TC-051, TC-052, TC-053, TC-054 | Boundary, Functional, Negative | Critical |
| FR-019 | Request a login e-mail change | IMPLEMENTED | TC-055, TC-056, TC-057 | Functional, Negative | Critical |
| FR-020 | Confirm the e-mail change (token; signs out everywhere) | IMPLEMENTED | TC-058, TC-059 | Functional, Negative | Critical |
| FR-021 | Set first credentials after a claim (`/api/v1/me/credentials`) | PARTIALLY IMPLEMENTED (no `token_version` bump — GAP-003) | TC-060, TC-061, TC-062, TC-063 | Boundary, Negative, Security, Workflow | Critical |
| FR-022 | Own UI preferences (`/api/v1/me/prefs`) | IMPLEMENTED | TC-064 | Functional | Medium |
| FR-023 | Own public handle (teacher / center admin) | IMPLEMENTED | TC-065, TC-066, TC-067, TC-068 | Authorization, Boundary, Functional, Negative | Medium |
| FR-024 | Read onboarding state | IMPLEMENTED | TC-069, TC-070 | Functional, Negative | High |
| FR-025 | Save onboarding draft | IMPLEMENTED | TC-071, TC-072 | Functional, Negative | High |
| FR-026 | Complete student onboarding (system → stage → grade → track → second language) | IMPLEMENTED | TC-073, TC-074 | Negative, Workflow | High |
| FR-027 | Complete teacher / center onboarding | IMPLEMENTED | TC-075, TC-076 | Functional, Negative | High |
| FR-028 | Onboarding welcome e-mail: token status and resend | IMPLEMENTED | TC-077, TC-078 | Boundary, Functional | High |
| FR-029 | Authentication audit trail | IMPLEMENTED | TC-079, TC-080 | Database | Critical |
| FR-030 | Session reads and guards (`requireSession`, `withRole`, ambiguous cookies) | IMPLEMENTED | TC-081, TC-082, TC-083, TC-084 | Authorization, Security | Critical |
| FR-031 | SSR session and server-side portal gate | IMPLEMENTED (note: the login page still writes the dead `edura_state` localStorage key, acknowledged in `docs/decisions/server-side-portal-gate.md:78-79,108` — see GAP-008) | TC-085, TC-086, TC-087, TC-088 | API, Authorization, Functional, Workflow | Critical |
| FR-032 | Profile completeness checklist | IMPLEMENTED | TC-089 | Functional | Medium |
| FR-033 | Account deletion request (`/api/v1/me/delete-request`) | IMPLEMENTED | TC-090, TC-091 | Functional, Negative | Critical |
| FR-034 | Data-rights deletion (self or approved child) | IMPLEMENTED | TC-092, TC-093, TC-094 | Authorization, Functional | Critical |
| FR-035 | Data-rights export (request, download, cancel) | IMPLEMENTED | TC-095, TC-096 | Authorization, Functional | Medium |
| FR-036 | Guardian e-mail verification (issue, resend, confirm) | IMPLEMENTED | TC-097, TC-098, TC-099, TC-100 | Authorization, Boundary, Negative, Workflow | Critical |
| FR-037 | Guardian contact (status and set e-mail / phone) | IMPLEMENTED | TC-101, TC-102, TC-103, TC-104, TC-105 | Authorization, Boundary, Negative, Security, Workflow | Critical |
| FR-038 | Back-office sign-in | IMPLEMENTED | TC-106, TC-107, TC-108 | Authorization, Boundary, Functional | Critical |
| FR-039 | Back-office 2FA challenge and forced setup | IMPLEMENTED | TC-109, TC-110 | Negative, Workflow | Critical |
| FR-040 | Back-office SSR session and fail-closed `requireSession` | PARTIALLY IMPLEMENTED (dashboard layout has no signed-out redirect — GAP-009) | TC-111, TC-112, TC-113 | Functional, Security | Critical |
| FR-041 | Back-office own profile and prefs | IMPLEMENTED | TC-114 | Functional | Medium |

### Catalog, Discovery, Search & Public Site

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-042 | Catalog tree |  | TC-115, TC-116, TC-117 | API, Functional | High |
| FR-043 | Subjects for a selection |  | TC-118, TC-119 | API, Functional | High |
| FR-044 | Own-track subject default and browse-all mode |  | TC-120, TC-121 | Functional, UI | High |
| FR-045 | Second-language scoping |  | TC-122 | API, Functional | Medium |
| FR-046 | Public subjects list |  | TC-123 | API, Functional | Medium |
| FR-047 | Own subjects (mine) and parent-for-child |  | TC-124 | API, Functional | High |
| FR-048 | Catalog structure integrity |  | TC-125 | Data Integrity | Low |
| FR-049 | Course search |  | TC-126, TC-127, TC-128, TC-129, TC-141 | API, Data Integrity, Functional | High |
| FR-050 | Student and parent catalog scope on discovery |  | TC-130, TC-131 | API, Functional | High |
| FR-051 | Teacher-days search |  | TC-132 | API, Functional | Medium |
| FR-052 | Centres search |  | TC-133 | API, Functional | High |
| FR-053 | Teachers search |  | TC-134 | API, Functional | High |
| FR-054 | Paging and filter parsing |  | TC-135, TC-136 | API, Functional | Medium |
| FR-055 | Caching and live counts |  | TC-137, TC-138, TC-139, TC-140 | API, Functional | High |
| FR-056 | Centre public page |  | TC-142, TC-143 | Functional, UI | High |
| FR-057 | Course detail |  | TC-144, TC-145, TC-146, TC-147, TC-148, TC-228 | API, Functional, UI | High |
| FR-058 | Request enrollment from the course page |  | TC-149 | Functional, UI | Medium |
| FR-059 | Public profile page |  | TC-150, TC-151, TC-152 | Functional, UI | High |
| FR-060 | Profile status gate |  | TC-153, TC-154, TC-155 | API, Functional | High |
| FR-061 | Handle format and reserved words |  | TC-156 | API, Functional | Medium |
| FR-062 | Fresh versus cached profile read |  | TC-157 | API, Functional | Medium |
| FR-063 | Sitemap handles API |  | TC-158, TC-159 | API, Data Integrity, Functional | High |
| FR-064 | ERP sitemap |  | TC-160, TC-161 | API, Functional, UI | High |
| FR-065 | Tenant sub-domain routing |  | TC-162, TC-225 | API, Functional, UI | Low |
| FR-066 | Affiliation-invite landing |  | TC-163 | Functional, UI | Medium |
| FR-067 | 404 handling in the ERP |  | TC-164 | Functional, UI | High |
| FR-068 | Global search endpoint |  | TC-165, TC-166, TC-167, TC-168, TC-193 | API, Functional | High |
| FR-069 | Centre providers and tiers |  | TC-169, TC-170, TC-171, TC-172 | API, Functional | High |
| FR-070 | Teacher search scope |  | TC-173 | API, Functional | High |
| FR-071 | Assistant search scope |  | TC-174 | API, Functional | High |
| FR-072 | Parent search scope |  | TC-175 | API, Functional | High |
| FR-073 | Student search scope |  | TC-176 | API, Functional | High |
| FR-074 | Ranking |  | TC-177, TC-226 | API, Functional | Medium |
| FR-075 | Off-roster masking and portal-aware links |  | TC-178, TC-179 | API, Functional, UI | High |
| FR-076 | Text normalisation |  | TC-128, TC-180, TC-181, TC-182 | API, Functional | High |
| FR-077 | Search adds no reach (invariant) |  | TC-183, TC-184, TC-227 | API, Functional | High |
| FR-078 | Back-office global search |  | TC-185, TC-186, TC-187 | API, Functional | High |
| FR-079 | ERP search palette |  | TC-188, TC-189, TC-190 | Functional, UI | High |
| FR-080 | Back-office search palette |  | TC-191 | Functional, UI | Medium |
| FR-081 | Non-searching roles |  | TC-192 | API, Functional | Medium |
| FR-082 | Contact submission validation |  | TC-194, TC-195, TC-196, TC-197, TC-198 | API, Functional, UI | High |
| FR-083 | Contact persistence |  | TC-194, TC-199, TC-200, TC-201 | API, Data Integrity, Functional, UI | High |
| FR-084 | ERP contact page |  | TC-194, TC-202 | Functional, UI | High |
| FR-085 | Public pricing |  | TC-203, TC-204, TC-205 | API, Functional, UI | High |
| FR-086 | FAQ page |  | TC-206 | Functional, UI | Low |
| FR-087 | Help centre |  | TC-207, TC-208 | Functional, UI | Medium |
| FR-088 | Changelog page |  | TC-209 | Functional, UI | Low |
| FR-089 | Legal pages |  | TC-210 | Functional, UI | Medium |
| FR-090 | ERP locale handling and metadata |  | TC-202, TC-211 | Functional, UI | High |
| FR-091 | Landing page |  | TC-212, TC-224 | Functional, UI | High |
| FR-092 | Role pages |  | TC-213 | Functional, UI | Medium |
| FR-093 | Pricing, FAQ, trust, privacy, terms (www) |  | TC-214 | Functional, UI | Medium |
| FR-094 | www contact form |  | TC-215, TC-216, TC-217, TC-218 | API, Functional, UI | High |
| FR-095 | www locale routing |  | TC-219 | Functional, UI | High |
| FR-096 | www sitemap and robots |  | TC-220 | Functional, UI | High |
| FR-097 | www 404 |  | TC-221 | Functional, UI | Medium |
| FR-098 | www catalogue copy |  | TC-222 | Functional, UI | Medium |
| FR-099 | www theme, direction and fonts |  | TC-212, TC-223 | Functional, UI | High |

### Center Administration

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-100 | Center actor resolution and sub-role gating | IMPLEMENTED | TC-229, TC-230, TC-231, TC-232 | Security | Critical |
| FR-101 | Audit of staff mutations on behalf of the center | PARTIALLY IMPLEMENTED | TC-233, TC-234, TC-235 | Audit | Critical |
| FR-102 | Center accountant is read-only | IMPLEMENTED | TC-236, TC-237 | Security | Critical |
| FR-103 | View own center profile | IMPLEMENTED | TC-238 | Functional | Medium |
| FR-104 | Update own center profile | PARTIALLY IMPLEMENTED | TC-239, TC-240, TC-241 | Boundary, Functional, Negative | Medium |
| FR-105 | Center logo management | IMPLEMENTED | TC-242, TC-243 | Functional, Security | Medium |
| FR-106 | Public center profile | IMPLEMENTED | TC-244, TC-245 | Functional, Negative | Low |
| FR-107 | List center admins | IMPLEMENTED | TC-246 | Functional | Medium |
| FR-108 | Invite a co-admin | NOT IMPLEMENTED (invite cannot be accepted) | TC-247 | Negative | Medium |
| FR-109 | Remove a co-admin | PARTIALLY IMPLEMENTED | TC-248, TC-249, TC-250 | Functional, Negative, Security | Critical |
| FR-110 | List staff | IMPLEMENTED | TC-251 | Functional | Medium |
| FR-111 | Create staff member and send invite | IMPLEMENTED | TC-252, TC-253, TC-254 | Functional, Negative | Critical |
| FR-112 | Resend staff invite | IMPLEMENTED | TC-255, TC-256 | Boundary, Functional | Medium |
| FR-113 | Update staff (role, title, active) | PARTIALLY IMPLEMENTED | TC-257, TC-258, TC-259 | Functional, Security | Critical |
| FR-114 | Remove staff | PARTIALLY IMPLEMENTED | TC-260, TC-261 | Functional, Negative | Critical |
| FR-115 | Staff self profile | IMPLEMENTED | TC-262 | Functional | Medium |
| FR-116 | List roster students | IMPLEMENTED | TC-263, TC-264 | Functional, Security | High |
| FR-117 | Add an existing student to the roster | IMPLEMENTED | TC-265, TC-266, TC-267 | Functional, Negative | High |
| FR-118 | View a roster student | PARTIALLY IMPLEMENTED | TC-268, TC-269, TC-270 | Functional, Negative, Security | High |
| FR-119 | Update a roster student (identity and operational contact) | IMPLEMENTED | TC-271, TC-272, TC-273 | Functional, Negative, Security | Critical |
| FR-120 | Remove a student from the roster | PARTIALLY IMPLEMENTED | TC-274, TC-275 | Functional, Security | Critical |
| FR-121 | Look up a student by email or phone | IMPLEMENTED | TC-276, TC-277 | Boundary, Functional | High |
| FR-122 | Invite a student by email | NOT IMPLEMENTED (no acceptance path) | TC-278 | Negative | Medium |
| FR-123 | List roster teachers | IMPLEMENTED | TC-279 | Functional | Medium |
| FR-124 | Look up a teacher by email | IMPLEMENTED | TC-280 | Functional | Medium |
| FR-125 | Invite a teacher (optionally as shell) | NOT IMPLEMENTED (no acceptance path) | TC-281 | Negative | Medium |
| FR-126 | Remove a roster teacher | IMPLEMENTED | TC-282 | Negative | Medium |
| FR-127 | Walk-in registration at the counter | IMPLEMENTED | TC-283, TC-284, TC-285, TC-286 | Boundary, Functional, Negative, Security | Critical |
| FR-128 | Resend walk-in claim | IMPLEMENTED | TC-287, TC-288 | Functional, Negative | High |
| FR-129 | Create a temporary student (center route) | IMPLEMENTED | TC-289, TC-290 | Functional, Negative | High |
| FR-130 | Create a temporary student (shared route) | PARTIALLY IMPLEMENTED | TC-291, TC-292 | Functional, Security | High |
| FR-131 | Send a temporary student invite | PARTIALLY IMPLEMENTED | TC-293, TC-294 | Functional, Negative | High |
| FR-132 | Claim a temporary student record | IMPLEMENTED | TC-295, TC-296, TC-297 | Functional, Negative, Security | Critical |
| FR-133 | Parse a student CSV | IMPLEMENTED | TC-298, TC-299 | Functional, Negative | High |
| FR-134 | Import students (dry run, commit, de-duplication) | IMPLEMENTED | TC-300, TC-301, TC-302, TC-303, TC-304 | Boundary, Data integrity, Functional, Integration, Security | Critical |
| FR-135 | View guardian contact (audited) | IMPLEMENTED | TC-305, TC-306, TC-307 | Audit, Boundary, Security | Critical |
| FR-136 | Set guardian contact | IMPLEMENTED | TC-308, TC-309 | Functional, Negative | High |
| FR-137 | List center blacklist | IMPLEMENTED | TC-310, TC-311 | Functional, Negative | High |
| FR-138 | Blacklist a student at the center | CONFLICTING | TC-312, TC-313, TC-314 | Functional, Negative | Critical |
| FR-139 | Lift a center blacklist entry | IMPLEMENTED | TC-315, TC-316 | Functional, Security | Critical |
| FR-140 | Browse the center audit log | IMPLEMENTED | TC-317, TC-318, TC-319 | Functional, Negative, Security | High |
| FR-141 | Audit log filter options (actors, actions) | IMPLEMENTED | TC-320 | Functional | Medium |
| FR-142 | List center rooms | IMPLEMENTED | TC-321, TC-322 | Functional, Security | High |
| FR-143 | Create a room | IMPLEMENTED | TC-323, TC-324 | Functional, Negative | High |
| FR-144 | Update a room | PARTIALLY IMPLEMENTED | TC-325, TC-326 | Functional, Security | High |
| FR-145 | Deactivate ("delete") a room | IMPLEMENTED | TC-327, TC-328 | Functional, Negative | High |
| FR-146 | Upload a room photo | IMPLEMENTED | TC-329, TC-330 | Boundary, Functional | High |
| FR-147 | Per-student rate availability for rooms | IMPLEMENTED | TC-331 | Functional | Medium |
| FR-148 | Teacher browses a center's rooms | IMPLEMENTED | TC-332 | Functional | Medium |
| FR-149 | List team notes | IMPLEMENTED | TC-333, TC-334 | Functional, Security | High |
| FR-150 | Create a team note | IMPLEMENTED | TC-335, TC-336 | Boundary, Functional | High |
| FR-151 | Update a team note (text, pin, status) | IMPLEMENTED | TC-337, TC-338 | Functional, Security | High |
| FR-152 | Remove a team note | IMPLEMENTED | TC-339, TC-340 | Functional, Security | High |
| FR-153 | Resolve a scanned student card | IMPLEMENTED | TC-341, TC-342, TC-343 | Security | Critical |
| FR-154 | Student code generation | IMPLEMENTED | TC-344, TC-345 | Data integrity, Negative | Critical |
| FR-155 | Create an off-system teacher | IMPLEMENTED | TC-346, TC-347 | Functional, Negative | High |
| FR-156 | List center teachers (on- and off-system) | IMPLEMENTED | TC-348, TC-349 | Functional, Security | High |
| FR-157 | View an off-system teacher | IMPLEMENTED | TC-350 | Functional | Medium |
| FR-158 | Update an off-system teacher | IMPLEMENTED | TC-351 | Negative | Medium |
| FR-159 | Remove an off-system teacher | IMPLEMENTED | TC-352, TC-353 | Functional, Negative | High |
| FR-160 | Restore an off-system teacher | IMPLEMENTED | TC-354 | Functional | Medium |
| FR-161 | Convert an off-system teacher to enrolled | PARTIALLY IMPLEMENTED | TC-355, TC-356, TC-357 | Functional, Negative, Security | Critical |
| FR-162 | Convert an enrolled teacher to off-system | IMPLEMENTED | TC-358, TC-359 | Functional, Negative | High |
| FR-163 | Resend the converted teacher's invite | IMPLEMENTED | TC-360 | Functional | Medium |
| FR-164 | Look up a student for manual entry | IMPLEMENTED | TC-361, TC-362 | Functional, Negative | High |
| FR-165 | Create or link a student manually | PARTIALLY IMPLEMENTED | TC-363, TC-364, TC-365 | Functional, Negative, Security | Critical |
| FR-166 | Enroll a rostered student with an off-system teacher | IMPLEMENTED | TC-366, TC-367, TC-368 | Data integrity, Functional, Negative | Critical |
| FR-167 | List an off-system teacher's students | IMPLEMENTED | TC-369, TC-370 | Functional, Negative | High |
| FR-168 | Manual assessments (create, list) | IMPLEMENTED | TC-371, TC-372 | Functional, Negative | High |
| FR-169 | Set assessment scores | IMPLEMENTED | TC-373, TC-374 | Boundary, Functional | High |
| FR-170 | Off-system teacher money reads (hand-off) | IMPLEMENTED | TC-375, TC-376 | Functional, Security | Critical |
| FR-171 | Settle with an off-system teacher (hand-off) | IMPLEMENTED | TC-377, TC-378, TC-379 | Data integrity, Functional, Negative | Critical |
| FR-172 | One definition of "the same child" | CONFLICTING | TC-380, TC-381 | Data integrity, Negative | Critical |

### Courses, Sessions, Enrollment & Attendance

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-173 | Public course browse by center |  | TC-382, TC-383 | Functional, Security | Medium |
| FR-174 | Role-scoped course list (logged in) |  | TC-384 | Security | Medium |
| FR-175 | Course detail with meeting-link gating |  | TC-385, TC-386 | Functional, Security | Critical |
| FR-176 | Center creates course + schedule pattern + session generation |  | TC-387, TC-388 | Functional, Negative | High |
| FR-177 | Teacher creates teacher-direct course |  | TC-389 | Functional | Medium |
| FR-178 | Delivery mode & meeting link validation |  | TC-390, TC-391 | Functional, Validation | High |
| FR-179 | Center updates course |  | TC-392, TC-393 | Functional, Negative | High |
| FR-180 | Teacher updates teacher-direct pricing/delivery |  | TC-394 | Functional | Medium |
| FR-181 | Center cancels course |  | TC-395, TC-396 | Functional, Negative | High |
| FR-182 | Center reassigns course teacher |  | TC-397 | Functional | Medium |
| FR-183 | Session generation & schedule/room conflict detection |  | TC-398, TC-399 | Boundary, Functional | High |
| FR-184 | List sessions role-scoped |  | TC-400, TC-401 | Negative, Security | Critical |
| FR-185 | Session detail role-scoped |  | TC-402, TC-403 | Security | Critical |
| FR-186 | Cancel session |  | TC-404, TC-405, TC-406 | Functional, Negative | High |
| FR-187 | Postpone session |  | TC-407, TC-408, TC-409 | Functional, Negative, Validation | High |
| FR-188 | Complete session / trigger settlement |  | TC-410, TC-411, TC-412, TC-413 | Concurrency, Functional, Negative | Critical |
| FR-189 | Settlement preview trigger |  | TC-414, TC-415 | Functional, Security | High |
| FR-190 | Read attendance register |  | TC-416, TC-417 | Functional, Security | High |
| FR-191 | Bulk mark attendance |  | TC-418, TC-419, TC-420 | Functional, Negative, Security | Critical |
| FR-192 | Attendance edit-window / lock predicate |  | TC-421, TC-422 | Boundary, Functional | Critical |
| FR-193 | Reopen attendance for settlement |  | TC-423, TC-424, TC-425 | Functional, Negative, Security | Critical |
| FR-194 | Center admin edits a single attendance record |  | TC-426, TC-427 | Functional, Security | High |
| FR-195 | Teacher attendance mode A/B |  | TC-428, TC-429 | Functional | High |
| FR-196 | Counter check-in |  | TC-430, TC-431, TC-432 | Functional, Negative | Critical |
| FR-197 | Counter student lookup with masking |  | TC-433, TC-434 | Security | Critical |
| FR-198 | Check-in session suggestions |  | TC-435, TC-436 | Boundary, Functional | High |
| FR-199 | Counter board reads (writes nothing) |  | TC-437, TC-438 | Data integrity, Functional | Critical |
| FR-200 | Door check-in |  | TC-439, TC-440 | Functional, Negative | High |
| FR-201 | Door session state |  | TC-441 | Functional | Medium |
| FR-202 | Offline attendance sync |  | TC-442, TC-443, TC-444 | Boundary, Data integrity, Functional | Critical |
| FR-203 | /me/attendance summary |  | TC-445, TC-446 | Functional, Security | High |
| FR-204 | Teacher coverage view |  | TC-447 | Functional | Medium |
| FR-205 | Student creates enrollment request |  | TC-448, TC-449 | Functional, Negative | High |
| FR-206 | Student cancels request |  | TC-450 | Functional | Medium |
| FR-207 | List requests + lazy expiry |  | TC-451 | Functional | Medium |
| FR-208 | Approve request (capacity) |  | TC-452, TC-453 | Functional, Negative | High |
| FR-209 | Decline request |  | TC-454 | Functional | Medium |
| FR-210 | Direct enroll |  | TC-455, TC-456 | Functional, Negative | High |
| FR-211 | Unenroll |  | TC-457 | Functional | Medium |
| FR-212 | List enrollments role-scoped |  | TC-458, TC-459 | Security | High |
| FR-213 | Assistant delegation & audit |  | TC-460, TC-461 | Functional, Security | Critical |
| FR-214 | Center staff sub-role scoping |  | TC-462, TC-463 | Security | Critical |
| FR-215 | Lesson time 12h display |  | TC-464 | UI | Low |

### Payments, Subscriptions, Wallets & Settlement

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-216 | Record a counter payment | IMPLEMENTED | TC-465, TC-466, TC-467, TC-468 | Authorization, Boundary, Functional, Negative | Critical |
| FR-217 | Scheduled expiry of payment intents and subscriptions | IMPLEMENTED (per-session pass expiry uses a UTC day boundary — see GAP-079) | TC-469, TC-470, TC-471 | Functional, Security | Critical |
| FR-218 | List payments (role-scoped) | IMPLEMENTED | TC-472, TC-473 | Authorization, Functional | Critical |
| FR-219 | View a single payment | IMPLEMENTED | TC-474, TC-475 | Authorization, Negative | Critical |
| FR-220 | Receipt (JSON, printable document, print page) | IMPLEMENTED | TC-476, TC-477 | Authorization, Functional | High |
| FR-221 | Arm a counter refund (phase 1) | IMPLEMENTED (counter channels only; no gateway refund — GAP-077) | TC-478, TC-479, TC-480, TC-481, TC-482, TC-483, TC-484 | Boundary, Concurrency, Functional, Negative | Critical |
| FR-222 | Confirm a refund (phase 2) | IMPLEMENTED | TC-485, TC-486, TC-487 | Functional, Negative | Critical |
| FR-223 | List unconfirmed refunds | IMPLEMENTED | TC-488, TC-489 | Authorization, Functional | Medium |
| FR-224 | Online payment availability | IMPLEMENTED (checkout itself only in mock mode — FR-228) | TC-490 | Functional | Medium |
| FR-225 | Initiate a course payment intent (student) | IMPLEMENTED (mock gateway only) | TC-491, TC-492, TC-493, TC-494 | Authorization, Boundary, Functional | Critical |
| FR-226 | Read a payment intent | IMPLEMENTED | TC-495 | Authorization | High |
| FR-227 | Mock-complete a payment intent (non-production) | IMPLEMENTED | TC-496, TC-497, TC-498 | Functional, Negative | Critical |
| FR-228 | Paymob webhook ingestion with HMAC verification | PARTIALLY IMPLEMENTED (verification and dispatch exist; live/sandbox checkout creation is NOT IMPLEMENTED) | TC-499, TC-500 | Security | Critical |
| FR-229 | Webhook event processing (capture, late capture, mismatch, reversal, idempotency) | IMPLEMENTED | TC-501, TC-502, TC-503 | Functional, Negative, Workflow | Critical |
| FR-230 | Student wallet online top-up | IMPLEMENTED (mock gateway) | TC-504, TC-505 | Boundary, Functional | Critical |
| FR-231 | Parent wallet online top-up | IMPLEMENTED (mock gateway) | TC-506, TC-507 | Authorization, Functional | Critical |
| FR-232 | Subscription checkout (student; gateway or student wallet) | IMPLEMENTED | TC-508, TC-509, TC-510, TC-511, TC-512, TC-513, TC-514 | Concurrency, Functional, Negative, Workflow | Critical |
| FR-233 | Parent pays for a child's subscription (card or parent wallet) | IMPLEMENTED | TC-515, TC-516, TC-517 | Authorization, Functional, Negative | Critical |
| FR-234 | Cancel a pending (unpaid) subscription | IMPLEMENTED | TC-518, TC-519 | Functional, Negative | High |
| FR-235 | List my subscriptions | IMPLEMENTED | TC-520 | Authorization | Medium |
| FR-236 | Walk-in subscription at the counter (one step pay + check-in) | IMPLEMENTED | TC-521, TC-522, TC-523 | Authorization, Functional | Critical |
| FR-237 | Center subscriptions list | IMPLEMENTED | TC-524 | Functional | Medium |
| FR-238 | Cash wallet top-up at the counter | IMPLEMENTED | TC-525, TC-526 | Functional, Negative | Critical |
| FR-239 | Center credit balance | IMPLEMENTED | TC-527 | Authorization | Medium |
| FR-240 | Center credit online top-up | IMPLEMENTED (mock gateway) | TC-528, TC-529 | Boundary, Functional | Critical |
| FR-241 | Center wallet and transaction history | IMPLEMENTED | TC-530, TC-531 | Authorization, Functional | High |
| FR-242 | Center payout request and list | IMPLEMENTED (approval/payment of the request is owned by "Finance & Accounting (Back-office)") | TC-532, TC-533 | Authorization, Functional | Critical |
| FR-243 | Cancel own pending payout request | IMPLEMENTED | TC-534, TC-535 | Authorization, Functional | High |
| FR-244 | Open a cash shift / read the current shift | IMPLEMENTED | TC-536, TC-537 | Functional, Negative | High |
| FR-245 | Close a cash shift with counted cash | IMPLEMENTED | TC-538, TC-539 | Functional, Negative | High |
| FR-246 | Shift list and reconciliation summary | IMPLEMENTED (date upper bound uses UTC — GAP-080) | TC-540 | Functional | Medium |
| FR-247 | Teacher revenue agreements (center ↔ teacher) | IMPLEMENTED | TC-541, TC-542 | Integration, Negative | Critical |
| FR-248 | Teacher wallet and history | IMPLEMENTED | TC-543, TC-544 | Authorization, Functional | Critical |
| FR-249 | Teacher payout request | IMPLEMENTED | TC-545 | Concurrency | High |
| FR-250 | Student wallet balance and history | IMPLEMENTED | TC-546 | Database | High |
| FR-251 | Parent wallet balance and history | IMPLEMENTED | TC-547 | Functional | Medium |
| FR-252 | Loyalty points on payment and claw-back on refund | IMPLEMENTED | TC-548 | Functional | Medium |
| FR-253 | Center expenses: list and create | IMPLEMENTED | TC-549, TC-550 | Functional, Negative | Medium |
| FR-254 | Center expenses: update and delete | IMPLEMENTED (delete is a hard delete — GAP-081; PATCH category not re-validated in service — GAP-082) | TC-551, TC-552 | Authorization, Functional | High |
| FR-255 | Receipt e-mail | IMPLEMENTED (delivery depends on mail transport — see "Platform & NFR") | TC-553 | Integration | Low |
| FR-256 | Coverage rule (what a subscription entitles) | IMPLEMENTED | TC-554 | Boundary | Critical |
| FR-257 | Public pricing page rates | IMPLEMENTED | TC-555 | Functional | Medium |
| FR-258 | One derivation of lesson price (`resolveLessonPrice`) | IMPLEMENTED | TC-556, TC-557 | Functional, Negative | Critical |
| FR-259 | Session revenue distribution (`distributeSessionRevenue`) and commission precedence | IMPLEMENTED | TC-558, TC-559 | Concurrency, Integration | Critical |
| FR-260 | Settlement preview | IMPLEMENTED | TC-560 | Functional | High |
| FR-261 | Center credit moves and funding legs (`creditMove`) | IMPLEMENTED | TC-561 | Database | Medium |
| FR-262 | Wallet conditional decrement (H2) | IMPLEMENTED | TC-562 | Concurrency | Critical |
| FR-263 | Refund credits the payer | IMPLEMENTED | TC-563 | Functional | Critical |

### Teacher Portal, Assistants, Collaboration & Academic Content

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-264 | Create assistant account | IMPLEMENTED | TC-564, TC-565, TC-566 | Functional, Negative | Critical |
| FR-265 | List my assistants | IMPLEMENTED | TC-567 | Functional | Medium |
| FR-266 | Issue or resend assistant invite | IMPLEMENTED | TC-568, TC-569 | Functional, Negative | High |
| FR-267 | Revoke an assistant | IMPLEMENTED | TC-570, TC-571 | Functional, Security | Critical |
| FR-268 | Assistant acts on behalf of the employing teacher | IMPLEMENTED | TC-572, TC-573 | Functional, Security | Critical |
| FR-269 | Audit trail for delegated actions | PARTIALLY IMPLEMENTED | TC-574, TC-575 | Exploratory, Functional | Critical |
| FR-270 | Assistant exclusions (team management is teacher-only) | IMPLEMENTED | TC-576, TC-577 | Security | Critical |
| FR-271 | Teacher blacklists a student | IMPLEMENTED | TC-578, TC-579 | Functional, Negative | High |
| FR-272 | List my blacklist | IMPLEMENTED | TC-580 | Functional | Medium |
| FR-273 | Lift a teacher blacklist entry | IMPLEMENTED | TC-581, TC-582 | Functional, Security | High |
| FR-274 | Create a temporary student | IMPLEMENTED | TC-583, TC-584 | Functional, Negative | Medium |
| FR-275 | Public teacher profile | IMPLEMENTED | TC-585 | Functional | Medium |
| FR-276 | Upload or replace teacher photo | IMPLEMENTED | TC-586, TC-587 | Functional, Negative | Medium |
| FR-277 | Read or remove teacher photo | IMPLEMENTED | TC-588 | Functional | Low |
| FR-278 | Create collaboration request | IMPLEMENTED | TC-589, TC-590, TC-591 | Functional, Negative | Critical |
| FR-279 | List collaboration requests | IMPLEMENTED | TC-592, TC-593 | Boundary, Security | High |
| FR-280 | Accept collaboration request | IMPLEMENTED | TC-594, TC-595 | Functional, Negative | Critical |
| FR-281 | Reject collaboration request | IMPLEMENTED | TC-596, TC-597 | Functional, Negative | High |
| FR-282 | Cancel collaboration request | IMPLEMENTED | TC-598, TC-599 | Functional, Negative | High |
| FR-283 | Auto-expire stale requests | IMPLEMENTED | TC-600 | Functional | Medium |
| FR-284 | Pricing-method rules for halls | IMPLEMENTED | TC-601, TC-602 | Functional, Negative | High |
| FR-285 | List my center affiliations | IMPLEMENTED | TC-603 | Functional | Medium |
| FR-286 | Accept centre invitation (affiliation) | IMPLEMENTED | TC-604, TC-605 | Functional, Negative | High |
| FR-287 | Decline centre invitation | IMPLEMENTED | TC-606 | Functional | Medium |
| FR-288 | Leave a centre | IMPLEMENTED | TC-607, TC-608 | Functional, Negative | High |
| FR-289 | Create grade assessment | IMPLEMENTED | TC-609, TC-610 | Boundary, Functional | High |
| FR-290 | List grades (role scoped) | PARTIALLY IMPLEMENTED | TC-611, TC-612 | Security | Critical |
| FR-291 | Get grade detail | IMPLEMENTED | TC-613, TC-614 | Functional, Security | High |
| FR-292 | Update grade | IMPLEMENTED | TC-615, TC-616 | Boundary, Functional | High |
| FR-293 | Delete grade | IMPLEMENTED | TC-617, TC-618 | Functional, Security | High |
| FR-294 | Bulk save scores | IMPLEMENTED | TC-619, TC-620 | Boundary, Negative | Critical |
| FR-295 | Grade-entered notification | IMPLEMENTED | TC-621 | Functional | Medium |
| FR-296 | Grade bands and pass mark | IMPLEMENTED | TC-622 | Boundary | Medium |
| FR-297 | Upload material | IMPLEMENTED | TC-623, TC-624, TC-625 | Functional, Negative | High |
| FR-298 | List materials | IMPLEMENTED | TC-626, TC-627 | Functional, Security | High |
| FR-299 | Download material | IMPLEMENTED | TC-628, TC-629 | Functional, Security | Critical |
| FR-300 | Update material | IMPLEMENTED | TC-630, TC-631 | Functional | Medium |
| FR-301 | Delete material | IMPLEMENTED | TC-632, TC-633 | Functional, Security | High |
| FR-302 | Material-uploaded notification | IMPLEMENTED | TC-634 | Functional | Medium |
| FR-303 | Create review | IMPLEMENTED | TC-635, TC-636 | Functional, Negative | High |
| FR-304 | List reviews | PARTIALLY IMPLEMENTED | TC-637, TC-638 | Functional, Security | Critical |
| FR-305 | Edit own review within 24 h | IMPLEMENTED | TC-639, TC-640 | Boundary, Functional | High |
| FR-306 | Teachers a student can still review | IMPLEMENTED | TC-641 | Functional | Medium |
| FR-307 | Teacher rating aggregate | IMPLEMENTED | TC-642, TC-643 | Boundary, Functional | High |
| FR-308 | Team notes board | UNCLEAR | TC-644 | Functional | Medium |
| FR-309 | Teacher and assistant portal shell | PARTIALLY IMPLEMENTED | TC-645 | Functional | Medium |
| FR-310 | Student teacher discovery and practice pages | UNCLEAR | TC-646 | Exploratory | Low |

### Student & Parent Portals

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-311 | Student views own family code | IMPLEMENTED | TC-647, TC-648 | Functional, Negative, Security | High |
| FR-312 | Student rotates family code | IMPLEMENTED | TC-649, TC-650, TC-651 | Functional, Negative, Regression, Security | High |
| FR-313 | Parent links to a child with a family code (instant approval) | IMPLEMENTED | TC-652, TC-653, TC-654, TC-655 | Boundary, Functional, Negative | Critical |
| FR-314 | Parent requests a link by student email or phone | PARTIALLY IMPLEMENTED | TC-656, TC-657, TC-658, TC-659 | Functional, Negative, Security, UI | High |
| FR-315 | Student requests a link to a parent | IMPLEMENTED | TC-660, TC-661, TC-662 | Boundary, Functional, Negative | High |
| FR-316 | Students cannot use a family code to link | IMPLEMENTED | TC-663, TC-664 | Negative, Regression, Security | High |
| FR-317 | Counterparty approves a pending link | IMPLEMENTED | TC-665, TC-666, TC-667, TC-668 | Functional, Negative, Security | Critical |
| FR-318 | Counterparty rejects a pending link | IMPLEMENTED | TC-669, TC-670 | Functional, Negative, Security | High |
| FR-319 | Either party revokes a link | PARTIALLY IMPLEMENTED | TC-671, TC-672, TC-673, TC-674 | Functional, Negative, Security, UI | Critical |
| FR-320 | List my link requests | IMPLEMENTED | TC-675 | Functional, Security | Medium |
| FR-321 | Parent lists approved children | IMPLEMENTED | TC-676, TC-677 | Functional, Negative, Security | High |
| FR-322 | One approved parent per student; no duplicate pending | PARTIALLY IMPLEMENTED | TC-678, TC-679, TC-680, TC-681 | Concurrency, Functional, Integration, Negative | Critical |
| FR-323 | Notification on a link request | PARTIALLY IMPLEMENTED | TC-682 | Functional | Medium |
| FR-324 | Student views own ID card | IMPLEMENTED | TC-683, TC-684 | Functional, Negative | High |
| FR-325 | Parent views an approved child's ID card | IMPLEMENTED | TC-685, TC-686, TC-687 | Functional, Negative, Security | Critical |
| FR-326 | Profile completeness gate and checklist | CONFLICTING | TC-688, TC-689, TC-690 | Boundary, Functional, Negative, Security | High |
| FR-327 | Student code format, check character and normalisation | IMPLEMENTED | TC-691, TC-692, TC-693 | Boundary, Functional, Negative | Critical |
| FR-328 | Student code issuance (once only) | IMPLEMENTED | TC-694, TC-695 | Integration, Security | High |
| FR-329 | Signed card QR payload | IMPLEMENTED | TC-696, TC-697, TC-698 | Configuration, Functional, Negative, Security | Critical |
| FR-330 | Scan a card QR and resolve disclosure tier | IMPLEMENTED | TC-699, TC-700, TC-701, TC-702, TC-703 | Functional, Negative, Performance, Security | Critical |
| FR-331 | Card reissue and revoke effect on scans | IMPLEMENTED | TC-704, TC-705 | Integration, Negative, Security | High |
| FR-332 | Printable ID sheet | UNCLEAR | TC-706 | Functional, UI | Medium |
| FR-333 | Course search scoped to the student's year and track | IMPLEMENTED | TC-707, TC-708, TC-709, TC-710 | Boundary, Functional, Negative, Security | Critical |
| FR-334 | Parent child-scoped catalog (`studentId`) | IMPLEMENTED | TC-711, TC-712 | Functional, Negative, Security | Critical |
| FR-335 | "My subjects" for a student (`mine=1`) | IMPLEMENTED | TC-713, TC-714 | Boundary, Functional, Negative | High |
| FR-336 | Student subjects page (My / All) | IMPLEMENTED | TC-715, TC-716 | Functional, Negative, UI | High |
| FR-337 | Student "Find a teacher" | UNCLEAR | TC-717 | Functional, UI | Medium |
| FR-338 | Keep one center roster (roster choice) | PARTIALLY IMPLEMENTED | TC-718, TC-719 | Functional, Negative | Medium |
| FR-339 | List children eligible for oversight | IMPLEMENTED | TC-720, TC-721 | Functional, Negative, Security | High |
| FR-340 | List a child's conversations with adult partners | IMPLEMENTED | TC-722, TC-723, TC-724 | Boundary, Functional, Negative, Security | Critical |
| FR-341 | Read a child's conversation thread (read-only) | IMPLEMENTED | TC-725, TC-726, TC-727 | Functional, Integration, Negative, Security | Critical |
| FR-342 | Subject request (teacher-side endpoint in this scope) | PARTIALLY IMPLEMENTED | TC-728 | Functional, Negative | Low |
| FR-343 | Student dashboard shell | IMPLEMENTED | TC-729 | Functional, UI | Medium |
| FR-344 | Parent dashboard with child selector | IMPLEMENTED | TC-730, TC-731 | Functional, Negative, UI | High |
| FR-345 | Parent progress page | IMPLEMENTED | TC-732 | Functional | Medium |
| FR-346 | Parent children page (linking UI) | PARTIALLY IMPLEMENTED | TC-733, TC-734, TC-735 | Functional, Negative, UI | High |
| FR-347 | Portal gate (student and parent) | IMPLEMENTED | TC-736, TC-737 | Functional, Negative, Security | High |
| FR-348 | Portal settings pages | UNCLEAR | TC-738 | Functional, UI | Low |

### Messaging, Notifications & Communication Integrations

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-349 | Contact directory | IMPLEMENTED | TC-739, TC-740, TC-741, TC-742 | Boundary, Functional, Security | Critical |
| FR-350 | Start or get a direct conversation | IMPLEMENTED | TC-743, TC-744, TC-745, TC-746, TC-747 | Authorization, Boundary, Functional, Security | Critical |
| FR-351 | List conversations | IMPLEMENTED | TC-748, TC-749, TC-750 | Boundary, Functional, Negative | High |
| FR-352 | Open conversation thread | IMPLEMENTED | TC-751, TC-752, TC-753 | Authorization, Functional, Negative | Critical |
| FR-353 | Send message (REST) | IMPLEMENTED | TC-754, TC-755, TC-756, TC-757, TC-758, TC-759 | Authorization, Boundary, Concurrency, Functional, Negative | Critical |
| FR-354 | Send message (websocket) | IMPLEMENTED | TC-760, TC-761, TC-762, TC-763 | Integration, Negative, Security | Critical |
| FR-355 | Mark conversation read | IMPLEMENTED | TC-764, TC-765 | Authorization, Functional | High |
| FR-356 | Typing indicator | IMPLEMENTED | TC-766 | Functional | Low |
| FR-357 | Presence | IMPLEMENTED | TC-767 | Functional | Medium |
| FR-358 | Role initiation matrix | IMPLEMENTED | TC-768, TC-769 | Authorization | Critical |
| FR-359 | Relationship scope | IMPLEMENTED | TC-770, TC-771, TC-772 | Authorization | Critical |
| FR-360 | Child-safety guardian lock | IMPLEMENTED | TC-773, TC-774, TC-775, TC-776, TC-777, TC-778 | Functional, Security, Workflow | Critical |
| FR-361 | Default-minor determination | IMPLEMENTED | TC-779, TC-780 | Boundary, Security | Critical |
| FR-362 | Message rate limits | IMPLEMENTED | TC-781, TC-782 | Boundary | High |
| FR-363 | Message body validation and idempotency | IMPLEMENTED | TC-783, TC-784 | Boundary, Concurrency | High |
| FR-364 | Block user | IMPLEMENTED | TC-785, TC-786, TC-787, TC-788 | Functional, Negative, UI | High |
| FR-365 | Unblock user | IMPLEMENTED | TC-789, TC-790 | Functional | Medium |
| FR-366 | List my blocks | IMPLEMENTED | TC-791 | Authorization | Low |
| FR-367 | Block enforcement in conversations | IMPLEMENTED | TC-792, TC-793 | Authorization, Functional | Critical |
| FR-368 | File report | IMPLEMENTED | TC-794, TC-795, TC-796, TC-797 | Authorization, Boundary, Functional, Security | High |
| FR-369 | Auto-flag adult blocking a minor | IMPLEMENTED | TC-798, TC-799, TC-800 | Functional | High |
| FR-370 | Super-admin notification on report | IMPLEMENTED | TC-801 | Integration | Medium |
| FR-371 | Create group channel | IMPLEMENTED | TC-802, TC-803, TC-804, TC-805 | Authorization, Boundary, Functional | Critical |
| FR-372 | List groups | IMPLEMENTED | TC-806 | Authorization | Medium |
| FR-373 | Open group thread | IMPLEMENTED | TC-807 | Authorization | Critical |
| FR-374 | Post to group | IMPLEMENTED | TC-808, TC-809, TC-810, TC-811 | Authorization, Functional, Security | Critical |
| FR-375 | Group membership derivation and sync | IMPLEMENTED | TC-812, TC-813 | Integration | High |
| FR-376 | Mute group | IMPLEMENTED | TC-814 | Functional | Low |
| FR-377 | Mark group read | IMPLEMENTED | TC-815 | Functional | Medium |
| FR-378 | Oversight: children list | IMPLEMENTED | TC-816, TC-817 | Authorization | High |
| FR-379 | Oversight: conversation list | IMPLEMENTED | TC-818, TC-819 | Authorization, Security | Critical |
| FR-380 | Oversight: thread read | IMPLEMENTED | TC-820, TC-821 | Authorization, Functional | Critical |
| FR-381 | Oversight notice banner | IMPLEMENTED | TC-822, TC-823 | UI | High |
| FR-382 | Realtime token | IMPLEMENTED | TC-824, TC-825 | API, Security | Critical |
| FR-383 | Socket handshake auth | IMPLEMENTED | TC-826, TC-827 | Security | Critical |
| FR-384 | Realtime internal bridge | IMPLEMENTED | TC-828, TC-829, TC-830 | API, Integration, Security | Critical |
| FR-385 | Delivery status and delivered-on-connect | IMPLEMENTED | TC-831 | Integration | Medium |
| FR-386 | Offline new-message notification | IMPLEMENTED | TC-832, TC-833 | Boundary, Security | Critical |
| FR-387 | Unread counters | PARTIALLY IMPLEMENTED | TC-834 | Functional | Medium |
| FR-388 | notify() fan-out and channel matrix | IMPLEMENTED | TC-835, TC-836 | Integration | High |
| FR-389 | List notifications | IMPLEMENTED | TC-837, TC-838 | Authorization, Functional | High |
| FR-390 | Mark one notification read | IMPLEMENTED | TC-839, TC-840 | Authorization, Functional | Critical |
| FR-391 | Mark all notifications read | IMPLEMENTED | TC-841 | Authorization | Medium |
| FR-392 | Center broadcast | PARTIALLY IMPLEMENTED | TC-842, TC-843, TC-844, TC-845 | Authorization, Functional, Negative | Critical |
| FR-393 | Notification deep links | IMPLEMENTED | TC-846 | UI | Medium |
| FR-394 | Register web push subscription | IMPLEMENTED | TC-847, TC-848, TC-849 | Functional, Security | High |
| FR-395 | Unregister web push subscription | IMPLEMENTED | TC-850, TC-851 | Authorization, Functional | High |
| FR-396 | Register device token (FCM) | IMPLEMENTED | TC-852, TC-853 | Functional, Security | Medium |
| FR-397 | Unregister device token | IMPLEMENTED | TC-854 | Authorization | Medium |
| FR-398 | Push delivery and stale cleanup | IMPLEMENTED | TC-855, TC-856 | Functional, Integration | Medium |
| FR-399 | SMS channel | PARTIALLY IMPLEMENTED | TC-857 | Integration | Medium |
| FR-400 | WhatsApp send and log | IMPLEMENTED | TC-858, TC-859 | Integration | High |
| FR-401 | Egypt phone normalization | IMPLEMENTED | TC-860 | Boundary | Medium |
| FR-402 | Invite delivery channel and recipient resolution | IMPLEMENTED | TC-861, TC-862 | Functional, Negative | High |
| FR-403 | Email transport | CONFLICTING | TC-863, TC-864 | Functional, Integration | High |
| FR-404 | Notification package (templates) | IMPLEMENTED | TC-865, TC-866 | Functional, Negative | Medium |
| FR-405 | Legacy invite email templates | IMPLEMENTED | TC-867 | Security | Medium |
| FR-406 | Guardian contact status and set | IMPLEMENTED | TC-868, TC-869, TC-870, TC-871, TC-872 | Authorization, Boundary, Functional, Negative, Security | Critical |
| FR-407 | Guardian contact reminder cron | IMPLEMENTED | TC-873, TC-874, TC-875 | Functional, Security | Critical |
| FR-408 | Guardian verification request | IMPLEMENTED | TC-876, TC-877, TC-878 | Authorization, Boundary, Functional | High |
| FR-409 | Guardian verification confirm (public) | IMPLEMENTED | TC-879, TC-880, TC-881 | Functional, Security | High |
| FR-410 | Weekly center digest | IMPLEMENTED | TC-882, TC-883 | Functional, Negative | Medium |
| FR-411 | UI chat screen | IMPLEMENTED | TC-884, TC-885, TC-886 | Boundary, Security, UI | Critical |
| FR-412 | UI new conversation dialog | IMPLEMENTED | TC-887 | UI | Medium |
| FR-413 | UI block and report dialogs | IMPLEMENTED | TC-888, TC-889 | UI | High |
| FR-414 | UI channels panel | IMPLEMENTED | TC-890 | UI | Medium |
| FR-415 | UI notifications screen | PARTIALLY IMPLEMENTED | TC-891, TC-892 | UI | High |
| FR-416 | Assistant messages page redirect | PARTIALLY IMPLEMENTED | TC-893 | UI | Medium |
| FR-417 | Message attachments | NOT IMPLEMENTED | TC-894 | Negative | Low |
| FR-418 | Removed-message display (soft delete) | PARTIALLY IMPLEMENTED | TC-895 | Database | Medium |

### Reports, Dashboards & Exports

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-419 | Revenue report | IMPLEMENTED | TC-896, TC-897, TC-898, TC-899 | Authorization, Functional, Negative, Security | Critical |
| FR-420 | Expenses report | IMPLEMENTED | TC-900, TC-901 | Boundary, Functional | High |
| FR-421 | Net profit report | PARTIALLY IMPLEMENTED | TC-902, TC-903, TC-904 | Authorization, Functional | Critical |
| FR-422 | Revenue time series | IMPLEMENTED | TC-905, TC-906 | Boundary, Functional | High |
| FR-423 | Expenses time series | IMPLEMENTED | TC-907, TC-958 | Integration, Negative | High |
| FR-424 | Enrollment funnel | PARTIALLY IMPLEMENTED | TC-908, TC-909 | Authorization, Functional | High |
| FR-425 | Attendance by course | PARTIALLY IMPLEMENTED | TC-910, TC-911 | Boundary, Functional | High |
| FR-426 | Course fill rates | PARTIALLY IMPLEMENTED | TC-912, TC-913 | Functional | High |
| FR-427 | Report CSV export | PARTIALLY IMPLEMENTED | TC-914, TC-915, TC-916, TC-917, TC-918 | Authorization, Boundary, Functional, Integration, Security | Critical |
| FR-428 | Report print view | PARTIALLY IMPLEMENTED | TC-919, TC-920, TC-921 | Integration, Negative | High |
| FR-429 | Admin reports screen | PARTIALLY IMPLEMENTED | TC-922, TC-923 | UI | High |
| FR-430 | Report export menu | PARTIALLY IMPLEMENTED | TC-924, TC-959 | Negative, UI | High |
| FR-431 | Center staff reports screen (manager) | PARTIALLY IMPLEMENTED | TC-925, TC-926 | Authorization, Functional | High |
| FR-432 | Admin dashboard data | PARTIALLY IMPLEMENTED | TC-927, TC-928, TC-929 | Authorization, Boundary, Functional | Critical |
| FR-433 | Setup checklist | IMPLEMENTED | TC-930, TC-931 | Authorization, Functional | Medium |
| FR-434 | Admin home screen | PARTIALLY IMPLEMENTED | TC-932, TC-933 | Functional, UI | High |
| FR-435 | Today's takings card | CONFLICTING | TC-934, TC-935 | Boundary, Functional | High |
| FR-436 | Teacher dashboard data | IMPLEMENTED | TC-936, TC-937, TC-938 | Authorization, Functional, Security | Critical |
| FR-437 | Teacher home screen | IMPLEMENTED | TC-939 | UI | Medium |
| FR-438 | Student dashboard data | CONFLICTING | TC-940, TC-941 | Boundary, Security | Critical |
| FR-439 | Student home screen | IMPLEMENTED | TC-942 | UI | Medium |
| FR-440 | Parent home screen | PARTIALLY IMPLEMENTED | TC-943, TC-944, TC-945 | Functional, Negative, Security | Critical |
| FR-441 | Center staff portal home | IMPLEMENTED | TC-946 | Functional | Medium |
| FR-442 | Assistant home | IMPLEMENTED | TC-947 | Functional | Low |
| FR-443 | Role navigation (sidebar and bottom bar) | CONFLICTING | TC-948, TC-949 | Authorization, UI | High |
| FR-444 | Weekly center digest | PARTIALLY IMPLEMENTED | TC-950, TC-951, TC-952 | Integration, Negative, Security | Critical |
| FR-445 | Cairo date-range handling | PARTIALLY IMPLEMENTED | TC-953, TC-954 | Boundary | Critical |
| FR-446 | Provenance filter | PARTIALLY IMPLEMENTED | TC-955, TC-960 | Functional, Negative | Medium |
| FR-447 | Report tier enforcement | PARTIALLY IMPLEMENTED | TC-956, TC-957 | Authorization, Security | Critical |

### Super Admin Platform Operations

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-448 | Back-office access guard (role, session, 2FA) |  | TC-961, TC-962, TC-963, TC-964 | Functional, Negative, Security | Critical |
| FR-449 | Platform dashboard (KPIs, decision queue, charts) |  | TC-965, TC-966 | Functional, Negative, UI | High |
| FR-450 | Registrations queue (centres and teachers) |  | TC-967, TC-968 | Functional, Negative | High |
| FR-451 | Approve a centre registration |  | TC-969, TC-970 | Functional, Negative | Critical |
| FR-452 | Reject a centre registration |  | TC-971, TC-972 | Functional, Negative | Critical |
| FR-453 | Centre directory and centre detail |  | TC-973, TC-974 | Functional, Negative | High |
| FR-454 | Activate / deactivate a centre |  | TC-975, TC-976, TC-977 | Functional, Integrity, Negative | Critical |
| FR-455 | Edit centre profile |  | TC-978, TC-979 | Functional, Negative | High |
| FR-456 | Centre admins (list, invite, remove) |  | TC-980, TC-981 | Functional, Negative | High |
| FR-457 | Centre staff (list, create, edit, remove, resend invite) |  | TC-982, TC-983 | Functional, Negative, Security | High |
| FR-458 | Centre rooms (non-money fields) |  | TC-984 | Functional | Medium |
| FR-459 | Centre student roster |  | TC-985, TC-986 | Functional, Security | High |
| FR-460 | Centre teacher roster and affiliations |  | TC-987, TC-988 | Functional | High |
| FR-461 | Activate / deactivate a centre member account |  | TC-989, TC-990, TC-991 | Functional, Integrity, Negative | Critical |
| FR-462 | Remove / restore a student's centre membership |  | TC-992, TC-993 | Functional, Negative | Critical |
| FR-463 | Centre blacklist (list, add, lift) |  | TC-994, TC-995 | Functional, Negative | Critical |
| FR-464 | Centre courses (create, view, edit, cancel, reassign teacher) |  | TC-996, TC-997 | Functional, Negative | High |
| FR-465 | Centre enrolments and enrolment requests |  | TC-998, TC-999 | Functional, Negative | High |
| FR-466 | Centre session operations and attendance edits |  | TC-1000, TC-1001 | Functional, Negative | High |
| FR-467 | Centre broadcast |  | TC-1002 | Functional | Medium |
| FR-468 | Create a collaboration request on behalf of a centre |  | TC-1003, TC-1004 | Functional, Negative | High |
| FR-469 | Centre oversight (non-money tabs), centre dashboard, reports |  | TC-1005, TC-1006 | Functional, Negative | Medium |
| FR-470 | Centre-scoped deletion requests (on behalf of a centre) |  | TC-1007, TC-1008 | Functional, Integrity | Critical |
| FR-471 | Teacher directory and create teacher |  | TC-1009, TC-1010 | Functional, Negative | High |
| FR-472 | Teacher detail and profile edit |  | TC-1011, TC-1012 | Functional, Negative | High |
| FR-473 | Approve / reject a teacher registration |  | TC-1013, TC-1014 | Functional, Negative | Critical |
| FR-474 | Teacher account status (suspend / reinstate) |  | TC-1015, TC-1016 | Functional, Negative | Critical |
| FR-475 | Teacher attendance mode |  | TC-1017, TC-1018 | API, Functional, Negative | High |
| FR-476 | Link / unlink a teacher to a centre |  | TC-1019, TC-1020 | Functional, Negative | High |
| FR-477 | Teacher oversight (read-only) |  | TC-1021 | Functional | Medium |
| FR-478 | Student directory and student detail |  | TC-1022, TC-1023 | Functional, Integrity, Negative | High |
| FR-479 | Link / unlink a parent to a student |  | TC-1024, TC-1025 | Child safety, Functional, Negative, UI | Critical |
| FR-480 | Platform blacklist (users / students / teachers doors) |  | TC-1026, TC-1027, TC-1028 | Audit, Database, Functional, Negative, Security | Critical |
| FR-481 | Blacklist ledger and lift |  | TC-1029, TC-1030 | Functional, Integrity, Negative | Critical |
| FR-482 | Move a student between centres |  | TC-1031, TC-1032 | Functional, Negative | Critical |
| FR-483 | Verify a student's date of birth |  | TC-1033, TC-1034 | Child safety, Functional, Negative | Critical |
| FR-484 | Force logout a user |  | TC-1035, TC-1036 | Functional, Negative, Security | Critical |
| FR-485 | User directory and user detail |  | TC-1037, TC-1038 | Functional, Negative | High |
| FR-486 | Suspend / reinstate an account |  | TC-1039, TC-1040 | Functional, Negative, Security | Critical |
| FR-487 | Revoke sessions (all, or one) |  | TC-1041, TC-1042 | Functional, Negative, Security | Critical |
| FR-488 | Reset a user's 2FA |  | TC-1043, TC-1044 | Functional, Negative, Security | Critical |
| FR-489 | Send a password reset link |  | TC-1045, TC-1046 | Functional, Negative | Critical |
| FR-490 | Student card (view, reissue) |  | TC-1047, TC-1048 | Child safety, Functional, Security | Critical |
| FR-491 | Impersonate a back-office account (start / stop) |  | TC-1049, TC-1050, TC-1051 | Functional, Negative, Security | Critical |
| FR-492 | "View as" an ERP user |  | TC-1052, TC-1053, TC-1054 | Functional, Negative, Security | Critical |
| FR-493 | Create an accountant account |  | TC-1055, TC-1056 | Functional, Negative, Security | Critical |
| FR-494 | Catalog hierarchy (systems, stages, grade levels, tracks) |  | TC-1057, TC-1058 | Functional, Integrity, Negative | Critical |
| FR-495 | Grade level ↔ track links |  | TC-1059, TC-1060, TC-1061 | Functional, Integrity, Negative | Critical |
| FR-496 | Subjects |  | TC-1062, TC-1063 | Functional, Negative | High |
| FR-497 | Subject offerings (track → subject mapping) |  | TC-1064, TC-1065 | Functional, Integrity, Negative | Critical |
| FR-498 | Subject requests (approve / reject) |  | TC-1066, TC-1067 | Functional, Negative | High |
| FR-499 | Platform account-deletion queue |  | TC-1068, TC-1069, TC-1070 | Functional, Integrity, Negative, UI | Critical |
| FR-500 | Feature flags |  | TC-1071, TC-1072 | Functional, Negative | High |
| FR-501 | Audit log viewer |  | TC-1073, TC-1074, TC-1075 | Audit, Functional, Negative | Critical |
| FR-502 | Collaboration requests oversight and decision |  | TC-1076, TC-1077 | Functional, Negative | High |
| FR-503 | Messaging moderation |  | TC-1078, TC-1079 | Functional, Negative | High |
| FR-504 | WhatsApp message log |  | TC-1080 | Functional | Medium |
| FR-505 | Notification history |  | TC-1081 | Functional | Medium |
| FR-506 | Contact form submissions |  | TC-1082 | Functional | Medium |
| FR-507 | Global search (back-office) |  | TC-1083, TC-1084 | Functional, Negative, Security | High |
| FR-508 | Own notifications inbox |  | TC-1085 | Functional | Medium |
| FR-509 | Own profile, preferences, SSR session |  | TC-1086 | Functional | Medium |
| FR-510 | CSP violation report sink |  | TC-1087 | Security | Low |
| FR-511 | Audit-write invariant and ERP revalidation |  | TC-1088, TC-1089 | Audit, Integration, Integrity | Critical |
| FR-512 | Own security page (sessions, 2FA enrolment) |  | TC-1090, TC-1091 | Functional, Negative, Security | High |

### Finance & Accounting (Back-office)

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-513 | Finance dashboard summary | IMPLEMENTED | TC-1092, TC-1093, TC-1173 | API, Functional, Security, UI | High |
| FR-514 | Finance alerts | IMPLEMENTED | TC-1094 | API, Functional | Medium |
| FR-515 | Ledger transactions listing | IMPLEMENTED | TC-1095, TC-1096, TC-1175 | API, Data integrity (DB, Functional, Negative, read-only verification + a rolled-back attempt by a DBA) | High |
| FR-516 | Platform subscriptions listing | IMPLEMENTED | TC-1097, TC-1098 | API, Functional, Negative, Security | High |
| FR-517 | Online payment intents listing | PARTIALLY IMPLEMENTED | TC-1099, TC-1100 | Functional, Negative, UI | Medium |
| FR-518 | Revenue report | IMPLEMENTED | TC-1101 | API, Functional | Medium |
| FR-519 | Trial balance | IMPLEMENTED | TC-1102 | Functional, Reconciliation | Medium |
| FR-520 | Refunds report | IMPLEMENTED | TC-1103 | API, Functional | Medium |
| FR-521 | Teacher and centre statements | IMPLEMENTED | TC-1104, TC-1105 | API, Functional, Negative, Reconciliation | High |
| FR-522 | Invoice listing and detail | IMPLEMENTED | TC-1106, TC-1107 | API, Functional, Negative | Medium |
| FR-523 | Generate an invoice | PARTIALLY IMPLEMENTED | TC-1108, TC-1109, TC-1110 | API, Functional, Negative | High |
| FR-524 | Invoice PDF | IMPLEMENTED | TC-1111 | API, Functional | Medium |
| FR-525 | Send invoice by email | IMPLEMENTED | TC-1112, TC-1113 | API, Functional, Negative, UI | Medium |
| FR-526 | Payout listing and status counts | PARTIALLY IMPLEMENTED | TC-1114, TC-1115 | Functional, Integration, Negative, UI | High |
| FR-527 | Generate month-end payouts | IMPLEMENTED | TC-1116, TC-1117, TC-1118 | API, Audit, Functional, Idempotency | Critical |
| FR-528 | Approve a payout (checker step 1) | IMPLEMENTED | TC-1119, TC-1120, TC-1121 | API, Concurrency, Functional, Negative, Security, UI | Critical |
| FR-529 | Mark a payout paid (checker step 2, money moves) | IMPLEMENTED | TC-1122, TC-1123, TC-1124, TC-1125, TC-1126, TC-1174 | Data integrity, Exploratory, Functional, Money, Negative, Security, Validation | Critical |
| FR-530 | Reject a payout | IMPLEMENTED | TC-1127, TC-1128, TC-1129 | Audit, Functional, Negative, UI | High |
| FR-531 | Payout receipt | IMPLEMENTED | TC-1130, TC-1131 | API, Functional, Negative | High |
| FR-532 | Refund a lesson to a student (super_admin only) | IMPLEMENTED | TC-1132, TC-1133, TC-1134, TC-1135, TC-1136, TC-1137 | Concurrency, Functional, Money, Negative, Security | Critical |
| FR-533 | Global commission settings | IMPLEMENTED | TC-1138, TC-1139, TC-1140 | Functional, Security, UI, Validation | Critical |
| FR-534 | Student wallet top-up policy | IMPLEMENTED | TC-1141, TC-1142 | Functional, UI, Validation | High |
| FR-535 | Revenue split (global / centre / room) | IMPLEMENTED | TC-1143, TC-1144, TC-1145 | API, Functional, Integration, Money, Validation | Critical |
| FR-536 | Per-attending-student (M2) rate | IMPLEMENTED | TC-1146, TC-1147 | Functional, Money, Validation | Critical |
| FR-537 | Session settlements listing | IMPLEMENTED | TC-1148, TC-1149 | Functional, Negative, Reconciliation | High |
| FR-538 | Session settlements Excel export | IMPLEMENTED | TC-1150, TC-1151, TC-1152 | Boundary, Functional, Reconciliation, Security | High |
| FR-539 | Teacher–centre agreement approval | IMPLEMENTED | TC-1153, TC-1154, TC-1155 | API, Functional, Negative | High |
| FR-540 | Points rules CRUD | PARTIALLY IMPLEMENTED | TC-1156, TC-1157 | Functional, UI, Validation | Medium |
| FR-541 | Manual student points adjustment and ledger | PARTIALLY IMPLEMENTED | TC-1158 | API, Functional | Medium |
| FR-542 | Record a cash payment on behalf of a centre | IMPLEMENTED | TC-1159, TC-1160, TC-1161 | Functional, Money, Security, Validation | Critical |
| FR-543 | Top up a student wallet on behalf of a centre | IMPLEMENTED | TC-1162, TC-1163 | Exploratory, Functional, Money, Negative | Critical |
| FR-544 | Walk-in subscription on behalf of a centre | IMPLEMENTED | TC-1164, TC-1165 | Functional, Money, Negative | Critical |
| FR-545 | Request a payout for a centre | IMPLEMENTED | TC-1166, TC-1167, TC-1168 | Functional, Idempotency, Money, Negative | Critical |
| FR-546 | Centre expenses on behalf of a centre | PARTIALLY IMPLEMENTED | TC-1169, TC-1170 | Functional, Negative, UI | Medium |
| FR-547 | Centre and teacher money oversight (read-only) | IMPLEMENTED | TC-1171, TC-1172 | API, Functional, Negative, Reconciliation | High |

### Platform, Infrastructure & Non-Functional

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-548 | Health endpoint (ERP service) GET/HEAD | IMPLEMENTED | TC-1176, TC-1177, TC-1178, TC-1179, TC-1262 | API, Boundary, Functional, Integration, Negative, Resilience, Security | High |
| FR-549 | Deep mail health probe | IMPLEMENTED | TC-1180 | API, Security | Medium |
| FR-550 | Back-office health (admin-api) | IMPLEMENTED | TC-1181, TC-1182 | API, Functional, Negative, Security | High |
| FR-551 | Diagnostic ping | IMPLEMENTED | TC-1183 | Functional, Resilience | Low |
| FR-552 | Cron endpoint authentication and dispatch | IMPLEMENTED | TC-1184, TC-1185, TC-1186, TC-1187, TC-1188, TC-1263 | API, Functional, Negative, Performance, Security | Critical |
| FR-553 | Cron: expire payment intents | IMPLEMENTED | TC-1189, TC-1190 | Concurrency, Functional, Workflow | High |
| FR-554 | Cron: data exports | IMPLEMENTED | TC-1191, TC-1192 | Functional, Negative, Resilience, Workflow | High |
| FR-555 | Cron: lesson reminders | IMPLEMENTED | TC-1193 | Functional | Medium |
| FR-556 | Cron: expire subscriptions | IMPLEMENTED | TC-1194, TC-1195, TC-1196 | Boundary, Concurrency, Functional, Workflow | Critical |
| FR-557 | Cron: subscription renewal reminders | IMPLEMENTED | TC-1197 | Boundary | Medium |
| FR-558 | Cron: expire collaboration requests | IMPLEMENTED | TC-1198 | Functional | Medium |
| FR-559 | Cron: guardian contact reminders | IMPLEMENTED | TC-1199, TC-1200 | Boundary, Functional | High |
| FR-560 | Cron: weekly center digest | IMPLEMENTED | TC-1201 | Functional, Idempotency | Medium |
| FR-561 | Cron: month-end statements | PARTIALLY IMPLEMENTED | TC-1202, TC-1203 | Error handling, Functional, Negative, Workflow | High |
| FR-562 | Cron scheduler (GitHub Actions) | IMPLEMENTED | TC-1204, TC-1205 | Configuration, Integration, Negative, Workflow | High |
| FR-563 | Internal public-data revalidate | IMPLEMENTED | TC-1206, TC-1207, TC-1208 | Boundary, Functional, Integration, Security | High |
| FR-564 | Internal chat-notify secret gate | IMPLEMENTED | TC-1209, TC-1210 | Integration, Negative, Security | High |
| FR-565 | CSP violation report intake | IMPLEMENTED | TC-1211, TC-1212 | API, Boundary, Integration, Security | Medium |
| FR-566 | SSR session endpoints | IMPLEMENTED | TC-1213, TC-1214 | API, Functional, Security | High |
| FR-567 | Service middleware chain, error envelope and 404 | IMPLEMENTED | TC-1215, TC-1216, TC-1217, TC-1264 | API, Boundary, Error handling, Functional, Regression, Security | High |
| FR-568 | Rate limiter | IMPLEMENTED | TC-1218, TC-1219, TC-1220 | Boundary, Concurrency, Integration, Resilience, Security | Critical |
| FR-569 | Production boot assertions | IMPLEMENTED | TC-1221, TC-1222 | Configuration, Negative | Critical |
| FR-570 | Client-IP trust and proxy stamp | IMPLEMENTED | TC-1223, TC-1224 | Integration, Security | Critical |
| FR-571 | Public-data cache seam | IMPLEMENTED | TC-1225 | Functional, Performance | Medium |
| FR-572 | Security headers and page CSP (ERP and back-office UI) | IMPLEMENTED | TC-1226, TC-1227 | Functional, Security | High |
| FR-573 | API CSP and report-only switch | IMPLEMENTED | TC-1228, TC-1229 | API, Configuration, Security | High |
| FR-574 | Marketing site (www) headers and CSP | UNCLEAR | TC-1230 | Security, UNCLEAR | Medium |
| FR-575 | Tenant subdomain host rules | IMPLEMENTED | TC-1231, TC-1232 | Functional, Negative, Security | High |
| FR-576 | Sentry and privacy scrubbing | IMPLEMENTED | TC-1233, TC-1234 | Negative, Privacy, Security | High |
| FR-577 | Service worker caching and offline fallback | IMPLEMENTED | TC-1235 | Functional, PWA | Medium |
| FR-578 | Web manifest and install prompt | PARTIALLY IMPLEMENTED | TC-1236, TC-1237 | Compatibility, Functional, UI | Medium |
| FR-579 | Offline attendance outbox | IMPLEMENTED | TC-1238, TC-1239 | Boundary, Functional, Negative, Workflow | High |
| FR-580 | Web push registration and notification display | IMPLEMENTED | TC-1240 | Configuration, Functional | Medium |
| FR-581 | Cache purge on logout | PARTIALLY IMPLEMENTED | TC-1241, TC-1242 | Functional, Negative, Security | High |
| FR-582 | Locale routing, default locale and detection | IMPLEMENTED | TC-1243, TC-1244 | Boundary, Functional, Negative | High |
| FR-583 | RTL layout and message fallback | IMPLEMENTED | TC-1245 | Functional, UI | Medium |
| FR-584 | 404, catch-all and global error pages | IMPLEMENTED | TC-1246 | Functional, UI | Low |
| FR-585 | UI preview developer page | IMPLEMENTED | TC-1247 | Functional, Security | Low |
| FR-586 | Guided tours and emulators | UNCLEAR | TC-1248 | Authorization, UNCLEAR | Medium |
| FR-587 | Deployment topology | IMPLEMENTED | TC-1249, TC-1250 | Integration, Negative, Resilience, Smoke | High |
| FR-588 | Environment configuration fails closed (names only) | IMPLEMENTED | TC-1251, TC-1252 | Configuration, Negative, Security | Critical |
| FR-589 | Continuous integration and test suites | IMPLEMENTED | TC-1253 | Configuration, Regression | Medium |
| FR-590 | Production deploy, drift detection and migrations | IMPLEMENTED | TC-1254, TC-1255 | Negative, Security, Workflow | High |
| FR-591 | Nightly encrypted backup | IMPLEMENTED | TC-1256, TC-1257 | Backup, Integration, Negative | High |
| FR-592 | Weekly restore test | IMPLEMENTED | TC-1258 | Backup, Integration | Medium |
| FR-593 | Point-in-time recovery and recovery runbook | UNCLEAR | TC-1259, TC-1260 | Backup, Documentation, Recovery, UNCLEAR | High |
| FR-594 | Realtime health and boot (infrastructure view) | IMPLEMENTED | TC-1261 | API, Smoke | Medium |

### Data Model & Data Integrity

| FR ID | Feature | Implementation status | Test Case IDs | Test Types | Priority (highest of linked TCs) |
|---|---|---|---|---|---|
| FR-595 | Tenant isolation by row-level security on 41 tables | IMPLEMENTED · Priority: Critical | TC-1265, TC-1266, TC-1267, TC-1268 | Database | Critical |
| FR-596 | Tenancy wrappers choose tenant or platform context | IMPLEMENTED · Priority: Critical | TC-1269, TC-1270, TC-1271 | Database, Database (automated suite) | Critical |
| FR-597 | Runtime refuses a privileged DB role | IMPLEMENTED · Priority: Critical | TC-1272, TC-1273 | Database, Integration | Critical |
| FR-598 | Catalog is readable by all, writable only under platform context | IMPLEMENTED · Priority: High | TC-1274, TC-1275 | Database | High |
| FR-599 | Ledgers and settlements are append-only | IMPLEMENTED · Priority: Critical | TC-1276, TC-1277, TC-1278 | Database, Integration | Critical |
| FR-600 | Payments, invoices and payouts are never hard-deleted | IMPLEMENTED · Priority: Critical | TC-1279, TC-1280 | Database, Integration | Critical |
| FR-601 | Users are soft-deleted only | IMPLEMENTED · Priority: Critical | TC-1281, TC-1282 | Database, Integration | Critical |
| FR-602 | Deactivation revokes all sessions | IMPLEMENTED · Priority: Critical | TC-1283, TC-1284, TC-1285 | Database, Integration | Critical |
| FR-603 | Credential mirror between users and auth_accounts | IMPLEMENTED · Priority: High | TC-1286, TC-1343 | Database | High |
| FR-604 | Password hash omitted from reads by default | IMPLEMENTED · Priority: High | TC-1287, TC-1344 | Integration | High |
| FR-605 | Money amounts bounded and wallets non-negative | IMPLEMENTED · Priority: Critical | TC-1288, TC-1289, TC-1290 | Database | Critical |
| FR-606 | Wallet ledger balance_after never negative | IMPLEMENTED · Priority: Critical | TC-1291, TC-1292 | Database | Critical |
| FR-607 | Subscription shape and one-active uniqueness | IMPLEMENTED · Priority: Critical | TC-1293, TC-1294, TC-1295 | Database | Critical |
| FR-608 | Refund integrity | IMPLEMENTED · Priority: Critical | TC-1296, TC-1297, TC-1298, TC-1299 | Database | Critical |
| FR-609 | Lesson settlement exactly once and conserved | IMPLEMENTED · Priority: Critical | TC-1300, TC-1301, TC-1302 | Database | Critical |
| FR-610 | Payment intent integrity | IMPLEMENTED · Priority: Critical | TC-1303, TC-1304, TC-1305 | Database | Critical |
| FR-611 | Client request idempotency keys | IMPLEMENTED · Priority: High | TC-1306, TC-1307 | Database | High |
| FR-612 | One live row per relationship | IMPLEMENTED · Priority: High | TC-1308, TC-1309, TC-1310 | Database | High |
| FR-613 | Student code generated by the database | IMPLEMENTED · Priority: High | TC-1311, TC-1312 | Database | High |
| FR-614 | Student identity uniqueness | IMPLEMENTED · Priority: High | TC-1313, TC-1314 | Database | High |
| FR-615 | Messaging data shape | IMPLEMENTED · Priority: Medium | TC-1315 | Database | Medium |
| FR-616 | Team note has exactly one scope | IMPLEMENTED · Priority: Medium | TC-1316 | Database | Medium |
| FR-617 | Public handle shape and owner | IMPLEMENTED · Priority: Medium | TC-1317 | Database | Medium |
| FR-618 | Course shape checks | IMPLEMENTED · Priority: High | TC-1318, TC-1319 | Database | High |
| FR-619 | External teacher integrity | IMPLEMENTED · Priority: High | TC-1320, TC-1321 | Database | High |
| FR-620 | Audit log append-only and auto-audited operations | IMPLEMENTED · Priority: High | TC-1322, TC-1323 | Database, Database (automated suite) | High |
| FR-621 | Reference sequences | IMPLEMENTED · Priority: Medium | TC-1324 | Database | Medium |
| FR-622 | Search text generated columns | IMPLEMENTED · Priority: Medium | TC-1325 | Database | Medium |
| FR-623 | Demo data flagged and removable | PARTIALLY IMPLEMENTED · Priority: High | TC-1326, TC-1327, TC-1328, TC-1341, TC-1342 | Database, Database (seed, purge) | High |
| FR-624 | Owner purge needs the owner connection | IMPLEMENTED · Priority: High | TC-1329, TC-1345 | Database (seed, purge) | High |
| FR-625 | Environment labels guard every script | IMPLEMENTED · Priority: Critical | TC-1330, TC-1331, TC-1332, TC-1333 | Database (seed, purge) | Critical |
| FR-626 | Database shape and grant verification | IMPLEMENTED · Priority: High | TC-1334, TC-1335 | Database | High |
| FR-627 | Production cleanup preserves catalog and staff | IMPLEMENTED · Priority: Critical | TC-1336, TC-1337 | Database (seed, purge) | Critical |
| FR-628 | Status transitions are conditional updates | IMPLEMENTED · Priority: High | TC-1338, TC-1346 | Database | High |
| FR-629 | Catalog rows cannot be deleted while referenced | IMPLEMENTED · Priority: High | TC-1339, TC-1347 | Database | High |
| FR-630 | Child rows cascade with their parent | IMPLEMENTED · Priority: Medium | TC-1340 | Database | Medium |

## Existing automated tests mapped to modules
These repository test suites already exercise parts of the requirements. They are listed so that testers
can avoid duplicate manual work and see which requirements have regression protection. A requirement with
only manual test cases has no regression protection.

### Authentication, Accounts & Onboarding

| Test file | What it covers | FRs touched |
|---|---|---|
| `apps/api/tests/unit/auth-routes.test.ts` | ERP auth route wiring and envelope shapes | FR-001, 004, 030 |
| `apps/api/tests/unit/m1-login-lockout.test.ts` | per-e-mail / per-IP sign-in limiter returns 429 + Retry-After | FR-002 |
| `apps/api/tests/unit/m11-forgot-password-route.test.ts` | forgot-password uniform response and throttles | FR-010 |
| `apps/api/tests/unit/route-auth-doors.test.ts` | every `/v1/**` route sits behind a session/role door | FR-030 |
| `apps/api/tests/unit/session-cookies.test.ts` | cookie names, ambiguity → session_conflict, sign-out of all presented tokens | FR-004, 030 |
| `apps/api/tests/unit/session-seam.test.ts` | `requireSession` / `getSessionUser` seam behaviour | FR-030 |
| `apps/api/tests/unit/ssr-reads.test.ts` | `/me/ssr-session` read contract | FR-031 |
| `apps/api/tests/unit/authz-require-role.test.ts` | `withRole` 403 role_mismatch | FR-030 |
| `apps/api/tests/unit/authz-center-actor.test.ts` | center actor resolution (`centerId`) on session | FR-001, 030 |
| `apps/api/tests/unit/authz-teacher-actor.test.ts` | teacher actor resolution incl. assistant delegation | FR-030 |
| `apps/admin-api/tests/unit/authz-require-role.test.ts` | back-office tier guard | FR-040 |
| `apps/admin-api/tests/unit/route-admin-guard.test.ts` | `/api/auth/admin/*` sealed → 404 | FR-040 |
| `apps/admin-api/tests/unit/session-seam.test.ts` | back-office fail-closed `requireSession` (2FA) | FR-039, 040 |
| `apps/admin-api/tests/unit/ssr-session.test.ts` | back-office SSR session read | FR-040 |
| `apps/erp/tests/db/authz01-roster-login-identity.test.ts` | roster identity vs login identity separation | FR-013, 021 |
| `apps/erp/tests/db/c04-login-parity.test.ts` | ERP vs back-office login policy parity | FR-001, 038 |
| `apps/erp/tests/db/c07-security-audit-guards.test.ts` | audit_logs append-only grants | FR-029 |
| `apps/erp/tests/db/catalog-onboarding.test.ts` | onboarding state / draft / complete chain rules | FR-024, 025, 026, 027 |
| `apps/erp/tests/db/data-rights.test.ts` | export + deletion requests, parent reach | FR-034, 035 |
| `apps/erp/tests/db/guardian-contact-access.test.ts` | guardian contact scoping and lock lift | FR-037 |
| `apps/erp/tests/db/guardian-verification.test.ts` | verification token issue/confirm, exact-e-mail binding | FR-036 |
| `apps/erp/tests/db/h02-register-shell-gate.test.ts` | registration vs shell accounts gate | FR-006, 008, 021 |
| `apps/erp/tests/db/h04-blacklist-cascade-reversal.test.ts` | blacklist → status cascade and reversal (sessions revoked) | FR-002, 030 |
| `apps/erp/tests/db/invite-claim.test.ts` | invite-token claim → session → credentials | FR-013, 021 |
| `apps/erp/tests/db/l04-invite-accept-race.test.ts` | concurrent legacy invite accept | FR-012 |
| `apps/erp/tests/db/l1-session-invalidation.test.ts` | token_version bump deletes all sessions | FR-018, 020 |
| `apps/erp/tests/db/m5-send-invite-ownership.test.ts` | invite issuing ownership (Center Administration side) | FR-013 |
| `apps/erp/tests/db/mail-password-reset.test.ts` | reset mail content and token | FR-010, 011 |
| `apps/erp/tests/db/poc-m01-staff-session-idor.test.ts` | staff session IDOR regression | FR-030 |
| `apps/erp/tests/db/public-handles.test.ts` | handle set / check / uniqueness | FR-023 |
| `apps/erp/tests/db/student-qr-credential.test.ts` | card credential cannot mint a session | FR-013 |
| `apps/erp/tests/db/temp-student-invite-ownership.test.ts` | temp student invite ownership | FR-013 |
| `apps/erp/tests/db/view-as.test.ts` | view-as claim, replay, 1 h window, stop | FR-014, 015 |
| `apps/erp/tests/unit/c04-login-allowlist.test.ts` | `canSignIn` allow-list | FR-001, 038 |
| `apps/erp/tests/unit/guardian-verification.test.ts` | verification screen states | FR-036 |
| `apps/erp/tests/unit/i18n-portal-scope.test.ts` | message catalog scoping per portal | FR-031 (NFR-012) |
| `apps/erp/tests/unit/onboarding-steps.test.ts` | wizard step order / skip rules | FR-026, 027 |
| `apps/erp/tests/unit/portal-gate.test.ts` | identity → role → onboarding gate | FR-031 |
| `apps/erp/tests/unit/session-cookie-prefix.test.ts` | cookie prefix isolation | FR-030 |
| `apps/erp/tests/unit/session-integrity.test.ts` | session shape integrity | FR-030 |
| `apps/erp/tests/unit/account-switch-routing.test.ts` | routing after account switch | FR-031 |
| `apps/erp/tests/unit/portal-bottom-nav-parity.test.ts` | portal nav parity (segments) | FR-031 |
| `apps/erp/tests/unit/ingest-proxy.test.ts` | proxy behaviour (host / headers) | FR-031 (NFR-009) |
| `apps/superadmin/tests/db/c04-login-boundary.test.ts` | back-office login boundary | FR-038 |

No automated test was found for: `register/center` (FR-009), view-as stop in isolation beyond `view-as.test.ts`, `/me/prefs` (FR-022), `/me/delete-request` (FR-033), `/me/profile-checklist` (FR-032), e-mail change (FR-019/020), ERP 2FA enable/disable (FR-005). See GAP-012.

### Center Administration

Mapped by file name and suite scope; individual assertions were not re-run (READ ONLY — no test execution). DB suites need a database and run only in `test` (local) per CLAUDE.md.

| Test file | Kind | Covers FR |
|---|---|---|
| apps/api/tests/unit/authz-center-actor.test.ts | Unit | FR-100, FR-102 |
| apps/erp/tests/unit/student-csv.test.ts | Unit | FR-133 |
| apps/erp/tests/unit/student-import-chunks.test.ts | Unit | FR-134 (UI 20-row chunking) |
| apps/erp/tests/unit/student-import-download.test.ts | Unit | FR-134 (result download) |
| apps/erp/tests/unit/student-identity.test.ts | Unit | FR-172 |
| apps/erp/tests/unit/student-code.test.ts | Unit | FR-154 |
| apps/erp/tests/unit/scanned-code.test.ts | Unit | FR-153 |
| apps/erp/tests/unit/room-amenities.test.ts | Unit | FR-143, FR-144 |
| apps/erp/tests/db/bulk-import-students.test.ts | DB | FR-134, FR-172 |
| apps/erp/tests/db/center-staff-delegation.test.ts | DB | FR-100, FR-101, FR-102 |
| apps/erp/tests/db/poc-m01-staff-session-idor.test.ts | DB | FR-100, FR-115 |
| apps/erp/tests/db/sessions-staff-scope.test.ts | DB | FR-100 (sessions scope; owned by Sessions & Attendance) |
| apps/erp/tests/db/c07-security-audit-guards.test.ts | DB | FR-101 |
| apps/erp/tests/db/roster-courses-count.test.ts | DB | FR-116 |
| apps/erp/tests/db/authz01-roster-login-identity.test.ts | DB | FR-119 |
| apps/erp/tests/db/walk-in-ownership.test.ts | DB | FR-127 |
| apps/erp/tests/db/temp-student-invite-ownership.test.ts | DB | FR-129, FR-130, FR-131 |
| apps/erp/tests/db/guardian-contact-access.test.ts | DB | FR-135, FR-136 |
| apps/erp/tests/db/h04-blacklist-cascade-reversal.test.ts | DB | FR-138, FR-139 |
| apps/erp/tests/db/room-ownership.test.ts | DB | FR-144, FR-145 |
| apps/erp/tests/db/team-notes.test.ts | DB | FR-149, FR-150, FR-151, FR-152 |
| apps/erp/tests/db/student-id-card.test.ts | DB | FR-154 |
| apps/erp/tests/db/external-teachers.test.ts | DB | FR-155 – FR-169 |
| apps/superadmin/tests/db/m16-roster-scoped-reads.test.ts | DB | FR-116, FR-118 |
| apps/superadmin/tests/db/room-pricing-methods.test.ts | DB | FR-143, FR-147 |
| apps/erp/tools/help-shots/staff-tour.spec.ts | Playwright (help screenshots, not assertions) | UI only |

No automated test was found for: FR-103 – FR-114, FR-117, FR-120 – FR-126, FR-128, FR-132, FR-137, FR-140 – FR-142, FR-146, FR-148 (see GAP-053). Money FRs FR-170 and FR-171 are tested by the module "Payments, Subscriptions, Wallets & Settlement".

### Courses, Sessions, Enrollment & Attendance

These automated tests exist in the repo and touch SES behavior. They were identified by file name and scope; their assertions were not re-run (no DB or test runs were allowed).

| Test file | Area covered | Related FRs |
|---|---|---|
| `apps/erp/tests/db/t9-attendance-reopen.test.ts` | Attendance reopen and the lock predicate | FR-192, FR-193 |
| `apps/erp/tests/db/settled-lesson-lock.test.ts` | Settled lessons stay locked (counter, door, register) | FR-188, FR-192, FR-196, FR-200 |
| `apps/erp/tests/db/offline-sync.test.ts` | Offline attendance sync outcomes | FR-202 |
| `apps/erp/tests/db/counter-board.test.ts` | Counter board reads | FR-199 |
| `apps/erp/tests/db/counter-payment-methods.test.ts` | Counter check-in followed by payment | FR-196 |
| `apps/erp/tests/db/suggest-sessions-batch.test.ts` | Check-in session suggestions | FR-198 |
| `apps/erp/tests/db/sessions-staff-scope.test.ts` | Staff session scoping | FR-184, FR-214 |
| `apps/erp/tests/db/poc-m01-staff-session-idor.test.ts` | Cross-center session IDOR | FR-185, FR-214 |
| `apps/erp/tests/db/sessions-center-name.test.ts` | Session list center name | FR-184 |
| `apps/erp/tests/db/c01-lesson-settlement.test.ts` | Lesson completion and settlement; money conservation | FR-188, FR-189 |
| `apps/erp/tests/unit/l02-lesson-price-floor.test.ts` | `resolveLessonPrice` floors the per-lesson price | FR-188 |
| `apps/erp/tests/db/course-create-atomicity.test.ts` | Course + session creation is atomic | FR-176, FR-183 |
| `apps/erp/tests/db/course-delivery-and-teacher-day.test.ts` | Delivery modes and teacher day view | FR-178, FR-177 |
| `apps/erp/tests/db/diff02-meeting-link-coverage.test.ts` | Meeting link gated by coverage | FR-175 |
| `apps/erp/tests/db/teacher-coverage.test.ts` | Teacher coverage view | FR-204 |
| `apps/erp/tests/db/roster-courses-count.test.ts` | Roster course counts | FR-212 |
| `apps/erp/tests/db/registration-doors.test.ts` | Registration entry points | FR-205 |
| `apps/erp/tests/db/settlements-for-all.test.ts` | Settlement across course types | FR-188 |
| `apps/erp/tests/db/rbac-isolation.test.ts` | Role isolation incl. cancel/postpone | FR-186, FR-187, FR-214 |
| `apps/erp/tests/db/external-teachers.test.ts` | Courses taught by external (shell) teachers | FR-176 |
| `apps/erp/tests/db/teacher-agreements.test.ts` | Teacher agreements used at settlement | FR-188 |
| `apps/erp/tests/db/center-credit-clearing.test.ts` | Credit clearing at settlement | FR-188 |
| `apps/erp/tests/unit/attendance-batch-writes.test.ts` | Bulk attendance write batching | FR-191 |
| `apps/erp/tests/unit/door-offline.test.ts` | Door check-in offline handling | FR-200, FR-202 |
| `apps/erp/tests/unit/i18n-portal-scope.test.ts` | Catalog keys per portal | FR-215 |
| `apps/api/tests/unit/t2-delegated-gates.test.ts` | Delegated (teacher/assistant) guards | FR-213 |
| `apps/api/tests/unit/route-center-checkin.test.ts` | Counter check-in route | FR-196 |
| `apps/api/tests/unit/n1-batch3-reads.test.ts` | Conflict reads | FR-183 |
| `apps/api/tests/unit/me-attendance-course-name.test.ts` | /me/attendance course name | FR-203 |
| `apps/api/tests/parity/parity.test.ts` | Route parity between apps | All routes |
| `apps/superadmin/tests/db/center-academic.test.ts` | Back-office enrollment oversight | Hand-off: "Super Admin Operations" |
| `apps/superadmin/tests/db/center-operations.test.ts` | Back-office cancel/postpone | Hand-off: "Super Admin Operations" |
| `apps/superadmin/tests/db/center-held-refund.test.ts` | Refund of a held lesson | Hand-off: "Payments, Subscriptions, Wallets & Settlement" |
| `apps/superadmin/tests/db/agreement-refund-mirror.test.ts` | Agreement refund mirror | Hand-off: "Payments, Subscriptions, Wallets & Settlement" |

No automated test was found for: anonymous course browse and its rate limit (FR-173), reassign course teacher (FR-182), cancel course (FR-181), direct-enroll capacity (FR-210), the Cairo/UTC day boundary in suggestions (FR-198), and the unpriced-lesson completion refusal "This lesson has no price — set the class pricing before completing sessions" (`packages/server-core/src/services/finance/distribution.ts:285`; a search of all test folders found no test asserting it) (FR-188). See GAP-075.

### Payments, Subscriptions, Wallets & Settlement

| Path | What it checks (one line) | FRs touched |
|---|---|---|
| `apps/api/tests/unit/c1-payments-mode.test.ts` | `PAYMENTS_MODE` parsing and production refusal of mock | FR-224, FR-227 |
| `apps/api/tests/unit/m7-cron-auth.test.ts` | Cron route rejects missing/invalid `CRON_SECRET` | FR-217 |
| `apps/api/tests/unit/route-center-subscriptions-method.test.ts` | Walk-in route accepts the counter `paymentMethod` enum | FR-236 |
| `apps/api/tests/unit/route-paymob-webhook.test.ts` | Webhook route: signature failure → 401, rate limit | FR-228 |
| `apps/erp/tests/unit/webhook-contract.test.ts` | Provider event shape → intent status mapping | FR-228, FR-229 |
| `apps/erp/tests/unit/cron-jobs-batching.test.ts` | Expiry sweeps batch updates | FR-217 |
| `apps/erp/tests/unit/l02-lesson-price-floor.test.ts` | `resolveLessonPrice` floor + remainder on last lesson | FR-258 |
| `apps/erp/tests/unit/money-distribution.test.ts` | Commission / fee / agreement arithmetic | FR-247, FR-259 |
| `apps/erp/tests/unit/payment-payer-ownership.test.ts` | `payerUserId` ownership checks on payment reads | FR-218, FR-219 |
| `apps/erp/tests/unit/payments-day-range.test.ts` | Cairo day range for payment list filters | FR-218 |
| `apps/erp/tests/unit/subscription-state.test.ts` | Subscription status machine transitions | FR-232, FR-234 |
| `apps/erp/tests/db/wallet.test.ts` | Student wallet credit/debit and conditional decrement | FR-230, FR-262 |
| `apps/erp/tests/db/wallet-no-cap.test.ts` | Wallet balance has no upper cap on credit | FR-250 |
| `apps/erp/tests/db/l01-wallet-balance-after.test.ts` | Ledger `balance_after` consistency | FR-250 |
| `apps/erp/tests/db/poc-h01-wallet-topup-refund.test.ts` | Refund of a wallet top-up debits the wallet | FR-221, FR-263 |
| `apps/erp/tests/db/refund-wallet-topup.test.ts` | Wallet top-up refund path | FR-221 |
| `apps/erp/tests/db/refund-bound.test.ts` | Cumulative refunds cannot exceed the original | FR-221 |
| `apps/erp/tests/db/c06-refund-guards.test.ts` | Refund of refund / channel / confirm guards | FR-221, FR-222 |
| `apps/erp/tests/db/settled-lesson-lock.test.ts` | Refund refused once a lesson under the receipt settled | FR-221 |
| `apps/erp/tests/db/biz01-orphan-credit-refund.test.ts` | Orphan capture credited to payer wallet | FR-229, FR-232 |
| `apps/erp/tests/db/biz02-center-credit-claim.test.ts` | Center credit movement on claim | FR-261 |
| `apps/erp/tests/db/biz05-claim-carries-wallet.test.ts` | Wallet carried through account claim | FR-250 |
| `apps/erp/tests/db/center-credit-clearing.test.ts` | Center credit ledger clearing | FR-239, FR-261 |
| `apps/erp/tests/db/counter-payment-methods.test.ts` | Counter methods and `cashNet` bucket | FR-216, FR-236 |
| `apps/erp/tests/db/mc3-payment-method.test.ts` | Payment method persistence | FR-216 |
| `apps/erp/tests/db/parent-pay.test.ts` | Parent pays: ledger direction student→center, payer recorded | FR-233 |
| `apps/erp/tests/db/m1-webhook-atomicity.test.ts` | Status claim and settlement in one transaction | FR-229 |
| `apps/erp/tests/db/poc-h04-webhook-amount.test.ts` | Amount mismatch → `needs_review` | FR-229 |
| `apps/erp/tests/db/c01-lesson-settlement.test.ts` | Unpriced lesson refuses settlement | FR-258, FR-259 |
| `apps/erp/tests/db/settlements-for-all.test.ts` | Settlement for every present student | FR-259 |
| `apps/erp/tests/db/teacher-coverage.test.ts` | Coverage resolution | FR-256 |
| `apps/erp/tests/db/h1-payout-race.test.ts` | Concurrent payout requests cannot exceed available | FR-242 |
| `apps/erp/tests/db/payout-cancel.test.ts` | Requester cancels only pending payouts | FR-243 |
| `apps/erp/tests/db/teacher-payout-replay.test.ts` | Teacher payout `clientRequestId` replay window | FR-249 |
| `apps/erp/tests/db/shift-reconciliation.test.ts` | `expectedCash` / `variance` formulas | FR-244, FR-245 |

Not covered by any automated test found: FR-225/011 (initiate/poll), FR-231 (parent wallet top-up), FR-238 (cash wallet top-up), FR-240 (center credit top-up), FR-246 (shift list), FR-252 (points), FR-253/039 (expenses), FR-257 (public pricing), FR-260 (settlement preview) — see GAP-091. The one-line descriptions are inferred from file names and brief inspection; a tester should open each file before relying on it.

### Teacher Portal, Assistants, Collaboration & Academic Content

| Test file | Covers FR |
|---|---|
| apps/api/tests/unit/t2-delegated-gates.test.ts | FR-268, 027, 035 (teacher read gates use delegated()) |
| apps/api/tests/unit/route-collab-accept-body.test.ts | FR-280, 021 (accept body contract) |
| apps/api/tests/unit/authz-teacher-actor.test.ts | FR-264, 005, 007 (requireTeacherActor) |
| apps/api/tests/unit/m7-cron-auth.test.ts | FR-283 (cron auth, expiry job mocked) |
| apps/superadmin/tests/db/center-collab-create.test.ts | FR-278 |
| apps/erp/tests/unit/m6-materials-magic-bytes.test.ts | FR-297 |
| apps/erp/tests/playwright/teacher-gradebook.spec.ts | FR-289, 031 (UI save, discard, course switch) |
| apps/erp/tests/db/temp-student-invite-ownership.test.ts | FR-274 |
| apps/erp/tests/db/h04-blacklist-cascade-reversal.test.ts | FR-271, 010 |
| apps/erp/tests/db/team-notes.test.ts | FR-308 |
| apps/erp/tests/db/materials-access.test.ts | FR-298, 036 |
| apps/erp/tests/db/review-per-lesson.test.ts | FR-303 (one review per lesson index) |
| apps/erp/tests/db/l08-grade-header-scope.test.ts | FR-291 (grade header scope) |
| apps/erp/tests/db/center-staff-delegation.test.ts | FR-268 (centre-side delegation) |
| apps/erp/tests/db/hall-booking.test.ts | FR-280, 020, 021 (calls expireCollaborationRequests) |
| apps/erp/tools/help-shots/assistant-tour.spec.ts | FR-309 (help screenshot tool, not a regression test) |

No automated test found for: assistant revoke end to end, review eligibility and 24 h edit, grade score boundaries, GET /grades role scoping, collaboration accept happy path outside hall-booking (GAP-112).

### Student & Parent Portals

| Test file | What it covers | Related FRs |
|---|---|---|
| `apps/erp/tests/unit/student-code.test.ts` | 14 tests: valid code accepted, every single mistype rejected, every adjacent swap rejected, normalisation (case, separators, I/L/O mapping), issuance, display format | FR-327, FR-328 |
| `apps/erp/tests/unit/student-qr.test.ts` | 23 tests: payload signing and parsing, signature tampering, wrong secret, fail-closed without secret in production, development fallback | FR-329, FR-330 |
| `apps/erp/tests/db/student-id-card.test.ts` | Issuance, card authorization, disclosure, SQL generator versus TypeScript verifier, counter, other centers' children not leaked, CHECK constraint on the code | FR-324, FR-325, FR-327, FR-328, FR-330 |
| `apps/erp/tests/db/student-qr-credential.test.ts` | Back-office look and audit, incomplete record has no card, reissue, who-is-looking tiers, teacher/assistant, page is not an oracle, keyboard-wedge scanner | FR-329, FR-330, FR-331 |
| `apps/erp/tests/db/messaging-scope.test.ts` | Default-minor, oversight list and threads, oversight does not change unread counters or read cursors | FR-339, FR-340, FR-341 |
| `apps/erp/tests/db/me-children-grade-level.test.ts` | `listChildren` returns grade level | FR-321 |
| `apps/erp/tests/db/rbac-isolation.test.ts`, `apps/erp/tests/db/catalog-onboarding.test.ts` | Role isolation and catalog onboarding (content not re-inspected for this module; relevance to student scope UNKNOWN) | FR-333, FR-335 (partial) |
| `apps/api/tests/unit/sessions-parent-child-scope.test.ts` | Parent child-scope on sessions (belongs mainly to Sessions & Attendance) | FR-321 (related) |
| `apps/api/tests/unit/dashboards-student-contract.test.ts`, `apps/api/tests/unit/ssr-reads.test.ts` | Student dashboard contract and server-side reads | FR-343 |
| `apps/erp/tests/playwright/parent-portal.spec.ts` | 7 end-to-end tests; appears stale (uses `.ant-*` selectors, expects 'Enter the family code' while the UI shows 'Please enter a family code.') | FR-344, FR-346 (GAP-132) |
| `apps/erp/tests/playwright/student-dashboard.spec.ts` | 6 end-to-end tests of the student dashboard | FR-343 |
| `apps/superadmin/tests/db/unlink-parent-scope.test.ts`, `apps/superadmin/tests/db/maturity-layer.test.ts` | Back-office unlink scope; maturity layer only seeds a family code | FR-319 (back-office side only) |

#### Areas with no direct automated test found

Family-code linking and rotation (FR-312, FR-313, FR-316), request/approve/reject/revoke lifecycle (FR-314, FR-315, FR-317 to FR-320), one-parent enforcement (FR-322), notifications (FR-323), `scope=all` and track scoping (FR-333 to FR-336), scan tiers through the route (FR-330), print sheet (FR-332), roster choice (FR-338), subject requests (FR-342), parent pages (FR-344 to FR-346). See GAP-131.

### Messaging, Notifications & Communication Integrations

| Test file | What it covers | FRs touched |
|---|---|---|
| apps/erp/tests/db/messaging-scope.test.ts | DB-level role/relationship scope and block checks of the messaging service (contains no guardian-lock assertions, per docs/reports/guardian-gate-findings.md) | FR-349, 002, 010, 011, 019 |
| apps/erp/tests/unit/messaging-matrix.test.ts | Initiation matrix table | FR-358 |
| apps/erp/tests/unit/messaging-batching.test.ts, messaging-load-errors.test.ts | Client batching and load-error handling | FR-351, 063 |
| apps/erp/tests/db/guardian-contact-access.test.ts | Who may read/set guardian contact | FR-406 |
| apps/erp/tests/db/guardian-verification.test.ts, apps/erp/tests/unit/guardian-verification.test.ts | Verification token issue and confirm | FR-408, 061 |
| apps/erp/tests/db/invite-claim.test.ts | Invite claim and guardian lock (lines 364, 378, 545) | FR-360, 054, 057 |
| apps/erp/tests/db/push-registration-ownership.test.ts | Push and device token ownership | FR-394, 047, 048, 049 |
| apps/erp/tests/db/unread-counts.test.ts | Unread counts | FR-387 |
| apps/erp/tests/db/weekly-digest.test.ts, apps/erp/tests/unit/weekly-digest.test.ts | Digest job and idempotency | FR-410 |
| apps/erp/tests/unit/notifications.test.ts, notification-deep-link.test.ts | Notification matrix and deep links | FR-388, 045 |
| apps/erp/tests/db/mail-password-reset.test.ts | Mail sending for reset | FR-403 |
| apps/erp/tests/db/l04-invite-accept-race.test.ts, m5-send-invite-ownership.test.ts | Invite concurrency and ownership | FR-402, 057 |
| apps/erp/tests/unit/api-error-message.test.ts | Error message mapping on the client | FR-411 |
| apps/api/tests/unit/route-internal-chat-notify.test.ts | chat-notify secret and payload | FR-386 |
| apps/api/tests/unit/m10-health-deep-mail.test.ts | Mail health check | FR-403 |
| apps/superadmin/tests/db/whatsapp-log-disclosure.test.ts | WhatsApp log disclosure in the back-office | FR-400 |

Not covered by any automated test found: apps/realtime (all of it), group guardian lock, `guardian_required` HTTP mapping, broadcast, report forgery, existing-thread bypass of the lock, SMS/WhatsApp live failure handling, NULL due-date locked case.

### Reports, Dashboards & Exports

Listed from apps/erp/tests (names verified by directory listing; counts quoted from docs where marked).

| Path | Covers | FRs |
|---|---|---|
| apps/erp/tests/db/report-export.test.ts (docs: 38 cases) | live-DB export registry, totals equal service output | FR-427, FR-421, FR-447 |
| apps/erp/tests/unit/report-export-csv.test.ts (docs: 18) | CSV BOM, CRLF, formula neutralisation | FR-427 |
| apps/erp/tests/unit/report-export-tiers.test.ts (docs: 7) | per-report tier enforcement | FR-447, FR-427 |
| apps/erp/tests/unit/route-reports-export.test.ts (docs: 10) | export route headers and errors | FR-427 |
| apps/erp/tests/unit/platform-day-bounds.test.ts (docs: 20) | Cairo day start/end, DST | FR-445 |
| apps/erp/tests/unit/payments-day-range.test.ts | payments log shares dayRange | FR-445, FR-435 |
| apps/erp/tests/unit/reports-period-buckets.test.ts (docs: 6) | week/month bucket keys | FR-422, FR-423 |
| apps/erp/tests/unit/dashboards-admin-period.test.ts | period narrows admin dashboard money; timeframe reported | FR-432 |
| apps/erp/tests/unit/dashboards-teacher-counter-only.test.ts | teacher counter-only count and attendance rate base | FR-436 |
| apps/erp/tests/unit/center-takings.test.ts | takingsOf receipts, refunds, net | FR-435 |
| apps/erp/tests/unit/portal-bottom-nav-parity.test.ts, bottom-nav-slots.test.ts | navigation parity | FR-443 |
| apps/erp/tests/db/weekly-digest.test.ts (docs: 42), tests/unit/weekly-digest.test.ts (docs: 14) | digest window, idempotency, skips, figures equal report | FR-444 |
| apps/erp/tests/e2e/student-dashboard.spec.ts, navigation.spec.ts | student home, navigation smoke | FR-439, FR-443 |
| prisma/report-export-demo-seed.ts, weekly-digest-demo-seed.ts (seeds, not tests) | demo data for exports and digest | FR-427, FR-444 |

Not found by listing (see GAP-183): route-level role scoping of dashboards/admin and teacher, print page, staff reports screen, parent/teacher/admin home UI, funnel/attendance/fill-rate formulas.

### Super Admin Platform Operations

Listed from the repo; not executed for this document (no DB or test runs were allowed). Finance-only suites (payouts, refunds, wallets, commission, room split, centre share, invoices) are out of scope and omitted.

#### admin-api — unit (`apps/admin-api/tests/unit/`)
| Test file | What it covers | FRs touched |
|---|---|---|
| `authz-require-role.test.ts` | `requireRole` for the back-office roles | FR-448 |
| `route-admin-guard.test.ts` | guard on `POST /api/v1/admin/accountants` | FR-448, FR-493 |
| `session-seam.test.ts` | session resolution seam | FR-448 |
| `ssr-session.test.ts` | `GET /api/v1/me/ssr-session` | FR-509 |
| `m15-one-suspension-path.test.ts` | one path in and out of centre suspension | FR-454 |
| `teacher-one-suspension-path.test.ts` | one path in and out of teacher suspension | FR-474 |
| `erp-revalidate.test.ts` | back-office audit → ERP cache invalidation | FR-511 |
| `http-envelope.test.ts` | `{data}` / `{error}` envelope | all FRs (response shape) |
| `m12-parse-page-limit.test.ts` | the single pagination parser | list FRs (e.g. FR-485, FR-501) |
| `route-conventions.test.ts`, `routes-mount.test.ts` | every API route follows the conventions and mounts (names `csp-report`) | all route-backed FRs, FR-510 |
| `route-health.test.ts` | `/api/health` | — (NFR) |
| `apps/admin-api/tests/parity/parity.test.ts` | registry sweep: every route, Next-shaped call vs service stack | all route-backed FRs |

#### superadmin — unit (`apps/superadmin/tests/unit/`)
| Test file | What it covers | FRs touched |
|---|---|---|
| `session-integrity-client.test.ts` | client reaction to session-integrity events | FR-448 |
| `api-proxy-client-ip.test.ts` | proxy stamps the client IP for admin-api (audit IP) | FR-511 |
| `service-routes.test.ts` | `SERVICE_PREFIXES` / `serviceUrl` routing to admin-api | all route-backed FRs |
| `m11-field-schema.test.ts`, `m7-server-field-errors.test.ts`, `m7-field-errors-end-to-end.test.ts`, `m8-use-action.test.ts` | dialog field rules, server field errors reach the input, the single write path (no double toast) | UI of all write FRs |
| `query-freshness-scope.test.ts` | query freshness stays inside its allowlist | UI reads |
| `tour-copy.test.ts`, `tour-coverage.test.ts` | guided-tour copy (ar/en) and coverage | UI (no FR) |

#### superadmin — DB (`apps/superadmin/tests/db/`)
| Test file | What it covers | FRs touched |
|---|---|---|
| `admin-endpoint-sealing.test.ts` | admin endpoint sealing + 2FA gate | FR-448 |
| `c04-login-boundary.test.ts` | back-office roles sign in; every ERP role is refused | FR-448 |
| `admin-users.test.ts` | directory, detail + sessions, suspend, revoke sessions, 2FA reset, password reset, impersonation and view-as targets | FR-485 – FR-489, FR-491, FR-492 |
| `c03-status-revocation.test.ts` | status change revokes back-office sessions | FR-486, FR-487 |
| `admin02-back-office-audit.test.ts` | blacklist add/lift auto-audited (`:42-48`); other cases are finance | FR-480, FR-481, FR-511 |
| `c05-dedupe-guards.test.ts` | unique indexes; concurrent `platformBlacklistUser` leaves one entry | FR-480 |
| `c04-dedupe-guards.test.ts` | unique indexes; concurrent `linkTeacherCenter` leaves one link | FR-476 |
| `center-oversight.test.ts` | read visibility, control ops with one audit row each, deactivation cuts access, enrolment removal journalled and reversible, collaboration request approved (`decideCollaborationRequest`, `:637`), centre audit rows read back (`listAuditLogs`, `:799`) | FR-453 – FR-455, FR-458, FR-461, FR-462, FR-469, FR-501, FR-502 |
| `center-people.test.ts` | students, teachers, staff, co-owner admins; moves no money | FR-456, FR-457, FR-459, FR-460 |
| `center-academic.test.ts` | courses, enrolments, enrolment requests, reassign/cancel; moves no money | FR-464, FR-465 |
| `center-operations.test.ts` | attendance, settled-session lock, deletion requests, broadcast + centre blacklist (settlement part is finance) | FR-463, FR-466, FR-467, FR-470 |
| `center-collab-create.test.ts` | collaboration request on behalf of a centre, one audit row | FR-468 |
| `center-platform.test.ts` | reports, move student (roster only), force logout, DOB verification, course move refused | FR-469, FR-482 – FR-484 |
| `m16-registrations-paging.test.ts` | registrations paging | FR-450 |
| `m16-roster-scoped-reads.test.ts` | roster-scoped reads; imports `listStudents` from `backoffice/admin/platform` (`:3`) | FR-459, FR-460, FR-478 |
| `teacher-control.test.ts` | create teacher, profile update, status, no cascade on deactivation | FR-471, FR-472, FR-474 |
| `teacher-oversight.test.ts` | readers scoped to the teacher; non-teacher unreachable | FR-477 |
| `unlink-parent-scope.test.ts` | unlinking another student's parent link is refused | FR-479 |
| `whatsapp-log-disclosure.test.ts` | claim links never stored in the WhatsApp log | FR-504 |
| `global-search.test.ts` | super admin vs accountant reach, student code, Arabic input | FR-507 |
| `h3-audit-atomicity.test.ts` | blocked audit row rolls back the business write | FR-462, FR-511 |
| `maturity-layer.test.ts` | feature flags (default OFF, audited, key rule), contact inbox, deletion desk (erase person, keep books) | FR-499, FR-500, FR-506, FR-511 |

#### erp — DB and unit (`apps/erp/tests/`)
| Test file | What it covers | FRs touched |
|---|---|---|
| `db/view-as.test.ts` | token signature/tamper/expiry, claim refusals, real ERP session, single use, 1-hour window (`:208-232`) | FR-492 |
| `db/h04-blacklist-cascade-reversal.test.ts` | platform blacklist removes enrolments, lift restores exactly those, no duplicates | FR-463, FR-480, FR-481 |
| `db/catalog-onboarding.test.ts` | catalog shape; super admin creates system/stage/grade/subject/offering (`:189-210`) | FR-494, FR-496, FR-497 |
| `db/student-qr-credential.test.ts` | student card credential; who may reissue (`reissueStudentCard`, `:241`) | FR-490 |
| `db/c08-users-no-delete.test.ts` | `edura_app` cannot DELETE from `users` | FR-499 |
| `db/global-search.test.ts`, `db/search-normalize.test.ts`, `unit/palette-search.test.ts`, `unit/search-text-arabic.test.ts` | search providers and Arabic normalisation | FR-507 |

**FRs with no automated test found** (test files searched for the FR's service functions, e.g. `approveCenter`, `rejectCenter`, `approveTeacher`, `rejectTeacher`, `setTeacherAttendanceMode`, `linkGradeTrack`, `platformKpis`, `resolveReport`, `removeMessage`): FR-449, FR-451, FR-452, FR-473, FR-475, FR-495, FR-498, FR-503, FR-505, FR-508, FR-512. `decisionQueue` (FR-449) appears only in the finance suite `m03-payout-maker-checker.test.ts`.

### Finance & Accounting (Back-office)

Evidence is the file path; the suite names below are what the repo already runs (DB suites under `apps/superadmin/tests/db`, parity under `apps/admin-api/tests/parity`). Which FRs they cover is inferred from the file name and the service each imports; cells marked "none found" were established by a file-name search of `apps/superadmin/tests`, `apps/admin-api/tests` and `packages/server-core` for the feature's keyword.

| Test file (repo-relative) | Covers | Related FR |
|---|---|---|
| `apps/admin-api/tests/parity/parity.test.ts` | Route-table parity between the admin-api file routes and the superadmin app's expected routes | FR-513 … FR-547 (route presence only) |
| `apps/superadmin/tests/db/admin02-back-office-audit.test.ts` | Back-office audit rows for admin writes | FR-533, FR-534, FR-535 |
| `apps/superadmin/tests/db/agreement-refund-mirror.test.ts` | Refund of a lesson priced under a teacher–centre agreement mirrors the agreement split | FR-532, FR-539 |
| `apps/superadmin/tests/db/c01-zero-wallet-refund.test.ts` | Refund when the wallet share is zero | FR-532 |
| `apps/superadmin/tests/db/c02-payout-generation.test.ts` | Month-end payout generation amounts and reservation | FR-527 |
| `apps/superadmin/tests/db/c04-dedupe-guards.test.ts` | Duplicate-write guards (unique indexes) on money rows | FR-529, FR-532, FR-545 |
| `apps/superadmin/tests/db/center-held-refund.test.ts` | Refund of a `center_held` charge | FR-532 |
| `apps/superadmin/tests/db/center-money.test.ts` | `adminRecordPayment`, `adminTopUpWallet`, `adminCreateWalkInSubscription` | FR-542, FR-543, FR-544 |
| `apps/superadmin/tests/db/center-oversight.test.ts` | Centre oversight money reads | FR-547 |
| `apps/superadmin/tests/db/center-share-admin.test.ts` | Revenue split (centre share) administration | FR-535 |
| `apps/superadmin/tests/db/commission-audit.test.ts` | Commission settings write + audit row | FR-533 |
| `apps/superadmin/tests/db/h2-payout-floor.test.ts` | H2 conditional wallet decrement floor on pay | FR-529 |
| `apps/superadmin/tests/db/h3-audit-atomicity.test.ts` | Audit row written in the same transaction as the mutation | FR-528, FR-529, FR-532 |
| `apps/superadmin/tests/db/h3-refund-race.test.ts` | Concurrent double refund → one success | FR-532 |
| `apps/superadmin/tests/db/l03-payout-generation-race.test.ts` | Concurrent generation runs → no duplicate payouts | FR-527 |
| `apps/superadmin/tests/db/m03-payout-maker-checker.test.ts` | Generator ≠ approver ≠ payer rules | FR-528, FR-529 |
| `apps/superadmin/tests/db/m16-invoices.test.ts` | Invoice generation and totals | FR-522, FR-523 |
| `apps/superadmin/tests/db/m16-teacher-statement.test.ts` | Teacher statement report | FR-521 |
| `apps/superadmin/tests/db/refund-payer-wallet.test.ts` | Refund credits the payer (parent vs student) | FR-532 |
| `apps/superadmin/tests/db/refund.test.ts` | Refund legs and clawback | FR-532 |
| `apps/superadmin/tests/db/room-pricing-methods.test.ts` | M1 / M2 / default room pricing methods | FR-535, FR-536, FR-537 |
| `apps/superadmin/tests/db/room-revenue-split.test.ts` | Room-level revenue split resolution | FR-535 |
| `apps/superadmin/tests/db/teacher-oversight.test.ts` | Teacher oversight money reads | FR-547 |
| `apps/superadmin/tests/db/wallet-refund.test.ts` | Wallet-funded lesson refund | FR-532 |
| `apps/superadmin/tests/db/wallet-settings-admin.test.ts` | Wallet top-up policy write | FR-534 |
| none found | Finance dashboard summary and alerts | FR-513, FR-514 |
| none found | Ledger / subscriptions / payment-intent listings (back-office) | FR-515, FR-516, FR-517 |
| none found | Revenue report, trial balance, refunds report | FR-518, FR-519, FR-520 |
| none found | Invoice PDF rendering and send-by-email | FR-524, FR-525 |
| none found | Payout listing/counts, reject, receipt | FR-526, FR-530, FR-531 |
| none found | Settlement export (xlsx headers, truncation header) | FR-538 |
| none found | Points rules CRUD and manual points adjustment | FR-540, FR-541 |
| none found | Centre payout request and expenses via the back office | FR-545, FR-546 |

No end-to-end (browser) tests were found for any back-office finance screen.

### Platform, Infrastructure & Non-Functional

Counts from the runs made for this analysis: apps/api unit suite 406 passed, 1 skipped; apps/admin-api unit suite 58 passed. The DB, parity and Playwright suites were NOT run (they need the local test database and env files, see testenv.md).

#### apps/api unit tests (no database)

| Test file | What it covers | FRs |
|---|---|---|
| apps/api/tests/unit/m7-cron-auth | Cron secret gate: missing, wrong and valid secrets | FR-552 |
| apps/api/tests/unit/m10-health-deep-mail | Deep mail probe needs the cron secret | FR-549 |
| apps/api/tests/unit/health-rate-limiter | Health GET limiter and HEAD exemption | FR-548, FR-568 |
| apps/api/tests/unit/route-public-infra | Ping and other public infrastructure routes | FR-551 |
| apps/api/tests/unit/route-internal-revalidate | Revalidate secret and dataset validation | FR-563 |
| apps/api/tests/unit/route-internal-chat-notify | Chat-notify secret and body validation | FR-564 |
| apps/api/tests/unit/client-ip | Client IP resolution | FR-570 |
| apps/api/tests/unit/m3-rate-limit | Limiter behaviour and key derivation | FR-568, FR-570 |
| apps/api/tests/unit/public-store, public-cache, public-data-invalidation | Public data cache and invalidation | FR-571 |
| apps/api/tests/unit/c1-payments-mode | Payments mode selection at boot | FR-588 |
| apps/api/tests/unit/app, routes-mount, errors-http-mapping, http-envelope | Service chain, route mounting, error envelope | FR-567 |
| apps/api/tests/unit/secret-compare | Constant-time secret comparison | FR-552 |
| apps/api/tests/unit/ssr-reads | Server-rendered session read | FR-566 |

#### apps/admin-api unit tests (no database)

| Test file | What it covers | FRs |
|---|---|---|
| apps/admin-api/tests/unit/route-health | Back-office health | FR-550 |
| apps/admin-api/tests/unit/ssr-session | Back-office session read | FR-566 |
| apps/admin-api/tests/unit/erp-revalidate | Back-office call to the ERP revalidate endpoint | FR-563 |

#### apps/erp unit tests

| Test file | What it covers | FRs |
|---|---|---|
| apps/erp/tests/unit/csp-policy | Page and API CSP builders | FR-572, FR-573 |
| apps/erp/tests/unit/sw-handlers | Service worker push handlers | FR-580 |
| apps/erp/tests/unit/attendance-outbox-partition | Outbox partitioning | FR-579 |
| apps/erp/tests/unit/ingest-proxy | Analytics ingest proxy (touches the locale and tenant proxy path) | FR-582 |
| apps/erp/tests/unit/tenant-host-proxy | Tenant host rules | FR-575 |
| apps/erp/tests/unit/api-proxy-client-ip | Client IP forwarding by the ERP proxy | FR-570 |
| apps/erp/tests/unit/i18n-parity | ar and en message key parity | FR-583 |
| apps/erp/tests/unit/observability | Monitoring scrubbing | FR-576 |
| apps/erp/tests/unit/cron-jobs-batching | Cron job batching | FR-555, FR-557, FR-560 |

#### Database suites (require the local test database; not run)

| Test file | What it covers | FRs |
|---|---|---|
| apps/erp/tests/db/lesson-reminders | Lesson reminder job | FR-555 |
| apps/erp/tests/db/renewal-reminders | Renewal reminder job | FR-557 |
| apps/erp/tests/db/weekly-digest | Weekly digest job | FR-560 |
| apps/erp/tests/db/data-rights | Data export job | FR-554 |
| apps/erp/tests/db/invite-claim (around line 447), guardian-contact-access | Guardian contact reminders | FR-559 |
| apps/erp/tests/db/h03-capture-outcomes (around line 143) | Subscription expiry | FR-556 |
| apps/erp/tests/db/hall-booking (around line 500) | Collaboration request expiry | FR-558 |

#### End-to-end and other suites (not run)

| Suite | What it covers | FRs |
|---|---|---|
| apps/erp/tests/e2e/smoke.e2e.ts and the auth, navigation, render-gates and role-guard Playwright specs | Page load, navigation and role gates (file contents not read in detail; FR mapping approximate) | FR-582 |
| apps/api/tests/parity and the admin-api equivalent | Route parity against the database | FR-567 |
| tests/load and docs/reports/load-test-2026-09-20.md | Local k6 load harness and its report | FR-548, FR-568 (see GAP-258) |

#### Not covered by any automated test

No automated test was found for: month-end statements (FR-561), the cron scheduler workflow (FR-562), expire-payment-intents (FR-553), boot assertions (FR-569, only partly via c1-payments-mode), the service worker cache and offline page (FR-577), install prompt (FR-578), logout purge (FR-581), tour and ui-preview pages (FR-585, FR-586), CI, deploy and backup workflows (FR-589 to FR-593), and the realtime health endpoint (FR-594). Recorded in GAP-255.

### Data Model & Data Integrity

Runner: `packages/database/scripts/run-db-suites.ts`, invoked by `test:db:local` / `test:db:ci` in apps/erp/package.json:37-39 (and apps/superadmin). Seven suites are excluded from the local run — see GAP-274. No automated test found for: FR-621 (sequences), FR-624 (owner purge), FR-625 (env-label refusals), FR-626 (verify-db), FR-627 (production cleanup), FR-630 (cascade).

| Suite | FR IDs | What it covers |
|---|---|---|
| apps/erp/tests/db/rls-table-set.test.ts | FR-595 | Pins the 41 FORCE-RLS tables |
| apps/erp/tests/db/rbac-isolation.test.ts | FR-595, FR-596 | Tenant/role isolation |
| apps/erp/tests/db/center-staff-delegation.test.ts | FR-596 | Staff scoped to their center |
| apps/erp/tests/db/sessions-staff-scope.test.ts | FR-596 | Staff session scope |
| apps/erp/tests/db/poc-m01-staff-session-idor.test.ts | FR-596 | Cross-center session IDOR |
| apps/erp/tests/db/c07-security-audit-guards.test.ts | FR-599, FR-600 | Append-only / no-delete guards |
| apps/erp/tests/db/c08-users-no-delete.test.ts | FR-601 | No hard DELETE on users |
| apps/erp/tests/db/c03-status-revocation.test.ts; apps/superadmin/tests/db/c03-status-revocation.test.ts | FR-602 | Status change revokes sessions |
| apps/erp/tests/db/l1-session-invalidation.test.ts | FR-602 | token_version invalidation |
| apps/erp/tests/db/wallet-no-cap.test.ts; apps/erp/tests/db/wallet.test.ts | FR-605 | Wallet bounds |
| apps/erp/tests/db/l01-wallet-balance-after.test.ts | FR-606 | balance_after ≥ 0 |
| apps/erp/tests/db/biz03-monthly-window.test.ts; apps/erp/tests/db/l02-monthly-remainder.test.ts | FR-607 | Monthly subscription shape |
| apps/erp/tests/db/c06-refund-guards.test.ts; apps/erp/tests/db/refund-bound.test.ts | FR-608 | Refund bounds |
| apps/superadmin/tests/db/h3-refund-race.test.ts; apps/superadmin/tests/db/refund.test.ts | FR-608, FR-628 | Refund race / integrity |
| apps/erp/tests/db/settlements-for-all.test.ts; apps/erp/tests/db/settled-lesson-lock.test.ts | FR-609 | Settlement once and lock |
| apps/erp/tests/db/m1-webhook-atomicity.test.ts; apps/erp/tests/db/poc-h04-webhook-amount.test.ts | FR-610 | Payment intent capture |
| apps/erp/tests/db/m02-checkout-serialisation.test.ts; apps/erp/tests/db/poc-m02-concurrent-checkout.test.ts | FR-610, FR-628 | Concurrent checkout |
| apps/erp/tests/db/teacher-payout-replay.test.ts; apps/erp/tests/db/offline-sync.test.ts | FR-611 | Idempotency / replay |
| apps/superadmin/tests/db/c04-dedupe-guards.test.ts; apps/superadmin/tests/db/c05-dedupe-guards.test.ts | FR-612 | One live row |
| apps/erp/tests/db/shift-reconciliation.test.ts | FR-612 | Open shift |
| apps/erp/tests/db/student-id-card.test.ts; apps/erp/tests/db/student-qr-credential.test.ts | FR-613, FR-614 | Student code / QR version |
| apps/erp/tests/db/bulk-import-students.test.ts | FR-614 | Same-child identity |
| apps/erp/tests/db/messaging-scope.test.ts | FR-615 | Messaging shape/scope |
| apps/erp/tests/db/team-notes.test.ts | FR-616 | Team note scope |
| apps/erp/tests/db/public-handles.test.ts | FR-617 | Public handle |
| apps/erp/tests/db/course-delivery-and-teacher-day.test.ts; apps/erp/tests/db/course-create-atomicity.test.ts | FR-618 | Course shape |
| apps/erp/tests/db/external-teachers.test.ts; apps/erp/tests/db/teacher-agreements.test.ts | FR-619 | External teacher |
| apps/superadmin/tests/db/h3-audit-atomicity.test.ts; apps/superadmin/tests/db/admin02-back-office-audit.test.ts; apps/superadmin/tests/db/commission-audit.test.ts | FR-620 | Audit rows |
| apps/erp/tests/db/search-normalize.test.ts; apps/erp/tests/db/center-directory-search.test.ts | FR-622 | search_text |
| apps/erp/tests/db/h03-seed-uuid-flows.test.ts | FR-623 | Seed UUIDs (excluded locally — GAP-274) |
| apps/superadmin/tests/db/m03-payout-maker-checker.test.ts; apps/erp/tests/db/h1-payout-race.test.ts; apps/superadmin/tests/db/l03-payout-generation-race.test.ts; apps/superadmin/tests/db/h2-payout-floor.test.ts | FR-628 | Conditional transitions / races |
| apps/erp/tests/db/catalog-onboarding.test.ts | FR-598, FR-629 | Catalog (excluded locally — GAP-274) |
| apps/erp/tests/db/l1-session-invalidation.test.ts | FR-603 | Reads auth_accounts joined to users (credential row) |
