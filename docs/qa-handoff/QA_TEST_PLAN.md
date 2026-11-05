# Edura — QA Test Plan

| Item | Value |
|---|---|
| Document | QA_TEST_PLAN.md (2 of 5 in `docs/qa-handoff/`) |
| Baseline | Repository `main` at commit `f7e33102`, inspected 2026-11-01 |
| Requirements source | `PRD_QA_HANDOFF.md` (630 functional requirements in 13 modules) |
| Test cases | `DETAILED_TEST_CASES.md` (1347 test cases) |
| Traceability | `REQUIREMENT_TRACEABILITY_MATRIX.md` |
| Known gaps | `OPEN_QUESTIONS_AND_GAPS.md` (275 gaps, 146 Product Owner questions) |

> **Important.** This plan and its test cases were produced by reverse-engineering the source code. They
> describe what the code is built to do and what it should do according to the project's decision
> records. Nothing in this package has been executed against a running system unless a test case says so.
> The application must not be declared production-ready from this package alone — see §11.

## 1. Testing Objectives
1. Verify that every functional requirement in the PRD behaves as specified, for every role allowed to use it, and is refused for every role that is not.
2. Prove **money integrity**: every amount that moves between student/parent, centre, teacher and platform is correct, recorded once, traceable, and reconciles between screens, exports and the ledger.
3. Prove **tenant isolation**: no centre, teacher, parent or student can read or change another tenant's or another user's data, through the UI or directly through the API.
4. Prove **child safety**: the default-minor rule, guardian oversight and the guardian-email messaging gate hold in every path.
5. Prove the **integrations** (Paymob, WhatsApp, email, push, Cloudinary, realtime) work end to end in a test environment and fail safely when they are unavailable.
6. Confirm the Arabic RTL and English UIs are usable by the real operators (counter staff) on the devices they use.
7. Produce a defect list and a release recommendation backed by executed evidence.

## 2. Test Scope

### 2.1 In scope
All 13 modules of the PRD:

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

Applications: `apps/erp` (ERP UI), `apps/superadmin` (back-office UI), `apps/api` and `apps/admin-api`
(HTTP APIs), `apps/realtime` (websocket), `apps/www` (marketing site), and the database
(PostgreSQL schema, row-level security, triggers, append-only ledgers).

### 2.2 Out of scope
- Features deliberately not built: AI chatbot, scholarships, bookstore, video lessons, debt / pay-later. Testers confirm they are **absent** (see the scope test in the plan below) but do not test them as features.
- Third-party systems' own correctness (Paymob, the WhatsApp provider, Resend, Cloudinary) beyond Edura's integration with them.
- Load testing against production. Performance testing runs only on an isolated environment.
- Any test that writes to the production database.

### 2.3 Platform and repository facts that shape testing

Every type below applies to this module. Cases are in tc.md; IDs are listed per type. The same environment rules as testenv.md apply: nothing runs against production and no load test leaves localhost.

#### Out of scope (deliberately not tested)

Chatbot and AI assistant, scholarships, bookstore, video lessons, pay-later (debt and credit), and the post-launch Next.js rendering and caching pass. Their absence is intentional (domain decisions, 2026-07-21). Nothing in PLT should be caching money, wallets, subscriptions, attendance, messaging, auth or per-user data; a test that finds such caching is a defect.

#### Test types

#### 1. Functional

- What to test: Each cron job's state change is correct and happens once; health states; locale routing.
- Why: Every cron job, health endpoint, internal endpoint and the PWA/i18n behaviours do what the requirement says.
- Affected modules: Platform-wide; calls into subscriptions, payments, notifications, statements.
- Scenarios: Run a job against known demo records and compare before and after; health with the database up and down.
- Expected results: State changes match BR-441 to BR-449; responses match api.md.
- Approach and tools: Manual plus Bruno collection; seeded `is_demo` records.
- Cases: TC-1176 to TC-1203

#### 2. UI

- What to test: Not-found page, error boundary, offline page, install prompt, ui-preview, tour pages (ui.md).
- Why: Pages owned by the platform render correctly.
- Affected modules: Platform; ERP shell.
- Scenarios: Open each in ar and en, at three viewport widths.
- Expected results: Real strings from ui.md, no clipped text, correct direction.
- Approach and tools: Manual with browser tools; Playwright for the stable ones.
- Cases: TC-1235, TC-1236, TC-1246, TC-1247

#### 3. UX / usability

- What to test: Message clarity when offline, retry button, behaviour after sync, dismissal of the install prompt.
- Why: Offline, install and error states must be understandable to counter staff on poor connections.
- Affected modules: PWA; attendance.
- Scenarios: Walk through the offline attendance flow as a teacher on a phone.
- Expected results: The user can tell what is queued and what is synced.
- Approach and tools: Heuristic review with real operators (operator audience note in project memory).
- Cases: TC-1235 to TC-1240

#### 4. API

- What to test: Request id, HEAD, OPTIONS, 405, 404, error envelope, status codes, headers.
- Why: The service chain contract is stable for every route.
- Affected modules: apps/api and apps/admin-api.
- Scenarios: Call each infrastructure route with valid and invalid input (api.md).
- Expected results: Status codes and bodies exactly as api.md.
- Approach and tools: Bruno collection `apps/erp/bruno`, curl, Bun test.
- Cases: TC-1176 to TC-1188, TC-1215 to TC-1217

#### 5. Integration

- What to test: ERP to api rewrite, back-office to ERP revalidate, chat-notify, GitHub scheduler to cron, mail, push, backup storage.
- Why: Services, schedulers and providers work together.
- Affected modules: All services; external providers in mock or sandbox mode.
- Scenarios: Trigger from one side and observe the other; stop the downstream and check the write still commits.
- Expected results: BR-475: no write fails because an integration fails.
- Approach and tools: Manual with local services; sandbox repository for workflows.
- Cases: TC-1206 to TC-1210, TC-1249, TC-1262

#### 6. Unit

- What to test: Cron auth, limiter, client IP, CSP builders, scrubbing, outbox partition, i18n parity.
- Why: Fast regression of the rules that have no database.
- Affected modules: apps/api, apps/admin-api, apps/erp, packages.
- Scenarios: Run the existing suites; add unit tests for the gaps in GAP-255.
- Expected results: 406 passed and 1 skipped (api), 58 passed (admin-api) as observed.
- Approach and tools: Bun test.
- Cases: See rtm.md existing tests

#### 7. System

- What to test: A day in the life: scheduler tick, user traffic, offline sync, backup.
- Why: The whole platform behaves as one.
- Affected modules: All.
- Scenarios: Run the smoke suite below on a deployed test environment.
- Expected results: Smoke suite green.
- Approach and tools: Manual with a checklist.
- Cases: Smoke suite

#### 8. Database

- What to test: Idempotency, no duplicate notification or statement rows, soft-delete respected, batches of 2 000 and 1 000.
- Why: Cron jobs and sweeps leave the database in a consistent state.
- Affected modules: Subscriptions, payments, data-rights, statements.
- Scenarios: Run each job twice and twice at once; count rows.
- Expected results: No duplicates; counts unchanged on the second run.
- Approach and tools: Read-only verification script, DB suites, SQL queries on the test database.
- Cases: TC-1190, TC-1196, TC-1202

#### 9. Authentication

- What to test: Cron secret, internal secret, proxy stamp, ssr-session, tenant host never offers sign-in.
- Why: Machine and session identity at the platform edge.
- Affected modules: api, admin-api, ERP.
- Scenarios: Wrong, missing, empty and valid secrets.
- Expected results: Only valid secrets pass; fail closed when unset.
- Approach and tools: Bruno, curl.
- Cases: TC-1184 to TC-1188, TC-1207, TC-1213, TC-1224, TC-1232

#### 10. Authorization / RBAC

- What to test: permissions.md matrix; tour pages by role; ui-preview in production; cron and internal endpoints are not role based.
- Why: The tour pages and developer pages must not be open to the wrong role.
- Affected modules: ERP.
- Scenarios: Open each page as every role and signed out.
- Expected results: Matches the matrix; unknown cells reported (Q-128).
- Approach and tools: Manual with the test accounts; Playwright role-guard spec as a model.
- Cases: TC-1247, TC-1248

#### 11. Security

- What to test: CSP and nonce, HSTS, header spoofing, rate limits, secret comparison, error leakage, tenant host, scrubbing, backup encryption.
- Why: Platform controls protect every service.
- Affected modules: All.
- Scenarios: Header inspection, forged headers, flood tests, malformed bodies.
- Expected results: No bypass; no secret or personal data in logs or responses.
- Approach and tools: curl, browser tools, OWASP checklist, owasp-security skill.
- Cases: TC-1180, TC-1188, TC-1212, TC-1217, TC-1223 to TC-1233

#### 12. Performance

- What to test: Health response time, DB probe timeout of 8 000 ms, cron job duration for the batch sizes.
- Why: Health and cron endpoints respond quickly under normal load.
- Affected modules: api, database.
- Scenarios: Time the health call and each job on the load database.
- Expected results: No numeric targets exist (Q-134); record baselines.
- Approach and tools: k6 against localhost, server logs.
- Cases: TC-1176, TC-1263

#### 13. Load

- What to test: Health and public routes at peak, rate limiter under load.
- Why: Find behaviour at expected peak.
- Affected modules: api, Redis.
- Scenarios: The harness in `tests/load` with the load database.
- Expected results: Targets UNKNOWN; compare with 2026-09-20 report.
- Approach and tools: k6, localhost only.
- Cases: TC-1263

#### 14. Stress

- What to test: Pool exhaustion, limiter breaker, memory fallback.
- Why: Find the breaking point and the failure mode.
- Affected modules: api, database, Redis.
- Scenarios: Raise the rate until errors appear; stop Redis mid-run.
- Expected results: Failure is graceful (429/503), the service recovers.
- Approach and tools: k6, localhost only.
- Cases: TC-1220

#### 15. Spike

- What to test: Cron batch plus user traffic at the same moment.
- Why: Sudden bursts such as a Monday-morning digest tick and a start-of-class check-in.
- Affected modules: api, database.
- Scenarios: Run jobs while traffic ramps.
- Expected results: No lost writes, health stays 200.
- Approach and tools: k6 with a scenario script.
- Cases: TC-1263

#### 16. Endurance

- What to test: Memory of the rate limiter buckets, connection pool, service worker cache growth.
- Why: Detect leaks over time.
- Affected modules: api, ERP.
- Scenarios: Hours-long run on the load environment.
- Expected results: Flat memory and pool use; cache stays within its 150 entries.
- Approach and tools: k6, process metrics.
- Cases: UNKNOWN, no target defined

#### 17. Compatibility

- What to test: Service worker, install, push, CSP nonce, RTL.
- Why: Behaviour across browsers and OS.
- Affected modules: ERP.
- Scenarios: Chrome, Safari iOS, Firefox, Android; versions UNKNOWN (Q-137).
- Expected results: Core flows work; known limits recorded (SVG icons).
- Approach and tools: BrowserStack or real devices.
- Cases: TC-1236, TC-1237

#### 18. Responsive

- What to test: Error pages, offline page, install prompt.
- Why: Layouts hold at phone, tablet, desktop.
- Affected modules: ERP.
- Scenarios: 375, 768 and desktop widths in ar and en.
- Expected results: No horizontal scroll, readable text.
- Approach and tools: Browser resize.
- Cases: TC-1235, TC-1246

#### 19. Accessibility

- What to test: Error pages, offline page, install prompt (focus, labels, contrast, language and direction attributes).
- Why: Platform pages are usable with assistive tech.
- Affected modules: ERP.
- Scenarios: Keyboard-only pass, screen reader pass, axe scan.
- Expected results: No critical axe violations; correct lang and dir.
- Approach and tools: axe, screen reader, accessibility-review skill.
- Cases: TC-1245, TC-1246

#### 20. Regression

- What to test: The core list below.
- Why: Stop old defects from returning.
- Affected modules: All.
- Scenarios: Run after every change to server-core, service-kit, headers or workflows.
- Expected results: All green.
- Approach and tools: CI plus the smoke suite.
- Cases: Regression core

#### 21. Smoke

- What to test: See the smoke suite below.
- Why: Fast proof the deployment is alive.
- Affected modules: All.
- Scenarios: Run after each deploy.
- Expected results: All steps pass.
- Approach and tools: Manual or scripted curl.
- Cases: Smoke suite

#### 22. Sanity

- What to test: Only the touched route or job.
- Why: Quick check after a narrow fix.
- Affected modules: Varies.
- Scenarios: Re-run the one case and its negative twin.
- Expected results: Fix holds, nothing else moved.
- Approach and tools: Manual.
- Cases: As touched

#### 23. Exploratory

- What to test: Odd ids, odd headers, odd host names, clock changes, repeated clicks, interrupted syncs.
- Why: Find what the cases did not think of.
- Affected modules: All.
- Scenarios: Time-boxed sessions with a charter per area.
- Expected results: New defects logged with evidence.
- Approach and tools: Manual.
- Cases: None, unscripted

#### 24. Error handling

- What to test: DB down, Redis down, mail down, scrubber throws, one export fails, month-end swallow (GAP-238).
- Why: Failures produce the documented response and no damage.
- Affected modules: All.
- Scenarios: Stop each dependency in the test environment.
- Expected results: 503/429/422 as documented; no stack traces; no partial writes.
- Approach and tools: Manual with service stops.
- Cases: TC-1177, TC-1179, TC-1192, TC-1203, TC-1217, TC-1220

#### 25. UAT

- What to test: Timezone of daily jobs, expiry timing, month-end failure handling, outbox after logout, tour pages, www CSP.
- Why: The owner confirms the operational behaviour is what the business wants.
- Affected modules: All.
- Scenarios: Walk the owner through Q-PLT questions with real outputs.
- Expected results: Each Q-PLT answered and recorded.
- Approach and tools: Workshop.
- Cases: Q-125 to Q-138

#### 26. Backup and recovery

- What to test: Nightly backup, retention, weekly restore test, timed drill, PITR, runbook accuracy.
- Why: Data can be restored within an acceptable time.
- Affected modules: Backup workflows, database, storage.
- Scenarios: Run on a copy; compare with the runbook.
- Expected results: Verification script passes on the restored copy; times recorded.
- Approach and tools: Workflows, restore scripts, verify-db read-only script.
- Cases: TC-1256 to TC-1260

#### Smoke suite

Run after every deploy, in order. Each step names the role. Stop at the first failure. Passwords: see docs/guides/test-credentials.md.

1. Public: GET the api health through the ERP host; expect 200 and db up.
2. Public: GET the back-office health; expect 200.
3. Public: GET /api/v1/_ping; expect ok true.
4. Public: HEAD the health route; expect the same status with no body.
5. Public: POST a cron job with no secret; expect 401.
6. Public: POST revalidate with no internal secret; expect 403.
7. Public: open the ERP root; expect a redirect to an Arabic locale page, right to left.
8. Public: open /ar/does-not-exist; expect the localized not-found page.
9. Public: open /ar/ui-preview on production; expect 404.
10. Public: check response headers for the CSP with nonce, HSTS and nosniff.
11. Public: GET the realtime /healthz; expect 200.
12. Public: open the www home page; expect it loads.
13. Student (lina.hassan@student.nile-academy.eg): sign in; the dashboard loads in Arabic.
14. Student: GET ssr-session; expect the user and no-store.
15. Parent (mona.hassan@email.eg): sign in; the dashboard loads.
16. Teacher (hossam.aziz@nile-academy.eg): sign in; open the sessions page; mark attendance for one student.
17. Teacher: go offline, mark one more, go online; expect the row to sync within a minute.
18. Center admin (admin@nile-academy.eg): sign in; the counter board loads.
19. Center admin: switch language to English; the page is left to right with no raw keys.
20. Teacher: log out; Cache Storage is cleared of non-static entries.
21. Back-office super admin (email UNKNOWN): sign in; ssr-session shows only the id and 2FA flag.
22. Scheduler: the last run of each of the nine cron jobs in Actions is green (read only).
23. Backup: the latest nightly backup run is green and the latest restore test is green (read only).
24. Monitoring: the last deploy has no new error spike in the monitoring dashboard.

#### Regression core

Run on every change to packages/server-core, packages/service-kit, security headers, workflows or the service worker.

- Cron: TC-1184 to TC-1188 (auth), TC-1189, TC-1194, TC-1195, TC-1197, TC-1201 (job outcomes and once-only), TC-1204.
- Health and limiter: TC-1176 to TC-1179, TC-1218 to TC-1220, TC-1223, TC-1224.
- Boot safety: TC-1221, TC-1222, TC-1251.
- Service chain: TC-1215 to TC-1217, TC-1264.
- Headers and monitoring: TC-1226 to TC-1228, TC-1233.
- Tenant host: TC-1231.
- PWA and offline: TC-1238, TC-1239, TC-1241.
- Locale: TC-1243, TC-1245, TC-1246.
- Existing unit suites in apps/api, apps/admin-api and apps/erp (rtm.md).

## 3. Testing Types
For each type: what is tested, why, the modules involved, example scenarios, expected results and the
approach. Test-case counts by type are in §3.27.

### 3.1 Functional testing
- **What:** each FR's expected behaviour, inputs, outputs and success scenario.
- **Why:** confirms the product does what the PRD says.
- **Modules:** all.
- **Scenarios:** create a walk-in student; schedule a session; check in at the counter; record a cash payment; send a collaboration request; parent pays for a child; super admin suspends a user.
- **Expected:** output, status codes, persisted rows and UI state as written in each test case.
- **Approach:** manual via UI plus API calls (Bruno collection in `apps/erp/tests/bruno` or any HTTP client) for the server-side checks.

### 3.2 Smoke testing
- **What:** the minimal set that proves a build is testable: each role logs in and lands on its dashboard; health endpoints respond; one online (mock) payment; one counter check-in; one back-office login with 2FA.
- **Why:** reject broken builds before spending test effort.
- **Modules:** Authentication, Platform, Payments, Courses/Sessions/Attendance, Super Admin.
- **Expected:** all pass in under one test session; any failure blocks further testing.
- **Approach:** run the existing automated smoke (`apps/erp/tests/e2e/smoke.e2e.ts`, `smoke:api` script) then the manual checks. Critical-priority test cases tagged Workflow per role form the manual smoke.

### 3.3 Sanity testing
- **What:** after a fix, the fixed area plus its immediate neighbours.
- **Why:** confirms a fix works without a full regression.
- **Approach:** re-run the failed test case and the test cases sharing its FR in the RTM.

### 3.4 Regression testing
- **What:** all Critical and High test cases on every release candidate; the full suite before launch.
- **Why:** money, permissions and attendance have many cross-module links; a change in one breaks another.
- **Approach:** automated suites first (§5.3), then manual Critical/High cases not automated (the RTM shows which FRs have automated coverage).

### 3.5 Integration testing
- **What:** module-to-module and system-to-system hand-offs: session completion → revenue distribution → wallet; walk-in registration → WhatsApp link → onboarding; collaboration acceptance → class + schedule; payment webhook → subscription; ERP → realtime notification; back-office "view as" → ERP session.
- **Why:** most money and identity defects sit on boundaries.
- **Expected:** both sides of each hand-off show consistent data.
- **Approach:** workflow test cases (Test Type = Integration or Workflow) with DB verification queries run read-only against the test database.

### 3.6 System testing
- **What:** the full deployed stack (ERP, back-office, both APIs, realtime, database, integrations in sandbox) as one system.
- **Approach:** execute end-to-end workflows of PRD §6 on a staging deployment that mirrors production configuration.

### 3.7 End-to-end testing
- **What:** complete user journeys across roles: a new student's first month (walk-in → onboarding → subscription → 4 sessions → attendance → grades → parent view → payout to teacher → back-office reconciliation).
- **Approach:** scripted scenarios built from PRD §6 workflows; Playwright suites in `apps/erp/tests/playwright` cover parts of this and can be extended.

### 3.8 UI testing
- **What:** every page in PRD §11: layout, navigation, forms, tables, filters, pagination, loading/empty/error states, confirmation dialogs.
- **Why:** the real operators are front-desk staff; an error that looks like an empty state hides money problems.
- **Expected:** strings match the catalogs; error states differ from empty states.
- **Approach:** manual walk-through per role in Arabic and English.

### 3.9 UX testing
- **What:** task completion time and error rate for the counter's daily tasks (check-in, cash payment, walk-in registration), clarity of Arabic copy, discoverability of actions.
- **Approach:** observed sessions with representative counter staff; collect qualitative findings. No numeric targets are specified in the project — agree them with the Product Owner first.

### 3.10 API testing
- **What:** every endpoint in PRD §9: auth requirement, method, validation, success envelope, error envelope and codes, idempotency, pagination.
- **Approach:** HTTP client (Bruno collection or equivalent) with sessions for each role; include requests with missing/invalid fields, wrong types, extra fields, oversized bodies and other tenants' IDs.

### 3.11 Database testing
- **What:** constraints, triggers, row-level security, append-only ledgers, soft-delete, `is_demo` flagging, migrations.
- **Why:** several invariants (ledger immutability, tenant isolation) are enforced in the database itself.
- **Approach:** read-only verification queries on the **test** database; the project's DB suites (`test:db` in each app) exercise many of these and should be run on the test database only. Never run against production.

### 3.12 Security testing
See §4 for the full security focus. Covers authentication, sessions, token handling, injection, XSS, CSRF, uploads, rate limiting, security headers/CSP, secrets exposure, webhook signature verification.

### 3.13 Authorization and permission testing
- **What:** every row of the permission matrices in PRD §3.2 — each allowed role succeeds, each denied role is refused (UI hidden **and** API refused).
- **Approach:** for each action, call the endpoint with a session of every role, plus anonymous. Expected refusal is the status/error code in the test case (typically 401 unauthenticated, 403 forbidden, 404 when existence must not be revealed).

### 3.14 Role-based access testing
- **What:** each role's portal gate: a user can open only their own dashboard; switching URLs to another role's dashboard redirects or refuses; centre staff sub-roles see only what their sub-role allows; assistants act only within their employing teacher's scope; shell (external) teachers cannot log in.
- **Approach:** per-role navigation tests (`role-guard.spec.ts`, `render-gates.spec.ts` exist and are a starting point).

### 3.15 Data validation testing
- **What:** every field's validation rule in the PRD FRs (lengths, formats, enums, money precision, Egyptian phone and national-ID formats, dates).
- **Approach:** boundary values (min-1, min, max, max+1), wrong types, empty, whitespace-only, Arabic and mixed-script text, Arabic-Indic digits, emoji.

### 3.16 Negative testing
- **What:** invalid input, invalid state transitions, missing resources, expired links/tokens, repeated submissions, operations on suspended/soft-deleted records.
- **Expected:** a clear error, no partial writes, no money movement.

### 3.17 Boundary testing
- **What:** limits found in code (rate limits, page sizes, max lengths, amount limits, time windows such as the 60-second view-as handoff and one-hour view-as session, session start/end times, day boundaries in Africa/Cairo).
- **Approach:** test exactly at, just below and just above each limit.

### 3.18 Performance testing
- **What:** response times of the busiest endpoints (counter check-in, counter board, dashboards, search), page load of the heaviest screens.
- **Why:** the counter has bursts at the start of each class hour.
- **Approach:** the project has a load-test harness in `tests/load`; run it only on an isolated environment. Targets are **not** specified in the code — record measurements and agree thresholds with the Product Owner (see open questions).

### 3.19 Load testing
- **What:** expected peak: many counters checking in concurrently across centres; many parents paying near due dates.
- **Approach:** ramp to an agreed concurrent-user count on the isolated environment; watch error rate, p95 latency and database connection usage. A previous internal load test found a nested-transaction pool deadlock pattern — include concurrent money writes in the load mix.

### 3.20 Stress testing
- **What:** behaviour beyond the agreed peak and recovery afterwards (database connection exhaustion, provider timeouts).
- **Expected:** graceful errors, no partial money writes, recovery without manual repair.

### 3.21 Compatibility testing
- **What:** browsers and devices used by the target audience.
- **Matrix (recommendation — confirm with the Product Owner):** Chrome (Android, Windows), Safari (iOS, macOS), Edge (Windows), Firefox (desktop); the PWA installed on Android and iOS; low-end Android devices typical at counters.

### 3.22 Responsive testing
- **What:** every page at phone (≈375 px), tablet (≈768 px) and desktop widths, in both RTL (Arabic) and LTR (English).
- **Expected:** no horizontal page scroll, tables usable (scroll inside their container or collapse), dialogs fit the viewport, touch targets usable.

### 3.23 Accessibility testing
- **What:** keyboard navigation, focus order in RTL, visible focus, labels on form fields, colour contrast, screen-reader names for icon buttons, `lang`/`dir` attributes per locale.
- **Approach:** automated scan (axe or Lighthouse) per page plus a manual keyboard and screen-reader pass on the counter and parent flows. No WCAG level is specified in the project — WCAG 2.1 AA is a recommendation.

### 3.24 Usability testing
- **What:** whether counter staff, teachers and parents can complete their top tasks without help.
- **Approach:** moderated sessions with representative users; report findings, not pass/fail, unless the Product Owner sets targets.

### 3.25 Localization / Arabic RTL testing
- **What:** every string translated in both catalogs; no English leaking into the Arabic UI or vice versa; RTL layout mirroring; numbers, currency (EGP) and dates formatted per locale; Arabic-Indic and Latin digit input accepted where numbers are typed; Arabic search (with and without diacritics, alef/ya/ta-marbuta variants) where search exists; PDF/CSV exports render Arabic correctly.
- **Approach:** walk every page in `/ar` and `/en`; feed Arabic data into every free-text field; open exports in Excel and a PDF viewer.

### 3.26 User Acceptance Testing (UAT)
- **What:** representative centre admin, counter staff, teacher, parent and student run their real daily scenarios on staging with realistic demo data.
- **Exit:** written sign-off per role; every UAT defect triaged.

### 3.27 Test-case distribution
| Priority | Test cases |
|---|---|
| Critical | 495 |
| High | 548 |
| Medium | 260 |
| Low | 44 |

| Test type | Test cases (a case can carry several types) |
|---|---|
| Functional | 563 |
| Negative | 277 |
| Security | 207 |
| API | 109 |
| UI | 90 |
| Boundary | 86 |
| Authorization | 70 |
| Database | 70 |
| Integration | 51 |
| Workflow | 21 |
| Concurrency | 15 |
| Integrity | 12 |
| Money | 12 |
| Audit | 10 |
| Database (seed | 10 |
| purge) | 10 |
| Validation | 9 |
| Configuration | 9 |
| Data integrity | 8 |
| Data Integrity | 5 |
| Reconciliation | 5 |
| Resilience | 5 |
| Exploratory | 4 |
| Regression | 4 |
| Performance | 3 |
| Child safety | 3 |
| Idempotency | 3 |
| UNCLEAR | 3 |
| Backup | 3 |
| Error handling | 2 |
| Smoke | 2 |
| Database (automated suite) | 2 |
| Data integrity (DB | 1 |
| read-only verification + a rolled-back attempt by a DBA) | 1 |
| Privacy | 1 |
| PWA | 1 |
| Compatibility | 1 |
| Recovery | 1 |
| Documentation | 1 |

## 4. Security Testing Focus
Every item below has test cases in `DETAILED_TEST_CASES.md` (Test Type = Security or Authorization)
unless `OPEN_QUESTIONS_AND_GAPS.md` lists it as a coverage gap. All security testing is limited to the
supplied project and its test environment.

| Area | What to test |
|---|---|
| Unauthorized access | Every non-public endpoint without a session returns the unauthenticated error; every page redirects to sign-in. |
| Horizontal privilege escalation | Replace IDs in URLs and bodies with another centre's / teacher's / parent's / student's IDs: students, sessions, payments, wallets, invoices, messages, reports, exports, files. Expect refusal or not-found, never data. |
| Vertical privilege escalation | Lower roles calling higher-role endpoints (student → teacher, staff → centre admin, assistant → teacher-only actions, any ERP role → back-office API, accountant → super-admin-only actions such as refunds). |
| Direct API bypass | Actions hidden in the UI attempted directly against the API; client-side validation bypassed with crafted requests. |
| Session handling | Logout invalidates the session; password change and suspension invalidate existing sessions (token version); back-office and ERP cookies do not cross; session cookie flags (HttpOnly, Secure, SameSite). |
| Token handling | Invite, onboarding, password-reset and email-verification tokens: single use, expiry, tampering, reuse after success; view-as handoff token 60 s single target; card QR grants no session. |
| Password security | Minimum rules, reset flow does not reveal account existence, rate limits on sign-in and reset, 2FA enforcement for back-office roles. |
| Input validation / injection | SQL-like payloads in every search and filter; JSON type confusion; oversized payloads; Unicode edge cases. |
| XSS | Script payloads in names, messages, notes, reviews, centre profiles, file names; rendered in every place they appear (lists, PDFs, exports, notifications, emails). |
| CSRF | State-changing requests from a foreign origin with the victim's cookie must fail (check SameSite and origin checks). |
| File uploads | Type and size limits; executable or HTML disguised as images; SVG with script; path traversal in names; access to another tenant's file URL. |
| Rate limiting | Every rate-limited endpoint at its limit + 1; limit keyed per IP/user as implemented. |
| Data exposure | API responses do not return password hashes, tokens, other users' PII, internal IDs not needed; error messages do not leak stack traces; exports include only in-scope rows. |
| Security headers | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CSP (and the CSP report endpoint) on ERP, back-office and www. |
| Webhooks and machine endpoints | Paymob webhook with bad / missing HMAC, replayed or out-of-order events; cron endpoints without or with a wrong secret; realtime internal endpoints without the internal secret. |
| Secrets | No secrets in client bundles, page source, error responses or logs reachable by users. |

## 5. Test Environment

### 5.1 Environments
| Environment | Use | Rule |
|---|---|---|
| Local | Developer and automated unit/DB suites | Local test database by default |
| Test (dedicated database, labelled `edura-env:test`) | DB suites and API/integration testing | Safe to write, seed and wipe |
| Staging (recommended) | System, E2E, UAT, performance | Must use sandbox/mock integrations and its own database — **UNKNOWN whether a staging deployment exists; see open questions** |
| Production | **No testing.** Read-only smoke after deploy only, with Product Owner approval | Never seed, write or load-test |

Every claim a tester records about data ("seeded", "wiped", "present") must name the environment.

### 5.2 Environment configuration (names only — values are held by the project owner)

Environment names follow the repository convention: dev, test, production, each labelled `edura-env:<env>`. Every result must say which one it was run in. No test in this module may write to production. No value of any variable is recorded here, only names.

#### Environments

| Environment | Use for this module | Notes |
|---|---|---|
| Local test (`edura_test` database, created by `packages/database/scripts/local-test-db.sh`) | Cron jobs, health, rate limiter, headers, the database suites | The ERP needs `apps/erp/.env.test`. The api and admin-api unit suites need no database. |
| CI | Regression of lint, type check, unit and database suites | Postgres 17, application role `edura_app` without RLS bypass (`.github/workflows`). CI database credentials are not copied into this document. |
| Local load (`edura_load` database) | Load, stress, spike, endurance | The harness in `tests/load` is localhost-only and uses k6. Never run it against Vercel, Neon or any shared host (`docs/reports/load-test-2026-09-20.md`). |
| Neon test (`db:neon:env` only) | Transport-level checks | Not the default test database. Needs the owner's go-ahead. |
| Deployed hosts (`edura-erp`, `edura-superadmin`, `edura-www` on Vercel) | Smoke, headers, PWA, tenant host, locale | Read-only checks unless the product owner agrees a data-writing run. `app.edura.eg` is not in use. |
| Production | Never for destructive or load tests | Backup and restore drills run on a copy. |

#### Services and ports

| Service | Where | Notes |
|---|---|---|
| apps/api (Hono on Bun) | `PORT`; URL in `API_SERVICE_URL` | 250 routes |
| apps/admin-api | URL in `ADMIN_API_SERVICE_URL` | 212 routes |
| apps/erp, apps/superadmin, apps/www (Next.js) | local dev servers | Base URLs `ERP_BASE_URL`, `SUPERADMIN_BASE_URL`, `APP_BASE_URL` |
| apps/realtime (websocket) | `REALTIME_PORT`; `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_INTERNAL_URL` | health at `/healthz` |
| Redis | `REDIS_URL` | Needed for shared rate limiting. Without it, `ALLOW_UNSHARED_RATE_LIMIT` is the only way past the production boot check. Use only in a throwaway run. |

Start servers through the project's own dev scripts (Bun only; never npm, pnpm or yarn). Versions: Bun 1.4.0 or newer.

#### Browsers and devices

- Desktop: current Chrome and Chromium (the Playwright suites use both). Safari and Firefox: UNKNOWN, browser and device matrix not defined (Q-137).
- Mobile: Android Chrome for install and push; iOS Safari for the Add to Home Screen path (icons are SVG only, GAP-240).
- Viewports: 375 wide phone, 768 tablet, desktop. Right-to-left (ar) and left-to-right (en) for each.
- Developer tools needed: Application tab (manifest, service worker, Cache Storage, IndexedDB `edura-offline`), Network offline switch, console for CSP violations.

#### External integrations and their test modes

| Integration | Mode variable | Test setting | Notes |
|---|---|---|---|
| Paymob | `PAYMENTS_MODE` (mock, sandbox, live) | mock or sandbox | `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` only in sandbox. Never live. |
| Email (Resend) | `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_REPLY_TO` | `console` writes mail to the log instead of sending | Production uses the Resend HTTP API. Docs still mention another provider (GAP-245). The `?deep=mail` probe needs the cron secret. |
| WhatsApp (Meta Cloud API) | `WHATSAPP_MODE` | mock | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_API_VERSION` only for a real send; none is needed for this module. |
| SMS | `SMS_PROVIDER` | mock or unset | |
| Cloudinary | `MEDIA_MODE`; `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | mock mode | Not exercised by PLT cases except as a header (CSP image sources). |
| Web push | `PUSH_MODE`; `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FIREBASE_SERVICE_ACCOUNT_JSON` | mock mode, plus a real browser for subscription | Without the public key, subscribing returns false (TC-1240). |
| Notification channels | `NOTIFICATION_CHANNELS`, `INVITE_CHANNELS` | restrict to in-app for tests | |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PROJECT_SUPERADMIN`, `SENTRY_AUTH_TOKEN` | a test project | Alert recipients are UNKNOWN (Q-138). |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | unset, or the proxy at `/ingest` | |
| Backup storage (Backblaze B2 or S3) | `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY`, `BACKUP_DIRECT_URL`, `BACKUP_ALERT_EMAIL`, `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` | a test bucket and a non-production database | Never point `BACKUP_DIRECT_URL` at production for a test. |
| GitHub Actions | `CRON_BASE_URL`, `CRON_SECRET` as repository secrets | a sandbox repository | The scheduler cannot be exercised from a developer machine. |

#### Variable names used by this module

- Secrets: `CRON_SECRET`, `INTERNAL_API_SECRET`, `EDURA_PROXY_SECRET`, `REALTIME_JWT_SECRET`, `STUDENT_QR_SECRET`, `VIEW_AS_SECRET`, `NEXTAUTH_SECRET`, `SUPERADMIN_NEXTAUTH_SECRET`.
- Auth and URLs: `NEXTAUTH_URL`, `PUBLIC_ROOT_DOMAIN`.
- Client IP and rate limiting: `TRUSTED_CLIENT_IP_HEADER`, `TRUSTED_PROXY_HOPS`, `REDIS_URL`, `ALLOW_UNSHARED_RATE_LIMIT`, `RATE_LIMIT_DEBUG`.
- Database: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_URL`, `DATABASE_DRIVER`, `DATABASE_POOL_MAX`, `EDURA_ENV`, `EDURA_SERVICE_BINDINGS`.
- Behaviour: `CSP_MODE`, `PLATFORM_TIME_ZONE`, `SERWIST_DISABLE`, `SERWIST_DEV`.
- Timings: `INVITE_TOKEN_TTL_HOURS`, `WALKIN_TOKEN_TTL_HOURS`, `GUARDIAN_EMAIL_GRACE_DAYS`, `GUARDIAN_REMINDER_EVERY_DAYS`.

#### Test accounts (role and email only; password: see docs/guides/test-credentials.md)

| Role | Email |
|---|---|
| Center admin | admin@nile-academy.eg |
| Teacher | hossam.aziz@nile-academy.eg, hana.rashidi@nile-academy.eg, nourhan.mostafa@nile-academy.eg, kareem.salah@nile-academy.eg |
| Student | lina.hassan@student.nile-academy.eg, ahmed.mostafa@student.nile-academy.eg, sara.elsayed@student.nile-academy.eg, omar.khaled@student.nile-academy.eg |
| Parent | mona.hassan@email.eg (parent of Lina), tarek.mostafa@email.eg (parent of Ahmed) |
| Super admin | UNKNOWN, not in the credentials guide |
| Accountant | UNKNOWN, not in the credentials guide |
| Assistant | UNKNOWN |

Some accounts need two-factor login in the local setup; the recipe is in the project's dev workflow notes.

#### Tools

Bun test runner (unit), Playwright (end to end), k6 (load), Bruno collection `apps/erp/bruno` (API), curl for header checks, browser developer tools for PWA, the read-only `packages/database/scripts/verify-db.ts` for state checks.

#### Blockers and unknowns

1. The parity suites and every database suite were NOT run during analysis; they need `edura_test` and `.env.test`. Results in rtm.md for those suites come from reading the files.
2. The cron scheduler, the backup and restore workflows and the deployment guard can be tested only in a sandbox repository or by reading run history; the run history was not accessible.
3. Neon point-in-time recovery window and the B2 lifecycle rules cannot be seen from the repository (GAP-254).
4. A second api instance and a shared Redis are needed for the shared-limiter and concurrency cases (TC-1219).
5. Superadmin and accountant emails are not documented (Q-128 context).
6. A controllable clock is needed for time-based cron cases (reminder intervals, 7-day export expiry, 14-day prompt dismissal).
7. The monitoring alert configuration cannot be inspected (GAP-259).

### 5.3 Existing automated tests
The repository already contains automated suites. Run them before manual testing to avoid duplicating
covered checks; they do not replace this plan. Per-module coverage notes:

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

### 5.4 Test accounts
Use only the seeded demo accounts (all flagged `is_demo = true`) in non-production environments. Never use
real customer accounts or production credentials.

Two seed sets create accounts (see §6 for the seed scripts and their guards):

**Main demo seed** (`packages/database/prisma/seed.ts`, all `is_demo = true`):

Two seed sets create accounts (see §6 for the seed scripts and their guards):

**Main demo seed** (`packages/database/prisma/seed.ts`, all `is_demo = true`):

| Role | Account (email) |
|---|---|
| center_admin | `admin@nile-academy.eg` |
| teacher | `hossam.aziz@nile-academy.eg` |
| assistant | `sara.fawzy@nile-academy.eg` |
| student | `lina.hassan@student.nile-academy.eg` |
| parent | `mona.hassan@email.eg` (parent of Lina Hassan) |
| super_admin, accountant | the addresses set in the seed's `SEED_SUPERADMIN_EMAIL` / `SEED_ACCOUNTANT_EMAIL` variables (ask the project owner) |

**UAT seed** (`packages/database/prisma/uat-seed.ts`, centre `UATC`, accounts `<key>@uat.edura.eg`):
`owner` (center_admin); `reception`, `manager`, `cashier` (center_staff sub-roles receptionist, manager,
center_accountant); `teacher1`, `teacher2`; `assistant`; `parent1` (two children), `parent2` (one child);
`student1`, `student2`; `student3` (no guardian — for the minor messaging gate). Its password is generated at
run time and written to the operator's local machine, not to the repository.

**Known discrepancy:** `docs/guides/test-credentials.md` also lists teachers `hana.rashidi@`,
`nourhan.mostafa@`, `kareem.salah@`, students `ahmed.mostafa@`, `sara.elsayed@`, `omar.khaled@` and parent
`tarek.mostafa@` — **no seed in the repository creates these seven accounts**, so their logins fail on a
freshly seeded database; and the guide omits the seeded assistant. See the data-model gaps in
`OPEN_QUESTIONS_AND_GAPS.md`.

**Still to provision:** an external (shell) teacher, an adult student with a verified date of birth, and a
second, independent centre with its own staff, teachers, parents and students. Horizontal-escalation tests
need two tenants: the main demo centre and the UAT centre can serve as the pair if both seeds are loaded in
the same test database.

Passwords: see `docs/guides/test-credentials.md` (held by the project owner; not reproduced here). The
guide may lag behind the current seed scripts — confirm each account logs in before a test cycle.

## 6. Test Data Preparation and Cleanup

This file covers what each seed creates, how to prepare and clean test data, and which environment to use. It contains no passwords, keys, hosts or connection strings.
- **Logins:** accounts are listed by role and email only. Password: see docs/guides/test-credentials.md.
- **UAT accounts:** the password is generated at run time and written to the operator's local `~/.edura-env/uat-accounts.md` (packages/database/prisma/uat-seed.ts:351-366, :418).

#### 1. Environments

There are three environments. Each database carries its own label as a database COMMENT, `edura-env:<env>`. The scripts check this label before they write anything.

| Environment | Label | Use in QA | Rule |
|---|---|---|---|
| test | `edura-env:test` | **The only database the TCs in this module touch.** It is a LOCAL database `edura_test`, built by `packages/database/scripts/local-test-db.sh` (`db:local`; `db:local:reset` rebuilds it from nothing). There is also a hosted test branch, reachable only via `db:neon:env`. Do not use it for this module. | The DB suites refuse to run without the label (local-test-db.sh header) |
| dev | `edura-env:dev` | Developer preview with demo seeds. Not a QA target for SQL TCs. | `EDURA_ENV` unset means dev (packages/database/scripts/load-env.ts:70) |
| production | `edura-env:production` | Never a QA target. No TC in this module runs against it. | seed.ts writes only catalog + platform staff there. Demo and HTTP money seeds refuse it. |

**The EDURA_ENV rule (binding):** every Prisma command or script aimed at a database other than dev starts with `EDURA_ENV=<env>` and is run with `npx tsx` / `npx prisma`. Never use `bun run db:*`, which reaches dev whatever `EDURA_ENV` says (load-env.ts:33-34). Read the `Datasource … at "<host>"` line Prisma prints and confirm the environment before trusting anything below it. Several `seed:*` package scripts hard-code `--env-file=.env.local` (packages/database/package.json:100-110). Call the seed file directly with `EDURA_ENV=test npx tsx prisma/<seed>.ts` instead.

#### 2. Preparing the test database (WF-116)

1. Run `db:local` (or `db:local:reset`). This creates `edura_test`, labels it `edura-env:test`, and creates the NOBYPASSRLS role `edura_app` **before** any table exists, then applies the 82 migrations. Order matters: see GAP-262.
2. Run `EDURA_ENV=test npx tsx prisma/seed.ts`. It adds the catalog, the points rules, the platform staff and the NILE demo center (section 3).
3. Run `EDURA_ENV=test npx tsx scripts/verify-db.ts` (read-only). Expect 84 tables, 6 sequences, 41 RLS tables, 62 policies and 82 migrations (TC-1334).
4. Optional: run only the demo seed a TC names (section 4).

#### 3. Base seed — `packages/database/prisma/seed.ts`

| Item | Non-production (dev / test) | Production label or `--no-demo` | Evidence |
|---|---|---|---|
| Egyptian education catalog (systems, stages, grades, tracks, subjects, offerings) | Yes | Yes | seed-catalog.ts |
| Points rules | 7 active rules: attendance 10, cash_payment 20, first_booking 50, lesson_booking 5, online_payment 20, streak_bonus 25, teacher_rating 15 | Same 7 | seed.ts:107-124 |
| Platform staff | 1 super_admin + 1 accountant. Emails from `SEED_SUPERADMIN_EMAIL` / `SEED_ACCOUNTANT_EMAIL`, or the fallbacks `superadmin@edura.eg` / `accountant@edura.eg` | Same 2, but the SEED_* variables are **required** (it refuses if one is missing) | seed.ts:20-34, :95-104 |
| Password | From `SEED_PASSWORD`. When SEED_PASSWORD is unset, it falls back to a built-in default password (GAP-271) | From `SEED_PASSWORD` | seed.ts:8 |
| Demo center | `NILE` (is_demo), with center admin profile, 2 public handles, 1 affiliation, 1 course, 1 enrollment | Not created | seed.ts:125-340 |
| Demo accounts (is_demo) | center_admin `admin@nile-academy.eg`; teacher `hossam.aziz@nile-academy.eg`; assistant `sara.fawzy@nile-academy.eg`; student `lina.hassan@student.nile-academy.eg` (on the NILE roster); parent `mona.hassan@email.eg` (linked to Lina) | Not created | seed.ts:45-340 |
| Refusal | Refuses a database with no `edura-env:` label | — | seed.ts:12-18 |

**docs/guides/test-credentials.md** lists the logins testers use. The guide lists 1 center admin, 4 teachers, 4 students and 2 parents. **Only `admin@`, `hossam.aziz@`, `lina.hassan@` and `mona.hassan@` are created by any seed in the repo.** These are not created by any seed found:
- teachers: hana.rashidi@, nourhan.mostafa@, kareem.salah@
- students: ahmed.mostafa@, sara.elsayed@, omar.khaled@
- parent: tarek.mostafa@

Also, the assistant `sara.fawzy@` is seeded but missing from the guide (GAP-275).

#### 4. Demo seeds (`packages/database/prisma/*-demo-seed.ts` and fixtures)

Every demo seed below:
- flags its root rows `is_demo = true` and uses deterministic UUIDv5 ids (seed-ids.ts)
- refuses an unlabelled or production database
- supports `--purge`, which deletes exactly the ids it created

| Seed | Writes money? | Purge needs ADMIN_URL (owner-purge) | Notes |
|---|---|---|---|
| counter-demo-seed.ts | Yes (payments / wallets) | Yes | Counter board data |
| parent-pay-demo-seed.ts | Yes | Yes | Parent-funded subscriptions |
| report-export-demo-seed.ts | Yes | Yes | Report export rows |
| weekly-digest-demo-seed.ts | Yes | Yes | Digest data |
| preview-seed.ts | Yes | Yes | Broad preview set |
| settled-lessons-demo-seed.ts | Yes, **via HTTP through the real ERP** | — | HTTP seed: `requireErpBaseUrl` and `assertHttpTargetSharesDatabase` (http-target-guard.ts:11,31). It writes center_wallet_ledger / transactions / session_settlements, which purge does not remove (GAP-269) |
| showcase-payments-demo-seed.ts, showcase-live-demo-seed.ts | Yes, via HTTP | — | Same guard as above |
| delivery-mode, external-teachers, center-oversight, messaging, guardian-verification, room-amenities, room-rate, student-id, team-notes, bulk-import, showcase-demo seeds; backoffice-tour-fixture.ts | No | No | Feature screens only |

Counts per seed are not restated here. Run the verify-db census before and after a seed to get the exact numbers (TC-1327).

#### 5. UAT seed — `packages/database/prisma/uat-seed.ts`

- **Namespace and scope:** namespace `edura-uat-2026-08`, center `UATC`, no money written.
- **Accounts:** 12 accounts `<key>@uat.edura.eg`:
  - owner (center_admin)
  - reception, manager, cashier (center_staff: receptionist / manager / center_accountant)
  - teacher1, teacher2 (teacher)
  - assistant
  - parent1 (2 children), parent2 (1 child)
  - student1, student2
  - student3 (no guardian, for the minor gate)
- **Courses:** 2 (math, physics) (uat-seed.ts:46-81, :273-274).
- **Guards:** requires `--yes` and an `edura-env:` label.
- **Target:** it is documented for production use (GAP-272).
- **QA rule:** QA in this module does not run it.

#### 6. Cleaning up

| Method | What it removes | Where allowed | Evidence |
|---|---|---|---|
| `ROLLBACK` | Everything a SQL TC wrote. All SQL TCs in tc.md run inside `BEGIN … ROLLBACK`; sequence values are not rolled back. | test | tc.md P0 |
| `<seed> --purge` | The ids that seed created | dev, test | each demo seed |
| owner-purge.ts | payments, wallet_ledger, parent_wallet_ledger for the purged demo ids. Needs `ADMIN_URL` (the owner connection) | dev, test | owner-purge.ts:20-27 |
| test-cleanup.ts | Rows left by DB suites, matched on seed names/emails, following user/center FK edges. Never touches the catalog, points_rules or `_prisma_migrations` | test | scripts/test-cleanup.ts:3-20 |
| wipe-data.ts | TRUNCATE … RESTART IDENTITY CASCADE of all data. Needs ADMIN_URL, an env name matching the label, and `--yes`. **Also removes the catalog**; re-run seed.ts afterwards (Q-146) | dev, test | scripts/wipe-data.ts:20,50,63 |
| `db:local:reset` | Drops and rebuilds `edura_test`. **This is the recommended reset before any money TC**, because purges leave money rows (GAP-269) | local test only | local-test-db.sh |
| production-cleanup.ts | Pre-launch purge of everything except the catalog, platform staff and global commission. Requires the production label and `--confirm=wipe-<N>-users` | production only (rehearse on a LOCAL scratch DB labelled production, TC-1337) | scripts/production-cleanup.ts:45-49,111 |

#### 7. Disposable scratch databases

TC-1330..069, TC-1335 and TC-1337 need a database with a different label. Use these steps:
1. Create a LOCAL database `edura_scratch` on the same local server as `edura_test`.
2. Apply the migrations and create `edura_app`, the same way as for `edura_test`.
3. Set the label the TC asks for: none, `edura-env:dev`, or `edura-env:production`.
4. Drop it after the TC.

Never point a TC at the real dev or production endpoints.

General rules:
1. All test data is created in the test/staging environment only and is flagged `is_demo = true` where the seed scripts do so.
2. Use realistic Egyptian data (Arabic names, `01xxxxxxxxx` mobile numbers, 14-digit national IDs) that is **synthetic** — never real people's data.
3. Money tests use mock or sandbox Paymob and record every created payment ID for reconciliation.
4. Each test cycle starts from a known reseeded state; record the seed command and commit used.
5. Cleanup: purge demo data with the project's purge scripts on the test database only. The Egyptian education catalog and the real back-office accounts are permanent reference data and must never be purged.

## 7. Test Execution Approach
1. **Build verification:** smoke suite (§3.2) on each candidate build.
2. **Automated first:** unit, DB and Playwright suites on the test database; record results.
3. **Risk order:** execute Critical test cases module by module (§9 order), then High, then Medium/Low.
4. **Role passes:** for each module, execute positive cases for each allowed role, then the authorization cases for every other role.
5. **Workflow passes:** run the end-to-end workflows after module passes are green.
6. **Non-functional passes:** security, performance (isolated env), accessibility, responsive, localization.
7. **UAT** on staging.
8. **Recording:** fill `Actual Result` and `Status` (Pass / Fail / Blocked / Not Run) in each test case; attach evidence (screenshots, HTTP request/response, DB query result) and defect IDs.

### 7.1 Defect severity
| Severity | Definition |
|---|---|
| Critical | Wrong money amount or direction; money moved twice or lost; cross-tenant data access; privilege escalation; child-safety rule bypass; data loss; system unusable for a role |
| High | Core daily workflow blocked or wrong with no workaround (check-in, payment recording, registration, scheduling) |
| Medium | Secondary feature wrong, or core workflow wrong with a workaround |
| Low | Cosmetic, copy, minor layout issues |

## 8. Entry and Exit Criteria

### 8.1 Entry criteria
- Build deployed to the test/staging environment from a known commit; migrations applied there.
- Demo data seeded; test accounts for every role (including those in §5.4 not yet provisioned) confirmed working.
- Integrations in sandbox or mock mode; environment variables set (§5.2).
- Smoke suite passed.
- Product Owner answers available for the Critical open questions that block test design.

### 8.2 Exit criteria
- 100% of Critical and High test cases executed; every Critical case passed or its failure accepted in writing by the Product Owner.
- No open Critical or High defects.
- Every FR in the RTM has at least one executed test case.
- Security focus areas (§4) executed with no open finding of High severity or above.
- Performance measured against agreed thresholds.
- UAT signed off.

## 9. Risk-Based Testing Priorities
Highest risk first. The order reflects impact (money, minors, tenant data) multiplied by complexity.

| Order | Area | Why it is high-risk |
|---|---|---|
| 1 | Money: payments, subscriptions, wallets, lesson settlement, payouts, refunds, back-office money writers | Real money; append-only ledgers mean errors cannot be silently fixed; several entry points (online, counter, parent, back-office) share one engine |
| 2 | Authorization and tenancy | Six ERP roles + sub-roles + assistants acting on behalf + back-office view-as; tenancy enforced in both code and RLS |
| 3 | Child safety and identity | Minors by default; guardian email gate; student code and QR must expose nothing |
| 4 | Authentication and sessions | Two auth domains, 2FA, token version, invites, onboarding links, view-as handoff |
| 5 | Attendance and session lifecycle | Drives settlement; two attendance modes; offline outbox in the PWA |
| 6 | Walk-in registration and onboarding | Creates accounts at the counter and sends links by WhatsApp; duplicate-child detection |
| 7 | Collaboration and scheduling | Creates classes and schedules across tenants; room conflicts |
| 8 | Reports and exports | Must equal the screen totals; exports leave the system |
| 9 | Messaging and notifications | Minor safety, delivery reliability |
| 10 | Catalog, public site, search | Public exposure; search must not widen reach |
| 11 | UI polish, localization, responsiveness | User adoption |

## 10. Test Deliverables
- Executed `DETAILED_TEST_CASES.md` (Actual Result, Status, evidence links).
- Defect log with severity, steps, environment and evidence.
- Automated suite run reports.
- Security test report.
- Performance test report with the agreed thresholds.
- UAT sign-off sheets.
- Release recommendation (§11).

## 11. Release Readiness
The release recommendation is **evidence-based only**. It may say "ready" only when every exit criterion in
§8.2 is met and the release-readiness criteria in `PRD_QA_HANDOFF.md` §13.2 are satisfied. Until then the
recommendation is "not ready" with the blocking items listed. Code inspection — including this package — is
never sufficient evidence of readiness.
