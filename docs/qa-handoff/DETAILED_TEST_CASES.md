# Edura — Detailed Test Cases

| Item | Value |
|---|---|
| Document | DETAILED_TEST_CASES.md (3 of 5 in `docs/qa-handoff/`) |
| Baseline | Repository `main` at commit `f7e33102`, inspected 2026-11-01 |
| Test cases | 1347, covering 630 functional requirements in 13 modules |
| Requirements | `PRD_QA_HANDOFF.md` (FR IDs) |
| Traceability | `REQUIREMENT_TRACEABILITY_MATRIX.md` |

## How to use this document
- Each test case is a self-contained table with the fields: Test Case ID, Requirement ID, Module, Test
  Scenario, Test Type, Priority, Preconditions, Test Data, Steps, Expected Result, Actual Result, Status,
  Notes.
- **Status** starts as `Not Run`. Set it to `Pass`, `Fail`, `Blocked` or `Not Run` after execution, fill
  **Actual Result**, and attach evidence (screenshot, HTTP request/response, read-only DB query output) and
  any defect ID in **Notes**.
- **Test Data** names seeded demo accounts by email and entities by name. Passwords are never written here:
  see `docs/guides/test-credentials.md`. Only accounts created by the repository's seeds exist on a fresh
  test database (main demo seed and UAT seed); `QA_TEST_PLAN.md` §5.4 lists them and the accounts that must
  still be provisioned.
- **Steps** give the UI path (`/ar/...` or `/en/...`) and/or the exact API call (`METHOD /api/v1/...` with
  body). API calls must carry the session cookie of the role named in the preconditions.
- **Expected Result** is written so it can be checked objectively: HTTP status and error code, the exact
  message text, the database row and field values, or the UI state.
- Database checks are **read-only** queries against the **test** database. Never run test cases against
  production.
- Priorities: **Critical** = money, authentication/authorization, child safety, data loss or integrity;
  **High** = core daily workflow; **Medium** = secondary feature; **Low** = cosmetic.
- Where a test case verifies behaviour that the code does not yet implement or that conflicts with the
  recorded intent, the Notes say so and name the related gap in `OPEN_QUESTIONS_AND_GAPS.md`. Such a case is
  expected to fail until the Product Owner decides.

## Summary
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

## Test cases by module

### 1. Authentication, Accounts & Onboarding

Test data uses role + seeded e-mail only; every password is "see docs/guides/test-credentials.md". URLs are relative to the ERP host (`edura-erp.vercel.app` / dev) unless the step says back-office. `Actual Result` and `Status` are left for the tester. Back-office accounts come from `SEED_SUPERADMIN_EMAIL` / `SEED_ACCOUNTANT_EMAIL` (fallbacks `superadmin@edura.eg` / `accountant@edura.eg`, `packages/database/prisma/seed.ts`); the UAT seed (`packages/database/prisma/uat-seed.ts`) also provides `<key>@uat.edura.eg` accounts (owner, reception, manager, cashier, teacher1/2, assistant, parent1/2, student1/2/3) usable as alternatives.

##### TC-001 — Valid ERP sign-in as student
| Field | Description |
|---|---|
| Test Case ID | TC-001 |
| Requirement ID | FR-001 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Valid ERP sign-in as student |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | dev env seeded; no session cookie |
| Test Data | student `lina.hassan@student.nile-academy.eg`; password: see docs/guides/test-credentials.md |
| Steps | 1. Open `/ar/login`. 2. Enter email + password. 3. Click "Sign in" (`POST /api/auth/sign-in/email`). |
| Expected Result | 200; one `edura*` session cookie set; redirect to `/ar/dashboard` (student portal); `GET /api/auth/get-session` returns the user. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/erp/src/app/[locale]/login/page.tsx:78-133`; `packages/server-core/src/erp-auth/create-auth.ts` |

##### TC-002 — Sign-in with wrong password
| Field | Description |
|---|---|
| Test Case ID | TC-002 |
| Requirement ID | FR-001 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sign-in with wrong password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | as above |
| Test Data | student `lina.hassan@student.nile-academy.eg`; wrong password |
| Steps | 1. `POST /api/auth/sign-in/email` `{email, password:"wrong-value"}`. |
| Expected Result | 401; UI "Invalid email or password" with the "not registered?" CTA; no cookie set; audit row for the failed attempt (if implemented — FR-029). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Generic message by design (BR-003) |

##### TC-003 — super_admin credentials on the ERP login
| Field | Description |
|---|---|
| Test Case ID | TC-003 |
| Requirement ID | FR-001 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | super_admin credentials on the ERP login |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | a super_admin exists |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md; password: see docs/guides/test-credentials.md |
| Steps | 1. `POST /api/auth/sign-in/email` on the ERP host with super_admin credentials. |
| Expected Result | 401 generic "Invalid email or password"; no session; no hint that the account exists or is a staff account. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `packages/server-core/src/auth/login-policy.ts` `canSignIn("www", role)`; `apps/erp/tests/unit/c04-login-allowlist.test.ts` |

##### TC-004 — Pending teacher with correct password
| Field | Description |
|---|---|
| Test Case ID | TC-004 |
| Requirement ID | FR-002 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Pending teacher with correct password |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | a teacher registered via `/register` and not yet approved (`users.status='pending'`) |
| Test Data | freshly registered teacher (TC-020); its own password |
| Steps | 1. `POST /api/auth/sign-in/email` with the correct password. |
| Expected Result | 403 `ACCOUNT_PENDING`; UI "Your account is still under review by the Edura team…"; no cookie. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `create-auth.ts` sign-in hook; `register/page.tsx:206-209` |

##### TC-005 — Suspended account with correct password
| Field | Description |
|---|---|
| Test Case ID | TC-005 |
| Requirement ID | FR-002 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Suspended account with correct password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | a student whose `users.status='suspended'` (set by Superadmin Operations module) |
| Test Data | student `ahmed.mostafa@student.nile-academy.eg` suspended via back-office; password: see docs/guides/test-credentials.md |
| Steps | 1. `POST /api/auth/sign-in/email`. |
| Expected Result | 403 `ACCOUNT_INACTIVE`; UI "Your account is currently inactive. Contact support or your center to reactivate it."; any pre-existing sessions already deleted by trigger. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-013; `migration.sql:159-173` |

##### TC-006 — Pending teacher with WRONG password leaks no state
| Field | Description |
|---|---|
| Test Case ID | TC-006 |
| Requirement ID | FR-002 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Pending teacher with WRONG password leaks no state |
| Test Type | Security |
| Priority | Critical |
| Preconditions | pending teacher exists |
| Test Data | pending teacher email; wrong password |
| Steps | 1. `POST /api/auth/sign-in/email` with a wrong password. |
| Expected Result | 401 generic "Invalid email or password" — NOT the pending hint. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-001; BR-003 |

##### TC-007 — Per-e-mail limiter: 6th attempt in one minute
| Field | Description |
|---|---|
| Test Case ID | TC-007 |
| Requirement ID | FR-002 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Per-e-mail limiter: 6th attempt in one minute |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | clean limiter state for the e-mail |
| Test Data | student `lina.hassan@student.nile-academy.eg`; wrong password |
| Steps | 1. Send 5× `POST /api/auth/sign-in/email` with a wrong password within 60 s. 2. Send a 6th with the CORRECT password. |
| Expected Result | Attempts 1–5: 401. Attempt 6: 429 `{error:{code:"rate_limited",message:"Too many requests, please slow down."}}` + `Retry-After: 60`; UI "Too many attempts — please wait a moment and try again." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `login-email` 5/5; `apps/api/tests/unit/m1-login-lockout.test.ts` |

##### TC-008 — Per-IP limiter: 21st attempt in one minute
| Field | Description |
|---|---|
| Test Case ID | TC-008 |
| Requirement ID | FR-002 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Per-IP limiter: 21st attempt in one minute |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | single API instance (NFR-015) |
| Test Data | 20 different non-existent e-mails from one IP |
| Steps | 1. Send 20 sign-in attempts. 2. Send the 21st. |
| Expected Result | 21st → 429 with `Retry-After: 60`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `login-ip` 20/20 |

##### TC-009 — TOTP challenge succeeds
| Field | Description |
|---|---|
| Test Case ID | TC-009 |
| Requirement ID | FR-003 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | TOTP challenge succeeds |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | a student with 2FA enabled (TC-013) |
| Test Data | student `lina.hassan@student.nile-academy.eg` with authenticator; password: see docs/guides/test-credentials.md |
| Steps | 1. Sign in → `twoFactorRedirect`. 2. On `/ar/two-factor` enter the current TOTP, tick "Trust this device for 60 days". 3. Verify (`POST /api/auth/two-factor/verify-totp`). |
| Expected Result | 200; full session; redirect `/dashboard`; next sign-in within 60 d on this browser skips the challenge. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/erp/src/app/[locale]/two-factor/page.tsx` |

##### TC-010 — Wrong TOTP and lockout at 11 tries
| Field | Description |
|---|---|
| Test Case ID | TC-010 |
| Requirement ID | FR-003 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Wrong TOTP and lockout at 11 tries |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | 2FA-enabled account mid-challenge |
| Test Data | random 6-digit codes |
| Steps | 1. Submit 10 wrong codes within a minute. 2. Submit an 11th (correct) code. |
| Expected Result | Codes 1–10: "Invalid code — try again". 11th: 429 "Too many attempts…". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `2fa-ip` cap 10 refill 5 (BR-005) |

##### TC-011 — Backup code is single-use
| Field | Description |
|---|---|
| Test Case ID | TC-011 |
| Requirement ID | FR-003 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Backup code is single-use |
| Test Type | Security |
| Priority | Critical |
| Preconditions | 2FA-enabled account with backup codes saved |
| Test Data | one backup code |
| Steps | 1. Sign in, choose "Use a backup code instead", submit code X (`POST /api/auth/two-factor/verify-backup-code`). 2. Sign out. 3. Sign in again and submit the same code X. |
| Expected Result | Step 1 succeeds; step 3 → "Invalid code — try again". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-013; better-auth twoFactor plugin |

##### TC-012 — Sign-out clears the session
| Field | Description |
|---|---|
| Test Case ID | TC-012 |
| Requirement ID | FR-004 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sign-out clears the session |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/auth/sign-out`. 2. `GET /api/auth/get-session`. 3. Open `/ar/dashboard`. |
| Expected Result | Cookie cleared; get-session returns null; dashboard redirects to `/ar/login`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `packages/server-core/src/auth/session-cookies.ts` |

##### TC-013 — Sign-out with two session cookies deletes both
| Field | Description |
|---|---|
| Test Case ID | TC-013 |
| Requirement ID | FR-004 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sign-out with two session cookies deletes both |
| Test Type | Security |
| Priority | Critical |
| Preconditions | two valid ERP sessions for different users (e.g. dev port-suffixed cookies) |
| Test Data | student `lina.hassan@student.nile-academy.eg` and teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. Craft a request carrying both cookies. 2. `POST /api/auth/sign-out`. 3. Re-present each cookie alone to `GET /api/v1/me`. |
| Expected Result | Both `auth_sessions` rows deleted; each lone cookie → 401 `unauthenticated`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-007; `apps/api/tests/unit/session-cookies.test.ts` |

##### TC-014 — Enable 2FA from security settings
| Field | Description |
|---|---|
| Test Case ID | TC-014 |
| Requirement ID | FR-005 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Enable 2FA from security settings |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | signed-in student without 2FA |
| Test Data | student `lina.hassan@student.nile-academy.eg`; password: see docs/guides/test-credentials.md |
| Steps | 1. Settings → Security → "Enable 2FA". 2. Enter password in "Confirm your password to continue" (`POST /api/auth/two-factor/enable`). 3. Scan QR, enter TOTP. 4. Save "Backup codes". |
| Expected Result | Toast "Two-factor authentication enabled"; `users.two_factor_enabled` true; next sign-in challenges. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/erp/src/features/security/security-screen.tsx` |

##### TC-015 — Enable 2FA with wrong password
| Field | Description |
|---|---|
| Test Case ID | TC-015 |
| Requirement ID | FR-005 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Enable 2FA with wrong password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | as above |
| Test Data | student `lina.hassan@student.nile-academy.eg`; wrong password |
| Steps | 1. `POST /api/auth/two-factor/enable {password:"wrong"}`. |
| Expected Result | 4xx; 2FA stays disabled; UI "Current password is incorrect" or plugin error. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-006 |

##### TC-016 — Disable 2FA requires password
| Field | Description |
|---|---|
| Test Case ID | TC-016 |
| Requirement ID | FR-005 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Disable 2FA requires password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | 2FA-enabled account |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/auth/two-factor/disable` with an empty/wrong password. |
| Expected Result | Refused; 2FA stays enabled. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-006 |

##### TC-017 — Student self-registration happy path
| Field | Description |
|---|---|
| Test Case ID | TC-017 |
| Requirement ID | FR-006 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Student self-registration happy path |
| Test Type | Functional |
| Priority | High |
| Preconditions | e-mail/phone unused |
| Test Data | new e-mail `qa.student.<ts>@example.test`; phone `0101xxxxxxx`; password meeting the rule |
| Steps | 1. `/ar/register?role=student`. 2. Fill "Full name", "Email", "Phone (optional)", "Password", "Confirm password". 3. "Create account" (`POST /api/v1/auth/register/student`). |
| Expected Result | 201 `{data}`; auto sign-in; redirect `/ar/dashboard` → portal gate sends to `/ar/onboarding` (onboardingComplete=false); `users.status='active'`, `is_demo=false`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `packages/server-core/src/services/auth/register.ts` |

##### TC-018 — Registration with an e-mail already used
| Field | Description |
|---|---|
| Test Case ID | TC-018 |
| Requirement ID | FR-006 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Registration with an e-mail already used |
| Test Type | Negative |
| Priority | High |
| Preconditions | `lina.hassan@…` exists |
| Test Data | student `lina.hassan@student.nile-academy.eg` e-mail |
| Steps | 1. `POST /api/v1/auth/register/student` with that e-mail. |
| Expected Result | 409 "This email or phone number is already registered."; no new row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `ensureUnique` (BR-009) |

##### TC-019 — Password rule boundaries
| Field | Description |
|---|---|
| Test Case ID | TC-019 |
| Requirement ID | FR-006 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Password rule boundaries |
| Test Type | Boundary |
| Priority | High |
| Preconditions | none |
| Test Data | passwords: `abcdefg1` (8, ok), `abcdef1` (7), `12345678`, `abcdefgh` |
| Steps | 1. Submit each via `POST /api/v1/auth/register/student`. |
| Expected Result | First accepted (201); the other three → 400 `validation_error` with `fields.password`; UI "At least 8 characters, including a letter and a digit." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `passwordSchema` (BR-008); EC-018/19 |

##### TC-020 — Parent self-registration happy path
| Field | Description |
|---|---|
| Test Case ID | TC-020 |
| Requirement ID | FR-007 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Parent self-registration happy path |
| Test Type | Functional |
| Priority | High |
| Preconditions | e-mail unused |
| Test Data | new parent e-mail |
| Steps | 1. `/ar/register?role=parent` → fill → "Create account" (`POST /api/v1/auth/register/parent`). |
| Expected Result | 201; auto sign-in; parent portal; no children linked (linking belongs to Student & Parent module). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `register.ts` |

##### TC-021 — Parent registration with a non-Egyptian phone
| Field | Description |
|---|---|
| Test Case ID | TC-021 |
| Requirement ID | FR-007 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Parent registration with a non-Egyptian phone |
| Test Type | Negative |
| Priority | High |
| Preconditions | none |
| Test Data | phone `+201012345678`, `01012345678` (same number, second account) and `12345` |
| Steps | 1. Submit each. |
| Expected Result | `+201012345678` accepted (`EGYPT_PHONE_RE` allows `+20` or `0` prefix, `packages/shared/src/phone.ts:1`); second account with `01012345678` SHOULD → 409 (same number) — record actual (GAP-015); `12345` → 400 `fields.phone`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-017; GAP-015 |

##### TC-022 — Teacher self-registration lands in pending
| Field | Description |
|---|---|
| Test Case ID | TC-022 |
| Requirement ID | FR-008 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher self-registration lands in pending |
| Test Type | Workflow |
| Priority | High |
| Preconditions | e-mail unused |
| Test Data | new teacher e-mail |
| Steps | 1. `POST /api/v1/auth/register/teacher`. 2. Try to sign in. |
| Expected Result | 201 and screen "Account created — awaiting review"; `users.status='pending'`; sign-in → 403 ACCOUNT_PENDING; approval happens in Superadmin Operations. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-011 |

##### TC-023 — Teacher registration limiter
| Field | Description |
|---|---|
| Test Case ID | TC-023 |
| Requirement ID | FR-008 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher registration limiter |
| Test Type | Boundary |
| Priority | High |
| Preconditions | single instance |
| Test Data | 11 distinct e-mails from one IP in a minute |
| Steps | 1. Send 11 `POST /api/v1/auth/register/teacher`. |
| Expected Result | 11th → 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | route limit 10/10 |

##### TC-024 — Center self-registration creates center + pending admin
| Field | Description |
|---|---|
| Test Case ID | TC-024 |
| Requirement ID | FR-009 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Center self-registration creates center + pending admin |
| Test Type | Functional |
| Priority | High |
| Preconditions | e-mail + center name unused |
| Test Data | "Center name" `QA Center <ts>`, admin e-mail, optional address |
| Steps | 1. `/ar/register?role=center` → fill → submit (`POST /api/v1/auth/register/center`). |
| Expected Result | 201; a `centers` row and a `users` row (role `center_admin`, status `pending`) linked; "Account created — awaiting review". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `register-center.ts`; no DB test seen (GAP-012) |

##### TC-025 — Center registration without a center name
| Field | Description |
|---|---|
| Test Case ID | TC-025 |
| Requirement ID | FR-009 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Center registration without a center name |
| Test Type | Negative |
| Priority | High |
| Preconditions | none |
| Test Data | body missing `centerName` |
| Steps | 1. `POST /api/v1/auth/register/center`. |
| Expected Result | 400 `validation_error` `fields.centerName`; UI "Center name is required"; no center row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `register/page.tsx:125-156` |

##### TC-026 — Forgot password for a known e-mail
| Field | Description |
|---|---|
| Test Case ID | TC-026 |
| Requirement ID | FR-010 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Forgot password for a known e-mail |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | mail provider configured (dev: Resend or log) |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `/ar/forgot-password` → e-mail → "Send reset link" (`POST /api/v1/auth/password/forgot {email, locale:"ar"}`). |
| Expected Result | 200; screen "Check your email" / "If an account exists for {email}, we've sent a password reset link. It expires in 1 hour."; a `password_reset_tokens` row with `expires_at` ≈ now+1 h; mail sent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `password-reset.ts`; `apps/erp/tests/db/mail-password-reset.test.ts` |

##### TC-027 — Forgot password for an unknown e-mail is indistinguishable
| Field | Description |
|---|---|
| Test Case ID | TC-027 |
| Requirement ID | FR-010 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Forgot password for an unknown e-mail is indistinguishable |
| Test Type | Security |
| Priority | Critical |
| Preconditions | none |
| Test Data | `nobody.<ts>@example.test` |
| Steps | 1. Same request. 2. Compare status, body and response time with TC-025. |
| Expected Result | Identical 200 body; no token row; no mail; timing within noise. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-015; `apps/api/tests/unit/m11-forgot-password-route.test.ts` |

##### TC-028 — Per-e-mail forgot throttle (4th in an hour)
| Field | Description |
|---|---|
| Test Case ID | TC-028 |
| Requirement ID | FR-010 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Per-e-mail forgot throttle (4th in an hour) |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | clean throttle |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. Send 3 forgot requests. 2. Send a 4th. |
| Expected Result | 4th: either 429 or silent 200 with no new token — tester records which; no more than 3 token rows/mails. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `reset-throttle.ts` 3/h; EC-022 |

##### TC-029 — Reset password with a valid token
| Field | Description |
|---|---|
| Test Case ID | TC-029 |
| Requirement ID | FR-011 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Reset password with a valid token |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | token from TC-025; student signed in on another browser |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. Open `/ar/reset-password?token=…`. 2. Enter "New password" + "Confirm password" → "Reset password" (`POST /api/v1/auth/password/reset`). 3. Sign in with the new password. 4. Check the other browser. |
| Expected Result | Screen "Password reset" / "Your password has been changed successfully."; new password works; old fails; other browser signed out (`token_version` bump → trigger). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `password-reset.ts`; BR-016/18 |

##### TC-030 — Reset token reuse
| Field | Description |
|---|---|
| Test Case ID | TC-030 |
| Requirement ID | FR-011 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Reset token reuse |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | token already consumed |
| Test Data | same token |
| Steps | 1. Repeat the reset call with the consumed token. |
| Expected Result | 4xx; UI "Failed to reset password"; password unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-023 |

##### TC-031 — Sibling reset tokens stay valid after one is used
| Field | Description |
|---|---|
| Test Case ID | TC-031 |
| Requirement ID | FR-011 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sibling reset tokens stay valid after one is used |
| Test Type | Security |
| Priority | Critical |
| Preconditions | two forgot requests → two tokens |
| Test Data | tokens T1, T2 for the same user |
| Steps | 1. Reset with T1. 2. Reset with T2. |
| Expected Result | AS IMPLEMENTED: T2 also succeeds (GAP-002). SHOULD: T2 refused once T1 is consumed. Record actual. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `resetPassword` does not revoke siblings |

##### TC-032 — Reset for a suspended account
| Field | Description |
|---|---|
| Test Case ID | TC-032 |
| Requirement ID | FR-011 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Reset for a suspended account |
| Test Type | Security |
| Priority | Critical |
| Preconditions | suspended student with a fresh reset token |
| Test Data | suspended account token |
| Steps | 1. Reset. 2. Sign in. |
| Expected Result | AS IMPLEMENTED: password changes (no status check); sign-in still 403 ACCOUNT_INACTIVE. Record; see GAP-002. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-024 |

##### TC-033 — Legacy invite accept sets password
| Field | Description |
|---|---|
| Test Case ID | TC-033 |
| Requirement ID | FR-012 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Legacy invite accept sets password |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | an invite row with a token issued by a center (Center Administration module) |
| Test Data | invited user e-mail |
| Steps | 1. `/ar/invite/accept?token=…` → password + confirm → "Activate account" (`POST /api/v1/auth/invite/accept`). 2. Sign in. |
| Expected Result | "Account activated!"; `users.status='active'`, hash set; invite marked accepted; sign-in works. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `invite-accept.ts` |

##### TC-034 — Concurrent accept with the same token
| Field | Description |
|---|---|
| Test Case ID | TC-034 |
| Requirement ID | FR-012 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Concurrent accept with the same token |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | one unused invite token |
| Test Data | two parallel requests |
| Steps | 1. Fire two `POST /api/v1/auth/invite/accept` simultaneously with different passwords. |
| Expected Result | Exactly one 200; the other 409/410; final hash matches the winner. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/erp/tests/db/l04-invite-accept-race.test.ts` |

##### TC-035 — Accept resolves the user by e-mail only
| Field | Description |
|---|---|
| Test Case ID | TC-035 |
| Requirement ID | FR-012 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Accept resolves the user by e-mail only |
| Test Type | Security |
| Priority | Critical |
| Preconditions | invite row whose user has e-mail NULL or changed since issue |
| Test Data | crafted fixture |
| Steps | 1. Accept with the token. |
| Expected Result | AS IMPLEMENTED: lookup by `row.email` with no purpose check (GAP-001) — may fail or hit the wrong row. SHOULD: resolve by user id + purpose. Record actual. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `invite-accept.ts` |

##### TC-036 — Claim a walk-in onboarding token
| Field | Description |
|---|---|
| Test Case ID | TC-036 |
| Requirement ID | FR-013 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Claim a walk-in onboarding token |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | walk-in student created at the counter (Center Administration) with a `walk_in_onboarding` token |
| Test Data | the WhatsApp/e-mail link |
| Steps | 1. Open `/ar/claim?token=…` (phase `authenticating` → `POST /api/auth/invite-token/claim`). 2. Observe phase. |
| Expected Result | Session minted for the shell student; phase `credentials` (no password yet); after FR-021 → `/onboarding`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `invite-token-plugin.ts`; `apps/erp/tests/db/invite-claim.test.ts` |

##### TC-037 — Non-CLAIMABLE purpose cannot mint a session
| Field | Description |
|---|---|
| Test Case ID | TC-037 |
| Requirement ID | FR-013 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Non-CLAIMABLE purpose cannot mint a session |
| Test Type | Security |
| Priority | Critical |
| Preconditions | a `guardian_email_verification` token and a card QR credential |
| Test Data | those tokens |
| Steps | 1. `POST /api/auth/invite-token/claim` with each. |
| Expected Result | Refused (4xx); no session; no `auth_sessions` row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-022; `student-qr-credential.test.ts` |

##### TC-038 — Expired / used claim token
| Field | Description |
|---|---|
| Test Case ID | TC-038 |
| Requirement ID | FR-013 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Expired / used claim token |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | token older than `INVITE_TOKEN_TTL_HOURS` (168 h) or already claimed |
| Test Data | expired token |
| Steps | 1. Open `/ar/claim?token=…`. |
| Expected Result | Phase `invalid` with the `claim.*` message and a sign-in link; no session. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-026 |

##### TC-039 — Claim limiter
| Field | Description |
|---|---|
| Test Case ID | TC-039 |
| Requirement ID | FR-013 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Claim limiter |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | single instance |
| Test Data | 11 invalid tokens from one IP |
| Steps | 1. 11 claims in a minute. |
| Expected Result | 11th → 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `invite-token:${ip}` 10/10 |

##### TC-040 — Claim a view-as handoff token
| Field | Description |
|---|---|
| Test Case ID | TC-040 |
| Requirement ID | FR-014 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Claim a view-as handoff token |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | super_admin minted a token for a teacher (Superadmin Operations module) |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md; target teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. Within 60 s `POST /api/v1/auth/view-as/claim` (form) with the token. 2. `GET /api/v1/me`. |
| Expected Result | ERP session for the teacher with view-as context; `ViewAsBanner` visible; audit `user.view_as_claimed`; back-office cookie untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `view-as-plugin.ts`; `apps/erp/tests/db/view-as.test.ts` |

##### TC-041 — Replay of a view-as token
| Field | Description |
|---|---|
| Test Case ID | TC-041 |
| Requirement ID | FR-014 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Replay of a view-as token |
| Test Type | Security |
| Priority | Critical |
| Preconditions | token already claimed |
| Test Data | same token |
| Steps | 1. Claim again within 60 s. |
| Expected Result | Refused; no second session; single `user.view_as_claimed` audit row for that jti. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-033 |

##### TC-042 — View-as token after 61 s
| Field | Description |
|---|---|
| Test Case ID | TC-042 |
| Requirement ID | FR-014 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | View-as token after 61 s |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | fresh token, wait 61 s |
| Test Data | token |
| Steps | 1. Claim. |
| Expected Result | Refused (TTL 60 s). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `view-as-token.ts` |

##### TC-043 — View-as session dies at 61 min from created_at
| Field | Description |
|---|---|
| Test Case ID | TC-043 |
| Requirement ID | FR-014 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | View-as session dies at 61 min from created_at |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | view-as session; ability to age `auth_sessions.created_at` in dev DB |
| Test Data | view-as session |
| Steps | 1. Set `created_at` to now−61 min (dev only). 2. `GET /api/v1/me`. |
| Expected Result | 401; the window is measured from `created_at`, not `expires_at`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-024; `isViewAsExpired` |

##### TC-044 — View-as targeting a back-office role
| Field | Description |
|---|---|
| Test Case ID | TC-044 |
| Requirement ID | FR-014 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | View-as targeting a back-office role |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | token minted for a super_admin target (if mint allows) |
| Test Data | token |
| Steps | 1. Claim. |
| Expected Result | Refused — view-as takes ERP roles only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-023 |

##### TC-045 — Stop view-as
| Field | Description |
|---|---|
| Test Case ID | TC-045 |
| Requirement ID | FR-015 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Stop view-as |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | active view-as session |
| Test Data | view-as session |
| Steps | 1. `POST /api/v1/auth/view-as/stop`. 2. `GET /api/v1/me`. |
| Expected Result | Session deleted; 401 afterwards; audit `user.view_as_stopped`; redirect target back to the back-office. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `view-as.ts` |

##### TC-046 — Stop from a normal (non view-as) session
| Field | Description |
|---|---|
| Test Case ID | TC-046 |
| Requirement ID | FR-015 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Stop from a normal (non view-as) session |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | ordinary signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. `POST /api/v1/auth/view-as/stop`. |
| Expected Result | 4xx (no view-as context); ordinary session untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `view-as.ts` |

##### TC-047 — Read own account
| Field | Description |
|---|---|
| Test Case ID | TC-047 |
| Requirement ID | FR-016 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Read own account |
| Test Type | Functional |
| Priority | High |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `GET /api/v1/me`. |
| Expected Result | 200 `{data:{id,email,role,status,locale,...}}`; `Cache-Control: no-store`; no password hash or token fields. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/account/profile.ts` |

##### TC-048 — Read own account unauthenticated
| Field | Description |
|---|---|
| Test Case ID | TC-048 |
| Requirement ID | FR-016 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Read own account unauthenticated |
| Test Type | Negative |
| Priority | High |
| Preconditions | no cookie |
| Test Data | — |
| Steps | 1. `GET /api/v1/me`. |
| Expected Result | 401 `{error:{code:"unauthenticated",message:"Not authenticated"}}`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `requireSession` |

##### TC-049 — Update own name / phone / locale
| Field | Description |
|---|---|
| Test Case ID | TC-049 |
| Requirement ID | FR-017 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Update own name / phone / locale |
| Test Type | Functional |
| Priority | High |
| Preconditions | signed-in parent |
| Test Data | parent `mona.hassan@email.eg` (of Lina) |
| Steps | 1. `PATCH /api/v1/me {name:"Mona Hassan QA", locale:"en"}`. 2. `GET /api/v1/me`. |
| Expected Result | 200; fields updated; audit row; UI language switches on next render. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `profile.ts` |

##### TC-050 — Mass-assignment attempt on PATCH /me
| Field | Description |
|---|---|
| Test Case ID | TC-050 |
| Requirement ID | FR-017 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Mass-assignment attempt on PATCH /me |
| Test Type | Security |
| Priority | High |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `PATCH /api/v1/me {role:"super_admin", status:"active", email:"x@y.z", centerId:"…"}`. |
| Expected Result | 400 `validation_error` (strict schema) or fields silently ignored; role/status/email unchanged — tester records which. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | schema in `apps/api/src/app/api/v1/me/route.ts` |

##### TC-051 — Change password signs out everywhere
| Field | Description |
|---|---|
| Test Case ID | TC-051 |
| Requirement ID | FR-018 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Change password signs out everywhere |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | student signed in on browsers A and B |
| Test Data | student `lina.hassan@student.nile-academy.eg`; password: see docs/guides/test-credentials.md |
| Steps | 1. On A: Settings → Security → "Current password", "New password", "Confirm new password" → submit (`POST /api/v1/me/password`). 2. Check B. |
| Expected Result | Toast "Password changed — please sign in again"; A and B both signed out (`token_version` bump → trigger); new password works. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-018; `apps/erp/tests/db/l1-session-invalidation.test.ts` |

##### TC-052 — Wrong current password
| Field | Description |
|---|---|
| Test Case ID | TC-052 |
| Requirement ID | FR-018 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Wrong current password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/password {currentPassword:"wrong", newPassword:"Valid123x"}`. |
| Expected Result | 4xx; UI "Current password is incorrect"; hash unchanged; sessions intact. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `security-screen.tsx` |

##### TC-053 — Shell account (no password yet)
| Field | Description |
|---|---|
| Test Case ID | TC-053 |
| Requirement ID | FR-018 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Shell account (no password yet) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | walk-in student after claim, before credentials |
| Test Data | shell student session (TC-034) |
| Steps | 1. `POST /api/v1/me/password`. |
| Expected Result | 4xx with "This account has no password yet — use your invite link to set one." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `passwords.ts`; `credentials.ts` |

##### TC-054 — Change-password limiter
| Field | Description |
|---|---|
| Test Case ID | TC-054 |
| Requirement ID | FR-018 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Change-password limiter |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | signed-in student |
| Test Data | 11 wrong current passwords |
| Steps | 1. 11 calls in a minute. |
| Expected Result | 11th → 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | route 10/10 |

##### TC-055 — Request e-mail change
| Field | Description |
|---|---|
| Test Case ID | TC-055 |
| Requirement ID | FR-019 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Request e-mail change |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | signed-in teacher; mail configured |
| Test Data | teacher `hossam.aziz@nile-academy.eg`; password: see docs/guides/test-credentials.md; new e-mail `qa.new.<ts>@example.test` |
| Steps | 1. `POST /api/v1/me/email {newEmail, password}`. |
| Expected Result | 200; pending change row with 1 h expiry; confirmation mail to the NEW address; login e-mail unchanged until confirmed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/auth/email-change.ts`; `services/account/email.ts` |

##### TC-056 — Change to an e-mail already in use
| Field | Description |
|---|---|
| Test Case ID | TC-056 |
| Requirement ID | FR-019 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Change to an e-mail already in use |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg`; new e-mail = `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/email`. |
| Expected Result | 409; no mail. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-025 |

##### TC-057 — Change with wrong password
| Field | Description |
|---|---|
| Test Case ID | TC-057 |
| Requirement ID | FR-019 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Change with wrong password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | signed-in teacher |
| Test Data | wrong password |
| Steps | 1. `POST /api/v1/me/email`. |
| Expected Result | 4xx "Current password is incorrect"; no pending change. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `email.ts` password re-check |

##### TC-058 — Confirm e-mail change
| Field | Description |
|---|---|
| Test Case ID | TC-058 |
| Requirement ID | FR-020 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Confirm e-mail change |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | pending change from TC-052; signed in on another browser |
| Test Data | token from the mail |
| Steps | 1. Open `/ar/confirm-email?token=…` (auto `POST /api/v1/me/email/confirm`). 2. Sign in with the NEW e-mail. 3. Check other browser. |
| Expected Result | Screen "Your login email has been changed. For your safety every session was signed out…"; new e-mail signs in, old does not; other browser signed out. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `email-change.ts` |

##### TC-059 — Confirm with an expired or reused token
| Field | Description |
|---|---|
| Test Case ID | TC-059 |
| Requirement ID | FR-020 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Confirm with an expired or reused token |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | token >1 h old or already consumed |
| Test Data | token |
| Steps | 1. `POST /api/v1/me/email/confirm {token}`. |
| Expected Result | 410/400; page error state; e-mail unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-038 |

##### TC-060 — Set first credentials after claim
| Field | Description |
|---|---|
| Test Case ID | TC-060 |
| Requirement ID | FR-021 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Set first credentials after claim |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | shell student session from TC-034 |
| Test Data | e-mail + password meeting the rule |
| Steps | 1. In `/ar/claim` phase `credentials` submit (`POST /api/v1/me/credentials`). 2. Sign out. 3. Sign in with the new credentials. |
| Expected Result | 200; `users.status='active'`, hash set; redirect `LANDING[student]` = `/onboarding`; sign-in works. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `credentials.ts`; `apps/erp/tests/db/invite-claim.test.ts` |

##### TC-061 — Credentials on an account that already has a password
| Field | Description |
|---|---|
| Test Case ID | TC-061 |
| Requirement ID | FR-021 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Credentials on an account that already has a password |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | signed-in student with a password |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/credentials`. |
| Expected Result | 409; hash unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-030 |

##### TC-062 — Weak password on the claim form
| Field | Description |
|---|---|
| Test Case ID | TC-062 |
| Requirement ID | FR-021 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Weak password on the claim form |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | shell session |
| Test Data | password `abc1` and `abcdefgh` |
| Steps | 1. Submit each through the `/claim` form. |
| Expected Result | Client: submit stays disabled for `abc1` (`claim/page.tsx:92`), `abcdefgh` → digit error (`:74`); forcing the request → server 400 `validation_error` for both. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `claim/page.tsx` |

##### TC-063 — Sessions minted before credentials remain valid
| Field | Description |
|---|---|
| Test Case ID | TC-063 |
| Requirement ID | FR-021 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sessions minted before credentials remain valid |
| Test Type | Security |
| Priority | Critical |
| Preconditions | shell session on browser A, set credentials on browser B |
| Test Data | two sessions from the same claim link (if the link can be opened twice before use) |
| Steps | 1. Set credentials on B. 2. `GET /api/v1/me` on A. |
| Expected Result | AS IMPLEMENTED: A stays valid (no `token_version` bump — GAP-003). Record; SHOULD per PO decision. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `credentials.ts` |

##### TC-064 — Read and update UI prefs
| Field | Description |
|---|---|
| Test Case ID | TC-064 |
| Requirement ID | FR-022 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Read and update UI prefs |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `GET /api/v1/me/prefs`. 2. `PATCH /api/v1/me/prefs {tourSeen:true}` (keys per `services/me/prefs.ts`). 3. GET again. |
| Expected Result | 200 each; patched key persisted; unknown keys → 400. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/me/prefs.ts` |

##### TC-065 — Teacher sets a valid public handle
| Field | Description |
|---|---|
| Test Case ID | TC-065 |
| Requirement ID | FR-023 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher sets a valid public handle |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | signed-in teacher without a handle |
| Test Data | teacher `hossam.aziz@nile-academy.eg`; handle `hossam-math` |
| Steps | 1. `GET /api/v1/me/public-handle/check?handle=hossam-math`. 2. `PUT /api/v1/me/public-handle {handle}`. 3. `GET /api/v1/me/public-handle`. |
| Expected Result | check → available; PUT 200; GET returns it; public profile (Catalog & Public Site) resolves. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `public-handles.ts`; `apps/erp/tests/db/public-handles.test.ts` |

##### TC-066 — Handle format boundaries
| Field | Description |
|---|---|
| Test Case ID | TC-066 |
| Requirement ID | FR-023 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Handle format boundaries |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | signed-in teacher |
| Test Data | `ed`, `a`×41, `edura-help`, `-abc`, `abc-`, `Abc`, `admin` |
| Steps | 1. PUT each. |
| Expected Result | too_short / too_long / reserved / invalid / invalid / invalid / reserved — all 400/422 with the reason code; no change. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `packages/shared/src/handle-rules.ts:9-54` |

##### TC-067 — Handle already taken
| Field | Description |
|---|---|
| Test Case ID | TC-067 |
| Requirement ID | FR-023 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Handle already taken |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | another teacher owns `hossam-math` |
| Test Data | teacher `hana.rashidi@nile-academy.eg` |
| Steps | 1. PUT `hossam-math`. |
| Expected Result | 409. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-040 |

##### TC-068 — Student cannot set a handle
| Field | Description |
|---|---|
| Test Case ID | TC-068 |
| Requirement ID | FR-023 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Student cannot set a handle |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. PUT `/api/v1/me/public-handle {handle:"lina"}`. |
| Expected Result | 403 (teacher / center_admin only). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `me/public-handle/route.ts:33,53-54` |

##### TC-069 — Read onboarding state for a new student
| Field | Description |
|---|---|
| Test Case ID | TC-069 |
| Requirement ID | FR-024 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Read onboarding state for a new student |
| Test Type | Functional |
| Priority | High |
| Preconditions | new student (TC-016) |
| Test Data | new student session |
| Steps | 1. `GET /api/v1/me/onboarding`. |
| Expected Result | 200 `{data:{complete:false, draft:{...}, catalog tree}}` per schema. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/catalog/onboarding.ts`; `apps/erp/tests/db/catalog-onboarding.test.ts` |

##### TC-070 — Onboarding state unauthenticated
| Field | Description |
|---|---|
| Test Case ID | TC-070 |
| Requirement ID | FR-024 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Onboarding state unauthenticated |
| Test Type | Negative |
| Priority | High |
| Preconditions | no cookie |
| Test Data | — |
| Steps | 1. `GET /api/v1/me/onboarding`. |
| Expected Result | 401 unauthenticated. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `me/onboarding/route.ts:21` |

##### TC-071 — Save and re-read a draft
| Field | Description |
|---|---|
| Test Case ID | TC-071 |
| Requirement ID | FR-025 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Save and re-read a draft |
| Test Type | Functional |
| Priority | High |
| Preconditions | new student session |
| Test Data | system + stage ids from the catalog |
| Steps | 1. `PATCH /api/v1/me/onboarding {educationSystemId, stageId}`. 2. GET. |
| Expected Result | 200; draft echoed; `complete` still false. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `saveOnboardingDraft` |

##### TC-072 — Draft with a grade outside the chosen stage
| Field | Description |
|---|---|
| Test Case ID | TC-072 |
| Requirement ID | FR-025 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Draft with a grade outside the chosen stage |
| Test Type | Negative |
| Priority | High |
| Preconditions | new student session |
| Test Data | stage A + grade from stage B |
| Steps | 1. PATCH. |
| Expected Result | 422 chain-consistency error. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-042; `me/onboarding/route.ts:30-45` |

##### TC-073 — Complete student onboarding with a track
| Field | Description |
|---|---|
| Test Case ID | TC-073 |
| Requirement ID | FR-026 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Complete student onboarding with a track |
| Test Type | Workflow |
| Priority | High |
| Preconditions | new student; Thanawiya grade that offers tracks |
| Test Data | system → stage → grade → track (شعبة) → second language |
| Steps | 1. Walk the wizard at `/ar/onboarding`; Finish (`POST /api/v1/me/onboarding`). 2. Open the subjects page. |
| Expected Result | 200; `onboardingComplete=true`; redirect to the student portal; subjects page shows ONLY the track's subjects by default (read-time derivation — Student & Parent module). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `complete*Onboarding`; `apps/erp/tests/unit/onboarding-steps.test.ts` |

##### TC-074 — Complete without a required track
| Field | Description |
|---|---|
| Test Case ID | TC-074 |
| Requirement ID | FR-026 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Complete without a required track |
| Test Type | Negative |
| Priority | High |
| Preconditions | grade requires a track |
| Test Data | body without `trackId` |
| Steps | 1. `POST /api/v1/me/onboarding`. |
| Expected Result | 422 "Track is required for this grade level"; `complete` stays false. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-041 |

##### TC-075 — Teacher onboarding complete
| Field | Description |
|---|---|
| Test Case ID | TC-075 |
| Requirement ID | FR-027 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher onboarding complete |
| Test Type | Functional |
| Priority | High |
| Preconditions | signed-in teacher with `onboardingComplete=false` |
| Test Data | grade level ids + subject ids |
| Steps | 1. `POST /api/v1/me/onboarding {gradeLevelIds:[…], subjectIds:[…]}`. |
| Expected Result | 200; teacher portal reachable; gate no longer redirects. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `onboarding.ts` |

##### TC-076 — Center onboarding with empty stages
| Field | Description |
|---|---|
| Test Case ID | TC-076 |
| Requirement ID | FR-027 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Center onboarding with empty stages |
| Test Type | Negative |
| Priority | High |
| Preconditions | signed-in center admin not onboarded |
| Test Data | center admin `admin@nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/onboarding {stageIds:[]}`. |
| Expected Result | 400 `validation_error`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | schema L30-45 |

##### TC-077 — Welcome-mail status and resend
| Field | Description |
|---|---|
| Test Case ID | TC-077 |
| Requirement ID | FR-028 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Welcome-mail status and resend |
| Test Type | Functional |
| Priority | High |
| Preconditions | student created by walk-in with a welcome token |
| Test Data | shell student session |
| Steps | 1. `GET /api/v1/me/onboarding-email`. 2. `POST /api/v1/me/onboarding-email`. |
| Expected Result | GET returns token status (valid/expired/none); POST 200 and one new mail; `/onboarding?token=` banner clears. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/onboarding/welcome-email.ts` |

##### TC-078 — Resend limiter (4th press)
| Field | Description |
|---|---|
| Test Case ID | TC-078 |
| Requirement ID | FR-028 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Resend limiter (4th press) |
| Test Type | Boundary |
| Priority | High |
| Preconditions | as above |
| Test Data | — |
| Steps | 1. 4× POST within a minute. |
| Expected Result | 4th → 429 (per-user cap 3, refill 0.1/min). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-044 |

##### TC-079 — Audit rows for sign-in, sign-out, password change
| Field | Description |
|---|---|
| Test Case ID | TC-079 |
| Requirement ID | FR-029 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Audit rows for sign-in, sign-out, password change |
| Test Type | Database |
| Priority | Critical |
| Preconditions | dev DB read access |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. Perform TC-001, 011, 047. 2. Query `audit_logs` for the user. |
| Expected Result | One row per event with actor, action name (`auth-audit.ts`), target, timestamp, IP/UA where captured. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `services/auth/auth-audit.ts` |

##### TC-080 — Audit log is append-only for the app role
| Field | Description |
|---|---|
| Test Case ID | TC-080 |
| Requirement ID | FR-029 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Audit log is append-only for the app role |
| Test Type | Database |
| Priority | Critical |
| Preconditions | connect as `edura_app` to the dev DB (read-only test) |
| Test Data | — |
| Steps | 1. Attempt `UPDATE audit_logs …` and `DELETE FROM audit_logs …` as `edura_app`. |
| Expected Result | Both denied by grants; rows unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-031; `apps/erp/tests/db/c07-security-audit-guards.test.ts` |

##### TC-081 — Role mismatch on a role-guarded route
| Field | Description |
|---|---|
| Test Case ID | TC-081 |
| Requirement ID | FR-030 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Role mismatch on a role-guarded route |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `GET /api/v1/me/public-handle` is teacher/center only → use it, or any `withRole("teacher")` route. |
| Expected Result | 403 `{error:{code:"role_mismatch"|"forbidden"}}`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `authz/require-role.ts`; `apps/api/tests/unit/authz-require-role.test.ts` |

##### TC-082 — Two session cookies → session_conflict
| Field | Description |
|---|---|
| Test Case ID | TC-082 |
| Requirement ID | FR-030 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Two session cookies → session_conflict |
| Test Type | Security |
| Priority | Critical |
| Preconditions | two valid sessions |
| Test Data | student `lina.hassan@student.nile-academy.eg` + teacher `hossam.aziz@nile-academy.eg` cookies |
| Steps | 1. `GET /api/v1/me` with both cookies. |
| Expected Result | 401 `session_conflict` "Multiple sessions present"; UI login notice for `?reason=session_conflict`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-007 |

##### TC-083 — Back-office cookie on an ERP route
| Field | Description |
|---|---|
| Test Case ID | TC-083 |
| Requirement ID | FR-030 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Back-office cookie on an ERP route |
| Test Type | Security |
| Priority | Critical |
| Preconditions | back-office session |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md |
| Steps | 1. Present the `edura-superadmin*` cookie to `GET /api/v1/me` on the ERP API. |
| Expected Result | 401 unauthenticated (prefix not read). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-005; `session-cookie-prefix.test.ts` |

##### TC-084 — Deleted session row is rejected immediately
| Field | Description |
|---|---|
| Test Case ID | TC-084 |
| Requirement ID | FR-030 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Deleted session row is rejected immediately |
| Test Type | Security |
| Priority | Critical |
| Preconditions | signed-in student; dev DB access |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. Delete the user's `auth_sessions` row. 2. `GET /api/v1/me`. |
| Expected Result | 401; no cached acceptance. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `erp-auth/session.ts` |

##### TC-085 — Signed-out visitor to a portal URL
| Field | Description |
|---|---|
| Test Case ID | TC-085 |
| Requirement ID | FR-031 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Signed-out visitor to a portal URL |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | no cookie |
| Test Data | — |
| Steps | 1. Open `/ar/admin/students`. |
| Expected Result | 307 → `/ar/login?next=%2Far%2Fadmin%2Fstudents`; after sign-in as center admin lands back on `next`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `portal-gate.ts:6-22`; `apps/erp/tests/unit/portal-gate.test.ts` |

##### TC-086 — Teacher opens the center portal
| Field | Description |
|---|---|
| Test Case ID | TC-086 |
| Requirement ID | FR-031 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher opens the center portal |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. Open `/ar/admin`. |
| Expected Result | Redirect to the teacher segment (`PORTAL_SEGMENT_BY_ROLE`); no center data rendered. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `packages/shared/src/portal-segments.ts:28-35` |

##### TC-087 — Onboarding incomplete gates the dashboard
| Field | Description |
|---|---|
| Test Case ID | TC-087 |
| Requirement ID | FR-031 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Onboarding incomplete gates the dashboard |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | new student, not onboarded |
| Test Data | TC-016 session |
| Steps | 1. Open `/ar/dashboard`. |
| Expected Result | Redirect to `/ar/onboarding`; gate order identity → role → onboarding. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-032 |

##### TC-088 — SSR session endpoint
| Field | Description |
|---|---|
| Test Case ID | TC-088 |
| Requirement ID | FR-031 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | SSR session endpoint |
| Test Type | API |
| Priority | Critical |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `GET /api/v1/me/ssr-session`. |
| Expected Result | 200 with the SessionUser shape; 401 without cookie; `no-store`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/api/tests/unit/ssr-reads.test.ts` |

##### TC-089 — Profile checklist for a student
| Field | Description |
|---|---|
| Test Case ID | TC-089 |
| Requirement ID | FR-032 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Profile checklist for a student |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `GET /api/v1/me/profile-checklist`. |
| Expected Result | 200 list of items with done/undone flags scoped to the caller; 401 without cookie. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `student-card.ts` `buildProfileChecklist` |

##### TC-090 — Submit an account deletion request
| Field | Description |
|---|---|
| Test Case ID | TC-090 |
| Requirement ID | FR-033 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Submit an account deletion request |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg`; reason text |
| Steps | 1. `POST /api/v1/me/delete-request {reason:"QA test"}`. |
| Expected Result | 201; request row pending; audit row; back-office queue shows it (Superadmin Operations). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `deletion-request.ts` |

##### TC-091 — Duplicate or empty deletion request
| Field | Description |
|---|---|
| Test Case ID | TC-091 |
| Requirement ID | FR-033 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Duplicate or empty deletion request |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | request from TC-083 open |
| Test Data | teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. POST again with a reason. 2. POST with `{reason:""}`. |
| Expected Result | 1 → 409 "You already have a pending deletion request" (`deletion-request.ts:14`); 2 → 400 `validation_error`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-061/62 |

##### TC-092 — Parent requests deletion for an approved child
| Field | Description |
|---|---|
| Test Case ID | TC-092 |
| Requirement ID | FR-034 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Parent requests deletion for an approved child |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Mona ↔ Lina link approved |
| Test Data | parent `mona.hassan@email.eg` (of Lina) |
| Steps | 1. `POST /api/v1/me/data-rights/deletion {subject:"child", studentId:<Lina>}`. 2. `GET /api/v1/me/data-rights/deletion`. |
| Expected Result | 201; listed; child account not yet deleted (processed by back-office); soft-delete only when executed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `account-deletion.ts`; `apps/erp/tests/db/data-rights.test.ts` |

##### TC-093 — Parent requests deletion for an unlinked child (horizontal)
| Field | Description |
|---|---|
| Test Case ID | TC-093 |
| Requirement ID | FR-034 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Parent requests deletion for an unlinked child (horizontal) |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Tarek is not linked to Lina |
| Test Data | parent `tarek.mostafa@email.eg` (of Ahmed); Lina's student id |
| Steps | 1. POST as above. |
| Expected Result | 403/404; no request row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `data-rights/deletion/route.ts:24-25` (BR-033) |

##### TC-094 — Cancel own pending deletion request
| Field | Description |
|---|---|
| Test Case ID | TC-094 |
| Requirement ID | FR-034 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Cancel own pending deletion request |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | request from TC-085 |
| Test Data | parent `mona.hassan@email.eg` (of Lina) |
| Steps | 1. `DELETE /api/v1/me/data-rights/deletion/<id>`. |
| Expected Result | 200; status cancelled; another parent's id → 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `deletion/[id]/route.ts` |

##### TC-095 — Export request, download, cancel
| Field | Description |
|---|---|
| Test Case ID | TC-095 |
| Requirement ID | FR-035 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Export request, download, cancel |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | signed-in student |
| Test Data | student `lina.hassan@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/data-rights/exports`. 2. `GET /api/v1/me/data-rights/exports`. 3. `GET /api/v1/me/data-rights/exports/<id>`. 4. `DELETE …/<id>` on a second pending export. |
| Expected Result | 201; listing shows it; download returns the file or a `pending` status; cancel 200; another user's id → 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `data-export.ts` |

##### TC-096 — Teacher requests an export
| Field | Description |
|---|---|
| Test Case ID | TC-096 |
| Requirement ID | FR-035 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher requests an export |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/data-rights/exports`. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `exports/route.ts:14` |

##### TC-097 — Guardian verification end to end
| Field | Description |
|---|---|
| Test Case ID | TC-097 |
| Requirement ID | FR-036 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Guardian verification end to end |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | minor student with a guardian e-mail set (TC-092) |
| Test Data | student session; guardian inbox |
| Steps | 1. `POST /api/v1/me/guardian-verification` (issue/resend). 2. Open `/ar/guardian/verify?token=…` in a fresh browser (auto `POST /api/v1/guardian/verify`). 3. In that browser open `/ar/dashboard`. |
| Expected Result | Mail sent; screen "confirmed" with `emailHint`; `GET /api/v1/me/guardian-verification` → verified; step 3 → redirect to `/login` (no session minted). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `guardian-verification.ts`; `apps/erp/tests/db/guardian-verification.test.ts`; BR-022 |

##### TC-098 — Stale token after the guardian e-mail changed
| Field | Description |
|---|---|
| Test Case ID | TC-098 |
| Requirement ID | FR-036 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Stale token after the guardian e-mail changed |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | token issued, then student changes guardian e-mail |
| Test Data | old token |
| Steps | 1. `POST /api/v1/guardian/verify {token}`. |
| Expected Result | 422 (single generic message — GAP-007); not verified. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-035 |

##### TC-099 — Parent calls the student-only verification route (vertical)
| Field | Description |
|---|---|
| Test Case ID | TC-099 |
| Requirement ID | FR-036 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Parent calls the student-only verification route (vertical) |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | signed-in parent |
| Test Data | parent `mona.hassan@email.eg` (of Lina) |
| Steps | 1. `GET /api/v1/me/guardian-verification`. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `me/guardian-verification/route.ts:14` `requireRole("student")` |

##### TC-100 — Verify limiter
| Field | Description |
|---|---|
| Test Case ID | TC-100 |
| Requirement ID | FR-036 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Verify limiter |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | single instance |
| Test Data | 11 bogus tokens from one IP in a minute |
| Steps | 1. 11× `POST /api/v1/guardian/verify`. |
| Expected Result | 11th → 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | route 10/60 |

##### TC-101 — Minor adds a guardian e-mail → messaging unlocks
| Field | Description |
|---|---|
| Test Case ID | TC-101 |
| Requirement ID | FR-037 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Minor adds a guardian e-mail → messaging unlocks |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | student with no DOB (default-minor) and no guardian e-mail; messaging shows `GUARDIAN_LOCK_MESSAGE` |
| Test Data | student `ahmed.mostafa@student.nile-academy.eg` (ensure no guardian e-mail); guardian e-mail `qa.guardian.<ts>@example.test` |
| Steps | 1. `GET /api/v1/me/guardian-contact` (status). 2. `POST /api/v1/me/guardian-contact {guardianEmail}`. 3. Open a teacher chat (Messaging module). |
| Expected Result | Status `missing` → `present`; toast "Guardian email saved — messaging is now available."; lock lifted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `guardian-contact.ts`; `chat-guardian.ts:63-68`; `apps/erp/tests/db/guardian-contact-access.test.ts` |

##### TC-102 — Guardian e-mail equals own e-mail
| Field | Description |
|---|---|
| Test Case ID | TC-102 |
| Requirement ID | FR-037 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Guardian e-mail equals own e-mail |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | minor student |
| Test Data | student `ahmed.mostafa@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/guardian-contact {guardianEmail:<own login e-mail>}`. |
| Expected Result | 422 "The guardian email must be different from the student's own login email". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-037 |

##### TC-103 — Phone only does not satisfy the gate
| Field | Description |
|---|---|
| Test Case ID | TC-103 |
| Requirement ID | FR-037 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Phone only does not satisfy the gate |
| Test Type | Security |
| Priority | Critical |
| Preconditions | minor student without guardian e-mail |
| Test Data | student `ahmed.mostafa@student.nile-academy.eg` |
| Steps | 1. `POST /api/v1/me/guardian-contact {guardianPhone:"01012345678"}`. 2. Open a teacher chat. |
| Expected Result | 200 saved; chat still LOCKED with `GUARDIAN_LOCK_MESSAGE`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | CHILD-SAFETY GATE invariant; EC-048 |

##### TC-104 — Grace period boundary (day 14 → 15)
| Field | Description |
|---|---|
| Test Case ID | TC-104 |
| Requirement ID | FR-037 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Grace period boundary (day 14 → 15) |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | minor without guardian e-mail; dev DB to age `created_at` |
| Test Data | student |
| Steps | 1. Age the account to 14 d → GET status. 2. Age to 15 d → GET status. |
| Expected Result | 14 d: `due`/dismissable; 15 d: `overdue`, banner not dismissable; reminders every 3 d. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `GUARDIAN_EMAIL_GRACE_DAYS` 14, `GUARDIAN_REMINDER_EVERY_DAYS` 3 (BR-036) |

##### TC-105 — Teacher cannot read or set guardian contact
| Field | Description |
|---|---|
| Test Case ID | TC-105 |
| Requirement ID | FR-037 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Teacher cannot read or set guardian contact |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | signed-in teacher |
| Test Data | teacher `hossam.aziz@nile-academy.eg` |
| Steps | 1. `GET` and `POST /api/v1/me/guardian-contact`. |
| Expected Result | 403 both. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `guardian-contact-target.ts` scoping |

##### TC-106 — Back-office sign-in as super_admin
| Field | Description |
|---|---|
| Test Case ID | TC-106 |
| Requirement ID | FR-038 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Back-office sign-in as super_admin |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | back-office host; 2FA enrolled |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md; password: see docs/guides/test-credentials.md |
| Steps | 1. `/ar/login` on the back-office → "Sign in" (`POST /api/auth/sign-in/email`). |
| Expected Result | Redirect to `/two-factor`; after TOTP → `/dashboard`; `edura-superadmin*` cookie only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `apps/superadmin/src/app/[locale]/login/page.tsx:28-46`; `apps/superadmin/tests/db/c04-login-boundary.test.ts` |

##### TC-107 — ERP role on the back-office login
| Field | Description |
|---|---|
| Test Case ID | TC-107 |
| Requirement ID | FR-038 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | ERP role on the back-office login |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | none |
| Test Data | center admin `admin@nile-academy.eg`; password: see docs/guides/test-credentials.md |
| Steps | 1. Back-office `POST /api/auth/sign-in/email`. |
| Expected Result | "Invalid credentials or unauthorized account."; no cookie; identical body to a wrong-password attempt. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-038 |

##### TC-108 — Back-office e-mail bucket (cap 5, refill 1/min)
| Field | Description |
|---|---|
| Test Case ID | TC-108 |
| Requirement ID | FR-038 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Back-office e-mail bucket (cap 5, refill 1/min) |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | clean limiter |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md; wrong then correct password |
| Steps | 1. 5 wrong attempts. 2. Correct password immediately. 3. Wait 60 s, retry. |
| Expected Result | Step 2 → 429; step 3 succeeds (one token refilled). Note operator lockout (GAP-004). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `backoffice-auth/create-auth.ts` `LOGIN_EMAIL` |

##### TC-109 — Forced 2FA setup for an un-enrolled staff account
| Field | Description |
|---|---|
| Test Case ID | TC-109 |
| Requirement ID | FR-039 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Forced 2FA setup for an un-enrolled staff account |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | accountant without 2FA (create via Superadmin Operations) |
| Test Data | accountant `SEED_ACCOUNTANT_EMAIL` (fallback `accountant@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md |
| Steps | 1. Sign in. 2. Open `/ar/dashboard`. |
| Expected Result | Redirect to `/ar/two-factor-setup`; every dashboard route redirects until enrolment; `security.signOut` button returns to `/login`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `dashboard/layout.tsx:19-22`; `two-factor-setup/page.tsx:9-40` |

##### TC-110 — Wrong TOTP on the back-office challenge
| Field | Description |
|---|---|
| Test Case ID | TC-110 |
| Requirement ID | FR-039 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Wrong TOTP on the back-office challenge |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | enrolled super_admin mid-challenge |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md |
| Steps | 1. Submit a wrong code 10×, then an 11th. |
| Expected Result | "Invalid code — try again" ×10; 11th → 429 (cap 10, refill 5). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `two-factor/page.tsx:16-31` |

##### TC-111 — Sealed admin surface
| Field | Description |
|---|---|
| Test Case ID | TC-111 |
| Requirement ID | FR-040 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Sealed admin surface |
| Test Type | Security |
| Priority | Critical |
| Preconditions | none |
| Test Data | — |
| Steps | 1. `GET /api/auth/admin/list-users` and `POST /api/auth/admin/ban-user` on the back-office. |
| Expected Result | 404 for every `/admin/*` path, signed in or not. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-039; `apps/admin-api/tests/unit/route-admin-guard.test.ts` |

##### TC-112 — API requireSession fails closed without 2FA
| Field | Description |
|---|---|
| Test Case ID | TC-112 |
| Requirement ID | FR-040 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | API requireSession fails closed without 2FA |
| Test Type | Security |
| Priority | Critical |
| Preconditions | staff account signed in with password only (2FA pending) |
| Test Data | accountant session before TOTP |
| Steps | 1. `GET /api/v1/me` on the back-office API. |
| Expected Result | 403 `two_factor_required` (or 401) — no data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `backoffice-auth/session.ts`; `apps/admin-api/tests/unit/session-seam.test.ts` |

##### TC-113 — Signed-out visitor opens the back-office dashboard
| Field | Description |
|---|---|
| Test Case ID | TC-113 |
| Requirement ID | FR-040 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Signed-out visitor opens the back-office dashboard |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | no cookie |
| Test Data | — |
| Steps | 1. Open `/ar/dashboard` on the back-office. |
| Expected Result | SHOULD: redirect to `/ar/login`. AS IMPLEMENTED: layout only enforces 2FA (GAP-009) — record what renders. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `dashboard/layout.tsx:19-22`; `apps/admin-api/tests/unit/ssr-session.test.ts` |

##### TC-114 — Back-office own profile and prefs
| Field | Description |
|---|---|
| Test Case ID | TC-114 |
| Requirement ID | FR-041 |
| Module | Authentication, Accounts & Onboarding |
| Test Scenario | Back-office own profile and prefs |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | enrolled super_admin session |
| Test Data | super_admin `SEED_SUPERADMIN_EMAIL` (fallback `superadmin@edura.eg`, `packages/database/prisma/seed.ts`); password: see docs/guides/test-credentials.md |
| Steps | 1. `GET /api/v1/me`. 2. `PATCH /api/v1/me {name}`. 3. `GET`/`PATCH /api/v1/me/prefs`. |
| Expected Result | 200 each; audit row for the profile change; no cross-app leak. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `backoffice/account/profile.ts`; `backoffice/preferences/prefs.ts` |

### 2. Catalog, Discovery, Search & Public Site

Conventions: P1 = must pass before release, P2 = important, P3 = nice to have. Type: API (HTTP call), UI (browser), Data (database or stored-state check, read only). Accounts are referred to by role only; credentials: see docs/guides/test-credentials.md. Run only on an environment labelled edura-env:test or edura-env:dev. Every case lists the requirement, rule, edge-case and gap IDs it covers.

Total cases: 114.

##### TC-115 — Catalog tree returns the active hierarchy
| Field | Description |
|---|---|
| Test Case ID | TC-115 |
| Requirement ID | FR-042 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Catalog tree returns the active hierarchy |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: student. Seeded catalog (Egyptian systems, stages, grades, tracks). |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/catalog/tree with a student session. |
| Expected Result | 200; systems > stages (with hasSecondLanguage) > gradeLevels > trackOptions, ordered by sortOrder; every node active. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-076. |

##### TC-116 — Catalog tree requires a session
| Field | Description |
|---|---|
| Test Case ID | TC-116 |
| Requirement ID | FR-042 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Catalog tree requires a session |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/catalog/tree with no cookie. |
| Expected Result | 401 with error code unauthenticated. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-117 — Deactivated catalog nodes disappear
| Field | Description |
|---|---|
| Test Case ID | TC-117 |
| Requirement ID | FR-042 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Deactivated catalog nodes disappear |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: student (after super_admin deactivates). Use a disposable stage/grade/track on the test environment; deactivate through the back office. |
| Test Data | Seeded account(s) for: student (after super_admin deactivates) (QA_TEST_PLAN §5.4) |
| Steps | Fetch the tree before and after deactivating a track, a grade, a stage. |
| Expected Result | The deactivated node is absent from the tree and from subject selection; existing enrolments untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-076, EC-131. |

##### TC-118 — Subjects for grade and track include track-agnostic offerings
| Field | Description |
|---|---|
| Test Case ID | TC-118 |
| Requirement ID | FR-043 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Subjects for grade and track include track-agnostic offerings |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: student. A grade with both track-specific and track-less offerings. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/catalog/subjects?gradeLevelId=G&trackId=T for two different tracks. |
| Expected Result | Union of subjects with no track and subjects of T only; inactive offerings or subjects excluded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-077. |

##### TC-119 — Subjects selection parameter validation
| Field | Description |
|---|---|
| Test Case ID | TC-119 |
| Requirement ID | FR-043 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Subjects selection parameter validation |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: student. None. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | Call with gradeLevelId missing, malformed, with malformed trackId, with gradeLevelIds of 0, 1, 50, 51 ids and one invalid UUID. |
| Expected Result | 400 for missing, malformed, 0 ids, 51 ids, invalid id; 200 for 1 and 50 ids. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-132. |

##### TC-120 — Student sees only own-track subjects by default
| Field | Description |
|---|---|
| Test Case ID | TC-120 |
| Requirement ID | FR-044 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Student sees only own-track subjects by default |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: student. Student onboarded with grade and track. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | Open the student subjects page. |
| Expected Result | Only subjects of the student's track are listed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-060. |

##### TC-121 — Browse-all mode widens subject search
| Field | Description |
|---|---|
| Test Case ID | TC-121 |
| Requirement ID | FR-044 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Browse-all mode widens subject search |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: student. As above. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | Switch to browse all subjects and search. |
| Expected Result | Subjects of other tracks and grades appear in search; default list unchanged afterwards. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-060. |

##### TC-122 — Second-language scoping
| Field | Description |
|---|---|
| Test Case ID | TC-122 |
| Requirement ID | FR-045 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Second-language scoping |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: student. Student in a stage with a second language; two language options. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/catalog/subjects?mine=1; GET with gradeLevelId and secondLanguage=1. |
| Expected Result | mine=1 contains only the chosen language; secondLanguage=1 lists the options. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-078, EC-134. |

##### TC-123 — Public subjects list and cache headers
| Field | Description |
|---|---|
| Test Case ID | TC-123 |
| Requirement ID | FR-046 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Public subjects list and cache headers |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/subjects without cookie; inspect headers. |
| Expected Result | 200 list of active subjects; Cache-Control public, max-age=0, s-maxage=60, stale-while-revalidate=60. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-074. |

##### TC-124 — mine=1 rules for student, parent, other roles
| Field | Description |
|---|---|
| Test Case ID | TC-124 |
| Requirement ID | FR-047 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | mine=1 rules for student, parent, other roles |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: student, parent, teacher. Approved and unapproved parent-child links. |
| Test Data | Seeded account(s) for: student, parent, teacher (QA_TEST_PLAN §5.4) |
| Steps | student: mine=1; parent: mine=1&studentId approved; parent without studentId; parent with unlinked studentId; teacher: mine=1. |
| Expected Result | student 200 own subjects; parent approved 200; parent without id 400; unlinked refused (status per Q-011); teacher 400. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-079, EC-133. |

##### TC-125 — Catalog structure matches the reference
| Field | Description |
|---|---|
| Test Case ID | TC-125 |
| Requirement ID | FR-048 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Catalog structure matches the reference |
| Test Type | Data Integrity |
| Priority | Low |
| Preconditions | Role: tester (read-only). Environment labelled edura-env:test or dev. |
| Test Data | Seeded account(s) for: tester (read-only) (QA_TEST_PLAN §5.4) |
| Steps | Compare tree output with docs/architecture/education-catalog.md (systems, stages, grades, tracks, subjects). |
| Expected Result | Every documented system, stage, grade and track exists once; no orphan grade without stage. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. |

##### TC-126 — Course search returns only active courses
| Field | Description |
|---|---|
| Test Case ID | TC-126 |
| Requirement ID | FR-049 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course search returns only active courses |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Courses in active, draft, cancelled status; one course of a suspended centre. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/search/courses. |
| Expected Result | Only active courses with an active or absent centre; no onlineUrl field value. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-056, BR-057, EC-099. |

##### TC-127 — Course search filters
| Field | Description |
|---|---|
| Test Case ID | TC-127 |
| Requirement ID | FR-049 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course search filters |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Courses of varied price, days and times. |
| Test Data | No account (anonymous request) |
| Steps | Apply subject, subjectId, priceMin/priceMax, daysOfWeek=0,6,7,x, timeBucket=morning and timeBucket=bogus. |
| Expected Result | Each filter narrows correctly; invalid day values dropped; unknown bucket ignored. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-096, EC-097. |

##### TC-128 — Course search text with Arabic normalisation
| Field | Description |
|---|---|
| Test Case ID | TC-128 |
| Requirement ID | FR-049, FR-076 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course search text with Arabic normalisation |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Course titled with ة / ى / hamza forms. |
| Test Data | No account (anonymous request) |
| Steps | Search q with the alternative spellings and with tashkeel/tatweel. |
| Expected Result | All spellings return the same course. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-052, EC-072, EC-073. |

##### TC-129 — Course search geo filter
| Field | Description |
|---|---|
| Test Case ID | TC-129 |
| Requirement ID | FR-049 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course search geo filter |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: anonymous. Centres with coordinates. |
| Test Data | No account (anonymous request) |
| Steps | Call with nearLat, nearLng, distanceKm; with only two of the three; with nearLat=abc. |
| Expected Result | All three: courses inside the radius; two: filter ignored; abc: observe (no 400 expected, GAP-022). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-095. |

##### TC-130 — Student catalog scope on course search
| Field | Description |
|---|---|
| Test Case ID | TC-130 |
| Requirement ID | FR-050 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Student catalog scope on course search |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: student. Student in grade/track X; courses for other grades. |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | Search signed in; then add scope=all. |
| Expected Result | Default: only grade/track X courses; scope=all: all. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-060. |

##### TC-131 — Parent scope and foreign child
| Field | Description |
|---|---|
| Test Case ID | TC-131 |
| Requirement ID | FR-050 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Parent scope and foreign child |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: parent. Parent with one approved child. |
| Test Data | Seeded account(s) for: parent (QA_TEST_PLAN §5.4) |
| Steps | Search with studentId of the approved child; then with a student from another family. |
| Expected Result | Approved child scopes results; foreign child refused (code recorded for Q-011). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-101. |

##### TC-132 — Teacher-days search and shell teachers
| Field | Description |
|---|---|
| Test Case ID | TC-132 |
| Requirement ID | FR-051 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Teacher-days search and shell teachers |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. One external (shell) teacher with an active course. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/search/teacher-days; GET /api/v1/search/teachers; compare. |
| Expected Result | Record whether the shell teacher appears in each; expected difference documented in GAP-023. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-100, GAP-023. |

##### TC-133 — Centres search
| Field | Description |
|---|---|
| Test Case ID | TC-133 |
| Requirement ID | FR-052 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centres search |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Active centre with and without active courses; suspended centre. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/search/centers; then includeEmpty=1 if supported; with q. |
| Expected Result | Active centres with an active course, ordered by name; suspended excluded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-058. |

##### TC-134 — Teachers search
| Field | Description |
|---|---|
| Test Case ID | TC-134 |
| Requirement ID | FR-053 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Teachers search |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Active, suspended and shell teachers. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/search/teachers with q and minRating. |
| Expected Result | Only active teachers; minRating filters. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-056. |

##### TC-135 — Paging clamps
| Field | Description |
|---|---|
| Test Case ID | TC-135 |
| Requirement ID | FR-054 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Paging clamps |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Call a search with limit=0, -5, 1000, abc, page=0, abc, and defaults. |
| Expected Result | limit within 1..100 default 20; page at least 1; meta reflects the effective values. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-059, EC-093. |

##### TC-136 — Invalid numeric filters
| Field | Description |
|---|---|
| Test Case ID | TC-136 |
| Requirement ID | FR-054 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Invalid numeric filters |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | priceMin=abc; priceMax=-1; priceMin=500&priceMax=100; minRating=6. |
| Expected Result | Record status and body: no crash (no 500) is the minimum bar; a 400 is the recommended behaviour. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-094, EC-098, GAP-022. |

##### TC-137 — Discovery rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-137 |
| Requirement ID | FR-055 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Discovery rate limit |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. A single client IP. |
| Test Data | No account (anonymous request) |
| Steps | Send 61 requests within one minute to /api/v1/search/centers. |
| Expected Result | The 61st returns 429 rate_limited with Retry-After 60; later succeeds. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-073, EC-102. |

##### TC-138 — Cache headers per discovery route
| Field | Description |
|---|---|
| Test Case ID | TC-138 |
| Requirement ID | FR-055 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Cache headers per discovery route |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous and signed-in. None. |
| Test Data | Seeded account(s) for: anonymous and signed-in (QA_TEST_PLAN §5.4) |
| Steps | Inspect headers of centers, teachers, courses, teacher-days, with and without cookie. |
| Expected Result | centers and teachers: s-maxage=60; courses and teacher-days: no-store; a 429 or 404 is never marked public. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-074. |

##### TC-139 — Seat counts are live
| Field | Description |
|---|---|
| Test Case ID | TC-139 |
| Requirement ID | FR-055 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Seat counts are live |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Course with 1 seat left. |
| Test Data | No account (anonymous request) |
| Steps | Read seats; enrol a student; read again immediately. |
| Expected Result | Seat count updates at once although rows are cached. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-061. |

##### TC-140 — Suspended centre disappears from discovery
| Field | Description |
|---|---|
| Test Case ID | TC-140 |
| Requirement ID | FR-055 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Suspended centre disappears from discovery |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Active centre visible in search. |
| Test Data | No account (anonymous request) |
| Steps | Suspend it (back office); poll centre search every 30 s for 3 minutes. |
| Expected Result | Gone within about 2 minutes; never reappears; its profile and courses follow the same gate. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-103. |

##### TC-141 — Demo rows visible publicly in development
| Field | Description |
|---|---|
| Test Case ID | TC-141 |
| Requirement ID | FR-049 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Demo rows visible publicly in development |
| Test Type | Data Integrity |
| Priority | Low |
| Preconditions | Role: anonymous. Demo data seeded. |
| Test Data | No account (anonymous request) |
| Steps | Search courses, centres, teachers; read sitemap handles. |
| Expected Result | Record that is_demo rows appear; confirm they vanish after the pre-launch purge (not in this run). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-136, GAP-029. |

##### TC-142 — Centre public page
| Field | Description |
|---|---|
| Test Case ID | TC-142 |
| Requirement ID | FR-056 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centre public page |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. Active centre with courses. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/centers/<id> and /en/centers/<id>. |
| Expected Result | Name, location and courses with live counts; both languages; RTL in Arabic. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-143 — Centre page unknown or malformed id
| Field | Description |
|---|---|
| Test Case ID | TC-143 |
| Requirement ID | FR-056 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centre page unknown or malformed id |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/centers/not-a-uuid and a random UUID; and a suspended centre id. |
| Expected Result | 404 for unknown/malformed; suspended behaviour recorded (Q-012). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-144 — Course public page
| Field | Description |
|---|---|
| Test Case ID | TC-144 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course public page |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. Active course. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/courses/<id>. |
| Expected Result | Title, schedule, price, seats, teacher, centre; no meeting URL. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-145 — Course page unknown or malformed id
| Field | Description |
|---|---|
| Test Case ID | TC-145 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course page unknown or malformed id |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/courses/not-a-uuid and a random UUID. |
| Expected Result | 404 not_found for both. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-104. |

##### TC-146 — Meeting link visibility matrix
| Field | Description |
|---|---|
| Test Case ID | TC-146 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Meeting link visibility matrix |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: 11 viewer types. Online course; viewers listed in EC-105 prepared with the right subscription states. |
| Test Data | Seeded account(s) for: 11 viewer types (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/courses/<id> as each viewer. |
| Expected Result | onlineUrl returned only to owner teacher, owning-centre user, and student or approved parent with coverage today; null otherwise; hasOnlineUrl true for all. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-062, EC-105. |

##### TC-147 — Course by id for non-active courses
| Field | Description |
|---|---|
| Test Case ID | TC-147 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course by id for non-active courses |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Draft, cancelled and suspended-centre courses. |
| Test Data | No account (anonymous request) |
| Steps | GET each by id without cookie. |
| Expected Result | Observed: full row returned (defect candidate) — record status and body. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-106, GAP-031. |

##### TC-148 — Course by id field exposure
| Field | Description |
|---|---|
| Test Case ID | TC-148 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Course by id field exposure |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Any course. |
| Test Data | No account (anonymous request) |
| Steps | Inspect JSON keys of GET /api/v1/courses/<id> without cookie. |
| Expected Result | Record presence of splitPlatformBp, splitTeacherBp, splitCenterBp, pricingMethod, m2CenterFee, m2CenterBp, settlementBasis, status, dataSource, isDemo, searchText; expected product answer pending Q-017. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: GAP-017. |

##### TC-149 — Request enrollment from the course page
| Field | Description |
|---|---|
| Test Case ID | TC-149 |
| Requirement ID | FR-058 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Request enrollment from the course page |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: student, parent, anonymous. Course with free seats. |
| Test Data | Seeded account(s) for: student, parent, anonymous (QA_TEST_PLAN §5.4) |
| Steps | Press request enrollment signed in as student, as parent, and signed out. |
| Expected Result | Student/parent: request created per Student and parent module; signed out: record outcome (Q-013). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: WF-011. |

##### TC-150 — Public profile of a centre handle
| Field | Description |
|---|---|
| Test Case ID | TC-150 |
| Requirement ID | FR-059 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Public profile of a centre handle |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. Centre with a handle. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/p/<centre-handle>. |
| Expected Result | Profile renders; title and description set; no meeting links. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: WF-018. |

##### TC-151 — Public profile of a teacher handle
| Field | Description |
|---|---|
| Test Case ID | TC-151 |
| Requirement ID | FR-059 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Public profile of a teacher handle |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. Teacher with a handle. |
| Test Data | No account (anonymous request) |
| Steps | Open /en/p/<teacher-handle>. |
| Expected Result | Profile renders in English LTR. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-152 — Unknown handle returns 404 with noindex
| Field | Description |
|---|---|
| Test Case ID | TC-152 |
| Requirement ID | FR-059 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Unknown handle returns 404 with noindex |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/p/does-not-exist; inspect status and robots meta. |
| Expected Result | 404; robots noindex, nofollow. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-068, EC-126. |

##### TC-153 — Centre status gate on profile
| Field | Description |
|---|---|
| Test Case ID | TC-153 |
| Requirement ID | FR-060 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centre status gate on profile |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Centre with handle. |
| Test Data | No account (anonymous request) |
| Steps | Read profile; suspend centre; read after 70 s; restore; read. |
| Expected Result | 200, then 404 (within the cache window), then 200. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-064, EC-109. |

##### TC-154 — Teacher status and role gate on profile
| Field | Description |
|---|---|
| Test Case ID | TC-154 |
| Requirement ID | FR-060 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Teacher status and role gate on profile |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Teacher with handle. |
| Test Data | No account (anonymous request) |
| Steps | Read profile; suspend the user; change role if possible; read. |
| Expected Result | 404 whenever the user is not active or not a teacher. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-064, EC-110. |

##### TC-155 — Profile never exposes online meeting link
| Field | Description |
|---|---|
| Test Case ID | TC-155 |
| Requirement ID | FR-060 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Profile never exposes online meeting link |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous and owner. Profile owner with an online course. |
| Test Data | Seeded account(s) for: anonymous and owner (QA_TEST_PLAN §5.4) |
| Steps | Read profile JSON as visitor and as owner. |
| Expected Result | No online_url / onlineUrl key with a URL value in either. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-063. |

##### TC-156 — Handle format and reserved words
| Field | Description |
|---|---|
| Test Case ID | TC-156 |
| Requirement ID | FR-061 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Handle format and reserved words |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. Read packages/shared/src/handle-rules.ts to choose values. |
| Test Data | No account (anonymous request) |
| Steps | Request profiles for upper-case, reserved word, too short, too long, Arabic-letter handles. |
| Expected Result | Invalid forms return 404; valid forms resolve if assigned. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-066, EC-108. |

##### TC-157 — Fresh versus cached profile read
| Field | Description |
|---|---|
| Test Case ID | TC-157 |
| Requirement ID | FR-062 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Fresh versus cached profile read |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous, owner. Owner able to edit the profile. |
| Test Data | Seeded account(s) for: anonymous, owner (QA_TEST_PLAN §5.4) |
| Steps | Edit profile; read as owner and as visitor immediately; visitor again after 70 s. |
| Expected Result | Owner sees the edit now; visitor may see old content up to about 60 s; then new. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-067, EC-111. |

##### TC-158 — Sitemap handles API honours the gate
| Field | Description |
|---|---|
| Test Case ID | TC-158 |
| Requirement ID | FR-063 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Sitemap handles API honours the gate |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Active and suspended owners with handles. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/public/sitemap-handles. |
| Expected Result | Only gated-in handles, ordered by handle, with updatedAt. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-065, EC-114. |

##### TC-159 — Sitemap handles cap
| Field | Description |
|---|---|
| Test Case ID | TC-159 |
| Requirement ID | FR-063 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Sitemap handles cap |
| Test Type | Data Integrity |
| Priority | Low |
| Preconditions | Role: anonymous. Environment with more than 5000 handles is unlikely; verify by code review and a smaller simulated check. |
| Test Data | No account (anonymous request) |
| Steps | Confirm the take limit by inspection; if feasible seed 5001 test handles in the test environment. |
| Expected Result | At most 5000 entries; document the silent truncation. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-112. |

##### TC-160 — ERP sitemap content
| Field | Description |
|---|---|
| Test Case ID | TC-160 |
| Requirement ID | FR-064 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP sitemap content |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: crawler. None. |
| Test Data | No account (anonymous request) |
| Steps | Fetch /sitemap.xml from the ERP host; list URL groups. |
| Expected Result | Marketing pages, help articles, /login, /register, /forgot-password and handles; each with ar and en alternates; record absence of robots.txt on the ERP host. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: GAP-024. |

##### TC-161 — ERP sitemap resilience
| Field | Description |
|---|---|
| Test Case ID | TC-161 |
| Requirement ID | FR-064 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP sitemap resilience |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: crawler. Ability to stop the API on the test environment. |
| Test Data | No account (anonymous request) |
| Steps | Stop the API; fetch the ERP sitemap. |
| Expected Result | Sitemap still served without handles; no 500. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-113. |

##### TC-162 — Tenant host routing is dormant
| Field | Description |
|---|---|
| Test Case ID | TC-162 |
| Requirement ID | FR-065 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Tenant host routing is dormant |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: anonymous. PUBLIC_ROOT_DOMAIN unset (confirm for the environment). |
| Test Data | No account (anonymous request) |
| Steps | Request the ERP with Host header <handle>.example.test. |
| Expected Result | Behaves as a normal request; no rewrite to /p/<handle>. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: BR-069, EC-135. |

##### TC-163 — Affiliation invite landing
| Field | Description |
|---|---|
| Test Case ID | TC-163 |
| Requirement ID | FR-066 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Affiliation invite landing |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: teacher, parent, anonymous. A pending affiliation invite. |
| Test Data | Seeded account(s) for: teacher, parent, anonymous (QA_TEST_PLAN §5.4) |
| Steps | Open /ar/<inviteId> as teacher, as parent, signed out, with an unknown id. |
| Expected Result | Teacher: invite actions; parent: role mismatch message; unknown id: not-found card; signed-out recorded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: WF-021. |

##### TC-164 — ERP 404 pages
| Field | Description |
|---|---|
| Test Case ID | TC-164 |
| Requirement ID | FR-067 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP 404 pages |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/nope, /en/a/b/c, /ar/help/nope. |
| Expected Result | HTTP 404 with the localised not-found page in the right direction. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-082, EC-127. |

##### TC-165 — Global search requires a session and returns the envelope
| Field | Description |
|---|---|
| Test Case ID | TC-165 |
| Requirement ID | FR-068 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Global search requires a session and returns the envelope |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous, student. None. |
| Test Data | Seeded account(s) for: anonymous, student (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/search?q=ab without cookie; then with a student cookie. |
| Expected Result | 401; then 200 with q, groups, truncated. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-079. |

##### TC-166 — Global search minimum length and locale
| Field | Description |
|---|---|
| Test Case ID | TC-166 |
| Requirement ID | FR-068 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Global search minimum length and locale |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_admin. None. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Query 0, 1, 2 characters, whitespace, punctuation; locale=en, fr, EN, empty. |
| Expected Result | Under 2: empty groups; 2: providers run; locale other than en behaves as ar. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-042, EC-067, EC-068, EC-078. |

##### TC-167 — Global search very long query
| Field | Description |
|---|---|
| Test Case ID | TC-167 |
| Requirement ID | FR-068 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Global search very long query |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: center_admin. None. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Send q of 10,000 and 1,000,000 characters (URL limits permitting; also via POST-like proxies is not applicable). |
| Expected Result | Record status and latency; no maximum is enforced in code. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-069, GAP-018. |

##### TC-168 — Global search is not rate limited
| Field | Description |
|---|---|
| Test Case ID | TC-168 |
| Requirement ID | FR-068 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Global search is not rate limited |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: center_admin. Test environment only. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Send 200 requests in one minute. |
| Expected Result | Record whether any 429 appears; none expected from code. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: GAP-018. |

##### TC-169 — Centre owner sees all seven kinds
| Field | Description |
|---|---|
| Test Case ID | TC-169 |
| Requirement ID | FR-069 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centre owner sees all seven kinds |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_admin. Centre with student, course, teacher, external teacher, room, staff, payment all containing the word X. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/search?q=X. |
| Expected Result | Groups for student, course, teacher, external_teacher, room, staff, payment. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-045, BR-046. |

##### TC-170 — Receptionist sees students only
| Field | Description |
|---|---|
| Test Case ID | TC-170 |
| Requirement ID | FR-069 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Receptionist sees students only |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_staff receptionist. Same data as above. |
| Test Data | Seeded account(s) for: center_staff receptionist (QA_TEST_PLAN §5.4) |
| Steps | Same query. |
| Expected Result | Only student group. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-081. |

##### TC-171 — Manager sees students and rooms
| Field | Description |
|---|---|
| Test Case ID | TC-171 |
| Requirement ID | FR-069 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Manager sees students and rooms |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_staff manager. Same data. |
| Test Data | Seeded account(s) for: center_staff manager (QA_TEST_PLAN §5.4) |
| Steps | Same query. |
| Expected Result | student and room groups only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-172 — Centre accountant sees payments only
| Field | Description |
|---|---|
| Test Case ID | TC-172 |
| Requirement ID | FR-069 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Centre accountant sees payments only |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_staff center_accountant. Same data. |
| Test Data | Seeded account(s) for: center_staff center_accountant (QA_TEST_PLAN §5.4) |
| Steps | Same query; query a student name. |
| Expected Result | payment group only; no student group. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-082. |

##### TC-173 — Teacher search scope
| Field | Description |
|---|---|
| Test Case ID | TC-173 |
| Requirement ID | FR-070 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Teacher search scope |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: teacher. Teacher A and B each with students and courses sharing a name fragment. |
| Test Data | Seeded account(s) for: teacher (QA_TEST_PLAN §5.4) |
| Steps | As teacher A search the fragment. |
| Expected Result | Only A's students and courses; centre group only if A is affiliated. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-047, EC-084. |

##### TC-174 — Assistant search scope
| Field | Description |
|---|---|
| Test Case ID | TC-174 |
| Requirement ID | FR-071 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Assistant search scope |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: assistant. Assistant of teacher A. |
| Test Data | Seeded account(s) for: assistant (QA_TEST_PLAN §5.4) |
| Steps | Search the same fragment. |
| Expected Result | Teacher A's data only, hrefs under /dashboard/assistant. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-175 — Parent search scope
| Field | Description |
|---|---|
| Test Case ID | TC-175 |
| Requirement ID | FR-072 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Parent search scope |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: parent. Parent with one approved and one pending child. |
| Test Data | Seeded account(s) for: parent (QA_TEST_PLAN §5.4) |
| Steps | Search each child's name and code. |
| Expected Result | Approved child found as group child; pending child absent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-048, EC-085. |

##### TC-176 — Student search scope
| Field | Description |
|---|---|
| Test Case ID | TC-176 |
| Requirement ID | FR-073 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Student search scope |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: student. Student enrolled in course E, not in course F (both public). |
| Test Data | Seeded account(s) for: student (QA_TEST_PLAN §5.4) |
| Steps | Search both titles. |
| Expected Result | Only E. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-049, EC-086. |

##### TC-177 — Ranking order
| Field | Description |
|---|---|
| Test Case ID | TC-177 |
| Requirement ID | FR-074 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Ranking order |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: center_admin. Students named so that one has an exact student code match and others prefix/contain. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search the exact code, then a prefix. |
| Expected Result | Exact identifier hit first with a badge; prefix next. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-051. |

##### TC-178 — Off-roster student masking
| Field | Description |
|---|---|
| Test Case ID | TC-178 |
| Requirement ID | FR-075 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Off-roster student masking |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_admin, receptionist. Student registered at centre B only. |
| Test Data | Seeded account(s) for: center_admin, receptionist (QA_TEST_PLAN §5.4) |
| Steps | As centre A staff search the student's code. |
| Expected Result | Masked hit; href /checkin?code=...; no profile data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-050, EC-083. |

##### TC-179 — Hrefs are portal-aware and openable
| Field | Description |
|---|---|
| Test Case ID | TC-179 |
| Requirement ID | FR-075 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Hrefs are portal-aware and openable |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: each role. Hits available for the role. |
| Test Data | Seeded account(s) for: each role (QA_TEST_PLAN §5.4) |
| Steps | Click one hit of each kind. |
| Expected Result | Page opens inside the caller's own portal without a 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: WF-014, WF-015, WF-016. |

##### TC-180 — Arabic and digit normalisation in global search
| Field | Description |
|---|---|
| Test Case ID | TC-180 |
| Requirement ID | FR-076 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Arabic and digit normalisation in global search |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_admin. Student 'أحمد' with a phone number. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search spelling variants, tashkeel, tatweel, bidi controls, Arabic-Indic and Persian digits. |
| Expected Result | Every variant returns the same hit. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-052, EC-072, EC-073, EC-074, EC-075. |

##### TC-181 — Multi-term queries
| Field | Description |
|---|---|
| Test Case ID | TC-181 |
| Requirement ID | FR-076 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Multi-term queries |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: center_admin. Student 'Ahmed Hassan'. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search 'hassan ahmed', 'ahm has', 'ahmed zzz'. |
| Expected Result | First two match; third does not. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: BR-053, EC-076. |

##### TC-182 — Injection and special characters
| Field | Description |
|---|---|
| Test Case ID | TC-182 |
| Requirement ID | FR-076 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Injection and special characters |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: each role. None. |
| Test Data | Seeded account(s) for: each role (QA_TEST_PLAN §5.4) |
| Steps | Search the strings in EC-070, wildcard characters and emoji; load the result in the palette. |
| Expected Result | No 500; no SQL error; no script execution; result text escaped. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-070, EC-071, EC-077. |

##### TC-183 — No reach across centres
| Field | Description |
|---|---|
| Test Case ID | TC-183 |
| Requirement ID | FR-077 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | No reach across centres |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: center_admin of centre A. Centres A and B with distinguishable records. |
| Test Data | Seeded account(s) for: center_admin of centre A (QA_TEST_PLAN §5.4) |
| Steps | Search names, codes and payment references that exist only at B. |
| Expected Result | No hit from B except masked students (TC for masking). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-041. |

##### TC-184 — No reach for families and teachers
| Field | Description |
|---|---|
| Test Case ID | TC-184 |
| Requirement ID | FR-077 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | No reach for families and teachers |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: parent, student, teacher. Other family's child; other teacher's student. |
| Test Data | Seeded account(s) for: parent, student, teacher (QA_TEST_PLAN §5.4) |
| Steps | Search their names and codes. |
| Expected Result | No hits. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-041. |

##### TC-185 — Back-office search as super_admin
| Field | Description |
|---|---|
| Test Case ID | TC-185 |
| Requirement ID | FR-078 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Back-office search as super_admin |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: super_admin. Users of several roles, centres, payment intents. |
| Test Data | Seeded account(s) for: super_admin (QA_TEST_PLAN §5.4) |
| Steps | GET /admin-api/v1/search?q=X. |
| Expected Result | Groups of users, centres and payment intents. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-055, WF-017. |

##### TC-186 — Back-office search as accountant
| Field | Description |
|---|---|
| Test Case ID | TC-186 |
| Requirement ID | FR-078 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Back-office search as accountant |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: accountant. Same data. |
| Test Data | Seeded account(s) for: accountant (QA_TEST_PLAN §5.4) |
| Steps | Same query. |
| Expected Result | Only payment intents. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-187 — Back-office search access control
| Field | Description |
|---|---|
| Test Case ID | TC-187 |
| Requirement ID | FR-078 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Back-office search access control |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous, center_admin, teacher. None. |
| Test Data | Seeded account(s) for: anonymous, center_admin, teacher (QA_TEST_PLAN §5.4) |
| Steps | Call /admin-api/v1/search with no cookie and with ERP cookies. |
| Expected Result | 401 or 403; no data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. |

##### TC-188 — ERP palette basic flow
| Field | Description |
|---|---|
| Test Case ID | TC-188 |
| Requirement ID | FR-079 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP palette basic flow |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: center_admin. Signed in. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Press Ctrl/Cmd+K; type 1 character; type 3 characters; select a hit; press Escape. |
| Expected Result | No request below 2 chars; results after about 220 ms; selecting navigates; Escape closes. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-090. |

##### TC-189 — ERP palette on failed search
| Field | Description |
|---|---|
| Test Case ID | TC-189 |
| Requirement ID | FR-079 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP palette on failed search |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: center_admin. Ability to block the search request (devtools offline). |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search while the request fails. |
| Expected Result | Observed: empty text is shown, not an error (defect candidate). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-091, GAP-021. |

##### TC-190 — ERP palette truncation and client cache
| Field | Description |
|---|---|
| Test Case ID | TC-190 |
| Requirement ID | FR-079 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP palette truncation and client cache |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | Role: center_admin. Query with more than 5 matches. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search; change data; search again within 30 s. |
| Expected Result | Truncated hint appears; second result may be stale up to 30 s. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-087, EC-092. |

##### TC-191 — Superadmin palette error state
| Field | Description |
|---|---|
| Test Case ID | TC-191 |
| Requirement ID | FR-080 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Superadmin palette error state |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: super_admin. Block /admin-api/v1/search. |
| Test Data | Seeded account(s) for: super_admin (QA_TEST_PLAN §5.4) |
| Steps | Search. |
| Expected Result | An error message is shown, not the empty text. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-192 — Non-searching roles get empty groups
| Field | Description |
|---|---|
| Test Case ID | TC-192 |
| Requirement ID | FR-081 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Non-searching roles get empty groups |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: accountant, super_admin. Back-office user with an ERP session (impersonation not required: use API call with an ERP session if available). |
| Test Data | Seeded account(s) for: accountant, super_admin (QA_TEST_PLAN §5.4) |
| Steps | GET /api/v1/search?q=abc. |
| Expected Result | 200 with empty groups and truncated false. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-054, EC-080. |

##### TC-193 — Truncation at five hits per kind
| Field | Description |
|---|---|
| Test Case ID | TC-193 |
| Requirement ID | FR-068 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Truncation at five hits per kind |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: center_admin. Seven students sharing a name fragment. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search the fragment. |
| Expected Result | Five student hits and truncated true. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-043, EC-087. |

##### TC-194 — Valid contact submission from the ERP form
| Field | Description |
|---|---|
| Test Case ID | TC-194 |
| Requirement ID | FR-082, FR-083, FR-084 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Valid contact submission from the ERP form |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Fill /ar/contact with valid data and submit. |
| Expected Result | 201 success state; one row in contact_submissions with source website_contact. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: WF-019. |

##### TC-195 — Contact field boundaries
| Field | Description |
|---|---|
| Test Case ID | TC-195 |
| Requirement ID | FR-082 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact field boundaries |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | POST with name 1/2/120/121, email invalid/200/201, message 9/10/4000/4001/10 spaces. |
| Expected Result | Boundary values accepted; out of range 400 validation_error with fields. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-070, EC-115, EC-116. |

##### TC-196 — Contact strict body
| Field | Description |
|---|---|
| Test Case ID | TC-196 |
| Requirement ID | FR-082 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact strict body |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | POST with an extra field, bad subject, bad locale, array body, malformed JSON, empty body. |
| Expected Result | 400 validation_error each. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-117. |

##### TC-197 — Contact phone variants
| Field | Description |
|---|---|
| Test Case ID | TC-197 |
| Requirement ID | FR-082 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact phone variants |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | phone empty, 40, 41 characters, letters. |
| Expected Result | Empty stored as null; 41 rejected; letters accepted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-118. |

##### TC-198 — Contact rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-198 |
| Requirement ID | FR-082 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact rate limit |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Single IP, test environment. |
| Test Data | No account (anonymous request) |
| Steps | POST 6 valid submissions within a minute; wait 20 s; POST again. |
| Expected Result | Sixth returns 429 rate_limited; later request succeeds after refill. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-071, EC-120. |

##### TC-199 — Contact stored fields
| Field | Description |
|---|---|
| Test Case ID | TC-199 |
| Requirement ID | FR-083 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact stored fields |
| Test Type | Data Integrity |
| Priority | Medium |
| Preconditions | Role: anonymous. Read access to the test database (read-only). |
| Test Data | No account (anonymous request) |
| Steps | Submit with a valid IP header, with a forged non-IP header; read the rows. |
| Expected Result | IP stored only when valid; user agent truncated to 500; email lower-cased. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-072, EC-121. |

##### TC-200 — Contact stores markup as text
| Field | Description |
|---|---|
| Test Case ID | TC-200 |
| Requirement ID | FR-083 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact stores markup as text |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Submit HTML/script in name and message; view in the back-office reader if one exists. |
| Expected Result | Stored verbatim; the reader must show it escaped. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-119. |

##### TC-201 — Contact has no staff notification
| Field | Description |
|---|---|
| Test Case ID | TC-201 |
| Requirement ID | FR-083 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Contact has no staff notification |
| Test Type | Data Integrity |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Submit and check e-mail/WhatsApp/in-app notifications for staff. |
| Expected Result | Record that nothing is sent; escalate to Q-015. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: Q-015. |

##### TC-202 — ERP contact page metadata
| Field | Description |
|---|---|
| Test Case ID | TC-202 |
| Requirement ID | FR-084, FR-090 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | ERP contact page metadata |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/contact and /en/contact; read head. |
| Expected Result | Localised title and description; canonical /{locale}/contact; hreflang ar and en. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-203 — Pricing API values
| Field | Description |
|---|---|
| Test Case ID | TC-203 |
| Requirement ID | FR-085 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Pricing API values |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Role: anonymous. Global commission row exists. |
| Test Data | No account (anonymous request) |
| Steps | GET /api/v1/public/pricing; compare to the back-office commission settings. |
| Expected Result | Numbers match the settings; live true. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-080. |

##### TC-204 — Pricing fallback without commission row
| Field | Description |
|---|---|
| Test Case ID | TC-204 |
| Requirement ID | FR-085 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Pricing fallback without commission row |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous. Test environment where the row can be removed safely (or review by code). |
| Test Data | No account (anonymous request) |
| Steps | Remove or null the global row; call the API and open the page. |
| Expected Result | Code-default numbers with live false and no visible warning. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-124, GAP-025. |

##### TC-205 — Pricing page in both languages
| Field | Description |
|---|---|
| Test Case ID | TC-205 |
| Requirement ID | FR-085 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Pricing page in both languages |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/pricing and /en/pricing (ERP). |
| Expected Result | Same figures, localised text and number formatting. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: WF-023. |

##### TC-206 — FAQ page
| Field | Description |
|---|---|
| Test Case ID | TC-206 |
| Requirement ID | FR-086 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | FAQ page |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/faq, /en/faq. |
| Expected Result | Content renders; links work; metadata present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. |

##### TC-207 — Help index and article
| Field | Description |
|---|---|
| Test Case ID | TC-207 |
| Requirement ID | FR-087 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Help index and article |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/help; open each article from the list. |
| Expected Result | All articles render in both languages. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-081. |

##### TC-208 — Help unknown article
| Field | Description |
|---|---|
| Test Case ID | TC-208 |
| Requirement ID | FR-087 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Help unknown article |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/help/nope. |
| Expected Result | 404 not-found page. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-081. |

##### TC-209 — Changelog page
| Field | Description |
|---|---|
| Test Case ID | TC-209 |
| Requirement ID | FR-088 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Changelog page |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/changelog and /en/changelog. |
| Expected Result | Release notes render. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. |

##### TC-210 — Legal pages
| Field | Description |
|---|---|
| Test Case ID | TC-210 |
| Requirement ID | FR-089 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Legal pages |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/privacy, /ar/terms and English versions. |
| Expected Result | Text present, headings and dates; wording approval via Q-016. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-211 — Canonical and hreflang across ERP public pages
| Field | Description |
|---|---|
| Test Case ID | TC-211 |
| Requirement ID | FR-090 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Canonical and hreflang across ERP public pages |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: crawler. None. |
| Test Data | No account (anonymous request) |
| Steps | Read head of contact, pricing, faq, help, help article, changelog, privacy, terms, p/[handle]. |
| Expected Result | One canonical per page; hreflang ar and en; no self-conflict. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-125. |

##### TC-212 — www landing in both languages
| Field | Description |
|---|---|
| Test Case ID | TC-212 |
| Requirement ID | FR-091, FR-099 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www landing in both languages |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open www /ar and /en. |
| Expected Result | Content rendered; dir rtl/ltr; Readex Pro font; no layout break. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: WF-022. |

##### TC-213 — www role pages
| Field | Description |
|---|---|
| Test Case ID | TC-213 |
| Requirement ID | FR-092 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www role pages |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. Read apps/www/src/i18n/roles.ts for slugs. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/for/<slug> for each slug and an invalid slug. |
| Expected Result | Valid pages render; invalid 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-214 — www static pages
| Field | Description |
|---|---|
| Test Case ID | TC-214 |
| Requirement ID | FR-093 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www static pages |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open pricing, faq, trust, privacy, terms in ar and en. |
| Expected Result | All render with navigation and footer. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. |

##### TC-215 — www contact success
| Field | Description |
|---|---|
| Test Case ID | TC-215 |
| Requirement ID | FR-094 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www contact success |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. API reachable. |
| Test Data | No account (anonymous request) |
| Steps | Fill the www contact form (subject pricing) and submit. |
| Expected Result | Success confirmation; row stored via the API. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: WF-019. |

##### TC-216 — www contact validation and states
| Field | Description |
|---|---|
| Test Case ID | TC-216 |
| Requirement ID | FR-094 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www contact validation and states |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Submit with bad name, bad email, short message; then stop the API and submit; then exceed the rate limit. |
| Expected Result | Field errors; failed state on outage; limited state on 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-122, EC-123. |

##### TC-217 — www form omits demo and partnership subjects
| Field | Description |
|---|---|
| Test Case ID | TC-217 |
| Requirement ID | FR-094 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www form omits demo and partnership subjects |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Inspect the subject choices. |
| Expected Result | Only pricing, support, other offered; compare with the API list. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: GAP-020. |

##### TC-218 — Shared rate-limit bucket through the www proxy
| Field | Description |
|---|---|
| Test Case ID | TC-218 |
| Requirement ID | FR-094 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Shared rate-limit bucket through the www proxy |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: anonymous from distinct IPs. Two different client IPs (two networks). |
| Test Data | Seeded account(s) for: anonymous from distinct IPs (QA_TEST_PLAN §5.4) |
| Steps | From client 1 send 5 www form submissions in a minute; from client 2 send 1. |
| Expected Result | Record whether client 2 is refused (shared bucket) or served. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: GAP-028. |

##### TC-219 — www locale redirect
| Field | Description |
|---|---|
| Test Case ID | TC-219 |
| Requirement ID | FR-095 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www locale redirect |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Request / , /pricing, /contact without a locale (use curl -I). |
| Expected Result | 307 redirect to /ar/... or /en/... according to rules; default ar. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-083. |

##### TC-220 — www sitemap and robots
| Field | Description |
|---|---|
| Test Case ID | TC-220 |
| Requirement ID | FR-096 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www sitemap and robots |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: crawler. None. |
| Test Data | No account (anonymous request) |
| Steps | Fetch /sitemap.xml and /robots.txt. |
| Expected Result | Every public route per locale with ar, en and x-default; robots allows all and names the sitemap. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: BR-084. |

##### TC-221 — www 404
| Field | Description |
|---|---|
| Test Case ID | TC-221 |
| Requirement ID | FR-097 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www 404 |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Open /ar/nope, /nope, /ar/for/teacher (if not a slug). |
| Expected Result | Unprefixed redirects then 404; localised not-found page. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-128. |

##### TC-222 — www catalogue copy matches the product
| Field | Description |
|---|---|
| Test Case ID | TC-222 |
| Requirement ID | FR-098 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | www catalogue copy matches the product |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. Catalog tree output. |
| Test Data | No account (anonymous request) |
| Steps | Compare stages, grades and subjects on www with the API tree. |
| Expected Result | Record each difference. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: GAP-027. |

##### TC-223 — RTL rendering and bidi
| Field | Description |
|---|---|
| Test Case ID | TC-223 |
| Requirement ID | FR-099 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | RTL rendering and bidi |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Role: anonymous. Phone, e-mail, codes in Arabic text. |
| Test Data | No account (anonymous request) |
| Steps | Inspect www and ERP marketing pages in Arabic at 1280 px and 375 px. |
| Expected Result | No overlap or horizontal scroll; Latin tokens and numbers display correctly. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P1. Also covers: EC-129, EC-130. |

##### TC-224 — Descoped features absent from public surfaces
| Field | Description |
|---|---|
| Test Case ID | TC-224 |
| Requirement ID | FR-091 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Descoped features absent from public surfaces |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Search the text of www and ERP public pages for AI assistant, scholarships, bookstore, video lessons, pay later. |
| Expected Result | None promised. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: BR-086. |

##### TC-225 — Retired host name absent
| Field | Description |
|---|---|
| Test Case ID | TC-225 |
| Requirement ID | FR-065 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Retired host name absent |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | Role: anonymous. None. |
| Test Data | No account (anonymous request) |
| Steps | Search page source, sitemap and metadata for app.edura.eg. |
| Expected Result | No occurrence. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: BR-085. |

##### TC-226 — Scan limit on very common two-character queries
| Field | Description |
|---|---|
| Test Case ID | TC-226 |
| Requirement ID | FR-074 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Scan limit on very common two-character queries |
| Test Type | Functional / API |
| Priority | Low |
| Preconditions | Role: center_admin. Centre with more than 120 students sharing a two-character fragment (demo seed acceptable). |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search the fragment; read hits; add a more specific term and search again. |
| Expected Result | At most 5 hits shown; hits come from the first 120 candidates only; a more specific query reaches a record outside that window. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: BR-044, EC-088. |

##### TC-227 — Suspended or deleted users inside search results
| Field | Description |
|---|---|
| Test Case ID | TC-227 |
| Requirement ID | FR-077 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Suspended or deleted users inside search results |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Role: center_admin. A student and a teacher of the centre, later suspended or soft-deleted. |
| Test Data | Seeded account(s) for: center_admin (QA_TEST_PLAN §5.4) |
| Steps | Search their names before and after the status change. |
| Expected Result | Record whether they still appear and with what status; expected behaviour pending Q-018. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P2. Also covers: EC-089, Q-018. |

##### TC-228 — Full and over-subscribed course display
| Field | Description |
|---|---|
| Test Case ID | TC-228 |
| Requirement ID | FR-057 |
| Module | Catalog, Discovery, Search & Public Site |
| Test Scenario | Full and over-subscribed course display |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | Role: anonymous. Course at capacity. |
| Test Data | No account (anonymous request) |
| Steps | Open the course page and the search card. |
| Expected Result | Remaining seats show 0 and never negative; request enrollment behaves per Q-013. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Original priority P3. Also covers: EC-107. |

### 3. Center Administration

Environment: run in `dev` or `test` only, never `production` (CLAUDE.md, environment labels). Use mock delivery drivers (WhatsApp, email) and mock media where noted.

Accounts (dev demo data; refer by role, password: see docs/guides/test-credentials.md): **ADM-A** center_admin of Center A; **REC-A** receptionist, **MGR-A** manager, **ACC-A** center_accountant — all center_staff of Center A; a teacher, a student and a parent account. **Center B** is any other center with its own roster. Phone numbers, national IDs and emails in test data are test values created for the run.

API paths are under `/api/v1`. Messages quoted are the exact server strings cited in fr.md. A row whose expected result begins "Expected (recommended)" tests a recorded gap: it is expected to FAIL against current code.

Priority: Critical = money / auth / authz / child safety / data integrity; High = core daily workflow; Medium = secondary; Low = cosmetic or public read.

##### TC-229 — Manager reaches a manager-allowed route
| Field | Value |
|---|---|
| Test Case ID | TC-229 |
| Requirement ID | FR-100 |
| Module | Center Administration |
| Test Scenario | Manager reaches a manager-allowed route |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | — |
| Steps | GET /rooms |
| Expected Result | 200; only Center A rooms returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence center-actor.ts:49-75 |

##### TC-230 — Receptionist blocked from a manager-only route
| Field | Value |
|---|---|
| Test Case ID | TC-230 |
| Requirement ID | FR-100 |
| Module | Center Administration |
| Test Scenario | Receptionist blocked from a manager-only route |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | GET /rooms |
| Expected Result | 403 "Center staff role 'receptionist' is not allowed on this route" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-231 — Removed staff member loses access on next request
| Field | Value |
|---|---|
| Test Case ID | TC-231 |
| Requirement ID | FR-100 |
| Module | Center Administration |
| Test Scenario | Removed staff member loses access on next request |
| Test Type | Security |
| Priority | Critical |
| Preconditions | REC-A removed by ADM-A (DELETE /center/staff/[id]) while REC-A session stays open |
| Test Data | — |
| Steps | As REC-A: GET /roster/students |
| Expected Result | 403 "Staff account is not linked to a center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Live lookup removed_at IS NULL (center-actor.ts:36-45) |

##### TC-232 — Teacher or student calling a center route
| Field | Value |
|---|---|
| Test Case ID | TC-232 |
| Requirement ID | FR-100 |
| Module | Center Administration |
| Test Scenario | Teacher or student calling a center route |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as teacher (or student) |
| Test Data | — |
| Steps | GET /roster/students |
| Expected Result | 403 forbidden |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-233 — Staff mutation writes one audit row
| Field | Value |
|---|---|
| Test Case ID | TC-233 |
| Requirement ID | FR-101 |
| Module | Center Administration |
| Test Scenario | Staff mutation writes one audit row |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | New phone 01xxxxxxxxx (test value) |
| Steps | POST /center/walk-in; then as ADM-A GET /center/audit-logs?action=center_staff.post |
| Expected Result | Exactly one row action center_staff.post, afterState.path=/api/v1/center/walk-in, staffRole receptionist |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-234 — Failed staff mutation writes no audit row
| Field | Value |
|---|---|
| Test Case ID | TC-234 |
| Requirement ID | FR-101 |
| Module | Center Administration |
| Test Scenario | Failed staff mutation writes no audit row |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | Phone of a teacher account |
| Steps | POST /center/walk-in with the teacher's phone |
| Expected Result | 422 "This phone belongs to a non-student account"; no new center_staff.* audit row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Audit only on res.ok (center-actor.ts:136-138) |

##### TC-235 — center_admin mutation is not wrapper-audited
| Field | Value |
|---|---|
| Test Case ID | TC-235 |
| Requirement ID | FR-101 |
| Module | Center Administration |
| Test Scenario | center_admin mutation is not wrapper-audited |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | Signed in as ADM-A |
| Test Data | Room payload |
| Steps | PATCH /rooms/[id]; read audit log |
| Expected Result | No center_staff.* row (records current behaviour) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-037 |

##### TC-236 — Accountant can read allowed routes
| Field | Value |
|---|---|
| Test Case ID | TC-236 |
| Requirement ID | FR-102 |
| Module | Center Administration |
| Test Scenario | Accountant can read allowed routes |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as ACC-A |
| Test Data | — |
| Steps | GET an ACCOUNTANT-allowed read (off-system teacher balances) |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-237 — Accountant mutation refused
| Field | Value |
|---|---|
| Test Case ID | TC-237 |
| Requirement ID | FR-102 |
| Module | Center Administration |
| Test Scenario | Accountant mutation refused |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as ACC-A |
| Test Data | Note body "x" |
| Steps | POST /team-notes |
| Expected Result | 403 "Center accountant is read-only"; no note created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-238 — Admin views own center profile
| Field | Value |
|---|---|
| Test Case ID | TC-238 |
| Requirement ID | FR-103 |
| Module | Center Administration |
| Test Scenario | Admin views own center profile |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | — |
| Steps | GET /centers/me |
| Expected Result | 200 with Center A fields |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-239 — Admin updates center profile
| Field | Value |
|---|---|
| Test Case ID | TC-239 |
| Requirement ID | FR-104 |
| Module | Center Administration |
| Test Scenario | Admin updates center profile |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Valid new description |
| Steps | PATCH /centers/me; GET /centers/me |
| Expected Result | 200; change persisted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-240 — Malformed body refused
| Field | Value |
|---|---|
| Test Case ID | TC-240 |
| Requirement ID | FR-104 |
| Module | Center Administration |
| Test Scenario | Malformed body refused |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Body: not JSON |
| Steps | PATCH /centers/me |
| Expected Result | 400 "Invalid JSON body" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-241 — Out-of-range coordinates accepted (records gap)
| Field | Value |
|---|---|
| Test Case ID | TC-241 |
| Requirement ID | FR-104 |
| Module | Center Administration |
| Test Scenario | Out-of-range coordinates accepted (records gap) |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | latitude 999 |
| Steps | PATCH /centers/me |
| Expected Result | Expected per recommendation: 400. Current code has no range check |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-045 |

##### TC-242 — Manager uploads and removes logo
| Field | Value |
|---|---|
| Test Case ID | TC-242 |
| Requirement ID | FR-105 |
| Module | Center Administration |
| Test Scenario | Manager uploads and removes logo |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as MGR-A; media configured |
| Test Data | PNG under 4 MB |
| Steps | POST /centers/me/logo (field file); DELETE /centers/me/logo |
| Expected Result | 200 each; logo set then cleared |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-243 — Receptionist cannot change logo
| Field | Value |
|---|---|
| Test Case ID | TC-243 |
| Requirement ID | FR-105 |
| Module | Center Administration |
| Test Scenario | Receptionist cannot change logo |
| Test Type | Security |
| Priority | Medium |
| Preconditions | Signed in as REC-A |
| Test Data | PNG |
| Steps | POST /centers/me/logo |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-244 — Public profile readable without login
| Field | Value |
|---|---|
| Test Case ID | TC-244 |
| Requirement ID | FR-106 |
| Module | Center Administration |
| Test Scenario | Public profile readable without login |
| Test Type | Functional |
| Priority | Low |
| Preconditions | Not signed in |
| Test Data | Center A id |
| Steps | GET /centers/[id] |
| Expected Result | 200 public fields only; served from 60 s cache |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | route.ts:5 |

##### TC-245 — Unknown center id
| Field | Value |
|---|---|
| Test Case ID | TC-245 |
| Requirement ID | FR-106 |
| Module | Center Administration |
| Test Scenario | Unknown center id |
| Test Type | Negative |
| Priority | Low |
| Preconditions | Not signed in |
| Test Data | Random UUID |
| Steps | GET /centers/[id] |
| Expected Result | 404 "Resource not found" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-246 — Admin lists co-admins
| Field | Value |
|---|---|
| Test Case ID | TC-246 |
| Requirement ID | FR-107 |
| Module | Center Administration |
| Test Scenario | Admin lists co-admins |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | — |
| Steps | GET /centers/me/admins |
| Expected Result | 200 list including ADM-A |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | No UI (ui.md) |

##### TC-247 — Invite existing admin refused
| Field | Value |
|---|---|
| Test Case ID | TC-247 |
| Requirement ID | FR-108 |
| Module | Center Administration |
| Test Scenario | Invite existing admin refused |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | ADM-A's own email |
| Steps | POST /centers/me/admins/invite |
| Expected Result | 409 "User is already an admin of this center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Acceptance path unconfirmed: GAP-033, Q-023 |

##### TC-248 — Admin removes a co-admin
| Field | Value |
|---|---|
| Test Case ID | TC-248 |
| Requirement ID | FR-109 |
| Module | Center Administration |
| Test Scenario | Admin removes a co-admin |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Center A has two admins |
| Test Data | Second admin user id |
| Steps | DELETE /centers/me/admins/[userId] |
| Expected Result | 200; admin no longer listed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-249 — Admin cannot remove self
| Field | Value |
|---|---|
| Test Case ID | TC-249 |
| Requirement ID | FR-109 |
| Module | Center Administration |
| Test Scenario | Admin cannot remove self |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Signed in as ADM-A |
| Test Data | Own user id |
| Steps | DELETE /centers/me/admins/[ownId] |
| Expected Result | 403 "You cannot remove yourself as admin" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-250 — Removed co-admin session still reaches center
| Field | Value |
|---|---|
| Test Case ID | TC-250 |
| Requirement ID | FR-109 |
| Module | Center Administration |
| Test Scenario | Removed co-admin session still reaches center |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Co-admin signed in before removal |
| Test Data | — |
| Steps | Remove co-admin; as co-admin GET /centers/me |
| Expected Result | Expected (recommended): 401/403. Current: still 200 until session ends |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-032 |

##### TC-251 — Admin lists staff
| Field | Value |
|---|---|
| Test Case ID | TC-251 |
| Requirement ID | FR-110 |
| Module | Center Administration |
| Test Scenario | Admin lists staff |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | — |
| Steps | GET /center/staff |
| Expected Result | 200 list of Center A staff only |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-252 — Admin creates receptionist and invite is sent
| Field | Value |
|---|---|
| Test Case ID | TC-252 |
| Requirement ID | FR-111 |
| Module | Center Administration |
| Test Scenario | Admin creates receptionist and invite is sent |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as ADM-A |
| Test Data | New email (test value), role receptionist |
| Steps | POST /center/staff |
| Expected Result | 201; staff row created; invite queued |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-253 — Duplicate staff member refused
| Field | Value |
|---|---|
| Test Case ID | TC-253 |
| Requirement ID | FR-111 |
| Module | Center Administration |
| Test Scenario | Duplicate staff member refused |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Staff email already on team |
| Test Data | Same email |
| Steps | POST /center/staff |
| Expected Result | 409 "This staff member is already on your team" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-254 — Staff active at another center refused
| Field | Value |
|---|---|
| Test Case ID | TC-254 |
| Requirement ID | FR-111 |
| Module | Center Administration |
| Test Scenario | Staff active at another center refused |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Email is active staff at Center B |
| Test Data | That email |
| Steps | POST /center/staff |
| Expected Result | 422 "...already active at another center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-255 — Resend invite
| Field | Value |
|---|---|
| Test Case ID | TC-255 |
| Requirement ID | FR-112 |
| Module | Center Administration |
| Test Scenario | Resend invite |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Staff without password |
| Test Data | Staff id |
| Steps | POST /center/staff/[id]/invite |
| Expected Result | 200; invite re-sent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-256 — Resend rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-256 |
| Requirement ID | FR-112 |
| Module | Center Administration |
| Test Scenario | Resend rate limit |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Same id |
| Steps | Call 11 times within the window |
| Expected Result | 11th returns 429 "Too many requests, please slow down.", Retry-After 60 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | 10/10 limit |

##### TC-257 — Admin changes staff role
| Field | Value |
|---|---|
| Test Case ID | TC-257 |
| Requirement ID | FR-113 |
| Module | Center Administration |
| Test Scenario | Admin changes staff role |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Receptionist on team |
| Test Data | role manager |
| Steps | PATCH /center/staff/[id] |
| Expected Result | 200; next request by that user has manager access |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-258 — Staff of another center not editable
| Field | Value |
|---|---|
| Test Case ID | TC-258 |
| Requirement ID | FR-113 |
| Module | Center Administration |
| Test Scenario | Staff of another center not editable |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Staff id belongs to Center B |
| Test Data | — |
| Steps | PATCH /center/staff/[id] |
| Expected Result | 404 "Staff member not found on your team" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-259 — Deactivated staff loses access
| Field | Value |
|---|---|
| Test Case ID | TC-259 |
| Requirement ID | FR-113 |
| Module | Center Administration |
| Test Scenario | Deactivated staff loses access |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Receptionist signed in |
| Test Data | active=false |
| Steps | PATCH; then as receptionist GET /roster/students |
| Expected Result | 403 on the receptionist's request |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | active:false sets removedAt (SV/center/staff.ts:345-412) |

##### TC-260 — Admin removes staff via API
| Field | Value |
|---|---|
| Test Case ID | TC-260 |
| Requirement ID | FR-114 |
| Module | Center Administration |
| Test Scenario | Admin removes staff via API |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Receptionist on team |
| Test Data | Staff id |
| Steps | DELETE /center/staff/[id] |
| Expected Result | 200; removed_at set; staff loses access |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | UI never calls DELETE (ui.md) |

##### TC-261 — Remove unknown staff
| Field | Value |
|---|---|
| Test Case ID | TC-261 |
| Requirement ID | FR-114 |
| Module | Center Administration |
| Test Scenario | Remove unknown staff |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Signed in as ADM-A |
| Test Data | Random UUID |
| Steps | DELETE /center/staff/[id] |
| Expected Result | 404 "Staff member not found on your team" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-262 — Staff reads own profile
| Field | Value |
|---|---|
| Test Case ID | TC-262 |
| Requirement ID | FR-115 |
| Module | Center Administration |
| Test Scenario | Staff reads own profile |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | GET /center/staff/me |
| Expected Result | 200 with sub-role receptionist and center A |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-263 — Receptionist lists roster with search
| Field | Value |
|---|---|
| Test Case ID | TC-263 |
| Requirement ID | FR-116 |
| Module | Center Administration |
| Test Scenario | Receptionist lists roster with search |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | q = part of a student name |
| Steps | GET /roster/students?q= |
| Expected Result | 200; only Center A active roster rows |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-264 — Accountant cannot list roster
| Field | Value |
|---|---|
| Test Case ID | TC-264 |
| Requirement ID | FR-116 |
| Module | Center Administration |
| Test Scenario | Accountant cannot list roster |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as ACC-A |
| Test Data | — |
| Steps | GET /roster/students |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-265 — Add existing student to roster
| Field | Value |
|---|---|
| Test Case ID | TC-265 |
| Requirement ID | FR-117 |
| Module | Center Administration |
| Test Scenario | Add existing student to roster |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A; student not on roster |
| Test Data | Student id |
| Steps | POST /roster/students |
| Expected Result | 201; student on roster |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-266 — Add duplicate roster student
| Field | Value |
|---|---|
| Test Case ID | TC-266 |
| Requirement ID | FR-117 |
| Module | Center Administration |
| Test Scenario | Add duplicate roster student |
| Test Type | Negative |
| Priority | High |
| Preconditions | Student already on roster |
| Test Data | Same id |
| Steps | POST /roster/students |
| Expected Result | 409 "Student already in roster" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-267 — Shell account refused
| Field | Value |
|---|---|
| Test Case ID | TC-267 |
| Requirement ID | FR-117 |
| Module | Center Administration |
| Test Scenario | Shell account refused |
| Test Type | Negative |
| Priority | High |
| Preconditions | Shell student id |
| Test Data | — |
| Steps | POST /roster/students |
| Expected Result | 422 "Use invite for shell accounts" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-268 — View roster student
| Field | Value |
|---|---|
| Test Case ID | TC-268 |
| Requirement ID | FR-118 |
| Module | Center Administration |
| Test Scenario | View roster student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student on Center A roster |
| Test Data | Student id |
| Steps | GET /roster/students/[id] |
| Expected Result | 200 with roster detail |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-269 — Student of another center not visible
| Field | Value |
|---|---|
| Test Case ID | TC-269 |
| Requirement ID | FR-118 |
| Module | Center Administration |
| Test Scenario | Student of another center not visible |
| Test Type | Security |
| Priority | High |
| Preconditions | Student only on Center B roster |
| Test Data | Student id |
| Steps | GET /roster/students/[id] |
| Expected Result | 404 "Student not in roster" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-270 — Removed student still readable (records gap)
| Field | Value |
|---|---|
| Test Case ID | TC-270 |
| Requirement ID | FR-118 |
| Module | Center Administration |
| Test Scenario | Removed student still readable (records gap) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Student removed (leftAt set) |
| Test Data | Student id |
| Steps | GET /roster/students/[id] |
| Expected Result | Expected (recommended): 404. Current: 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-040 |

##### TC-271 — Manager corrects student contact
| Field | Value |
|---|---|
| Test Case ID | TC-271 |
| Requirement ID | FR-119 |
| Module | Center Administration |
| Test Scenario | Manager corrects student contact |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | New phone |
| Steps | PATCH /roster/students/[id] |
| Expected Result | 200; change persisted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-272 — Email collision refused
| Field | Value |
|---|---|
| Test Case ID | TC-272 |
| Requirement ID | FR-119 |
| Module | Center Administration |
| Test Scenario | Email collision refused |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Another user owns the email |
| Test Data | That email |
| Steps | PATCH /roster/students/[id] |
| Expected Result | 409 "Email already in use" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-273 — Receptionist cannot edit
| Field | Value |
|---|---|
| Test Case ID | TC-273 |
| Requirement ID | FR-119 |
| Module | Center Administration |
| Test Scenario | Receptionist cannot edit |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | Any field |
| Steps | PATCH /roster/students/[id] |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-274 — Admin removes student from roster
| Field | Value |
|---|---|
| Test Case ID | TC-274 |
| Requirement ID | FR-120 |
| Module | Center Administration |
| Test Scenario | Admin removes student from roster |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student on roster |
| Test Data | Student id |
| Steps | DELETE /roster/students/[id] |
| Expected Result | 200; leftAt set; student absent from list |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-275 — Staff cannot remove
| Field | Value |
|---|---|
| Test Case ID | TC-275 |
| Requirement ID | FR-120 |
| Module | Center Administration |
| Test Scenario | Staff cannot remove |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | Student id |
| Steps | DELETE /roster/students/[id] |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-276 — Lookup by phone
| Field | Value |
|---|---|
| Test Case ID | TC-276 |
| Requirement ID | FR-121 |
| Module | Center Administration |
| Test Scenario | Lookup by phone |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | Known student phone |
| Steps | POST /roster/students/lookup |
| Expected Result | 200 result per lookup masking rules |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-277 — Lookup rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-277 |
| Requirement ID | FR-121 |
| Module | Center Administration |
| Test Scenario | Lookup rate limit |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | Any value |
| Steps | 21 calls in the window |
| Expected Result | 21st returns 429, Retry-After 60 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | 20/20 |

##### TC-278 — Invite with active email refused
| Field | Value |
|---|---|
| Test Case ID | TC-278 |
| Requirement ID | FR-122 |
| Module | Center Administration |
| Test Scenario | Invite with active email refused |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Email of an active student |
| Steps | POST /roster/students/invite |
| Expected Result | 422 "Active user with this email exists; use lookup instead" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-044, Q-031 |

##### TC-279 — Admin lists roster teachers
| Field | Value |
|---|---|
| Test Case ID | TC-279 |
| Requirement ID | FR-123 |
| Module | Center Administration |
| Test Scenario | Admin lists roster teachers |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | — |
| Steps | GET /roster/teachers |
| Expected Result | 200 Center A affiliations only |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-280 — Teacher lookup by email
| Field | Value |
|---|---|
| Test Case ID | TC-280 |
| Requirement ID | FR-124 |
| Module | Center Administration |
| Test Scenario | Teacher lookup by email |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Known teacher email |
| Steps | POST /roster/teachers/lookup |
| Expected Result | 200 result |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-281 — Invite registered teacher refused
| Field | Value |
|---|---|
| Test Case ID | TC-281 |
| Requirement ID | FR-125 |
| Module | Center Administration |
| Test Scenario | Invite registered teacher refused |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | Email of a registered teacher |
| Steps | POST /roster/teachers/invite |
| Expected Result | 409 "This teacher is already registered — send them a collaboration request instead" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-282 — Teacher with active courses not removable
| Field | Value |
|---|---|
| Test Case ID | TC-282 |
| Requirement ID | FR-126 |
| Module | Center Administration |
| Test Scenario | Teacher with active courses not removable |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Teacher has active course at Center A |
| Test Data | Teacher id |
| Steps | DELETE /roster/teachers/[id] |
| Expected Result | 422 "Cannot remove teacher with active courses" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-283 — New phone registers a walk-in
| Field | Value |
|---|---|
| Test Case ID | TC-283 |
| Requirement ID | FR-127 |
| Module | Center Administration |
| Test Scenario | New phone registers a walk-in |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as REC-A; WhatsApp mock driver |
| Test Data | New phone + guardian phone (test values) |
| Steps | POST /center/walk-in |
| Expected Result | 201; student code shown; temp student rostered; walk_in_welcome queued |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-284 — Phone of another center's student
| Field | Value |
|---|---|
| Test Case ID | TC-284 |
| Requirement ID | FR-127 |
| Module | Center Administration |
| Test Scenario | Phone of another center's student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Phone belongs to a Center B student |
| Test Data | That phone |
| Steps | POST /center/walk-in |
| Expected Result | Masked name, no code or id; nothing sent; not attached to Center A |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-285 — Phone of a non-student account
| Field | Value |
|---|---|
| Test Case ID | TC-285 |
| Requirement ID | FR-127 |
| Module | Center Administration |
| Test Scenario | Phone of a non-student account |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Phone belongs to a teacher |
| Test Data | That phone |
| Steps | POST /center/walk-in |
| Expected Result | 422 "This phone belongs to a non-student account" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-286 — Walk-in rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-286 |
| Requirement ID | FR-127 |
| Module | Center Administration |
| Test Scenario | Walk-in rate limit |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | 31 calls in the window |
| Expected Result | 31st returns 429 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | 30/30 |

##### TC-287 — Resend walk-in claim
| Field | Value |
|---|---|
| Test Case ID | TC-287 |
| Requirement ID | FR-128 |
| Module | Center Administration |
| Test Scenario | Resend walk-in claim |
| Test Type | Functional |
| Priority | High |
| Preconditions | Walk-in student on roster with phone |
| Test Data | Student id |
| Steps | POST /center/walk-in/resend |
| Expected Result | 200; message queued |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-288 — Student without phone
| Field | Value |
|---|---|
| Test Case ID | TC-288 |
| Requirement ID | FR-128 |
| Module | Center Administration |
| Test Scenario | Student without phone |
| Test Type | Negative |
| Priority | High |
| Preconditions | Roster student has no phone |
| Test Data | Student id |
| Steps | POST /center/walk-in/resend |
| Expected Result | 422 "Student has no phone number" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-289 — Create temp student
| Field | Value |
|---|---|
| Test Case ID | TC-289 |
| Requirement ID | FR-129 |
| Module | Center Administration |
| Test Scenario | Create temp student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | Name + new phone |
| Steps | POST /center/temp-students |
| Expected Result | 201; shell student with invite code |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-290 — Phone of registered user refused
| Field | Value |
|---|---|
| Test Case ID | TC-290 |
| Requirement ID | FR-129 |
| Module | Center Administration |
| Test Scenario | Phone of registered user refused |
| Test Type | Negative |
| Priority | High |
| Preconditions | Phone belongs to a registered user |
| Test Data | That phone |
| Steps | POST /center/temp-students |
| Expected Result | 409 "A registered user already has this phone — use lookup to link instead" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-291 — Teacher creates temp student on shared route
| Field | Value |
|---|---|
| Test Case ID | TC-291 |
| Requirement ID | FR-130 |
| Module | Center Administration |
| Test Scenario | Teacher creates temp student on shared route |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as teacher |
| Test Data | Name + new phone |
| Steps | POST /temp-students |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-292 — center_staff refused on shared route
| Field | Value |
|---|---|
| Test Case ID | TC-292 |
| Requirement ID | FR-130 |
| Module | Center Administration |
| Test Scenario | center_staff refused on shared route |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | Name + phone |
| Steps | POST /temp-students |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-293 — Send temp student invite
| Field | Value |
|---|---|
| Test Case ID | TC-293 |
| Requirement ID | FR-131 |
| Module | Center Administration |
| Test Scenario | Send temp student invite |
| Test Type | Functional |
| Priority | High |
| Preconditions | Invited temp student exists |
| Test Data | Temp id |
| Steps | POST /temp-students/[id]/send-invite |
| Expected Result | 200; invite queued |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-294 — Not an invited temp student
| Field | Value |
|---|---|
| Test Case ID | TC-294 |
| Requirement ID | FR-131 |
| Module | Center Administration |
| Test Scenario | Not an invited temp student |
| Test Type | Negative |
| Priority | High |
| Preconditions | Regular student id |
| Test Data | — |
| Steps | POST /temp-students/[id]/send-invite |
| Expected Result | 422 "This student is not an invited temp student" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-295 — Student claims temp record
| Field | Value |
|---|---|
| Test Case ID | TC-295 |
| Requirement ID | FR-132 |
| Module | Center Administration |
| Test Scenario | Student claims temp record |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as student with profile; valid code |
| Test Data | Invite code |
| Steps | POST /temp-students/claim |
| Expected Result | 200; record merged into the student |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-296 — Unknown code
| Field | Value |
|---|---|
| Test Case ID | TC-296 |
| Requirement ID | FR-132 |
| Module | Center Administration |
| Test Scenario | Unknown code |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Signed in as student |
| Test Data | Random code |
| Steps | POST /temp-students/claim |
| Expected Result | 404 "Invite code not found" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-297 — Claim rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-297 |
| Requirement ID | FR-132 |
| Module | Center Administration |
| Test Scenario | Claim rate limit |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as student |
| Test Data | Random codes |
| Steps | 11 calls in window |
| Expected Result | 11th returns 429 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | 10/10 |

##### TC-298 — CSV with recognised name column parses
| Field | Value |
|---|---|
| Test Case ID | TC-298 |
| Requirement ID | FR-133 |
| Module | Center Administration |
| Test Scenario | CSV with recognised name column parses |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | CSV with name, phone columns |
| Steps | POST /center/students/import dryRun=true |
| Expected Result | 200 per-row preview |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-299 — Empty file
| Field | Value |
|---|---|
| Test Case ID | TC-299 |
| Requirement ID | FR-133 |
| Module | Center Administration |
| Test Scenario | Empty file |
| Test Type | Negative |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | Empty csv |
| Steps | POST /center/students/import |
| Expected Result | 400 "The file is empty" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-300 — Dry run writes nothing
| Field | Value |
|---|---|
| Test Case ID | TC-300 |
| Requirement ID | FR-134 |
| Module | Center Administration |
| Test Scenario | Dry run writes nothing |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | CSV 5 rows |
| Steps | POST import dryRun=true; GET /roster/students |
| Expected Result | would_create rows; roster unchanged; no audit row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-301 — Commit creates and writes one audit row
| Field | Value |
|---|---|
| Test Case ID | TC-301 |
| Requirement ID | FR-134 |
| Module | Center Administration |
| Test Scenario | Commit creates and writes one audit row |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | CSV 5 new rows |
| Steps | POST import dryRun=false |
| Expected Result | 5 created; one center.students_imported audit row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-302 — Re-run reports already_exists
| Field | Value |
|---|---|
| Test Case ID | TC-302 |
| Requirement ID | FR-134 |
| Module | Center Administration |
| Test Scenario | Re-run reports already_exists |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | Previous commit done |
| Test Data | Same CSV |
| Steps | POST import dryRun=false |
| Expected Result | Rows already_exists; no duplicates |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-303 — Over 1000 rows refused
| Field | Value |
|---|---|
| Test Case ID | TC-303 |
| Requirement ID | FR-134 |
| Module | Center Administration |
| Test Scenario | Over 1000 rows refused |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | CSV 1001 rows |
| Steps | POST import |
| Expected Result | 422 row-limit message |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | MAX_IMPORT_ROWS |

##### TC-304 — Commit matching Center B student
| Field | Value |
|---|---|
| Test Case ID | TC-304 |
| Requirement ID | FR-134 |
| Module | Center Administration |
| Test Scenario | Commit matching Center B student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Row national ID matches a Center B student |
| Test Data | That ID |
| Steps | POST import dryRun=false |
| Expected Result | Expected (recommended): masked, not attached. Current: attached and code returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-038 |

##### TC-305 — View guardian contact writes audit
| Field | Value |
|---|---|
| Test Case ID | TC-305 |
| Requirement ID | FR-135 |
| Module | Center Administration |
| Test Scenario | View guardian contact writes audit |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | Signed in as REC-A; roster student |
| Test Data | Student id |
| Steps | GET /center/students/[id]/guardian-contact |
| Expected Result | 200; audit student.guardian_contact_viewed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-306 — Student of another center
| Field | Value |
|---|---|
| Test Case ID | TC-306 |
| Requirement ID | FR-135 |
| Module | Center Administration |
| Test Scenario | Student of another center |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Center B student id |
| Test Data | — |
| Steps | GET guardian-contact |
| Expected Result | 404 "Student not found" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-307 — Rate limit per path
| Field | Value |
|---|---|
| Test Case ID | TC-307 |
| Requirement ID | FR-135 |
| Module | Center Administration |
| Test Scenario | Rate limit per path |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | 20 different ids |
| Steps | GET each once |
| Expected Result | Not limited jointly (records GAP-043) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Per-path key |

##### TC-308 — Set guardian contact
| Field | Value |
|---|---|
| Test Case ID | TC-308 |
| Requirement ID | FR-136 |
| Module | Center Administration |
| Test Scenario | Set guardian contact |
| Test Type | Functional |
| Priority | High |
| Preconditions | Roster student |
| Test Data | Guardian phone (test) |
| Steps | POST guardian-contact |
| Expected Result | 200; stored |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-309 — Invalid body
| Field | Value |
|---|---|
| Test Case ID | TC-309 |
| Requirement ID | FR-136 |
| Module | Center Administration |
| Test Scenario | Invalid body |
| Test Type | Negative |
| Priority | High |
| Preconditions | Roster student |
| Test Data | Bad phone |
| Steps | POST guardian-contact |
| Expected Result | 400 validation_error |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-310 — Admin lists blacklist
| Field | Value |
|---|---|
| Test Case ID | TC-310 |
| Requirement ID | FR-137 |
| Module | Center Administration |
| Test Scenario | Admin lists blacklist |
| Test Type | Functional |
| Priority | High |
| Preconditions | Entry created via POST /center/blacklist |
| Test Data | — |
| Steps | GET /center/blacklist |
| Expected Result | 200; entry listed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-311 — Roster-flag blacklist not listed
| Field | Value |
|---|---|
| Test Case ID | TC-311 |
| Requirement ID | FR-137 |
| Module | Center Administration |
| Test Scenario | Roster-flag blacklist not listed |
| Test Type | Negative |
| Priority | High |
| Preconditions | Student flagged via roster PATCH blacklisted=true |
| Test Data | — |
| Steps | GET /center/blacklist |
| Expected Result | Entry absent (records GAP-034) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-312 — Blacklist with reason
| Field | Value |
|---|---|
| Test Case ID | TC-312 |
| Requirement ID | FR-138 |
| Module | Center Administration |
| Test Scenario | Blacklist with reason |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Roster student |
| Test Data | reason text |
| Steps | POST /center/blacklist |
| Expected Result | 201; entry; enrollments refused; notification sent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-313 — Missing reason
| Field | Value |
|---|---|
| Test Case ID | TC-313 |
| Requirement ID | FR-138 |
| Module | Center Administration |
| Test Scenario | Missing reason |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Roster student |
| Test Data | reason empty |
| Steps | POST /center/blacklist |
| Expected Result | 422 "Reason is required" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-314 — Already blacklisted
| Field | Value |
|---|---|
| Test Case ID | TC-314 |
| Requirement ID | FR-138 |
| Module | Center Administration |
| Test Scenario | Already blacklisted |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Entry exists |
| Test Data | Same student |
| Steps | POST /center/blacklist |
| Expected Result | 409 "Student is already blacklisted at this center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-315 — Admin lifts entry
| Field | Value |
|---|---|
| Test Case ID | TC-315 |
| Requirement ID | FR-139 |
| Module | Center Administration |
| Test Scenario | Admin lifts entry |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Active entry |
| Test Data | Entry id |
| Steps | DELETE /center/blacklist/[id] |
| Expected Result | 200; cascade reversed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-316 — Platform entry not liftable
| Field | Value |
|---|---|
| Test Case ID | TC-316 |
| Requirement ID | FR-139 |
| Module | Center Administration |
| Test Scenario | Platform entry not liftable |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Platform-level entry id |
| Test Data | — |
| Steps | DELETE /center/blacklist/[id] |
| Expected Result | 403 "Only super_admin can lift a platform blacklist" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-317 — Admin browses audit log with filters
| Field | Value |
|---|---|
| Test Case ID | TC-317 |
| Requirement ID | FR-140 |
| Module | Center Administration |
| Test Scenario | Admin browses audit log with filters |
| Test Type | Functional |
| Priority | High |
| Preconditions | Audit rows exist |
| Test Data | action filter |
| Steps | GET /center/audit-logs?action=&page=1&limit=50 |
| Expected Result | 200; only Center A rows; page size 50 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-318 — Staff cannot read audit log
| Field | Value |
|---|---|
| Test Case ID | TC-318 |
| Requirement ID | FR-140 |
| Module | Center Administration |
| Test Scenario | Staff cannot read audit log |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | — |
| Steps | GET /center/audit-logs |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-319 — Malformed actorId
| Field | Value |
|---|---|
| Test Case ID | TC-319 |
| Requirement ID | FR-140 |
| Module | Center Administration |
| Test Scenario | Malformed actorId |
| Test Type | Negative |
| Priority | High |
| Preconditions | Signed in as ADM-A |
| Test Data | actorId=abc |
| Steps | GET /center/audit-logs?actorId=abc |
| Expected Result | Expected (recommended): 400. Current: 404/500 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-046 |

##### TC-320 — Filter options
| Field | Value |
|---|---|
| Test Case ID | TC-320 |
| Requirement ID | FR-141 |
| Module | Center Administration |
| Test Scenario | Filter options |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as ADM-A |
| Test Data | — |
| Steps | GET /center/audit-logs/actors |
| Expected Result | 200 actors and actions, max 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-321 — Manager lists rooms
| Field | Value |
|---|---|
| Test Case ID | TC-321 |
| Requirement ID | FR-142 |
| Module | Center Administration |
| Test Scenario | Manager lists rooms |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | — |
| Steps | GET /rooms |
| Expected Result | 200 Center A rooms |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-322 — Receptionist refused
| Field | Value |
|---|---|
| Test Case ID | TC-322 |
| Requirement ID | FR-142 |
| Module | Center Administration |
| Test Scenario | Receptionist refused |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | GET /rooms |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-323 — Create room
| Field | Value |
|---|---|
| Test Case ID | TC-323 |
| Requirement ID | FR-143 |
| Module | Center Administration |
| Test Scenario | Create room |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | name, capacity |
| Steps | POST /rooms |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-324 — Invalid capacity
| Field | Value |
|---|---|
| Test Case ID | TC-324 |
| Requirement ID | FR-143 |
| Module | Center Administration |
| Test Scenario | Invalid capacity |
| Test Type | Negative |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | capacity -1 |
| Steps | POST /rooms |
| Expected Result | 400 validation_error |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-325 — Update room
| Field | Value |
|---|---|
| Test Case ID | TC-325 |
| Requirement ID | FR-144 |
| Module | Center Administration |
| Test Scenario | Update room |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active room |
| Test Data | new name |
| Steps | PATCH /rooms/[id] |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-326 — Room of another center
| Field | Value |
|---|---|
| Test Case ID | TC-326 |
| Requirement ID | FR-144 |
| Module | Center Administration |
| Test Scenario | Room of another center |
| Test Type | Security |
| Priority | High |
| Preconditions | Center B room id |
| Test Data | — |
| Steps | PATCH /rooms/[id] |
| Expected Result | 403 forbidden |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-327 — Deactivate unused room
| Field | Value |
|---|---|
| Test Case ID | TC-327 |
| Requirement ID | FR-145 |
| Module | Center Administration |
| Test Scenario | Deactivate unused room |
| Test Type | Functional |
| Priority | High |
| Preconditions | Room with no future sessions |
| Test Data | Room id |
| Steps | DELETE /rooms/[id] |
| Expected Result | 200; is_active=false |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-328 — Room with future sessions
| Field | Value |
|---|---|
| Test Case ID | TC-328 |
| Requirement ID | FR-145 |
| Module | Center Administration |
| Test Scenario | Room with future sessions |
| Test Type | Negative |
| Priority | High |
| Preconditions | Room referenced by future session |
| Test Data | Room id |
| Steps | DELETE /rooms/[id] |
| Expected Result | 422 "Cannot delete room referenced by future sessions" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-329 — Upload room photo
| Field | Value |
|---|---|
| Test Case ID | TC-329 |
| Requirement ID | FR-146 |
| Module | Center Administration |
| Test Scenario | Upload room photo |
| Test Type | Functional |
| Priority | High |
| Preconditions | Media configured |
| Test Data | JPEG under 4 MB |
| Steps | POST /rooms/[id]/photos |
| Expected Result | 200; photo added |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-330 — 13th photo refused
| Field | Value |
|---|---|
| Test Case ID | TC-330 |
| Requirement ID | FR-146 |
| Module | Center Administration |
| Test Scenario | 13th photo refused |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Room has 12 photos |
| Test Data | JPEG |
| Steps | POST /rooms/[id]/photos |
| Expected Result | 422 "A room can have at most 12 photos" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-331 — Per-student availability
| Field | Value |
|---|---|
| Test Case ID | TC-331 |
| Requirement ID | FR-147 |
| Module | Center Administration |
| Test Scenario | Per-student availability |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as MGR-A |
| Test Data | — |
| Steps | GET /rooms/per-student-availability |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-332 — Teacher browses center rooms
| Field | Value |
|---|---|
| Test Case ID | TC-332 |
| Requirement ID | FR-148 |
| Module | Center Administration |
| Test Scenario | Teacher browses center rooms |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Signed in as teacher |
| Test Data | Center A id |
| Steps | GET /centers/[id]/rooms |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-333 — List team notes
| Field | Value |
|---|---|
| Test Case ID | TC-333 |
| Requirement ID | FR-149 |
| Module | Center Administration |
| Test Scenario | List team notes |
| Test Type | Functional |
| Priority | High |
| Preconditions | Notes exist |
| Test Data | — |
| Steps | GET /team-notes |
| Expected Result | 200; pinned first; at most 500 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-334 — Actor without center
| Field | Value |
|---|---|
| Test Case ID | TC-334 |
| Requirement ID | FR-149 |
| Module | Center Administration |
| Test Scenario | Actor without center |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as student |
| Test Data | — |
| Steps | GET /team-notes |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-335 — Create note
| Field | Value |
|---|---|
| Test Case ID | TC-335 |
| Requirement ID | FR-150 |
| Module | Center Administration |
| Test Scenario | Create note |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | body "Call guardian" |
| Steps | POST /team-notes |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-336 — Body over 2000 chars
| Field | Value |
|---|---|
| Test Case ID | TC-336 |
| Requirement ID | FR-150 |
| Module | Center Administration |
| Test Scenario | Body over 2000 chars |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | 2001 chars |
| Steps | POST /team-notes |
| Expected Result | 400 validation_error |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-337 — Author edits text and status done
| Field | Value |
|---|---|
| Test Case ID | TC-337 |
| Requirement ID | FR-151 |
| Module | Center Administration |
| Test Scenario | Author edits text and status done |
| Test Type | Functional |
| Priority | High |
| Preconditions | Own note |
| Test Data | status done |
| Steps | PATCH /team-notes/[id] |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-338 — Non-author edits text
| Field | Value |
|---|---|
| Test Case ID | TC-338 |
| Requirement ID | FR-151 |
| Module | Center Administration |
| Test Scenario | Non-author edits text |
| Test Type | Security |
| Priority | High |
| Preconditions | Note by another user |
| Test Data | new body |
| Steps | PATCH /team-notes/[id] |
| Expected Result | 403 "Only the author can edit a note's text" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-339 — Author removes note
| Field | Value |
|---|---|
| Test Case ID | TC-339 |
| Requirement ID | FR-152 |
| Module | Center Administration |
| Test Scenario | Author removes note |
| Test Type | Functional |
| Priority | High |
| Preconditions | Own note |
| Test Data | — |
| Steps | DELETE /team-notes/[id] |
| Expected Result | 200; soft-deleted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-340 — Non-author non-lead removes
| Field | Value |
|---|---|
| Test Case ID | TC-340 |
| Requirement ID | FR-152 |
| Module | Center Administration |
| Test Scenario | Non-author non-lead removes |
| Test Type | Security |
| Priority | High |
| Preconditions | Note by another user; signed in as REC-A |
| Test Data | — |
| Steps | DELETE /team-notes/[id] |
| Expected Result | 403 "Only the author or a team lead can remove a note" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-341 — Counter tier for own student
| Field | Value |
|---|---|
| Test Case ID | TC-341 |
| Requirement ID | FR-153 |
| Module | Center Administration |
| Test Scenario | Counter tier for own student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as REC-A; card of Center A student |
| Test Data | Valid payload |
| Steps | GET /students/scan/[payload] |
| Expected Result | outcome valid; counter.studentId returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-342 — Forged payload
| Field | Value |
|---|---|
| Test Case ID | TC-342 |
| Requirement ID | FR-153 |
| Module | Center Administration |
| Test Scenario | Forged payload |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Not signed in |
| Test Data | Tampered payload |
| Steps | GET /students/scan/[payload] |
| Expected Result | outcome invalid; no identity |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-343 — Other center student
| Field | Value |
|---|---|
| Test Case ID | TC-343 |
| Requirement ID | FR-153 |
| Module | Center Administration |
| Test Scenario | Other center student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as REC-A; Center B student card |
| Test Data | Valid payload |
| Steps | GET scan |
| Expected Result | No full identity (signed_in tier) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Back-office tiers: Q-029 |

##### TC-344 — Code has a valid check character
| Field | Value |
|---|---|
| Test Case ID | TC-344 |
| Requirement ID | FR-154 |
| Module | Center Administration |
| Test Scenario | Code has a valid check character |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | New student created |
| Test Data | — |
| Steps | Read the student code; validate check char |
| Expected Result | Code valid; contains no name, birth date or phone |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-345 — Single mistype rejected
| Field | Value |
|---|---|
| Test Case ID | TC-345 |
| Requirement ID | FR-154 |
| Module | Center Administration |
| Test Scenario | Single mistype rejected |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Known code |
| Test Data | Code with one changed char |
| Steps | Search by the mistyped code |
| Expected Result | Not found |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-346 — Create off-system teacher
| Field | Value |
|---|---|
| Test Case ID | TC-346 |
| Requirement ID | FR-155 |
| Module | Center Administration |
| Test Scenario | Create off-system teacher |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as ADM-A |
| Test Data | Name + phone (test) |
| Steps | POST /center/external-teachers |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-347 — Phone of platform teacher
| Field | Value |
|---|---|
| Test Case ID | TC-347 |
| Requirement ID | FR-155 |
| Module | Center Administration |
| Test Scenario | Phone of platform teacher |
| Test Type | Negative |
| Priority | High |
| Preconditions | Phone of registered teacher |
| Test Data | That phone |
| Steps | POST /center/external-teachers |
| Expected Result | 409 "This teacher is already on the platform — send them a collaboration request instead" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-348 — Manager lists center teachers
| Field | Value |
|---|---|
| Test Case ID | TC-348 |
| Requirement ID | FR-156 |
| Module | Center Administration |
| Test Scenario | Manager lists center teachers |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as MGR-A |
| Test Data | systemStatus filter |
| Steps | GET /center/external-teachers |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-349 — Receptionist refused
| Field | Value |
|---|---|
| Test Case ID | TC-349 |
| Requirement ID | FR-156 |
| Module | Center Administration |
| Test Scenario | Receptionist refused |
| Test Type | Security |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | GET /center/external-teachers |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-350 — View off-system teacher
| Field | Value |
|---|---|
| Test Case ID | TC-350 |
| Requirement ID | FR-157 |
| Module | Center Administration |
| Test Scenario | View off-system teacher |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher exists |
| Test Data | Id |
| Steps | GET /center/external-teachers/[id] |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-351 — Negative center share refused
| Field | Value |
|---|---|
| Test Case ID | TC-351 |
| Requirement ID | FR-158 |
| Module | Center Administration |
| Test Scenario | Negative center share refused |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Teacher exists |
| Test Data | centerShare -1 |
| Steps | PATCH /center/external-teachers/[id] |
| Expected Result | 422 "Center share cannot be negative" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-352 — Remove teacher with reason
| Field | Value |
|---|---|
| Test Case ID | TC-352 |
| Requirement ID | FR-159 |
| Module | Center Administration |
| Test Scenario | Remove teacher with reason |
| Test Type | Functional |
| Priority | High |
| Preconditions | No active groups |
| Test Data | reason |
| Steps | DELETE /center/external-teachers/[id] |
| Expected Result | 200; history kept |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-353 — Remove with active groups
| Field | Value |
|---|---|
| Test Case ID | TC-353 |
| Requirement ID | FR-159 |
| Module | Center Administration |
| Test Scenario | Remove with active groups |
| Test Type | Negative |
| Priority | High |
| Preconditions | Active group exists |
| Test Data | reason |
| Steps | DELETE |
| Expected Result | 422 "This teacher still has active groups — end or reassign them first" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-354 — Restore teacher
| Field | Value |
|---|---|
| Test Case ID | TC-354 |
| Requirement ID | FR-160 |
| Module | Center Administration |
| Test Scenario | Restore teacher |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Removed teacher |
| Test Data | Id |
| Steps | POST .../restore |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-355 — Convert to enrolled
| Field | Value |
|---|---|
| Test Case ID | TC-355 |
| Requirement ID | FR-161 |
| Module | Center Administration |
| Test Scenario | Convert to enrolled |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Off-system teacher with email |
| Test Data | reason, email |
| Steps | POST .../convert to=enrolled |
| Expected Result | 200; invite sent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-356 — Convert without email
| Field | Value |
|---|---|
| Test Case ID | TC-356 |
| Requirement ID | FR-161 |
| Module | Center Administration |
| Test Scenario | Convert without email |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | No email |
| Test Data | reason |
| Steps | POST .../convert |
| Expected Result | 422 "An email address is required before this teacher can join the platform" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-357 — Suspended user reactivated (records gap)
| Field | Value |
|---|---|
| Test Case ID | TC-357 |
| Requirement ID | FR-161 |
| Module | Center Administration |
| Test Scenario | Suspended user reactivated (records gap) |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Linked user suspended |
| Test Data | reason |
| Steps | POST .../convert |
| Expected Result | Expected (recommended): refuse. Current: status set active |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-048 |

##### TC-358 — Convert enrolled to off-system
| Field | Value |
|---|---|
| Test Case ID | TC-358 |
| Requirement ID | FR-162 |
| Module | Center Administration |
| Test Scenario | Convert enrolled to off-system |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher works only with Center A |
| Test Data | reason |
| Steps | POST .../convert to=external |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-359 — Teacher at another center
| Field | Value |
|---|---|
| Test Case ID | TC-359 |
| Requirement ID | FR-162 |
| Module | Center Administration |
| Test Scenario | Teacher at another center |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher also at Center B |
| Test Data | reason |
| Steps | POST .../convert to=external |
| Expected Result | 422 "This teacher also works with another center on the platform and cannot be taken off-system here" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-360 — Resend converted invite
| Field | Value |
|---|---|
| Test Case ID | TC-360 |
| Requirement ID | FR-163 |
| Module | Center Administration |
| Test Scenario | Resend converted invite |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Converted, no password |
| Test Data | Id |
| Steps | POST .../invite |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-361 — Lookup by national ID
| Field | Value |
|---|---|
| Test Case ID | TC-361 |
| Requirement ID | FR-164 |
| Module | Center Administration |
| Test Scenario | Lookup by national ID |
| Test Type | Functional |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | 14-digit ID (test) |
| Steps | POST .../students/lookup |
| Expected Result | 200 match or none |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-362 — Bad national ID
| Field | Value |
|---|---|
| Test Case ID | TC-362 |
| Requirement ID | FR-164 |
| Module | Center Administration |
| Test Scenario | Bad national ID |
| Test Type | Negative |
| Priority | High |
| Preconditions | Signed in as REC-A |
| Test Data | 13 digits |
| Steps | POST .../students/lookup |
| Expected Result | 422 "National ID must be 14 digits" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-363 — Create and enroll new student
| Field | Value |
|---|---|
| Test Case ID | TC-363 |
| Requirement ID | FR-165 |
| Module | Center Administration |
| Test Scenario | Create and enroll new student |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Group has space |
| Test Data | Name, phone, courseId |
| Steps | POST .../students |
| Expected Result | 201; rostered; enrolled; audit external_teacher.student_created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-364 — Group full
| Field | Value |
|---|---|
| Test Case ID | TC-364 |
| Requirement ID | FR-165 |
| Module | Center Administration |
| Test Scenario | Group full |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Group at capacity |
| Test Data | courseId |
| Steps | POST .../students |
| Expected Result | 422 "Group is full" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-365 — Match of Center B student
| Field | Value |
|---|---|
| Test Case ID | TC-365 |
| Requirement ID | FR-165 |
| Module | Center Administration |
| Test Scenario | Match of Center B student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | National ID of Center B student |
| Test Data | That ID |
| Steps | POST .../students |
| Expected Result | Expected (recommended): masked, not linked. Current: linked and code returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-038 |

##### TC-366 — Enroll rostered student
| Field | Value |
|---|---|
| Test Case ID | TC-366 |
| Requirement ID | FR-166 |
| Module | Center Administration |
| Test Scenario | Enroll rostered student |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student on roster; group has space |
| Test Data | studentId, courseId |
| Steps | POST .../students/enroll |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-367 — Blacklisted student
| Field | Value |
|---|---|
| Test Case ID | TC-367 |
| Requirement ID | FR-166 |
| Module | Center Administration |
| Test Scenario | Blacklisted student |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Student blacklisted at Center A |
| Test Data | — |
| Steps | POST .../students/enroll |
| Expected Result | 422 "Student is blacklisted at this center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-368 — Concurrent enroll at capacity-1
| Field | Value |
|---|---|
| Test Case ID | TC-368 |
| Requirement ID | FR-166 |
| Module | Center Administration |
| Test Scenario | Concurrent enroll at capacity-1 |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | Group one seat left |
| Test Data | Two students |
| Steps | Send two enroll requests concurrently |
| Expected Result | Expected (recommended): one succeeds. Current: both may succeed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-050 |

##### TC-369 — List teacher's students
| Field | Value |
|---|---|
| Test Case ID | TC-369 |
| Requirement ID | FR-167 |
| Module | Center Administration |
| Test Scenario | List teacher's students |
| Test Type | Functional |
| Priority | High |
| Preconditions | Enrollments exist |
| Test Data | Teacher id |
| Steps | GET .../students |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-370 — Unknown teacher
| Field | Value |
|---|---|
| Test Case ID | TC-370 |
| Requirement ID | FR-167 |
| Module | Center Administration |
| Test Scenario | Unknown teacher |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | Random UUID |
| Steps | GET .../students |
| Expected Result | 404 "Teacher not found" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-371 — Create assessment
| Field | Value |
|---|---|
| Test Case ID | TC-371 |
| Requirement ID | FR-168 |
| Module | Center Administration |
| Test Scenario | Create assessment |
| Test Type | Functional |
| Priority | High |
| Preconditions | Group exists |
| Test Data | name, maxScore 20 |
| Steps | POST .../grades |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-372 — Max score 0
| Field | Value |
|---|---|
| Test Case ID | TC-372 |
| Requirement ID | FR-168 |
| Module | Center Administration |
| Test Scenario | Max score 0 |
| Test Type | Negative |
| Priority | High |
| Preconditions | Group exists |
| Test Data | maxScore 0 |
| Steps | POST .../grades |
| Expected Result | 422 "Max score must be positive" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-373 — Set scores
| Field | Value |
|---|---|
| Test Case ID | TC-373 |
| Requirement ID | FR-169 |
| Module | Center Administration |
| Test Scenario | Set scores |
| Test Type | Functional |
| Priority | High |
| Preconditions | Assessment max 20 |
| Test Data | score 18 |
| Steps | PUT .../scores |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-374 — Score over max
| Field | Value |
|---|---|
| Test Case ID | TC-374 |
| Requirement ID | FR-169 |
| Module | Center Administration |
| Test Scenario | Score over max |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Assessment max 20 |
| Test Data | score 21 |
| Steps | PUT .../scores |
| Expected Result | 422 "Score must be between 0 and 20" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-375 — Manager reads balances
| Field | Value |
|---|---|
| Test Case ID | TC-375 |
| Requirement ID | FR-170 |
| Module | Center Administration |
| Test Scenario | Manager reads balances |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Signed in as MGR-A |
| Test Data | — |
| Steps | GET balances |
| Expected Result | 200 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-376 — Receptionist refused
| Field | Value |
|---|---|
| Test Case ID | TC-376 |
| Requirement ID | FR-170 |
| Module | Center Administration |
| Test Scenario | Receptionist refused |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Signed in as REC-A |
| Test Data | — |
| Steps | GET balances |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Hand-off: Payments, Subscriptions, Wallets & Settlement |

##### TC-377 — Settle within owed amount
| Field | Value |
|---|---|
| Test Case ID | TC-377 |
| Requirement ID | FR-171 |
| Module | Center Administration |
| Test Scenario | Settle within owed amount |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Teacher owed X |
| Test Data | amount ≤ X in piasters |
| Steps | POST .../settlements |
| Expected Result | 201 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Hand-off module owns money tests |

##### TC-378 — Settle more than owed
| Field | Value |
|---|---|
| Test Case ID | TC-378 |
| Requirement ID | FR-171 |
| Module | Center Administration |
| Test Scenario | Settle more than owed |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Teacher owed X |
| Test Data | amount > X |
| Steps | POST .../settlements |
| Expected Result | 422 "This teacher is owed <x> EGP — you cannot settle more than that" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-379 — Double submit
| Field | Value |
|---|---|
| Test Case ID | TC-379 |
| Requirement ID | FR-171 |
| Module | Center Administration |
| Test Scenario | Double submit |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | Teacher owed X |
| Test Data | Same amount twice |
| Steps | Send two identical requests |
| Expected Result | Expected (recommended): one settlement. Current: no idempotency key |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-049 |

##### TC-380 — Same national ID in Arabic digits matches
| Field | Value |
|---|---|
| Test Case ID | TC-380 |
| Requirement ID | FR-172 |
| Module | Center Administration |
| Test Scenario | Same national ID in Arabic digits matches |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | Existing student with ID |
| Test Data | Same ID in Arabic-Indic digits |
| Steps | Import dry run |
| Expected Result | would_reuse (same child) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-381 — Walk-in by different phone, same national ID
| Field | Value |
|---|---|
| Test Case ID | TC-381 |
| Requirement ID | FR-172 |
| Module | Center Administration |
| Test Scenario | Walk-in by different phone, same national ID |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Existing student |
| Test Data | New phone |
| Steps | POST /center/walk-in |
| Expected Result | Records current behaviour: new shell (phone-only check) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-035 |

### 4. Courses, Sessions, Enrollment & Attendance

Accounts are referred to by role; passwords: see docs/guides/test-credentials.md. Priority: Critical = money/auth/child safety/data integrity; High = core daily workflow.

##### TC-382 — Anonymous browse returns center courses without meeting link
| Field | Description |
|---|---|
| Test Case ID | TC-382 |
| Requirement ID | FR-173 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Anonymous browse returns center courses without meeting link |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Center with an online course |
| Test Data | centerId of the demo center |
| Steps | 1. Without logging in, GET /api/v1/courses?centerId=<id> |
| Expected Result | 200; list contains the center's courses; every onlineUrl is null |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-383 — Anonymous browse rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-383 |
| Requirement ID | FR-173 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Anonymous browse rate limit |
| Test Type | Security |
| Priority | Medium |
| Preconditions | None |
| Test Data | Same IP, 61 requests in under a minute |
| Steps | 1. Send 61 anonymous GET /courses?centerId requests |
| Expected Result | 61st returns 429 rate_limited "Too many requests, please slow down." with Retry-After: 60 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-384 — Logged-in role scoping of course list
| Field | Description |
|---|---|
| Test Case ID | TC-384 |
| Requirement ID | FR-174 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Logged-in role scoping of course list |
| Test Type | Security |
| Priority | Medium |
| Preconditions | Teacher T1 and T2 with courses |
| Test Data | Demo teacher account (password: see docs/guides/test-credentials.md) |
| Steps | 1. Log in as T1 2. GET /courses |
| Expected Result | Only T1's courses are returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Also check the student arm includes unenrolled courses (GAP-073) |

##### TC-385 — Covered student sees the meeting link
| Field | Description |
|---|---|
| Test Case ID | TC-385 |
| Requirement ID | FR-175 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Covered student sees the meeting link |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Online course; student with active coverage |
| Test Data | Demo student account (password: see docs/guides/test-credentials.md) |
| Steps | 1. GET /courses/{id} as the covered student |
| Expected Result | onlineUrl returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Meeting link is money (course-delivery decision) |

##### TC-386 — Uncovered or anonymous viewer gets no link
| Field | Description |
|---|---|
| Test Case ID | TC-386 |
| Requirement ID | FR-175 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Uncovered or anonymous viewer gets no link |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Same course |
| Test Data | Anonymous and an uncovered student |
| Steps | 1. GET /courses/{id} anonymously 2. Repeat as uncovered student |
| Expected Result | onlineUrl null, hasOnlineUrl true in both |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-387 — Create center course generates sessions
| Field | Description |
|---|---|
| Test Case ID | TC-387 |
| Requirement ID | FR-176 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Create center course generates sessions |
| Test Type | Functional |
| Priority | High |
| Preconditions | Affiliated teacher; free hall |
| Test Data | Pattern Sun+Tue 17:00-18:30, 4-week range |
| Steps | 1. Admin classes → create course 2. Submit |
| Expected Result | 201; sessions created on every Sunday/Tuesday in range, status scheduled; visible in week grid |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-388 — Create refused for non-affiliated teacher and foreign hall
| Field | Description |
|---|---|
| Test Case ID | TC-388 |
| Requirement ID | FR-176 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Create refused for non-affiliated teacher and foreign hall |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher without active affiliation; hall of another center |
| Test Data | teacherId / defaultRoomId |
| Steps | 1. POST /courses with the unaffiliated teacher 2. POST with the foreign hall |
| Expected Result | 422 "Teacher does not have an active affiliation with this center"; 404 "Hall not found at this center"; nothing created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-389 — Teacher creates teacher-direct course
| Field | Description |
|---|---|
| Test Case ID | TC-389 |
| Requirement ID | FR-177 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Teacher creates teacher-direct course |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher logged in |
| Test Data | Onsite course with location |
| Steps | 1. Teacher classes → create 2. Submit |
| Expected Result | 201; course has no center and appears in the teacher's list |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-390 — Online course requires http(s) link
| Field | Description |
|---|---|
| Test Case ID | TC-390 |
| Requirement ID | FR-178 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Online course requires http(s) link |
| Test Type | Validation |
| Priority | High |
| Preconditions | Admin logged in |
| Test Data | deliveryMode online, onlineUrl "ftp://x" then empty |
| Steps | 1. Create course with ftp link 2. Create with no link |
| Expected Result | 422 "The meeting link must start with http:// or https://"; 422 for missing link |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-391 — Hybrid course with https link saves
| Field | Description |
|---|---|
| Test Case ID | TC-391 |
| Requirement ID | FR-178 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Hybrid course with https link saves |
| Test Type | Functional |
| Priority | High |
| Preconditions | Admin logged in |
| Test Data | https://meet.example/abc |
| Steps | 1. Create hybrid course |
| Expected Result | 201; link persisted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-392 — Pattern change regenerates only future sessions
| Field | Description |
|---|---|
| Test Case ID | TC-392 |
| Requirement ID | FR-179 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Pattern change regenerates only future sessions |
| Test Type | Functional |
| Priority | High |
| Preconditions | Course with past and future sessions |
| Test Data | Change days from Sun to Mon |
| Steps | 1. PATCH /courses/{id} schedulePattern |
| Expected Result | Past sessions untouched; future scheduled sessions replaced on Mondays |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-393 — Hall change and past startDate refused
| Field | Description |
|---|---|
| Test Case ID | TC-393 |
| Requirement ID | FR-179 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Hall change and past startDate refused |
| Test Type | Negative |
| Priority | High |
| Preconditions | Course with a hall set |
| Test Data | New defaultRoomId; startDate yesterday |
| Steps | 1. PATCH hall 2. PATCH startDate |
| Expected Result | 422 business_rule for each; course unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-394 — Teacher edits teacher-direct price
| Field | Description |
|---|---|
| Test Case ID | TC-394 |
| Requirement ID | FR-180 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Teacher edits teacher-direct price |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Own teacher-direct course |
| Test Data | New price |
| Steps | 1. PATCH /courses/{id} as owner 2. PATCH with empty body |
| Expected Result | 200 updated; empty body → 422 "Nothing to update" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-395 — Cancel course cancels future sessions
| Field | Description |
|---|---|
| Test Case ID | TC-395 |
| Requirement ID | FR-181 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Cancel course cancels future sessions |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active course with future sessions |
| Test Data | reason "Teacher left" |
| Steps | 1. Admin classes → cancel course with reason |
| Expected Result | Course cancelled; future sessions cancelled with the reason |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-396 — Cancel an already-cancelled course
| Field | Description |
|---|---|
| Test Case ID | TC-396 |
| Requirement ID | FR-181 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Cancel an already-cancelled course |
| Test Type | Negative |
| Priority | High |
| Preconditions | Cancelled course |
| Test Data | - |
| Steps | 1. POST /courses/{id}/cancel again |
| Expected Result | 422 "Course already cancelled" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-397 — Reassign teacher
| Field | Description |
|---|---|
| Test Case ID | TC-397 |
| Requirement ID | FR-182 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Reassign teacher |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Second affiliated teacher |
| Test Data | teacherId |
| Steps | 1. POST reassign-teacher 2. Repeat with unaffiliated teacher |
| Expected Result | First 200 with new teacher on sessions; second 422 affiliation error |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | No clash check (GAP-070) |

##### TC-398 — Hall clash refused
| Field | Description |
|---|---|
| Test Case ID | TC-398 |
| Requirement ID | FR-183 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Hall clash refused |
| Test Type | Functional |
| Priority | High |
| Preconditions | Course A in Hall 1 Sun 17:00-18:30 |
| Test Data | Course B Hall 1 Sun 18:00-19:00 |
| Steps | 1. Create course B |
| Expected Result | 409 "Schedule conflicts detected" with conflicts; nothing created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-399 — Teacher clash and boundary times
| Field | Description |
|---|---|
| Test Case ID | TC-399 |
| Requirement ID | FR-183 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Teacher clash and boundary times |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Course A teacher T Sun 17:00-18:00 |
| Test Data | Course B teacher T Sun 18:00-19:00 (touching) |
| Steps | 1. Create course B |
| Expected Result | Record whether touching intervals clash; expected no clash |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-195 |

##### TC-400 — Week grid lists center sessions only
| Field | Description |
|---|---|
| Test Case ID | TC-400 |
| Requirement ID | FR-184 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Week grid lists center sessions only |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Two centers with sessions the same week |
| Test Data | Demo center_admin account |
| Steps | 1. Open /dashboard/admin/schedule |
| Expected Result | Only own center's sessions; clash badges shown where applicable |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-401 — Parent with no linked child
| Field | Description |
|---|---|
| Test Case ID | TC-401 |
| Requirement ID | FR-184 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Parent with no linked child |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Parent without approved links |
| Test Data | - |
| Steps | 1. GET /sessions as parent |
| Expected Result | 403 "No linked children" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-402 — Session IDOR across centers
| Field | Description |
|---|---|
| Test Case ID | TC-402 |
| Requirement ID | FR-185 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Session IDOR across centers |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Session id of center B |
| Test Data | Staff (receptionist) of center A |
| Steps | 1. GET /sessions/{B id} |
| Expected Result | 403 "Session not in your center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | poc-m01 test |

##### TC-403 — Student not enrolled
| Field | Description |
|---|---|
| Test Case ID | TC-403 |
| Requirement ID | FR-185 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Student not enrolled |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Session of a course the student is not in |
| Test Data | - |
| Steps | 1. GET /sessions/{id} as student |
| Expected Result | 403 "Not enrolled in this course" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-404 — Teacher cancels a lesson with reason
| Field | Description |
|---|---|
| Test Case ID | TC-404 |
| Requirement ID | FR-186 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Teacher cancels a lesson with reason |
| Test Type | Functional |
| Priority | High |
| Preconditions | Scheduled session of the teacher |
| Test Data | reason "Sick" |
| Steps | 1. Teacher classes → Cancel the lesson |
| Expected Result | Status cancelled; enrollees and center admins notified |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-405 — Center admin cancels a session via API
| Field | Description |
|---|---|
| Test Case ID | TC-405 |
| Requirement ID | FR-186 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Center admin cancels a session via API |
| Test Type | Negative |
| Priority | High |
| Preconditions | Session of the admin's center |
| Test Data | - |
| Steps | 1. POST /sessions/{id}/cancel as center_admin |
| Expected Result | Currently 403 "Only the assigned teacher can cancel this session"; record outcome for PO decision |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-054 |

##### TC-406 — Cancel a completed session
| Field | Description |
|---|---|
| Test Case ID | TC-406 |
| Requirement ID | FR-186 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Cancel a completed session |
| Test Type | Negative |
| Priority | High |
| Preconditions | Completed session |
| Test Data | - |
| Steps | 1. POST cancel |
| Expected Result | 422 "A completed session cannot be cancelled; its revenue is already distributed" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-407 — Postpone to a free slot
| Field | Description |
|---|---|
| Test Case ID | TC-407 |
| Requirement ID | FR-187 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Postpone to a free slot |
| Test Type | Functional |
| Priority | High |
| Preconditions | Scheduled session |
| Test Data | Tomorrow 19:00-20:00 |
| Steps | 1. Teacher classes → Postpone |
| Expected Result | Status postponed; new date/time saved; reason stored |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-408 — Postpone into a clash and into the past
| Field | Description |
|---|---|
| Test Case ID | TC-408 |
| Requirement ID | FR-187 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Postpone into a clash and into the past |
| Test Type | Negative |
| Priority | High |
| Preconditions | Another session of the same teacher tomorrow 19:00 |
| Test Data | Clashing slot; yesterday's date |
| Steps | 1. Postpone into clash 2. Postpone to yesterday |
| Expected Result | 409 "New time slot conflicts with existing sessions"; 400 "newDate cannot be in the past" (`apps/api/src/routes/v1/sessions/[id]/postpone/route.ts:14`) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-409 — Postpone with end before start
| Field | Description |
|---|---|
| Test Case ID | TC-409 |
| Requirement ID | FR-187 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Postpone with end before start |
| Test Type | Validation |
| Priority | High |
| Preconditions | Scheduled session |
| Test Data | start 20:00 end 19:00 |
| Steps | 1. POST postpone |
| Expected Result | Expected refusal; currently accepted (GAP-056) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-410 — Close a priced lesson distributes once
| Field | Description |
|---|---|
| Test Case ID | TC-410 |
| Requirement ID | FR-188 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Close a priced lesson distributes once |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Priced center lesson, 3 present |
| Test Data | - |
| Steps | 1. Teacher attendance → Close the lesson → Final confirmation |
| Expected Result | 200 distributed; "Lesson closed and its revenue distributed"; register locked |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Ledger assertions in "Payments, Subscriptions, Wallets & Settlement" |

##### TC-411 — Unpriced lesson refuses to complete
| Field | Description |
|---|---|
| Test Case ID | TC-411 |
| Requirement ID | FR-188 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Unpriced lesson refuses to complete |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Course with no price; present students |
| Test Data | - |
| Steps | 1. POST /sessions/{id}/complete |
| Expected Result | 422 "This lesson has no price — set the class pricing before completing sessions"; status not completed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Binding invariant |

##### TC-412 — Counter-only students excluded
| Field | Description |
|---|---|
| Test Case ID | TC-412 |
| Requirement ID | FR-188 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Counter-only students excluded |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Mode B; 2 present, 1 counter_only |
| Test Data | - |
| Steps | 1. Preview 2. Complete |
| Expected Result | Preview warns 1 counter-only; only 2 counted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-413 — Concurrent double complete
| Field | Description |
|---|---|
| Test Case ID | TC-413 |
| Requirement ID | FR-188 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Concurrent double complete |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | Priced lesson |
| Test Data | Two parallel requests |
| Steps | 1. Send two POST complete at once |
| Expected Result | One distribution; other already_distributed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-414 — Preview reasons
| Field | Description |
|---|---|
| Test Case ID | TC-414 |
| Requirement ID | FR-189 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Preview reasons |
| Test Type | Functional |
| Priority | High |
| Preconditions | Sessions: cancelled, teacher-direct, no present |
| Test Data | - |
| Steps | 1. GET settlement-preview for each |
| Expected Result | Matching reason prose in the card for each case |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-415 — Preview authorization
| Field | Description |
|---|---|
| Test Case ID | TC-415 |
| Requirement ID | FR-189 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Preview authorization |
| Test Type | Security |
| Priority | High |
| Preconditions | Session of another teacher |
| Test Data | Teacher T2 |
| Steps | 1. GET settlement-preview as T2 |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-416 — Teacher reads own register
| Field | Description |
|---|---|
| Test Case ID | TC-416 |
| Requirement ID | FR-190 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Teacher reads own register |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session with enrollees |
| Test Data | - |
| Steps | 1. Open teacher attendance |
| Expected Result | All active enrollees listed with status |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-417 — Other teacher cannot read register
| Field | Description |
|---|---|
| Test Case ID | TC-417 |
| Requirement ID | FR-190 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Other teacher cannot read register |
| Test Type | Security |
| Priority | High |
| Preconditions | Session of T1 |
| Test Data | T2 |
| Steps | 1. GET /sessions/{id}/attendance as T2 |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-418 — Bulk mark present/absent/excused
| Field | Description |
|---|---|
| Test Case ID | TC-418 |
| Requirement ID | FR-191 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Bulk mark present/absent/excused |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Open register |
| Test Data | Mixed statuses |
| Steps | 1. Mark and Save |
| Expected Result | "Attendance saved"; records match; absent guardians notified |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-419 — Non-enrolled student in payload
| Field | Description |
|---|---|
| Test Case ID | TC-419 |
| Requirement ID | FR-191 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Non-enrolled student in payload |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Open register |
| Test Data | Unenrolled studentId |
| Steps | 1. PUT with that student |
| Expected Result | 422 "Some students are not actively enrolled in this course"; nothing written |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-420 — Receptionist cannot bulk mark
| Field | Description |
|---|---|
| Test Case ID | TC-420 |
| Requirement ID | FR-191 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Receptionist cannot bulk mark |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Receptionist of the center |
| Test Data | - |
| Steps | 1. PUT /sessions/{id}/attendance as staff |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-421 — Window boundary
| Field | Description |
|---|---|
| Test Case ID | TC-421 |
| Requirement ID | FR-192 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Window boundary |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Session dated 6 days and 8 days ago |
| Test Data | - |
| Steps | 1. Save register for each |
| Expected Result | 6 days → saved; 8 days → 403 "Attendance edit window has passed (locked=true)" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-422 — Completed but not distributed is locked
| Field | Description |
|---|---|
| Test Case ID | TC-422 |
| Requirement ID | FR-192 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Completed but not distributed is locked |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Completed session with no present students |
| Test Data | - |
| Steps | 1. PUT attendance |
| Expected Result | 403 "This lesson was closed — reopen it to correct attendance" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-423 — Reopen locked unsettled lesson
| Field | Description |
|---|---|
| Test Case ID | TC-423 |
| Requirement ID | FR-193 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Reopen locked unsettled lesson |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Session 8 days old, not distributed |
| Test Data | Manager staff |
| Steps | 1. POST /attendance/reopen 2. Save register 3. Close |
| Expected Result | Reopen 200; audit attendance.reopen; save succeeds; closing re-locks |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | No UI — run via API |

##### TC-424 — Reopen refused when distributed / open / already reopened
| Field | Description |
|---|---|
| Test Case ID | TC-424 |
| Requirement ID | FR-193 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Reopen refused when distributed / open / already reopened |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Three sessions in those states |
| Test Data | - |
| Steps | 1. POST reopen on each |
| Expected Result | 422 with the three exact messages |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-425 — Receptionist reopen refused
| Field | Description |
|---|---|
| Test Case ID | TC-425 |
| Requirement ID | FR-193 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Receptionist reopen refused |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Locked session |
| Test Data | Receptionist |
| Steps | 1. POST reopen |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-426 — Admin corrects one record
| Field | Description |
|---|---|
| Test Case ID | TC-426 |
| Requirement ID | FR-194 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Admin corrects one record |
| Test Type | Functional |
| Priority | High |
| Preconditions | Record within window |
| Test Data | - |
| Steps | 1. PATCH /attendance/{id} |
| Expected Result | 200 updated |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-427 — Other center's record
| Field | Description |
|---|---|
| Test Case ID | TC-427 |
| Requirement ID | FR-194 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Other center's record |
| Test Type | Security |
| Priority | High |
| Preconditions | Record of center B |
| Test Data | Admin of A |
| Steps | 1. PATCH |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-428 — Switch mode B then counter check-in
| Field | Description |
|---|---|
| Test Case ID | TC-428 |
| Requirement ID | FR-195 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Switch mode B then counter check-in |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher in mode A |
| Test Data | - |
| Steps | 1. Settings → mode counter + door 2. Counter check-in |
| Expected Result | Response counter_only, needsDoorCheckin true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-429 — Mode A counter check-in is present
| Field | Description |
|---|---|
| Test Case ID | TC-429 |
| Requirement ID | FR-195 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Mode A counter check-in is present |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher in mode A |
| Test Data | - |
| Steps | 1. Counter check-in |
| Expected Result | status present |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-430 — Uncovered student gets needs_payment
| Field | Description |
|---|---|
| Test Case ID | TC-430 |
| Requirement ID | FR-196 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Uncovered student gets needs_payment |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student without coverage; priced session |
| Test Data | - |
| Steps | 1. Counter → check in |
| Expected Result | 402 needs_payment; dialog "This session is unpaid" with price |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Payment step in PAY module |

##### TC-431 — Check-in refused on closed or foreign session
| Field | Description |
|---|---|
| Test Case ID | TC-431 |
| Requirement ID | FR-196 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Check-in refused on closed or foreign session |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Completed session; session at another center |
| Test Data | - |
| Steps | 1. POST /center/checkin for each |
| Expected Result | 422 session_closed; 403 "Session is not at your center" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-432 — Duplicate counter check-in
| Field | Description |
|---|---|
| Test Case ID | TC-432 |
| Requirement ID | FR-196 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Duplicate counter check-in |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student already checked in |
| Test Data | - |
| Steps | 1. Check in again |
| Expected Result | 200; first counterAt kept; no duplicate row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-433 — Lookup masks off-roster student
| Field | Description |
|---|---|
| Test Case ID | TC-433 |
| Requirement ID | FR-197 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Lookup masks off-roster student |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Student on another center's roster only |
| Test Data | Exact student code |
| Steps | 1. Lookup by code |
| Expected Result | Found with masked name and phone, otherCenterCount > 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-434 — Name search limited to own students
| Field | Description |
|---|---|
| Test Case ID | TC-434 |
| Requirement ID | FR-197 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Name search limited to own students |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Student X only at center B |
| Test Data | X's name |
| Steps | 1. Lookup by name at center A |
| Expected Result | Not returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-435 — Suggestions list today's sessions
| Field | Description |
|---|---|
| Test Case ID | TC-435 |
| Requirement ID | FR-198 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Suggestions list today's sessions |
| Test Type | Functional |
| Priority | High |
| Preconditions | Covered student with a session today |
| Test Data | - |
| Steps | 1. Search student → pick |
| Expected Result | Session under "Subscribed sessions" marked "Covered" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-436 — Day boundary after midnight Cairo
| Field | Description |
|---|---|
| Test Case ID | TC-436 |
| Requirement ID | FR-198 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Day boundary after midnight Cairo |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Session dated today (Cairo) and time 00:30-02:00 Cairo |
| Test Data | - |
| Steps | 1. At 00:30 Cairo compare board and suggest |
| Expected Result | Both should show the same day; record discrepancy |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-057 |

##### TC-437 — Board reads create no rows
| Field | Description |
|---|---|
| Test Case ID | TC-437 |
| Requirement ID | FR-199 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Board reads create no rows |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | DB row counts captured |
| Test Data | - |
| Steps | 1. Open board, pick teacher, lesson, switch tabs 2. Compare row counts |
| Expected Result | No attendance/payment/subscription rows created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Binding invariant |

##### TC-438 — Attended/pending tabs partition the roster
| Field | Description |
|---|---|
| Test Case ID | TC-438 |
| Requirement ID | FR-199 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Attended/pending tabs partition the roster |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Lesson with 5 students, 2 checked in |
| Test Data | - |
| Steps | 1. Open both tabs |
| Expected Result | 2 + 3 = 5; no student in both |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-439 — Door after counter makes present
| Field | Description |
|---|---|
| Test Case ID | TC-439 |
| Requirement ID | FR-200 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Door after counter makes present |
| Test Type | Functional |
| Priority | High |
| Preconditions | Mode B; counter_only student |
| Test Data | Student code |
| Steps | 1. Door screen → scan |
| Expected Result | "Door check-in confirmed — present" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-440 — Door without counter
| Field | Description |
|---|---|
| Test Case ID | TC-440 |
| Requirement ID | FR-200 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Door without counter |
| Test Type | Negative |
| Priority | High |
| Preconditions | Mode B; no counter check-in |
| Test Data | - |
| Steps | 1. Scan |
| Expected Result | 422 "…door check-in requires the counter first" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-441 — Door state of own session
| Field | Description |
|---|---|
| Test Case ID | TC-441 |
| Requirement ID | FR-201 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Door state of own session |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Own session |
| Test Data | - |
| Steps | 1. GET /door-checkin?sessionId 2. Repeat for another teacher's session |
| Expected Result | 200 state; other → 403 "Not your session" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-442 — Offline register syncs
| Field | Description |
|---|---|
| Test Case ID | TC-442 |
| Requirement ID | FR-202 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Offline register syncs |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Teacher device offline |
| Test Data | 3 records |
| Steps | 1. Mark offline 2. Reconnect |
| Expected Result | 3 synced; pending count clears |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-443 — Server record wins
| Field | Description |
|---|---|
| Test Case ID | TC-443 |
| Requirement ID | FR-202 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Server record wins |
| Test Type | Data integrity |
| Priority | Critical |
| Preconditions | Server already has a record for student S |
| Test Data | Offline record for S |
| Steps | 1. Sync |
| Expected Result | conflict server_record_kept; server value unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-444 — Old record beyond window
| Field | Description |
|---|---|
| Test Case ID | TC-444 |
| Requirement ID | FR-202 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Old record beyond window |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Unsettled session 10 days old |
| Test Data | Offline record |
| Steps | 1. Sync |
| Expected Result | Currently synced (window not applied); record outcome |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-058 |

##### TC-445 — Parent reads linked child
| Field | Description |
|---|---|
| Test Case ID | TC-445 |
| Requirement ID | FR-203 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Parent reads linked child |
| Test Type | Functional |
| Priority | High |
| Preconditions | Approved parent link |
| Test Data | studentId |
| Steps | 1. Parent attendance page |
| Expected Result | Summary and heatmap shown |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-446 — Parent reads unlinked child
| Field | Description |
|---|---|
| Test Case ID | TC-446 |
| Requirement ID | FR-203 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Parent reads unlinked child |
| Test Type | Security |
| Priority | High |
| Preconditions | No link |
| Test Data | Other studentId |
| Steps | 1. GET /me/attendance?studentId |
| Expected Result | 403 "Not linked to this student" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-447 — Coverage states
| Field | Description |
|---|---|
| Test Case ID | TC-447 |
| Requirement ID | FR-204 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Coverage states |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Students with monthly, per-session, lapsed, none |
| Test Data | - |
| Steps | 1. GET /teacher/coverage?courseId |
| Expected Result | Each student has the matching state |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-448 — Student requests a center course
| Field | Description |
|---|---|
| Test Case ID | TC-448 |
| Requirement ID | FR-205 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Student requests a center course |
| Test Type | Functional |
| Priority | High |
| Preconditions | Center course; student not enrolled |
| Test Data | - |
| Steps | 1. Request enrollment |
| Expected Result | 201 pending; center admins notified |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-449 — Duplicate and teacher-direct requests
| Field | Description |
|---|---|
| Test Case ID | TC-449 |
| Requirement ID | FR-205 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Duplicate and teacher-direct requests |
| Test Type | Negative |
| Priority | High |
| Preconditions | Pending request exists; teacher-direct course |
| Test Data | - |
| Steps | 1. Request again 2. Request teacher-direct |
| Expected Result | 409 "Enrollment request already pending"; 422 subscription message |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-450 — Cancel own pending request
| Field | Description |
|---|---|
| Test Case ID | TC-450 |
| Requirement ID | FR-206 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Cancel own pending request |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending request |
| Test Data | - |
| Steps | 1. DELETE request 2. DELETE again |
| Expected Result | 200; second 422 "Only pending requests can be cancelled" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-451 — Lazy expiry
| Field | Description |
|---|---|
| Test Case ID | TC-451 |
| Requirement ID | FR-207 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Lazy expiry |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending request with expiresAt in the past |
| Test Data | - |
| Steps | 1. GET /enrollment-requests |
| Expected Result | Request shows expired |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-452 — Approve within capacity
| Field | Description |
|---|---|
| Test Case ID | TC-452 |
| Requirement ID | FR-208 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Approve within capacity |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending request; seats free |
| Test Data | - |
| Steps | 1. Approve (two-step) |
| Expected Result | Enrollment active; student notified "Enrollment approved" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-453 — Approve full course and expired request
| Field | Description |
|---|---|
| Test Case ID | TC-453 |
| Requirement ID | FR-208 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Approve full course and expired request |
| Test Type | Negative |
| Priority | High |
| Preconditions | Full course; expired request |
| Test Data | - |
| Steps | 1. Approve each |
| Expected Result | 422 "Course is full"; 410 "Enrollment request has expired" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-454 — Decline with reason
| Field | Description |
|---|---|
| Test Case ID | TC-454 |
| Requirement ID | FR-209 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Decline with reason |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending request |
| Test Data | reason |
| Steps | 1. Decline |
| Expected Result | Declined; student notified "Enrollment declined" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-455 — Direct enroll
| Field | Description |
|---|---|
| Test Case ID | TC-455 |
| Requirement ID | FR-210 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Direct enroll |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student on roster |
| Test Data | - |
| Steps | 1. Enroll |
| Expected Result | 201; student notified "Enrolled in course" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-456 — Direct enroll blocked cases
| Field | Description |
|---|---|
| Test Case ID | TC-456 |
| Requirement ID | FR-210 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Direct enroll blocked cases |
| Test Type | Negative |
| Priority | High |
| Preconditions | Blacklisted student; already enrolled; full course |
| Test Data | - |
| Steps | 1. Enroll each |
| Expected Result | 422 blacklisted; 409 already enrolled; full course currently accepted (GAP-059) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-457 — Unenroll
| Field | Description |
|---|---|
| Test Case ID | TC-457 |
| Requirement ID | FR-211 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Unenroll |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Active enrollment |
| Test Data | - |
| Steps | 1. Unenroll 2. Open next register |
| Expected Result | Status unenrolled; student absent from future registers |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-458 — Enrollment list scoping
| Field | Description |
|---|---|
| Test Case ID | TC-458 |
| Requirement ID | FR-212 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Enrollment list scoping |
| Test Type | Security |
| Priority | High |
| Preconditions | Two parents |
| Test Data | - |
| Steps | 1. Parent A GET /enrollments?studentId=<B's child> |
| Expected Result | 403 "Not linked to this student" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-459 — Staff refused
| Field | Description |
|---|---|
| Test Case ID | TC-459 |
| Requirement ID | FR-212 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Staff refused |
| Test Type | Security |
| Priority | High |
| Preconditions | Receptionist |
| Test Data | - |
| Steps | 1. GET /enrollments |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-460 — Assistant acts for teacher
| Field | Description |
|---|---|
| Test Case ID | TC-460 |
| Requirement ID | FR-213 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Assistant acts for teacher |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Assistant linked to T |
| Test Data | - |
| Steps | 1. Assistant marks attendance of T's session |
| Expected Result | Saved; audit row attributes assistant on behalf of T |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-461 — Removed assistant
| Field | Description |
|---|---|
| Test Case ID | TC-461 |
| Requirement ID | FR-213 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Removed assistant |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Assistant link removed |
| Test Data | - |
| Steps | 1. Any delegated call |
| Expected Result | 403 "Assistant is not linked to a teacher" |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-462 — Sub-role matrix
| Field | Description |
|---|---|
| Test Case ID | TC-462 |
| Requirement ID | FR-214 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Sub-role matrix |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Receptionist, manager, center_accountant of one center |
| Test Data | - |
| Steps | 1. Each calls counter checkin, complete, reopen, sessions list |
| Expected Result | Receptionist: checkin/complete ok, reopen 403; manager: all ok; accountant: list ok, counter 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-463 — Staff cannot cancel or postpone
| Field | Description |
|---|---|
| Test Case ID | TC-463 |
| Requirement ID | FR-214 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | Staff cannot cancel or postpone |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Receptionist |
| Test Data | - |
| Steps | 1. POST cancel 2. POST postpone |
| Expected Result | 403 both |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-464 — 12-hour display
| Field | Description |
|---|---|
| Test Case ID | TC-464 |
| Requirement ID | FR-215 |
| Module | Courses, Sessions, Enrollment & Attendance |
| Test Scenario | 12-hour display |
| Test Type | UI |
| Priority | Low |
| Preconditions | Session 17:00-18:30 |
| Test Data | Arabic and English locales |
| Steps | 1. Open admin schedule, teacher attendance, student schedule |
| Expected Result | Times shown in 12-hour format with day-period word |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

### 5. Payments, Subscriptions, Wallets & Settlement

Test accounts are referenced by role; password: see docs/guides/test-credentials.md. Amounts are integer piasters. "Courses module" = "Courses, Sessions & Attendance".

##### TC-465 — Record a cash counter payment for an enrolled student
| Field | Description |
|---|---|
| Test Case ID | TC-465 |
| Requirement ID | FR-216 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Record a cash counter payment for an enrolled student |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Open shift exists for the admin; student enrolled in class |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Open `/ar/dashboard/admin/fees` → Record payment. 2. Pick student, class, amount 500, method cash. 3. Submit (API `POST /api/v1/payments` {studentId, courseId, amount:50000, paymentMethod:"cash"}). |
| Expected Result | 201; row in `payments` amount 50000, status paid, shiftId = open shift; `transactions` row student→center 50000; receipt number `RCP-…` shown. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments/payments.ts:31-134 |

##### TC-466 — Reject payment for a student outside the center roster
| Field | Description |
|---|---|
| Test Case ID | TC-466 |
| Requirement ID | FR-216 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Reject payment for a student outside the center roster |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Student belongs to another center |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments` {studentId:<other-center student>, amount:10000}. |
| Expected Result | 422 `business_rule` "Student is not in this center roster"; no rows written. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments/payments.ts:51 |

##### TC-467 — Reject zero and oversized amounts
| Field | Description |
|---|---|
| Test Case ID | TC-467 |
| Requirement ID | FR-216 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Reject zero and oversized amounts |
| Test Type | Boundary |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST amount 0. 2. POST amount -100. 3. POST amount 99999901. 4. POST amount 99999900. |
| Expected Result | 1–3 → 400 "Validation failed" (fields.amount). 4 → 201. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | validation/common.ts MAX_MONEY_PIASTERS |

##### TC-468 — Receptionist cannot use the admin record-payment door
| Field | Description |
|---|---|
| Test Case ID | TC-468 |
| Requirement ID | FR-216 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Receptionist cannot use the admin record-payment door |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Receptionist session |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments` valid body. |
| Expected Result | 403 `forbidden`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments/route.ts requireRole(center_admin) |

##### TC-469 — Expire a pending intent past its TTL
| Field | Description |
|---|---|
| Test Case ID | TC-469 |
| Requirement ID | FR-217 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Expire a pending intent past its TTL |
| Test Type | Functional |
| Priority | High |
| Preconditions | A pending intent with expiresAt in the past (create one, then wait or adjust clock in test DB) |
| Test Data | system; CRON_SECRET of the test env |
| Steps | 1. `POST /api/v1/cron/expire-payment-intents` with `Authorization: Bearer <CRON_SECRET>`. |
| Expected Result | 200 `{data:{expired:1}}`; intent status `expired`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:614-622 |

##### TC-470 — Cron without secret is refused
| Field | Description |
|---|---|
| Test Case ID | TC-470 |
| Requirement ID | FR-217 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cron without secret is refused |
| Test Type | Security |
| Priority | Critical |
| Preconditions | — |
| Test Data | none |
| Steps | 1. `POST /api/v1/cron/expire-subscriptions` with no header. 2. Repeat with a wrong bearer. |
| Expected Result | Both 401 `unauthenticated` "Invalid or missing cron secret". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | cron/[job]/route.ts:17-38 |

##### TC-471 — Stale pending subscription swept after 24 h
| Field | Description |
|---|---|
| Test Case ID | TC-471 |
| Requirement ID | FR-217 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Stale pending subscription swept after 24 h |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending subscription created >24 h ago whose intent failed |
| Test Data | system |
| Steps | 1. Run `expire-subscriptions`. |
| Expected Result | Subscription `cancelled`; a pending one younger than 24 h untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:47,1040-1074 |

##### TC-472 — Center lists only its own payments with a Cairo date filter
| Field | Description |
|---|---|
| Test Case ID | TC-472 |
| Requirement ID | FR-218 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Center lists only its own payments with a Cairo date filter |
| Test Type | Functional |
| Priority | High |
| Preconditions | Payments exist in two centers; one recorded at 00:30 Cairo |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments?from=<today>&to=<today>`. |
| Expected Result | Only own-center rows; the 00:30 Cairo row is included for that Cairo date (not the previous UTC day). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | day-range.ts:10-25 |

##### TC-473 — Parent cannot list a non-child's payments
| Field | Description |
|---|---|
| Test Case ID | TC-473 |
| Requirement ID | FR-218 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent cannot list a non-child's payments |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments?studentId=<unlinked student>`. |
| Expected Result | 403 "Not linked to this student". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments.ts:155 |

##### TC-474 — Horizontal access to another center's payment
| Field | Description |
|---|---|
| Test Case ID | TC-474 |
| Requirement ID | FR-219 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Horizontal access to another center's payment |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Payment P of Center A |
| Test Data | center_admin of a second center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments/<P>`. |
| Expected Result | 403; body contains no payment fields. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments.ts:205-230 |

##### TC-475 — Malformed id returns 404 not 500
| Field | Description |
|---|---|
| Test Case ID | TC-475 |
| Requirement ID | FR-219 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Malformed id returns 404 not 500 |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments/not-a-uuid`. |
| Expected Result | 404 "Resource not found". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | errors/http.ts P2025 mapping |

##### TC-476 — Receipt document for a refund renders as refund
| Field | Description |
|---|---|
| Test Case ID | TC-476 |
| Requirement ID | FR-220 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Receipt document for a refund renders as refund |
| Test Type | Functional |
| Priority | High |
| Preconditions | Armed refund R exists |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments/<R>/receipt-document`. 2. Open `/ar/receipts/<R>`. |
| Expected Result | `isRefund:true`, negative amount, issuer = center name; page prints without error. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | receipt-document.ts:53-71 |

##### TC-477 — Receipt document for a foreign payment is 404
| Field | Description |
|---|---|
| Test Case ID | TC-477 |
| Requirement ID | FR-220 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Receipt document for a foreign payment is 404 |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/payments/<other student's id>/receipt-document`. |
| Expected Result | 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | receipt-document/route.ts:10-19 |

##### TC-478 — Arm a partial cash refund
| Field | Description |
|---|---|
| Test Case ID | TC-478 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Arm a partial cash refund |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Positive payment P 50000, no settled lesson |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/<P>/refund` {amount:20000, reason:"duplicate", refundChannel:"cash_drawer"}. |
| Expected Result | 201 row amount -20000, refundChannel cash_drawer, refundConfirmedAt null; `payments.refunded_amount` of P = 20000; `transactions` pending row center→student; coverage rows cancelled. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:118-260 |

##### TC-479 — Cumulative refund bound
| Field | Description |
|---|---|
| Test Case ID | TC-479 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cumulative refund bound |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | P refunded 20000 of 50000 |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Refund 30000 → 2. Refund 1. |
| Expected Result | 1 → 201; 2 → 422 "Refund exceeds the original payment"; refunded_amount stays 50000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:242 |

##### TC-480 — Concurrent refunds cannot both pass the bound
| Field | Description |
|---|---|
| Test Case ID | TC-480 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Concurrent refunds cannot both pass the bound |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | P 50000 unrefunded |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Fire two `POST …/refund` {amount:30000} simultaneously (distinct clientRequestId). |
| Expected Result | Exactly one 201; the other 422; refunded_amount = 30000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | conditional UPDATE refund-payment.ts:242 |

##### TC-481 — Refund refused when a lesson under the receipt has settled
| Field | Description |
|---|---|
| Test Case ID | TC-481 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Refund refused when a lesson under the receipt has settled |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Monthly subscription paid by P; one session completed and settled |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST …/refund` {amount:1000, reason:"x", refundChannel:"bank_transfer"}. |
| Expected Result | 422 "A lesson under this receipt has already been settled — refund the lesson instead". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:187-191 |

##### TC-482 — Refund of a cash wallet top-up after the wallet was spent
| Field | Description |
|---|---|
| Test Case ID | TC-482 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Refund of a cash wallet top-up after the wallet was spent |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Cash top-up 10000 (FR-238); student spent 8000 |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Refund 10000 of the top-up receipt. |
| Expected Result | 422 (wallet conditional decrement fails); wallet balance unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:193-215 |

##### TC-483 — Refund channel enum excludes wallet/gateway
| Field | Description |
|---|---|
| Test Case ID | TC-483 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Refund channel enum excludes wallet/gateway |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST refundChannel "wallet". 2. POST refundChannel "gateway". |
| Expected Result | Both 400 "Validation failed". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:20-26 |

##### TC-484 — Idempotent refund by clientRequestId
| Field | Description |
|---|---|
| Test Case ID | TC-484 |
| Requirement ID | FR-221 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Idempotent refund by clientRequestId |
| Test Type | Functional |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST refund with clientRequestId "qa-refund-0001" twice. |
| Expected Result | 1st 201; 2nd 422 "This refund request was already recorded"; one row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:118 |

##### TC-485 — Confirm an armed refund
| Field | Description |
|---|---|
| Test Case ID | TC-485 |
| Requirement ID | FR-222 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Confirm an armed refund |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Armed refund R |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/<R>/refund/confirm` {externalRef:"SLIP-1042"}. |
| Expected Result | 200; refundConfirmedAt set, refundExternalRef "SLIP-1042"; ledger row `completed`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:471-562 |

##### TC-486 — Double confirmation
| Field | Description |
|---|---|
| Test Case ID | TC-486 |
| Requirement ID | FR-222 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Double confirmation |
| Test Type | Negative |
| Priority | High |
| Preconditions | R confirmed |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Confirm again. 2. Confirm with externalRef "". |
| Expected Result | 1 → 422 "This refund is already confirmed"; 2 → 400 "Validation failed". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:489,502 |

##### TC-487 — Confirm a positive payment
| Field | Description |
|---|---|
| Test Case ID | TC-487 |
| Requirement ID | FR-222 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Confirm a positive payment |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/<positive P>/refund/confirm` {externalRef:"x"}. |
| Expected Result | 422 "This receipt is not a refund". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:481 |

##### TC-488 — Unconfirmed queue reflects arm/confirm
| Field | Description |
|---|---|
| Test Case ID | TC-488 |
| Requirement ID | FR-223 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Unconfirmed queue reflects arm/confirm |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. GET `/api/v1/payments/refunds/unconfirmed` before arming, after arming, after confirming. |
| Expected Result | Row absent → present → absent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:568-580 |

##### TC-489 — Accountant is blocked from the refund queue door
| Field | Description |
|---|---|
| Test Case ID | TC-489 |
| Requirement ID | FR-223 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Accountant is blocked from the refund queue door |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff center_accountant of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. GET `/api/v1/payments/refunds/unconfirmed`. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | route requireRole(center_admin) |

##### TC-490 — Availability reflects PAYMENTS_MODE
| Field | Description |
|---|---|
| Test Case ID | TC-490 |
| Requirement ID | FR-224 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Availability reflects PAYMENTS_MODE |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Test env PAYMENTS_MODE=mock |
| Test Data | none |
| Steps | 1. `GET /api/v1/payments/availability`. |
| Expected Result | 200; online checkout available = true; `Cache-Control` public header present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | availability/route.ts:6-9 |

##### TC-491 — Initiate a course intent idempotently
| Field | Description |
|---|---|
| Test Case ID | TC-491 |
| Requirement ID | FR-225 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Initiate a course intent idempotently |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active course with price |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/initiate` {courseId, method:"card", idempotencyKey:"qa-init-00001"} twice. |
| Expected Result | 1st 201 intent pending, expiresAt ≈ now+60 min; 2nd 201 same `id`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:34-107 |

##### TC-492 — Idempotency key owned by another user
| Field | Description |
|---|---|
| Test Case ID | TC-492 |
| Requirement ID | FR-225 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Idempotency key owned by another user |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Key used by student A |
| Test Data | second student (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST initiate with student A's key. |
| Expected Result | 403 "Idempotency key belongs to another user". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:54 |

##### TC-493 — Key length boundaries and rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-493 |
| Requirement ID | FR-225 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Key length boundaries and rate limit |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | — |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. key of 7 chars. 2. key of 129 chars. 3. 31 valid calls within 30 s. |
| Expected Result | 1–2 → 400; call 31 → 429 "Too many requests, please slow down." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | initiate/route.ts; rate-limit/middleware.ts:6-18 |

##### TC-494 — Parent cannot use the student initiate door
| Field | Description |
|---|---|
| Test Case ID | TC-494 |
| Requirement ID | FR-225 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent cannot use the student initiate door |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST initiate. |
| Expected Result | 403 "Students only". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:38 |

##### TC-495 — Owner polls intent; stranger blocked
| Field | Description |
|---|---|
| Test Case ID | TC-495 |
| Requirement ID | FR-226 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Owner polls intent; stranger blocked |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Intent I of student A |
| Test Data | student A and student B (password: see docs/guides/test-credentials.md) |
| Steps | 1. A: `GET /api/v1/payments/intents/<I>`. 2. B: same. |
| Expected Result | A → 200 status pending; B → 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:182-196 |

##### TC-496 — Mock success settles once
| Field | Description |
|---|---|
| Test Case ID | TC-496 |
| Requirement ID | FR-227 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Mock success settles once |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | PAYMENTS_MODE=mock, intent I pending |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/intents/<I>/mock-complete` {outcome:"success"} twice. |
| Expected Result | 1st 200 result paid; intent `paid`; one payment + ledger rows. 2nd → no new rows (handled false / idempotent). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | mock-complete.ts; payment-intents.ts:376-547 |

##### TC-497 — Mock failure moves intent to failed
| Field | Description |
|---|---|
| Test Case ID | TC-497 |
| Requirement ID | FR-227 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Mock failure moves intent to failed |
| Test Type | Functional |
| Priority | High |
| Preconditions | Intent pending |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. mock-complete {outcome:"failure"}. |
| Expected Result | Intent `failed`; no payment row; wallet/subscription unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:397-400 |

##### TC-498 — Strict body and mode guards
| Field | Description |
|---|---|
| Test Case ID | TC-498 |
| Requirement ID | FR-227 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Strict body and mode guards |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. body {outcome:"success", extra:1}. 2. In an env with PAYMENTS_MODE=sandbox call mock-complete. |
| Expected Result | 1 → 400; 2 → 422 "mock-complete is only available when PAYMENTS_MODE=mock". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | mock-complete/route.ts:12-27 |

##### TC-499 — Webhook without hmac is rejected
| Field | Description |
|---|---|
| Test Case ID | TC-499 |
| Requirement ID | FR-228 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Webhook without hmac is rejected |
| Test Type | Security |
| Priority | Critical |
| Preconditions | — |
| Test Data | none |
| Steps | 1. `POST /api/v1/payments/paymob/webhook` with a valid-looking JSON body and no `hmac` query. 2. Same with `hmac=deadbeef`. |
| Expected Result | 1 → 401 `invalid_signature` "Missing hmac"; 2 → 401 "Invalid hmac"; intent unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | paymob-driver.ts:111-117 |

##### TC-500 — Webhook rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-500 |
| Requirement ID | FR-228 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Webhook rate limit |
| Test Type | Security |
| Priority | Medium |
| Preconditions | — |
| Test Data | none |
| Steps | 1. Send 121 unsigned webhook posts within 120 s. |
| Expected Result | Call 121 → 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | webhook/route.ts rate 120/120 |

##### TC-501 — Late capture after expiry
| Field | Description |
|---|---|
| Test Case ID | TC-501 |
| Requirement ID | FR-229 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Late capture after expiry |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | Intent expired by the sweep (TC-469) |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. mock-complete {outcome:"success"} on the expired intent. |
| Expected Result | Result `paid_late`; intent `paid`; subscription/wallet settled; audit row beforeState.status "expired". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:443-463 |

##### TC-502 — Amount mismatch parks needs_review
| Field | Description |
|---|---|
| Test Case ID | TC-502 |
| Requirement ID | FR-229 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Amount mismatch parks needs_review |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Mock driver with a tampered amount (test harness) or unit test |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Deliver a signed capture whose amount is intent.amount − 100. |
| Expected Result | Intent `needs_review`; no payment, ledger or wallet change; finance notification created. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:264-316 |

##### TC-503 — Void event on captured intent only audits
| Field | Description |
|---|---|
| Test Case ID | TC-503 |
| Requirement ID | FR-229 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Void event on captured intent only audits |
| Test Type | Functional |
| Priority | High |
| Preconditions | Intent paid |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Deliver a signed `void` event for the same order. |
| Expected Result | Status stays `paid`; audit `payment.unsolicited_void`; no reversal rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payment-intents.ts:335-369 |

##### TC-504 — Student wallet online top-up within bounds
| Field | Description |
|---|---|
| Test Case ID | TC-504 |
| Requirement ID | FR-230 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Student wallet online top-up within bounds |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | PAYMENTS_MODE=mock; wallet_settings defaults |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/wallet-topup/initiate` {amount:20000, idempotencyKey:"qa-wt-00001"}. 2. mock-complete success. 3. `GET /api/v1/me/wallet`. |
| Expected Result | Balance +20000; `wallet_ledger` row type topup; `payments` row centerId null, note "Wallet top-up …"; notification "Wallet topped up". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | wallet-facade.ts:118-189 |

##### TC-505 — Top-up bounds
| Field | Description |
|---|---|
| Test Case ID | TC-505 |
| Requirement ID | FR-230 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Top-up bounds |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Defaults min 1000 / max 500000 |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. amount 999. 2. amount 1000. 3. amount 500000. 4. amount 500001. |
| Expected Result | 1 → 422 "Minimum top-up is 10 EGP"; 2,3 → 201; 4 → 422 "Maximum top-up is 5000 EGP". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | wallet.ts:92-117 |

##### TC-506 — Parent wallet top-up
| Field | Description |
|---|---|
| Test Case ID | TC-506 |
| Requirement ID | FR-231 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent wallet top-up |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Mock mode |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/payments/parent-wallet-topup/initiate` {amount:30000, idempotencyKey:"qa-pwt-00001"}. 2. mock-complete success. 3. `GET /api/v1/me/parent-wallet`. |
| Expected Result | Balance +30000; `payments` row studentId null, payerUserId = parent, note "Parent wallet top-up (online)". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | parent-wallet-facade.ts:118-193 |

##### TC-507 — Student blocked from parent top-up door
| Field | Description |
|---|---|
| Test Case ID | TC-507 |
| Requirement ID | FR-231 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Student blocked from parent top-up door |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST parent-wallet-topup/initiate. |
| Expected Result | 403 "Parents only". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | parent-wallet-facade.ts:55 |

##### TC-508 — Monthly checkout paid from student wallet
| Field | Description |
|---|---|
| Test Case ID | TC-508 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Monthly checkout paid from student wallet |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Wallet 60000; course monthly 50000 enabled |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/subscriptions/checkout` {courseId, plan:"monthly", payFrom:"wallet", idempotencyKey:"qa-ck-00001"}. 2. `GET /api/v1/me/wallet`. 3. `GET /api/v1/me/subscriptions`. |
| Expected Result | 201 `{walletPaid:true, receiptNumber}`; balance 10000; subscription active, periodStart = Cairo 00:00 of today, periodEnd = +30 d − 1 ms; payments row method wallet; teacher-direct split if no center (BR-193). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:352-507,582-680 |

##### TC-509 — Insufficient wallet
| Field | Description |
|---|---|
| Test Case ID | TC-509 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Insufficient wallet |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Wallet 40000; price 50000 |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout payFrom wallet. |
| Expected Result | 422 "Insufficient wallet balance — top up or pay another way"; no subscription row; balance unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | wallet.ts:72-79 |

##### TC-510 — Concurrent wallet checkouts on one balance
| Field | Description |
|---|---|
| Test Case ID | TC-510 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Concurrent wallet checkouts on one balance |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | Wallet 60000; two courses priced 50000 |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Fire both wallet checkouts at once. |
| Expected Result | Exactly one 201 walletPaid; other 422 insufficient; balance 10000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FOR UPDATE + conditional decrement |

##### TC-511 — Gateway checkout then in-flight guard
| Field | Description |
|---|---|
| Test Case ID | TC-511 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Gateway checkout then in-flight guard |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | Mock mode |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout payFrom gateway key K1 → 2. checkout same course key K2 → 3. mock-complete success on K1's intent → 4. `GET /api/v1/me/subscriptions`. |
| Expected Result | 1 → 201 pending + intent; 2 → 422 "A checkout for this course is already in progress — finish it or cancel it first"; 4 → subscription active, payment and ledger rows written once. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:516-554,689-796 |

##### TC-512 — Plan not enabled / duplicate active
| Field | Description |
|---|---|
| Test Case ID | TC-512 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Plan not enabled / duplicate active |
| Test Type | Negative |
| Priority | High |
| Preconditions | Course with per_session disabled; active monthly exists |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout plan per_session with sessionId. 2. checkout monthly again. |
| Expected Result | 1 → 422 "Per-session plan is not enabled for this course"; 2 → 422 "An active monthly subscription for this course already exists". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:58-75 |

##### TC-513 — Per-session pass rules
| Field | Description |
|---|---|
| Test Case ID | TC-513 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Per-session pass rules |
| Test Type | Negative |
| Priority | High |
| Preconditions | Course with per_session enabled; one past session |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout per_session without sessionId. 2. with a past sessionId. 3. with another course's sessionId. |
| Expected Result | 1 → 422 "sessionId is required for a per-session pass"; 2 → 422 "This session can no longer be booked"; 3 → 422 "Session not found on this course". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:190-321 |

##### TC-514 — Orphan capture credited to payer wallet
| Field | Description |
|---|---|
| Test Case ID | TC-514 |
| Requirement ID | FR-232 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Orphan capture credited to payer wallet |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | Pending gateway checkout; then subscription cancelled (FR-234) and course deactivated |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. mock-complete success on the old intent. |
| Expected Result | Intent paid; subscription stays cancelled; student wallet +price; audit `payment.orphan_capture_credited`; notification "Payment credited to wallet". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:689-796 |

##### TC-515 — Parent pays from parent wallet for a child
| Field | Description |
|---|---|
| Test Case ID | TC-515 |
| Requirement ID | FR-233 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent pays from parent wallet for a child |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Parent wallet 50000; child eligible |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout {studentId:<child>, courseId, plan:"monthly", payFrom:"parent_wallet", idempotencyKey}. |
| Expected Result | 201 walletPaid; parent balance 0; `transactions.fromEntityId` = child studentId, toEntityId = center/teacher; `payments.payerUserId` = parent; `Subscription.createdBy` = parent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:330-350; parent-pays-lesson.md |

##### TC-516 — Parent without studentId / non-child / insufficient
| Field | Description |
|---|---|
| Test Case ID | TC-516 |
| Requirement ID | FR-233 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent without studentId / non-child / insufficient |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Parent wallet 10000 |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout without studentId. 2. with an unlinked studentId. 3. with child, payFrom parent_wallet, price 50000. |
| Expected Result | 1 → 422 "studentId is required — choose which child"; 2 → 403 "Not an approved child of this parent"; 3 → 422 "Insufficient wallet balance — top up or pay by card". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:330-350; parent-wallet.ts |

##### TC-517 — Student cannot pay from a parent wallet
| Field | Description |
|---|---|
| Test Case ID | TC-517 |
| Requirement ID | FR-233 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Student cannot pay from a parent wallet |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. checkout payFrom parent_wallet. |
| Expected Result | 403 "Only a parent can pay from a parent wallet". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:373 |

##### TC-518 — Cancel pending subscription
| Field | Description |
|---|---|
| Test Case ID | TC-518 |
| Requirement ID | FR-234 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cancel pending subscription |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending gateway checkout |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/subscriptions/<id>/cancel`. 2. checkout same course again. |
| Expected Result | 1 → 200 status cancelled; 2 → 201 (guard released). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:961-984 |

##### TC-519 — Cancel active or foreign subscription
| Field | Description |
|---|---|
| Test Case ID | TC-519 |
| Requirement ID | FR-234 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cancel active or foreign subscription |
| Test Type | Negative |
| Priority | High |
| Preconditions | Active subscription S of student A |
| Test Data | student A then student B (password: see docs/guides/test-credentials.md) |
| Steps | 1. A cancels S. 2. B cancels A's pending subscription. |
| Expected Result | 1 → 422 "Only unpaid subscriptions can be cancelled here"; 2 → 403/404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:961-984 |

##### TC-520 — List my subscriptions scope
| Field | Description |
|---|---|
| Test Case ID | TC-520 |
| Requirement ID | FR-235 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | List my subscriptions scope |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | — |
| Test Data | student and parent (password: see docs/guides/test-credentials.md) |
| Steps | 1. student `GET /api/v1/me/subscriptions?studentId=<other>`. 2. parent GET without studentId. 3. parent GET with child id. |
| Expected Result | 1 → 403 "A student can only list their own subscriptions"; 2 → 422; 3 → 200 ≤100 rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:929-959 |

##### TC-521 — Walk-in per-session pass with check-in by receptionist
| Field | Description |
|---|---|
| Test Case ID | TC-521 |
| Requirement ID | FR-236 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Walk-in per-session pass with check-in by receptionist |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Open shift; course at center; session today |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/subscriptions` {studentId, courseId, plan:"per_session", sessionId, markAttendance:true, paymentMethod:"cash"}. |
| Expected Result | 201 `{subscription active, receiptNumber}`; payments row cash with shiftId; attendance row present/counter_only per teacher mode; `center_wallet_ledger` move −platformShare; student notification "Your subscription was recorded at the center. Receipt …". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | subscriptions.ts:798-925 |

##### TC-522 — Accountant and foreign course are refused
| Field | Description |
|---|---|
| Test Case ID | TC-522 |
| Requirement ID | FR-236 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Accountant and foreign course are refused |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | center_staff center_accountant of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. accountant POST walk-in. 2. receptionist POST with another center's courseId. |
| Expected Result | 1 → 403 "Center accountant is read-only"; 2 → 404 "Course not found at this center". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-staff allow-list; subscriptions.ts:849 |

##### TC-523 — Non-cash counter method does not enter cashNet
| Field | Description |
|---|---|
| Test Case ID | TC-523 |
| Requirement ID | FR-236 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Non-cash counter method does not enter cashNet |
| Test Type | Functional |
| Priority | High |
| Preconditions | Open shift |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Walk-in monthly with paymentMethod "instapay". 2. `GET /api/v1/center/shifts/current`. |
| Expected Result | Shift `expectedCashNow` unchanged; instapay bucket increased. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts:106 |

##### TC-524 — Center subscriptions list
| Field | Description |
|---|---|
| Test Case ID | TC-524 |
| Requirement ID | FR-237 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Center subscriptions list |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/center/subscriptions`. |
| Expected Result | 200; newest first; ≤200; only own center. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-list.ts |

##### TC-525 — Cash wallet top-up moves center credit
| Field | Description |
|---|---|
| Test Case ID | TC-525 |
| Requirement ID | FR-238 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cash wallet top-up moves center credit |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Open shift; student on roster |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/center/credit` (as admin, note balance B). 2. `POST /api/v1/center/wallet-topup` {studentId, amount:10000}. 3. student `GET /api/v1/me/wallet`. 4. admin `GET /api/v1/center/credit`. |
| Expected Result | 201; student +10000 (ledger topup, method cash); center credit = B − 10000 with ledger type wallet_cash_collection; payments row cash with shiftId. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | cash-topup.ts:29-100 |

##### TC-526 — Top-up for a non-roster student
| Field | Description |
|---|---|
| Test Case ID | TC-526 |
| Requirement ID | FR-238 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Top-up for a non-roster student |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST with other-center studentId. |
| Expected Result | 422 "Student is not on this center's roster". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | cash-topup.ts |

##### TC-527 — Center credit view scope
| Field | Description |
|---|---|
| Test Case ID | TC-527 |
| Requirement ID | FR-239 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Center credit view scope |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. receptionist `GET /api/v1/center/credit`. 2. admin same. |
| Expected Result | 1 → 403; 2 → 200 balance + ledger. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | credit/route.ts |

##### TC-528 — Center credit online top-up
| Field | Description |
|---|---|
| Test Case ID | TC-528 |
| Requirement ID | FR-240 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Center credit online top-up |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Mock mode |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/credit/topup` {amount:100000, method:"card", idempotencyKey:"qa-cct-00001"}. 2. mock-complete success. 3. GET credit. |
| Expected Result | 201 intent expiresAt ≈ now+30 min, purpose center_credit_topup, studentId null; after capture balance +100000, ledger topup. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-credit-topup.ts:34-152 |

##### TC-529 — Credit top-up bounds
| Field | Description |
|---|---|
| Test Case ID | TC-529 |
| Requirement ID | FR-240 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Credit top-up bounds |
| Test Type | Boundary |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. amount 999. 2. amount 1000. 3. amount 5000000. 4. amount 5000001. |
| Expected Result | 1,4 → 422; 2,3 → 201. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-credit-topup.ts bounds 1_000..5_000_000 |

##### TC-530 — Center wallet available-for-payout
| Field | Description |
|---|---|
| Test Case ID | TC-530 |
| Requirement ID | FR-241 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Center wallet available-for-payout |
| Test Type | Functional |
| Priority | High |
| Preconditions | Center balance 120000; one pending payout 100000 |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/center/wallet`. 2. `GET /api/v1/center/wallet/transactions?limit=101`. |
| Expected Result | 1 → balance 120000, available 20000; 2 → 400 (limit > 100). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-wallet.ts:20-78 |

##### TC-531 — Accountant can read center wallet
| Field | Description |
|---|---|
| Test Case ID | TC-531 |
| Requirement ID | FR-241 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Accountant can read center wallet |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff center_accountant of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/center/wallet`. |
| Expected Result | 200. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | centerStaff ACCOUNTANT allow read |

##### TC-532 — Payout request within and beyond available
| Field | Description |
|---|---|
| Test Case ID | TC-532 |
| Requirement ID | FR-242 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Payout request within and beyond available |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Balance 120000, no pending payouts |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/wallet/payout-request` {amount:100000, clientRequestId:"qa-po-00001"}. 2. same body again. 3. {amount:30000, clientRequestId:"qa-po-00002"}. |
| Expected Result | 1 → 201 pending; 2 → 201 same id (idempotent); 3 → 422 (available 20000). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-wallet.ts:80-170 |

##### TC-533 — Accountant cannot request payout
| Field | Description |
|---|---|
| Test Case ID | TC-533 |
| Requirement ID | FR-242 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Accountant cannot request payout |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | center_staff center_accountant of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST payout-request. |
| Expected Result | 403 "Center accountant is read-only". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | centerStaff allow-list |

##### TC-534 — Cancel own pending payout, not approved
| Field | Description |
|---|---|
| Test Case ID | TC-534 |
| Requirement ID | FR-243 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cancel own pending payout, not approved |
| Test Type | Functional |
| Priority | High |
| Preconditions | One pending, one approved (back-office) payout |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. cancel pending. 2. cancel approved. 3. GET wallet. |
| Expected Result | 1 → 200 cancelled; 2 → 422; 3 → available restored by the cancelled amount. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payout-cancel.ts |

##### TC-535 — Cancel another center's payout
| Field | Description |
|---|---|
| Test Case ID | TC-535 |
| Requirement ID | FR-243 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Cancel another center's payout |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of a second center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/wallet/payouts/<foreign id>/cancel`. |
| Expected Result | 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payout-cancel.ts |

##### TC-536 — Open shift and live expected cash
| Field | Description |
|---|---|
| Test Case ID | TC-536 |
| Requirement ID | FR-244 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Open shift and live expected cash |
| Test Type | Functional |
| Priority | High |
| Preconditions | No open shift |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/shifts` {openingFloat:50000}. 2. record 30000 cash (walk-in). 3. `GET /api/v1/center/shifts/current`. |
| Expected Result | 1 → 201; 3 → expectedCashNow 80000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts:20-110 |

##### TC-537 — Second open shift refused; negative float
| Field | Description |
|---|---|
| Test Case ID | TC-537 |
| Requirement ID | FR-244 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Second open shift refused; negative float |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Shift open |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. POST open again. 2. POST {openingFloat:-1}. |
| Expected Result | 1 → 422; 2 → 400. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts; route schema min(0) |

##### TC-538 — Close shift with variance
| Field | Description |
|---|---|
| Test Case ID | TC-538 |
| Requirement ID | FR-245 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Close shift with variance |
| Test Type | Functional |
| Priority | High |
| Preconditions | Shift expected 80000 |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/shifts/<id>/close` {countedCash:79500, note:"short"}. |
| Expected Result | 200; expectedCash 80000, variance −500, closedAt set. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts:112-160 |

##### TC-539 — Close twice / note too long
| Field | Description |
|---|---|
| Test Case ID | TC-539 |
| Requirement ID | FR-245 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Close twice / note too long |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Closed shift |
| Test Data | center_staff receptionist of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. close again. 2. close another open shift with 501-char note. |
| Expected Result | 1 → 422; 2 → 400. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts; schema max(500) |

##### TC-540 — Shift list date bound (UTC vs Cairo)
| Field | Description |
|---|---|
| Test Case ID | TC-540 |
| Requirement ID | FR-246 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Shift list date bound (UTC vs Cairo) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Shift closed at 23:30 Cairo on day D |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/center/shifts?from=D&to=D`. |
| Expected Result | Implemented: shift listed under D only if ≤ 23:59:59.999 UTC (= 01:59 Cairo D+1) — record the actual grouping; expected per BR-206 is Cairo day. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shifts.ts:173 — GAP-080 |

##### TC-541 — Percent-of-net agreement drives settlement
| Field | Description |
|---|---|
| Test Case ID | TC-541 |
| Requirement ID | FR-247 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Percent-of-net agreement drives settlement |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Agreement percent_of_net 3000 bp residual teacher; lesson 6000; fees 200/200 |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/center/teacher-agreements` {teacherId, basis:"percent_of_net", rateBp:3000, residual:"teacher"}. 2. complete a session with 1 present student (Courses module). 3. GET teacher & center wallets. |
| Expected Result | Center +1480, teacher +4120, platform rows 400 total (see BR-207 example). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | agreements.ts; distribution.ts |

##### TC-542 — Agreement validation
| Field | Description |
|---|---|
| Test Case ID | TC-542 |
| Requirement ID | FR-247 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Agreement validation |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. rateBp 10001. 2. percent_of_net without rateBp. 3. fixed_per_student without rateFlat. |
| Expected Result | 1 → 400; 2,3 → 422. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | teacher-agreements/route.ts |

##### TC-543 — Teacher wallet after teacher-direct sale
| Field | Description |
|---|---|
| Test Case ID | TC-543 |
| Requirement ID | FR-248 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Teacher wallet after teacher-direct sale |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Teacher-direct course 50000 monthly; global 1500 bp |
| Test Data | teacher with a center course (password: see docs/guides/test-credentials.md) |
| Steps | 1. A student pays (TC-508 on that course). 2. `GET /api/v1/teacher/wallet`. |
| Expected Result | Balance +42500; ledger row subscription; platform row 7500. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | commission.ts:11-36; subscriptions.ts:190-268 |

##### TC-544 — Assistant blocked from teacher wallet
| Field | Description |
|---|---|
| Test Case ID | TC-544 |
| Requirement ID | FR-248 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Assistant blocked from teacher wallet |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | assistant of that teacher (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/teacher/wallet`. 2. `POST /api/v1/teacher/wallet/payout-request`. |
| Expected Result | Both 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | domain-decisions.md:66-69 |

##### TC-545 — Teacher payout replay window
| Field | Description |
|---|---|
| Test Case ID | TC-545 |
| Requirement ID | FR-249 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Teacher payout replay window |
| Test Type | Concurrency |
| Priority | High |
| Preconditions | Teacher available 42500 |
| Test Data | teacher with a center course (password: see docs/guides/test-credentials.md) |
| Steps | 1. Fire two `POST /api/v1/teacher/wallet/payout-request` {amount:40000, clientRequestId:"qa-tpo-0001"} 1 s apart. 2. Request 5000 more. |
| Expected Result | One row; 2 → 422 over available. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | teacher-wallet.ts replay 120 s |

##### TC-546 — Student wallet balance equals ledger sum
| Field | Description |
|---|---|
| Test Case ID | TC-546 |
| Requirement ID | FR-250 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Student wallet balance equals ledger sum |
| Test Type | Database |
| Priority | High |
| Preconditions | Student with top-ups, debits, refund |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/me/wallet`. 2. `GET /api/v1/me/wallet/history?limit=100`. |
| Expected Result | balance = Σ ledger amounts; response includes minTopup 1000 / maxTopup 500000 (defaults). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | wallet-facade.ts:30-60 |

##### TC-547 — Parent wallet history shows child debit
| Field | Description |
|---|---|
| Test Case ID | TC-547 |
| Requirement ID | FR-251 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Parent wallet history shows child debit |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | After TC-515 |
| Test Data | parent with an approved child (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/me/parent-wallet/history`. |
| Expected Result | Debit row 50000 referencing the child's course. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | parent-wallet-facade.ts |

##### TC-548 — Points awarded and claw-back window
| Field | Description |
|---|---|
| Test Case ID | TC-548 |
| Requirement ID | FR-252 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Points awarded and claw-back window |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Student with 0 points |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Pay (walk-in). 2. `GET /api/v1/me/points`. 3. Refund within 10 s (automate). 4. Refund another payment after 60 s. |
| Expected Result | 2 → points > 0; 3 → points reverted; 4 → points unchanged (document). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | points.ts clawBackPaymentPoints — Q-048 |

##### TC-549 — Create and list expense
| Field | Description |
|---|---|
| Test Case ID | TC-549 |
| Requirement ID | FR-253 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Create and list expense |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `POST /api/v1/expenses` {amount:500000, category:<first EXPENSE_CATEGORIES value>, expenseDate:"2026-11-01"}. 2. GET with from/to. |
| Expected Result | 201; listed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | expenses.ts:20-80 |

##### TC-550 — Expense validation
| Field | Description |
|---|---|
| Test Case ID | TC-550 |
| Requirement ID | FR-253 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Expense validation |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. expenseDate "01/11/2026". 2. amount 99999901. 3. accountant POST. 4. expenseDate "2026-13-45". |
| Expected Result | 1,2 → 400; 3 → 403; 4 → record actual (regex passes — MISSING VALIDATION). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | expenses/route.ts |

##### TC-551 — Update and hard-delete expense
| Field | Description |
|---|---|
| Test Case ID | TC-551 |
| Requirement ID | FR-254 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Update and hard-delete expense |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Expense E |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. PATCH amount 1000. 2. DELETE E. 3. query DB `expenses` for E. |
| Expected Result | 1 → 200; 2 → 200/204; 3 → row absent (hard delete — GAP-081). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | expenses.ts:112 |

##### TC-552 — Foreign expense
| Field | Description |
|---|---|
| Test Case ID | TC-552 |
| Requirement ID | FR-254 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Foreign expense |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | center_admin of a second center (password: see docs/guides/test-credentials.md) |
| Steps | 1. PATCH/DELETE E of first center. |
| Expected Result | 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | expenses.ts |

##### TC-553 — Receipt e-mail queued when e-mail present
| Field | Description |
|---|---|
| Test Case ID | TC-553 |
| Requirement ID | FR-255 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Receipt e-mail queued when e-mail present |
| Test Type | Integration |
| Priority | Low |
| Preconditions | Student with e-mail; mail transport mock |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Record payment. 2. Inspect outbox/log. |
| Expected Result | One receipt e-mail with RCP number and amount; payment persisted even if transport fails. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | receipt-email.ts |

##### TC-554 — Coverage window boundaries
| Field | Description |
|---|---|
| Test Case ID | TC-554 |
| Requirement ID | FR-256 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Coverage window boundaries |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Monthly active periodStart D 00:00 Cairo |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Attempt counter check-in (Courses module) for sessions on D, D+29 23:00 Cairo, D+30 00:30 Cairo. |
| Expected Result | D and D+29 covered; D+30 not covered. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | coverage.ts; subscriptions.ts:43-46 |

##### TC-555 — Public pricing example math
| Field | Description |
|---|---|
| Test Case ID | TC-555 |
| Requirement ID | FR-257 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Public pricing example math |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | none |
| Steps | 1. `GET /api/v1/public/pricing`. |
| Expected Result | Example 50000 → commission 7500 / teacherNet 42500 at 1500 bp; `live` flag false when no global row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | public-rates.ts:38-46 |

##### TC-556 — Monthly lesson price remainder on last lesson
| Field | Description |
|---|---|
| Test Case ID | TC-556 |
| Requirement ID | FR-258 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Monthly lesson price remainder on last lesson |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Monthly 50000 with 13 sessions in window |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Settlement preview for first and last session. |
| Expected Result | 12 lessons priced 3846, last 3848; Σ = 50000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | lesson-price.ts |

##### TC-557 — Unpriced lesson refuses settlement
| Field | Description |
|---|---|
| Test Case ID | TC-557 |
| Requirement ID | FR-258 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Unpriced lesson refuses settlement |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Present student with no coverage |
| Test Data | teacher with a center course (password: see docs/guides/test-credentials.md) |
| Steps | 1. Complete the session (Courses module). |
| Expected Result | Completion refused with a BusinessRuleError; no ledger rows; session not completed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | lesson-settlement.md |

##### TC-558 — Teacher-at-center split and funding leg
| Field | Description |
|---|---|
| Test Case ID | TC-558 |
| Requirement ID | FR-259 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Teacher-at-center split and funding leg |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Center course, pass 6000 paid cash, teacher commission 1000 bp, center fee 1500 |
| Test Data | teacher with a center course (password: see docs/guides/test-credentials.md) |
| Steps | 1. Complete session with the present student. 2. GET teacher wallet, center wallet, center credit. |
| Expected Result | Teacher +3900, center +1500, platform 600; center credit −600 (center_held); three `transactions` rows for the student. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | distribution.ts; fees.ts; center-credit.ts |

##### TC-559 — Settlement idempotency and economicsAt
| Field | Description |
|---|---|
| Test Case ID | TC-559 |
| Requirement ID | FR-259 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Settlement idempotency and economicsAt |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | Session S settled |
| Test Data | teacher with a center course (password: see docs/guides/test-credentials.md) |
| Steps | 1. Trigger settlement for S again. 2. Change global commission, re-run. |
| Expected Result | No new rows either time; amounts fixed at session start. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | distribution.ts |

##### TC-560 — Preview equals settlement
| Field | Description |
|---|---|
| Test Case ID | TC-560 |
| Requirement ID | FR-260 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Preview equals settlement |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session ready |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/sessions/<id>/settlement-preview`. 2. Complete session. 3. Compare ledger rows. |
| Expected Result | Same per-student amounts; preview wrote nothing. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | settlement-preview/route.ts |

##### TC-561 — creditMove rejects zero
| Field | Description |
|---|---|
| Test Case ID | TC-561 |
| Requirement ID | FR-261 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | creditMove rejects zero |
| Test Type | Database |
| Priority | Medium |
| Preconditions | Unit test |
| Test Data | developer harness |
| Steps | 1. Call creditMove with amount 0. |
| Expected Result | Throws; no ledger row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-credit.ts:63-89 |

##### TC-562 — Conditional decrement never overdraws
| Field | Description |
|---|---|
| Test Case ID | TC-562 |
| Requirement ID | FR-262 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Conditional decrement never overdraws |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | Wallet 100000 |
| Test Data | student on the demo center roster (password: see docs/guides/test-credentials.md) |
| Steps | 1. Fire two 60000 debits (two wallet checkouts) in parallel. |
| Expected Result | One success; final balance 40000; never negative. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | wallet.ts:72-79 |

##### TC-563 — Refund of a parent-funded top-up credits the parent
| Field | Description |
|---|---|
| Test Case ID | TC-563 |
| Requirement ID | FR-263 |
| Module | Payments, Subscriptions, Wallets & Settlement (ERP side) |
| Test Scenario | Refund of a parent-funded top-up credits the parent |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Parent paid a child's cash wallet top-up? (counter) — use parent-wallet top-up receipt |
| Test Data | center_admin of the demo center (password: see docs/guides/test-credentials.md) |
| Steps | 1. Refund the parent-wallet top-up receipt at the counter. |
| Expected Result | 422 "A parent-wallet top-up cannot be refunded at the counter" (payer is the parent; counter door excluded). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | refund-payment.ts:227; refund-credits-the-payer.md |

### 6. Teacher Portal, Assistants, Collaboration & Academic Content

Module: Teacher Portal, Assistants, Collaboration & Academic Content. Test accounts are named by role only; the shared password is in docs/guides/test-credentials.md (not repeated here). Run on the test environment `edura-env:test` or local demo data, never production. Actual Result and Status are filled by the tester.

##### TC-564 — Teacher creates an assistant with valid data

| Field | Value |
|---|---|
| Test Case ID | TC-564 |
| Requirement ID | FR-264 |
| Module | TCH |
| Test Scenario | Teacher creates an assistant with valid data |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | Name 'QA Assistant', new unused email, title 'Coordinator' |
| Steps | 1. Open My team. 2. Click Add assistant. 3. Fill fields. 4. Submit. |
| Expected Result | 201/success toast; assistant appears in list; invite email is sent; no password is shown to the teacher |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-565 — Create assistant with invalid input

| Field | Value |
|---|---|
| Test Case ID | TC-565 |
| Requirement ID | FR-264 |
| Module | TCH |
| Test Scenario | Create assistant with invalid input |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | Name 'A' (1 char); email 'not-an-email'; title of 121 chars |
| Steps | 1. Submit each invalid value separately via UI and POST /teacher/assistants. |
| Expected Result | 400 validation error for each; nothing created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-566 — Add an assistant already linked to another teacher

| Field | Value |
|---|---|
| Test Case ID | TC-566 |
| Requirement ID | FR-264 |
| Module | TCH |
| Test Scenario | Add an assistant already linked to another teacher |
| Test Type | Negative |
| Priority | High |
| Preconditions | Assistant linked to Teacher B; log in as Teacher A |
| Test Data | The assistant's email |
| Steps | 1. As Teacher A, add that email. |
| Expected Result | 409 conflict. Record that the message is generic (GAP-097); no second active link exists |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-567 — List my assistants shows only my team

| Field | Value |
|---|---|
| Test Case ID | TC-567 |
| Requirement ID | FR-265 |
| Module | TCH |
| Test Scenario | List my assistants shows only my team |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo); Teacher B exists with own course and students with an assistant |
| Test Data | None |
| Steps | 1. Open My team as Teacher A. 2. GET /teacher/assistants. |
| Expected Result | Only Teacher A's active assistants are listed; removed ones are absent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-568 — Resend invite to assistant who has not set a password

| Field | Value |
|---|---|
| Test Case ID | TC-568 |
| Requirement ID | FR-266 |
| Module | TCH |
| Test Scenario | Resend invite to assistant who has not set a password |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); pending assistant |
| Test Data | Pending assistant id |
| Steps | 1. Click resend invite (or POST .../invite). |
| Expected Result | Success; new email delivered; link works |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-569 — Invite rate limit and already-activated assistant

| Field | Value |
|---|---|
| Test Case ID | TC-569 |
| Requirement ID | FR-266 |
| Module | TCH |
| Test Scenario | Invite rate limit and already-activated assistant |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); activated assistant |
| Test Data | 11 rapid POSTs to the invite route; one POST for an activated assistant |
| Steps | 1. Send 11 requests within one minute. 2. Send invite for the activated assistant. |
| Expected Result | 11th request returns 429 rate_limited with Retry-After 60; activated assistant gets 422 with forgot-password hint |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-570 — Revoked assistant loses access on the next request

| Field | Value |
|---|---|
| Test Case ID | TC-570 |
| Requirement ID | FR-267 |
| Module | TCH |
| Test Scenario | Revoked assistant loses access on the next request |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A and logged in; Teacher A |
| Test Data | None |
| Steps | 1. Assistant opens Grades (works). 2. Teacher A removes the assistant. 3. Assistant reloads Grades and calls GET /grades. |
| Expected Result | 403 'Assistant is not linked to a teacher'; no teacher data shown (see Q-057 for live sessions) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-571 — Revoke confirmation and re-add

| Field | Value |
|---|---|
| Test Case ID | TC-571 |
| Requirement ID | FR-267 |
| Module | TCH |
| Test Scenario | Revoke confirmation and re-add |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); Assistant account linked to Teacher A |
| Test Data | None |
| Steps | 1. Click remove; read dialog; cancel. 2. Remove again and confirm. 3. Add the same email again. |
| Expected Result | Cancel changes nothing; confirm shows 'Remove assistant?' text; re-add revives the link without duplicate rows |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-572 — Assistant performs teacher work for the employing teacher

| Field | Value |
|---|---|
| Test Case ID | TC-572 |
| Requirement ID | FR-268 |
| Module | TCH |
| Test Scenario | Assistant performs teacher work for the employing teacher |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A; Teacher A has a course |
| Test Data | Grade 'Quiz 1' max 10 |
| Steps | 1. As assistant create a grade, upload a material, view collaborations. |
| Expected Result | All succeed and data belongs to Teacher A; delegation strip shows 'Acting on behalf of' Teacher A |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-573 — Assistant of Teacher A cannot touch Teacher B

| Field | Value |
|---|---|
| Test Case ID | TC-573 |
| Requirement ID | FR-268 |
| Module | TCH |
| Test Scenario | Assistant of Teacher A cannot touch Teacher B |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A; Teacher B exists with own course and students |
| Test Data | Teacher B grade id and material id |
| Steps | 1. As assistant call GET/PATCH/DELETE on Teacher B's grade and material ids. |
| Expected Result | 403 or 404 on each; nothing changed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-574 — Delegated mutation is audited

| Field | Value |
|---|---|
| Test Case ID | TC-574 |
| Requirement ID | FR-269 |
| Module | TCH |
| Test Scenario | Delegated mutation is audited |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A |
| Test Data | Create one grade as assistant |
| Steps | 1. Assistant creates a grade. 2. Inspect audit log in the back office. |
| Expected Result | Entry assistant.POST with onBehalfOf Teacher A and path/method |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-575 — Audit detail and failure behaviour

| Field | Value |
|---|---|
| Test Case ID | TC-575 |
| Requirement ID | FR-269 |
| Module | TCH |
| Test Scenario | Audit detail and failure behaviour |
| Test Type | Exploratory |
| Priority | High |
| Preconditions | Assistant account linked to Teacher A |
| Test Data | Same |
| Steps | 1. Check what the audit row contains. 2. If possible make the audit table unavailable in a test environment and repeat. |
| Expected Result | Row lacks changed values (GAP-096); action persists even if audit fails; record observed behaviour |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-576 — Assistant cannot manage the team

| Field | Value |
|---|---|
| Test Case ID | TC-576 |
| Requirement ID | FR-270 |
| Module | TCH |
| Test Scenario | Assistant cannot manage the team |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A |
| Test Data | POST /teacher/assistants, DELETE assistants/[id], POST invite |
| Steps | 1. Call each as the assistant. |
| Expected Result | 403 each; UI shows no Add assistant button |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-577 — Assistant cannot reach wallet or payout

| Field | Value |
|---|---|
| Test Case ID | TC-577 |
| Requirement ID | FR-270 |
| Module | TCH |
| Test Scenario | Assistant cannot reach wallet or payout |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Assistant account linked to Teacher A |
| Test Data | Wallet and payout endpoints (Payments module) |
| Steps | 1. Call the teacher wallet and payout endpoints as assistant. |
| Expected Result | 403; hand-off verified with Payments tester |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-578 — Teacher blacklists a student

| Field | Value |
|---|---|
| Test Case ID | TC-578 |
| Requirement ID | FR-271 |
| Module | TCH |
| Test Scenario | Teacher blacklists a student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); Student enrolled in Teacher A's course |
| Test Data | Student id, reason text |
| Steps | 1. POST /teacher/blacklist. |
| Expected Result | Success; student removed from teacher's courses per cascade; entry listed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-579 — Duplicate blacklist entry

| Field | Value |
|---|---|
| Test Case ID | TC-579 |
| Requirement ID | FR-271 |
| Module | TCH |
| Test Scenario | Duplicate blacklist entry |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); student already blacklisted |
| Test Data | Same student |
| Steps | 1. POST again. |
| Expected Result | 409; no second row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-580 — List own blacklist only

| Field | Value |
|---|---|
| Test Case ID | TC-580 |
| Requirement ID | FR-272 |
| Module | TCH |
| Test Scenario | List own blacklist only |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo); Teacher B exists with own course and students with entries |
| Test Data | None |
| Steps | 1. GET /teacher/blacklist as A. |
| Expected Result | Only A's entries |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-581 — Lift own entry

| Field | Value |
|---|---|
| Test Case ID | TC-581 |
| Requirement ID | FR-273 |
| Module | TCH |
| Test Scenario | Lift own entry |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); entry exists |
| Test Data | Entry id |
| Steps | 1. DELETE /teacher/blacklist/[id]. |
| Expected Result | Success; reversal restores enrolments (over-capacity flagged in summary) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-582 — Lift another teacher's entry

| Field | Value |
|---|---|
| Test Case ID | TC-582 |
| Requirement ID | FR-273 |
| Module | TCH |
| Test Scenario | Lift another teacher's entry |
| Test Type | Security |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); entry of Teacher B |
| Test Data | B's entry id |
| Steps | 1. DELETE as A. |
| Expected Result | 403; entry unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-583 — Create temporary student

| Field | Value |
|---|---|
| Test Case ID | TC-583 |
| Requirement ID | FR-274 |
| Module | TCH |
| Test Scenario | Create temporary student |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | New phone, name |
| Steps | 1. POST /teacher/temp-students. |
| Expected Result | Success; temp student created; invite ownership belongs to the teacher |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-584 — Temp student with a registered phone

| Field | Value |
|---|---|
| Test Case ID | TC-584 |
| Requirement ID | FR-274 |
| Module | TCH |
| Test Scenario | Temp student with a registered phone |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | Phone of an existing user |
| Steps | 1. POST. |
| Expected Result | 409 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-585 — Public teacher profile

| Field | Value |
|---|---|
| Test Case ID | TC-585 |
| Requirement ID | FR-275 |
| Module | TCH |
| Test Scenario | Public teacher profile |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A has reviews; no login needed |
| Test Data | Teacher id |
| Steps | 1. GET /teachers/[id]. |
| Expected Result | Profile with rating aggregate and no private fields (email, phone) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-586 — Upload valid photo

| Field | Value |
|---|---|
| Test Case ID | TC-586 |
| Requirement ID | FR-276 |
| Module | TCH |
| Test Scenario | Upload valid photo |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | JPEG 1 MB |
| Steps | 1. Settings, profile image, upload. |
| Expected Result | Success; image visible; downscaled to fit 1024x1024 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-587 — Photo size and type limits

| Field | Value |
|---|---|
| Test Case ID | TC-587 |
| Requirement ID | FR-276 |
| Module | TCH |
| Test Scenario | Photo size and type limits |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | 5 MB JPEG; SVG; PDF renamed .jpg |
| Steps | 1. Upload each. |
| Expected Result | 5 MB rejected with 'That image is too large (max 4 MB)...'; SVG and fake image rejected by magic bytes |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-588 — Read and remove photo

| Field | Value |
|---|---|
| Test Case ID | TC-588 |
| Requirement ID | FR-277 |
| Module | TCH |
| Test Scenario | Read and remove photo |
| Test Type | Functional |
| Priority | Low |
| Preconditions | Teacher A signed in (demo data, is_demo); photo set |
| Test Data | None |
| Steps | 1. GET /teachers/me/photo. 2. DELETE it. |
| Expected Result | Image served, then removed and default shown |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-589 — Teacher sends request to a centre

| Field | Value |
|---|---|
| Test Case ID | TC-589 |
| Requirement ID | FR-278 |
| Module | TCH |
| Test Scenario | Teacher sends request to a centre |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Teacher A signed in (demo data, is_demo); centre with a hall |
| Test Data | Subject, grade, days [1,3], 16:00-18:00, start date in the future, expected students 20 |
| Steps | 1. Open My centers, Apply to teach at a center. 2. Fill and Send request. |
| Expected Result | Toast 'Collaboration request sent'; row 'Sent by you' status pending; centre sees 'Incoming' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-590 — Duplicate and invalid creation

| Field | Value |
|---|---|
| Test Case ID | TC-590 |
| Requirement ID | FR-278 |
| Module | TCH |
| Test Scenario | Duplicate and invalid creation |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Teacher A signed in (demo data, is_demo); open request exists |
| Test Data | Same teacher, centre, subject; also 99:99 time, empty days, end date before start, expected students 0 |
| Steps | 1. Submit each. |
| Expected Result | Duplicate 409; empty days, bad dates, students 0 give 400; 99:99 accepted (GAP-110, record); client message 'Pick the other party...' for missing fields |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-591 — Centre invites a teacher

| Field | Value |
|---|---|
| Test Case ID | TC-591 |
| Requirement ID | FR-278 |
| Module | TCH |
| Test Scenario | Centre invites a teacher |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre manager signed in (center_admin) |
| Test Data | Teacher A as target |
| Steps | 1. Invite a teacher, send. |
| Expected Result | Request created with initiator centre; teacher sees it as incoming |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-592 — Each side sees only its own requests

| Field | Value |
|---|---|
| Test Case ID | TC-592 |
| Requirement ID | FR-279 |
| Module | TCH |
| Test Scenario | Each side sees only its own requests |
| Test Type | Security |
| Priority | High |
| Preconditions | Requests exist for A, B and two centres |
| Test Data | status=pending filter |
| Steps | 1. List as A, as B, as each centre, as an unrelated centre manager. |
| Expected Result | Each sees only theirs; filter works; 'status=bogus' ignored (record) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-593 — List with more than 100 requests

| Field | Value |
|---|---|
| Test Case ID | TC-593 |
| Requirement ID | FR-279 |
| Module | TCH |
| Test Scenario | List with more than 100 requests |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | 101+ requests for one centre (seed) |
| Test Data | None |
| Steps | 1. GET list. |
| Expected Result | Only 100 returned (GAP-111) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-594 — Recipient accepts a request

| Field | Value |
|---|---|
| Test Case ID | TC-594 |
| Requirement ID | FR-280 |
| Module | TCH |
| Test Scenario | Recipient accepts a request |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Pending request sent by Teacher A to centre |
| Test Data | Pricing method as required |
| Steps | 1. Centre manager clicks Accept; confirm dialog. |
| Expected Result | Toast 'Accepted - class and schedule created...'; affiliation active; course and sessions exist (Sessions tester verifies schedule) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-595 — Invalid accept attempts

| Field | Value |
|---|---|
| Test Case ID | TC-595 |
| Requirement ID | FR-280 |
| Module | TCH |
| Test Scenario | Invalid accept attempts |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Pending request |
| Test Data | Accept by initiator; accept twice concurrently; accept expired; accept cancelled |
| Steps | 1. Run each attempt. |
| Expected Result | Initiator 403; second concurrent accept 422 already accepted; expired 422 and marked expired; cancelled 422 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-596 — Recipient rejects

| Field | Value |
|---|---|
| Test Case ID | TC-596 |
| Requirement ID | FR-281 |
| Module | TCH |
| Test Scenario | Recipient rejects |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending request |
| Test Data | Optional reason |
| Steps | 1. Click Decline. |
| Expected Result | Status rejected; toast 'Request declined' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-597 — Reject by wrong party or already decided

| Field | Value |
|---|---|
| Test Case ID | TC-597 |
| Requirement ID | FR-281 |
| Module | TCH |
| Test Scenario | Reject by wrong party or already decided |
| Test Type | Negative |
| Priority | High |
| Preconditions | Pending and decided requests |
| Test Data | Initiator rejects own; reject accepted request |
| Steps | 1. Attempt. |
| Expected Result | 403 and 422 respectively |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-598 — Initiator cancels

| Field | Value |
|---|---|
| Test Case ID | TC-598 |
| Requirement ID | FR-282 |
| Module | TCH |
| Test Scenario | Initiator cancels |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending request sent by A |
| Test Data | None |
| Steps | 1. Cancel as A. |
| Expected Result | Status cancelled; toast 'Request cancelled'; a new request for same key can be created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-599 — Cancel by recipient or after decision

| Field | Value |
|---|---|
| Test Case ID | TC-599 |
| Requirement ID | FR-282 |
| Module | TCH |
| Test Scenario | Cancel by recipient or after decision |
| Test Type | Negative |
| Priority | High |
| Preconditions | Pending/accepted request |
| Test Data | Recipient cancels; initiator cancels accepted |
| Steps | 1. Attempt. |
| Expected Result | 403 and 422 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-600 — Auto-expire job

| Field | Value |
|---|---|
| Test Case ID | TC-600 |
| Requirement ID | FR-283 |
| Module | TCH |
| Test Scenario | Auto-expire job |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending request past its expiry; CRON secret per environment docs (not stored here) |
| Test Data | Cron job name for collaboration expiry |
| Steps | 1. Trigger the cron endpoint as documented by the Deployment owner. |
| Expected Result | Overdue pending rows become expired; others untouched |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-601 — Centre proposes a method for a two-method hall

| Field | Value |
|---|---|
| Test Case ID | TC-601 |
| Requirement ID | FR-284 |
| Module | TCH |
| Test Scenario | Centre proposes a method for a two-method hall |
| Test Type | Negative |
| Priority | High |
| Preconditions | Centre manager signed in (center_admin); hall offering two pricing methods |
| Test Data | Any pricing method |
| Steps | 1. Create request. |
| Expected Result | 422 'The teacher chooses the pricing method for this hall when accepting' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-602 — Teacher accepts a two-method hall request

| Field | Value |
|---|---|
| Test Case ID | TC-602 |
| Requirement ID | FR-284 |
| Module | TCH |
| Test Scenario | Teacher accepts a two-method hall request |
| Test Type | Functional |
| Priority | High |
| Preconditions | Request on a two-method hall |
| Test Data | pricingMethod omitted, then provided |
| Steps | 1. Accept without method. 2. Accept with a method. |
| Expected Result | First 422 method_choice_required; second succeeds and the dialog 'Choose the pricing method' appears in UI |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-603 — List my affiliations

| Field | Value |
|---|---|
| Test Case ID | TC-603 |
| Requirement ID | FR-285 |
| Module | TCH |
| Test Scenario | List my affiliations |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo); pending, active, declined affiliations |
| Test Data | None |
| Steps | 1. Open My centers. |
| Expected Result | Own affiliations only with expiry countdown for pending |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-604 — Accept a pending invitation

| Field | Value |
|---|---|
| Test Case ID | TC-604 |
| Requirement ID | FR-286 |
| Module | TCH |
| Test Scenario | Accept a pending invitation |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending affiliation |
| Test Data | None |
| Steps | 1. Click Accept, confirm. |
| Expected Result | Status active; toast invitationAccepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-605 — Accept an expired invitation

| Field | Value |
|---|---|
| Test Case ID | TC-605 |
| Requirement ID | FR-286 |
| Module | TCH |
| Test Scenario | Accept an expired invitation |
| Test Type | Negative |
| Priority | High |
| Preconditions | Affiliation past expiry |
| Test Data | None |
| Steps | 1. Accept. |
| Expected Result | Error 'Invitation has expired'; check whether status persists as expired (GAP-104) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-606 — Decline invitation

| Field | Value |
|---|---|
| Test Case ID | TC-606 |
| Requirement ID | FR-287 |
| Module | TCH |
| Test Scenario | Decline invitation |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Pending affiliation |
| Test Data | None |
| Steps | 1. Decline, confirm. |
| Expected Result | Status declined; toast invitationDeclined |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-607 — Leave a centre without active courses

| Field | Value |
|---|---|
| Test Case ID | TC-607 |
| Requirement ID | FR-288 |
| Module | TCH |
| Test Scenario | Leave a centre without active courses |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active affiliation, no active course |
| Test Data | None |
| Steps | 1. DELETE /affiliations/[id]. |
| Expected Result | Status removed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-608 — Leave a centre with an active course

| Field | Value |
|---|---|
| Test Case ID | TC-608 |
| Requirement ID | FR-288 |
| Module | TCH |
| Test Scenario | Leave a centre with an active course |
| Test Type | Negative |
| Priority | High |
| Preconditions | Active affiliation with active course |
| Test Data | None |
| Steps | 1. Leave. |
| Expected Result | 422; affiliation remains active |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-609 — Create numeric assignment

| Field | Value |
|---|---|
| Test Case ID | TC-609 |
| Requirement ID | FR-289 |
| Module | TCH |
| Test Scenario | Create numeric assignment |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo) with a course |
| Test Data | Name 'Midterm Exam', max 100, valid date |
| Steps | 1. Gradebook, Create Assignment, fill, save. |
| Expected Result | Toast 'Assignment created: 'Midterm Exam''; column appears |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-610 — Create assignment with invalid values

| Field | Value |
|---|---|
| Test Case ID | TC-610 |
| Requirement ID | FR-289 |
| Module | TCH |
| Test Scenario | Create assignment with invalid values |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | Empty name; no date; max 0; max 10.5; max -1; letter type |
| Steps | 1. Try each. |
| Expected Result | UI messages 'Please enter a name', 'Please select a date', 'Please enter a max score'; API 400 for 0 and -1; 10.5 outcome recorded (GAP-100); letter type forces max 4 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-611 — Role-scoped grade list

| Field | Value |
|---|---|
| Test Case ID | TC-611 |
| Requirement ID | FR-290 |
| Module | TCH |
| Test Scenario | Role-scoped grade list |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Grades exist for A and B; student and parent linked |
| Test Data | None |
| Steps | 1. GET /grades as A, B, student, parent (with child id), assistant of A. |
| Expected Result | Each sees only own scope; parent without studentId gets 422; parent of other child 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-612 — Staff, accountant and super admin list

| Field | Value |
|---|---|
| Test Case ID | TC-612 |
| Requirement ID | FR-290 |
| Module | TCH |
| Test Scenario | Staff, accountant and super admin list |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Grades exist |
| Test Data | None |
| Steps | 1. GET /grades as center_staff, accountant, super_admin. |
| Expected Result | Expected per Q-059; record whether all grades are returned (GAP-093) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-613 — Get grade by id by owner and enrolled student

| Field | Value |
|---|---|
| Test Case ID | TC-613 |
| Requirement ID | FR-291 |
| Module | TCH |
| Test Scenario | Get grade by id by owner and enrolled student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Grade with scores |
| Test Data | None |
| Steps | 1. GET as owner. 2. As enrolled student. 3. As student of another course. |
| Expected Result | 200, 200, 404 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-614 — Get grade of another teacher

| Field | Value |
|---|---|
| Test Case ID | TC-614 |
| Requirement ID | FR-291 |
| Module | TCH |
| Test Scenario | Get grade of another teacher |
| Test Type | Security |
| Priority | High |
| Preconditions | Teacher B exists with own course and students grade |
| Test Data | B grade id |
| Steps | 1. GET as Teacher A. |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-615 — Update name and date

| Field | Value |
|---|---|
| Test Case ID | TC-615 |
| Requirement ID | FR-292 |
| Module | TCH |
| Test Scenario | Update name and date |
| Test Type | Functional |
| Priority | High |
| Preconditions | Owned grade |
| Test Data | New name |
| Steps | 1. PATCH. |
| Expected Result | Updated |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-616 — Lower maxScore below existing score

| Field | Value |
|---|---|
| Test Case ID | TC-616 |
| Requirement ID | FR-292 |
| Module | TCH |
| Test Scenario | Lower maxScore below existing score |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Grade max 100 with a score of 90 |
| Test Data | maxScore 50 |
| Steps | 1. PATCH. |
| Expected Result | Record outcome; expected rejection per GAP-100 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-617 — Delete own grade

| Field | Value |
|---|---|
| Test Case ID | TC-617 |
| Requirement ID | FR-293 |
| Module | TCH |
| Test Scenario | Delete own grade |
| Test Type | Functional |
| Priority | High |
| Preconditions | Owned grade with scores |
| Test Data | None |
| Steps | 1. Delete. |
| Expected Result | Grade and scores removed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-618 — Delete another teacher's grade

| Field | Value |
|---|---|
| Test Case ID | TC-618 |
| Requirement ID | FR-293 |
| Module | TCH |
| Test Scenario | Delete another teacher's grade |
| Test Type | Security |
| Priority | High |
| Preconditions | Teacher B exists with own course and students grade |
| Test Data | B grade id |
| Steps | 1. DELETE as A. |
| Expected Result | 403; grade intact |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-619 — Save scores at boundaries

| Field | Value |
|---|---|
| Test Case ID | TC-619 |
| Requirement ID | FR-294 |
| Module | TCH |
| Test Scenario | Save scores at boundaries |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Numeric grade max 100; 4 enrolled students |
| Test Data | Scores 0, 100, 50.5, 100.01, -0.01 |
| Steps | 1. PUT scores with valid ones. 2. Repeat with 100.01. 3. With -0.01. |
| Expected Result | 0 and 100 accepted; 100.01 gives 422; -0.01 gives 400; failed batch saves nothing |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-620 — Letter grade and batch rules

| Field | Value |
|---|---|
| Test Case ID | TC-620 |
| Requirement ID | FR-294 |
| Module | TCH |
| Test Scenario | Letter grade and batch rules |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Letter grade; non-enrolled student |
| Test Data | Values 3.5, 5, duplicate studentId, non-enrolled student |
| Steps | 1. PUT each case. |
| Expected Result | 3.5 and 5 give 422; duplicates last wins; one non-enrolled student rejects the whole batch |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-621 — Student notified of a new grade

| Field | Value |
|---|---|
| Test Case ID | TC-621 |
| Requirement ID | FR-295 |
| Module | TCH |
| Test Scenario | Student notified of a new grade |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Enrolled student with notifications |
| Test Data | Save a score |
| Steps | 1. Save score. 2. Student opens notifications. |
| Expected Result | Notification received once |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-622 — Grade band thresholds

| Field | Value |
|---|---|
| Test Case ID | TC-622 |
| Requirement ID | FR-296 |
| Module | TCH |
| Test Scenario | Grade band thresholds |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Max 100 assessment |
| Test Data | Scores 85, 84, 75, 74, 65, 64, 50, 49 |
| Steps | 1. Enter each and view student grades. |
| Expected Result | excellent at 85, very good at 75, good at 65, pass at 50 and weak below; pass mark 50 percent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-623 — Upload valid PDF

| Field | Value |
|---|---|
| Test Case ID | TC-623 |
| Requirement ID | FR-297 |
| Module | TCH |
| Test Scenario | Upload valid PDF |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo); course |
| Test Data | PDF 2 MB, title 'Lecture 1', type Lecture |
| Steps | 1. Materials, Upload Material, Upload PDF. 2. Submit. |
| Expected Result | Toast 'Material uploaded'; listed with size and source |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-624 — Upload validation

| Field | Value |
|---|---|
| Test Case ID | TC-624 |
| Requirement ID | FR-297 |
| Module | TCH |
| Test Scenario | Upload validation |
| Test Type | Negative |
| Priority | High |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | Spoofed HTML renamed .pdf; image; exactly 10 MB PDF; 10 MB+1; type 'banana'; link ftp://x |
| Steps | 1. Upload each. |
| Expected Result | Spoof and image 422; 10 MB accepted; over 10 MB 422 (UI allows 20 MB, GAP-094); banana records outcome (GAP-101); ftp link 422 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-625 — PDF link variant

| Field | Value |
|---|---|
| Test Case ID | TC-625 |
| Requirement ID | FR-297 |
| Module | TCH |
| Test Scenario | PDF link variant |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) |
| Test Data | https://example.org/a.pdf; also both link and file |
| Steps | 1. Submit link only. 2. Both. |
| Expected Result | Link stored; with both, link wins |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-626 — List materials by role

| Field | Value |
|---|---|
| Test Case ID | TC-626 |
| Requirement ID | FR-298 |
| Module | TCH |
| Test Scenario | List materials by role |
| Test Type | Security |
| Priority | High |
| Preconditions | Materials of A and B; student enrolled with A; parent linked |
| Test Data | Course filter |
| Steps | 1. List as A, assistant, enrolled student, other student, parent. |
| Expected Result | Each sees only permitted materials; non-enrolled student sees none |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-627 — Filter by course and empty state

| Field | Value |
|---|---|
| Test Case ID | TC-627 |
| Requirement ID | FR-298 |
| Module | TCH |
| Test Scenario | Filter by course and empty state |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher A signed in (demo data, is_demo) with two courses, one without materials |
| Test Data | Course filter |
| Steps | 1. Use Filter by course. 2. Select the empty course. |
| Expected Result | Only that course materials shown; empty course shows No materials found. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-628 — Enrolled student downloads

| Field | Value |
|---|---|
| Test Case ID | TC-628 |
| Requirement ID | FR-299 |
| Module | TCH |
| Test Scenario | Enrolled student downloads |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Material of A; student enrolled |
| Test Data | None |
| Steps | 1. Click Download. |
| Expected Result | Signed URL opens the PDF |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-629 — Unauthorised download

| Field | Value |
|---|---|
| Test Case ID | TC-629 |
| Requirement ID | FR-299 |
| Module | TCH |
| Test Scenario | Unauthorised download |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Material of A |
| Test Data | Teacher B; non-enrolled student; anonymous; unenrolled student |
| Steps | 1. Request the download endpoint for each. |
| Expected Result | 403 or 401; no URL issued; check URL expiry (Q-056) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-630 — Edit title and type

| Field | Value |
|---|---|
| Test Case ID | TC-630 |
| Requirement ID | FR-300 |
| Module | TCH |
| Test Scenario | Edit title and type |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Owned material |
| Test Data | New title |
| Steps | 1. PATCH. |
| Expected Result | Updated |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-631 — Replace file

| Field | Value |
|---|---|
| Test Case ID | TC-631 |
| Requirement ID | FR-300 |
| Module | TCH |
| Test Scenario | Replace file |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Owned material |
| Test Data | New PDF |
| Steps | 1. Replace file. 2. Download. |
| Expected Result | New file served; old asset gone (failure case in EC-349) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-632 — Delete own material

| Field | Value |
|---|---|
| Test Case ID | TC-632 |
| Requirement ID | FR-301 |
| Module | TCH |
| Test Scenario | Delete own material |
| Test Type | Functional |
| Priority | High |
| Preconditions | Owned material |
| Test Data | None |
| Steps | 1. Delete with confirmation 'Delete this material?'. |
| Expected Result | Toast 'Material deleted'; download no longer works |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-633 — Delete another teacher's material

| Field | Value |
|---|---|
| Test Case ID | TC-633 |
| Requirement ID | FR-301 |
| Module | TCH |
| Test Scenario | Delete another teacher's material |
| Test Type | Security |
| Priority | High |
| Preconditions | Teacher B exists with own course and students material |
| Test Data | B material id |
| Steps | 1. DELETE as A. |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-634 — Students notified of new material

| Field | Value |
|---|---|
| Test Case ID | TC-634 |
| Requirement ID | FR-302 |
| Module | TCH |
| Test Scenario | Students notified of new material |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Course with enrolled students |
| Test Data | Upload |
| Steps | 1. Upload. 2. Student checks notifications. |
| Expected Result | One notification per enrolled student; also record upload outcome if notification fails (GAP-103) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-635 — Student reviews a teacher after attending

| Field | Value |
|---|---|
| Test Case ID | TC-635 |
| Requirement ID | FR-303 |
| Module | TCH |
| Test Scenario | Student reviews a teacher after attending |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student attended a lesson of A |
| Test Data | Rating 5, comment |
| Steps | 1. POST /reviews or use the Reviews page. |
| Expected Result | Created; appears in teacher reviews |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-636 — Invalid and ineligible reviews

| Field | Value |
|---|---|
| Test Case ID | TC-636 |
| Requirement ID | FR-303 |
| Module | TCH |
| Test Scenario | Invalid and ineligible reviews |
| Test Type | Negative |
| Priority | High |
| Preconditions | Student with no attendance; student with an existing review |
| Test Data | Rating 0, 6, 3.5; non-uuid teacherId; second overall review |
| Steps | 1. Try each. |
| Expected Result | 400 for ratings; 422 without attendance; 409 on second overall review; non-uuid gives not-found style response |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-637 — Teacher reads own reviews

| Field | Value |
|---|---|
| Test Case ID | TC-637 |
| Requirement ID | FR-304 |
| Module | TCH |
| Test Scenario | Teacher reads own reviews |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Reviews for A |
| Test Data | None |
| Steps | 1. Open Reviews as A. |
| Expected Result | Average, totals, 5-star count, table; 'Anonymous'/'No comment' cases |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-638 — Review list filters across roles

| Field | Value |
|---|---|
| Test Case ID | TC-638 |
| Requirement ID | FR-304 |
| Module | TCH |
| Test Scenario | Review list filters across roles |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Reviews for A and B |
| Test Data | studentId of another student; teacherId of B |
| Steps | 1. GET /reviews as student and as Teacher A with those filters. |
| Expected Result | Expected: refusal; record actual (GAP-095) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-639 — Edit within 24 hours

| Field | Value |
|---|---|
| Test Case ID | TC-639 |
| Requirement ID | FR-305 |
| Module | TCH |
| Test Scenario | Edit within 24 hours |
| Test Type | Functional |
| Priority | High |
| Preconditions | Review created less than 24 h ago |
| Test Data | New rating |
| Steps | 1. PATCH. |
| Expected Result | Updated |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-640 — Edit after 24 hours and by others

| Field | Value |
|---|---|
| Test Case ID | TC-640 |
| Requirement ID | FR-305 |
| Module | TCH |
| Test Scenario | Edit after 24 hours and by others |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Review aged 23h59m and 24h01m |
| Test Data | Another student's id |
| Steps | 1. PATCH at each age. 2. PATCH someone else's review. |
| Expected Result | Allowed at 23h59m, 422 at 24h01m; other student 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-641 — Eligible teachers list

| Field | Value |
|---|---|
| Test Case ID | TC-641 |
| Requirement ID | FR-306 |
| Module | TCH |
| Test Scenario | Eligible teachers list |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Student attended A and B, reviewed A |
| Test Data | None |
| Steps | 1. GET /reviews/eligible. |
| Expected Result | Only B; note email in response (GAP-105) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-642 — Rating aggregate

| Field | Value |
|---|---|
| Test Case ID | TC-642 |
| Requirement ID | FR-307 |
| Module | TCH |
| Test Scenario | Rating aggregate |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher with ratings 5, 4, 3 |
| Test Data | None |
| Steps | 1. View profile and reviews page. |
| Expected Result | Average 4.0, count 3; changes after an edit |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-643 — No reviews

| Field | Value |
|---|---|
| Test Case ID | TC-643 |
| Requirement ID | FR-307 |
| Module | TCH |
| Test Scenario | No reviews |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Teacher with no reviews |
| Test Data | None |
| Steps | 1. View profile. |
| Expected Result | Count 0 and empty state; no divide-by-zero (representation UNKNOWN) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-644 — Team notes board

| Field | Value |
|---|---|
| Test Case ID | TC-644 |
| Requirement ID | FR-308 |
| Module | TCH |
| Test Scenario | Team notes board |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher and assistant |
| Test Data | A note |
| Steps | 1. Add and view note as assistant and teacher. |
| Expected Result | Both see the shared board; scope not fully specified (GAP-115) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

##### TC-645 — Portal navigation and delegation strip

| Field | Value |
|---|---|
| Test Case ID | TC-645 |
| Requirement ID | FR-309 |
| Module | TCH |
| Test Scenario | Portal navigation and delegation strip |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher and assistant accounts |
| Test Data | None |
| Steps | 1. Open each sidebar entry for both. |
| Expected Result | Assistant sees only permitted entries and the strip 'Acting on behalf of'; RTL and English render |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-646 — Student find-teacher and practice pages

| Field | Value |
|---|---|
| Test Case ID | TC-646 |
| Requirement ID | FR-310 |
| Module | TCH |
| Test Scenario | Student find-teacher and practice pages |
| Test Type | Exploratory |
| Priority | Low |
| Preconditions | Student account |
| Test Data | None |
| Steps | 1. Open Teachers and Practice. |
| Expected Result | Pages load without error; behaviour not specified (GAP-113) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See gaps.md |

### 7. Student & Parent Portals

Module: Student & Parent Portals (STU). Every test case below is a manual or semi-automated check for a tester working against a non-production environment. Credentials are in `docs/guides/test-credentials.md`; none are repeated here. API calls assume a valid session cookie for the stated role. Actual Result and Status are for the tester to fill in.

Total test cases: 92.

##### TC-647 — Student sees own family code
| Field | Value |
|---|---|
| Test Case ID | TC-647 |
| Requirement ID | FR-311 |
| Module | Student & Parent Portals |
| Test Scenario | Student sees own family code |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student S1 signed in, profile exists |
| Test Data | S1 (see docs/guides/test-credentials.md) |
| Steps | 1. Open /{locale}/dashboard/student/family<br>2. Read the code in 'Your code'<br>3. Call GET /api/v1/me/family-code with S1's session |
| Expected Result | Page shows a 12-character code from the alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no I, O, 0, 1); API returns {data:{code, familyLinkCode}} with identical values; hint 'Share this code with your parent to link instantly.' visible. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-648 — Family-code API refused for non-students
| Field | Value |
|---|---|
| Test Case ID | TC-648 |
| Requirement ID | FR-311 |
| Module | Student & Parent Portals |
| Test Scenario | Family-code API refused for non-students |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | Parent P1 and anonymous client available |
| Test Data | P1 session; no session |
| Steps | 1. Call GET /api/v1/me/family-code as P1<br>2. Call it with no session |
| Expected Result | P1 receives 403 forbidden; anonymous receives 401 unauthenticated; no code is disclosed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-649 — Rotation replaces the code and old code stops linking
| Field | Value |
|---|---|
| Test Case ID | TC-649 |
| Requirement ID | FR-312 |
| Module | Student & Parent Portals |
| Test Scenario | Rotation replaces the code and old code stops linking |
| Test Type | Functional / Security |
| Priority | High |
| Preconditions | Student S1 with a known code C1; parent P1 not yet linked, S1 has no approved parent |
| Test Data | S1, P1 |
| Steps | 1. As S1 note C1<br>2. Press 'Rotate Code' (or POST /api/v1/me/family-code/rotate)<br>3. Note new code C2 (differs from C1)<br>4. As P1 POST /api/v1/parent-links {code: C1}<br>5. As P1 POST /api/v1/parent-links {code: C2} |
| Expected Result | Rotate returns a new 12-character code and toast 'Family code rotated'; the C1 request returns 404 'Invalid or expired family code'; the C2 request returns 201 with status approved. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-650 — Rotation does not alter existing links
| Field | Value |
|---|---|
| Test Case ID | TC-650 |
| Requirement ID | FR-312 |
| Module | Student & Parent Portals |
| Test Scenario | Rotation does not alter existing links |
| Test Type | Functional / Regression |
| Priority | High |
| Preconditions | S1 has an approved link to P1 and a pending request from P2 |
| Test Data | S1, P1, P2 |
| Steps | 1. As S1 rotate the code<br>2. As S1 and P1 open GET /api/v1/parent-links<br>3. As S1 list pending requests |
| Expected Result | The P1 link remains approved and P2's request remains pending; UI hint states 'Parents already linked stay linked — rotating only stops the old code being used to link again.' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-651 — Rotation by a non-student is refused
| Field | Value |
|---|---|
| Test Case ID | TC-651 |
| Requirement ID | FR-312 |
| Module | Student & Parent Portals |
| Test Scenario | Rotation by a non-student is refused |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | Parent P1 signed in |
| Test Data | P1 |
| Steps | 1. POST /api/v1/me/family-code/rotate as P1 |
| Expected Result | 403 forbidden; nobody's code changes. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-652 — Parent links instantly with a valid family code
| Field | Value |
|---|---|
| Test Case ID | TC-652 |
| Requirement ID | FR-313 |
| Module | Student & Parent Portals |
| Test Scenario | Parent links instantly with a valid family code |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Parent P1 signed in; student S1 has no approved parent |
| Test Data | P1, S1's current code |
| Steps | 1. Open /dashboard/parent/children, tab 'By Family Code'<br>2. Enter S1's code and press 'Link Instantly'<br>3. Open GET /api/v1/me/children |
| Expected Result | POST /api/v1/parent-links returns 201 with status approved, initiatedBy parent, path family_code; toast 'Linked successfully.'; S1 appears in the list; no notification is created for S1. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-653 — Invalid or unknown family code
| Field | Value |
|---|---|
| Test Case ID | TC-653 |
| Requirement ID | FR-313 |
| Module | Student & Parent Portals |
| Test Scenario | Invalid or unknown family code |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | P1 signed in |
| Test Data | code 'ZZZZZZZZZZZZ' (not issued), empty string |
| Steps | 1. POST /api/v1/parent-links {code:'ZZZZZZZZZZZZ'}<br>2. Submit the UI form with an empty code<br>3. POST {} (no field) |
| Expected Result | Unknown code -> 404 'Invalid or expired family code'; empty UI field -> 'Please enter a family code.' and no request; empty body -> 400 'Provide one of: code, email, phone'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-654 — Family code is case and whitespace sensitive
| Field | Value |
|---|---|
| Test Case ID | TC-654 |
| Requirement ID | FR-313 |
| Module | Student & Parent Portals |
| Test Scenario | Family code is case and whitespace sensitive |
| Test Type | Negative / Boundary |
| Priority | Critical |
| Preconditions | P1 signed in; S1's code known |
| Test Data | S1 code in lower case; S1 code with a trailing space |
| Steps | 1. POST {code: lower-case S1 code}<br>2. POST {code: 'CODE '} |
| Expected Result | Both return 404 'Invalid or expired family code' (exact match). Record as a usability observation. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-121 |

##### TC-655 — Student already has an approved parent
| Field | Value |
|---|---|
| Test Case ID | TC-655 |
| Requirement ID | FR-313 |
| Module | Student & Parent Portals |
| Test Scenario | Student already has an approved parent |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | S1 approved to P1; P2 signed in |
| Test Data | S1's current code |
| Steps | 1. As P2 POST /api/v1/parent-links {code} |
| Expected Result | 409 conflict 'Student already has an active parent link'; no new row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-656 — Parent sends request by student email
| Field | Value |
|---|---|
| Test Case ID | TC-656 |
| Requirement ID | FR-314 |
| Module | Student & Parent Portals |
| Test Scenario | Parent sends request by student email |
| Test Type | Functional |
| Priority | High |
| Preconditions | P1 signed in; S2 exists with email e2 and no approved parent |
| Test Data | e2 (upper-case variant also) |
| Steps | 1. Open tab 'By Email or Phone'<br>2. Enter e2 and press 'Send Request'<br>3. Repeat the API call with e2 in upper case |
| Expected Result | 201 status pending, initiatedBy parent, path email; toast 'Link request sent.'; email matching is case-insensitive; S2 receives a 'New parent link request' notification. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-657 — Unknown student email and wrong role
| Field | Value |
|---|---|
| Test Case ID | TC-657 |
| Requirement ID | FR-314 |
| Module | Student & Parent Portals |
| Test Scenario | Unknown student email and wrong role |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | P1 signed in; a registered teacher's email t1; unknown email |
| Test Data | unknown@example.invalid, t1 |
| Steps | 1. POST {email: unknown}<br>2. POST {email: t1} |
| Expected Result | Both return 404 'Student not found' (a teacher is not found as a student). Note the response distinguishes existing students from others. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-117 |

##### TC-658 — Phone request and UI limitation
| Field | Value |
|---|---|
| Test Case ID | TC-658 |
| Requirement ID | FR-314 |
| Module | Student & Parent Portals |
| Test Scenario | Phone request and UI limitation |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | P1 signed in; S3 exists with phone ph3 |
| Test Data | ph3 exact string as stored |
| Steps | 1. POST /api/v1/parent-links {phone: ph3}<br>2. In the UI type ph3 into 'Student Email or Phone' and submit<br>3. Repeat API with ph3 in a different format (+20 prefix / spaces) |
| Expected Result | API with the exact stored phone returns 201 pending path phone; the UI blocks with 'Invalid email address.'; differently formatted phone returns 404 'Student not found'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-121, GAP-122 |

##### TC-659 — Duplicate pending request
| Field | Value |
|---|---|
| Test Case ID | TC-659 |
| Requirement ID | FR-314 |
| Module | Student & Parent Portals |
| Test Scenario | Duplicate pending request |
| Test Type | Negative |
| Priority | High |
| Preconditions | P1 already has a pending request to S2 |
| Test Data | S2 email |
| Steps | 1. Repeat the same request |
| Expected Result | 409 'A pending link already exists'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-660 — Student requests link to a parent by email
| Field | Value |
|---|---|
| Test Case ID | TC-660 |
| Requirement ID | FR-315 |
| Module | Student & Parent Portals |
| Test Scenario | Student requests link to a parent by email |
| Test Type | Functional |
| Priority | High |
| Preconditions | S1 signed in; parent P1 exists with email e1 |
| Test Data | e1 |
| Steps | 1. Open /dashboard/student/family, 'Link a Parent'<br>2. Enter e1 and press 'Send Request' |
| Expected Result | 201 pending, initiatedBy student, path email; toast 'Link request sent'; P1 receives a notification and can approve. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-661 — Student request by phone and validation
| Field | Value |
|---|---|
| Test Case ID | TC-661 |
| Requirement ID | FR-315 |
| Module | Student & Parent Portals |
| Test Scenario | Student request by phone and validation |
| Test Type | Functional / Boundary |
| Priority | High |
| Preconditions | S1 signed in; P1 phone p1 |
| Test Data | '01xxxxxxxxx' style number; '123'; '   ' |
| Steps | 1. Enter p1 exactly as stored and submit<br>2. Enter '123'<br>3. Enter only spaces |
| Expected Result | p1 sent as phone -> 201 pending; '123' -> 'Not a valid email or phone number'; blank -> 'Enter your parent's email or phone'; no request sent for the invalid ones. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-662 — No such parent / student already linked
| Field | Value |
|---|---|
| Test Case ID | TC-662 |
| Requirement ID | FR-315 |
| Module | Student & Parent Portals |
| Test Scenario | No such parent / student already linked |
| Test Type | Negative |
| Priority | High |
| Preconditions | S1 approved to P1; S4 has no parent |
| Test Data | unknown email; a student's email (role mismatch) |
| Steps | 1. As S4 request an unknown email<br>2. As S4 request the email of another student<br>3. As S1 request P2's email |
| Expected Result | Unknown or non-parent -> 404 'Parent not found'; S1 (already approved) -> 409 'Student already has an active parent link'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-663 — Student cannot link with a family code
| Field | Value |
|---|---|
| Test Case ID | TC-663 |
| Requirement ID | FR-316 |
| Module | Student & Parent Portals |
| Test Scenario | Student cannot link with a family code |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | S1 signed in; another student's current code C |
| Test Data | C |
| Steps | 1. POST /api/v1/parent-links {code: C} as S1<br>2. POST {code: C, email: 'x@example.com'} as S1 |
| Expected Result | Both return 400 validation_error 'Students cannot use a family code to link; use email or phone'; no link row created. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-664 — Parent family-code path unaffected by the student rule
| Field | Value |
|---|---|
| Test Case ID | TC-664 |
| Requirement ID | FR-316 |
| Module | Student & Parent Portals |
| Test Scenario | Parent family-code path unaffected by the student rule |
| Test Type | Regression |
| Priority | High |
| Preconditions | P1 signed in |
| Test Data | valid code |
| Steps | 1. POST {code} as P1 |
| Expected Result | 201 approved; confirms the rule applies to students only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-665 — Student approves a parent-initiated request
| Field | Value |
|---|---|
| Test Case ID | TC-665 |
| Requirement ID | FR-317 |
| Module | Student & Parent Portals |
| Test Scenario | Student approves a parent-initiated request |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | P1 sent a pending request to S1 (FR-314) |
| Test Data | link id L1 |
| Steps | 1. As S1 open Link Requests and press Approve (or POST /parent-links/L1/approve)<br>2. As P1 GET /api/v1/me/children |
| Expected Result | Link becomes approved, toast 'Link approved'; P1 sees S1 in children; no notification to P1. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-666 — Parent approves a student-initiated request
| Field | Value |
|---|---|
| Test Case ID | TC-666 |
| Requirement ID | FR-317 |
| Module | Student & Parent Portals |
| Test Scenario | Parent approves a student-initiated request |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | S1 sent a pending request to P1 |
| Test Data | link id L2 |
| Steps | 1. As P1 open /dashboard/parent/children and press Approve |
| Expected Result | Link approved; S1 listed as P1's child. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-667 — Initiator or a third user cannot approve
| Field | Value |
|---|---|
| Test Case ID | TC-667 |
| Requirement ID | FR-317 |
| Module | Student & Parent Portals |
| Test Scenario | Initiator or a third user cannot approve |
| Test Type | Negative / Security |
| Priority | Critical |
| Preconditions | Pending link L1 initiated by P1 for S1; P2, S9 exist |
| Test Data | L1 |
| Steps | 1. As P1 POST /parent-links/L1/approve<br>2. As P2 POST the same<br>3. As S9 POST the same |
| Expected Result | All return 403 'Not authorized to approve this link'; status stays pending. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-668 — Approve a non-pending link or when student already has a parent
| Field | Value |
|---|---|
| Test Case ID | TC-668 |
| Requirement ID | FR-317 |
| Module | Student & Parent Portals |
| Test Scenario | Approve a non-pending link or when student already has a parent |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | L1 already approved; second pending link L3 from P2 to S1 |
| Test Data | L1, L3 |
| Steps | 1. POST /parent-links/L1/approve again as S1<br>2. As S1 approve L3 while P1 is approved<br>3. POST /parent-links/not-a-uuid/approve<br>4. POST with a random valid uuid |
| Expected Result | Already approved -> 422 'Link is not pending'; L3 -> 409 'Student already has an active parent link'; malformed id -> expected 404 'Resource not found'; unknown uuid -> 404 'Link not found'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-669 — Counterparty rejects a pending request
| Field | Value |
|---|---|
| Test Case ID | TC-669 |
| Requirement ID | FR-318 |
| Module | Student & Parent Portals |
| Test Scenario | Counterparty rejects a pending request |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending link L1 from P1 to S1 |
| Test Data | L1 |
| Steps | 1. As S1 press Reject (POST /parent-links/L1/reject)<br>2. As P1 open the links table<br>3. P1 sends a new request to S1 |
| Expected Result | Status rejected, toast 'Link rejected'; P1 gets no access; a new request is accepted afterwards (new pending row). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-670 — Reject by the wrong party or on a non-pending link
| Field | Value |
|---|---|
| Test Case ID | TC-670 |
| Requirement ID | FR-318 |
| Module | Student & Parent Portals |
| Test Scenario | Reject by the wrong party or on a non-pending link |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | L1 pending (parent-initiated); L4 approved |
| Test Data | L1, L4 |
| Steps | 1. As P1 POST /parent-links/L1/reject<br>2. As S9 (unrelated) POST reject<br>3. As S1 reject L4 |
| Expected Result | Initiator and unrelated -> 403 'Not authorized to reject this link'; approved link -> 422 'Link is not pending'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-671 — Parent revokes an approved link and loses access
| Field | Value |
|---|---|
| Test Case ID | TC-671 |
| Requirement ID | FR-319 |
| Module | Student & Parent Portals |
| Test Scenario | Parent revokes an approved link and loses access |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | P1 approved to S1; P1 has used the card, oversight, catalog |
| Test Data | S1 |
| Steps | 1. As P1 press Revoke, confirm 'Revoke this link?'<br>2. Immediately call GET /me/student-card?studentId=S1<br>3. Call GET /parent/oversight/children and /me/children<br>4. Call GET /catalog/subjects?mine=1&studentId=S1 |
| Expected Result | Toast 'Link revoked.'; status revoked with revokedBy parent; card -> 403; S1 absent from children and oversight; catalog -> 403 'Not an approved child of this parent'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-672 — Student revokes through the API (no UI control)
| Field | Value |
|---|---|
| Test Case ID | TC-672 |
| Requirement ID | FR-319 |
| Module | Student & Parent Portals |
| Test Scenario | Student revokes through the API (no UI control) |
| Test Type | Functional / UI |
| Priority | Critical |
| Preconditions | P1 approved to S1 |
| Test Data | link id L1 |
| Steps | 1. Confirm no Revoke control on /dashboard/student/family<br>2. As S1 call DELETE /api/v1/parent-links/L1 |
| Expected Result | UI has no revoke control (observation); API returns the link with status revoked and revokedBy student. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-129 |

##### TC-673 — Revoke by a stranger and double revoke
| Field | Value |
|---|---|
| Test Case ID | TC-673 |
| Requirement ID | FR-319 |
| Module | Student & Parent Portals |
| Test Scenario | Revoke by a stranger and double revoke |
| Test Type | Negative / Security |
| Priority | Critical |
| Preconditions | L1 approved; P2 unrelated |
| Test Data | L1 |
| Steps | 1. As P2 DELETE /parent-links/L1<br>2. As P1 DELETE twice |
| Expected Result | Stranger -> 403 'Not a party to this link'; second revoke -> 422 'Link already revoked'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-674 — Revoke a pending request and relink
| Field | Value |
|---|---|
| Test Case ID | TC-674 |
| Requirement ID | FR-319 |
| Module | Student & Parent Portals |
| Test Scenario | Revoke a pending request and relink |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Pending link from P1 to S1 |
| Test Data | L5 |
| Steps | 1. As P1 DELETE /parent-links/L5<br>2. Check UI for any cancel control on a pending row<br>3. P1 requests S1 again |
| Expected Result | API revokes pending link; UI shows no action on parent-initiated pending rows; a new request is accepted since revoked is outside the unique index. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-129 |

##### TC-675 — List shows only own links with counterparty names
| Field | Value |
|---|---|
| Test Case ID | TC-675 |
| Requirement ID | FR-320 |
| Module | Student & Parent Portals |
| Test Scenario | List shows only own links with counterparty names |
| Test Type | Functional / Security |
| Priority | Medium |
| Preconditions | P1 has links with S1 (approved), S2 (pending); P2 has a link with S3 |
| Test Data | P1, P2, S1 |
| Steps | 1. As P1 GET /api/v1/parent-links<br>2. As S1 GET /api/v1/parent-links<br>3. As P2 GET |
| Expected Result | Each caller sees only rows where they are the parent or student, all statuses, with counterpart {id,name,email}; P1 never sees P2's row; empty state 'No link requests.' for a user with none. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-676 — Parent with multiple children
| Field | Value |
|---|---|
| Test Case ID | TC-676 |
| Requirement ID | FR-321 |
| Module | Student & Parent Portals |
| Test Scenario | Parent with multiple children |
| Test Type | Functional |
| Priority | High |
| Preconditions | P1 approved to S1 and S5 (different grades) |
| Test Data | S1, S5 |
| Steps | 1. As P1 GET /api/v1/me/children |
| Expected Result | Both children returned once each with gradeLevel {id,nameAr,nameEn} and walletBalance (0 when none). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-677 — Only approved children appear; other roles blocked
| Field | Value |
|---|---|
| Test Case ID | TC-677 |
| Requirement ID | FR-321 |
| Module | Student & Parent Portals |
| Test Scenario | Only approved children appear; other roles blocked |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | P1 has pending (S6), rejected (S7), revoked (S8) links; S1 session |
| Test Data | P1, S1 |
| Steps | 1. As P1 GET /me/children<br>2. As S1 GET /me/children |
| Expected Result | Only approved children listed; S1 receives 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-678 — Second parent blocked while first is approved
| Field | Value |
|---|---|
| Test Case ID | TC-678 |
| Requirement ID | FR-322 |
| Module | Student & Parent Portals |
| Test Scenario | Second parent blocked while first is approved |
| Test Type | Functional / Negative |
| Priority | Critical |
| Preconditions | S1 approved to P1; P2 signed in |
| Test Data | S1 code, S1 email |
| Steps | 1. P2 POST {code}<br>2. P2 POST {email: S1 email} |
| Expected Result | Both 409 'Student already has an active parent link'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-679 — Two parents pending, first approval wins
| Field | Value |
|---|---|
| Test Case ID | TC-679 |
| Requirement ID | FR-322 |
| Module | Student & Parent Portals |
| Test Scenario | Two parents pending, first approval wins |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | P1 and P2 each have a pending request to S1 |
| Test Data | L1 (P1), L3 (P2) |
| Steps | 1. S1 approves L1<br>2. S1 approves L3 |
| Expected Result | First 200 approved; second 409 'Student already has an active parent link'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-680 — Concurrent approvals (race)
| Field | Value |
|---|---|
| Test Case ID | TC-680 |
| Requirement ID | FR-322 |
| Module | Student & Parent Portals |
| Test Scenario | Concurrent approvals (race) |
| Test Type | Concurrency / Negative |
| Priority | Critical |
| Preconditions | Same state as above |
| Test Data | L1, L3 |
| Steps | 1. Send both approve calls simultaneously (script, 20 repetitions)<br>2. Count approved links for S1 |
| Expected Result | Expected: never more than one approved parent. Record the actual count; any run with two approved is a defect. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-118 |

##### TC-681 — Duplicate pair guard at database level
| Field | Value |
|---|---|
| Test Case ID | TC-681 |
| Requirement ID | FR-322 |
| Module | Student & Parent Portals |
| Test Scenario | Duplicate pair guard at database level |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Database test environment only (edura-env:test) |
| Test Data | existing live link for (P1,S1) |
| Steps | 1. Attempt to insert a second pending or approved row for the same pair through the service twice quickly |
| Expected Result | Second insert refused (409 conflict); unique index parent_student_link_one_live holds. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-682 — Pending request creates a notification only for the counterparty
| Field | Value |
|---|---|
| Test Case ID | TC-682 |
| Requirement ID | FR-323 |
| Module | Student & Parent Portals |
| Test Scenario | Pending request creates a notification only for the counterparty |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | P1 and S1 signed in on separate sessions |
| Test Data | S1 email |
| Steps | 1. P1 sends a request<br>2. As S1 open notifications<br>3. Repeat with an instant family-code link<br>4. S1 approves and then check P1's notifications |
| Expected Result | S1 receives 'New parent link request' / 'Someone wants to link with you. Check your link requests.'; instant link creates no notification; approve/reject/revoke create none for the initiator. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-123; delivery owned by Messaging & Notifications |

##### TC-683 — Student with complete profile sees the card
| Field | Value |
|---|---|
| Test Case ID | TC-683 |
| Requirement ID | FR-324 |
| Module | Student & Parent Portals |
| Test Scenario | Student with complete profile sees the card |
| Test Type | Functional |
| Priority | High |
| Preconditions | S1 profile complete with permanent code |
| Test Data | S1 |
| Steps | 1. Open /dashboard/student/id<br>2. Press 'Show my card' if present<br>3. Check code, QR, buttons 'Copy number', 'Save as image'/'Share card', 'Print' |
| Expected Result | Card titled 'Student ID' shows 'Student number' formatted by formatStudentCode and a QR whose payload is /c/{CODE}-{version}-{sig}; Copy shows 'Copied'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-684 — Card API for incomplete profile and wrong caller
| Field | Value |
|---|---|
| Test Case ID | TC-684 |
| Requirement ID | FR-324 |
| Module | Student & Parent Portals |
| Test Scenario | Card API for incomplete profile and wrong caller |
| Test Type | Negative |
| Priority | High |
| Preconditions | S10 profile incomplete; S1 complete |
| Test Data | studentId=S1 passed by S10 |
| Steps | 1. S10 GET /api/v1/me/student-card<br>2. S10 GET /me/student-card?studentId=S1 |
| Expected Result | First -> 422 PROFILE_INCOMPLETE; second -> 403; UI for S10 shows 'Your details are not complete yet, so no card has been issued.' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-685 — Approved parent views and prints child's card
| Field | Value |
|---|---|
| Test Case ID | TC-685 |
| Requirement ID | FR-325 |
| Module | Student & Parent Portals |
| Test Scenario | Approved parent views and prints child's card |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | P1 approved to S1; S1 complete |
| Test Data | S1 |
| Steps | 1. Open /dashboard/parent/children/{S1}/id<br>2. Check title 'Your child's ID'<br>3. Press Print |
| Expected Result | Card shown without checklist; print sheet opens for S1. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-686 — Parent tampers studentId (horizontal access)
| Field | Value |
|---|---|
| Test Case ID | TC-686 |
| Requirement ID | FR-325 |
| Module | Student & Parent Portals |
| Test Scenario | Parent tampers studentId (horizontal access) |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | P1 approved to S1 only; S11 belongs to another family; link to S6 pending; link to S8 revoked |
| Test Data | S11, S6, S8 ids |
| Steps | 1. P1 GET /me/student-card?studentId=S11<br>2. Same for S6 and S8<br>3. Open /dashboard/parent/children/{S11}/id<br>4. Open /student-id/print?studentId=S11 |
| Expected Result | All return 403 (UI: 'This card is not available to you. The link to this student is not approved.'; print route renders the 404 page); no data about S11 is exposed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-687 — Student cannot read another student's card
| Field | Value |
|---|---|
| Test Case ID | TC-687 |
| Requirement ID | FR-325 |
| Module | Student & Parent Portals |
| Test Scenario | Student cannot read another student's card |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | S1 and S2 both complete |
| Test Data | S2 id |
| Steps | 1. S1 GET /me/student-card?studentId=S2 |
| Expected Result | 403 forbidden. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-688 — Checklist lists missing items and gates the card
| Field | Value |
|---|---|
| Test Case ID | TC-688 |
| Requirement ID | FR-326 |
| Module | Student & Parent Portals |
| Test Scenario | Checklist lists missing items and gates the card |
| Test Type | Functional |
| Priority | High |
| Preconditions | S12 with no guardian email and no completed onboarding |
| Test Data | S12 |
| Steps | 1. GET /api/v1/me/profile-checklist as S12<br>2. Open /dashboard/student/id<br>3. Complete each item and reload |
| Expected Result | Items name, phone, guardianEmail, academic with done flags; guardianEmail and academic marked blocking; cardAvailable false until all done; page shows '{done} of {total} complete…' and a 'Complete' link where fixHref exists; after completion card appears. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-689 — Name/phone flagged non-blocking still block the card
| Field | Value |
|---|---|
| Test Case ID | TC-689 |
| Requirement ID | FR-326 |
| Module | Student & Parent Portals |
| Test Scenario | Name/phone flagged non-blocking still block the card |
| Test Type | Boundary / Negative |
| Priority | High |
| Preconditions | S13 complete except phone missing |
| Test Data | S13 |
| Steps | 1. GET profile-checklist<br>2. GET /me/student-card |
| Expected Result | Record whether complete=false and the card returns 422 PROFILE_INCOMPLETE even though phone is flagged blocking:false (expected per code: yes). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | CONFLICTING — GAP-124 |

##### TC-690 — Checklist access control
| Field | Value |
|---|---|
| Test Case ID | TC-690 |
| Requirement ID | FR-326 |
| Module | Student & Parent Portals |
| Test Scenario | Checklist access control |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | P1 approved to S1; P2 unrelated |
| Test Data | S1 |
| Steps | 1. P1 GET /me/profile-checklist?studentId=S1<br>2. P2 same |
| Expected Result | P1 receives S1's checklist; P2 receives 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-691 — Valid code accepted; single typo rejected
| Field | Value |
|---|---|
| Test Case ID | TC-691 |
| Requirement ID | FR-327 |
| Module | Student & Parent Portals |
| Test Scenario | Valid code accepted; single typo rejected |
| Test Type | Functional / Boundary |
| Priority | Critical |
| Preconditions | Known valid code V (from a card, formatted) |
| Test Data | V; variants with each character replaced |
| Steps | 1. Enter V in the counter/search entry that uses student codes<br>2. Replace one character at a time with each other alphabet symbol<br>3. Submit each |
| Expected Result | V resolves; every single-character variant is rejected as invalid (unit test asserts all). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Run alongside apps/erp/tests/unit/student-code.test.ts |

##### TC-692 — Adjacent swap rejected
| Field | Value |
|---|---|
| Test Case ID | TC-692 |
| Requirement ID | FR-327 |
| Module | Student & Parent Portals |
| Test Scenario | Adjacent swap rejected |
| Test Type | Boundary / Negative |
| Priority | Critical |
| Preconditions | Valid code V with two different adjacent characters |
| Test Data | V with positions i,i+1 swapped |
| Steps | 1. Submit each adjacent swap |
| Expected Result | Every swap that changes the string is rejected as invalid. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-693 — Normalisation of human input
| Field | Value |
|---|---|
| Test Case ID | TC-693 |
| Requirement ID | FR-327 |
| Module | Student & Parent Portals |
| Test Scenario | Normalisation of human input |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Valid code V |
| Test Data | 'v' lower case, 'V' with spaces/dashes/underscores, RLM/LRM marks, letters I/L/O in place of 1/1/0 |
| Steps | 1. Enter each variant |
| Expected Result | All normalise to V and resolve; non-code text (e.g. 'hello', 7 characters, 9 characters) returns invalid without guessing. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-694 — Pending code becomes permanent exactly once
| Field | Value |
|---|---|
| Test Case ID | TC-694 |
| Requirement ID | FR-328 |
| Module | Student & Parent Portals |
| Test Scenario | Pending code becomes permanent exactly once |
| Test Type | Integration |
| Priority | High |
| Preconditions | DB test environment; student with pending code X… |
| Test Data | S14 |
| Steps | 1. Complete profile so issuance runs<br>2. Read code<br>3. Trigger issuance again |
| Expected Result | Code changes from X-prefixed pending to a permanent code once; second run leaves it unchanged; code has no relation to name, phone or birth date. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-695 — Issued code carries no personal data and is unique
| Field | Value |
|---|---|
| Test Case ID | TC-695 |
| Requirement ID | FR-328 |
| Module | Student & Parent Portals |
| Test Scenario | Issued code carries no personal data and is unique |
| Test Type | Security / Integration |
| Priority | High |
| Preconditions | DB test environment (edura-env:test); two students with identical names and birth dates |
| Test Data | S18, S19 |
| Steps | 1. Complete both profiles<br>2. Compare the two permanent codes<br>3. Change S18's name/phone/birth date and re-read the code |
| Expected Result | Codes differ; code does not change when personal data changes; neither contains initials, birth date or phone digits. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Derived from SHA-256 of profile id |

##### TC-696 — QR payload structure and verification
| Field | Value |
|---|---|
| Test Case ID | TC-696 |
| Requirement ID | FR-329 |
| Module | Student & Parent Portals |
| Test Scenario | QR payload structure and verification |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Card for S1 with version 1 |
| Test Data | payload from the card |
| Steps | 1. Decode the QR to /c/{CODE}-{version}-{sig}<br>2. Open it in a browser |
| Expected Result | Payload is code-version-16-char signature; page reports 'Valid card'; payload contains no name or other personal data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-697 — Tampered QR payload
| Field | Value |
|---|---|
| Test Case ID | TC-697 |
| Requirement ID | FR-329 |
| Module | Student & Parent Portals |
| Test Scenario | Tampered QR payload |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | Valid payload P |
| Test Data | P with one signature char changed; version changed 1->2; code changed to another valid code; signature from another student |
| Steps | 1. Open each altered URL |
| Expected Result | Each shows 'Not a valid card' (outcome invalid); no identity shown; lower-case version of P is still accepted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-698 — Production secret requirement
| Field | Value |
|---|---|
| Test Case ID | TC-698 |
| Requirement ID | FR-329 |
| Module | Student & Parent Portals |
| Test Scenario | Production secret requirement |
| Test Type | Configuration / Security |
| Priority | Critical |
| Preconditions | Staging build without STUDENT_QR_SECRET (test environment only) |
| Test Data | env variable unset |
| Steps | 1. Start the app with NODE_ENV=production and no secret<br>2. Request a card |
| Expected Result | Signing throws (fails closed); unit test covers this. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Do not use real production |

##### TC-699 — Scan outcomes for valid, revoked and superseded cards
| Field | Value |
|---|---|
| Test Case ID | TC-699 |
| Requirement ID | FR-330 |
| Module | Student & Parent Portals |
| Test Scenario | Scan outcomes for valid, revoked and superseded cards |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | S1 valid; S2 revoked; S3 reissued (old and new card) |
| Test Data | payloads of each |
| Steps | 1. Open /c/{payload} for each<br>2. GET /api/v1/students/scan/{payload} |
| Expected Result | valid -> 'Valid card'; revoked -> 'Card stopped' with reason; old S3 card -> 'Old card'; new S3 card valid. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-700 — Disclosure tiers
| Field | Value |
|---|---|
| Test Case ID | TC-700 |
| Requirement ID | FR-330 |
| Module | Student & Parent Portals |
| Test Scenario | Disclosure tiers |
| Test Type | Security / Functional |
| Priority | Critical |
| Preconditions | Viewers: anonymous, signed-in student, teacher of S1, counter staff of S1's center |
| Test Data | valid payload of S1 |
| Steps | 1. Scan as each viewer |
| Expected Result | Anonymous sees only code, system, grade, track and the notice 'Full student details are shown only to center staff who are signed in…'; signed_in gets masked name/phone (maskName/maskPhone); teacher and counter get the fuller record per tier; 'Continue to the counter' appears for counter staff only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-701 — Unreadable, forged and bare-code inputs
| Field | Value |
|---|---|
| Test Case ID | TC-701 |
| Requirement ID | FR-330 |
| Module | Student & Parent Portals |
| Test Scenario | Unreadable, forged and bare-code inputs |
| Test Type | Negative / Security |
| Priority | Critical |
| Preconditions | anonymous and a signed-in student |
| Test Data | 'hello', forged signature, bare valid code |
| Steps | 1. Scan 'hello' anonymously<br>2. Scan forged payload<br>3. Scan bare code anonymously<br>4. Scan bare code signed-in |
| Expected Result | 'Unreadable code'; 'Not a valid card'; bare code anonymous -> invalid; bare code signed-in -> resolves (record disclosed fields). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-119 |

##### TC-702 — Scan creates no session
| Field | Value |
|---|---|
| Test Case ID | TC-702 |
| Requirement ID | FR-330 |
| Module | Student & Parent Portals |
| Test Scenario | Scan creates no session |
| Test Type | Security |
| Priority | Critical |
| Preconditions | anonymous browser with no cookies |
| Test Data | valid payload |
| Steps | 1. Open /c/{payload}<br>2. Inspect cookies and call GET /api/v1/me/children |
| Expected Result | No session cookie is set; the follow-up call returns 401. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-703 — Scan route has no rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-703 |
| Requirement ID | FR-330 |
| Module | Student & Parent Portals |
| Test Scenario | Scan route has no rate limit |
| Test Type | Security / Performance |
| Priority | Critical |
| Preconditions | test environment |
| Test Data | valid and invalid payloads |
| Steps | 1. Send 200 scans in a minute from one IP |
| Expected Result | Record whether any 429 appears (code: none expected). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-120 |

##### TC-704 — Reissue invalidates the old card
| Field | Value |
|---|---|
| Test Case ID | TC-704 |
| Requirement ID | FR-331 |
| Module | Student & Parent Portals |
| Test Scenario | Reissue invalidates the old card |
| Test Type | Integration |
| Priority | High |
| Preconditions | super_admin session; S1 with card v1 |
| Test Data | reason 'lost card' |
| Steps | 1. super_admin reissues S1's card with a reason<br>2. Scan the v1 payload<br>3. Scan the new payload |
| Expected Result | v1 -> 'Old card' (superseded); new -> valid; version incremented. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-705 — Reissue / revoke authorization and reason rules
| Field | Value |
|---|---|
| Test Case ID | TC-705 |
| Requirement ID | FR-331 |
| Module | Student & Parent Portals |
| Test Scenario | Reissue / revoke authorization and reason rules |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | center_admin, teacher and super_admin sessions |
| Test Data | reason 'ab' (2 chars), empty |
| Steps | 1. Non-super-admin attempts reissue and revoke<br>2. super_admin revokes with 'ab'<br>3. super_admin revokes with valid reason twice |
| Expected Result | Non-super-admin forbidden; short reason -> 'A reason is required'; second revoke -> 'This card is already revoked'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | UI is in the Back-office module |

##### TC-706 — Print sheet happy path and failures
| Field | Value |
|---|---|
| Test Case ID | TC-706 |
| Requirement ID | FR-332 |
| Module | Student & Parent Portals |
| Test Scenario | Print sheet happy path and failures |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | S1 complete; logged-out browser |
| Test Data | /student-id/print, ?print=1, ?studentId=other |
| Steps | 1. Logged out open /student-id/print<br>2. Log in as S1 open it with ?print=1<br>3. As S1 open with ?studentId=S2<br>4. As S10 (incomplete) open it |
| Expected Result | Logged out -> redirect to login with next; S1 sees the sheet and the print dialog opens; other id and incomplete -> 404 page; verify paper layout and Arabic RTL manually. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-125 |

##### TC-707 — Student sees only own grade and track courses
| Field | Value |
|---|---|
| Test Case ID | TC-707 |
| Requirement ID | FR-333 |
| Module | Student & Parent Portals |
| Test Scenario | Student sees only own grade and track courses |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | S1 grade G track T; courses exist for (G,T), (G,null), (G,T2), (G2,T) |
| Test Data | S1 |
| Steps | 1. As S1 GET /api/v1/search/courses<br>2. Compare results |
| Expected Result | Only (G,T) and (G,null) courses returned. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-708 — Browse-all bypass and incomplete onboarding
| Field | Value |
|---|---|
| Test Case ID | TC-708 |
| Requirement ID | FR-333 |
| Module | Student & Parent Portals |
| Test Scenario | Browse-all bypass and incomplete onboarding |
| Test Type | Functional / Boundary |
| Priority | Critical |
| Preconditions | S1 as above; S15 onboarding not completed |
| Test Data | scope=all |
| Steps | 1. S1 GET /search/courses?scope=all<br>2. S15 GET /search/courses |
| Expected Result | scope=all includes (G,T2) and (G2,T); S15 receives unscoped results. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-709 — Parent studentId tampering on course search
| Field | Value |
|---|---|
| Test Case ID | TC-709 |
| Requirement ID | FR-333 |
| Module | Student & Parent Portals |
| Test Scenario | Parent studentId tampering on course search |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | P1 approved to S1 only |
| Test Data | S1, S11 |
| Steps | 1. P1 GET /search/courses?studentId=S1<br>2. P1 GET ?studentId=S11<br>3. P1 GET without studentId |
| Expected Result | S1 -> scoped results; S11 -> 403 'Not an approved child of this parent'; no studentId -> unscoped. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-710 — Rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-710 |
| Requirement ID | FR-333 |
| Module | Student & Parent Portals |
| Test Scenario | Rate limit |
| Test Type | Security / Boundary |
| Priority | Critical |
| Preconditions | test environment |
| Test Data | 61+ requests in under a minute from one IP |
| Steps | 1. Send 70 requests rapidly<br>2. Wait 60 seconds and retry |
| Expected Result | Excess requests return 429 rate_limited 'Too many requests, please slow down.' with Retry-After 60; later requests succeed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-711 — Parent child-scoped subjects
| Field | Value |
|---|---|
| Test Case ID | TC-711 |
| Requirement ID | FR-334 |
| Module | Student & Parent Portals |
| Test Scenario | Parent child-scoped subjects |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | P1 approved to S1 and S5 (different tracks) |
| Test Data | S1, S5 |
| Steps | 1. GET /catalog/subjects?mine=1&studentId=S1<br>2. Same for S5 |
| Expected Result | Each returns that child's grade/track subjects only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-712 — Missing or foreign studentId
| Field | Value |
|---|---|
| Test Case ID | TC-712 |
| Requirement ID | FR-334 |
| Module | Student & Parent Portals |
| Test Scenario | Missing or foreign studentId |
| Test Type | Negative / Security |
| Priority | Critical |
| Preconditions | P1 approved to S1 |
| Test Data | none, S11 |
| Steps | 1. GET /catalog/subjects?mine=1 as P1<br>2. GET ...&studentId=S11<br>3. GET ?mine=1 as teacher |
| Expected Result | 400 'studentId is required for a parent'; 403 'Not an approved child of this parent'; teacher -> 400 'mine=1 is for students and parents'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-713 — Student 'mine' subjects follow year and track
| Field | Value |
|---|---|
| Test Case ID | TC-713 |
| Requirement ID | FR-335 |
| Module | Student & Parent Portals |
| Test Scenario | Student 'mine' subjects follow year and track |
| Test Type | Functional |
| Priority | High |
| Preconditions | S1 with a track-to-subject mapping, second language chosen |
| Test Data | S1 |
| Steps | 1. GET /catalog/subjects?mine=1 |
| Expected Result | Only subjects mapped to S1's year/track (and second-language choice) returned. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-714 — No mapping and parameter validation
| Field | Value |
|---|---|
| Test Case ID | TC-714 |
| Requirement ID | FR-335 |
| Module | Student & Parent Portals |
| Test Scenario | No mapping and parameter validation |
| Test Type | Negative / Boundary |
| Priority | High |
| Preconditions | S16 with year/track without subject mapping |
| Test Data | gradeLevelIds with 0 and 51 items, malformed trackId |
| Steps | 1. S16 GET ?mine=1<br>2. GET ?gradeLevelIds= (empty) / 51 ids<br>3. GET ?trackId=abc |
| Expected Result | Empty list (UI: 'No subjects are configured for your year/track yet'); 400 'gradeLevelIds must be 1-50 UUIDs'; 400 'trackId must be a UUID'. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-715 — My subjects vs Browse all tabs
| Field | Value |
|---|---|
| Test Case ID | TC-715 |
| Requirement ID | FR-336 |
| Module | Student & Parent Portals |
| Test Scenario | My subjects vs Browse all tabs |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | S1 signed in |
| Test Data | search term 'zzzz' |
| Steps | 1. Open /dashboard/student/subjects<br>2. Check My subjects list<br>3. Switch to Browse all, search 'zzzz'<br>4. Open /dashboard/student/courses |
| Expected Result | My tab shows only track subjects; Browse all lists others; search miss shows 'No subjects match your search'; /courses redirects to /subjects. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-716 — Error state is not shown as empty
| Field | Value |
|---|---|
| Test Case ID | TC-716 |
| Requirement ID | FR-336 |
| Module | Student & Parent Portals |
| Test Scenario | Error state is not shown as empty |
| Test Type | Negative / UI |
| Priority | High |
| Preconditions | block the subjects API (devtools offline) |
| Test Data | n/a |
| Steps | 1. Load the page with the API failing |
| Expected Result | An error state is shown, not the 'No subjects are configured…' empty text. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-717 — Find a teacher default scope and filters
| Field | Value |
|---|---|
| Test Case ID | TC-717 |
| Requirement ID | FR-337 |
| Module | Student & Parent Portals |
| Test Scenario | Find a teacher default scope and filters |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | S1 signed in; teachers exist with sessions |
| Test Data | day Sunday, time Morning |
| Steps | 1. Open /dashboard/student/teachers<br>2. Pick days/time/subject, search by name<br>3. Clear filters |
| Expected Result | Results scoped to S1's year/track; 'No teacher is teaching on the days you picked' with hint when none; 'Clear filters' resets. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | UNCLEAR FR; record actual behavior |

##### TC-718 — Keep one roster
| Field | Value |
|---|---|
| Test Case ID | TC-718 |
| Requirement ID | FR-338 |
| Module | Student & Parent Portals |
| Test Scenario | Keep one roster |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | S1 active on centers A and B |
| Test Data | centerId A |
| Steps | 1. POST /api/v1/me/roster/choice {centerId: A} |
| Expected Result | 200 {keptCenterId: A, leftCenters: 1}; B's roster row has leftAt set; A unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Record side effects on subscriptions/attendance (Q-069) |

##### TC-719 — Roster choice errors
| Field | Value |
|---|---|
| Test Case ID | TC-719 |
| Requirement ID | FR-338 |
| Module | Student & Parent Portals |
| Test Scenario | Roster choice errors |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | S1 not on center C; a student who left center A |
| Test Data | C, A, extra key |
| Steps | 1. POST {centerId: C}<br>2. POST {centerId: A} after leaving<br>3. POST {centerId: A, x:1}<br>4. POST as parent |
| Expected Result | 404 'You are not on this center's roster'; extra key -> validation error; parent -> 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-720 — Oversight children list
| Field | Value |
|---|---|
| Test Case ID | TC-720 |
| Requirement ID | FR-339 |
| Module | Student & Parent Portals |
| Test Scenario | Oversight children list |
| Test Type | Functional |
| Priority | High |
| Preconditions | P1 approved to minor S1 (no DOB) and adult S17 (verified age >= 18) |
| Test Data | S1, S17 |
| Steps | 1. Open /dashboard/parent/oversight<br>2. GET /parent/oversight/children |
| Expected Result | Both children listed with correct minor flag; S1 has the 'Under 18' badge. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-721 — Oversight list access control
| Field | Value |
|---|---|
| Test Case ID | TC-721 |
| Requirement ID | FR-339 |
| Module | Student & Parent Portals |
| Test Scenario | Oversight list access control |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | student S1 session; P2 unrelated |
| Test Data | none |
| Steps | 1. S1 GET /parent/oversight/children<br>2. P2 GET (no children) |
| Expected Result | Student 403; P2 gets an empty list; neither sees P1's children. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-722 — Parent lists minor child's conversations
| Field | Value |
|---|---|
| Test Case ID | TC-722 |
| Requirement ID | FR-340 |
| Module | Student & Parent Portals |
| Test Scenario | Parent lists minor child's conversations |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | S1 minor has conversations with a teacher, a center staff, and another student |
| Test Data | S1 |
| Steps | 1. P1 GET /parent/oversight/children/S1/conversations |
| Expected Result | Only conversations whose partner is teacher/assistant/center_admin/center_staff appear; the student-student thread is absent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-723 — Oversight refused for adult, unlinked and revoked
| Field | Value |
|---|---|
| Test Case ID | TC-723 |
| Requirement ID | FR-340 |
| Module | Student & Parent Portals |
| Test Scenario | Oversight refused for adult, unlinked and revoked |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | S17 adult verified; S11 unrelated; link to S1 revoked |
| Test Data | ids |
| Steps | 1. P1 GET .../S17/conversations<br>2. GET .../S11/conversations<br>3. Revoke the S1 link then GET .../S1/conversations |
| Expected Result | All refused (403, or 404 for unknown) with no conversation metadata leaked. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-724 — Default-minor boundary
| Field | Value |
|---|---|
| Test Case ID | TC-724 |
| Requirement ID | FR-340 |
| Module | Student & Parent Portals |
| Test Scenario | Default-minor boundary |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Students: no DOB; DOB without verified-at; DOB verified age 17 years 364 days; verified exactly 18th birthday today (UTC) |
| Test Data | four profiles |
| Steps | 1. P1 GET oversight children for each |
| Expected Result | First three are minors; the 18th-birthday case is adult (UTC age >= 18). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-725 — Read thread read-only with paging
| Field | Value |
|---|---|
| Test Case ID | TC-725 |
| Requirement ID | FR-341 |
| Module | Student & Parent Portals |
| Test Scenario | Read thread read-only with paging |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Thread with 120 messages between S1 and a teacher |
| Test Data | limit 10, 1000, 0, beforeSeq mid |
| Steps | 1. GET .../conversations/{id}?limit=10<br>2. ?limit=1000<br>3. ?limit=0<br>4. ?beforeSeq=<mid> |
| Expected Result | limit clamped to 1..100 (default 50); beforeSeq pages older messages; response 200. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-726 — Oversight does not mark messages read
| Field | Value |
|---|---|
| Test Case ID | TC-726 |
| Requirement ID | FR-341 |
| Module | Student & Parent Portals |
| Test Scenario | Oversight does not mark messages read |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | S1 has unread messages in thread |
| Test Data | unread counts before/after |
| Steps | 1. Record S1's unread count and read cursor<br>2. P1 opens the thread<br>3. Re-check |
| Expected Result | Unread counts, read cursors and delivery states unchanged (see messaging-scope tests). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-727 — Thread access control and bad input
| Field | Value |
|---|---|
| Test Case ID | TC-727 |
| Requirement ID | FR-341 |
| Module | Student & Parent Portals |
| Test Scenario | Thread access control and bad input |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | P1 approved to S1; thread T belongs to S11 |
| Test Data | T, 'abc' |
| Steps | 1. P1 GET /parent/oversight/children/S1/conversations/T<br>2. GET ...S11/conversations/T<br>3. GET ...?beforeSeq=abc<br>4. GET ...?limit=abc |
| Expected Result | Thread of another child via S1's path -> 403/404 per ChatError mapping; S11 path -> 403; non-numeric params: record the status (expected not 500). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-127 |

##### TC-728 — Subject request is teacher-only
| Field | Value |
|---|---|
| Test Case ID | TC-728 |
| Requirement ID | FR-342 |
| Module | Student & Parent Portals |
| Test Scenario | Subject request is teacher-only |
| Test Type | Functional / Negative |
| Priority | Low |
| Preconditions | Teacher T1 and student S1 sessions |
| Test Data | suggestedName 'A' (1 char), 'Astronomy', 201-char name, notes 1001 chars |
| Steps | 1. T1 POST /me/subject-requests {suggestedName:'Astronomy'}<br>2. Repeat identical request<br>3. POST with invalid sizes<br>4. S1 POST /me/subject-requests |
| Expected Result | First 201 {id}; repeat returns same id with duplicate true; size violations 400; student 403 (no student lifecycle exists). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-128, Q-068 |

##### TC-729 — Student dashboard shell
| Field | Value |
|---|---|
| Test Case ID | TC-729 |
| Requirement ID | FR-343 |
| Module | Student & Parent Portals |
| Test Scenario | Student dashboard shell |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | S1 signed in |
| Test Data | S1 |
| Steps | 1. Open /dashboard/student<br>2. Click each quick action |
| Expected Result | Shell renders next-up and tiles; each link navigates to the correct student page; no console errors. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-730 — Parent dashboard with child selector
| Field | Value |
|---|---|
| Test Case ID | TC-730 |
| Requirement ID | FR-344 |
| Module | Student & Parent Portals |
| Test Scenario | Parent dashboard with child selector |
| Test Type | Functional |
| Priority | High |
| Preconditions | P1 with two approved children |
| Test Data | S1, S5 |
| Steps | 1. Open /dashboard/parent<br>2. Switch child with the selector<br>3. Observe tiles |
| Expected Result | Tiles reload for the selected child; API calls carry the selected child's id; switching back restores. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-731 — Parent with no children
| Field | Value |
|---|---|
| Test Case ID | TC-731 |
| Requirement ID | FR-344 |
| Module | Student & Parent Portals |
| Test Scenario | Parent with no children |
| Test Type | Negative / UI |
| Priority | High |
| Preconditions | P3 with no approved link |
| Test Data | P3 |
| Steps | 1. Open /dashboard/parent and /dashboard/parent/progress |
| Expected Result | Empty state 'No linked children yet.'; no child-scoped requests sent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-732 — Parent progress page for selected child
| Field | Value |
|---|---|
| Test Case ID | TC-732 |
| Requirement ID | FR-345 |
| Module | Student & Parent Portals |
| Test Scenario | Parent progress page for selected child |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | P1 with two children |
| Test Data | S1 |
| Steps | 1. Open /dashboard/parent/progress<br>2. Switch child |
| Expected Result | Page shows data for the selected child only; data correctness is covered by the Sessions & Attendance and Teacher modules. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-733 — Children page linking flows
| Field | Value |
|---|---|
| Test Case ID | TC-733 |
| Requirement ID | FR-346 |
| Module | Student & Parent Portals |
| Test Scenario | Children page linking flows |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | P1 signed in |
| Test Data | valid code; S2 email |
| Steps | 1. Use 'By Family Code' with a valid code<br>2. Use 'By Email or Phone' with S2's email<br>3. Inspect the links table |
| Expected Result | Toasts 'Linked successfully.' and 'Link request sent.'; table shows statuses; Approve/Reject only on pending student-initiated rows; Revoke only on approved rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-734 — Children page validation and errors
| Field | Value |
|---|---|
| Test Case ID | TC-734 |
| Requirement ID | FR-346 |
| Module | Student & Parent Portals |
| Test Scenario | Children page validation and errors |
| Test Type | Negative / UI |
| Priority | High |
| Preconditions | P1 signed in |
| Test Data | empty code, 'abc', phone in email tab, S1 code when S1 is linked |
| Steps | 1. Submit empty code<br>2. Enter 'abc' in the email tab<br>3. Enter a phone in the email tab<br>4. Submit a code for an already-linked student |
| Expected Result | 'Please enter a family code.'; 'Invalid email address.' (twice); server message shown in toast, fallback 'Failed to link.' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | See GAP-122 |

##### TC-735 — Revoke confirmation dialog
| Field | Value |
|---|---|
| Test Case ID | TC-735 |
| Requirement ID | FR-346 |
| Module | Student & Parent Portals |
| Test Scenario | Revoke confirmation dialog |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | P1 approved to S1 |
| Test Data | S1 |
| Steps | 1. Press Revoke<br>2. Cancel the dialog<br>3. Press Revoke again and confirm |
| Expected Result | Dialog 'Revoke this link?' / 'The parent will no longer have access to this student's data.'; cancel changes nothing; confirm revokes. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-736 — Correct role reaches its portal
| Field | Value |
|---|---|
| Test Case ID | TC-736 |
| Requirement ID | FR-347 |
| Module | Student & Parent Portals |
| Test Scenario | Correct role reaches its portal |
| Test Type | Functional |
| Priority | High |
| Preconditions | student, parent accounts |
| Test Data | S1, P1 |
| Steps | 1. S1 open /dashboard/student<br>2. P1 open /dashboard/parent |
| Expected Result | Each portal renders for its own role. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-737 — Wrong role and anonymous are redirected
| Field | Value |
|---|---|
| Test Case ID | TC-737 |
| Requirement ID | FR-347 |
| Module | Student & Parent Portals |
| Test Scenario | Wrong role and anonymous are redirected |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | S1, P1, anonymous |
| Test Data | urls |
| Steps | 1. S1 open /dashboard/parent<br>2. P1 open /dashboard/student<br>3. Anonymous open both<br>4. Call the matching APIs with the wrong role |
| Expected Result | Pages redirect per portal-gate; APIs return 403/401; the page gate alone is not relied on. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-738 — Settings pages load
| Field | Value |
|---|---|
| Test Case ID | TC-738 |
| Requirement ID | FR-348 |
| Module | Student & Parent Portals |
| Test Scenario | Settings pages load |
| Test Type | Functional / UI |
| Priority | Low |
| Preconditions | S1, P1 signed in |
| Test Data | none |
| Steps | 1. Open /dashboard/student/settings and /dashboard/parent/settings<br>2. Review the ID-card settings card |
| Expected Result | Pages render without error; record the fields and actions available (not specified in code reviewed). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | UNCLEAR FR |

### 8. Messaging, Notifications & Communication Integrations

Accounts: roles and emails only; password: see docs/guides/test-credentials.md. Seeded: center_admin admin@nile-academy.eg; teachers hossam.aziz@, hana.rashidi@, nourhan.mostafa@, kareem.salah@nile-academy.eg; students lina.hassan@, ahmed.mostafa@, sara.elsayed@, omar.khaled@student.nile-academy.eg; parents mona.hassan@email.eg (Lina), tarek.mostafa@email.eg (Ahmed). Assistant, center_staff, super_admin, accountant and minor/locked students: UNKNOWN which seeded accounts exist, create them as needed (set date of birth and guardian email on the student profile).

##### TC-739 — Teacher directory lists only own enrolled students
| Field | Description |
|---|---|
| Test Case ID | TC-739 |
| Requirement ID | FR-349 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher directory lists only own enrolled students |
| Test Type | Functional |
| Priority | High |
| Preconditions | Logged-in ERP session. |
| Test Data | teacher hossam.aziz@nile-academy.eg |
| Steps | 1. GET /api/v1/messages/contacts |
| Expected Result | 200; only students with an active enrollment with this teacher plus related parents/assistants/centers; no students of other teachers |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/contacts/route.ts:6; packages/server-core/src/services/messages/chat-scope.ts (contacts, guardianFilter ~695); chat-policy.ts |

##### TC-740 — Locked minor student sees no adult contacts
| Field | Description |
|---|---|
| Test Case ID | TC-740 |
| Requirement ID | FR-349 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Locked minor student sees no adult contacts |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Logged-in ERP session. |
| Test Data | student who is a minor with no guardian email (set DOB under 18, clear guardianEmail, no approved parent with email) |
| Steps | 1. GET /api/v1/messages/contacts as that student |
| Expected Result | 200; no teacher, assistant, center_admin, center_staff entries; list empty |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/contacts/route.ts:6; packages/server-core/src/services/messages/chat-scope.ts (contacts, guardianFilter ~695); chat-policy.ts |

##### TC-741 — Locked minor is hidden from teacher directory
| Field | Description |
|---|---|
| Test Case ID | TC-741 |
| Requirement ID | FR-349 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Locked minor is hidden from teacher directory |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Logged-in ERP session. |
| Test Data | same locked student; teacher of that student |
| Steps | 1. GET /api/v1/messages/contacts as the teacher |
| Expected Result | 200; the locked student is absent |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/contacts/route.ts:6; packages/server-core/src/services/messages/chat-scope.ts (contacts, guardianFilter ~695); chat-policy.ts |

##### TC-742 — limit boundary 50 and above
| Field | Description |
|---|---|
| Test Case ID | TC-742 |
| Requirement ID | FR-349 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | limit boundary 50 and above |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Logged-in ERP session. |
| Test Data | any user with many contacts |
| Steps | 1. GET /api/v1/messages/contacts?limit=51 and ?limit=50 |
| Expected Result | limit 50 returns at most 50; 51 is clamped or rejected (record actual; not asserted in code review) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/contacts/route.ts:6; packages/server-core/src/services/messages/chat-scope.ts (contacts, guardianFilter ~695); chat-policy.ts |

##### TC-743 — Teacher starts conversation with enrolled student
| Field | Description |
|---|---|
| Test Case ID | TC-743 |
| Requirement ID | FR-350 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher starts conversation with enrolled student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session; recipient exists; role pair is in the initiation matrix; relationship exists; sender not guardian-locked; no block between the pair. |
| Test Data | teacher hossam.aziz@nile-academy.eg to lina.hassan@student.nile-academy.eg (adult or guardian channel present) |
| Steps | 1. POST /api/v1/messages/conversations {recipientId:<lina id>} |
| Expected Result | 200/201 with conversation id; second identical call returns the same id |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:25; chat.ts getOrCreateConversation; chat-scope.ts assertCanReach ~799; services/messages/messages.ts:21-40 |

##### TC-744 — No relationship is denied
| Field | Description |
|---|---|
| Test Case ID | TC-744 |
| Requirement ID | FR-350 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | No relationship is denied |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Session; recipient exists; role pair is in the initiation matrix; relationship exists; sender not guardian-locked; no block between the pair. |
| Test Data | teacher with no enrollment link to student |
| Steps | 1. POST /api/v1/messages/conversations |
| Expected Result | 403 code `forbidden`; no conversation row created |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:25; chat.ts getOrCreateConversation; chat-scope.ts assertCanReach ~799; services/messages/messages.ts:21-40 |

##### TC-745 — Student to student denied
| Field | Description |
|---|---|
| Test Case ID | TC-745 |
| Requirement ID | FR-350 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Student to student denied |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Session; recipient exists; role pair is in the initiation matrix; relationship exists; sender not guardian-locked; no block between the pair. |
| Test Data | two students |
| Steps | 1. POST /api/v1/messages/conversations |
| Expected Result | 403 `forbidden` (policy_denied) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:25; chat.ts getOrCreateConversation; chat-scope.ts assertCanReach ~799; services/messages/messages.ts:21-40 |

##### TC-746 — Locked minor cannot start adult conversation (HTTP code)
| Field | Description |
|---|---|
| Test Case ID | TC-746 |
| Requirement ID | FR-350 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Locked minor cannot start adult conversation (HTTP code) |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Session; recipient exists; role pair is in the initiation matrix; relationship exists; sender not guardian-locked; no block between the pair. |
| Test Data | locked minor student, enrolled teacher |
| Steps | 1. POST /api/v1/messages/conversations {recipientId:<teacher>} |
| Expected Result | Request refused, no conversation created; record the actual status (code review predicts 500 `internal`, expected product behavior 403) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:25; chat.ts getOrCreateConversation; chat-scope.ts assertCanReach ~799; services/messages/messages.ts:21-40 |

##### TC-747 — New-conversation rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-747 |
| Requirement ID | FR-350 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | New-conversation rate limit |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Session; recipient exists; role pair is in the initiation matrix; relationship exists; sender not guardian-locked; no block between the pair. |
| Test Data | user with at least 11 valid recipients |
| Steps | 1. POST 11 times within a minute to 11 different recipients |
| Expected Result | 10 allowed (capacity 10), the 11th returns 429 `rate_limited` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:25; chat.ts getOrCreateConversation; chat-scope.ts assertCanReach ~799; services/messages/messages.ts:21-40 |

##### TC-748 — Conversation list paginates
| Field | Description |
|---|---|
| Test Case ID | TC-748 |
| Requirement ID | FR-351 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Conversation list paginates |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session. |
| Test Data | user with over 50 conversations |
| Steps | 1. GET /api/v1/messages/conversations then ?before=<oldest lastMessageAt> |
| Expected Result | first page at most 50 items; second page returns older items without duplicates |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:11; chat.ts listConversations |

##### TC-749 — Garbage query parameters
| Field | Description |
|---|---|
| Test Case ID | TC-749 |
| Requirement ID | FR-351 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Garbage query parameters |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | any user |
| Steps | 1. GET /api/v1/messages/conversations?limit=abc and ?before=garbage |
| Expected Result | Record status; expected 400 `validation_error` (code reading predicts NaN/Invalid Date handling, possibly 500) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:11; chat.ts listConversations |

##### TC-750 — Preview truncated to 140
| Field | Description |
|---|---|
| Test Case ID | TC-750 |
| Requirement ID | FR-351 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Preview truncated to 140 |
| Test Type | Boundary |
| Priority | Low |
| Preconditions | Session. |
| Test Data | conversation whose last message is 4000 chars |
| Steps | 1. GET list |
| Expected Result | preview length at most 140 characters |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/route.ts:11; chat.ts listConversations |

##### TC-751 — Participant opens thread and pages older
| Field | Description |
|---|---|
| Test Case ID | TC-751 |
| Requirement ID | FR-352 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Participant opens thread and pages older |
| Test Type | Functional |
| Priority | High |
| Preconditions | Caller is a participant. |
| Test Data | two users with over 60 messages |
| Steps | 1. GET thread, then beforeSeq=<lowest seq> |
| Expected Result | First call up to 50 newest; second call returns older, no overlap |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/[id]/route.ts:6; chat.ts getThread; use-chat.ts |

##### TC-752 — Non-participant cannot open thread
| Field | Description |
|---|---|
| Test Case ID | TC-752 |
| Requirement ID | FR-352 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Non-participant cannot open thread |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Caller is a participant. |
| Test Data | user C not in A-B conversation |
| Steps | 1. GET /api/v1/messages/conversations/{A-B id} |
| Expected Result | 403 `forbidden` or 404; no message bodies in response |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/[id]/route.ts:6; chat.ts getThread; use-chat.ts |

##### TC-753 — Unknown conversation id
| Field | Description |
|---|---|
| Test Case ID | TC-753 |
| Requirement ID | FR-352 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unknown conversation id |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Caller is a participant. |
| Test Data | any user |
| Steps | 1. GET /api/v1/messages/conversations/<random uuid> |
| Expected Result | 404 `not_found` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/[id]/route.ts:6; chat.ts getThread; use-chat.ts |

##### TC-754 — Send plain message
| Field | Description |
|---|---|
| Test Case ID | TC-754 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Send plain message |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | teacher and enrolled student, existing conversation |
| Steps | 1. POST /api/v1/messages {conversationId, body:'Hello', clientId:'c1'} |
| Expected Result | 200; data.seq increments; recipient thread shows 'Hello' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-755 — Idempotent retry with same clientId
| Field | Description |
|---|---|
| Test Case ID | TC-755 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Idempotent retry with same clientId |
| Test Type | Concurrency |
| Priority | High |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | same conversation |
| Steps | 1. POST the same body with clientId:'c1' twice |
| Expected Result | Both return the same message id; only one DB row (unique conversationId+clientId) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-756 — Body length boundary 4000/4001
| Field | Description |
|---|---|
| Test Case ID | TC-756 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Body length boundary 4000/4001 |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | existing conversation |
| Steps | 1. POST body of 4000 chars, then 4001 chars |
| Expected Result | 4000 accepted; 4001 rejected 400 `validation_error` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-757 — Whitespace-only body
| Field | Description |
|---|---|
| Test Case ID | TC-757 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Whitespace-only body |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | existing conversation |
| Steps | 1. POST body '   ' |
| Expected Result | Rejected; record status (code predicts 422 `business_rule`) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-758 — Send to a conversation the caller is not part of
| Field | Description |
|---|---|
| Test Case ID | TC-758 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Send to a conversation the caller is not part of |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | user C |
| Steps | 1. POST /api/v1/messages {conversationId:<A-B>, body:'x'} |
| Expected Result | 403 `forbidden`; no row inserted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-759 — Send rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-759 |
| Requirement ID | FR-353 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Send rate limit |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Session; participant (existing) or reachable recipient (new). |
| Test Data | one user, one conversation |
| Steps | 1. Send 31 messages quickly |
| Expected Result | capacity 30 then 429 `rate_limited`; refill 20 per minute |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts:20; chat.ts appendMessage; services/messages/messages.ts:21-40 |

##### TC-760 — Socket send is acknowledged and delivered live
| Field | Description |
|---|---|
| Test Case ID | TC-760 |
| Requirement ID | FR-354 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Socket send is acknowledged and delivered live |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Valid socket connection (FR-383). |
| Test Data | two connected sessions teacher and student |
| Steps | 1. Teacher emits message:send 2. observe student socket |
| Expected Result | Teacher ack ok:true; student receives message:new once; teacher later sees message:delivered |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts; apps/erp/src/features/chat/use-chat.ts |

##### TC-761 — Socket ack carries guardian_required
| Field | Description |
|---|---|
| Test Case ID | TC-761 |
| Requirement ID | FR-354 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Socket ack carries guardian_required |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Valid socket connection (FR-383). |
| Test Data | locked minor student connected |
| Steps | 1. Student emits message:send with recipientId of teacher |
| Expected Result | Ack ok:false code guardian_required; no message stored |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts; apps/erp/src/features/chat/use-chat.ts |

##### TC-762 — Oversize payload
| Field | Description |
|---|---|
| Test Case ID | TC-762 |
| Requirement ID | FR-354 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Oversize payload |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Valid socket connection (FR-383). |
| Test Data | connected socket |
| Steps | 1. Emit message:send with a payload over 64 KiB |
| Expected Result | Connection closed or payload rejected by socket.io |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts; apps/erp/src/features/chat/use-chat.ts |

##### TC-763 — Client falls back to REST after ack timeout
| Field | Description |
|---|---|
| Test Case ID | TC-763 |
| Requirement ID | FR-354 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Client falls back to REST after ack timeout |
| Test Type | Integration |
| Priority | High |
| Preconditions | Valid socket connection (FR-383). |
| Test Data | realtime server stopped after connect |
| Steps | 1. Send from UI |
| Expected Result | After about 8 s UI posts via REST and message arrives; no duplicate on reconnect (clientId idempotency) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts; apps/erp/src/features/chat/use-chat.ts |

##### TC-764 — Reading clears unread
| Field | Description |
|---|---|
| Test Case ID | TC-764 |
| Requirement ID | FR-355 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Reading clears unread |
| Test Type | Functional |
| Priority | High |
| Preconditions | Participant. |
| Test Data | A sent 3 messages to B |
| Steps | 1. B POST read 2. B GET list |
| Expected Result | B unread count 0; A receives conversation:read |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/[id]/read/route.ts:6; apps/realtime/src/server.ts; chat.ts markRead |

##### TC-765 — Non participant cannot mark read
| Field | Description |
|---|---|
| Test Case ID | TC-765 |
| Requirement ID | FR-355 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Non participant cannot mark read |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Participant. |
| Test Data | user C |
| Steps | 1. POST /api/v1/messages/conversations/{A-B}/read |
| Expected Result | 403 or 404; A-B unread unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/conversations/[id]/read/route.ts:6; apps/realtime/src/server.ts; chat.ts markRead |

##### TC-766 — Typing event reaches partner only
| Field | Description |
|---|---|
| Test Case ID | TC-766 |
| Requirement ID | FR-356 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Typing event reaches partner only |
| Test Type | Functional |
| Priority | Low |
| Preconditions | Connected socket; participant. |
| Test Data | A and B connected, C connected |
| Steps | 1. A emits typing |
| Expected Result | B receives, C does not |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts |

##### TC-767 — Presence follows connect and disconnect
| Field | Description |
|---|---|
| Test Case ID | TC-767 |
| Requirement ID | FR-357 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Presence follows connect and disconnect |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Socket connected. |
| Test Data | A and B partners |
| Steps | 1. B connects, then closes all tabs |
| Expected Result | A sees online then offline; with two tabs B stays online until last closes |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts; apps/realtime presence registry |

##### TC-768 — Exhaustive role pair matrix
| Field | Description |
|---|---|
| Test Case ID | TC-768 |
| Requirement ID | FR-358 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Exhaustive role pair matrix |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Role known. |
| Test Data | one account per role (admin@nile-academy.eg center_admin, hossam.aziz@nile-academy.eg teacher, lina.hassan@student.nile-academy.eg student, mona.hassan@email.eg parent, plus assistant, staff, super_admin, accountant accounts) |
| Steps | 1. For every ordered role pair POST /api/v1/messages/conversations with a related recipient |
| Expected Result | Allowed pairs per matrix succeed; every other pair 403; super_admin and accountant always 403 as sender and as recipient |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-policy.ts (CONVERSATION_INITIATION); apps/erp/tests/unit/messaging-matrix.test.ts |

##### TC-769 — Center admin cannot message center admin of another center
| Field | Description |
|---|---|
| Test Case ID | TC-769 |
| Requirement ID | FR-358 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Center admin cannot message center admin of another center |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Role known. |
| Test Data | two centers |
| Steps | 1. center_admin A POST to center_admin B |
| Expected Result | 403 (center_admin->center_admin is not in the matrix) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-policy.ts (CONVERSATION_INITIATION); apps/erp/tests/unit/messaging-matrix.test.ts |

##### TC-770 — Unlinked parent denied
| Field | Description |
|---|---|
| Test Case ID | TC-770 |
| Requirement ID | FR-359 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unlinked parent denied |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Matrix passes. |
| Test Data | parent without approved link to the teacher's student |
| Steps | 1. POST /api/v1/messages/conversations to the teacher |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-scope.ts (EDGES, assertCanReach); apps/erp/tests/db/messaging-scope.test.ts |

##### TC-771 — Cross-center isolation
| Field | Description |
|---|---|
| Test Case ID | TC-771 |
| Requirement ID | FR-359 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Cross-center isolation |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Matrix passes. |
| Test Data | center_admin of center A, student rostered only in center B |
| Steps | 1. POST conversation to that student |
| Expected Result | 403 `forbidden`; student absent from contacts |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-scope.ts (EDGES, assertCanReach); apps/erp/tests/db/messaging-scope.test.ts |

##### TC-772 — center_accountant reaches nobody
| Field | Description |
|---|---|
| Test Case ID | TC-772 |
| Requirement ID | FR-359 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | center_accountant reaches nobody |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Matrix passes. |
| Test Data | center_staff with sub-role center_accountant |
| Steps | 1. GET contacts 2. POST conversation to any student |
| Expected Result | contacts empty; POST 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-scope.ts (EDGES, assertCanReach); apps/erp/tests/db/messaging-scope.test.ts |

##### TC-773 — Minor with only guardian phone stays locked
| Field | Description |
|---|---|
| Test Case ID | TC-773 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Minor with only guardian phone stays locked |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Student profile exists. |
| Test Data | minor student with guardianPhone set, no guardianEmail, no parent link |
| Steps | 1. Teacher POST /api/v1/messages/conversations to the student 2. student GET contacts |
| Expected Result | Teacher denied; student contacts contain no adults |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-774 — Adding guardian email unlocks
| Field | Description |
|---|---|
| Test Case ID | TC-774 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Adding guardian email unlocks |
| Test Type | Workflow |
| Priority | Critical |
| Preconditions | Student profile exists. |
| Test Data | locked minor student |
| Steps | 1. POST /api/v1/me/guardian-contact {guardianEmail:'g@example.com'} as the student 2. retry teacher POST |
| Expected Result | Second attempt succeeds without verification; student contacts now list teachers |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-775 — Verified adult is never locked
| Field | Description |
|---|---|
| Test Case ID | TC-775 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Verified adult is never locked |
| Test Type | Security |
| Priority | High |
| Preconditions | Student profile exists. |
| Test Data | student with dateOfBirth, dateOfBirthVerifiedAt and age 18 or more |
| Steps | 1. Teacher POST conversation |
| Expected Result | Allowed, no guardian email needed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-776 — Approved parent with email counts as channel
| Field | Description |
|---|---|
| Test Case ID | TC-776 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Approved parent with email counts as channel |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student profile exists. |
| Test Data | minor student with approved parent link whose parent has email |
| Steps | 1. Teacher POST conversation |
| Expected Result | Allowed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-777 — Parent with no email does not count
| Field | Description |
|---|---|
| Test Case ID | TC-777 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Parent with no email does not count |
| Test Type | Security |
| Priority | High |
| Preconditions | Student profile exists. |
| Test Data | minor student linked to a parent with null email |
| Steps | 1. Teacher POST conversation |
| Expected Result | Denied |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-778 — Account is not suspended by the lock
| Field | Description |
|---|---|
| Test Case ID | TC-778 |
| Requirement ID | FR-360 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Account is not suspended by the lock |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student profile exists. |
| Test Data | locked minor |
| Steps | 1. Login and GET /api/v1/auth/session or dashboard |
| Expected Result | Login works; users.status unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-guardian.ts; chat-scope.ts ~695, ~799; chat-groups.ts assertGroupAccess; docs/decisions/email-invites-guardian.md; apps/erp/tests/db/invite-claim.test.ts:364,378,545 |

##### TC-779 — Age exactly 18 on boundary day
| Field | Description |
|---|---|
| Test Case ID | TC-779 |
| Requirement ID | FR-361 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Age exactly 18 on boundary day |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | n/a |
| Test Data | student DOB exactly 18 years before today (UTC) verified; another one day short of 18 |
| Steps | 1. Check conversation start with each |
| Expected Result | 18th birthday day is adult (not minor); day before is minor |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-minors.ts; docs/decisions/messaging.md |

##### TC-780 — Unverified DOB 30 years old is a minor
| Field | Description |
|---|---|
| Test Case ID | TC-780 |
| Requirement ID | FR-361 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unverified DOB 30 years old is a minor |
| Test Type | Security |
| Priority | Critical |
| Preconditions | n/a |
| Test Data | student with DOB 30 years ago but dateOfBirthVerifiedAt null |
| Steps | 1. Check lock and oversight |
| Expected Result | Treated as minor: lock applies, parent oversight stays active |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat-minors.ts; docs/decisions/messaging.md |

##### TC-781 — Send bucket exhaustion and refill
| Field | Description |
|---|---|
| Test Case ID | TC-781 |
| Requirement ID | FR-362 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Send bucket exhaustion and refill |
| Test Type | Boundary |
| Priority | High |
| Preconditions | n/a |
| Test Data | one user |
| Steps | 1. Send 30 quickly, 31st, wait 60 s, send again |
| Expected Result | 31st 429; after a minute about 20 tokens refilled so sends pass |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat.ts (RATE_LIMITS); chat-groups.ts |

##### TC-782 — Group bucket is per group and user
| Field | Description |
|---|---|
| Test Case ID | TC-782 |
| Requirement ID | FR-362 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Group bucket is per group and user |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | teacher in two groups |
| Steps | 1. Post 10 in group 1 then 1 in group 2 |
| Expected Result | Group 2 post succeeds (separate key) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat.ts (RATE_LIMITS); chat-groups.ts |

##### TC-783 — clientId 64 vs 65 characters
| Field | Description |
|---|---|
| Test Case ID | TC-783 |
| Requirement ID | FR-363 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | clientId 64 vs 65 characters |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | existing conversation |
| Steps | 1. POST with 64-char then 65-char clientId |
| Expected Result | 64 accepted; 65 rejected 400 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat.ts; apps/api/src/routes/v1/messages/route.ts |

##### TC-784 — Parallel duplicate sends
| Field | Description |
|---|---|
| Test Case ID | TC-784 |
| Requirement ID | FR-363 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Parallel duplicate sends |
| Test Type | Concurrency |
| Priority | High |
| Preconditions | n/a |
| Test Data | existing conversation |
| Steps | 1. Send same clientId from two requests simultaneously |
| Expected Result | exactly one row; both responses carry the same message id |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/messages/chat.ts; apps/api/src/routes/v1/messages/route.ts |

##### TC-785 — Block then second block is idempotent
| Field | Description |
|---|---|
| Test Case ID | TC-785 |
| Requirement ID | FR-364 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Block then second block is idempotent |
| Test Type | Functional |
| Priority | High |
| Preconditions | Target user exists and not deleted. |
| Test Data | users A and B |
| Steps | 1. POST block twice |
| Expected Result | Both succeed; one block row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:23; chat-safety.ts blockUser |

##### TC-786 — Self block refused
| Field | Description |
|---|---|
| Test Case ID | TC-786 |
| Requirement ID | FR-364 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Self block refused |
| Test Type | Negative |
| Priority | High |
| Preconditions | Target user exists and not deleted. |
| Test Data | user A |
| Steps | 1. POST block {blockedUserId:<A>} |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:23; chat-safety.ts blockUser |

##### TC-787 — Block a deleted or unknown user
| Field | Description |
|---|---|
| Test Case ID | TC-787 |
| Requirement ID | FR-364 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Block a deleted or unknown user |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Target user exists and not deleted. |
| Test Data | user A |
| Steps | 1. POST block with random uuid |
| Expected Result | 404 `not_found` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:23; chat-safety.ts blockUser |

##### TC-788 — Block confirm text
| Field | Description |
|---|---|
| Test Case ID | TC-788 |
| Requirement ID | FR-364 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Block confirm text |
| Test Type | UI |
| Priority | Low |
| Preconditions | Target user exists and not deleted. |
| Test Data | chat open |
| Steps | 1. Click Block |
| Expected Result | dialog text 'Block {name}? Neither of you will be able to send new messages. Your existing conversation is kept, and it stays visible to platform staff.' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:23; chat-safety.ts blockUser |

##### TC-789 — Unblock restores messaging
| Field | Description |
|---|---|
| Test Case ID | TC-789 |
| Requirement ID | FR-365 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unblock restores messaging |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Block exists. |
| Test Data | A blocked B |
| Steps | 1. DELETE block as A 2. A sends to B |
| Expected Result | send succeeds |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:35; chat-safety.ts |

##### TC-790 — Reverse block remains
| Field | Description |
|---|---|
| Test Case ID | TC-790 |
| Requirement ID | FR-365 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Reverse block remains |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Block exists. |
| Test Data | A blocked B and B blocked A |
| Steps | 1. A unblocks B 2. A sends |
| Expected Result | still blocked because of B's block (pair check is symmetric) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:35; chat-safety.ts |

##### TC-791 — List shows only own blocks
| Field | Description |
|---|---|
| Test Case ID | TC-791 |
| Requirement ID | FR-366 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | List shows only own blocks |
| Test Type | Authorization |
| Priority | Low |
| Preconditions | Session. |
| Test Data | A blocked B; C blocked D |
| Steps | 1. GET blocks as A |
| Expected Result | only A's block present |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/blocks/route.ts:12; chat-safety.ts listMyBlocks |

##### TC-792 — Blocker and blocked both refused
| Field | Description |
|---|---|
| Test Case ID | TC-792 |
| Requirement ID | FR-367 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Blocker and blocked both refused |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Block exists. |
| Test Data | A blocked B |
| Steps | 1. A sends to B 2. B sends to A in the existing conversation |
| Expected Result | both 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts isBlockedPair; chat.ts appendMessage; apps/erp/tests/db/messaging-scope.test.ts |

##### TC-793 — Block does not delete history
| Field | Description |
|---|---|
| Test Case ID | TC-793 |
| Requirement ID | FR-367 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Block does not delete history |
| Test Type | Functional |
| Priority | High |
| Preconditions | Block exists. |
| Test Data | same |
| Steps | 1. GET thread as A |
| Expected Result | previous messages still returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts isBlockedPair; chat.ts appendMessage; apps/erp/tests/db/messaging-scope.test.ts |

##### TC-794 — Participant files a harassment report
| Field | Description |
|---|---|
| Test Case ID | TC-794 |
| Requirement ID | FR-368 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Participant files a harassment report |
| Test Type | Functional |
| Priority | High |
| Preconditions | Participant (conversation) or member (group). |
| Test Data | A and B conversation |
| Steps | 1. POST reports {conversationId, category:'harassment', details:'x'} |
| Expected Result | 201; report row with reportedUserId=B, involvesMinor reflecting minors |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/reports/route.ts:27; chat-safety.ts fileReport |

##### TC-795 — Non participant cannot report a conversation
| Field | Description |
|---|---|
| Test Case ID | TC-795 |
| Requirement ID | FR-368 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Non participant cannot report a conversation |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Participant (conversation) or member (group). |
| Test Data | user C |
| Steps | 1. POST reports {conversationId:<A-B>} |
| Expected Result | 403 `forbidden`; no row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/reports/route.ts:27; chat-safety.ts fileReport |

##### TC-796 — Forged reportedUserId
| Field | Description |
|---|---|
| Test Case ID | TC-796 |
| Requirement ID | FR-368 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Forged reportedUserId |
| Test Type | Security |
| Priority | High |
| Preconditions | Participant (conversation) or member (group). |
| Test Data | user A in conversation with B |
| Steps | 1. POST reports {conversationId, reportedUserId:<C>} |
| Expected Result | Expected: rejected. Code reading: accepted, report names C (RISK, see gaps) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/reports/route.ts:27; chat-safety.ts fileReport |

##### TC-797 — details 2001 chars
| Field | Description |
|---|---|
| Test Case ID | TC-797 |
| Requirement ID | FR-368 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | details 2001 chars |
| Test Type | Boundary |
| Priority | Low |
| Preconditions | Participant (conversation) or member (group). |
| Test Data | any |
| Steps | 1. POST reports with 2001-char details |
| Expected Result | Stored cut to 2000 or rejected; record actual |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/reports/route.ts:27; chat-safety.ts fileReport |

##### TC-798 — Teacher blocks minor student
| Field | Description |
|---|---|
| Test Case ID | TC-798 |
| Requirement ID | FR-369 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher blocks minor student |
| Test Type | Functional |
| Priority | High |
| Preconditions | Blocker is an adult role; target is a minor student. |
| Test Data | teacher and minor student |
| Steps | 1. POST blocks as teacher |
| Expected Result | 201 with flaggedAdultBlockingMinor true; a safety_concern report exists, involvesMinor true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts blockUser; chat-minors.ts |

##### TC-799 — Teacher blocks verified adult student
| Field | Description |
|---|---|
| Test Case ID | TC-799 |
| Requirement ID | FR-369 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher blocks verified adult student |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Blocker is an adult role; target is a minor student. |
| Test Data | teacher and verified 18+ student |
| Steps | 1. POST blocks |
| Expected Result | flaggedAdultBlockingMinor false; no auto report |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts blockUser; chat-minors.ts |

##### TC-800 — Parent blocks a minor student
| Field | Description |
|---|---|
| Test Case ID | TC-800 |
| Requirement ID | FR-369 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Parent blocks a minor student |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Blocker is an adult role; target is a minor student. |
| Test Data | parent and student |
| Steps | 1. POST blocks as parent |
| Expected Result | Record actual: code flags only adult roles (PO question) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts blockUser; chat-minors.ts |

##### TC-801 — Report notifies every active super_admin
| Field | Description |
|---|---|
| Test Case ID | TC-801 |
| Requirement ID | FR-370 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Report notifies every active super_admin |
| Test Type | Integration |
| Priority | Medium |
| Preconditions | Report filed. |
| Test Data | 2 active super_admins, 1 suspended |
| Steps | 1. File a report |
| Expected Result | notifications rows for the 2 active only |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-safety.ts; services/notifications/notify.ts |

##### TC-802 — Teacher creates course group
| Field | Description |
|---|---|
| Test Case ID | TC-802 |
| Requirement ID | FR-371 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher creates course group |
| Test Type | Functional |
| Priority | High |
| Preconditions | Caller on teaching side of the course or center admin/manager. |
| Test Data | teacher hossam.aziz@nile-academy.eg with a course |
| Steps | 1. POST groups {kind:'course', courseId, title} |
| Expected Result | 201; members equal enrolled students, their parents and teaching side |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/route.ts:30; chat-groups.ts createGroup |

##### TC-803 — Student cannot create group
| Field | Description |
|---|---|
| Test Case ID | TC-803 |
| Requirement ID | FR-371 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Student cannot create group |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Caller on teaching side of the course or center admin/manager. |
| Test Data | student |
| Steps | 1. POST groups |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/route.ts:30; chat-groups.ts createGroup |

##### TC-804 — center_staff non-manager cannot create
| Field | Description |
|---|---|
| Test Case ID | TC-804 |
| Requirement ID | FR-371 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | center_staff non-manager cannot create |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Caller on teaching side of the course or center admin/manager. |
| Test Data | receptionist staff |
| Steps | 1. POST groups kind center_announcement |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/route.ts:30; chat-groups.ts createGroup |

##### TC-805 — Title longer than 200
| Field | Description |
|---|---|
| Test Case ID | TC-805 |
| Requirement ID | FR-371 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Title longer than 200 |
| Test Type | Boundary |
| Priority | Low |
| Preconditions | Caller on teaching side of the course or center admin/manager. |
| Test Data | teacher |
| Steps | 1. POST with 201-char title |
| Expected Result | cut to 200 or rejected; record actual |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/route.ts:30; chat-groups.ts createGroup |

##### TC-806 — Only memberships listed
| Field | Description |
|---|---|
| Test Case ID | TC-806 |
| Requirement ID | FR-372 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Only memberships listed |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | two groups, user in one |
| Steps | 1. GET groups |
| Expected Result | one group returned |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/route.ts:8; chat-groups.ts listGroupsForUser |

##### TC-807 — Non member cannot read group
| Field | Description |
|---|---|
| Test Case ID | TC-807 |
| Requirement ID | FR-373 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Non member cannot read group |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Member. |
| Test Data | user outside group |
| Steps | 1. GET groups/{id} |
| Expected Result | 403/404 and no bodies |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/route.ts:10 |

##### TC-808 — Teacher posts, student cannot (owner_only)
| Field | Description |
|---|---|
| Test Case ID | TC-808 |
| Requirement ID | FR-374 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Teacher posts, student cannot (owner_only) |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Member; group active; post allowed. |
| Test Data | owner_only group |
| Steps | 1. teacher POST 2. student POST |
| Expected Result | teacher 200; student 403 with message 'Only the teacher and their team can post in this channel' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/route.ts:29; chat-groups.ts postGroupMessage/assertGroupAccess |

##### TC-809 — Archived channel is read-only
| Field | Description |
|---|---|
| Test Case ID | TC-809 |
| Requirement ID | FR-374 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Archived channel is read-only |
| Test Type | Functional |
| Priority | High |
| Preconditions | Member; group active; post allowed. |
| Test Data | archived group |
| Steps | 1. teacher POST |
| Expected Result | 403 'This channel is archived' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/route.ts:29; chat-groups.ts postGroupMessage/assertGroupAccess |

##### TC-810 — Locked minor in members-post group
| Field | Description |
|---|---|
| Test Case ID | TC-810 |
| Requirement ID | FR-374 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Locked minor in members-post group |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Member; group active; post allowed. |
| Test Data | postPolicy members; locked minor student |
| Steps | 1. student POST |
| Expected Result | refused; REST status recorded (predicted 500) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/route.ts:29; chat-groups.ts postGroupMessage/assertGroupAccess |

##### TC-811 — Muted member gets no notification but unread counts
| Field | Description |
|---|---|
| Test Case ID | TC-811 |
| Requirement ID | FR-374 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Muted member gets no notification but unread counts |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Member; group active; post allowed. |
| Test Data | member muted |
| Steps | 1. teacher posts |
| Expected Result | no chat_group_message for muted member; their unread increments |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/route.ts:29; chat-groups.ts postGroupMessage/assertGroupAccess |

##### TC-812 — New enrollment adds student to group
| Field | Description |
|---|---|
| Test Case ID | TC-812 |
| Requirement ID | FR-375 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | New enrollment adds student to group |
| Test Type | Integration |
| Priority | High |
| Preconditions | Group exists. |
| Test Data | course group exists |
| Steps | 1. Enrol a new student in the course 2. GET groups as that student |
| Expected Result | group listed (record whether immediate; trigger point UNKNOWN) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-groups.ts deriveMembers/syncGroupMembers |

##### TC-813 — Unenrolled student removed
| Field | Description |
|---|---|
| Test Case ID | TC-813 |
| Requirement ID | FR-375 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unenrolled student removed |
| Test Type | Integration |
| Priority | High |
| Preconditions | Group exists. |
| Test Data | student in group |
| Steps | 1. Remove enrollment 2. GET groups/{id} |
| Expected Result | access removed once synced |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-groups.ts deriveMembers/syncGroupMembers |

##### TC-814 — Mute then post
| Field | Description |
|---|---|
| Test Case ID | TC-814 |
| Requirement ID | FR-376 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mute then post |
| Test Type | Functional |
| Priority | Low |
| Preconditions | Member. |
| Test Data | member |
| Steps | 1. mute 2. teacher posts |
| Expected Result | no push/in-app notification; unread increments |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/mute/route.ts:8 |

##### TC-815 — Group read clears unread
| Field | Description |
|---|---|
| Test Case ID | TC-815 |
| Requirement ID | FR-377 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Group read clears unread |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Member. |
| Test Data | 3 unread posts |
| Steps | 1. POST read 2. GET groups |
| Expected Result | unread 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/groups/[id]/read/route.ts:6 |

##### TC-816 — Only approved links are listed
| Field | Description |
|---|---|
| Test Case ID | TC-816 |
| Requirement ID | FR-378 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Only approved links are listed |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Parent session. |
| Test Data | parent with one approved and one pending link |
| Steps | 1. GET children |
| Expected Result | one child |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/parent/oversight/children/route.ts:6; chat-oversight.ts |

##### TC-817 — Non parent forbidden
| Field | Description |
|---|---|
| Test Case ID | TC-817 |
| Requirement ID | FR-378 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Non parent forbidden |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Parent session. |
| Test Data | teacher |
| Steps | 1. GET children |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/parent/oversight/children/route.ts:6; chat-oversight.ts |

##### TC-818 — Parent cannot read an unlinked student
| Field | Description |
|---|---|
| Test Case ID | TC-818 |
| Requirement ID | FR-379 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Parent cannot read an unlinked student |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Approved link and child is a minor. |
| Test Data | parent without link |
| Steps | 1. GET oversight conversations of any student |
| Expected Result | 403 'You are not the approved parent of this student' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-oversight.ts; apps/api/src/routes/v1/parent/oversight/children/[studentId]/conversations/route.ts:6 |

##### TC-819 — Verified adult child is private
| Field | Description |
|---|---|
| Test Case ID | TC-819 |
| Requirement ID | FR-379 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Verified adult child is private |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Approved link and child is a minor. |
| Test Data | linked child, verified 18+ |
| Steps | 1. GET conversations |
| Expected Result | 403 'This student is a verified adult; their conversations are private' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-oversight.ts; apps/api/src/routes/v1/parent/oversight/children/[studentId]/conversations/route.ts:6 |

##### TC-820 — Thread read
| Field | Description |
|---|---|
| Test Case ID | TC-820 |
| Requirement ID | FR-380 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Thread read |
| Test Type | Functional |
| Priority | High |
| Preconditions | Approved link, minor child, adult counterpart. |
| Test Data | linked parent, child thread with teacher |
| Steps | 1. GET oversight thread |
| Expected Result | 200 messages |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/parent/oversight/children/[studentId]/conversations/[id]/route.ts:6 |

##### TC-821 — Other child's conversation id
| Field | Description |
|---|---|
| Test Case ID | TC-821 |
| Requirement ID | FR-380 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Other child's conversation id |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Approved link, minor child, adult counterpart. |
| Test Data | parent with two children; conversation of child 2 |
| Steps | 1. GET /children/{child1}/conversations/{child2 thread} |
| Expected Result | 403/404, no bodies |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/parent/oversight/children/[studentId]/conversations/[id]/route.ts:6 |

##### TC-822 — Banner shown to both sides
| Field | Description |
|---|---|
| Test Case ID | TC-822 |
| Requirement ID | FR-381 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Banner shown to both sides |
| Test Type | UI |
| Priority | High |
| Preconditions | Open thread with a minor. |
| Test Data | thread teacher-minor with approved parent |
| Steps | 1. Open as teacher then as student |
| Expected Result | exact strings shown |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-oversight.ts oversightNoticeFor; i18n chat.oversightBanner |

##### TC-823 — No banner when the child is a verified adult
| Field | Description |
|---|---|
| Test Case ID | TC-823 |
| Requirement ID | FR-381 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | No banner when the child is a verified adult |
| Test Type | UI |
| Priority | High |
| Preconditions | Open thread with a minor. |
| Test Data | thread teacher with verified 18+ student |
| Steps | 1. Open thread as teacher |
| Expected Result | no oversight banner (monitored=false) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat-oversight.ts oversightNoticeFor; i18n chat.oversightBanner |

##### TC-824 — Token claims and expiry
| Field | Description |
|---|---|
| Test Case ID | TC-824 |
| Requirement ID | FR-382 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Token claims and expiry |
| Test Type | API |
| Priority | Critical |
| Preconditions | Session. |
| Test Data | logged in user |
| Steps | 1. GET realtime/token 2. decode |
| Expected Result | aud edura-realtime, iss edura, sub = user id, exp minus iat = 60 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/realtime/token/route.ts:7; server-core realtime token |

##### TC-825 — No session no token
| Field | Description |
|---|---|
| Test Case ID | TC-825 |
| Requirement ID | FR-382 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | No session no token |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Session. |
| Test Data | none |
| Steps | 1. GET realtime/token without cookie |
| Expected Result | 401 `unauthenticated` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/realtime/token/route.ts:7; server-core realtime token |

##### TC-826 — Invalid and expired token rejected
| Field | Description |
|---|---|
| Test Case ID | TC-826 |
| Requirement ID | FR-383 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Invalid and expired token rejected |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Token from FR-382. |
| Test Data | none |
| Steps | 1. Connect with garbage token 2. connect with token older than 60 s |
| Expected Result | both rejected |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts io.use |

##### TC-827 — Connection survives expiry
| Field | Description |
|---|---|
| Test Case ID | TC-827 |
| Requirement ID | FR-383 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Connection survives expiry |
| Test Type | Security |
| Priority | High |
| Preconditions | Token from FR-382. |
| Test Data | connected socket |
| Steps | 1. wait over 60 s then send |
| Expected Result | still works (known behaviour); suspending the user does not disconnect |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts io.use |

##### TC-828 — Internal endpoint rejects bad secret
| Field | Description |
|---|---|
| Test Case ID | TC-828 |
| Requirement ID | FR-384 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Internal endpoint rejects bad secret |
| Test Type | Security |
| Priority | Critical |
| Preconditions | INTERNAL secret configured. |
| Test Data | none |
| Steps | 1. POST /internal/message without header, with wrong header |
| Expected Result | 401 both |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/internal.ts; packages/server-core realtime-bridge.ts |

##### TC-829 — healthz
| Field | Description |
|---|---|
| Test Case ID | TC-829 |
| Requirement ID | FR-384 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | healthz |
| Test Type | API |
| Priority | Low |
| Preconditions | INTERNAL secret configured. |
| Test Data | none |
| Steps | 1. GET /healthz |
| Expected Result | {ok:true, online:<n>} |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/internal.ts; packages/server-core realtime-bridge.ts |

##### TC-830 — REST send reaches online recipient
| Field | Description |
|---|---|
| Test Case ID | TC-830 |
| Requirement ID | FR-384 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | REST send reaches online recipient |
| Test Type | Integration |
| Priority | High |
| Preconditions | INTERNAL secret configured. |
| Test Data | recipient socket connected |
| Steps | 1. REST POST /api/v1/messages |
| Expected Result | recipient gets message:new; message becomes delivered |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/internal.ts; packages/server-core realtime-bridge.ts |

##### TC-831 — Offline recipient connects
| Field | Description |
|---|---|
| Test Case ID | TC-831 |
| Requirement ID | FR-385 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Offline recipient connects |
| Test Type | Integration |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | B offline; A sends |
| Steps | 1. B connects |
| Expected Result | A receives message:delivered |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/realtime/src/server.ts |

##### TC-832 — Secret required
| Field | Description |
|---|---|
| Test Case ID | TC-832 |
| Requirement ID | FR-386 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Secret required |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Recipient offline. |
| Test Data | none |
| Steps | 1. POST /api/v1/internal/chat-notify without and with wrong secret |
| Expected Result | 401 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/internal/chat-notify/route.ts:15; apps/api/tests/unit/route-internal-chat-notify.test.ts |

##### TC-833 — Truncation boundary
| Field | Description |
|---|---|
| Test Case ID | TC-833 |
| Requirement ID | FR-386 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Truncation boundary |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Recipient offline. |
| Test Data | message of 120 and 121 chars |
| Steps | 1. trigger chat-notify |
| Expected Result | 120 untouched; 121 body is 117 chars plus ellipsis |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/internal/chat-notify/route.ts:15; apps/api/tests/unit/route-internal-chat-notify.test.ts |

##### TC-834 — Unread count after mark read
| Field | Description |
|---|---|
| Test Case ID | TC-834 |
| Requirement ID | FR-387 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Unread count after mark read |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | 3 unread notifications |
| Steps | 1. POST notifications/{id}/read 2. GET /me/unread-counts |
| Expected Result | count should drop by 1 (code reading predicts it does not) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/unread-counts/route.ts:6; services getUnreadCounts; apps/erp/tests/db/unread-counts.test.ts |

##### TC-835 — Channel matrix per type
| Field | Description |
|---|---|
| Test Case ID | TC-835 |
| Requirement ID | FR-388 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Channel matrix per type |
| Test Type | Integration |
| Priority | High |
| Preconditions | Type is in CHANNEL_MATRIX. |
| Test Data | trigger new_chat_message, session_cancelled, password_reset_requested, invite_code_sent |
| Steps | 1. Fire each type to an enabled user |
| Expected Result | in-app/push/email/sms exactly as the matrix says |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/notifications/notify.ts; apps/erp/tests/unit/notifications.test.ts |

##### TC-836 — Failure of one channel does not block others
| Field | Description |
|---|---|
| Test Case ID | TC-836 |
| Requirement ID | FR-388 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Failure of one channel does not block others |
| Test Type | Integration |
| Priority | High |
| Preconditions | Type is in CHANNEL_MATRIX. |
| Test Data | email provider failing |
| Steps | 1. fire a type with inapp+email |
| Expected Result | in-app row exists; no exception to caller |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/notifications/notify.ts; apps/erp/tests/unit/notifications.test.ts |

##### TC-837 — Own rows only
| Field | Description |
|---|---|
| Test Case ID | TC-837 |
| Requirement ID | FR-389 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Own rows only |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Session. |
| Test Data | two users with notifications |
| Steps | 1. GET /api/v1/notifications as user 1 |
| Expected Result | no row of user 2 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/route.ts:7; services/notifications listNotifications |

##### TC-838 — Filter by read=false and pagination
| Field | Description |
|---|---|
| Test Case ID | TC-838 |
| Requirement ID | FR-389 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Filter by read=false and pagination |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session. |
| Test Data | user with over 20 notifications |
| Steps | 1. GET ?read=false  2. GET ?limit=101 |
| Expected Result | unread only; limit 101 clamped to 100 or rejected; default 20 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/route.ts:7; services/notifications listNotifications |

##### TC-839 — Mark own
| Field | Description |
|---|---|
| Test Case ID | TC-839 |
| Requirement ID | FR-390 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mark own |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Row belongs to caller. |
| Test Data | unread notification |
| Steps | 1. POST read |
| Expected Result | 200; GET shows read=true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/[id]/read/route.ts:6 |

##### TC-840 — Mark someone else's
| Field | Description |
|---|---|
| Test Case ID | TC-840 |
| Requirement ID | FR-390 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mark someone else's |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Row belongs to caller. |
| Test Data | notification of user 2 |
| Steps | 1. POST read as user 1 |
| Expected Result | 404 `not_found`; row unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/[id]/read/route.ts:6 |

##### TC-841 — Read-all affects only caller
| Field | Description |
|---|---|
| Test Case ID | TC-841 |
| Requirement ID | FR-391 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Read-all affects only caller |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | two users with unread |
| Steps | 1. POST read-all as user 1 |
| Expected Result | user 1 all read; user 2 untouched; response updated = user 1 count |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/read-all/route.ts:6 |

##### TC-842 — Center broadcast reaches enrolled students and parents
| Field | Description |
|---|---|
| Test Case ID | TC-842 |
| Requirement ID | FR-392 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Center broadcast reaches enrolled students and parents |
| Test Type | Functional |
| Priority | High |
| Preconditions | Caller is center_admin. |
| Test Data | admin@nile-academy.eg |
| Steps | 1. POST broadcast {scope:'center', title:'T', body:'B'} |
| Expected Result | recipients are students and parents with active enrollments in this center only |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/broadcast/route.ts:15 |

##### TC-843 — Role restriction
| Field | Description |
|---|---|
| Test Case ID | TC-843 |
| Requirement ID | FR-392 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Role restriction |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Caller is center_admin. |
| Test Data | teacher and center_staff |
| Steps | 1. POST broadcast |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/broadcast/route.ts:15 |

##### TC-844 — Course scope without courseId
| Field | Description |
|---|---|
| Test Case ID | TC-844 |
| Requirement ID | FR-392 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Course scope without courseId |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Caller is center_admin. |
| Test Data | center_admin |
| Steps | 1. POST broadcast {scope:'course', title, body} |
| Expected Result | Expected 400 `validation_error`; code predicts 500 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/broadcast/route.ts:15 |

##### TC-845 — Course of another center
| Field | Description |
|---|---|
| Test Case ID | TC-845 |
| Requirement ID | FR-392 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Course of another center |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Caller is center_admin. |
| Test Data | center_admin of center A; courseId of center B |
| Steps | 1. POST broadcast scope course |
| Expected Result | no recipients from center B (record actual: scoping of courseId not verified) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/notifications/broadcast/route.ts:15 |

##### TC-846 — Deep link per role
| Field | Description |
|---|---|
| Test Case ID | TC-846 |
| Requirement ID | FR-393 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Deep link per role |
| Test Type | UI |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | new_chat_message for student and teacher |
| Steps | 1. click the notification |
| Expected Result | student lands on /dashboard/student/messages, teacher on /dashboard/teacher/messages |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/shared deep-link notificationUrlForRole; apps/erp/tests/unit/notification-deep-link.test.ts |

##### TC-847 — Register and replace
| Field | Description |
|---|---|
| Test Case ID | TC-847 |
| Requirement ID | FR-394 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Register and replace |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session; browser permission granted. |
| Test Data | user A |
| Steps | 1. POST subscription twice with same endpoint |
| Expected Result | one row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/push-subscription/route.ts:19; apps/erp/tests/db/push-registration-ownership.test.ts |

##### TC-848 — Takeover by second user
| Field | Description |
|---|---|
| Test Case ID | TC-848 |
| Requirement ID | FR-394 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Takeover by second user |
| Test Type | Security |
| Priority | High |
| Preconditions | Session; browser permission granted. |
| Test Data | endpoint registered by A |
| Steps | 1. B POSTs the same endpoint |
| Expected Result | row now belongs to B (documented behaviour); A no longer receives |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/push-subscription/route.ts:19; apps/erp/tests/db/push-registration-ownership.test.ts |

##### TC-849 — Arbitrary endpoint accepted
| Field | Description |
|---|---|
| Test Case ID | TC-849 |
| Requirement ID | FR-394 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Arbitrary endpoint accepted |
| Test Type | Security |
| Priority | High |
| Preconditions | Session; browser permission granted. |
| Test Data | user |
| Steps | 1. POST endpoint https://example.org/x |
| Expected Result | Accepted today (RISK: server will call it on push) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/push-subscription/route.ts:19; apps/erp/tests/db/push-registration-ownership.test.ts |

##### TC-850 — Delete own
| Field | Description |
|---|---|
| Test Case ID | TC-850 |
| Requirement ID | FR-395 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Delete own |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Subscription exists. |
| Test Data | subscription |
| Steps | 1. DELETE |
| Expected Result | 200; row gone |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/push-subscription/route.ts:36 |

##### TC-851 — Delete someone else's endpoint
| Field | Description |
|---|---|
| Test Case ID | TC-851 |
| Requirement ID | FR-395 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Delete someone else's endpoint |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Subscription exists. |
| Test Data | endpoint of user A |
| Steps | 1. B DELETE |
| Expected Result | 404; A's row remains |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/push-subscription/route.ts:36 |

##### TC-852 — Register token
| Field | Description |
|---|---|
| Test Case ID | TC-852 |
| Requirement ID | FR-396 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Register token |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | user |
| Steps | 1. POST device-tokens {token:'t1'} |
| Expected Result | 200; row exists |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/device-tokens/route.ts:13 |

##### TC-853 — Token takeover
| Field | Description |
|---|---|
| Test Case ID | TC-853 |
| Requirement ID | FR-396 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Token takeover |
| Test Type | Security |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | token t1 of A |
| Steps | 1. B POSTs t1 |
| Expected Result | row belongs to B |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/device-tokens/route.ts:13 |

##### TC-854 — Delete foreign token
| Field | Description |
|---|---|
| Test Case ID | TC-854 |
| Requirement ID | FR-397 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Delete foreign token |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | Token exists. |
| Test Data | token of A |
| Steps | 1. B DELETE |
| Expected Result | 404; row remains |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/device-tokens/[token]/route.ts:6 |

##### TC-855 — Gone endpoint cleaned
| Field | Description |
|---|---|
| Test Case ID | TC-855 |
| Requirement ID | FR-398 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Gone endpoint cleaned |
| Test Type | Integration |
| Priority | Medium |
| Preconditions | VAPID/Firebase configured, or PUSH_MODE=mock. |
| Test Data | subscription whose endpoint returns 410 |
| Steps | 1. trigger a push |
| Expected Result | row deleted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services webpush/fcm/push |

##### TC-856 — Mock mode sends nothing
| Field | Description |
|---|---|
| Test Case ID | TC-856 |
| Requirement ID | FR-398 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mock mode sends nothing |
| Test Type | Functional |
| Priority | Low |
| Preconditions | VAPID/Firebase configured, or PUSH_MODE=mock. |
| Test Data | PUSH_MODE=mock |
| Steps | 1. trigger a push |
| Expected Result | no external call; no error |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services webpush/fcm/push |

##### TC-857 — SMS in console mode
| Field | Description |
|---|---|
| Test Case ID | TC-857 |
| Requirement ID | FR-399 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | SMS in console mode |
| Test Type | Integration |
| Priority | Medium |
| Preconditions | Recipient has phone. |
| Test Data | session_cancelled |
| Steps | 1. fire it |
| Expected Result | log line only; no external SMS; no exception |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services sms |

##### TC-858 — Mock send logs a row
| Field | Description |
|---|---|
| Test Case ID | TC-858 |
| Requirement ID | FR-400 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mock send logs a row |
| Test Type | Integration |
| Priority | High |
| Preconditions | WHATSAPP_MODE mock (default) or live. |
| Test Data | WHATSAPP_MODE unset |
| Steps | 1. trigger walk-in welcome |
| Expected Result | whatsAppMessage row status sent with wamid.MOCK prefix; nothing delivered |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services whatsapp; docs/guides/whatsapp-templates.md; apps/superadmin/tests/db/whatsapp-log-disclosure.test.ts |

##### TC-859 — Live failure is logged
| Field | Description |
|---|---|
| Test Case ID | TC-859 |
| Requirement ID | FR-400 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Live failure is logged |
| Test Type | Integration |
| Priority | High |
| Preconditions | WHATSAPP_MODE mock (default) or live. |
| Test Data | WHATSAPP_MODE=live invalid token (test env) |
| Steps | 1. trigger send |
| Expected Result | row failed with error text; caller not crashed |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services whatsapp; docs/guides/whatsapp-templates.md; apps/superadmin/tests/db/whatsapp-log-disclosure.test.ts |

##### TC-860 — Phone variants
| Field | Description |
|---|---|
| Test Case ID | TC-860 |
| Requirement ID | FR-401 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Phone variants |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | none |
| Steps | 1. normalise 01012345678, +201012345678, 1012345678, Arabic-Indic digits, 01312345678, 0101234567 |
| Expected Result | first four give +201012345678; the last two invalid |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core services whatsapp |

##### TC-861 — Recipient order
| Field | Description |
|---|---|
| Test Case ID | TC-861 |
| Requirement ID | FR-402 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Recipient order |
| Test Type | Functional |
| Priority | High |
| Preconditions | Invite issued. |
| Test Data | student with parent email and guardian email |
| Steps | 1. issue invite |
| Expected Result | goes to parent account email |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core invite services; apps/erp/tests/db/invite-claim.test.ts |

##### TC-862 — Minor without any email
| Field | Description |
|---|---|
| Test Case ID | TC-862 |
| Requirement ID | FR-402 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Minor without any email |
| Test Type | Negative |
| Priority | High |
| Preconditions | Invite issued. |
| Test Data | minor, no parent, no guardian email |
| Steps | 1. issue invite |
| Expected Result | no recipient; no student own email used |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core invite services; apps/erp/tests/db/invite-claim.test.ts |

##### TC-863 — Console provider in production
| Field | Description |
|---|---|
| Test Case ID | TC-863 |
| Requirement ID | FR-403 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Console provider in production |
| Test Type | Functional |
| Priority | High |
| Preconditions | MAIL_PROVIDER set. |
| Test Data | MAIL_PROVIDER=console, NODE_ENV=production |
| Steps | 1. trigger any email |
| Expected Result | sent:false with the error 'Mail provider is console in production' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/mail; apps/api/tests/unit/m10-health-deep-mail.test.ts; apps/erp/tests/db/mail-password-reset.test.ts |

##### TC-864 — SMTP happy path
| Field | Description |
|---|---|
| Test Case ID | TC-864 |
| Requirement ID | FR-403 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | SMTP happy path |
| Test Type | Integration |
| Priority | High |
| Preconditions | MAIL_PROVIDER set. |
| Test Data | SMTP test server |
| Steps | 1. trigger welcome email |
| Expected Result | message captured; sent true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/mail; apps/api/tests/unit/m10-health-deep-mail.test.ts; apps/erp/tests/db/mail-password-reset.test.ts |

##### TC-865 — Default locale Arabic
| Field | Description |
|---|---|
| Test Case ID | TC-865 |
| Requirement ID | FR-404 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Default locale Arabic |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | n/a |
| Test Data | no locale given |
| Steps | 1. render welcome |
| Expected Result | Arabic content, dir rtl |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/notifications; apps/erp/tests/unit/notifications.test.ts |

##### TC-866 — No recipient
| Field | Description |
|---|---|
| Test Case ID | TC-866 |
| Requirement ID | FR-404 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | No recipient |
| Test Type | Negative |
| Priority | Low |
| Preconditions | n/a |
| Test Data | user without email |
| Steps | 1. send |
| Expected Result | status no_recipient |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/notifications; apps/erp/tests/unit/notifications.test.ts |

##### TC-867 — HTML escaping of names
| Field | Description |
|---|---|
| Test Case ID | TC-867 |
| Requirement ID | FR-405 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | HTML escaping of names |
| Test Type | Security |
| Priority | Medium |
| Preconditions | Invite issued. |
| Test Data | user named <script>x</script> |
| Steps | 1. send invite |
| Expected Result | name rendered escaped in html |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/mail/templates.ts; apps/erp/tests/db/m5-send-invite-ownership.test.ts |

##### TC-868 — Student sets guardian email
| Field | Description |
|---|---|
| Test Case ID | TC-868 |
| Requirement ID | FR-406 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Student sets guardian email |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student or approved parent. |
| Test Data | locked minor |
| Steps | 1. POST guardian-contact {guardianEmail:'g@example.com'} |
| Expected Result | 200; messagingLocked false; AuditLog row; center admins notified |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-contact/route.ts:21,28; services guardian-contact; apps/erp/tests/db/guardian-contact-access.test.ts |

##### TC-869 — Own email as guardian email refused
| Field | Description |
|---|---|
| Test Case ID | TC-869 |
| Requirement ID | FR-406 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Own email as guardian email refused |
| Test Type | Negative |
| Priority | High |
| Preconditions | Student or approved parent. |
| Test Data | student email s@x |
| Steps | 1. POST guardianEmail s@x |
| Expected Result | 400/422 refused |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-contact/route.ts:21,28; services guardian-contact; apps/erp/tests/db/guardian-contact-access.test.ts |

##### TC-870 — Parent without link
| Field | Description |
|---|---|
| Test Case ID | TC-870 |
| Requirement ID | FR-406 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Parent without link |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Student or approved parent. |
| Test Data | parent not linked |
| Steps | 1. POST with another studentId |
| Expected Result | 403 `forbidden` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-contact/route.ts:21,28; services guardian-contact; apps/erp/tests/db/guardian-contact-access.test.ts |

##### TC-871 — Phone only keeps lock
| Field | Description |
|---|---|
| Test Case ID | TC-871 |
| Requirement ID | FR-406 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Phone only keeps lock |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Student or approved parent. |
| Test Data | locked minor |
| Steps | 1. POST {guardianPhone:'01012345678'} |
| Expected Result | 200 but messagingLocked remains true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-contact/route.ts:21,28; services guardian-contact; apps/erp/tests/db/guardian-contact-access.test.ts |

##### TC-872 — Rate limit 10 per 10
| Field | Description |
|---|---|
| Test Case ID | TC-872 |
| Requirement ID | FR-406 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Rate limit 10 per 10 |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Student or approved parent. |
| Test Data | student |
| Steps | 1. POST 11 times fast |
| Expected Result | 11th 429 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-contact/route.ts:21,28; services guardian-contact; apps/erp/tests/db/guardian-contact-access.test.ts |

##### TC-873 — Cron auth
| Field | Description |
|---|---|
| Test Case ID | TC-873 |
| Requirement ID | FR-407 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Cron auth |
| Test Type | Security |
| Priority | Critical |
| Preconditions | CRON_SECRET; GitHub cron workflow daily 01:30 UTC. |
| Test Data | none |
| Steps | 1. POST cron job without and with wrong secret |
| Expected Result | 401 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/cron/[job]/route.ts:26-50; .github/workflows/cron.yml; services runGuardianContactReminders |

##### TC-874 — Reminder cadence
| Field | Description |
|---|---|
| Test Case ID | TC-874 |
| Requirement ID | FR-407 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Reminder cadence |
| Test Type | Functional |
| Priority | High |
| Preconditions | CRON_SECRET; GitHub cron workflow daily 01:30 UTC. |
| Test Data | locked minor |
| Steps | 1. run cron on day 0, 1, 3 |
| Expected Result | reminder day 0, none day 1, reminder day 3 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/cron/[job]/route.ts:26-50; .github/workflows/cron.yml; services runGuardianContactReminders |

##### TC-875 — Overdue escalation
| Field | Description |
|---|---|
| Test Case ID | TC-875 |
| Requirement ID | FR-407 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Overdue escalation |
| Test Type | Functional |
| Priority | High |
| Preconditions | CRON_SECRET; GitHub cron workflow daily 01:30 UTC. |
| Test Data | locked minor older than 14 days |
| Steps | 1. run cron |
| Expected Result | center admins notified |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/cron/[job]/route.ts:26-50; .github/workflows/cron.yml; services runGuardianContactReminders |

##### TC-876 — Request issues new token and voids old
| Field | Description |
|---|---|
| Test Case ID | TC-876 |
| Requirement ID | FR-408 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Request issues new token and voids old |
| Test Type | Functional |
| Priority | High |
| Preconditions | Student has guardian email. |
| Test Data | student with guardian email |
| Steps | 1. POST twice |
| Expected Result | first token no longer verifies; second does |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-verification/route.ts:13,18; apps/erp/tests/db/guardian-verification.test.ts |

##### TC-877 — Rate limit 5 per 60
| Field | Description |
|---|---|
| Test Case ID | TC-877 |
| Requirement ID | FR-408 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Rate limit 5 per 60 |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Student has guardian email. |
| Test Data | student |
| Steps | 1. POST 6 times |
| Expected Result | 6th 429 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-verification/route.ts:13,18; apps/erp/tests/db/guardian-verification.test.ts |

##### TC-878 — Only students
| Field | Description |
|---|---|
| Test Case ID | TC-878 |
| Requirement ID | FR-408 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Only students |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Student has guardian email. |
| Test Data | parent |
| Steps | 1. POST |
| Expected Result | 403 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/me/guardian-verification/route.ts:13,18; apps/erp/tests/db/guardian-verification.test.ts |

##### TC-879 — Valid token verifies
| Field | Description |
|---|---|
| Test Case ID | TC-879 |
| Requirement ID | FR-409 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Valid token verifies |
| Test Type | Functional |
| Priority | High |
| Preconditions | Valid unused unexpired token. |
| Test Data | fresh token |
| Steps | 1. POST verify |
| Expected Result | 200; verified true; audit row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/guardian/verify/route.ts; apps/erp/tests/unit/guardian-verification.test.ts |

##### TC-880 — Expired, reused and garbage tokens give the same message
| Field | Description |
|---|---|
| Test Case ID | TC-880 |
| Requirement ID | FR-409 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Expired, reused and garbage tokens give the same message |
| Test Type | Security |
| Priority | High |
| Preconditions | Valid unused unexpired token. |
| Test Data | tokens |
| Steps | 1. POST each |
| Expected Result | identical generic error body for all three |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/guardian/verify/route.ts; apps/erp/tests/unit/guardian-verification.test.ts |

##### TC-881 — Email changed after request
| Field | Description |
|---|---|
| Test Case ID | TC-881 |
| Requirement ID | FR-409 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Email changed after request |
| Test Type | Security |
| Priority | High |
| Preconditions | Valid unused unexpired token. |
| Test Data | token for old email, then guardian email changed |
| Steps | 1. POST verify with old token |
| Expected Result | fails; verification reset |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/guardian/verify/route.ts; apps/erp/tests/unit/guardian-verification.test.ts |

##### TC-882 — Idempotent per week
| Field | Description |
|---|---|
| Test Case ID | TC-882 |
| Requirement ID | FR-410 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Idempotent per week |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Cron Sunday 02:00 UTC. |
| Test Data | center with owner email |
| Steps | 1. run job twice |
| Expected Result | one email, one marker |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/cron/jobs.ts:191; apps/erp/tests/db/weekly-digest.test.ts |

##### TC-883 — Owner without email skipped
| Field | Description |
|---|---|
| Test Case ID | TC-883 |
| Requirement ID | FR-410 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Owner without email skipped |
| Test Type | Negative |
| Priority | Low |
| Preconditions | Cron Sunday 02:00 UTC. |
| Test Data | center whose owner has no email |
| Steps | 1. run job |
| Expected Result | skipped, others unaffected |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: packages/server-core/src/services/cron/jobs.ts:191; apps/erp/tests/db/weekly-digest.test.ts |

##### TC-884 — Send, fail and retry
| Field | Description |
|---|---|
| Test Case ID | TC-884 |
| Requirement ID | FR-411 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Send, fail and retry |
| Test Type | UI |
| Priority | High |
| Preconditions | Session. |
| Test Data | teacher and student |
| Steps | 1. stop API, send, restart, press Retry |
| Expected Result | 'Failed to send' then message sent once |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat/chat-screen.tsx; use-chat.ts; i18n chat.* |

##### TC-885 — Empty and 4000 composer
| Field | Description |
|---|---|
| Test Case ID | TC-885 |
| Requirement ID | FR-411 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Empty and 4000 composer |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | chat open |
| Steps | 1. type spaces 2. type 4001 chars |
| Expected Result | send disabled for spaces; field stops at 4000 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat/chat-screen.tsx; use-chat.ts; i18n chat.* |

##### TC-886 — XSS in message body
| Field | Description |
|---|---|
| Test Case ID | TC-886 |
| Requirement ID | FR-411 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | XSS in message body |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Session. |
| Test Data | two users |
| Steps | 1. send <img src=x onerror=alert(1)> and <script>alert(1)</script> |
| Expected Result | rendered as literal text; no script runs |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat/chat-screen.tsx; use-chat.ts; i18n chat.* |

##### TC-887 — Search and filter
| Field | Description |
|---|---|
| Test Case ID | TC-887 |
| Requirement ID | FR-412 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Search and filter |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | teacher with many contacts |
| Steps | 1. type a name 2. choose a role filter |
| Expected Result | list narrows; empty state text for no match |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat/ new-conversation dialog; i18n chat.* |

##### TC-888 — Report dialog flow
| Field | Description |
|---|---|
| Test Case ID | TC-888 |
| Requirement ID | FR-413 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Report dialog flow |
| Test Type | UI |
| Priority | High |
| Preconditions | Open thread. |
| Test Data | open thread |
| Steps | 1. Report -> choose Child-safety concern -> Send report |
| Expected Result | success text shown; one report row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat; i18n chat.* |

##### TC-889 — Block failure message
| Field | Description |
|---|---|
| Test Case ID | TC-889 |
| Requirement ID | FR-413 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Block failure message |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Open thread. |
| Test Data | API returns 500 for block |
| Steps | 1. Block |
| Expected Result | 'The block did not go through. This person is NOT blocked — please try again.' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat; i18n chat.* |

##### TC-890 — Student sees read-only note
| Field | Description |
|---|---|
| Test Case ID | TC-890 |
| Requirement ID | FR-414 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Student sees read-only note |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | owner_only group |
| Steps | 1. student opens channel |
| Expected Result | composer replaced by 'Only the teacher and their team can post here' |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/chat (group-panel, use-groups); i18n chat.channels.* |

##### TC-891 — More than 20 notifications
| Field | Description |
|---|---|
| Test Case ID | TC-891 |
| Requirement ID | FR-415 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | More than 20 notifications |
| Test Type | UI |
| Priority | High |
| Preconditions | Session. |
| Test Data | user with 30 notifications |
| Steps | 1. open page |
| Expected Result | Record that only 20 are listed; older ones unreachable (GAP) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/notifications (NotificationsScreen) |

##### TC-892 — Mark all read
| Field | Description |
|---|---|
| Test Case ID | TC-892 |
| Requirement ID | FR-415 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Mark all read |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Session. |
| Test Data | unread rows |
| Steps | 1. click Mark all read |
| Expected Result | badge 0; Unread tab empty |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/features/notifications (NotificationsScreen) |

##### TC-893 — Assistant messages route
| Field | Description |
|---|---|
| Test Case ID | TC-893 |
| Requirement ID | FR-416 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Assistant messages route |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Assistant session. |
| Test Data | assistant account |
| Steps | 1. open /dashboard/assistant/messages |
| Expected Result | redirected to /dashboard/assistant; no chat UI |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/erp/src/app/[locale]/dashboard/assistant/messages/page.tsx |

##### TC-894 — No attachment path
| Field | Description |
|---|---|
| Test Case ID | TC-894 |
| Requirement ID | FR-417 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | No attachment path |
| Test Type | Negative |
| Priority | Low |
| Preconditions | n/a |
| Test Data | any user |
| Steps | 1. POST /api/v1/messages with an attachments field |
| Expected Result | unknown field ignored or rejected; no upload UI present |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: apps/api/src/routes/v1/messages/route.ts (body only); chat.ts |

##### TC-895 — Deleted message placeholder
| Field | Description |
|---|---|
| Test Case ID | TC-895 |
| Requirement ID | FR-418 |
| Module | Messaging, Notifications & Communication Integrations |
| Test Scenario | Deleted message placeholder |
| Test Type | Database |
| Priority | Medium |
| Preconditions | Message has deletedAt. |
| Test Data | set deletedAt on a message directly in test DB |
| Steps | 1. open thread |
| Expected Result | 'Message removed' shown; body not in API response (verify) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: chat.ts softDeleteMessage; chat-screen.tsx:695 |

### 9. Reports, Dashboards & Exports

Shared dataset D1 (Centre A, Cairo time) used by several cases: payments P1 10000 paid 2026-05-01 00:00:00; P2 5000 paid 2026-05-31 23:59:59; P3 3000 pending (May); P4 2000 failed (May); P5 refund row -2000 on 2026-05-15; P6 7000 paid 2026-06-01 00:00:00. Expenses: Rent 20000 on 05-02, Utilities 2500 on 05-10, Rent 1000 on 06-01. Courses: C1 max 20 with 18 active enrolments; C2 max 10 with 12; C3 max not set with 5; C4 inactive. C1 May attendance: present 8, absent 1, excused 1, late 3, counter_only 2. May enrollment requests: pending 4, approved 10, declined 2, expired 1, cancelled 3. Expected May: revenue 13000, expenses 22500, net -9500 piastres. Passwords: see docs/guides/test-credentials.md.

##### TC-896 — Revenue for May equals worked figure (statuses and day edges)
| Field | Description |
|---|---|
| Test Case ID | TC-896 |
| Requirement ID | FR-419 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Revenue for May equals worked figure (statuses and day edges) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Dataset D1 loaded: P1 10000 paid 2026-05-01 00:00:00; P2 5000 paid 2026-05-31 23:59:59; P3 3000 pending; P4 2000 failed; P5 refund row -2000 on 05-15; P6 7000 paid 2026-06-01 00:00:00. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Login. 2. `GET /api/v1/reports/revenue?from=2026-05-01&to=2026-05-31`. |
| Expected Result | 200; total = 13000 (10000+5000-2000); pending, failed and June rows excluded; `from`,`to` echoed. count = number of rows included (record whether it is 3 or 2; refund row treatment). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-340, BR-342; reports.ts:207 |

##### TC-897 — Revenue endpoint refuses receptionist and manager
| Field | Description |
|---|---|
| Test Case ID | TC-897 |
| Requirement ID | FR-419 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Revenue endpoint refuses receptionist and manager |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | Same centre. |
| Test Data | center_staff with sub-role receptionist of Centre A; center_staff with sub-role manager of Centre A |
| Steps | 1. Login as each. 2. `GET /api/v1/reports/revenue`. |
| Expected Result | 403 for both with message "Center staff role '<role>' is not allowed on this route". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-actor.ts |

##### TC-898 — Garbage and inverted dates
| Field | Description |
|---|---|
| Test Case ID | TC-898 |
| Requirement ID | FR-419 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Garbage and inverted dates |
| Test Type | Negative |
| Priority | High |
| Preconditions | Owner session. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/revenue?from=abc`. 2. `?from=2026-05-31&to=2026-05-01`. |
| Expected Result | Record status. Expected by spec: 4xx for both. Code suggests 500 for 1 and 200 with total 0 for 2. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-167, GAP-168 |

##### TC-899 — Other centre's payments never included
| Field | Description |
|---|---|
| Test Case ID | TC-899 |
| Requirement ID | FR-419 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Other centre's payments never included |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Centre B has payments in May; logged into Centre A. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Call revenue for May as Centre A owner. 2. Compare with Centre B total. |
| Expected Result | Total equals Centre A only; no parameter lets the caller choose a centre. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-175 |

##### TC-900 — Expenses total and category breakdown for May
| Field | Description |
|---|---|
| Test Case ID | TC-900 |
| Requirement ID | FR-420 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Expenses total and category breakdown for May |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1 expenses: Rent 20000 on 05-02, Utilities 2500 on 05-10, Rent 1000 on 06-01. |
| Test Data | center_staff with sub-role center_accountant of Centre A |
| Steps | 1. Login as accountant. 2. `GET /api/v1/reports/expenses?from=2026-05-01&to=2026-05-31`. |
| Expected Result | total = 22500; byCategory: rent subtotal 20000 count 1, utilities 2500 count 1; June row excluded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-342 |

##### TC-901 — Empty period returns zeros
| Field | Description |
|---|---|
| Test Case ID | TC-901 |
| Requirement ID | FR-420 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Empty period returns zeros |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | No expenses in 2025. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/expenses?from=2025-01-01&to=2025-01-31`. |
| Expected Result | 200; total 0; byCategory empty. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-478 |

##### TC-902 — Net profit equals revenue minus expenses
| Field | Description |
|---|---|
| Test Case ID | TC-902 |
| Requirement ID | FR-421 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Net profit equals revenue minus expenses |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Dataset D1. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/net-profit?from=2026-05-01&to=2026-05-31`. 2. Open `/dashboard/admin/reports` and select May. |
| Expected Result | revenue 13000, expenses 22500, netProfit -9500; screen net card shows the same (EGP 130.00, 225.00, -95.00); margin = 0 when revenue>0 ? -9500/13000*100 = -73.1 (1 decimal). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-341, BR-364 |

##### TC-903 — No range: totals all-time versus 6-month chart
| Field | Description |
|---|---|
| Test Case ID | TC-903 |
| Requirement ID | FR-421 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | No range: totals all-time versus 6-month chart |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1 plus older data (>6 months). |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/net-profit` without params. 2. Sum monthly[].revenue and compare with revenue. |
| Expected Result | revenue includes all history; sum of monthly may be smaller. Record the difference. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-162 |

##### TC-904 — Net profit denied to manager and receptionist
| Field | Description |
|---|---|
| Test Case ID | TC-904 |
| Requirement ID | FR-421 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Net profit denied to manager and receptionist |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | center_staff with sub-role manager of Centre A; center_staff with sub-role receptionist of Centre A |
| Steps | 1. `GET /api/v1/reports/net-profit`. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-351 |

##### TC-905 — Monthly series zero-fills and respects Cairo month edges
| Field | Description |
|---|---|
| Test Case ID | TC-905 |
| Requirement ID | FR-422 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Monthly series zero-fills and respects Cairo month edges |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1 with payment P1 at 2026-04-30 21:00 UTC. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/revenue-timeseries?from=2026-04-01&to=2026-06-30&granularity=month`. |
| Expected Result | 3 points Apr, May, Jun; P1 is in May (Cairo), not April; June includes P6 7000. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-354 |

##### TC-906 — Weekly granularity and invalid granularity
| Field | Description |
|---|---|
| Test Case ID | TC-906 |
| Requirement ID | FR-422 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Weekly granularity and invalid granularity |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Owner session. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `granularity=week` with no range. 2. `granularity=day`. |
| Expected Result | 1: 8 ISO week keys `YYYY-Www` ending at today's week; 2: validation error. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | reports-period-buckets.test.ts |

##### TC-907 — Expenses series buckets match expenses report
| Field | Description |
|---|---|
| Test Case ID | TC-907 |
| Requirement ID | FR-423 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Expenses series buckets match expenses report |
| Test Type | Integration |
| Priority | High |
| Preconditions | Dataset D1. |
| Test Data | center_staff with sub-role center_accountant of Centre A |
| Steps | 1. `GET /api/v1/reports/expenses-timeseries?from=2026-05-01&to=2026-06-30&granularity=month`. |
| Expected Result | May 22500, June 1000; sum equals expenses report for same window. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-354 |

##### TC-908 — Funnel stage counts for May
| Field | Description |
|---|---|
| Test Case ID | TC-908 |
| Requirement ID | FR-424 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Funnel stage counts for May |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1: May requests pending 4, approved 10, declined 2, expired 1, cancelled 3. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. `GET /api/v1/reports/enrollment-funnel?from=2026-05-01&to=2026-05-31`. |
| Expected Result | Counts 4/10/2/1; cancelled absent; filter by submittedAt. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-345; GAP-166 |

##### TC-909 — Funnel denied to accountant and receptionist
| Field | Description |
|---|---|
| Test Case ID | TC-909 |
| Requirement ID | FR-424 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Funnel denied to accountant and receptionist |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | center_staff with sub-role center_accountant of Centre A; center_staff with sub-role receptionist of Centre A |
| Steps | 1. Call the funnel route. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-351 |

##### TC-910 — Attendance rate by course ignores late and counter_only
| Field | Description |
|---|---|
| Test Case ID | TC-910 |
| Requirement ID | FR-425 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Attendance rate by course ignores late and counter_only |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1: Course C1 in May present 8, absent 1, excused 1, late 3, counter_only 2. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. `GET /api/v1/reports/attendance-by-course?from=2026-05-01&to=2026-05-31`. |
| Expected Result | C1: present 8, absent 1, excused 1, total 10, rate 80. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-344; GAP-161 |

##### TC-911 — Attendance date range uses the session's date
| Field | Description |
|---|---|
| Test Case ID | TC-911 |
| Requirement ID | FR-425 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Attendance date range uses the session's date |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Attendance recorded on 2026-06-01 for a 2026-05-31 session. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. Query May. |
| Expected Result | Record belongs to May (session date), not the date it was marked. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | reports.ts:396 |

##### TC-912 — Fill rates: 90, 120 (uncapped), 0 for null capacity, inactive course excluded
| Field | Description |
|---|---|
| Test Case ID | TC-912 |
| Requirement ID | FR-426 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Fill rates: 90, 120 (uncapped), 0 for null capacity, inactive course excluded |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1: C1 18/20, C2 12/10, C3 null max with 5, C4 inactive. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. `GET /api/v1/reports/course-fill-rates`. |
| Expected Result | Order: C2 120, C1 90, C3 0; C4 absent. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-343; GAP-165 |

##### TC-913 — Provenance filter narrows fill rates
| Field | Description |
|---|---|
| Test Case ID | TC-913 |
| Requirement ID | FR-426 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Provenance filter narrows fill rates |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Mixed external/enrolled courses. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. Call with `systemStatus=external`. 2. With `dataSource=manual`. |
| Expected Result | Only matching courses returned. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FR-446 |

##### TC-914 — CSV export net profit equals screen
| Field | Description |
|---|---|
| Test Case ID | TC-914 |
| Requirement ID | FR-427 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | CSV export net profit equals screen |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | Dataset D1. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/export?report=net-profit&from=2026-05-01&to=2026-05-31&locale=en`. 2. Open file in Excel/text editor. |
| Expected Result | 200 `text/csv; charset=utf-8`, `no-store`, filename `net-profit-<date>.csv`; starts with BOM; CRLF endings; header lines Title, Period `2026-05-01 → 2026-05-31`, Exported; money columns 130.00 / 225.00 / -95.00 equal the screen. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-352, BR-353 |

##### TC-915 — Tier enforcement: manager money export, accountant ops export, unknown key
| Field | Description |
|---|---|
| Test Case ID | TC-915 |
| Requirement ID | FR-427 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Tier enforcement: manager money export, accountant ops export, unknown key |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | center_staff with sub-role manager of Centre A; center_staff with sub-role center_accountant of Centre A |
| Steps | 1. Manager: `report=net-profit`. 2. Accountant: `report=enrollment-funnel`. 3. Owner: `report=nope`. 4. Receptionist: any. |
| Expected Result | 1: 422 code forbidden_report "This staff role cannot export this report". 2: same. 3: 422 "Unknown report". 4: 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-351 |

##### TC-916 — CSV injection neutralisation
| Field | Description |
|---|---|
| Test Case ID | TC-916 |
| Requirement ID | FR-427 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | CSV injection neutralisation |
| Test Type | Security |
| Priority | High |
| Preconditions | A course titled `=HYPERLINK("http://x")` and one titled `-1+1`. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Export attendance-by-course. |
| Expected Result | Those cells begin with an apostrophe; numeric columns untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-176 |

##### TC-917 — Arabic locale and empty period
| Field | Description |
|---|---|
| Test Case ID | TC-917 |
| Requirement ID | FR-427 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Arabic locale and empty period |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Empty range. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Export expenses with `locale=ar` for a period without data. 2. Open in Excel. |
| Expected Result | Arabic headers (الفترة, تاريخ التصدير) display correctly, only header and total row (zeros), file valid. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-498 |

##### TC-918 — Large volume export
| Field | Description |
|---|---|
| Test Case ID | TC-918 |
| Requirement ID | FR-427 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Large volume export |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Centre with 50,000 payments and 10,000 expenses (staging only). |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Export net-profit and expenses-timeseries for all time. 2. Time it. |
| Expected Result | Completes inside 120000 ms or fails with exportFailed; record duration and memory. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-176 |

##### TC-919 — Print equals CSV totals
| Field | Description |
|---|---|
| Test Case ID | TC-919 |
| Requirement ID | FR-428 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Print equals CSV totals |
| Test Type | Integration |
| Priority | High |
| Preconditions | Dataset D1. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open `/en/reports/print?report=net-profit&from=2026-05-01&to=2026-05-31&locale=en&print=1`. |
| Expected Result | Page renders title, range, rows, total row equal to the CSV; print dialog opens after about 0.4 s; A4 margins 14mm. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-355 |

##### TC-920 — Print unauthorised, unknown key and expired session
| Field | Description |
|---|---|
| Test Case ID | TC-920 |
| Requirement ID | FR-428 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Print unauthorised, unknown key and expired session |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | center_staff with sub-role manager of Centre A; anonymous |
| Steps | 1. Manager opens print for net-profit. 2. Owner opens `report=nope`. 3. Anonymous opens print URL. |
| Expected Result | 1 and 2: not-found page (404). 3: redirect to login with callbackUrl lacking query. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-169 |

##### TC-921 — Print ignores provenance filter
| Field | Description |
|---|---|
| Test Case ID | TC-921 |
| Requirement ID | FR-428 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Print ignores provenance filter |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | External and internal data. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Export CSV with `systemStatus=external`. 2. Print the same. |
| Expected Result | Record that print shows unfiltered figures. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-169 |

##### TC-922 — Reports screen reconciles and loads panels on demand
| Field | Description |
|---|---|
| Test Case ID | TC-922 |
| Requirement ID | FR-429 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Reports screen reconciles and loads panels on demand |
| Test Type | UI |
| Priority | High |
| Preconditions | Dataset D1. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open reports with Network panel. 2. Note requests before scrolling. 3. Scroll to each panel. 4. Pick May. |
| Expected Result | Initially only net-profit; the series, fill-rate and funnel requests fire when each panel is visible; numbers equal API; expense category labels raw enums (note). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-363; NFR-182 |

##### TC-923 — Reports screen API failure
| Field | Description |
|---|---|
| Test Case ID | TC-923 |
| Requirement ID | FR-429 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Reports screen API failure |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Block `/api/v1/reports/net-profit`. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open reports. |
| Expected Result | "Failed to load reports." with retry; no zeros shown as data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-187 |

##### TC-924 — Export menu per role and states
| Field | Description |
|---|---|
| Test Case ID | TC-924 |
| Requirement ID | FR-430 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Export menu per role and states |
| Test Type | UI |
| Priority | High |
| Preconditions | Reports and finance screens. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md); center_staff with sub-role center_accountant of Centre A; center_staff with sub-role manager of Centre A |
| Steps | 1. Open Export menu on each screen. 2. Choose CSV and Print. |
| Expected Result | Owner sees 7 items; finance screen `only=money` shows 4; toasts "Preparing your file…" then "Your file has downloaded."; manager choosing a money item gets "The export did not go through…"; blocked popup shows the pop-up message. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-175 |

##### TC-925 — Manager staff reports without financials
| Field | Description |
|---|---|
| Test Case ID | TC-925 |
| Requirement ID | FR-431 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Manager staff reports without financials |
| Test Type | Functional |
| Priority | High |
| Preconditions | Dataset D1. |
| Test Data | center_staff with sub-role manager of Centre A |
| Steps | 1. Open `/en/dashboard/staff/reports`. 2. Inspect `GET /api/v1/dashboards/admin` response. |
| Expected Result | Counts and fill-rate table shown; response lacks totals.revenue/expenses/netProfit, analytics.revenueVsExpenses, feeDefaulters. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-350 |

##### TC-926 — Non-manager opens staff reports URL
| Field | Description |
|---|---|
| Test Case ID | TC-926 |
| Requirement ID | FR-431 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Non-manager opens staff reports URL |
| Test Type | Authorization |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff with sub-role receptionist of Centre A; center_staff with sub-role center_accountant of Centre A |
| Steps | 1. Visit `/en/dashboard/staff/reports` directly. |
| Expected Result | API 403; screen shows load failure; nothing financial shown. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-172 |

##### TC-927 — Admin dashboard KPI reconciliation
| Field | Description |
|---|---|
| Test Case ID | TC-927 |
| Requirement ID | FR-432 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Admin dashboard KPI reconciliation |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Dataset D1; S1 enrolled in courses priced 50000+30000 with non-failed payments 60000; S2 paid 80000; 18+12+5 enrolments; teachers distinct. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/dashboards/admin`. 2. With `from=2026-05-01&to=2026-05-31`. |
| Expected Result | totals.students = number of active enrolments (35), not distinct students; feeDefaulters includes S1 (owes 20000) and not S2; revenue/expenses all-time without period and May-only with it; payload names its timeframe; attendanceRate = present / all records. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-346..10; tests/unit/dashboards-admin-period.test.ts |

##### TC-928 — Manager and owner payload differ
| Field | Description |
|---|---|
| Test Case ID | TC-928 |
| Requirement ID | FR-432 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Manager and owner payload differ |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | — |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md); center_staff with sub-role manager of Centre A; center_staff with sub-role receptionist of Centre A |
| Steps | 1. Fetch dashboards/admin as each. |
| Expected Result | Owner full; manager stripped; receptionist 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-350 |

##### TC-929 — Today's session count at Cairo midnight
| Field | Description |
|---|---|
| Test Case ID | TC-929 |
| Requirement ID | FR-432 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Today's session count at Cairo midnight |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Sessions at 2026-05-10 00:30 Cairo and 2026-05-09 23:30 Cairo. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Call at 2026-05-10 00:10 Cairo (system clock or seeded 'today'). |
| Expected Result | Only the 00:30 session counts for May 10. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-342 |

##### TC-930 — Checklist steps
| Field | Description |
|---|---|
| Test Case ID | TC-930 |
| Requirement ID | FR-433 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Checklist steps |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | New centre with only a profile. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/dashboards/admin/checklist`. 2. Add an active course, an active enrolment, a payment; repeat. |
| Expected Result | Initial: profile done only (done 1/5); after additions teacher and group, student, payment true; complete true at 5/5. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-365 |

##### TC-931 — Checklist denied to receptionist
| Field | Description |
|---|---|
| Test Case ID | TC-931 |
| Requirement ID | FR-433 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Checklist denied to receptionist |
| Test Type | Authorization |
| Priority | Low |
| Preconditions | — |
| Test Data | center_staff with sub-role receptionist of Centre A |
| Steps | 1. Call checklist. |
| Expected Result | 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | center-actor.ts |

##### TC-932 — Admin home queue and metrics
| Field | Description |
|---|---|
| Test Case ID | TC-932 |
| Requirement ID | FR-434 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Admin home queue and metrics |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre with 2 pending requests, 1 defaulter, 1 unsettled, 1 clash; then a clean centre. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open `/en/dashboard/admin`. 2. Repeat on clean centre. |
| Expected Result | n = requests + defaulters + unsettled + clashes = 5, title "5 decisions waiting today"; clean: "No decisions waiting today" and "Nothing is waiting on you. The record is up to date."; ledger sheet revenue labelled "All time". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | admin-dashboard.tsx; GAP-163 |

##### TC-933 — Admin home API error
| Field | Description |
|---|---|
| Test Case ID | TC-933 |
| Requirement ID | FR-434 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Admin home API error |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Block dashboards/admin. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open home. |
| Expected Result | LoadError with retry; skeleton before. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-934 — Takings card net figure
| Field | Description |
|---|---|
| Test Case ID | TC-934 |
| Requirement ID | FR-435 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Takings card net figure |
| Test Type | Functional |
| Priority | High |
| Preconditions | Today (Cairo): receipts 10000 and 5000, refund -2000, plus one failed 4000 and one pending 3000. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open admin home. 2. Compare with `reports/revenue?from=today&to=today`. |
| Expected Result | Record both: by design reports revenue = 13000; the card sums every status unless filtered. Any difference is GAP-164. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-366 |

##### TC-935 — Takings across Cairo midnight
| Field | Description |
|---|---|
| Test Case ID | TC-935 |
| Requirement ID | FR-435 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Takings across Cairo midnight |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Payment at 00:05 Cairo today and 23:55 Cairo yesterday. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Open the card. |
| Expected Result | Only today's payment counted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | payments-day-range.test.ts |

##### TC-936 — Teacher dashboard figures
| Field | Description |
|---|---|
| Test Case ID | TC-936 |
| Requirement ID | FR-436 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Teacher dashboard figures |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher with 3 courses, 40 enrolments in 36 distinct students, 5 ungraded grade entries, attendance 8 present of 12 records, 2 counter-only sessions today. |
| Test Data | teacher (seeded demo teacher) |
| Steps | 1. `GET /api/v1/dashboards/teacher`. |
| Expected Result | activeCourses 3; activeStudents 40; pendingGradeEntries 5; avgAttendanceRate = present / all records; counterOnlyToday 2; scoreDistribution bucket boundaries 49/50, 59/60, 79/80, 89/90 correct. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-361 |

##### TC-937 — Teacher dashboard other-teacher and role isolation
| Field | Description |
|---|---|
| Test Case ID | TC-937 |
| Requirement ID | FR-436 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Teacher dashboard other-teacher and role isolation |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Two teachers. |
| Test Data | teacher A; student; center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. As A fetch. 2. As student and owner call the endpoint. |
| Expected Result | A sees only own data; student/owner receive 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | dashboards/teacher/route.ts |

##### TC-938 — Assistant acts for employing teacher
| Field | Description |
|---|---|
| Test Case ID | TC-938 |
| Requirement ID | FR-436 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Assistant acts for employing teacher |
| Test Type | Authorization |
| Priority | High |
| Preconditions | Assistant linked to teacher A. |
| Test Data | assistant of teacher A |
| Steps | 1. Fetch dashboards/teacher. |
| Expected Result | Returns teacher A's data via delegated(); audit attribution recorded by the wrapper. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | delegated() |

##### TC-939 — Teacher home renders and wallet failure isolation
| Field | Description |
|---|---|
| Test Case ID | TC-939 |
| Requirement ID | FR-437 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Teacher home renders and wallet failure isolation |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Teacher with next session. |
| Test Data | teacher |
| Steps | 1. Open home. 2. Fail `teacher/wallet`. |
| Expected Result | KPIs and charts show; wallet card shows retry independently; no courses/affiliations requests when no next session. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-363 |

##### TC-940 — Student dashboard windows at Cairo midnight
| Field | Description |
|---|---|
| Test Case ID | TC-940 |
| Requirement ID | FR-438 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Student dashboard windows at Cairo midnight |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Session at 2026-05-10 01:00 Cairo (22:00 UTC May 9) and one at 2026-05-09 20:00 Cairo. |
| Test Data | student |
| Steps | 1. At 2026-05-10 00:30 Cairo call `GET /api/v1/dashboards/student`. |
| Expected Result | Spec (Cairo): May 10 session is 'today'. Record actual; UTC logic is expected to list May 9 as today. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-160 |

##### TC-941 — Student sees only own data; other roles refused
| Field | Description |
|---|---|
| Test Case ID | TC-941 |
| Requirement ID | FR-438 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Student sees only own data; other roles refused |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Two students. |
| Test Data | student A; parent; teacher |
| Steps | 1. As A fetch. 2. As parent and teacher call the endpoint. |
| Expected Result | Own data only; others 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | requireRole('student') |

##### TC-942 — Student home widgets and on-demand wallet
| Field | Description |
|---|---|
| Test Case ID | TC-942 |
| Requirement ID | FR-439 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Student home widgets and on-demand wallet |
| Test Type | UI |
| Priority | Medium |
| Preconditions | Student with wallet. |
| Test Data | student |
| Steps | 1. Open home with Network panel. 2. Scroll to record row. |
| Expected Result | `me/wallet` fires only when the row becomes visible; cards present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-363 |

##### TC-943 — Parent home figures for selected child
| Field | Description |
|---|---|
| Test Case ID | TC-943 |
| Requirement ID | FR-440 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Parent home figures for selected child |
| Test Type | Functional |
| Priority | High |
| Preconditions | Child with two courses: scores 40/50 and 30/50 (course 2: 15/25); payments 10000, 5000, refund -2000. |
| Test Data | parent |
| Steps | 1. Open parent home. 2. Switch child. |
| Expected Result | Average grade = round((80% + 60%)/2) = 70; fees paid = 15000 (refund excluded); figures change with child. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-367; GAP-177 |

##### TC-944 — Parent cannot see an unlinked child
| Field | Description |
|---|---|
| Test Case ID | TC-944 |
| Requirement ID | FR-440 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Parent cannot see an unlinked child |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Child X not linked to parent. |
| Test Data | parent |
| Steps | 1. Call `GET /api/v1/me/attendance?studentId=<X>`, grades and payments filtered by X. |
| Expected Result | Refused or empty (ownership owned by Student & Parent module); no data leak. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | parent-dashboard.tsx |

##### TC-945 — Parent with no children / failed lookup
| Field | Description |
|---|---|
| Test Case ID | TC-945 |
| Requirement ID | FR-440 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Parent with no children / failed lookup |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | parent with no children |
| Steps | 1. Open home. |
| Expected Result | "No children registered." with link; failure state "Could not load your children. Refresh and try again." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | parentDashboard.noChildren |

##### TC-946 — Staff home per sub-role
| Field | Description |
|---|---|
| Test Case ID | TC-946 |
| Requirement ID | FR-441 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Staff home per sub-role |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | center_staff with sub-role receptionist of Centre A; center_staff with sub-role manager of Centre A; center_staff with sub-role center_accountant of Centre A |
| Steps | 1. Open `/en/dashboard/staff` as each. |
| Expected Result | Receptionist and manager see counter; accountant sees the no-messaging notice; all see the audit note. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-369 |

##### TC-947 — Assistant home is messages
| Field | Description |
|---|---|
| Test Case ID | TC-947 |
| Requirement ID | FR-442 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Assistant home is messages |
| Test Type | Functional |
| Priority | Low |
| Preconditions | — |
| Test Data | assistant |
| Steps | 1. Open `/en/dashboard/assistant`. |
| Expected Result | First-run guidance + chat; no KPI request to dashboards APIs. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FR-442 |

##### TC-948 — Navigation item sets per role
| Field | Description |
|---|---|
| Test Case ID | TC-948 |
| Requirement ID | FR-443 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Navigation item sets per role |
| Test Type | UI |
| Priority | Medium |
| Preconditions | One account per role. |
| Test Data | center_staff with sub-role receptionist of Centre A; center_staff with sub-role manager of Centre A; center_staff with sub-role center_accountant of Centre A; center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md); teacher; student; parent |
| Steps | 1. Login as each and list sidebar and bottom bar items. |
| Expected Result | receptionist 6, manager 9, accountant 5 (no Reports); admin groups @counter/@ops/@money/@team/@comms/@account; no role sees another's links; mobile bar matches sidebar rules. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-173; portal-bottom-nav-parity.test.ts |

##### TC-949 — Direct URL to another role's page
| Field | Description |
|---|---|
| Test Case ID | TC-949 |
| Requirement ID | FR-443 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Direct URL to another role's page |
| Test Type | Authorization |
| Priority | High |
| Preconditions | — |
| Test Data | student |
| Steps | 1. Open `/en/dashboard/admin/reports` as student. |
| Expected Result | Redirect or 403; no data. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | shell |

##### TC-950 — Digest content equals reports and window
| Field | Description |
|---|---|
| Test Case ID | TC-950 |
| Requirement ID | FR-444 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Digest content equals reports and window |
| Test Type | Integration |
| Priority | High |
| Preconditions | Cron runnable in a non-production environment; Dataset in the previous Sun-Sat week; mail stub. |
| Test Data | owner of Centre A |
| Steps | 1. Run digest job for a Sunday (console/stub). 2. Compare figures with `reports/net-profit` for the same dates. |
| Expected Result | Email shows revenue/expenses/net/attendance equal to report; window Sun 00:00 to Sat 23:59:59 of the prior week. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-356, BR-357; tests/db/weekly-digest.test.ts |

##### TC-951 — Digest idempotency and skip rules
| Field | Description |
|---|---|
| Test Case ID | TC-951 |
| Requirement ID | FR-444 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Digest idempotency and skip rules |
| Test Type | Negative |
| Priority | High |
| Preconditions | As above; second run; centres with suspended owner, no owner, no email. |
| Test Data | — |
| Steps | 1. Run twice. 2. Run for skip-case centres. |
| Expected Result | Second run sends nothing and writes no second audit row; skip-case centres receive nothing and no row; failed/skipped send leaves week owed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-504, EC-505 |

##### TC-952 — Cron endpoint requires secret
| Field | Description |
|---|---|
| Test Case ID | TC-952 |
| Requirement ID | FR-444 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Cron endpoint requires secret |
| Test Type | Security |
| Priority | Critical |
| Preconditions | — |
| Test Data | anonymous |
| Steps | 1. `POST /api/v1/cron/weekly-center-digest` without `x-cron-secret`. 2. GET. |
| Expected Result | Rejected (fail-closed); GET not allowed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | weekly-center-digest.md (owned by Platform module) |

##### TC-953 — Cairo day edges
| Field | Description |
|---|---|
| Test Case ID | TC-953 |
| Requirement ID | FR-445 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Cairo day edges |
| Test Type | Boundary |
| Priority | Critical |
| Preconditions | Payments at 2026-04-30 21:00:00 UTC (= May 1 00:00 Cairo), 2026-05-31 20:59:59 UTC, 2026-05-31 21:00:00 UTC. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Query May revenue. |
| Expected Result | First two included, third excluded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | platform-day-bounds.test.ts |

##### TC-954 — DST day boundaries
| Field | Description |
|---|---|
| Test Case ID | TC-954 |
| Requirement ID | FR-445 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | DST day boundaries |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Data on a DST change day (last Friday April / October as Egypt applies). |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Query that single day. |
| Expected Result | All rows in the 23h/25h day included; neighbours excluded. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-342 |

##### TC-955 — Provenance on revenue
| Field | Description |
|---|---|
| Test Case ID | TC-955 |
| Requirement ID | FR-446 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Provenance on revenue |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | External-teacher and manual-source payments. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Revenue with `systemStatus=external`; with `dataSource=manual`; both. |
| Expected Result | Totals are subsets; sum of complements equals unfiltered. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-358 |

##### TC-956 — Role matrix sweep on every report route
| Field | Description |
|---|---|
| Test Case ID | TC-956 |
| Requirement ID | FR-447 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Role matrix sweep on every report route |
| Test Type | Authorization |
| Priority | Critical |
| Preconditions | One account per sub-role. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md); center_staff with sub-role center_accountant of Centre A; center_staff with sub-role manager of Centre A; center_staff with sub-role receptionist of Centre A; teacher; student; parent; anonymous |
| Steps | 1. Call each of the 10 report routes and 3 admin dashboard routes as each account. |
| Expected Result | Matches permissions.md exactly: 401 anonymous; 403 for off-tier staff and other roles; 200 for allowed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | permissions.md |

##### TC-957 — Cross-centre access via forged parameters
| Field | Description |
|---|---|
| Test Case ID | TC-957 |
| Requirement ID | FR-447 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Cross-centre access via forged parameters |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Centre B id known. |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Add `centerId=<B>` and `courseId=<B course>` params to report calls. |
| Expected Result | Parameters ignored; Centre A data only. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-174 |

##### TC-958 — Expenses series on large volume and role denial
| Field | Description |
|---|---|
| Test Case ID | TC-958 |
| Requirement ID | FR-423 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Expenses series on large volume and role denial |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | Centre with 100,000 expense rows (staging); manager account. |
| Test Data | center_staff with sub-role manager of Centre A; center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. Manager calls `reports/expenses-timeseries`. 2. Owner calls it for all time and times it. |
| Expected Result | 1: 403. 2: completes or times out; record duration (all rows loaded in memory). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-176 |

##### TC-959 — Export menu hides OPS items on finance screen and survives server refusal
| Field | Description |
|---|---|
| Test Case ID | TC-959 |
| Requirement ID | FR-430 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Export menu hides OPS items on finance screen and survives server refusal |
| Test Type | Negative |
| Priority | High |
| Preconditions | Finance screen with `only=money`. |
| Test Data | center_staff with sub-role center_accountant of Centre A |
| Steps | 1. Open the finance screen Export menu. 2. Choose each item. |
| Expected Result | Only the 4 money reports are offered; accountant exports succeed with the download toast; no ops items present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | report-export-menu.tsx |

##### TC-960 — Invalid provenance values
| Field | Description |
|---|---|
| Test Case ID | TC-960 |
| Requirement ID | FR-446 |
| Module | Reports, Dashboards & Exports (ERP) |
| Test Scenario | Invalid provenance values |
| Test Type | Negative |
| Priority | Low |
| Preconditions | — |
| Test Data | center_admin of Centre A (seeded demo centre owner; password: see docs/guides/test-credentials.md) |
| Steps | 1. `GET /api/v1/reports/revenue?systemStatus=bogus`. |
| Expected Result | Record status (spec: 4xx; implementation of parseProvenance not verified). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FR-446 |

### 10. Super Admin Platform Operations

Module for every TC: Super Admin Platform Operations (لوحة الإدارة العليا). Test data names roles and seeded accounts only — password: see docs/guides/test-credentials.md. Execute in `test` or `dev`, never production.

##### TC-961 — super_admin with 2FA reaches an admin route
| Field | Description |
|---|---|
| Test Case ID | TC-961 |
| Requirement ID | FR-448 |
| Module | Super Admin Platform Operations |
| Test Scenario | super_admin with 2FA reaches an admin route (Back-office access guard (role, session, 2FA)) |
| Test Type | Security / Functional |
| Priority | Critical |
| Preconditions | super_admin with 2FA (password: see docs/guides/test-credentials.md) |
| Test Data | — |
| Steps | 1. GET /api/v1/admin/centers. |
| Expected Result | 200 with `{data}`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice-auth/require-role.ts`; `svc/backoffice-auth/session.ts`; `svc/backoffice-auth/two-factor.ts`; `apps/superadmin/src/app/[locale]/dashboard/layout.tsx`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/layout.tsx`; tests `apps/admin-api/tests/unit/route-admin-guard.test.ts`, `authz-require-role.test.ts`. |

##### TC-962 — accountant is refused every v1/admin route in this module
| Field | Description |
|---|---|
| Test Case ID | TC-962 |
| Requirement ID | FR-448 |
| Module | Super Admin Platform Operations |
| Test Scenario | accountant is refused every v1/admin route in this module (Back-office access guard (role, session, 2FA)) |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | accountant account with 2FA |
| Test Data | — |
| Steps | 1. Sign in as accountant.<br>2. GET /api/v1/admin/centers, /admin/users, /admin/catalog/systems. |
| Expected Result | Each returns 403 `forbidden` "Role 'accountant' is not allowed (need one of: super_admin)". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice-auth/require-role.ts`; `svc/backoffice-auth/session.ts`; `svc/backoffice-auth/two-factor.ts`; `apps/superadmin/src/app/[locale]/dashboard/layout.tsx`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/layout.tsx`; tests `apps/admin-api/tests/unit/route-admin-guard.test.ts`, `authz-require-role.test.ts`. |

##### TC-963 — super_admin without 2FA is refused
| Field | Description |
|---|---|
| Test Case ID | TC-963 |
| Requirement ID | FR-448 |
| Module | Super Admin Platform Operations |
| Test Scenario | super_admin without 2FA is refused (Back-office access guard (role, session, 2FA)) |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | super_admin with 2FA not enabled |
| Test Data | — |
| Steps | 1. Call GET /api/v1/admin/centers.<br>2. Open /en/dashboard in the UI. |
| Expected Result | 403 `two_factor_required`; UI redirects to /[locale]/two-factor-setup. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice-auth/require-role.ts`; `svc/backoffice-auth/session.ts`; `svc/backoffice-auth/two-factor.ts`; `apps/superadmin/src/app/[locale]/dashboard/layout.tsx`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/layout.tsx`; tests `apps/admin-api/tests/unit/route-admin-guard.test.ts`, `authz-require-role.test.ts`. |

##### TC-964 — No cookie and suspended account
| Field | Description |
|---|---|
| Test Case ID | TC-964 |
| Requirement ID | FR-448 |
| Module | Super Admin Platform Operations |
| Test Scenario | No cookie and suspended account (Back-office access guard (role, session, 2FA)) |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | A suspended super_admin |
| Test Data | — |
| Steps | 1. Call without cookie.<br>2. Call with the suspended account's session. |
| Expected Result | Both 401 `unauthenticated`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice-auth/require-role.ts`; `svc/backoffice-auth/session.ts`; `svc/backoffice-auth/two-factor.ts`; `apps/superadmin/src/app/[locale]/dashboard/layout.tsx`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/layout.tsx`; tests `apps/admin-api/tests/unit/route-admin-guard.test.ts`, `authz-require-role.test.ts`. |

##### TC-965 — Dashboard KPIs and decision queue load
| Field | Description |
|---|---|
| Test Case ID | TC-965 |
| Requirement ID | FR-449 |
| Module | Super Admin Platform Operations |
| Test Scenario | Dashboard KPIs and decision queue load (Platform dashboard (KPIs, decision queue, charts)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | super_admin; demo data present |
| Test Data | — |
| Steps | 1. Open /en/dashboard/superadmin. |
| Expected Result | KPI cards, decision queue and charts render with values from GET /api/v1/admin/dashboard. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/dashboard/*/route.ts`; `svc/backoffice/admin/platform-dashboard.ts:27,187,219,234`. |

##### TC-966 — KPI request fails
| Field | Description |
|---|---|
| Test Case ID | TC-966 |
| Requirement ID | FR-449 |
| Module | Super Admin Platform Operations |
| Test Scenario | KPI request fails (Platform dashboard (KPIs, decision queue, charts)) |
| Test Type | Negative / UI |
| Priority | High |
| Preconditions | super_admin |
| Test Data | Block the dashboard request (devtools) |
| Steps | 1. Load Home with the request failing. |
| Expected Result | Error state shown; observe whether cards show 0 (GAP-207) and the "Cycle statement" link (GAP-202). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/dashboard/*/route.ts`; `svc/backoffice/admin/platform-dashboard.ts:27,187,219,234`. |

##### TC-967 — Pending centres and teachers listed
| Field | Description |
|---|---|
| Test Case ID | TC-967 |
| Requirement ID | FR-450 |
| Module | Super Admin Platform Operations |
| Test Scenario | Pending centres and teachers listed (Registrations queue (centres and teachers)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | super_admin with 2FA (password: see docs/guides/test-credentials.md); one pending centre and one pending teacher |
| Test Data | — |
| Steps | 1. Open Registrations.<br>2. Switch tabs pending/approved/rejected. |
| Expected Result | Pending items listed per tab with paging. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:14,38`; test `apps/superadmin/tests/db/m16-registrations-paging.test.ts`. |

##### TC-968 — Rejected teacher visibility
| Field | Description |
|---|---|
| Test Case ID | TC-968 |
| Requirement ID | FR-450 |
| Module | Super Admin Platform Operations |
| Test Scenario | Rejected teacher visibility (Registrations queue (centres and teachers)) |
| Test Type | Functional / Negative |
| Priority | High |
| Preconditions | A teacher rejected through FR-473 |
| Test Data | — |
| Steps | 1. Open the rejected tab. |
| Expected Result | Record whether the rejected teacher appears (GAP-195). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:14,38`; test `apps/superadmin/tests/db/m16-registrations-paging.test.ts`. |

##### TC-969 — Approve a pending centre
| Field | Description |
|---|---|
| Test Case ID | TC-969 |
| Requirement ID | FR-451 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve a pending centre (Approve a centre registration) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | super_admin with 2FA (password: see docs/guides/test-credentials.md); pending centre |
| Test Data | centreId of pending centre |
| Steps | 1. Approve the centre in Registrations.<br>2. Open Audit log. |
| Expected Result | Centre `active`; admins can sign in to ERP; audit row with actor, action and target. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:152-184`. |

##### TC-970 — Approve an already-active centre
| Field | Description |
|---|---|
| Test Case ID | TC-970 |
| Requirement ID | FR-451 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve an already-active centre (Approve a centre registration) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Active centre |
| Test Data | — |
| Steps | 1. POST approve on it. |
| Expected Result | 422 "Center is already active". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:152-184`. |

##### TC-971 — Reject a pending centre with reason
| Field | Description |
|---|---|
| Test Case ID | TC-971 |
| Requirement ID | FR-452 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reject a pending centre with reason (Reject a centre registration) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Pending centre |
| Test Data | reason "Incomplete documents" |
| Steps | 1. Reject with the reason. |
| Expected Result | Centre `rejected`; every centre admin `suspended` (GAP-189); audit row carries the reason. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:185-218`; admin-api `v1/admin/centers/[id]/reject/route.ts`. |

##### TC-972 — Reject without reason / already decided
| Field | Description |
|---|---|
| Test Case ID | TC-972 |
| Requirement ID | FR-452 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reject without reason / already decided (Reject a centre registration) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Pending and rejected centres |
| Test Data | empty reason |
| Steps | 1. Reject with empty reason.<br>2. Reject an already rejected centre. |
| Expected Result | 400/422 on empty reason; 422 "Center is already rejected". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:185-218`; admin-api `v1/admin/centers/[id]/reject/route.ts`. |

##### TC-973 — Centre directory and detail
| Field | Description |
|---|---|
| Test Case ID | TC-973 |
| Requirement ID | FR-453 |
| Module | Super Admin Platform Operations |
| Test Scenario | Centre directory and detail (Centre directory and centre detail) |
| Test Type | Functional |
| Priority | High |
| Preconditions | super_admin |
| Test Data | search text = centre name |
| Steps | 1. Search the Centres list.<br>2. Open a centre. |
| Expected Result | Matching centre listed; detail tabs load. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:104,138`. |

##### TC-974 — Unknown centre id
| Field | Description |
|---|---|
| Test Case ID | TC-974 |
| Requirement ID | FR-453 |
| Module | Super Admin Platform Operations |
| Test Scenario | Unknown centre id (Centre directory and centre detail) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | random UUID |
| Steps | 1. GET /api/v1/admin/centers/<uuid>. |
| Expected Result | 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:104,138`. |

##### TC-975 — Deactivate an active centre
| Field | Description |
|---|---|
| Test Case ID | TC-975 |
| Requirement ID | FR-454 |
| Module | Super Admin Platform Operations |
| Test Scenario | Deactivate an active centre (Activate / deactivate a centre) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Active centre with 2 admins |
| Test Data | reason "Licence expired" |
| Steps | 1. Deactivate from the centre header.<br>2. Try ERP sign-in as one admin. |
| Expected Result | Centre `suspended`; all admins `suspended` and refused; audit `center.deactivated` with before/after statuses and reason; admins notified. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:30-110`. |

##### TC-976 — Reactivate a centre whose admin is blacklisted
| Field | Description |
|---|---|
| Test Case ID | TC-976 |
| Requirement ID | FR-454 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reactivate a centre whose admin is blacklisted (Activate / deactivate a centre) |
| Test Type | Integrity / Negative |
| Priority | Critical |
| Preconditions | Suspended centre; one admin platform-blacklisted |
| Test Data | — |
| Steps | 1. Activate the centre.<br>2. Check that admin's `users.status` and blacklist entry. |
| Expected Result | Document actual result; current code makes the admin `active` while the entry stays active (GAP-185). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:30-110`. |

##### TC-977 — Deactivate without reason / same status / pending centre
| Field | Description |
|---|---|
| Test Case ID | TC-977 |
| Requirement ID | FR-454 |
| Module | Super Admin Platform Operations |
| Test Scenario | Deactivate without reason / same status / pending centre (Activate / deactivate a centre) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Centres in active, suspended, pending states |
| Test Data | — |
| Steps | 1. Deactivate without reason.<br>2. Activate an active centre.<br>3. Activate a pending centre. |
| Expected Result | 422 reason required; 409 "Center is already active"; 422 "Cannot activate a center in status 'pending' — use the registration flow". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:30-110`. |

##### TC-978 — Edit centre profile whitelisted fields
| Field | Description |
|---|---|
| Test Case ID | TC-978 |
| Requirement ID | FR-455 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit centre profile whitelisted fields (Edit centre profile) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active centre |
| Test Data | name, phone, address |
| Steps | 1. Edit profile and save. |
| Expected Result | 200; values persisted; audit row with before/after. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:353-455`; admin-api `v1/admin/centers/[id]/route.ts`. |

##### TC-979 — Edit a non-whitelisted field or external image
| Field | Description |
|---|---|
| Test Case ID | TC-979 |
| Requirement ID | FR-455 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit a non-whitelisted field or external image (Edit centre profile) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | body with `status`, or image URL on another host |
| Steps | 1. PATCH /api/v1/admin/centers/<id>. |
| Expected Result | 403 "These fields are not editable here: …" or 400 strict; 400 "Image must be hosted on the platform media storage". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:353-455`; admin-api `v1/admin/centers/[id]/route.ts`. |

##### TC-980 — Invite and remove a centre admin
| Field | Description |
|---|---|
| Test Case ID | TC-980 |
| Requirement ID | FR-456 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invite and remove a centre admin (Centre admins (list, invite, remove)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active centre |
| Test Data | new admin email |
| Steps | 1. Invite an admin.<br>2. Remove the admin. |
| Expected Result | Admin listed then removed; audit rows written. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/admins/**`; `svc/backoffice/admin/center-people.ts`; test `apps/superadmin/tests/db/center-people.test.ts`. |

##### TC-981 — Invite a duplicate admin
| Field | Description |
|---|---|
| Test Case ID | TC-981 |
| Requirement ID | FR-456 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invite a duplicate admin (Centre admins (list, invite, remove)) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Admin already linked |
| Test Data | same email |
| Steps | 1. Invite again. |
| Expected Result | 409 conflict. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/admins/**`; `svc/backoffice/admin/center-people.ts`; test `apps/superadmin/tests/db/center-people.test.ts`. |

##### TC-982 — Create, edit and remove centre staff
| Field | Description |
|---|---|
| Test Case ID | TC-982 |
| Requirement ID | FR-457 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create, edit and remove centre staff (Centre staff (list, create, edit, remove, resend invite)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Active centre |
| Test Data | staff name, sub-role |
| Steps | 1. Create staff.<br>2. Change sub-role.<br>3. Remove. |
| Expected Result | Each step persisted and audited; sub-role select applies without confirmation (GAP-206). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/staff/**`; `svc/rate-limit/middleware.ts`. |

##### TC-983 — Resend staff invite rate limit
| Field | Description |
|---|---|
| Test Case ID | TC-983 |
| Requirement ID | FR-457 |
| Module | Super Admin Platform Operations |
| Test Scenario | Resend staff invite rate limit (Centre staff (list, create, edit, remove, resend invite)) |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | Staff link pending invite |
| Test Data | — |
| Steps | 1. Resend invite 11 times within a minute. |
| Expected Result | 11th call 429 `rate_limited` "Too many requests, please slow down." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/staff/**`; `svc/rate-limit/middleware.ts`. |

##### TC-984 — Edit room non-money fields
| Field | Description |
|---|---|
| Test Case ID | TC-984 |
| Requirement ID | FR-458 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit room non-money fields (Centre rooms (non-money fields)) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Centre with a room |
| Test Data | capacity 30 |
| Steps | 1. Edit room capacity. |
| Expected Result | Saved; money fields out of scope. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:456-540`. |

##### TC-985 — Roster list and add existing student
| Field | Description |
|---|---|
| Test Case ID | TC-985 |
| Requirement ID | FR-459 |
| Module | Super Admin Platform Operations |
| Test Scenario | Roster list and add existing student (Centre student roster) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre; student not on roster |
| Test Data | student id |
| Steps | 1. Add existing student.<br>2. Reload roster. |
| Expected Result | Student listed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/roster/students/**`; tests `apps/superadmin/tests/db/center-people.test.ts`, `m16-roster-scoped-reads.test.ts`. |

##### TC-986 — Roster invite token exposure
| Field | Description |
|---|---|
| Test Case ID | TC-986 |
| Requirement ID | FR-459 |
| Module | Super Admin Platform Operations |
| Test Scenario | Roster invite token exposure (Centre student roster) |
| Test Type | Security |
| Priority | High |
| Preconditions | Non-production build |
| Test Data | — |
| Steps | 1. POST roster/students/invite.<br>2. Inspect response meta. |
| Expected Result | `meta.inviteToken` present outside production; absent with NODE_ENV=production and E2E unset (GAP-191). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/roster/students/**`; tests `apps/superadmin/tests/db/center-people.test.ts`, `m16-roster-scoped-reads.test.ts`. |

##### TC-987 — Teacher roster and affiliations
| Field | Description |
|---|---|
| Test Case ID | TC-987 |
| Requirement ID | FR-460 |
| Module | Super Admin Platform Operations |
| Test Scenario | Teacher roster and affiliations (Centre teacher roster and affiliations) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre with affiliated teachers |
| Test Data | — |
| Steps | 1. Open Teachers tab. |
| Expected Result | Affiliated teachers listed with status. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/roster/teachers/**`, `affiliations/**`. |

##### TC-988 — Remove a teacher from the centre
| Field | Description |
|---|---|
| Test Case ID | TC-988 |
| Requirement ID | FR-460 |
| Module | Super Admin Platform Operations |
| Test Scenario | Remove a teacher from the centre (Centre teacher roster and affiliations) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Affiliated teacher |
| Test Data | reason |
| Steps | 1. "Remove from center" on a row. |
| Expected Result | Affiliation ended; audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/roster/teachers/**`, `affiliations/**`. |

##### TC-989 — Deactivate a centre student
| Field | Description |
|---|---|
| Test Case ID | TC-989 |
| Requirement ID | FR-461 |
| Module | Super Admin Platform Operations |
| Test Scenario | Deactivate a centre student (Activate / deactivate a centre member account) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student on roster |
| Test Data | reason "Behaviour" |
| Steps | 1. Deactivate student from Students tab. |
| Expected Result | Global `users.status` `suspended`; audit `user.deactivated` with `scope:"student"` and centerId; student notified. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:120-196`. |

##### TC-990 — Deactivate a teacher affiliated with two centres
| Field | Description |
|---|---|
| Test Case ID | TC-990 |
| Requirement ID | FR-461 |
| Module | Super Admin Platform Operations |
| Test Scenario | Deactivate a teacher affiliated with two centres (Activate / deactivate a centre member account) |
| Test Type | Integrity |
| Priority | Critical |
| Preconditions | Teacher at centres A and B |
| Test Data | — |
| Steps | 1. Deactivate at centre A.<br>2. Try teacher sign-in / centre B view. |
| Expected Result | Teacher suspended platform-wide (GAP-190); record against PO answer Q-099. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:120-196`. |

##### TC-991 — Wrong kind / blacklisted / same status
| Field | Description |
|---|---|
| Test Case ID | TC-991 |
| Requirement ID | FR-461 |
| Module | Super Admin Platform Operations |
| Test Scenario | Wrong kind / blacklisted / same status (Activate / deactivate a centre member account) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | teacher id with kind=student; blacklisted user |
| Steps | 1. Send each request. |
| Expected Result | 422 "User is a 'teacher', not a student"; 422 "This account is blacklisted — lift the blacklist first"; 409 "Account is already suspended". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:120-196`. |

##### TC-992 — Remove and restore a student's centre membership
| Field | Description |
|---|---|
| Test Case ID | TC-992 |
| Requirement ID | FR-462 |
| Module | Super Admin Platform Operations |
| Test Scenario | Remove and restore a student's centre membership (Remove / restore a student's centre membership) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student on roster |
| Test Data | reason |
| Steps | 1. Remove (bar).<br>2. Restore. |
| Expected Result | Membership removed then restored; enrolments per rule; audit rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:197-277`; `svc/services/blacklist/blacklist.ts:317-370`. |

##### TC-993 — Remove a student not on roster / without reason
| Field | Description |
|---|---|
| Test Case ID | TC-993 |
| Requirement ID | FR-462 |
| Module | Super Admin Platform Operations |
| Test Scenario | Remove a student not on roster / without reason (Remove / restore a student's centre membership) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Send remove for a non-member.<br>2. Send without reason. |
| Expected Result | 404 "Student is not in this center's roster"; 422 reason required. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts:197-277`; `svc/services/blacklist/blacklist.ts:317-370`. |

##### TC-994 — Centre blacklist add and lift
| Field | Description |
|---|---|
| Test Case ID | TC-994 |
| Requirement ID | FR-463 |
| Module | Super Admin Platform Operations |
| Test Scenario | Centre blacklist add and lift (Centre blacklist (list, add, lift)) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Centre; student |
| Test Data | reason |
| Steps | 1. Add to centre blacklist.<br>2. Lift. |
| Expected Result | Level `center` entry created then inactive; cascade applied and reversed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/blacklist/**`; `svc/backoffice/admin/center-operations.ts`; test `apps/superadmin/tests/db/center-operations.test.ts`. |

##### TC-995 — Duplicate add / DELETE without body
| Field | Description |
|---|---|
| Test Case ID | TC-995 |
| Requirement ID | FR-463 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate add / DELETE without body (Centre blacklist (list, add, lift)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Student already blacklisted at centre |
| Test Data | — |
| Steps | 1. Add again.<br>2. DELETE lift with no JSON body. |
| Expected Result | 409 "Student is already blacklisted at this center"; 400 "Invalid JSON body". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/blacklist/**`; `svc/backoffice/admin/center-operations.ts`; test `apps/superadmin/tests/db/center-operations.test.ts`. |

##### TC-996 — Create, edit, cancel a course and reassign teacher
| Field | Description |
|---|---|
| Test Case ID | TC-996 |
| Requirement ID | FR-464 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create, edit, cancel a course and reassign teacher (Centre courses (create, view, edit, cancel, reassign teacher)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre with teachers |
| Test Data | course name, schedule |
| Steps | 1. Create course.<br>2. Edit.<br>3. Reassign teacher.<br>4. Cancel. |
| Expected Result | Each persisted with audit; acting as centre. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/courses/**`; `svc/backoffice/admin/center-academic.ts`; test `apps/superadmin/tests/db/center-academic.test.ts`. |

##### TC-997 — Course create with invalid dates
| Field | Description |
|---|---|
| Test Case ID | TC-997 |
| Requirement ID | FR-464 |
| Module | Super Admin Platform Operations |
| Test Scenario | Course create with invalid dates (Centre courses (create, view, edit, cancel, reassign teacher)) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | end date before start |
| Steps | 1. Submit course create. |
| Expected Result | Rejected with a validation message (UI reuses the end-time message). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/courses/**`; `svc/backoffice/admin/center-academic.ts`; test `apps/superadmin/tests/db/center-academic.test.ts`. |

##### TC-998 — View enrolments and decide an enrolment request
| Field | Description |
|---|---|
| Test Case ID | TC-998 |
| Requirement ID | FR-465 |
| Module | Super Admin Platform Operations |
| Test Scenario | View enrolments and decide an enrolment request (Centre enrolments and enrolment requests) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending enrolment request |
| Test Data | — |
| Steps | 1. Approve request. |
| Expected Result | Enrolment created; audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/enrollments/**`, `enrollment-requests/**`. |

##### TC-999 — Decide an already-decided request
| Field | Description |
|---|---|
| Test Case ID | TC-999 |
| Requirement ID | FR-465 |
| Module | Super Admin Platform Operations |
| Test Scenario | Decide an already-decided request (Centre enrolments and enrolment requests) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Decided request |
| Test Data | — |
| Steps | 1. Decide again. |
| Expected Result | 422/409 error, no duplicate enrolment. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/enrollments/**`, `enrollment-requests/**`. |

##### TC-1000 — Correct attendance for a session
| Field | Description |
|---|---|
| Test Case ID | TC-1000 |
| Requirement ID | FR-466 |
| Module | Super Admin Platform Operations |
| Test Scenario | Correct attendance for a session (Centre session operations and attendance edits) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Session with attendance |
| Test Data | — |
| Steps | 1. Change a student's attendance. |
| Expected Result | Saved immediately (no confirm, GAP-206) and audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/sessions/**`, `attendance/[attendanceId]/route.ts`. |

##### TC-1001 — Session operation on a settled session
| Field | Description |
|---|---|
| Test Case ID | TC-1001 |
| Requirement ID | FR-466 |
| Module | Super Admin Platform Operations |
| Test Scenario | Session operation on a settled session (Centre session operations and attendance edits) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Settled session |
| Test Data | — |
| Steps | 1. Try Postpone/Cancel. |
| Expected Result | Refused by the service; settlement untouched. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/sessions/**`, `attendance/[attendanceId]/route.ts`. |

##### TC-1002 — Send a centre broadcast
| Field | Description |
|---|---|
| Test Case ID | TC-1002 |
| Requirement ID | FR-467 |
| Module | Super Admin Platform Operations |
| Test Scenario | Send a centre broadcast (Centre broadcast) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Centre with members |
| Test Data | title, body |
| Steps | 1. Send broadcast from header. |
| Expected Result | Recipients notified; audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/broadcast/route.ts`; `svc/backoffice/admin/center-operations.ts` `adminBroadcast`. |

##### TC-1003 — Create collaboration request on behalf of a centre
| Field | Description |
|---|---|
| Test Case ID | TC-1003 |
| Requirement ID | FR-468 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create collaboration request on behalf of a centre (Create a collaboration request on behalf of a centre) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Centre and teacher |
| Test Data | subject, year, hall, schedule |
| Steps | 1. Create request. |
| Expected Result | Request pending; audit names super admin acting as centre. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/collaboration-requests/route.ts`; test `apps/superadmin/tests/db/center-collab-create.test.ts`. |

##### TC-1004 — Invalid collaboration payload
| Field | Description |
|---|---|
| Test Case ID | TC-1004 |
| Requirement ID | FR-468 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invalid collaboration payload (Create a collaboration request on behalf of a centre) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | missing subject |
| Steps | 1. POST. |
| Expected Result | 400 validation. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/centers/[id]/collaboration-requests/route.ts`; test `apps/superadmin/tests/db/center-collab-create.test.ts`. |

##### TC-1005 — Centre reports and dashboard
| Field | Description |
|---|---|
| Test Case ID | TC-1005 |
| Requirement ID | FR-469 |
| Module | Super Admin Platform Operations |
| Test Scenario | Centre reports and dashboard (Centre oversight (non-money tabs), centre dashboard, reports) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Centre with demo data |
| Test Data | report=revenue |
| Steps | 1. Open Reports tab; select each report. |
| Expected Result | Data returned; rendered as raw JSON (GAP-210). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-oversight.ts`; `svc/backoffice/admin/center-platform.ts:18-53`; test `apps/superadmin/tests/db/center-oversight.test.ts`. |

##### TC-1006 — Unknown report key
| Field | Description |
|---|---|
| Test Case ID | TC-1006 |
| Requirement ID | FR-469 |
| Module | Super Admin Platform Operations |
| Test Scenario | Unknown report key (Centre oversight (non-money tabs), centre dashboard, reports) |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | — |
| Test Data | report=foo |
| Steps | 1. GET reports/foo. |
| Expected Result | 404 "Unknown report 'foo'". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-oversight.ts`; `svc/backoffice/admin/center-platform.ts:18-53`; test `apps/superadmin/tests/db/center-oversight.test.ts`. |

##### TC-1007 — Approve a deletion request through the centre path
| Field | Description |
|---|---|
| Test Case ID | TC-1007 |
| Requirement ID | FR-470 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve a deletion request through the centre path (Centre-scoped deletion requests (on behalf of a centre)) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | Pending deletion request for a centre student |
| Test Data | note |
| Steps | 1. Decide approve in centre Deletions tab.<br>2. Inspect user row. |
| Expected Result | User soft-deleted; history kept; audit `center.deletion_request_approved` with `historyPreserved:true` (compare FR-499, GAP-188). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-operations.ts:319-365`; `svc/services/data-rights/account-deletion.ts:272-325`. |

##### TC-1008 — Reject through the centre path
| Field | Description |
|---|---|
| Test Case ID | TC-1008 |
| Requirement ID | FR-470 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reject through the centre path (Centre-scoped deletion requests (on behalf of a centre)) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Pending request |
| Test Data | note |
| Steps | 1. Decide reject. |
| Expected Result | Request rejected; audit `center.deletion_request_rejected`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-operations.ts:319-365`; `svc/services/data-rights/account-deletion.ts:272-325`. |

##### TC-1009 — Create a teacher
| Field | Description |
|---|---|
| Test Case ID | TC-1009 |
| Requirement ID | FR-471 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create a teacher (Teacher directory and create teacher) |
| Test Type | Functional |
| Priority | High |
| Preconditions | — |
| Test Data | name, unique email, Egyptian phone, password per policy |
| Steps | 1. Create teacher. |
| Expected Result | 201; teacher listed; audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`createTeacher`); test `apps/superadmin/tests/db/teacher-control.test.ts`. |

##### TC-1010 — Create teacher with duplicate email/phone
| Field | Description |
|---|---|
| Test Case ID | TC-1010 |
| Requirement ID | FR-471 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create teacher with duplicate email/phone (Teacher directory and create teacher) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Existing teacher |
| Test Data | same email |
| Steps | 1. Create. |
| Expected Result | 409 "An account with this email or phone already exists". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`createTeacher`); test `apps/superadmin/tests/db/teacher-control.test.ts`. |

##### TC-1011 — Edit teacher profile
| Field | Description |
|---|---|
| Test Case ID | TC-1011 |
| Requirement ID | FR-472 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit teacher profile (Teacher detail and profile edit) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher |
| Test Data | new name |
| Steps | 1. Edit and save. |
| Expected Result | Saved; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`updateTeacherProfile`, `assertTeacher`). |

##### TC-1012 — Edit teacher with taken email or non-Egyptian phone
| Field | Description |
|---|---|
| Test Case ID | TC-1012 |
| Requirement ID | FR-472 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit teacher with taken email or non-Egyptian phone (Teacher detail and profile edit) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Two teachers |
| Test Data | other teacher's email; phone "123" |
| Steps | 1. PATCH email.<br>2. PATCH phone. |
| Expected Result | 409 "Another account already uses this email"; phone accepted (GAP-209). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`updateTeacherProfile`, `assertTeacher`). |

##### TC-1013 — Approve a pending teacher
| Field | Description |
|---|---|
| Test Case ID | TC-1013 |
| Requirement ID | FR-473 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve a pending teacher (Approve / reject a teacher registration) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Pending teacher |
| Test Data | — |
| Steps | 1. Approve. |
| Expected Result | Teacher active; audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:317-366` (`approveTeacher`, `rejectTeacher`). |

##### TC-1014 — Reject teacher without reason / already decided
| Field | Description |
|---|---|
| Test Case ID | TC-1014 |
| Requirement ID | FR-473 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reject teacher without reason / already decided (Approve / reject a teacher registration) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Pending / active teacher |
| Test Data | — |
| Steps | 1. Reject with no reason.<br>2. Approve an active teacher. |
| Expected Result | 422 "Reason is required"; 422 "Teacher is already active". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:317-366` (`approveTeacher`, `rejectTeacher`). |

##### TC-1015 — Suspend and reinstate a teacher
| Field | Description |
|---|---|
| Test Case ID | TC-1015 |
| Requirement ID | FR-474 |
| Module | Super Admin Platform Operations |
| Test Scenario | Suspend and reinstate a teacher (Teacher account status (suspend / reinstate)) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Active teacher |
| Test Data | reason |
| Steps | 1. Suspend.<br>2. Reinstate. |
| Expected Result | Status toggles through `users.status`; sessions end on suspend; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`setTeacherStatus`); tests `apps/admin-api/tests/unit/teacher-one-suspension-path.test.ts`, `m15-one-suspension-path.test.ts`. |

##### TC-1016 — Suspend a blacklisted teacher
| Field | Description |
|---|---|
| Test Case ID | TC-1016 |
| Requirement ID | FR-474 |
| Module | Super Admin Platform Operations |
| Test Scenario | Suspend a blacklisted teacher (Teacher account status (suspend / reinstate)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Blacklisted teacher |
| Test Data | — |
| Steps | 1. Suspend. |
| Expected Result | 422 "Lift the blacklist first". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-control.ts` (`setTeacherStatus`); tests `apps/admin-api/tests/unit/teacher-one-suspension-path.test.ts`, `m15-one-suspension-path.test.ts`. |

##### TC-1017 — Change teacher attendance mode
| Field | Description |
|---|---|
| Test Case ID | TC-1017 |
| Requirement ID | FR-475 |
| Module | Super Admin Platform Operations |
| Test Scenario | Change teacher attendance mode (Teacher attendance mode) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher in counter_only |
| Test Data | counter_and_door |
| Steps | 1. Change select. |
| Expected Result | Mode saved immediately; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/teachers/[id]/attendance-mode/route.ts:7`; `svc/backoffice/admin/platform.ts:293` (`setTeacherAttendanceMode`); project CLAUDE.md "Attendance at centers is a per-teacher setting with two modes". |

##### TC-1018 — Invalid attendance mode is rejected
| Field | Description |
|---|---|
| Test Case ID | TC-1018 |
| Requirement ID | FR-475 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invalid attendance mode is rejected (Teacher attendance mode) |
| Test Type | Negative / API |
| Priority | High |
| Preconditions | super_admin signed in; teacher exists |
| Test Data | mode="foo" |
| Steps | 1. `PATCH /api/v1/admin/teachers/<id>/attendance-mode` body `{"mode":"foo"}`.<br>2. Repeat with an unknown teacher id and a valid mode. |
| Expected Result | 1. 400 validation error; mode unchanged; no audit row.<br>2. 404 not_found. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/teachers/[id]/attendance-mode/route.ts:7`; `svc/backoffice/admin/platform.ts:293` (`setTeacherAttendanceMode`); project CLAUDE.md "Attendance at centers is a per-teacher setting with two modes". |

##### TC-1019 — Link and unlink a teacher to a centre
| Field | Description |
|---|---|
| Test Case ID | TC-1019 |
| Requirement ID | FR-476 |
| Module | Super Admin Platform Operations |
| Test Scenario | Link and unlink a teacher to a centre (Link / unlink a teacher to a centre) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Teacher; centre |
| Test Data | — |
| Steps | 1. Link.<br>2. Unlink. |
| Expected Result | Affiliation created then ended; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/teachers/[id]/link-center/route.ts`, `unlink-center/route.ts`; `svc/backoffice/admin/platform.ts:368-430`. |

##### TC-1020 — Duplicate link / unlink missing
| Field | Description |
|---|---|
| Test Case ID | TC-1020 |
| Requirement ID | FR-476 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate link / unlink missing (Link / unlink a teacher to a centre) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Linked teacher |
| Test Data | — |
| Steps | 1. Link again.<br>2. Unlink a non-linked centre. |
| Expected Result | 409 "Teacher is already linked to this center"; 404 "Active affiliation not found". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/teachers/[id]/link-center/route.ts`, `unlink-center/route.ts`; `svc/backoffice/admin/platform.ts:368-430`. |

##### TC-1021 — Teacher oversight tabs are read-only
| Field | Description |
|---|---|
| Test Case ID | TC-1021 |
| Requirement ID | FR-477 |
| Module | Super Admin Platform Operations |
| Test Scenario | Teacher oversight tabs are read-only (Teacher oversight (read-only)) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Teacher with data |
| Test Data | — |
| Steps | 1. Open each non-money tab. |
| Expected Result | Data shown; no write controls. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/teacher-oversight.ts`; test `apps/superadmin/tests/db/teacher-oversight.test.ts`. |

##### TC-1022 — Student directory and detail
| Field | Description |
|---|---|
| Test Case ID | TC-1022 |
| Requirement ID | FR-478 |
| Module | Super Admin Platform Operations |
| Test Scenario | Student directory and detail (Student directory and student detail) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Students |
| Test Data | search text |
| Steps | 1. Search.<br>2. Open a student. |
| Expected Result | Detail loads by profile id. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/students/route.ts`, `v1/admin/students/[id]/route.ts`, `students/[id]/blacklist/route.ts`. |

##### TC-1023 — Profile id vs user id
| Field | Description |
|---|---|
| Test Case ID | TC-1023 |
| Requirement ID | FR-478 |
| Module | Super Admin Platform Operations |
| Test Scenario | Profile id vs user id (Student directory and student detail) |
| Test Type | Negative / Integrity |
| Priority | High |
| Preconditions | Student with known profile and user id |
| Test Data | both ids |
| Steps | 1. GET students/<userId>.<br>2. POST students/<profileId>/blacklist. |
| Expected Result | Record which id each route accepts (GAP-193). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/students/route.ts`, `v1/admin/students/[id]/route.ts`, `students/[id]/blacklist/route.ts`. |

##### TC-1024 — Link and unlink a parent
| Field | Description |
|---|---|
| Test Case ID | TC-1024 |
| Requirement ID | FR-479 |
| Module | Super Admin Platform Operations |
| Test Scenario | Link and unlink a parent (Link / unlink a parent to a student) |
| Test Type | Functional / Child safety |
| Priority | Critical |
| Preconditions | Student; parent account |
| Test Data | parentId |
| Steps | 1. Link via API.<br>2. Unlink. |
| Expected Result | Link created and revoked; audit rows; link row initiator recorded (GAP-194). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:527-600` (`linkParent`, `unlinkParent`). GAP-194. |

##### TC-1025 — Duplicate link / guardian picker
| Field | Description |
|---|---|
| Test Case ID | TC-1025 |
| Requirement ID | FR-479 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate link / guardian picker (Link / unlink a parent to a student) |
| Test Type | Negative / UI |
| Priority | Critical |
| Preconditions | Linked parent |
| Test Data | — |
| Steps | 1. Link again.<br>2. Open guardian picker in UI. |
| Expected Result | 409 "Parent is already linked to this student"; picker likely empty (GAP-204). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/platform.ts:527-600` (`linkParent`, `unlinkParent`). GAP-194. |

##### TC-1026 — Platform blacklist a student
| Field | Description |
|---|---|
| Test Case ID | TC-1026 |
| Requirement ID | FR-480 |
| Module | Super Admin Platform Operations |
| Test Scenario | Platform blacklist a student (Platform blacklist (users / students / teachers doors)) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Active student with enrolments |
| Test Data | reason "Fraud" |
| Steps | 1. POST users/<id>/blacklist.<br>2. Student calls ERP. |
| Expected Result | Status `blacklisted`; platform entry; enrolments unenrolled and journalled; notification; next request 401. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/blacklist/blacklist.ts` (`platformBlacklistUser`, `applyEnrollmentCascade`); test `apps/erp/tests/**/h04-blacklist-cascade-reversal.test.ts`. |

##### TC-1027 — Blacklist audit row
| Field | Description |
|---|---|
| Test Case ID | TC-1027 |
| Requirement ID | FR-480 |
| Module | Super Admin Platform Operations |
| Test Scenario | Blacklist audit row (Platform blacklist (users / students / teachers doors)) |
| Test Type | Audit / Database |
| Priority | Critical |
| Preconditions | After the blacklist TC above |
| Test Data | Entry id returned by the blacklist call |
| Steps | 1. Open Audit log; filter action `blacklist.added`.<br>2. Filter by the user id, then by the entry id.<br>3. Lift the entry; filter action `blacklist.changed`. |
| Expected Result | 1. One row, actor = the super_admin, `afterState.level = "platform"`.<br>2. User-id filter finds nothing; entry-id filter finds the row (GAP-184).<br>3. One row with `isActive=false`, `removedBy` = actor. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/blacklist/blacklist.ts` (`platformBlacklistUser`, `applyEnrollmentCascade`); test `apps/erp/tests/**/h04-blacklist-cascade-reversal.test.ts`. |

##### TC-1028 — Duplicate blacklist / empty reason / door codes
| Field | Description |
|---|---|
| Test Case ID | TC-1028 |
| Requirement ID | FR-480 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate blacklist / empty reason / door codes (Platform blacklist (users / students / teachers doors)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Blacklisted user |
| Test Data | — |
| Steps | 1. Blacklist again.<br>2. Blacklist with empty reason.<br>3. Compare status codes of three doors. |
| Expected Result | 409 "User is already platform-blacklisted"; 422 "Reason is required"; users door 201, others 200 (GAP-196). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/blacklist/blacklist.ts` (`platformBlacklistUser`, `applyEnrollmentCascade`); test `apps/erp/tests/**/h04-blacklist-cascade-reversal.test.ts`. |

##### TC-1029 — Lift a platform blacklist
| Field | Description |
|---|---|
| Test Case ID | TC-1029 |
| Requirement ID | FR-481 |
| Module | Super Admin Platform Operations |
| Test Scenario | Lift a platform blacklist (Blacklist ledger and lift) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | Blacklisted student with journalled cascade |
| Test Data | — |
| Steps | 1. Lift from Blacklist ledger. |
| Expected Result | Entry inactive; status restored; cascaded enrolments back to `prevStatus`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/blacklist/blacklist.ts` (`removeBlacklistEntryTx`, `reverseEnrollmentCascade`). |

##### TC-1030 — Lift twice
| Field | Description |
|---|---|
| Test Case ID | TC-1030 |
| Requirement ID | FR-481 |
| Module | Super Admin Platform Operations |
| Test Scenario | Lift twice (Blacklist ledger and lift) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Lifted entry |
| Test Data | — |
| Steps | 1. Lift again. |
| Expected Result | 404 "Active blacklist entry not found". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/blacklist/blacklist.ts` (`removeBlacklistEntryTx`, `reverseEnrollmentCascade`). |

##### TC-1031 — Move a student between centres
| Field | Description |
|---|---|
| Test Case ID | TC-1031 |
| Requirement ID | FR-482 |
| Module | Super Admin Platform Operations |
| Test Scenario | Move a student between centres (Move a student between centres) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Student on centre A roster; centre B active |
| Test Data | reason |
| Steps | 1. Move to B. |
| Expected Result | Removed from A, added to B; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`moveStudentBetweenCenters`); test `apps/superadmin/tests/db/center-platform.test.ts`. |

##### TC-1032 — Move to the same / inactive centre / without reason
| Field | Description |
|---|---|
| Test Case ID | TC-1032 |
| Requirement ID | FR-482 |
| Module | Super Admin Platform Operations |
| Test Scenario | Move to the same / inactive centre / without reason (Move a student between centres) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Each invalid request. |
| Expected Result | 422 for each. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`moveStudentBetweenCenters`); test `apps/superadmin/tests/db/center-platform.test.ts`. |

##### TC-1033 — Verify a student's DOB
| Field | Description |
|---|---|
| Test Case ID | TC-1033 |
| Requirement ID | FR-483 |
| Module | Super Admin Platform Operations |
| Test Scenario | Verify a student's DOB (Verify a student's date of birth) |
| Test Type | Functional / Child safety |
| Priority | Critical |
| Preconditions | Student without verified DOB |
| Test Data | DOB making them 18+; reason |
| Steps | 1. Verify DOB. |
| Expected Result | `dateOfBirthVerifiedAt` set; adult → parent oversight off; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`verifyStudentDateOfBirth`). |

##### TC-1034 — Future date / no reason
| Field | Description |
|---|---|
| Test Case ID | TC-1034 |
| Requirement ID | FR-483 |
| Module | Super Admin Platform Operations |
| Test Scenario | Future date / no reason (Verify a student's date of birth) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | tomorrow's date |
| Steps | 1. Submit. |
| Expected Result | 422 "Date of birth cannot be in the future"; 422 reason required. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`verifyStudentDateOfBirth`). |

##### TC-1035 — Force logout a user
| Field | Description |
|---|---|
| Test Case ID | TC-1035 |
| Requirement ID | FR-484 |
| Module | Super Admin Platform Operations |
| Test Scenario | Force logout a user (Force logout a user) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | User with active ERP session |
| Test Data | reason |
| Steps | 1. Force logout.<br>2. User refreshes. |
| Expected Result | Sessions revoked; tokenVersion bumped; user signed out. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`forceLogoutUser`). |

##### TC-1036 — Force logout without reason / unknown user
| Field | Description |
|---|---|
| Test Case ID | TC-1036 |
| Requirement ID | FR-484 |
| Module | Super Admin Platform Operations |
| Test Scenario | Force logout without reason / unknown user (Force logout a user) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Send each. |
| Expected Result | 422; 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-platform.ts` (`forceLogoutUser`). |

##### TC-1037 — User directory filters and detail
| Field | Description |
|---|---|
| Test Case ID | TC-1037 |
| Requirement ID | FR-485 |
| Module | Super Admin Platform Operations |
| Test Scenario | User directory filters and detail (User directory and user detail) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Users of all roles |
| Test Data | role=teacher, status=active |
| Steps | 1. Filter.<br>2. Open user. |
| Expected Result | Filtered list with cursor paging; detail shows sessions. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`listUsers`, `getUserDetail`); test `apps/superadmin/tests/db/admin-users.test.ts`. |

##### TC-1038 — Paging limits
| Field | Description |
|---|---|
| Test Case ID | TC-1038 |
| Requirement ID | FR-485 |
| Module | Super Admin Platform Operations |
| Test Scenario | Paging limits (User directory and user detail) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | take=1000 |
| Steps | 1. GET users?take=1000. |
| Expected Result | Capped at the documented maximum. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`listUsers`, `getUserDetail`); test `apps/superadmin/tests/db/admin-users.test.ts`. |

##### TC-1039 — Suspend and reinstate an account with reason
| Field | Description |
|---|---|
| Test Case ID | TC-1039 |
| Requirement ID | FR-486 |
| Module | Super Admin Platform Operations |
| Test Scenario | Suspend and reinstate an account with reason (Suspend / reinstate an account) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Active parent |
| Test Data | reason |
| Steps | 1. Suspend.<br>2. Reinstate. |
| Expected Result | Status changes; sessions end; audit rows with reason. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`setUserSuspended`, `requireReason`, `refuseSelf`); tests `c03-status-revocation.test.ts`, `m15-one-suspension-path.test.ts`. |

##### TC-1040 — Suspend self / no reason / blacklisted
| Field | Description |
|---|---|
| Test Case ID | TC-1040 |
| Requirement ID | FR-486 |
| Module | Super Admin Platform Operations |
| Test Scenario | Suspend self / no reason / blacklisted (Suspend / reinstate an account) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Suspend own account.<br>2. No reason.<br>3. Blacklisted user. |
| Expected Result | 422 "You cannot suspend your own account"; 422 "A reason is required to suspend"; 422 "Lift the blacklist first". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`setUserSuspended`, `requireReason`, `refuseSelf`); tests `c03-status-revocation.test.ts`, `m15-one-suspension-path.test.ts`. |

##### TC-1041 — Revoke all sessions and one session
| Field | Description |
|---|---|
| Test Case ID | TC-1041 |
| Requirement ID | FR-487 |
| Module | Super Admin Platform Operations |
| Test Scenario | Revoke all sessions and one session (Revoke sessions (all, or one)) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | User with 2 sessions |
| Test Data | reason |
| Steps | 1. Revoke one.<br>2. Revoke all. |
| Expected Result | Selected session ended, then all; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`revokeAllSessions`, `revokeOneSession`). |

##### TC-1042 — Revoke own sessions / unknown session
| Field | Description |
|---|---|
| Test Case ID | TC-1042 |
| Requirement ID | FR-487 |
| Module | Super Admin Platform Operations |
| Test Scenario | Revoke own sessions / unknown session (Revoke sessions (all, or one)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Revoke all own sessions.<br>2. Revoke unknown session id. |
| Expected Result | Own revoke allowed (GAP-199); 404 "Session not found". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`revokeAllSessions`, `revokeOneSession`). |

##### TC-1043 — Reset a user's 2FA
| Field | Description |
|---|---|
| Test Case ID | TC-1043 |
| Requirement ID | FR-488 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reset a user's 2FA (Reset a user's 2FA) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Accountant with 2FA |
| Test Data | reason |
| Steps | 1. Reset 2FA.<br>2. Accountant signs in. |
| Expected Result | 2FA removed; must re-enrol before back-office access; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`resetTwoFactor`). |

##### TC-1044 — Reset 2FA when none / on self
| Field | Description |
|---|---|
| Test Case ID | TC-1044 |
| Requirement ID | FR-488 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reset 2FA when none / on self (Reset a user's 2FA) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | User without 2FA; own account |
| Test Data | — |
| Steps | 1. Reset each. |
| Expected Result | 422 "This account does not have 2FA enabled"; self reset allowed (GAP-199). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`resetTwoFactor`). |

##### TC-1045 — Send password reset
| Field | Description |
|---|---|
| Test Case ID | TC-1045 |
| Requirement ID | FR-489 |
| Module | Super Admin Platform Operations |
| Test Scenario | Send password reset (Send a password reset link) |
| Test Type | Functional |
| Priority | Critical |
| Preconditions | Active ERP user with email |
| Test Data | reason |
| Steps | 1. Send reset.<br>2. Check email link host. |
| Expected Result | Email sent; link on ERP host for ERP users; audit `user.password_reset_sent`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`sendPasswordReset`). |

##### TC-1046 — Reset for user with no email / suspended
| Field | Description |
|---|---|
| Test Case ID | TC-1046 |
| Requirement ID | FR-489 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reset for user with no email / suspended (Send a password reset link) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Send each. |
| Expected Result | 422 "This account has no email address to send a reset to"; 422 "Only an active account can be sent a reset link". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`sendPasswordReset`). |

##### TC-1047 — View and reissue a student card
| Field | Description |
|---|---|
| Test Case ID | TC-1047 |
| Requirement ID | FR-490 |
| Module | Super Admin Platform Operations |
| Test Scenario | View and reissue a student card (Student card (view, reissue)) |
| Test Type | Functional / Child safety |
| Priority | Critical |
| Preconditions | Student with card |
| Test Data | reason |
| Steps | 1. View card.<br>2. Reissue. |
| Expected Result | New card; old card QR invalid; code carries no personal data; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/students/student-card.ts:46,186,233`; admin-api `v1/admin/users/[id]/card/route.ts:16-23`. |

##### TC-1048 — Revoke a card
| Field | Description |
|---|---|
| Test Case ID | TC-1048 |
| Requirement ID | FR-490 |
| Module | Super Admin Platform Operations |
| Test Scenario | Revoke a card (Student card (view, reissue)) |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Student card |
| Test Data | reason |
| Steps | 1. Revoke.<br>2. Scan old QR. |
| Expected Result | Card revoked; scan shows invalid; no session minted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/students/student-card.ts:46,186,233`; admin-api `v1/admin/users/[id]/card/route.ts:16-23`. |

##### TC-1049 — Impersonate an accountant and stop
| Field | Description |
|---|---|
| Test Case ID | TC-1049 |
| Requirement ID | FR-491 |
| Module | Super Admin Platform Operations |
| Test Scenario | Impersonate an accountant and stop (Impersonate a back-office account (start / stop)) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Active accountant |
| Test Data | — |
| Steps | 1. Impersonate.<br>2. Perform a read.<br>3. Stop. |
| Expected Result | Session as accountant (2FA skipped); audit start and stop; back to super admin. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`IMPERSONATABLE`, `assertImpersonatable`, `auditImpersonationStart/Stop`); admin-api `v1/admin/impersonation/stop/route.ts` (no `withRole`). |

##### TC-1050 — Impersonate refused targets
| Field | Description |
|---|---|
| Test Case ID | TC-1050 |
| Requirement ID | FR-491 |
| Module | Super Admin Platform Operations |
| Test Scenario | Impersonate refused targets (Impersonate a back-office account (start / stop)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Other super_admin; ERP teacher; suspended accountant |
| Test Data | — |
| Steps | 1. Impersonate each. |
| Expected Result | 422 with the specific message for each. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`IMPERSONATABLE`, `assertImpersonatable`, `auditImpersonationStart/Stop`); admin-api `v1/admin/impersonation/stop/route.ts` (no `withRole`). |

##### TC-1051 — Stop with no impersonation
| Field | Description |
|---|---|
| Test Case ID | TC-1051 |
| Requirement ID | FR-491 |
| Module | Super Admin Platform Operations |
| Test Scenario | Stop with no impersonation (Impersonate a back-office account (start / stop)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Normal session |
| Test Data | — |
| Steps | 1. POST impersonation/stop. |
| Expected Result | 422 "No impersonation is active for this session" (GAP-186). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/admin-users.ts` (`IMPERSONATABLE`, `assertImpersonatable`, `auditImpersonationStart/Stop`); admin-api `v1/admin/impersonation/stop/route.ts` (no `withRole`). |

##### TC-1052 — View-as an ERP teacher
| Field | Description |
|---|---|
| Test Case ID | TC-1052 |
| Requirement ID | FR-492 |
| Module | Super Admin Platform Operations |
| Test Scenario | View-as an ERP teacher ("View as" an ERP user) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | Active teacher |
| Test Data | — |
| Steps | 1. View as.<br>2. ERP opens. |
| Expected Result | ERP session minted for teacher with `impersonatedBy`; jti audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/auth/view-as-token.ts` (`VIEW_AS_TOKEN_TTL_SECONDS = 60`, `VIEW_AS_SESSION_TTL_SECONDS = 3600`, `mintViewAsToken`, `verifyViewAsToken`, `isViewAsExpired`); `svc/backoffice/admin/admin-users.ts` (`assertViewAsTarget`, `startViewAs`). |

##### TC-1053 — Reuse, expire or tamper the view-as token
| Field | Description |
|---|---|
| Test Case ID | TC-1053 |
| Requirement ID | FR-492 |
| Module | Super Admin Platform Operations |
| Test Scenario | Reuse, expire or tamper the view-as token ("View as" an ERP user) |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | Minted token |
| Test Data | token captured from handoff |
| Steps | 1. Claim again.<br>2. Claim after 61 s.<br>3. Change one character. |
| Expected Result | 401 INVALID_TOKEN in each case. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/auth/view-as-token.ts` (`VIEW_AS_TOKEN_TTL_SECONDS = 60`, `VIEW_AS_SESSION_TTL_SECONDS = 3600`, `mintViewAsToken`, `verifyViewAsToken`, `isViewAsExpired`); `svc/backoffice/admin/admin-users.ts` (`assertViewAsTarget`, `startViewAs`). |

##### TC-1054 — View-as session after one hour
| Field | Description |
|---|---|
| Test Case ID | TC-1054 |
| Requirement ID | FR-492 |
| Module | Super Admin Platform Operations |
| Test Scenario | View-as session after one hour ("View as" an ERP user) |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Claimed view-as session |
| Test Data | — |
| Steps | 1. Use session after 60 min. |
| Expected Result | Treated as signed out. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/auth/view-as-token.ts` (`VIEW_AS_TOKEN_TTL_SECONDS = 60`, `VIEW_AS_SESSION_TTL_SECONDS = 3600`, `mintViewAsToken`, `verifyViewAsToken`, `isViewAsExpired`); `svc/backoffice/admin/admin-users.ts` (`assertViewAsTarget`, `startViewAs`). |

##### TC-1055 — Create an accountant
| Field | Description |
|---|---|
| Test Case ID | TC-1055 |
| Requirement ID | FR-493 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create an accountant (Create an accountant account) |
| Test Type | Functional / Security |
| Priority | Critical |
| Preconditions | — |
| Test Data | name, email |
| Steps | 1. Create accountant.<br>2. Accountant signs in. |
| Expected Result | 201; must enrol 2FA; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/accountants.ts`; admin-api `v1/admin/accountants/route.ts:8-17`. |

##### TC-1056 — Duplicate accountant email
| Field | Description |
|---|---|
| Test Case ID | TC-1056 |
| Requirement ID | FR-493 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate accountant email (Create an accountant account) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Existing accountant |
| Test Data | same email |
| Steps | 1. Create. |
| Expected Result | 409. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/accountants.ts`; admin-api `v1/admin/accountants/route.ts:8-17`. |

##### TC-1057 — Create system, stage, grade level, track
| Field | Description |
|---|---|
| Test Case ID | TC-1057 |
| Requirement ID | FR-494 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create system, stage, grade level, track (Catalog hierarchy (systems, stages, grade levels, tracks)) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | — |
| Test Data | code "test-stage", names EN/AR |
| Steps | 1. Create each level in order. |
| Expected Result | Created; audited; visible in onboarding. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts`; test `apps/erp/tests/**/catalog-onboarding.test.ts`. |

##### TC-1058 — Duplicate code / missing parent
| Field | Description |
|---|---|
| Test Case ID | TC-1058 |
| Requirement ID | FR-494 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate code / missing parent (Catalog hierarchy (systems, stages, grade levels, tracks)) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Existing code |
| Test Data | — |
| Steps | 1. Create with same code.<br>2. Create under unknown parent. |
| Expected Result | 409 "code '<code>' already exists"; 404 "Stage not found" etc. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts`; test `apps/erp/tests/**/catalog-onboarding.test.ts`. |

##### TC-1059 — Link a track to a grade level
| Field | Description |
|---|---|
| Test Case ID | TC-1059 |
| Requirement ID | FR-495 |
| Module | Super Admin Platform Operations |
| Test Scenario | Link a track to a grade level (Grade level ↔ track links) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | Same-stage track and grade level |
| Test Data | — |
| Steps | 1. Link. |
| Expected Result | Link created. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (`linkGradeTrack`, `unlinkGradeTrack`). |

##### TC-1060 — Cross-stage link / duplicate link
| Field | Description |
|---|---|
| Test Case ID | TC-1060 |
| Requirement ID | FR-495 |
| Module | Super Admin Platform Operations |
| Test Scenario | Cross-stage link / duplicate link (Grade level ↔ track links) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Track and grade of different stages |
| Test Data | — |
| Steps | 1. Link cross-stage.<br>2. Link twice. |
| Expected Result | 400 "Track and grade level belong to different stages"; 409 "Track already linked to this grade level". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (`linkGradeTrack`, `unlinkGradeTrack`). |

##### TC-1061 — Unlink a track
| Field | Description |
|---|---|
| Test Case ID | TC-1061 |
| Requirement ID | FR-495 |
| Module | Super Admin Platform Operations |
| Test Scenario | Unlink a track (Grade level ↔ track links) |
| Test Type | Integrity |
| Priority | Critical |
| Preconditions | Linked track |
| Test Data | — |
| Steps | 1. Unlink. |
| Expected Result | Row hard-deleted (`catalog-admin.ts:239`, GAP-200); document onboarding effect. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (`linkGradeTrack`, `unlinkGradeTrack`). |

##### TC-1062 — Create and edit a subject
| Field | Description |
|---|---|
| Test Case ID | TC-1062 |
| Requirement ID | FR-496 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create and edit a subject (Subjects) |
| Test Type | Functional |
| Priority | High |
| Preconditions | — |
| Test Data | code, names |
| Steps | 1. Create.<br>2. Edit. |
| Expected Result | Saved and audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts`. |

##### TC-1063 — Duplicate subject code
| Field | Description |
|---|---|
| Test Case ID | TC-1063 |
| Requirement ID | FR-496 |
| Module | Super Admin Platform Operations |
| Test Scenario | Duplicate subject code (Subjects) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Create twice. |
| Expected Result | 409. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts`. |

##### TC-1064 — Create and toggle an offering
| Field | Description |
|---|---|
| Test Case ID | TC-1064 |
| Requirement ID | FR-497 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create and toggle an offering (Subject offerings (track → subject mapping)) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | Track and subject |
| Test Data | — |
| Steps | 1. Create offering.<br>2. Toggle inactive. |
| Expected Result | Offering drives subject auto-assignment; toggle hides it for new students. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (`createOffering`, `deleteOffering`). |

##### TC-1065 — Delete an offering in use
| Field | Description |
|---|---|
| Test Case ID | TC-1065 |
| Requirement ID | FR-497 |
| Module | Super Admin Platform Operations |
| Test Scenario | Delete an offering in use (Subject offerings (track → subject mapping)) |
| Test Type | Integrity / Negative |
| Priority | Critical |
| Preconditions | Offering used by enrolled students |
| Test Data | — |
| Steps | 1. Delete.<br>2. Open an existing student's subjects. |
| Expected Result | Hard delete; record effect (GAP-200, Q-100). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (`createOffering`, `deleteOffering`). |

##### TC-1066 — Approve a subject request with a new subject
| Field | Description |
|---|---|
| Test Case ID | TC-1066 |
| Requirement ID | FR-498 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve a subject request with a new subject (Subject requests (approve / reject)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending subject request |
| Test Data | newSubject |
| Steps | 1. Approve. |
| Expected Result | Subject created; request reviewed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (subject request functions). |

##### TC-1067 — Review twice / no subject
| Field | Description |
|---|---|
| Test Case ID | TC-1067 |
| Requirement ID | FR-498 |
| Module | Super Admin Platform Operations |
| Test Scenario | Review twice / no subject (Subject requests (approve / reject)) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Reviewed request |
| Test Data | — |
| Steps | 1. Review again.<br>2. Approve with neither field. |
| Expected Result | 409 "Request already reviewed"; 400 "Provide subjectId or newSubject". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/catalog/catalog-admin.ts` (subject request functions). |

##### TC-1068 — Approve a platform deletion request
| Field | Description |
|---|---|
| Test Case ID | TC-1068 |
| Requirement ID | FR-499 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve a platform deletion request (Platform account-deletion queue) |
| Test Type | Functional / Integrity |
| Priority | Critical |
| Preconditions | Pending request |
| Test Data | note |
| Steps | 1. Approve.<br>2. User tries sign-in.<br>3. Check ledger rows. |
| Expected Result | Personal data scrubbed; status deleted; tokenVersion+1; ledger kept; audit `account_deletion.executed`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/data-rights/account-deletion.ts` (`approveDeletion`, `rejectDeletion`, `anonymizeApproved`); admin-api `v1/admin/deletion-requests/[id]/route.ts:13-14`; test `apps/erp/tests/**/data-rights.test.ts`. |

##### TC-1069 — Approve without note / reject without reason
| Field | Description |
|---|---|
| Test Case ID | TC-1069 |
| Requirement ID | FR-499 |
| Module | Super Admin Platform Operations |
| Test Scenario | Approve without note / reject without reason (Platform account-deletion queue) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Pending request |
| Test Data | — |
| Steps | 1. Approve with no note.<br>2. Reject with no reason. |
| Expected Result | 422 "A review note is required to approve a deletion"; 422 "A reason is required to reject a deletion request". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/data-rights/account-deletion.ts` (`approveDeletion`, `rejectDeletion`, `anonymizeApproved`); admin-api `v1/admin/deletion-requests/[id]/route.ts:13-14`; test `apps/erp/tests/**/data-rights.test.ts`. |

##### TC-1070 — Anonymize after approve; erase without confirm
| Field | Description |
|---|---|
| Test Case ID | TC-1070 |
| Requirement ID | FR-499 |
| Module | Super Admin Platform Operations |
| Test Scenario | Anonymize after approve; erase without confirm (Platform account-deletion queue) |
| Test Type | Negative / UI |
| Priority | Critical |
| Preconditions | Approved request |
| Test Data | — |
| Steps | 1. POST decision=anonymize.<br>2. Click "Erase details now" in UI. |
| Expected Result | 422 "Already anonymized" (GAP-188); no confirm dialog (GAP-203). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/data-rights/account-deletion.ts` (`approveDeletion`, `rejectDeletion`, `anonymizeApproved`); admin-api `v1/admin/deletion-requests/[id]/route.ts:13-14`; test `apps/erp/tests/**/data-rights.test.ts`. |

##### TC-1071 — Create and toggle a feature flag
| Field | Description |
|---|---|
| Test Case ID | TC-1071 |
| Requirement ID | FR-500 |
| Module | Super Admin Platform Operations |
| Test Scenario | Create and toggle a feature flag (Feature flags) |
| Test Type | Functional |
| Priority | High |
| Preconditions | — |
| Test Data | key "receipts.pdf" |
| Steps | 1. Create.<br>2. Toggle. |
| Expected Result | Saved; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/platform/feature-flags.ts:148-151`; admin-api `v1/admin/feature-flags/route.ts:13-20`. Test: `apps/superadmin/tests/db/maturity-layer.test.ts:189-231` (absent flag = OFF, toggle audited as `feature_flag.updated`, bad key rejected). |

##### TC-1072 — Invalid flag key
| Field | Description |
|---|---|
| Test Case ID | TC-1072 |
| Requirement ID | FR-500 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invalid flag key (Feature flags) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | key "Receipts PDF" |
| Steps | 1. Create. |
| Expected Result | 422 "A feature-flag key must be lowercase, dotted, and free of spaces (e.g. receipts.pdf)". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/platform/feature-flags.ts:148-151`; admin-api `v1/admin/feature-flags/route.ts:13-20`. Test: `apps/superadmin/tests/db/maturity-layer.test.ts:189-231` (absent flag = OFF, toggle audited as `feature_flag.updated`, bad key rejected). |

##### TC-1073 — Filter the audit log
| Field | Description |
|---|---|
| Test Case ID | TC-1073 |
| Requirement ID | FR-501 |
| Module | Super Admin Platform Operations |
| Test Scenario | Filter the audit log (Audit log viewer) |
| Test Type | Functional / Audit |
| Priority | Critical |
| Preconditions | Audit rows exist |
| Test Data | action prefix, actor, date range |
| Steps | 1. Apply filters. |
| Expected Result | Rows match; actor and on-behalf names shown; paged at 50. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/audit-logs/route.ts`, `audit-logs/actions/route.ts`; `svc/backoffice/admin/audit-log.ts`. |

##### TC-1074 — Audit row content after a write
| Field | Description |
|---|---|
| Test Case ID | TC-1074 |
| Requirement ID | FR-501 |
| Module | Super Admin Platform Operations |
| Test Scenario | Audit row content after a write (Audit log viewer) |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Suspend a user with reason.<br>2. Open the row. |
| Expected Result | Row has actor, action, target, before/after, reason, IP. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/audit-logs/route.ts`, `audit-logs/actions/route.ts`; `svc/backoffice/admin/audit-log.ts`. |

##### TC-1075 — Invalid audit filters
| Field | Description |
|---|---|
| Test Case ID | TC-1075 |
| Requirement ID | FR-501 |
| Module | Super Admin Platform Operations |
| Test Scenario | Invalid audit filters (Audit log viewer) |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | — |
| Test Data | from=abc; targetId=123 |
| Steps | 1. GET audit-logs with each. |
| Expected Result | Expected 400; record actual (GAP-198). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/audit-logs/route.ts`, `audit-logs/actions/route.ts`; `svc/backoffice/admin/audit-log.ts`. |

##### TC-1076 — List and decide a collaboration request
| Field | Description |
|---|---|
| Test Case ID | TC-1076 |
| Requirement ID | FR-502 |
| Module | Super Admin Platform Operations |
| Test Scenario | List and decide a collaboration request (Collaboration requests oversight and decision) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Pending request |
| Test Data | — |
| Steps | 1. Decide via API. |
| Expected Result | Accepted → class/schedule created; audited. UI has no decide control (GAP-208). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts` (`decideCollaborationRequest`). |

##### TC-1077 — Decide an expired request
| Field | Description |
|---|---|
| Test Case ID | TC-1077 |
| Requirement ID | FR-502 |
| Module | Super Admin Platform Operations |
| Test Scenario | Decide an expired request (Collaboration requests oversight and decision) |
| Test Type | Negative |
| Priority | High |
| Preconditions | Expired request |
| Test Data | — |
| Steps | 1. Decide. |
| Expected Result | 422 "This request has expired". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/center-control.ts` (`decideCollaborationRequest`). |

##### TC-1078 — Moderate messaging reports
| Field | Description |
|---|---|
| Test Case ID | TC-1078 |
| Requirement ID | FR-503 |
| Module | Super Admin Platform Operations |
| Test Scenario | Moderate messaging reports (Messaging moderation) |
| Test Type | Functional |
| Priority | High |
| Preconditions | Open report |
| Test Data | — |
| Steps | 1. Resolve.<br>2. Remove a message. |
| Expected Result | Report resolved; message removed; audited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/messaging.ts:41-44,84-87,119-122`; admin-api `v1/admin/messaging/**`. |

##### TC-1079 — Remove without JSON body
| Field | Description |
|---|---|
| Test Case ID | TC-1079 |
| Requirement ID | FR-503 |
| Module | Super Admin Platform Operations |
| Test Scenario | Remove without JSON body (Messaging moderation) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | — |
| Steps | 1. DELETE with no body. |
| Expected Result | 400 "Invalid JSON body". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/messaging.ts:41-44,84-87,119-122`; admin-api `v1/admin/messaging/**`. |

##### TC-1080 — Filter the WhatsApp log
| Field | Description |
|---|---|
| Test Case ID | TC-1080 |
| Requirement ID | FR-504 |
| Module | Super Admin Platform Operations |
| Test Scenario | Filter the WhatsApp log (WhatsApp message log) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Demo messages |
| Test Data | status filter |
| Steps | 1. Filter.<br>2. Open a message. |
| Expected Result | List filtered; detail fails (GAP-201). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/whatsapp-messages.ts`; admin-api `v1/admin/whatsapp-messages/route.ts`; test `apps/superadmin/tests/db/whatsapp-log-disclosure.test.ts`. |

##### TC-1081 — Notification history
| Field | Description |
|---|---|
| Test Case ID | TC-1081 |
| Requirement ID | FR-505 |
| Module | Super Admin Platform Operations |
| Test Scenario | Notification history (Notification history) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Notifications exist |
| Test Data | — |
| Steps | 1. Open log. |
| Expected Result | Rows listed with type. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/admin/notifications/history/route.ts`. |

##### TC-1082 — Update contact submission status
| Field | Description |
|---|---|
| Test Case ID | TC-1082 |
| Requirement ID | FR-506 |
| Module | Super Admin Platform Operations |
| Test Scenario | Update contact submission status (Contact form submissions) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | New submission |
| Test Data | status=spam |
| Steps | 1. Mark spam. |
| Expected Result | Status saved immediately. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/backoffice/admin/contact-submissions.ts:113-116`; admin-api `v1/admin/contact-submissions/[id]/status/route.ts:9-10`. |

##### TC-1083 — Global search
| Field | Description |
|---|---|
| Test Case ID | TC-1083 |
| Requirement ID | FR-507 |
| Module | Super Admin Platform Operations |
| Test Scenario | Global search (Global search (back-office)) |
| Test Type | Functional |
| Priority | High |
| Preconditions | — |
| Test Data | query "ab" |
| Steps | 1. Search in palette. |
| Expected Result | At most 5 results per kind; nothing the role cannot open. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/search/global-search.ts:62-63`; tests `apps/superadmin/tests/db/global-search.test.ts`, `apps/erp/tests/**/global-search.test.ts`. |

##### TC-1084 — Short query and accountant reach
| Field | Description |
|---|---|
| Test Case ID | TC-1084 |
| Requirement ID | FR-507 |
| Module | Super Admin Platform Operations |
| Test Scenario | Short query and accountant reach (Global search (back-office)) |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | Accountant session |
| Test Data | query "a" |
| Steps | 1. Search with 1 char.<br>2. Search as accountant. |
| Expected Result | Empty result; accountant sees only kinds its role reads. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/services/search/global-search.ts:62-63`; tests `apps/superadmin/tests/db/global-search.test.ts`, `apps/erp/tests/**/global-search.test.ts`. |

##### TC-1085 — Mark notifications read
| Field | Description |
|---|---|
| Test Case ID | TC-1085 |
| Requirement ID | FR-508 |
| Module | Super Admin Platform Operations |
| Test Scenario | Mark notifications read (Own notifications inbox) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Unread notifications |
| Test Data | — |
| Steps | 1. Mark one.<br>2. Mark all. |
| Expected Result | Read state saved. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/notifications/route.ts`, `[id]/read/route.ts`, `read-all/route.ts`. |

##### TC-1086 — Edit own profile and preferences
| Field | Description |
|---|---|
| Test Case ID | TC-1086 |
| Requirement ID | FR-509 |
| Module | Super Admin Platform Operations |
| Test Scenario | Edit own profile and preferences (Own profile, preferences, SSR session) |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | — |
| Test Data | name |
| Steps | 1. PATCH /api/v1/me. |
| Expected Result | Saved. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/me/route.ts`, `v1/me/prefs/route.ts`, `v1/me/ssr-session/route.ts`; test `apps/admin-api/tests/unit/ssr-session.test.ts`. |

##### TC-1087 — CSP report sink
| Field | Description |
|---|---|
| Test Case ID | TC-1087 |
| Requirement ID | FR-510 |
| Module | Super Admin Platform Operations |
| Test Scenario | CSP report sink (CSP violation report sink) |
| Test Type | Security |
| Priority | Low |
| Preconditions | — |
| Test Data | sample CSP report |
| Steps | 1. POST 61 reports in a minute. |
| Expected Result | First 60 accepted; then 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: admin-api `v1/security/csp-report/route.ts`. |

##### TC-1088 — Audit write is atomic with the change
| Field | Description |
|---|---|
| Test Case ID | TC-1088 |
| Requirement ID | FR-511 |
| Module | Super Admin Platform Operations |
| Test Scenario | Audit write is atomic with the change (Audit-write invariant and ERP revalidation) |
| Test Type | Audit / Integrity |
| Priority | Critical |
| Preconditions | — |
| Test Data | Force audit failure (test env) |
| Steps | 1. Run a write with audit failing. |
| Expected Result | Whole change rolled back (test `h3-audit-atomicity`). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/audit/admin-audit.ts:38` (`writeAdminAudit`); some services write `tx.auditLog.create` directly (messaging, feature flags, student card, contact, account deletion); `apps/admin-api/src/erp-revalidate.ts`; tests `h3-audit-atomicity.test.ts`, `admin02-back-office-audit.test.ts`, `erp-revalidate.test.ts`. |

##### TC-1089 — ERP sees the change after a super-admin write
| Field | Description |
|---|---|
| Test Case ID | TC-1089 |
| Requirement ID | FR-511 |
| Module | Super Admin Platform Operations |
| Test Scenario | ERP sees the change after a super-admin write (Audit-write invariant and ERP revalidation) |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | — |
| Test Data | — |
| Steps | 1. Edit centre name.<br>2. Open ERP. |
| Expected Result | Revalidated data shown. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `svc/audit/admin-audit.ts:38` (`writeAdminAudit`); some services write `tx.auditLog.create` directly (messaging, feature flags, student card, contact, account deletion); `apps/admin-api/src/erp-revalidate.ts`; tests `h3-audit-atomicity.test.ts`, `admin02-back-office-audit.test.ts`, `erp-revalidate.test.ts`. |

##### TC-1090 — Own 2FA enrolment and session list
| Field | Description |
|---|---|
| Test Case ID | TC-1090 |
| Requirement ID | FR-512 |
| Module | Super Admin Platform Operations |
| Test Scenario | Own 2FA enrolment and session list (Own security page (sessions, 2FA enrolment)) |
| Test Type | Functional / Security |
| Priority | High |
| Preconditions | super_admin without 2FA |
| Test Data | authenticator app |
| Steps | 1. Enrol 2FA.<br>2. View sessions.<br>3. Sign out one. |
| Expected Result | 2FA active; sessions listed; chosen session ended. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `apps/superadmin/src/app/[locale]/two-factor-setup/**`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/security/**`. |

##### TC-1091 — Security page errors
| Field | Description |
|---|---|
| Test Case ID | TC-1091 |
| Requirement ID | FR-512 |
| Module | Super Admin Platform Operations |
| Test Scenario | Security page errors (Own security page (sessions, 2FA enrolment)) |
| Test Type | Negative |
| Priority | High |
| Preconditions | — |
| Test Data | Wrong password |
| Steps | 1. Enter wrong password. |
| Expected Result | Error shown (generic toast noted in ui.md). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence: `apps/superadmin/src/app/[locale]/two-factor-setup/**`; `apps/superadmin/src/app/[locale]/dashboard/superadmin/security/**`. |

### 11. Finance & Accounting (Back-office)

Conventions: Module is always "Finance & Accounting (Back-office)". Test accounts: one `super_admin` (SA) and one `accountant` (ACC) back-office account with 2FA completed — emails and password: see `docs/guides/test-credentials.md`. Where two different people are needed (maker-checker) use SA + ACC, or two ACC accounts. Amounts are integer piasters unless "EGP" is written. All API calls go to `apps/admin-api` under `/api/v1/…` with the back-office session cookie. "Actual Result" is `_To be filled by tester_` and "Status" is `Not Run` for every case. Environment for all cases: `dev` (`edura-env:dev`) unless the tester states otherwise.

##### TC-1092 — Finance dashboard renders totals for an accountant
| Field | Description |
|---|---|
| Test Case ID | TC-1092 |
| Requirement ID | FR-513 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | ACC opens the Finance overview and sees the four KPI cards populated from the ledger. |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | ACC logged in with 2FA; demo ledger data present (`is_demo = true`). |
| Test Data | none |
| Steps | 1. Open `/en/dashboard/finance`. 2. Observe the cards "Gross revenue", "Refunds", "Expenses", "Net retained by the platform". 3. Call `GET /api/v1/finance/dashboard` and compare. |
| Expected Result | 200 `{data}`; the card values equal the API values; response has `Cache-Control: no-store`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `accountant.ts` `financeDashboard`. |

##### TC-1093 — Dashboard open-payout counter includes approved-but-unpaid payouts
| Field | Description |
|---|---|
| Test Case ID | TC-1093 |
| Requirement ID | FR-513 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | An approved payout still counts as open until paid. |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | One `pending` payout approved via TC-1119. |
| Test Data | payout id from TC-1119 |
| Steps | 1. Read `GET finance/dashboard` before approval. 2. Approve. 3. Read again. |
| Expected Result | Open-payout counter unchanged between steps 1 and 3 (approved counts as open); it drops only after TC-1122. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | mirrors `m03-payout-maker-checker.test.ts` [6]. |

##### TC-1094 — Large refund appears in finance alerts
| Field | Description |
|---|---|
| Test Case ID | TC-1094 |
| Requirement ID | FR-514 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | A refund above 5,000,000 piasters is listed under `large_refunds`. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | SA; a completed lesson charge of 5,000,100 piasters for a demo student (seed data, `is_demo`). |
| Test Data | `{sessionId, studentId, reason:"QA large refund"}` |
| Steps | 1. `POST finance/refunds`. 2. `GET finance/alerts`. |
| Expected Result | Alert group `large_refunds` contains the refund; a refund of exactly 5,000,000 is NOT listed (threshold is "exceeds"). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-421. |

##### TC-1095 — Transactions list filters by type and date range
| Field | Description |
|---|---|
| Test Case ID | TC-1095 |
| Requirement ID | FR-515 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Filtering returns only matching ledger rows with correct meta. |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | ACC; ledger contains rows of several types. |
| Test Data | `?type=payout&from=<month start>&to=<month end>&page=1&limit=20` |
| Steps | 1. Call `GET finance/transactions` with the query. 2. Inspect every row. |
| Expected Result | Every row has `type = payout`, `createdAt` in range, `refNumber` matching `TXN-\d{4}-\d{5}`; `meta.total` ≥ rows returned; `meta.limit = 20`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-423. |

##### TC-1096 — Transactions pagination clamps invalid page/limit
| Field | Description |
|---|---|
| Test Case ID | TC-1096 |
| Requirement ID | FR-515 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Non-numeric or out-of-range paging is clamped rather than rejected. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | ACC. |
| Test Data | `?page=abc&limit=99999` |
| Steps | 1. Call `GET finance/transactions?page=abc&limit=99999`. |
| Expected Result | 200; `meta.page = 1`; `meta.limit` equals `PAGE_LIMIT_MAX` (value in `packages/server-core/src/backoffice/http/query.ts`). Record the value observed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-592 contrasts with the settlements route. |

##### TC-1097 — Accountant lists subscriptions through the finance route
| Field | Description |
|---|---|
| Test Case ID | TC-1097 |
| Requirement ID | FR-516 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | `finance/subscriptions` returns rows + meta for ACC. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | ACC; demo subscriptions. |
| Test Data | `?status=active&page=1&limit=10` |
| Steps | 1. Call the route. 2. Open `/en/dashboard/finance/subscriptions`. |
| Expected Result | 200 with `meta.total`; screen renders the same rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1098 — Accountant denied on the admin subscriptions route
| Field | Description |
|---|---|
| Test Case ID | TC-1098 |
| Requirement ID | FR-516 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Role split between `finance/*` and `admin/*`. |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | ACC session. |
| Test Data | none |
| Steps | 1. Call `GET /api/v1/admin/subscriptions`. |
| Expected Result | 403 `{error:{code:"forbidden", message:"Role 'accountant' is not allowed (need one of: super_admin)"}}`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-587. |

##### TC-1099 — Super admin lists online payment intents
| Field | Description |
|---|---|
| Test Case ID | TC-1099 |
| Requirement ID | FR-517 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Intents list with raw webhook payload drawer. |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | SA; demo Paymob intents (mock mode). |
| Test Data | none |
| Steps | 1. Open `/en/dashboard/superadmin/payments`. 2. Open one row's "Raw webhook payload". |
| Expected Result | Table lists intents with status and purpose; drawer shows the payload JSON. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1100 — Accountant payments page targets a missing route
| Field | Description |
|---|---|
| Test Case ID | TC-1100 |
| Requirement ID | FR-517 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Confirm the defect that `finance/payments` calls `finance/payment-intents`, which has no route. |
| Test Type | Negative / UI |
| Priority | Medium |
| Preconditions | ACC session. |
| Test Data | none |
| Steps | 1. Open `/en/dashboard/finance/payments`. 2. Watch the network call. |
| Expected Result | (current code) request to `/api/v1/finance/payment-intents` fails (404 or 403) and the screen shows its error state. Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-224). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-224. |

##### TC-1101 — Revenue report defaults to monthly buckets
| Field | Description |
|---|---|
| Test Case ID | TC-1101 |
| Requirement ID | FR-518 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Unknown `period` falls back to monthly; daily and yearly work. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | ACC; ledger spans ≥2 months. |
| Test Data | `?period=weekly`, `?period=daily`, `?period=yearly` |
| Steps | 1. Call each variant. |
| Expected Result | `weekly` returns monthly buckets; buckets ascending; ≤ 300 buckets; `net = gross − refunds` per bucket. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | no UI tab consumes this route. |

##### TC-1102 — Trial balance platform net equals the dashboard for the same range
| Field | Description |
|---|---|
| Test Case ID | TC-1102 |
| Requirement ID | FR-519 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Two reads of the same ledger agree. |
| Test Type | Functional / Reconciliation |
| Priority | Medium |
| Preconditions | ACC. |
| Test Data | `from`/`to` = current month |
| Steps | 1. `GET finance/reports/trial-balance?from&to`. 2. Open the "Trial balance" tab with the same dates. 3. Compare "Platform net" with the dashboard "Net retained by the platform" for the same period. |
| Expected Result | Values identical; empty period shows "Nothing in this period." |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-402, BR-422. |

##### TC-1103 — Refunds report lists a refund issued today
| Field | Description |
|---|---|
| Test Case ID | TC-1103 |
| Requirement ID | FR-520 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | A refund from TC-1133 appears with its reference. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | TC-1133 executed. |
| Test Data | today's date range |
| Steps | 1. `GET finance/reports/refunds?from=<today>&to=<today>`. |
| Expected Result | Row with `type = refund`, amount 10000, `reversalOfId` set; ≤ 500 rows (GAP-221). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1104 — Teacher statement net equals wallet plus paid payouts
| Field | Description |
|---|---|
| Test Case ID | TC-1104 |
| Requirement ID | FR-521 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Statement reconciliation after a payout is paid. |
| Test Type | Functional / Reconciliation |
| Priority | High |
| Preconditions | Teacher with earnings; TC-1122 paid one payout for that teacher. |
| Test Data | teacher id |
| Steps | 1. `GET finance/reports/teacher-statement/<teacherId>`. 2. Read `walletBalance`, `payouts`, `net`. |
| Expected Result | `net = walletBalance + Σ payouts`; rows include the `payout` ledger row from TC-1123. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | mirrors `m16-teacher-statement.test.ts`. |

##### TC-1105 — Statement for an unknown or malformed id returns 404
| Field | Description |
|---|---|
| Test Case ID | TC-1105 |
| Requirement ID | FR-521 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Bad ids are mapped to `not_found`, not 500. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | ACC. |
| Test Data | `not-a-uuid`; a random valid uuid |
| Steps | 1. Call `GET finance/reports/center-statement/not-a-uuid`. 2. Call with the random uuid. |
| Expected Result | Both 404 `{error:{code:"not_found", message:"Resource not found"}}` (or the service's specific not-found message). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-600. |

##### TC-1106 — Invoice list filters by type and centre
| Field | Description |
|---|---|
| Test Case ID | TC-1106 |
| Requirement ID | FR-522 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Filtered listing with pagination. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | ACC; invoices of ≥2 types exist (TC-1108). |
| Test Data | `?type=teacher_statement&page=1&limit=10` |
| Steps | 1. Call `GET finance/invoices`. 2. Open `/en/dashboard/finance/invoices` with the same filter. |
| Expected Result | Only `teacher_statement` rows; `invoiceNumber` matches `INV-\d{4}-\d{5}`; `netAmount = subtotal − commission`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1107 — Invoice detail for unknown id
| Field | Description |
|---|---|
| Test Case ID | TC-1107 |
| Requirement ID | FR-522 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | 404 "Invoice not found". |
| Test Type | Negative / API |
| Priority | Low |
| Preconditions | ACC. |
| Test Data | random uuid |
| Steps | 1. `GET finance/invoices/<uuid>`. |
| Expected Result | 404 with message "Invoice not found" (`invoices.ts:77`). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1108 — Generate a teacher statement invoice
| Field | Description |
|---|---|
| Test Case ID | TC-1108 |
| Requirement ID | FR-523 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Happy path with numbering and audit. |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | ACC; teacher with completed lessons in the period. |
| Test Data | `{type:"teacher_statement", issuedToId:<teacherId>, periodStart:"2026-10-01", periodEnd:"2026-10-31"}` |
| Steps | 1. `POST finance/invoices`. 2. Read `audit_logs` (SA UI or DB read-only) for action `finance.invoice_generated`. |
| Expected Result | 201; `status = issued`; next `INV-2026-NNNNN` in sequence; audit row with the invoice id as target. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `invoices.ts:161, 171`. |

##### TC-1109 — `student_invoice` passes validation but is refused by the service
| Field | Description |
|---|---|
| Test Case ID | TC-1109 |
| Requirement ID | FR-523 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Schema/service conflict. |
| Test Type | Negative / API |
| Priority | High |
| Preconditions | ACC. |
| Test Data | `{type:"student_invoice", issuedToId:<studentId>}` |
| Steps | 1. `POST finance/invoices`. |
| Expected Result | (current code) 422 "Unsupported invoice type: student_invoice". Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-213). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-578. |

##### TC-1110 — Invoice period validation
| Field | Description |
|---|---|
| Test Case ID | TC-1110 |
| Requirement ID | FR-523 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Reversed and unparsable periods are refused without creating a row. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | ACC. |
| Test Data | (a) `periodStart:"2026-10-31", periodEnd:"2026-10-01"`; (b) `periodStart:"yesterday"` |
| Steps | 1. POST (a). 2. POST (b). 3. Count invoices. |
| Expected Result | (a) 422 "periodEnd cannot be before periodStart"; (b) 422 "periodStart is not a valid date"; invoice count unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-579. |

##### TC-1111 — Invoice PDF download
| Field | Description |
|---|---|
| Test Case ID | TC-1111 |
| Requirement ID | FR-524 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Inline PDF with the invoice number as file name. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | Invoice from TC-1108. |
| Test Data | invoice id |
| Steps | 1. Click "Download PDF" or `GET finance/invoices/<id>/pdf`. |
| Expected Result | 200 `content-type: application/pdf`, `content-disposition: inline; filename="INV-2026-NNNNN.pdf"`; the PDF shows the same subtotal/commission/net as the list row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1112 — Send invoice by email
| Field | Description |
|---|---|
| Test Case ID | TC-1112 |
| Requirement ID | FR-525 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Confirmation dialog then send. |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Invoice with a recipient who has an email; dev mail sink available (delivery owned by "Messaging & Notifications"). |
| Test Data | invoice id |
| Steps | 1. Click "Send by email". 2. Confirm "Email this invoice?". |
| Expected Result | Toast "Invoice sent"; 200 from `POST …/send-email`; message visible in the dev mail sink. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | response shape UNKNOWN; record it. |

##### TC-1113 — Send email refused when the invoice has no recipient
| Field | Description |
|---|---|
| Test Case ID | TC-1113 |
| Requirement ID | FR-525 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | `payment_receipt` without `issuedToId`. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | A `payment_receipt` invoice with `issuedToId = null`. |
| Test Data | invoice id |
| Steps | 1. `POST finance/invoices/<id>/send-email`. |
| Expected Result | 422 "Invoice has no recipient to email". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-580. |

##### TC-1114 — Payout status counts match the tab contents
| Field | Description |
|---|---|
| Test Case ID | TC-1114 |
| Requirement ID | FR-526 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Each tab count equals the number of rows listed for that status. |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Payouts in each of pending/approved/paid/rejected (≤ 200 each). |
| Test Data | none |
| Steps | 1. `GET finance/payouts/counts`. 2. For each status `GET finance/payouts?status=<s>`. 3. Open `/en/dashboard/finance/payouts`. |
| Expected Result | Counts equal row counts; pending rows show the badge "Awaiting disbursement". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1115 — Cancelled payout is invisible to the back office
| Field | Description |
|---|---|
| Test Case ID | TC-1115 |
| Requirement ID | FR-526 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | ERP-side cancellation removes the row from every tab and count. |
| Test Type | Negative / Integration |
| Priority | High |
| Preconditions | A `pending` payout cancelled by its beneficiary in the ERP (owned by "Payments, Subscriptions, Wallets & Settlement"). |
| Test Data | payout id |
| Steps | 1. `GET finance/payouts/counts`. 2. `GET finance/payouts?status=cancelled`. 3. `POST …/<id>/approve`. |
| Expected Result | (current code) counts have no `cancelled` key; the list call returns it only because the enum allows it, but the UI offers no tab; approve → 422 "Payout is already cancelled". Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-214). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-571. |

##### TC-1116 — Generate month-end payouts creates one pending payout per positive wallet
| Field | Description |
|---|---|
| Test Case ID | TC-1116 |
| Requirement ID | FR-527 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Happy path; no money moves. |
| Test Type | Functional / API |
| Priority | Critical |
| Preconditions | ACC; teacher wallet 15000, no open payout; centre wallet 0. |
| Test Data | none |
| Steps | 1. Record wallets. 2. Click "Generate month-end payouts" (`POST finance/payouts`). 3. Re-read wallets and payouts. |
| Expected Result | 201 `{generated:1}`; payout `{status:pending, netPayable:15000, grossAmount = 15000 + commission, generatedBy = ACC id}`; wallets unchanged; toast "Month-end payout generation complete". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `payouts.ts:80-93`. |

##### TC-1117 — Re-running generation creates nothing while payouts are open
| Field | Description |
|---|---|
| Test Case ID | TC-1117 |
| Requirement ID | FR-527 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Reserved balance = open pending + approved. |
| Test Type | Functional / Idempotency |
| Priority | Critical |
| Preconditions | TC-1116 done; optionally approve the payout first. |
| Test Data | none |
| Steps | 1. `POST finance/payouts` again. 2. Approve the payout; run again. |
| Expected Result | Both runs return `generated: 0`; no duplicate payout rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-570; BR-413. |

##### TC-1118 — Generation writes a `payout.generated` audit row
| Field | Description |
|---|---|
| Test Case ID | TC-1118 |
| Requirement ID | FR-527 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Audit per money write. |
| Test Type | Audit |
| Priority | Critical |
| Preconditions | TC-1116. |
| Test Data | none |
| Steps | 1. Read `audit_logs` for `payout.generated` after the run. |
| Expected Result | At least one row per run with actor = ACC id and the generated count in details. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `payouts.ts:99, 165`. |

##### TC-1119 — Approve by a different person moves pending to approved without moving money
| Field | Description |
|---|---|
| Test Case ID | TC-1119 |
| Requirement ID | FR-528 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Checker step 1. |
| Test Type | Functional / UI |
| Priority | Critical |
| Preconditions | Payout generated by ACC (TC-1116); SA logged in. |
| Test Data | payout id |
| Steps | 1. As SA open payouts, press "Approve" twice (armed button). 2. Confirm "Approve this payout?". 3. Read the teacher wallet and `audit_logs`. |
| Expected Result | 200 `{status:"approved", approvedBy:<SA id>}`; toast "Approved — a second person now records the transfer"; wallet unchanged; audit `payout.approved`; beneficiary notification `payout_approved` queued. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1120 — Generator cannot approve their own payout
| Field | Description |
|---|---|
| Test Case ID | TC-1120 |
| Requirement ID | FR-528 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Maker ≠ checker. |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | Payout generated by ACC. |
| Test Data | payout id |
| Steps | 1. As the same ACC `POST finance/payouts/<id>/approve`. |
| Expected Result | 422 "You generated this payout — a different person must approve it"; status stays `pending`; UI shows `clearanceBlocked`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-564; BR-415 binds SA too. |

##### TC-1121 — Concurrent approvals of one payout
| Field | Description |
|---|---|
| Test Case ID | TC-1121 |
| Requirement ID | FR-528 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Exactly one approve wins. |
| Test Type | Concurrency / API |
| Priority | Critical |
| Preconditions | Pending payout; two eligible accounts. |
| Test Data | payout id |
| Steps | 1. Fire two `approve` calls within the same second (script). |
| Expected Result | One 200, one 422 "Payout is already approved"; one `payout.approved` audit row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-566. |

##### TC-1122 — Mark paid decrements the wallet and writes one ledger row
| Field | Description |
|---|---|
| Test Case ID | TC-1122 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Checker step 2 — the only step that moves money. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | Payout approved by SA (TC-1119); ACC (≠ approver) logged in; teacher wallet 15000. |
| Test Data | `{externalRef:"QA-TRF-0001"}` |
| Steps | 1. "Mark paid" → enter the reference → confirm. 2. Read wallet, `transactions`, `audit_logs`. |
| Expected Result | 200 `{status:"paid", paidBy:<ACC id>, externalRef, paidAt}`; wallet 0; one `transactions` row `{type:payout, amount:15000, status:completed, notes:"Payout <id> — transfer ref QA-TRF-0001"}`; audit `payout.paid`; toast "Paid and written to the ledger". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `payouts.ts:356-370`. |

##### TC-1123 — Approver cannot mark the same payout paid
| Field | Description |
|---|---|
| Test Case ID | TC-1123 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Second maker-checker lock. |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | Payout approved by SA. |
| Test Data | `{externalRef:"QA-TRF-0002"}` |
| Steps | 1. As SA `POST …/pay`. |
| Expected Result | 422 "The person who approved a payout cannot also mark it paid"; wallet unchanged; no ledger row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-565. |

##### TC-1124 — Duplicate transfer reference is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1124 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Reference uniqueness across payouts. |
| Test Type | Negative / Data integrity |
| Priority | Critical |
| Preconditions | TC-1122 paid with `QA-TRF-0001`; a second approved payout. |
| Test Data | `{externalRef:"QA-TRF-0001"}` |
| Steps | 1. `POST …/<second id>/pay`. |
| Expected Result | 422 "This transfer reference was already used for another payout"; second payout stays `approved`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-567; partial unique `payouts_external_ref_unique`. |

##### TC-1125 — Insufficient wallet at pay time leaves everything untouched
| Field | Description |
|---|---|
| Test Case ID | TC-1125 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | H2 conditional decrement. |
| Test Type | Negative / Money |
| Priority | Critical |
| Preconditions | Approved payout `netPayable 15000`; a refund (TC-1133) clawed back 6800 from the same teacher wallet so it now holds 8200. |
| Test Data | `{externalRef:"QA-TRF-0003"}` |
| Steps | 1. `POST …/pay`. 2. Read wallet, payout, ledger. |
| Expected Result | 422 "Insufficient wallet balance to settle this payout"; payout stays `approved`; wallet 8200; no `payout` ledger row; no `payout.paid` audit. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-569; BR-417. |

##### TC-1126 — Mark paid requires a reference of 3–120 characters
| Field | Description |
|---|---|
| Test Case ID | TC-1126 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Validation at UI and API. |
| Test Type | Validation |
| Priority | High |
| Preconditions | Approved payout; eligible payer. |
| Test Data | `""`, `"ab"`, 121-character string |
| Steps | 1. In the dialog submit an empty reference. 2. API POST with `"ab"` and with 121 chars. |
| Expected Result | UI message "A transfer reference is required — a payment with no reference cannot be reconciled."; API 400 `validation_error` with `fields.externalRef`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-416. |

##### TC-1127 — Reject a pending payout with a reason
| Field | Description |
|---|---|
| Test Case ID | TC-1127 |
| Requirement ID | FR-530 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Happy path. |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | Pending payout. |
| Test Data | `{reason:"QA reject — bank details missing"}` |
| Steps | 1. Row "Reject" → enter reason → confirm. 2. Read the payout and wallet. |
| Expected Result | 200 `{status:"rejected", rejectionReason}`; wallet unchanged; row moves to the "rejected" tab; audit `payout.decided` present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1128 — Reject without a reason and reject a paid payout
| Field | Description |
|---|---|
| Test Case ID | TC-1128 |
| Requirement ID | FR-530 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Validation and terminal-state guard. |
| Test Type | Negative |
| Priority | High |
| Preconditions | One pending, one paid payout. |
| Test Data | `{reason:""}`; `{reason:"late"}` on the paid one |
| Steps | 1. Submit the dialog empty. 2. API POST empty reason. 3. API POST on the paid payout. |
| Expected Result | UI "A reason is required — a rejection with no reason cannot be explained to anyone."; API 400 `validation_error`; paid payout → 422 "Payout is already paid". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1129 — Rejecting an approved payout overwrites `approvedBy`
| Field | Description |
|---|---|
| Test Case ID | TC-1129 |
| Requirement ID | FR-530 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Attribution defect check. |
| Test Type | Audit / Negative |
| Priority | Medium |
| Preconditions | Payout approved by SA; ACC rejects it. |
| Test Data | `{reason:"QA — wrong beneficiary"}` |
| Steps | 1. ACC `POST …/reject`. 2. Read the payout row's `approvedBy`. 3. Read the `payout.approved` audit row. |
| Expected Result | (current code) `approvedBy` = ACC id (the rejecter), original approver only recoverable from the audit row. Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-217). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-572. |

##### TC-1130 — Receipt of a paid payout
| Field | Description |
|---|---|
| Test Case ID | TC-1130 |
| Requirement ID | FR-531 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Receipt figures reconcile. |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | TC-1122. |
| Test Data | payout id |
| Steps | 1. Click "Receipt" / `GET …/receipt`. |
| Expected Result | 200 with `netPayable = grossAmount − commission`, `externalRef = "QA-TRF-0001"`, `paidAt` set. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1131 — Receipt before payment is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1131 |
| Requirement ID | FR-531 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Approved payout has no receipt. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | Approved payout. |
| Test Data | payout id |
| Steps | 1. `GET …/receipt`. |
| Expected Result | 422 "Payout has no receipt until paid"; UI shows no "Receipt" link for non-paid rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1132 — Accountant cannot refund
| Field | Description |
|---|---|
| Test Case ID | TC-1132 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Refund is super_admin only. |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | ACC session. |
| Test Data | valid `{sessionId, studentId, reason}` |
| Steps | 1. `POST finance/refunds`. |
| Expected Result | 403 `forbidden` "Role 'accountant' is not allowed (need one of: super_admin)"; no ledger change. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1133 — No-room refund: worked split example
| Field | Description |
|---|---|
| Test Case ID | TC-1133 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | price 10000, fees 200/200, affiliation centerShare 3000. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; completed `lesson_fee` charge of 10000 for a demo student in a no-room centre course; global fees 200/200; affiliation `centerShare 3000`; teacher wallet ≥ 6800, centre wallet ≥ 2800; student paid from own wallet. |
| Test Data | `{sessionId, studentId, reason:"QA no-room refund"}` |
| Steps | 1. Record student, teacher, centre wallets. 2. POST. 3. Read wallets, `transactions`, `audit_logs`. |
| Expected Result | 200 `{refunded:10000, teacherNet:6800, centerNet:2800, creditedTo:"student"}`; student +10000; teacher −6800; centre −2800; three new rows: `refund 10000` (centre→student, `reversalOfId`), two `adjustment` rows 200 and 200; audit `refund.issued` with `creditedUserId` = student user id. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-406, BR-409. |

##### TC-1134 — Refund the same lesson twice (sequential and concurrent)
| Field | Description |
|---|---|
| Test Case ID | TC-1134 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Idempotency guard. |
| Test Type | Concurrency / Negative |
| Priority | Critical |
| Preconditions | TC-1133; a second refundable charge for the concurrent part. |
| Test Data | same body as TC-1133 |
| Steps | 1. POST again. 2. On the second charge fire two POSTs simultaneously. |
| Expected Result | Sequential: 422 already refunded. Concurrent: one 200 and one 422 (P2002 → 422); ledger rows written once; wallets credited once. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-575; `h3-refund-race`. |

##### TC-1135 — Refund refused when the teacher share was already paid out
| Field | Description |
|---|---|
| Test Case ID | TC-1135 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Clawback shortfall → full rollback. |
| Test Type | Negative / Money |
| Priority | Critical |
| Preconditions | Teacher wallet paid out to 0 (TC-1122) after a refundable 10000 charge. |
| Test Data | `{sessionId, studentId, reason:"QA after payout"}` |
| Steps | 1. POST. 2. Read all wallets and ledger. |
| Expected Result | 422 "The teacher wallet no longer holds this lesson's share — it was already paid out. Recover the amount from the next payout, then refund."; student not credited; no ledger rows; no audit `refund.issued`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-576; BR-408. |

##### TC-1136 — Parent-paid lesson credits the parent wallet
| Field | Description |
|---|---|
| Test Case ID | TC-1136 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Refund credits the payer; ledger direction unchanged. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | Charge whose `payments.payer_user_id` is a parent with an approved parent–student link. |
| Test Data | `{sessionId, studentId, reason:"QA parent refund"}` |
| Steps | 1. Record parent and student wallets. 2. POST. 3. Read the `refund` ledger row. |
| Expected Result | `creditedTo:"parent"`, parent wallet +price, student wallet unchanged; ledger row `fromEntityId = centerId`, `toEntityId = studentId` (not the parent). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-406, BR-407; `refund-payer-wallet.test.ts`. |

##### TC-1137 — Refund of a `center_held` charge reverses the credit ledger
| Field | Description |
|---|---|
| Test Case ID | TC-1137 |
| Requirement ID | FR-532 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Centre wallet is not decremented; `center_wallet_ledger` gets `refund_reversal`. |
| Test Type | Functional / Money |
| Priority | High |
| Preconditions | A completed charge with `center_held` channel (seeded). |
| Test Data | `{sessionId, studentId, reason:"QA center_held"}` |
| Steps | 1. Record centre wallet and credit balance. 2. POST. 3. Read `center_wallet_ledger`. |
| Expected Result | Centre `walletBalance` unchanged; `center_wallet_ledger` row `refund_reversal −centerNet`; student credited. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-595; BR-429. |

##### TC-1138 — Super admin updates global commission with audit
| Field | Description |
|---|---|
| Test Case ID | TC-1138 |
| Requirement ID | FR-533 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | 12 % and new flat fees saved; forward-only. |
| Test Type | Functional / UI |
| Priority | Critical |
| Preconditions | SA; an existing `session_settlements` row. |
| Test Data | UI 12 %, teacher fee 3 EGP, centre fee 2.5 EGP → `{teacherDirectCommissionBp:1200, platformTeacherFee:300, platformCenterFee:250}` |
| Steps | 1. Open `/en/dashboard/superadmin/commission`, enter values, "Save settings". 2. `GET admin/commission-settings`. 3. Read audit `commission.global.updated`. 4. Re-read the existing settlement row. |
| Expected Result | Toast "Commission settings saved — new charges use the new rates immediately"; GET returns 1200/300/250; audit row with before/after; old settlement unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-418; `commission-audit.test.ts`. |

##### TC-1139 — Accountant may read but not write commission settings
| Field | Description |
|---|---|
| Test Case ID | TC-1139 |
| Requirement ID | FR-533 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Role split per action. |
| Test Type | Security |
| Priority | Critical |
| Preconditions | ACC. |
| Test Data | `{teacherDirectCommissionBp:1000, platformTeacherFee:0, platformCenterFee:0}` |
| Steps | 1. `GET finance/commission-settings`. 2. `PUT admin/commission-settings`. 3. Open `/en/dashboard/finance/commission`. |
| Expected Result | GET 200; PUT 403 `forbidden`; page shows the read-only note and no "Save settings" button. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1140 — Commission validation bounds
| Field | Description |
|---|---|
| Test Case ID | TC-1140 |
| Requirement ID | FR-533 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | bp outside 0–10000, negative fee, unknown key. |
| Test Type | Validation |
| Priority | High |
| Preconditions | SA. |
| Test Data | `{teacherDirectCommissionBp:10001,…}`, `{platformTeacherFee:-1,…}`, `{…, extra:1}` |
| Steps | 1. PUT each body. |
| Expected Result | 400 `validation_error` each time (strict schema); settings unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1141 — Save student wallet top-up policy
| Field | Description |
|---|---|
| Test Case ID | TC-1141 |
| Requirement ID | FR-534 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Happy path and `updatedBy`. |
| Test Type | Functional / UI |
| Priority | High |
| Preconditions | SA. |
| Test Data | min 20 EGP, max 2000 EGP → `{minTopup:2000, maxTopup:200000}` |
| Steps | 1. Open `/en/dashboard/superadmin/wallet`, enter, "Save policy". 2. `GET admin/wallet-settings`. 3. Check `audit_logs` for a wallet-settings action. |
| Expected Result | Toast `savedOk`; GET returns 2000/200000 with `updatedBy = SA id`. Audit row: one `audit_logs` row `wallet_settings.updated` written by the Prisma auto-audit extension (`packages/database/src/extensions/index.ts:33-34`), not by `writeAdminAudit` (GAP-216). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `wallet-settings-admin.test.ts`. |

##### TC-1142 — Wallet policy bounds
| Field | Description |
|---|---|
| Test Case ID | TC-1142 |
| Requirement ID | FR-534 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | max < min and max > ABSOLUTE_MAX. |
| Test Type | Validation |
| Priority | High |
| Preconditions | SA. |
| Test Data | `{minTopup:5000, maxTopup:1000}`; `{minTopup:1000, maxTopup:100000001}` |
| Steps | 1. UI: enter min 50 EGP / max 10 EGP. 2. PUT each body. |
| Expected Result | UI "Maximum top-up cannot be lower than the minimum"; API 422 for both. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-583; BR-419. |

##### TC-1143 — Centre split override and resolution
| Field | Description |
|---|---|
| Test Case ID | TC-1143 |
| Requirement ID | FR-535 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Override shown as resolved; clear falls back to global. |
| Test Type | Functional / API |
| Priority | Critical |
| Preconditions | SA; global split exists; a centre. |
| Test Data | `{platformShareBp:1000, teacherShareBp:7000, centerShareBp:2000}` |
| Steps | 1. `PUT admin/centers/<id>/split`. 2. `GET` the same. 3. `DELETE`. 4. `GET` again. 5. Read audits. |
| Expected Result | After PUT `resolved` = override; after DELETE `resolved` = global, `override` empty/null; audits `revenue_split.center.updated` then `revenue_split.center.cleared`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | `rooms-split.ts:160-229`. |

##### TC-1144 — Split that does not sum to 10000 is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1144 |
| Requirement ID | FR-535 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Route refine. |
| Test Type | Validation |
| Priority | Critical |
| Preconditions | SA. |
| Test Data | `{1000,7000,1999}`; `{1000,7000,2001}`; `{-1,7001,3000}` |
| Steps | 1. `PUT admin/revenue-split` with each. |
| Expected Result | 400 `validation_error`; global split unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-581; BR-420. |

##### TC-1145 — Whole-room settlement uses the resolved split
| Field | Description |
|---|---|
| Test Case ID | TC-1145 |
| Requirement ID | FR-535 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Downstream check of the split maths. |
| Test Type | Integration / Money |
| Priority | Critical |
| Preconditions | Room split 1000/7000/2000; a whole-room session of 10000 settled afterwards (settlement writer owned by "Payments, Subscriptions, Wallets & Settlement"). |
| Test Data | session id |
| Steps | 1. `GET admin/session-settlements?centerId=<id>` and find the row. |
| Expected Result | `platformTotal 1000, teacherTotal 7000, centerTotal 2000` (10000 × 2000 bp = 2000 to centre). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-410. |

##### TC-1146 — Room per-student fee rate
| Field | Description |
|---|---|
| Test Case ID | TC-1146 |
| Requirement ID | FR-536 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Set fee 1500/student, verify audit and settlement. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; room exists. |
| Test Data | `{fee:1500, bp:null}` |
| Steps | 1. `PUT admin/centers/<id>/rooms/<roomId>/per-student-rate`. 2. Read audit `m2_rate.room.updated`. 3. After a per-student session with 20 present, read its settlement. |
| Expected Result | 200; audit row; settlement `centerTotal 30000`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-410, BR-424. |

##### TC-1147 — M2 rate shape validation
| Field | Description |
|---|---|
| Test Case ID | TC-1147 |
| Requirement ID | FR-536 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | both null, both set, fee 0. |
| Test Type | Validation |
| Priority | High |
| Preconditions | SA. |
| Test Data | `{fee:null,bp:null}`; `{fee:100,bp:100}`; `{fee:0,bp:null}` |
| Steps | 1. `PUT admin/revenue-split/per-student-rate` with each. |
| Expected Result | First two → 400 "Set exactly one of fee (piasters/student) or bp (basis points/student)"; `{fee:0}` → 200 (record — EC-582 UNCLEAR). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1148 — Settlements list totals reconcile per row
| Field | Description |
|---|---|
| Test Case ID | TC-1148 |
| Requirement ID | FR-537 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Row totals sum to the room price × present. |
| Test Type | Functional / Reconciliation |
| Priority | High |
| Preconditions | SA; settlements of each pricing method. |
| Test Data | `?pricingMethod=whole_room&page=1&limit=20` |
| Steps | 1. Open `/en/dashboard/superadmin/settlements`, filter. 2. For each row check `platformTotal + centerTotal + teacherTotal = presentCount × perSessionPrice`. |
| Expected Result | Equality holds; `mismatchNote` absent; labels "Whole-room %", "Per attending student", "No hall (default model)". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1149 — Settlements paging rejects non-numeric values; accountant denied
| Field | Description |
|---|---|
| Test Case ID | TC-1149 |
| Requirement ID | FR-537 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Strict regex and role. |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | SA and ACC. |
| Test Data | `?page=abc` |
| Steps | 1. SA `GET admin/session-settlements?page=abc`. 2. ACC `GET admin/session-settlements`. |
| Expected Result | 400 `validation_error`; ACC 403 `forbidden`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-592. |

##### TC-1150 — Export row count equals screen total
| Field | Description |
|---|---|
| Test Case ID | TC-1150 |
| Requirement ID | FR-538 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Export runs the same service as the screen. |
| Test Type | Functional / Reconciliation |
| Priority | High |
| Preconditions | SA; < 5000 settlements for a centre. |
| Test Data | `?centerId=<id>&locale=en` |
| Steps | 1. Note `meta.total` on screen. 2. "Export to Excel". 3. Open the xlsx and count data rows; read `x-edura-rows`. |
| Expected Result | Rows = `meta.total` = `x-edura-rows`; `x-edura-truncated: false`; filename from `content-disposition`, fallback `session-settlements.xlsx`; toasts `exportPreparing` → `exportReady`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-422. |

##### TC-1151 — Export truncates at 5000 rows with a header
| Field | Description |
|---|---|
| Test Case ID | TC-1151 |
| Requirement ID | FR-538 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | MAX_ROWS behaviour. |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | > 5000 settlement rows in `dev` (seed, `is_demo`). |
| Test Data | no filter |
| Steps | 1. Export. 2. Read headers and row count. |
| Expected Result | 5000 data rows; `x-edura-truncated: true`; screen total still shows the full count. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-577. |

##### TC-1152 — Accountant can export settlements but cannot list them
| Field | Description |
|---|---|
| Test Case ID | TC-1152 |
| Requirement ID | FR-538 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Permission inconsistency. |
| Test Type | Security |
| Priority | High |
| Preconditions | ACC. |
| Test Data | none |
| Steps | 1. `GET admin/session-settlements/export`. 2. `GET admin/session-settlements`. |
| Expected Result | (current code) export 200 xlsx; list 403. Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-225). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-588. |

##### TC-1153 — Approve an agreement proposal ends the current active one
| Field | Description |
|---|---|
| Test Case ID | TC-1153 |
| Requirement ID | FR-539 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Happy path with `effectiveFrom`. |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | SA; pair with an `active` agreement (start 2026-09-01) and a `proposed` one. |
| Test Data | `{effectiveFrom:"2026-11-01T00:00:00.000Z"}` |
| Steps | 1. `POST admin/teacher-agreements/<id>/approve`. 2. `GET admin/teacher-agreements?status=active`. 3. Read audit. |
| Expected Result | Proposal `active` from 2026-11-01; previous `ended`, `endedAt = 2026-11-01`; audit `teacher_agreement.approved`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-425. |

##### TC-1154 — `effectiveFrom` not after the current start is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1154 |
| Requirement ID | FR-539 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Guard on overlapping agreements. |
| Test Type | Negative |
| Priority | High |
| Preconditions | as TC-1153 before approval. |
| Test Data | `{effectiveFrom:"2026-09-01T00:00:00.000Z"}` |
| Steps | 1. POST approve. |
| Expected Result | 422 "effectiveFrom must be after the current agreement's own start"; both agreements unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-589. |

##### TC-1155 — Reject / terminate state guards
| Field | Description |
|---|---|
| Test Case ID | TC-1155 |
| Requirement ID | FR-539 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Only pending can be rejected; only active can be ended. |
| Test Type | Negative |
| Priority | Medium |
| Preconditions | One `rejected` and one `ended` agreement. |
| Test Data | ids |
| Steps | 1. POST reject on the rejected one. 2. POST terminate on the ended one. |
| Expected Result | 422 "Only a pending proposal can be rejected"; 422 "Only an active agreement can be ended". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1156 — Create, edit and delete a points rule
| Field | Description |
|---|---|
| Test Case ID | TC-1156 |
| Requirement ID | FR-540 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | CRUD via the Points rules screen. |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | SA. |
| Test Data | `{eventName:"qa_event", pointsValue:7, isActive:true}`; edit to 9; then delete |
| Steps | 1. "Add rule". 2. Edit. 3. Delete → "Delete this rule?". 4. Check `audit_logs` for any points action. |
| Expected Result | 201 then 200 then 200/204; toasts `created`, `saved`, `deleted`; list updates. Audit rows: record whether any exist (GAP-218). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-426. |

##### TC-1157 — Points rule validation bounds
| Field | Description |
|---|---|
| Test Case ID | TC-1157 |
| Requirement ID | FR-540 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | pointsValue outside −100000..100000, empty name. |
| Test Type | Validation |
| Priority | Low |
| Preconditions | SA. |
| Test Data | `{eventName:"", pointsValue:1}`; `{eventName:"x", pointsValue:100001}` |
| Steps | 1. POST each. |
| Expected Result | 400 `validation_error` each. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1158 — Manual points adjustment writes a ledger row and no money
| Field | Description |
|---|---|
| Test Case ID | TC-1158 |
| Requirement ID | FR-541 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | +25, then −30 (allowed), then −10 (would go negative), then `delta 0`. |
| Test Type | Functional / API |
| Priority | Medium |
| Preconditions | SA; student with `pointsBalance 10`. |
| Test Data | `{delta:25, reason:"QA"}`; `{delta:-30, reason:"QA"}`; `{delta:-10, reason:"QA"}`; `{delta:0, reason:"QA"}` |
| Steps | 1. POST each. 2. `GET …/ledger`. 3. Read the student wallet and `transactions`. |
| Expected Result | Ledger rows with `balanceAfter` 35 then 5; −10 → 422 `business_rule` "Adjustment would make the balance negative" and balance stays 5 (rolled back); `delta 0` → 422 "delta must be a non-zero integer" (`points-admin.ts:77, 92`); wallet and `transactions` unchanged; one auto-audit row `points.adjusted` per successful write (EC-593, EC-594). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1159 — Record a cash payment as the centre (atomic with audit)
| Field | Description |
|---|---|
| Test Case ID | TC-1159 |
| Requirement ID | FR-542 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Payment + mirrored ledger + audit in one transaction. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; centre and demo student. |
| Test Data | `{studentId, amount:25000, note:"QA cash"}` |
| Steps | 1. Oversight → "Record cash payment" → 250 EGP. 2. Read `payments`, `transactions`, `audit_logs`. |
| Expected Result | 201 with `receiptNumber`; `payments.recorded_by` attributed to the SA under acting `center_admin`; mirrored `transactions` row; audit `center.payment_recorded`; toast "Payment recorded — receipt issued and mirrored to the ledger". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-427; `h3-audit-atomicity.test.ts`. |

##### TC-1160 — Cash payment amount bounds
| Field | Description |
|---|---|
| Test Case ID | TC-1160 |
| Requirement ID | FR-542 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | 0, negative, above maximum, non-integer. |
| Test Type | Validation |
| Priority | Critical |
| Preconditions | SA. |
| Test Data | `amount` 0, −100, 99999901, 100.5 |
| Steps | 1. POST each. |
| Expected Result | 400 `validation_error`; 99999901 → message "Amount exceeds the maximum (999,999 EGP)"; no payment rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-585, EC-586. |

##### TC-1161 — Accountant denied on every centre money action
| Field | Description |
|---|---|
| Test Case ID | TC-1161 |
| Requirement ID | FR-542 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | SA-only writers. |
| Test Type | Security |
| Priority | Critical |
| Preconditions | ACC. |
| Test Data | valid bodies |
| Steps | 1. POST `money/payments`, `money/wallet-topup`, `money/subscriptions`, `money/payout-request`, `money/expenses`. |
| Expected Result | 403 `forbidden` for all five; no rows created. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-587. |

##### TC-1162 — Wallet top-up as the centre
| Field | Description |
|---|---|
| Test Case ID | TC-1162 |
| Requirement ID | FR-543 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Credit only, audited. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; student wallet 0. |
| Test Data | `{studentId, amount:5000}` |
| Steps | 1. "Top up a wallet" → 50 EGP. 2. Read wallet, ledger, audit. |
| Expected Result | 201 `balanceAfter 5000`; ledger row; audit `center.wallet_topped_up`; toast `ma_topUpOk`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1163 — Top-up versus wallet policy and negative amount
| Field | Description |
|---|---|
| Test Case ID | TC-1163 |
| Requirement ID | FR-543 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Does the back-office path respect min/max top-up? |
| Test Type | Negative / Exploratory |
| Priority | High |
| Preconditions | Policy min 2000 / max 200000 (TC-1141). |
| Test Data | `amount` 1000; 300000; −1 |
| Steps | 1. POST each. |
| Expected Result | −1 → 400. 1000 and 300000: record whether 422 or 201 — UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-226). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1164 — Walk-in subscription as the centre
| Field | Description |
|---|---|
| Test Case ID | TC-1164 |
| Requirement ID | FR-544 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Charge at the course's configured plan price; money direction student → centre. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; course with a monthly price. |
| Test Data | `{studentId, courseId, plan:"monthly"}` |
| Steps | 1. "Walk-in subscription". 2. Read subscription, payment, ledger (`fromEntityId`), audit. |
| Expected Result | 201; payment amount = course monthly price; ledger `fromEntityId = studentId`; audit `center.walk_in_subscription_created`. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-406, BR-427. |

##### TC-1165 — Walk-in on an unpriced plan is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1165 |
| Requirement ID | FR-544 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Engine refusal propagates as 422. |
| Test Type | Negative |
| Priority | Critical |
| Preconditions | Course with no `per_session` price. |
| Test Data | `{studentId, courseId, plan:"per_session"}` |
| Steps | 1. POST. |
| Expected Result | 422 (message owned by "Payments, Subscriptions, Wallets & Settlement"); no subscription, payment or ledger rows. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1166 — Request a centre payout for the available balance
| Field | Description |
|---|---|
| Test Case ID | TC-1166 |
| Requirement ID | FR-545 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Blank amount = wallet − open payouts. |
| Test Type | Functional / Money |
| Priority | Critical |
| Preconditions | SA; centre wallet 50000; one open payout 20000. |
| Test Data | `{}` then GET |
| Steps | 1. `GET …/money/payout-request` (read `available`). 2. "Request payout" blank. 3. Read payouts and audit. |
| Expected Result | `available 30000`; 201 payout `{beneficiaryType:"center", netPayable:30000, status:"pending"}`; wallet unchanged; audit `center.payout_requested`; toast "Payout requested — pending the accountant's approval". |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-413. |

##### TC-1167 — Payout request idempotency key
| Field | Description |
|---|---|
| Test Case ID | TC-1167 |
| Requirement ID | FR-545 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Same `clientRequestId` returns the same payout; without a key a second partial request creates a second row. |
| Test Type | Idempotency |
| Priority | Critical |
| Preconditions | Centre available 30000. |
| Test Data | `{amount:10000, clientRequestId:"qa-req-0001"}` ×2; `{amount:5000}` ×2 |
| Steps | 1. POST with the key twice. 2. POST without the key twice. 3. Inspect the dialog's request body for a `clientRequestId`. |
| Expected Result | Keyed: both return the same payout id, one row. Unkeyed: two rows (5000 each). Dialog key presence: record (GAP-215). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-573, EC-574; BR-428. |

##### TC-1168 — Payout request above available balance
| Field | Description |
|---|---|
| Test Case ID | TC-1168 |
| Requirement ID | FR-545 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Exact error with EGP figure. |
| Test Type | Negative |
| Priority | High |
| Preconditions | Centre available 30000. |
| Test Data | `{amount:30001}`; `{amount:0}` |
| Steps | 1. POST each. |
| Expected Result | 422 "Amount exceeds available balance (300.00 EGP available)"; `0` → 400 from zod (positive). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1169 — Create, update and delete a centre expense
| Field | Description |
|---|---|
| Test Case ID | TC-1169 |
| Requirement ID | FR-546 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Audited CRUD; dashboard "Expenses" reflects it. |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | SA. |
| Test Data | `{amount:120000, category:"rent", description:"QA", expenseDate:"2026-11-01"}` |
| Steps | 1. Add. 2. PATCH amount 130000. 3. Delete → "Delete this expense?". 4. Read audits and the dashboard. |
| Expected Result | 201/200/200; audits `center.expense_created/updated/deleted`; dashboard "Expenses" changes accordingly; ledger `transactions` untouched. Delete is a HARD delete (`services/expenses/expenses.ts:112` `tx.expense.delete`) — the row is gone, only the audit row remains (GAP-222). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1170 — Expense category `maintenance` is refused
| Field | Description |
|---|---|
| Test Case ID | TC-1170 |
| Requirement ID | FR-546 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Zod enum narrower than Prisma enum. |
| Test Type | Negative |
| Priority | Low |
| Preconditions | SA. |
| Test Data | `{amount:1000, category:"maintenance", expenseDate:"2026-11-01"}` |
| Steps | 1. POST. |
| Expected Result | (current code) 400 `validation_error`. Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-219). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-584. |

##### TC-1171 — Centre finance summary reconciles with the statement
| Field | Description |
|---|---|
| Test Case ID | TC-1171 |
| Requirement ID | FR-547 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Oversight reads are the same figures as the finance reports. |
| Test Type | Functional / Reconciliation |
| Priority | High |
| Preconditions | SA; centre with payments, a refund and a paid payout this month. |
| Test Data | `?from=<month start>&to=<month end>` |
| Steps | 1. `GET admin/centers/<id>/oversight/finance`. 2. `GET …/oversight/statement` and `GET finance/reports/center-statement/<id>` with the same range. 3. Compare `payments.amount − refundAmount`, payouts by status, wallet balance. |
| Expected Result | Figures agree across all three; `walletBalance` equals the centre row. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-422; `center-oversight.test.ts`. |

##### TC-1172 — Oversight wallet scope and unknown centre
| Field | Description |
|---|---|
| Test Case ID | TC-1172 |
| Requirement ID | FR-547 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | `scope=roster\|center\|other`; 404; accountant denied. |
| Test Type | Negative / API |
| Priority | Medium |
| Preconditions | SA and ACC. |
| Test Data | `?scope=roster`, `?scope=center`, `?scope=bogus`; random uuid |
| Steps | 1. SA call `…/oversight/wallet` with each scope. 2. SA call with the random uuid. 3. ACC call. |
| Expected Result | Scopes roster/center return different row sets; `bogus` falls back to the default; unknown centre 404 "Center not found"; ACC 403. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1173 — Back-office user without completed 2FA is blocked on every finance route
| Field | Description |
|---|---|
| Test Case ID | TC-1173 |
| Requirement ID | FR-513 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | `two_factor_required` gate (cross-cutting; checked on the dashboard route). |
| Test Type | Security |
| Priority | High |
| Preconditions | ACC account whose 2FA step is not completed in this session (login recipe: `docs/guides/test-credentials.md`). |
| Test Data | none |
| Steps | 1. `GET finance/dashboard`. 2. Open `/en/dashboard/finance`. |
| Expected Result | 403 `{error:{code:"two_factor_required"}}`; UI denial card. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | EC-599; NFR-216. |

##### TC-1174 — Approve and pay are not rate limited
| Field | Description |
|---|---|
| Test Case ID | TC-1174 |
| Requirement ID | FR-529 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | Confirm absence of `withRateLimit` on money routes (documented risk). |
| Test Type | Security / Exploratory |
| Priority | Medium |
| Preconditions | Eligible payer; one approved payout. |
| Test Data | 50 rapid `pay` calls with distinct bad references |
| Steps | 1. Script 50 calls in 10 seconds. |
| Expected Result | (current code) no 429 — every call is processed and answered 422/200 on its own merits. Expected (product): UNKNOWN — NEEDS PRODUCT OWNER CONFIRMATION (GAP-220). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | NFR-224. |

##### TC-1175 — Ledger rows cannot be edited or deleted by the app role
| Field | Description |
|---|---|
| Test Case ID | TC-1175 |
| Requirement ID | FR-515 |
| Module | Finance & Accounting (Back-office) |
| Test Scenario | DB-level append-only guard. |
| Test Type | Data integrity (DB, read-only verification + a rolled-back attempt by a DBA) |
| Priority | High |
| Preconditions | Access to `dev` with the `edura_app` role (DBA, not the tester's app session). |
| Test Data | any `transactions` id |
| Steps | 1. As `edura_app` attempt `UPDATE transactions SET amount = amount + 1 WHERE id = …` inside a transaction. 2. Attempt `DELETE FROM payments WHERE id = …`. 3. Roll back. |
| Expected Result | Both fail with permission denied (`REVOKE UPDATE, DELETE` / `REVOKE DELETE`). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-404, BR-405; migration `00000000000003…:83-88`. |

### 12. Platform, Infrastructure & Non-Functional

Every case lists the Requirement ID it verifies. Actual Result and Status are for the tester. Test accounts are role and email only; passwords are in docs/guides/test-credentials.md. Superadmin and accountant emails are UNKNOWN.

##### TC-1176 — Health returns 200 when the database is up
| Field | Value |
|---|---|
| Test Case ID | TC-1176 |
| Requirement ID | FR-548 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Health returns 200 when the database is up |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | none |
| Steps | 1. Send GET /api/health to the api service.<br>2. Read status, headers and body. |
| Expected Result | 200; body has status ok, db up, rateLimiter shared or local, and an ISO time; Cache-Control is no-store. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Evidence FR-548. |

##### TC-1177 — Health returns 503 with retry-after when the database is down
| Field | Value |
|---|---|
| Test Case ID | TC-1177 |
| Requirement ID | FR-548 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Health returns 503 with retry-after when the database is down |
| Test Type | Negative / Integration |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; the test database can be stopped |
| Test Data | none |
| Steps | 1. Stop the test database.<br>2. Send GET /api/health.<br>3. Restart the database and repeat. |
| Expected Result | 503 with status degraded, db down, header retry-after 30, returned within about 8 s; after restart 200 again. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Test environment only. Never stop a shared database. |

##### TC-1178 — Health rate limit: 61st GET in a minute is refused
| Field | Value |
|---|---|
| Test Case ID | TC-1178 |
| Requirement ID | FR-548 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Health rate limit: 61st GET in a minute is refused |
| Test Type | Boundary / Security |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; one client IP |
| Test Data | 60 GETs then a 61st within 60 s |
| Steps | 1. Send 60 GET /api/health requests in under a minute from one IP.<br>2. Send the 61st.<br>3. Send a HEAD request.<br>4. Wait 60 s and send GET. |
| Expected Result | The 61st answers 429 rate_limited with retry-after 60; HEAD is not limited; GET succeeds after the window refills. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-453, BR-454. |

##### TC-1179 — Health reports local limiter mode when Redis is unavailable
| Field | Value |
|---|---|
| Test Case ID | TC-1179 |
| Requirement ID | FR-548 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Health reports local limiter mode when Redis is unavailable |
| Test Type | Integration / Resilience |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; Redis can be stopped |
| Test Data | none |
| Steps | 1. Stop Redis or unset REDIS_URL in a non-production run.<br>2. Call GET /api/health several times. |
| Expected Result | Status code stays 200; body shows rateLimiter local after the breaker opens (3 failures, 30 s). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-251 notes the field is public. |

##### TC-1180 — Deep mail probe appears only with the cron secret
| Field | Value |
|---|---|
| Test Case ID | TC-1180 |
| Requirement ID | FR-549 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Deep mail probe appears only with the cron secret |
| Test Type | Security / API |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running; mail provider configured as a mock (console) or sandbox |
| Test Data | deep=mail; with and without the cron secret (value supplied by the environment owner, never written in this document) |
| Steps | 1. GET /api/health?deep=mail with no secret.<br>2. Repeat with x-cron-secret set to the secret.<br>3. Repeat with a wrong secret and with deep=other. |
| Expected Result | Without a valid secret the body has no mail field and no mail transport call happens; with the secret the mail field is present (its shape is UNKNOWN, GAP-249); deep=other is ignored. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Record the observed shape of the mail field. |

##### TC-1181 — Admin-api health returns 200 when the database is up
| Field | Value |
|---|---|
| Test Case ID | TC-1181 |
| Requirement ID | FR-550 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Admin-api health returns 200 when the database is up |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Test environment with admin-api running |
| Test Data | none |
| Steps | 1. GET /api/health on admin-api. |
| Expected Result | 200 with status ok. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1182 — Admin-api health returns 503 when the database is down and has no rate limit
| Field | Value |
|---|---|
| Test Case ID | TC-1182 |
| Requirement ID | FR-550 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Admin-api health returns 503 when the database is down and has no rate limit |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | Test environment; database can be stopped |
| Test Data | 70 requests in one minute |
| Steps | 1. Stop the test database.<br>2. Send one request and read the status and retry-after.<br>3. Restart the database.<br>4. Send 70 requests in a minute. |
| Expected Result | 503 degraded with retry-after 30 while down; after restart all 70 requests answer 200 (no 429), confirming GAP-241. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1183 — Ping answers 200 even when the database is unreachable
| Field | Value |
|---|---|
| Test Case ID | TC-1183 |
| Requirement ID | FR-551 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Ping answers 200 even when the database is unreachable |
| Test Type | Functional / Resilience |
| Priority | Low |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | none |
| Steps | 1. GET /api/v1/_ping with the database up.<br>2. Stop the test database and repeat. |
| Expected Result | Both calls answer 200; the second has db unreachable; the body has ok true and an ISO now. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | A monitor that checks only the status code will not notice an outage (BR-476). |

##### TC-1184 — Cron endpoint rejects calls without the secret
| Field | Value |
|---|---|
| Test Case ID | TC-1184 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Cron endpoint rejects calls without the secret |
| Test Type | Security / API |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; CRON_SECRET configured |
| Test Data | POST /api/v1/cron/expire-payment-intents |
| Steps | 1. POST with no secret headers.<br>2. POST with a wrong x-cron-secret.<br>3. POST with a wrong Authorization Bearer value. |
| Expected Result | Every call answers 401 unauthenticated 'Invalid or missing cron secret'; no job runs (no row changes). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-436, BR-437. |

##### TC-1185 — Cron endpoint accepts either header form and runs the job
| Field | Value |
|---|---|
| Test Case ID | TC-1185 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Cron endpoint accepts either header form and runs the job |
| Test Type | Functional / API |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; CRON_SECRET configured |
| Test Data | the cron secret (value supplied by the environment owner, never written in this document) |
| Steps | 1. POST with x-cron-secret.<br>2. POST with Authorization: Bearer <secret>. |
| Expected Result | Both answer 200 with the job result object. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1186 — Cron endpoint is fail-closed when CRON_SECRET is unset
| Field | Value |
|---|---|
| Test Case ID | TC-1186 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Cron endpoint is fail-closed when CRON_SECRET is unset |
| Test Type | Security / Negative |
| Priority | Critical |
| Preconditions | A test run of the api service started WITHOUT CRON_SECRET |
| Test Data | empty and arbitrary secret headers |
| Steps | 1. POST with an empty x-cron-secret.<br>2. POST with any value. |
| Expected Result | 401 every time. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Do this only on a throwaway local run. |

##### TC-1187 — Unknown job name and wrong methods
| Field | Value |
|---|---|
| Test Case ID | TC-1187 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unknown job name and wrong methods |
| Test Type | Negative / API |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | job=nope; verbs GET, PUT, DELETE |
| Steps | 1. POST /api/v1/cron/nope with the secret.<br>2. Send GET, PUT and DELETE to a valid job URL. |
| Expected Result | 422 business_rule 'Unknown cron job: nope'; the other verbs answer 405. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1188 — Cron secret comparison does not leak length (constant time)
| Field | Value |
|---|---|
| Test Case ID | TC-1188 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Cron secret comparison does not leak length (constant time) |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | secrets of different length and one-character difference |
| Steps | 1. Send secrets of length 1, equal length but wrong, and longer than the real one. |
| Expected Result | All answer 401 with identical bodies; no timing oracle is observable at human scale. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Timing measurement is optional; code review evidence is secret-compare.ts. |

##### TC-1189 — Overdue pending payment intents become expired
| Field | Value |
|---|---|
| Test Case ID | TC-1189 |
| Requirement ID | FR-553 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Overdue pending payment intents become expired |
| Test Type | Functional / Workflow |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; demo intents: one pending overdue, one pending not due, one paid, one failed |
| Test Data | intents prepared by the payments test data |
| Steps | 1. Record intent statuses.<br>2. POST /api/v1/cron/expire-payment-intents with the secret.<br>3. Re-read statuses. |
| Expected Result | Only the overdue pending intent becomes expired and the response reports one; the others are unchanged. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Payments module owns the maths. |

##### TC-1190 — Expire-payment-intents is idempotent and safe to run concurrently
| Field | Value |
|---|---|
| Test Case ID | TC-1190 |
| Requirement ID | FR-553 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Expire-payment-intents is idempotent and safe to run concurrently |
| Test Type | Concurrency |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; one overdue intent |
| Test Data | two simultaneous calls |
| Steps | 1. Fire two POSTs at the same moment.<br>2. Read the intent and any ledger rows. |
| Expected Result | The intent is expired once; no duplicate side effect; both calls answer 200. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1191 — Pending data export becomes ready, then expires after 7 days
| Field | Value |
|---|---|
| Test Case ID | TC-1191 |
| Requirement ID | FR-554 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Pending data export becomes ready, then expires after 7 days |
| Test Type | Functional / Workflow |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; one pending export request (data-rights test user) |
| Test Data | clock advanced by 7 days or a seeded old ready export |
| Steps | 1. POST /api/v1/cron/data-exports.<br>2. Check the request is ready and downloadable.<br>3. Use an export older than 7 days and run the job again. |
| Expected Result | Ready after the first run; the old export becomes expired and its payload is cleared. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Use existing DB test data-rights.test.ts as a guide. |

##### TC-1192 — One failing export does not stop the others
| Field | Value |
|---|---|
| Test Case ID | TC-1192 |
| Requirement ID | FR-554 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | One failing export does not stop the others |
| Test Type | Negative / Resilience |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; two pending exports, one engineered to fail |
| Test Data | failing export error longer than 500 characters |
| Steps | 1. Run the job.<br>2. Read both requests. |
| Expected Result | The failing request is failed with its error cut to 500 characters; the other is ready. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-250 on batch size. |

##### TC-1193 — Session starting within 120 minutes triggers one reminder
| Field | Value |
|---|---|
| Test Case ID | TC-1193 |
| Requirement ID | FR-555 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Session starting within 120 minutes triggers one reminder |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running; a scheduled session 60 minutes ahead with active students |
| Test Data | none |
| Steps | 1. POST lesson-reminders.<br>2. Check notifications.<br>3. POST again. |
| Expected Result | Each active student gets one reminder; the second run adds none (dedupe by session). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-446. |

##### TC-1194 — Lapsed monthly subscription becomes expired
| Field | Value |
|---|---|
| Test Case ID | TC-1194 |
| Requirement ID | FR-556 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Lapsed monthly subscription becomes expired |
| Test Type | Functional / Workflow |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; active subscription with periodEnd in the past, one still in the future |
| Test Data | none |
| Steps | 1. POST expire-subscriptions.<br>2. Read both subscriptions. |
| Expected Result | Only the lapsed one is expired; the other stays active. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Subscriptions module owns rules. |

##### TC-1195 — Stale pending subscription is cancelled unless its intent is live; per-session pass expires by UTC day
| Field | Value |
|---|---|
| Test Case ID | TC-1195 |
| Requirement ID | FR-556 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Stale pending subscription is cancelled unless its intent is live; per-session pass expires by UTC day |
| Test Type | Boundary / Workflow |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; subscriptions: pending older than 24 h with dead intent, pending older than 24 h with live intent, pass dated yesterday (UTC), pass dated today |
| Test Data | none |
| Steps | 1. POST expire-subscriptions.<br>2. Read each row. |
| Expected Result | Dead-intent pending is cancelled; live-intent pending is kept; yesterday's pass expires; today's pass stays. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-441, BR-442, GAP-246. |

##### TC-1196 — Expiry sweep run twice concurrently
| Field | Value |
|---|---|
| Test Case ID | TC-1196 |
| Requirement ID | FR-556 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Expiry sweep run twice concurrently |
| Test Type | Concurrency |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; several lapsed subscriptions |
| Test Data | two simultaneous calls |
| Steps | 1. Fire two POSTs together.<br>2. Read results and subscription states. |
| Expected Result | No subscription is processed into an inconsistent state; totals across both responses do not exceed the number lapsed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1197 — Renewal reminders at 5, 2 and 0 days before periodEnd
| Field | Value |
|---|---|
| Test Case ID | TC-1197 |
| Requirement ID | FR-557 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Renewal reminders at 5, 2 and 0 days before periodEnd |
| Test Type | Boundary |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running; active monthly subscriptions ending in 5, 2, 0 and 3 days |
| Test Data | none |
| Steps | 1. POST subscription-renewal-reminders.<br>2. Check notifications.<br>3. POST again. |
| Expected Result | Reminders for the 5, 2 and 0 day subscriptions only; the 3 day one is skipped; second run adds none. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-447. |

##### TC-1198 — Stale pending collaboration requests expire; accepted ones do not
| Field | Value |
|---|---|
| Test Case ID | TC-1198 |
| Requirement ID | FR-558 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Stale pending collaboration requests expire; accepted ones do not |
| Test Type | Functional |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running; pending past expiresAt, pending future, accepted past expiresAt |
| Test Data | none |
| Steps | 1. POST expire-collaboration-requests.<br>2. Read the three rows. |
| Expected Result | Only the overdue pending request becomes expired. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-443. |

##### TC-1199 — Guardian contact reminders go out on schedule
| Field | Value |
|---|---|
| Test Case ID | TC-1199 |
| Requirement ID | FR-559 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Guardian contact reminders go out on schedule |
| Test Type | Functional |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; a minor student with no guardian email and a due date in the past; GUARDIAN_REMINDER_EVERY_DAYS at its default |
| Test Data | none |
| Steps | 1. POST guardian-contact-reminders.<br>2. Check the student's notices and the center admin notice.<br>3. POST again immediately. |
| Expected Result | First run reminds and also notifies center admins and managers; second run sends nothing (interval not elapsed); the account is not suspended. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-444; child-safety gate belongs to messaging. |

##### TC-1200 — Guardian reminders respect the configured interval
| Field | Value |
|---|---|
| Test Case ID | TC-1200 |
| Requirement ID | FR-559 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Guardian reminders respect the configured interval |
| Test Type | Boundary |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; same student; interval changed to a different value in a non-production run |
| Test Data | interval 1 day versus 3 days |
| Steps | 1. Run the job, advance the clock by interval minus a minute and run, then advance past the interval and run. |
| Expected Result | No reminder before the interval; a reminder after. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Needs a controllable clock; otherwise mark Blocked. |

##### TC-1201 — Weekly digest is sent once per center per week
| Field | Value |
|---|---|
| Test Case ID | TC-1201 |
| Requirement ID | FR-560 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Weekly digest is sent once per center per week |
| Test Type | Functional / Idempotency |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running; active demo centers |
| Test Data | none |
| Steps | 1. POST weekly-center-digest.<br>2. Check emails and the audit rows.<br>3. POST again. |
| Expected Result | One digest per active center; second run sends none; failures are counted in failed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-448. |

##### TC-1202 — Month-end statements are created once per owner and period
| Field | Value |
|---|---|
| Test Case ID | TC-1202 |
| Requirement ID | FR-561 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Month-end statements are created once per owner and period |
| Test Type | Functional / Workflow |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; teachers and centers with activity last UTC month; mail provider mocked |
| Test Data | none |
| Steps | 1. POST month-end-statements.<br>2. Check invoices.<br>3. POST again. |
| Expected Result | One statement per eligible teacher profile and center; the second run creates none. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-449. |

##### TC-1203 — A failing statement is silently swallowed
| Field | Value |
|---|---|
| Test Case ID | TC-1203 |
| Requirement ID | FR-561 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | A failing statement is silently swallowed |
| Test Type | Negative / Error handling |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; one owner engineered to fail (for example invalid email) |
| Test Data | none |
| Steps | 1. POST month-end-statements.<br>2. Compare returned counts with expected owners. |
| Expected Result | Remaining owners still get statements; the failed owner has none and no error is reported (confirms GAP-238; record actual). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Record as a defect candidate if the product owner expects reporting (Q-126). |

##### TC-1204 — Every cron job is scheduled with the right cadence
| Field | Value |
|---|---|
| Test Case ID | TC-1204 |
| Requirement ID | FR-562 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Every cron job is scheduled with the right cadence |
| Test Type | Integration / Configuration |
| Priority | High |
| Preconditions | Read access to .github/workflows/cron.yml and the Actions history |
| Test Data | none |
| Steps | 1. Open cron.yml.<br>2. Map each of the nine jobs to a schedule (hourly, daily 01:30 UTC, Sunday 02:00 UTC, monthly 03:00 UTC on the 1st).<br>3. Open the last runs in Actions. |
| Expected Result | All nine jobs appear in a schedule; recent runs are green; the secrets exist (CRON_SECRET, CRON_BASE_URL). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-236 and GAP-237; run history cannot be seen from the repo. |

##### TC-1205 — One failing job does not skip the rest of the tick
| Field | Value |
|---|---|
| Test Case ID | TC-1205 |
| Requirement ID | FR-562 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | One failing job does not skip the rest of the tick |
| Test Type | Workflow / Negative |
| Priority | High |
| Preconditions | A test fork or sandbox repository where the workflow can be run manually |
| Test Data | one job pointed at a failing URL |
| Steps | 1. Run the workflow manually with one job failing. |
| Expected Result | The other jobs still run and the final run is red. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-474. If a sandbox is unavailable mark Blocked. |

##### TC-1206 — Revalidate refreshes the named public datasets
| Field | Value |
|---|---|
| Test Case ID | TC-1206 |
| Requirement ID | FR-563 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Revalidate refreshes the named public datasets |
| Test Type | Functional / Integration |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; public catalog data cached |
| Test Data | datasets catalog and discovery with the internal secret (value supplied by the environment owner) |
| Steps | 1. Read a public catalog page and note a value.<br>2. Change the underlying record in the test database.<br>3. Confirm the page is stale if cached.<br>4. POST /api/v1/internal/revalidate with the secret. |
| Expected Result | Response lists the unique datasets revalidated; the next public read shows the new value. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FR-571. |

##### TC-1207 — Revalidate rejects bad secrets and bad bodies
| Field | Value |
|---|---|
| Test Case ID | TC-1207 |
| Requirement ID | FR-563 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Revalidate rejects bad secrets and bad bodies |
| Test Type | Security / Boundary |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | no secret; wrong secret; empty datasets; 9 datasets; unknown dataset |
| Steps | 1. POST with no secret.<br>2. POST with a wrong secret.<br>3. With the right secret POST an empty array, 9 items and an unknown name. |
| Expected Result | 403 'Invalid internal secret' for the first two; validation errors for the body cases; record the exact status. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-450, BR-451, GAP-250. |

##### TC-1208 — Back-office write triggers a revalidation without breaking the write
| Field | Value |
|---|---|
| Test Case ID | TC-1208 |
| Requirement ID | FR-563 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Back-office write triggers a revalidation without breaking the write |
| Test Type | Integration |
| Priority | High |
| Preconditions | Back-office and ERP test environments linked by INTERNAL_API_SECRET |
| Test Data | a public-profile edit as the back-office super_admin (account see docs/guides/test-credentials.md; email UNKNOWN) |
| Steps | 1. Edit a public profile in the back office.<br>2. Open the public page in the ERP.<br>3. Repeat with the ERP service stopped. |
| Expected Result | With the ERP up the page updates; with it stopped the write still commits. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-475. |

##### TC-1209 — Chat-notify notifies the other participant
| Field | Value |
|---|---|
| Test Case ID | TC-1209 |
| Requirement ID | FR-564 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Chat-notify notifies the other participant |
| Test Type | Integration |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; a conversation and message from the messaging test data |
| Test Data | conversationId, messageId, internal secret (value supplied by the environment owner) |
| Steps | 1. POST with the secret and valid ids. |
| Expected Result | Success result; the other participant gets a notification. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Content rules belong to messaging. |

##### TC-1210 — Chat-notify refuses missing secret and bad ids
| Field | Value |
|---|---|
| Test Case ID | TC-1210 |
| Requirement ID | FR-564 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Chat-notify refuses missing secret and bad ids |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | no secret; non-UUID ids; unknown message id |
| Steps | 1. POST without the secret.<br>2. POST with the secret and non-UUID ids.<br>3. POST with the secret and an unknown message id. |
| Expected Result | 403; validation error; notified false with no fan-out. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1211 — CSP report is accepted and answered 204
| Field | Value |
|---|---|
| Test Case ID | TC-1211 |
| Requirement ID | FR-565 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | CSP report is accepted and answered 204 |
| Test Type | API / Integration |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | a legacy csp-report body and a Reporting-API body |
| Steps | 1. POST each body to /api/v1/security/csp-report on api and admin-api. |
| Expected Result | 204 with an empty body each time; an event is forwarded when Sentry is configured. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1212 — CSP report limits: oversize, garbage, extension scheme and flood
| Field | Value |
|---|---|
| Test Case ID | TC-1212 |
| Requirement ID | FR-565 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | CSP report limits: oversize, garbage, extension scheme and flood |
| Test Type | Boundary / Security |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | 20 KiB body; non-JSON body; blocked-uri chrome-extension://x; 61 requests per minute |
| Steps | 1. Send each input.<br>2. Send 61 valid requests in a minute from one IP. |
| Expected Result | Oversize and garbage answer 204 (cut or ignored); the extension report is dropped; the 61st request answers 429. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-252. |

##### TC-1213 — Signed-out and signed-in callers get the right ssr-session
| Field | Value |
|---|---|
| Test Case ID | TC-1213 |
| Requirement ID | FR-566 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Signed-out and signed-in callers get the right ssr-session |
| Test Type | Functional / API |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running; ERP login works |
| Test Data | student lina.hassan@student.nile-academy.eg (password: see docs/guides/test-credentials.md) |
| Steps | 1. GET /api/v1/me/ssr-session without a cookie.<br>2. Log in and repeat with the session cookie. |
| Expected Result | Signed out: 200 with user null. Signed in: the user, onboardingComplete and viewAs fields; both no-store. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1214 — Back-office ssr-session reveals only id and 2FA flag
| Field | Value |
|---|---|
| Test Case ID | TC-1214 |
| Requirement ID | FR-566 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Back-office ssr-session reveals only id and 2FA flag |
| Test Type | Security / API |
| Priority | High |
| Preconditions | Back-office test environment |
| Test Data | back-office user (email UNKNOWN) |
| Steps | 1. GET admin-api /api/v1/me/ssr-session signed out and signed in; also with an expired cookie. |
| Expected Result | Signed out and expired: user null. Signed in: only id and twoFactorEnabled plus impersonated flag; no-store. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Superadmin and accountant emails UNKNOWN (Q-128 context). |

##### TC-1215 — Request id is echoed and sanitised
| Field | Value |
|---|---|
| Test Case ID | TC-1215 |
| Requirement ID | FR-567 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Request id is echoed and sanitised |
| Test Type | Functional / Security |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | x-request-id values: valid 12 chars; 'a b'; 300 chars; none |
| Steps | 1. Send each value to any route.<br>2. Read the response header. |
| Expected Result | A valid id is echoed; invalid or missing ones get a generated UUID. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-457. |

##### TC-1216 — Method handling: HEAD, OPTIONS, unknown verb and unknown path
| Field | Value |
|---|---|
| Test Case ID | TC-1216 |
| Requirement ID | FR-567 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Method handling: HEAD, OPTIONS, unknown verb and unknown path |
| Test Type | API / Boundary |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | any GET route |
| Steps | 1. HEAD the route.<br>2. OPTIONS the route.<br>3. Send PATCH to a route that does not export it.<br>4. GET /api/does-not-exist. |
| Expected Result | HEAD returns GET's status without a body; OPTIONS 204 with a sorted Allow; PATCH 405; unknown path the not-found envelope with 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-459. |

##### TC-1217 — Errors map to the envelope without leaking internals
| Field | Value |
|---|---|
| Test Case ID | TC-1217 |
| Requirement ID | FR-567 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Errors map to the envelope without leaking internals |
| Test Type | Security / Error handling |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | a duplicate-key create; a missing record; a forced server error |
| Steps | 1. Trigger each error through any owning-module endpoint.<br>2. Inspect status, code and message. |
| Expected Result | 422 business_rule, 404 not_found, 409 conflict as in BR-458; a 500 body contains no stack trace or SQL. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-250 on 5xx leakage. |

##### TC-1218 — Limiter blocks after the bucket is empty and refills
| Field | Value |
|---|---|
| Test Case ID | TC-1218 |
| Requirement ID | FR-568 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Limiter blocks after the bucket is empty and refills |
| Test Type | Boundary / Security |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | any limited route (health or csp-report) |
| Steps | 1. Exhaust the bucket.<br>2. Observe 429 with Retry-After 60 and code rate_limited.<br>3. Wait for refill. |
| Expected Result | 429 body {error:{code:'rate_limited', message:'Too many requests, please slow down.'}}; later requests pass again. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-454. |

##### TC-1219 — Limiter state is shared across two instances
| Field | Value |
|---|---|
| Test Case ID | TC-1219 |
| Requirement ID | FR-568 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Limiter state is shared across two instances |
| Test Type | Integration / Concurrency |
| Priority | Critical |
| Preconditions | Two api instances behind one Redis in a test environment |
| Test Data | alternating requests to both instances |
| Steps | 1. Send 40 requests to instance A and 40 to B from one IP within a minute. |
| Expected Result | The limit applies to the sum (429 appears after 60 total), not per instance. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Blocked if two instances are unavailable. |

##### TC-1220 — Redis outage falls back to memory then recovers
| Field | Value |
|---|---|
| Test Case ID | TC-1220 |
| Requirement ID | FR-568 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Redis outage falls back to memory then recovers |
| Test Type | Resilience |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; Redis can be stopped |
| Test Data | none |
| Steps | 1. Stop Redis.<br>2. Send requests until health shows local.<br>3. Start Redis and wait 30 s.<br>4. Send requests. |
| Expected Result | Requests are never rejected by the outage itself; mode returns to shared after recovery (recovery details UNKNOWN). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-453. |

##### TC-1221 — Production boot refuses to start without a shared rate-limit store
| Field | Value |
|---|---|
| Test Case ID | TC-1221 |
| Requirement ID | FR-569 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Production boot refuses to start without a shared rate-limit store |
| Test Type | Negative / Configuration |
| Priority | Critical |
| Preconditions | A throwaway production-mode local run, no production data |
| Test Data | REDIS_URL unset, ALLOW_UNSHARED_RATE_LIMIT unset |
| Steps | 1. Start the service in production mode. |
| Expected Result | The process exits with an error naming REDIS_URL. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-455. |

##### TC-1222 — Boot assertions for client-IP trust, proxy secret, https auth URL and signing secret
| Field | Value |
|---|---|
| Test Case ID | TC-1222 |
| Requirement ID | FR-569 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Boot assertions for client-IP trust, proxy secret, https auth URL and signing secret |
| Test Type | Negative / Configuration |
| Priority | Critical |
| Preconditions | Same throwaway setup |
| Test Data | remove each variable in turn: TRUSTED_CLIENT_IP_HEADER/TRUSTED_PROXY_HOPS (on Vercel), EDURA_PROXY_SECRET, signing secret; set NEXTAUTH_URL to http |
| Steps | 1. Start the service once per missing or invalid value. |
| Expected Result | Each start fails with an error naming the variable; with all set the service starts. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Names only; do not record values. |

##### TC-1223 — Spoofed forwarding headers do not change the limiter key
| Field | Value |
|---|---|
| Test Case ID | TC-1223 |
| Requirement ID | FR-570 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Spoofed forwarding headers do not change the limiter key |
| Test Type | Security |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running; trusted-header or hop mode configured as in production |
| Test Data | X-Forwarded-For and x-edura-client-ip with random values |
| Steps | 1. Exhaust the limit from one real client.<br>2. Repeat while rotating X-Forwarded-For and x-edura-client-ip. |
| Expected Result | The limit still applies; the forged values are ignored. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-242; also run against the real deployment in a controlled window. |

##### TC-1224 — Proxy stamp is believed only with the shared secret
| Field | Value |
|---|---|
| Test Case ID | TC-1224 |
| Requirement ID | FR-570 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Proxy stamp is believed only with the shared secret |
| Test Type | Security / Integration |
| Priority | Critical |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | request with a forged stamp; request through the ERP proxy |
| Steps | 1. Send a request directly to the api with a stamp signed by a wrong secret.<br>2. Send via the ERP rewrite. |
| Expected Result | Forged stamp ignored; the ERP-forwarded request carries the real client IP. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-456. |

##### TC-1225 — Public data is cached and cookie-setting or non-200 responses are not
| Field | Value |
|---|---|
| Test Case ID | TC-1225 |
| Requirement ID | FR-571 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Public data is cached and cookie-setting or non-200 responses are not |
| Test Type | Functional / Performance |
| Priority | Medium |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | a public catalog route |
| Steps | 1. Request twice and compare Cache-Control and timing.<br>2. Request one that sets a cookie or returns an error. |
| Expected Result | Cacheable 200 responses carry the shared-cache header; cookie-setting and non-200 responses never do; loader errors are not cached. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-475. |

##### TC-1226 — ERP responses carry the security headers and a nonce CSP
| Field | Value |
|---|---|
| Test Case ID | TC-1226 |
| Requirement ID | FR-572 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | ERP responses carry the security headers and a nonce CSP |
| Test Type | Security / Functional |
| Priority | High |
| Preconditions | ERP test environment |
| Test Data | any ERP page |
| Steps | 1. Fetch a page and read headers. |
| Expected Result | Content-Security-Policy with a per-request nonce and strict-dynamic, no unsafe-eval; HSTS 2 years with includeSubDomains and preload; nosniff; referrer-policy strict-origin-when-cross-origin; Permissions-Policy; X-Frame-Options SAMEORIGIN. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-460, BR-461. |

##### TC-1227 — Nonce differs per request and inline scripts without it are blocked
| Field | Value |
|---|---|
| Test Case ID | TC-1227 |
| Requirement ID | FR-572 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Nonce differs per request and inline scripts without it are blocked |
| Test Type | Security |
| Priority | High |
| Preconditions | Browser with developer tools |
| Test Data | two loads of one page; an injected inline script |
| Steps | 1. Load twice and compare nonces.<br>2. Inject an inline script tag without a nonce in the console and watch for a violation. |
| Expected Result | Nonces differ; the injected script is blocked and a violation is reported. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1228 — API responses carry the restrictive API CSP
| Field | Value |
|---|---|
| Test Case ID | TC-1228 |
| Requirement ID | FR-573 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | API responses carry the restrictive API CSP |
| Test Type | Security / API |
| Priority | High |
| Preconditions | Test environment (edura-env:test) with the api service running |
| Test Data | any JSON endpoint on both services |
| Steps | 1. Read response headers. |
| Expected Result | default-src 'none' with frame-ancestors present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-460. |

##### TC-1229 — CSP_MODE=report-only reports without blocking
| Field | Value |
|---|---|
| Test Case ID | TC-1229 |
| Requirement ID | FR-573 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | CSP_MODE=report-only reports without blocking |
| Test Type | Configuration / Security |
| Priority | High |
| Preconditions | Throwaway non-production run |
| Test Data | CSP_MODE=report-only |
| Steps | 1. Load a page and violate the policy.<br>2. Check headers and the console. |
| Expected Result | Header is Content-Security-Policy-Report-Only; nothing is blocked; a report is sent. In production the enforcing header must be present. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-253. |

##### TC-1230 — Marketing site headers and CSP
| Field | Value |
|---|---|
| Test Case ID | TC-1230 |
| Requirement ID | FR-574 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Marketing site headers and CSP |
| Test Type | Security / UNCLEAR |
| Priority | Medium |
| Preconditions | www test deployment |
| Test Data | home page |
| Steps | 1. Fetch the www home page headers. |
| Expected Result | Record the actual CSP, whether unsafe-inline is present in script-src, and report to the product owner. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Expected values UNKNOWN (Q-129). |

##### TC-1231 — Tenant host serves only the public profile root
| Field | Value |
|---|---|
| Test Case ID | TC-1231 |
| Requirement ID | FR-575 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Tenant host serves only the public profile root |
| Test Type | Functional / Security |
| Priority | High |
| Preconditions | Hosts for a tenant subdomain are reachable in a test environment (or the tenant-host unit test) |
| Test Data | tenant host; paths /, /dashboard, /api/x, /ingest |
| Steps | 1. Request / on the tenant host.<br>2. Request /dashboard.<br>3. Request /api/x and /ingest. |
| Expected Result | Root rewrites to the public profile; /dashboard redirects 307 to the canonical host; /api and /ingest answer 404. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-462. |

##### TC-1232 — Unknown tenant handle or auth on a tenant host
| Field | Value |
|---|---|
| Test Case ID | TC-1232 |
| Requirement ID | FR-575 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unknown tenant handle or auth on a tenant host |
| Test Type | Negative / Security |
| Priority | High |
| Preconditions | Same |
| Test Data | unknown handle; /api/auth/sign-in on a tenant host |
| Steps | 1. Open an unknown handle.<br>2. Try the sign-in path. |
| Expected Result | No sign-in is possible on a tenant host (auth never on a subdomain); unknown handle shows a not-found result (exact page UNKNOWN). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1233 — Events carry identifiers only and redact personal data
| Field | Value |
|---|---|
| Test Case ID | TC-1233 |
| Requirement ID | FR-576 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Events carry identifiers only and redact personal data |
| Test Type | Security / Privacy |
| Priority | High |
| Preconditions | Sentry in a test project or the observability unit tests |
| Test Data | an error raised with an email, token and Egyptian phone number in its message and URL |
| Steps | 1. Raise the error.<br>2. Inspect the captured event. |
| Expected Result | Bodies, cookies and headers are absent; tokens, emails and phone numbers are redacted. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-463. |

##### TC-1234 — A scrubbing failure drops the event
| Field | Value |
|---|---|
| Test Case ID | TC-1234 |
| Requirement ID | FR-576 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | A scrubbing failure drops the event |
| Test Type | Negative |
| Priority | High |
| Preconditions | Observability unit test |
| Test Data | an event object that makes scrubbing throw |
| Steps | 1. Run the scrubber. |
| Expected Result | The event is dropped rather than sent unscrubbed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1235 — Offline navigation shows the offline page
| Field | Value |
|---|---|
| Test Case ID | TC-1235 |
| Requirement ID | FR-577 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Offline navigation shows the offline page |
| Test Type | Functional / PWA |
| Priority | Medium |
| Preconditions | ERP loaded once online with the service worker active |
| Test Data | Chrome |
| Steps | 1. Go offline in developer tools.<br>2. Navigate to a page not visited before. |
| Expected Result | /offline.html shows with the Arabic heading and a Retry button. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1236 — Install prompt appears, installs and stays hidden for 14 days after dismissal
| Field | Value |
|---|---|
| Test Case ID | TC-1236 |
| Requirement ID | FR-578 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Install prompt appears, installs and stays hidden for 14 days after dismissal |
| Test Type | Functional / UI |
| Priority | Medium |
| Preconditions | Chrome on desktop or Android, not installed |
| Test Data | none |
| Steps | 1. Open the ERP and wait for the prompt.<br>2. Click Not now.<br>3. Reload.<br>4. Change the stored dismissal time to 15 days ago and reload. |
| Expected Result | Prompt appears; after dismissal it does not return until 14 days pass. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-465. |

##### TC-1237 — Manifest is valid and icons satisfy install criteria
| Field | Value |
|---|---|
| Test Case ID | TC-1237 |
| Requirement ID | FR-578 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Manifest is valid and icons satisfy install criteria |
| Test Type | Compatibility / UI |
| Priority | Medium |
| Preconditions | Chrome developer tools Application tab |
| Test Data | none |
| Steps | 1. Open the manifest panel and read warnings.<br>2. Try to install on Android Chrome. |
| Expected Result | Manifest parses; record whether SVG-only icons block installation (GAP-240). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1238 — Offline attendance rows queue and sync after reconnect
| Field | Value |
|---|---|
| Test Case ID | TC-1238 |
| Requirement ID | FR-579 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Offline attendance rows queue and sync after reconnect |
| Test Type | Functional / Workflow |
| Priority | High |
| Preconditions | Teacher logged in on the ERP with a live session; PWA active |
| Test Data | teacher hossam.aziz@nile-academy.eg (password: see docs/guides/test-credentials.md) |
| Steps | 1. Go offline.<br>2. Mark attendance for two students.<br>3. Go online and wait up to 60 s. |
| Expected Result | Rows are queued then sent; the queue empties; the server shows the attendance. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Attendance rules belong to the sessions module. |

##### TC-1239 — Outbox boundaries: 500 rows, failure back-off and refused rows
| Field | Value |
|---|---|
| Test Case ID | TC-1239 |
| Requirement ID | FR-579 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Outbox boundaries: 500 rows, failure back-off and refused rows |
| Test Type | Boundary / Negative |
| Priority | High |
| Preconditions | Same, with a script to add rows to IndexedDB edura-offline |
| Test Data | 501 queued rows; a server error response |
| Steps | 1. Queue 501 rows.<br>2. Reconnect and observe chunks.<br>3. Force the server to fail one request. |
| Expected Result | Rows go in chunks of 500; after a failure no retry for 5 minutes; rows the server refused are kept. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-466. |

##### TC-1240 — Push subscription depends on the VAPID public key and permission
| Field | Value |
|---|---|
| Test Case ID | TC-1240 |
| Requirement ID | FR-580 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Push subscription depends on the VAPID public key and permission |
| Test Type | Functional / Configuration |
| Priority | Medium |
| Preconditions | ERP in a browser with and without NEXT_PUBLIC_VAPID_PUBLIC_KEY |
| Test Data | teacher or parent test account |
| Steps | 1. Without the key try to enable notifications.<br>2. With the key grant permission.<br>3. Deny permission. |
| Expected Result | Without the key subscribing silently returns false; with permission a subscription is registered; denial registers nothing. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-250. |

##### TC-1241 — Logout removes cached API data and local state
| Field | Value |
|---|---|
| Test Case ID | TC-1241 |
| Requirement ID | FR-581 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Logout removes cached API data and local state |
| Test Type | Security / Functional |
| Priority | High |
| Preconditions | Signed in teacher with cached API reads |
| Test Data | teacher account |
| Steps | 1. Browse pages to fill the cache.<br>2. Log out.<br>3. Inspect Cache Storage and localStorage. |
| Expected Result | Non-static caches are deleted and edura_state removed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-468. |

##### TC-1242 — Offline outbox survives logout on a shared device
| Field | Value |
|---|---|
| Test Case ID | TC-1242 |
| Requirement ID | FR-581 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Offline outbox survives logout on a shared device |
| Test Type | Security / Negative |
| Priority | High |
| Preconditions | Teacher A with queued offline rows; teacher B account |
| Test Data | hossam.aziz@nile-academy.eg then hana.rashidi@nile-academy.eg |
| Steps | 1. Queue rows as A offline.<br>2. Log out.<br>3. Inspect IndexedDB edura-offline.<br>4. Log in as B and observe sync. |
| Expected Result | Rows remain in IndexedDB; B's sync ignores A's rows (filtered by teacherId). Confirms GAP-239. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1243 — Locale prefix is always present and default is Arabic
| Field | Value |
|---|---|
| Test Case ID | TC-1243 |
| Requirement ID | FR-582 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Locale prefix is always present and default is Arabic |
| Test Type | Functional |
| Priority | High |
| Preconditions | ERP test environment |
| Test Data | URLs / and /dashboard |
| Steps | 1. Open / with no locale.<br>2. Open a path without a prefix. |
| Expected Result | The URL gets a locale prefix; Arabic is the default and the page is RTL. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-469. |

##### TC-1244 — Unknown locale prefix and language detection edge
| Field | Value |
|---|---|
| Test Case ID | TC-1244 |
| Requirement ID | FR-582 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unknown locale prefix and language detection edge |
| Test Type | Negative / Boundary |
| Priority | High |
| Preconditions | Same |
| Test Data | /fr/ ; Accept-Language: en |
| Steps | 1. Open /fr/.<br>2. Open / with Accept-Language en. |
| Expected Result | Record the behaviour (UNKNOWN in spec); no server error. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Expected value needs product owner. |

##### TC-1245 — English fills missing Arabic keys and direction follows the locale
| Field | Value |
|---|---|
| Test Case ID | TC-1245 |
| Requirement ID | FR-583 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | English fills missing Arabic keys and direction follows the locale |
| Test Type | UI / Functional |
| Priority | Medium |
| Preconditions | ERP test environment |
| Test Data | ar and en views of one page |
| Steps | 1. Open the page in ar and en.<br>2. Check html lang and dir. |
| Expected Result | ar has dir rtl, en ltr; no raw message keys are visible. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | i18n-parity.test.ts guards new keys. |

##### TC-1246 — Unknown URL shows the localized 404 and an error shows the boundary
| Field | Value |
|---|---|
| Test Case ID | TC-1246 |
| Requirement ID | FR-584 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unknown URL shows the localized 404 and an error shows the boundary |
| Test Type | UI / Functional |
| Priority | Low |
| Preconditions | ERP test environment |
| Test Data | /ar/does-not-exist |
| Steps | 1. Open the URL.<br>2. Click Back to home. |
| Expected Result | Heading 'الصفحة غير موجودة' in Arabic (en: 'Page not found') and a home link. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | ui.md Page 1. |

##### TC-1247 — ui-preview is a 404 in production
| Field | Value |
|---|---|
| Test Case ID | TC-1247 |
| Requirement ID | FR-585 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | ui-preview is a 404 in production |
| Test Type | Security / Functional |
| Priority | Low |
| Preconditions | Production-mode build or deployment |
| Test Data | /ar/ui-preview |
| Steps | 1. Open the URL. |
| Expected Result | The 404 page shows; in development the gallery renders. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1248 — Tour pages require the matching role
| Field | Value |
|---|---|
| Test Case ID | TC-1248 |
| Requirement ID | FR-586 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Tour pages require the matching role |
| Test Type | Authorization / UNCLEAR |
| Priority | Medium |
| Preconditions | ERP test environment |
| Test Data | student, parent, teacher and center_admin accounts (password: see docs/guides/test-credentials.md) |
| Steps | 1. For each of four tour URLs open it as every role including signed out. |
| Expected Result | Record which roles can open which tour; expected is only the matching role (to be confirmed, Q-128). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-243. Sample data must not write to the real database. |

##### TC-1249 — Rewrites send API prefixes to the api service and health is green on every host
| Field | Value |
|---|---|
| Test Case ID | TC-1249 |
| Requirement ID | FR-587 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Rewrites send API prefixes to the api service and health is green on every host |
| Test Type | Integration / Smoke |
| Priority | High |
| Preconditions | Deployed ERP, back-office and www hosts |
| Test Data | edura-erp, edura-superadmin and edura-www hosts |
| Steps | 1. Call /api/health through the ERP host.<br>2. Call the back-office health.<br>3. Open the www home page. |
| Expected Result | Each answers 200; ERP API calls reach the api service. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Names of hosts only. |

##### TC-1250 — Unreachable service shows a clear failure
| Field | Value |
|---|---|
| Test Case ID | TC-1250 |
| Requirement ID | FR-587 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unreachable service shows a clear failure |
| Test Type | Negative / Resilience |
| Priority | High |
| Preconditions | Test environment with the api service stopped |
| Test Data | ERP page needing data |
| Steps | 1. Stop the api service.<br>2. Open a data page. |
| Expected Result | The ERP shows its error state (not a blank page); no crash loop. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1251 — Missing required environment value fails the boot
| Field | Value |
|---|---|
| Test Case ID | TC-1251 |
| Requirement ID | FR-588 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Missing required environment value fails the boot |
| Test Type | Negative / Configuration |
| Priority | Critical |
| Preconditions | Throwaway non-production run |
| Test Data | unset one required variable at a time (names in testenv.md) |
| Steps | 1. Start the service. |
| Expected Result | Start fails fast with the variable name; no default secret is used. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Names only. |

##### TC-1252 — Mock payment mode cannot be mistaken for live
| Field | Value |
|---|---|
| Test Case ID | TC-1252 |
| Requirement ID | FR-588 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Mock payment mode cannot be mistaken for live |
| Test Type | Configuration / Security |
| Priority | Critical |
| Preconditions | Test environment |
| Test Data | PAYMENTS_MODE=mock then live without keys |
| Steps | 1. Start with each mode. |
| Expected Result | mock works without keys; live without keys is refused. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Exact behaviour per payments module; record. |

##### TC-1253 — CI pipeline runs lint, type check and tests
| Field | Value |
|---|---|
| Test Case ID | TC-1253 |
| Requirement ID | FR-589 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | CI pipeline runs lint, type check and tests |
| Test Type | Regression / Configuration |
| Priority | Medium |
| Preconditions | Pull request in the repository |
| Test Data | none |
| Steps | 1. Open the last CI run. |
| Expected Result | All jobs green; the DB suites ran against Postgres 17 with the app role. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1254 — Deploy is blocked while a migration is pending
| Field | Value |
|---|---|
| Test Case ID | TC-1254 |
| Requirement ID | FR-590 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Deploy is blocked while a migration is pending |
| Test Type | Workflow / Negative |
| Priority | High |
| Preconditions | Sandbox or review of deploy.yml |
| Test Data | a migration not yet applied |
| Steps | 1. Run the pending-migration check. |
| Expected Result | The check fails and the deploy does not proceed. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Do not run against production. |

##### TC-1255 — Production migration requires the guard and a typed confirmation for cleanup
| Field | Value |
|---|---|
| Test Case ID | TC-1255 |
| Requirement ID | FR-590 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Production migration requires the guard and a typed confirmation for cleanup |
| Test Type | Workflow / Security |
| Priority | High |
| Preconditions | Review of migrate-production.yml |
| Test Data | none |
| Steps | 1. Read the inputs and guards.<br>2. Dispatch in a sandbox with a wrong confirmation. |
| Expected Result | The workflow is manual only; db-guard production runs; cleanup refuses without the typed confirmation. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | BR-472, BR-473. Never dispatch against production for testing. |

##### TC-1256 — Nightly backup produces an encrypted object and prunes by retention
| Field | Value |
|---|---|
| Test Case ID | TC-1256 |
| Requirement ID | FR-591 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Nightly backup produces an encrypted object and prunes by retention |
| Test Type | Integration / Backup |
| Priority | High |
| Preconditions | Test bucket and a non-production database |
| Test Data | BACKUP_KEEP_DAILY and BACKUP_KEEP_WEEKLY at their defaults |
| Steps | 1. Run the backup script.<br>2. List the bucket.<br>3. Run it more times than the retention. |
| Expected Result | An encrypted dump appears; no plaintext copy; older dumps are pruned to 7 daily and 4 weekly. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-244. |

##### TC-1257 — Backup failure alerts the owner
| Field | Value |
|---|---|
| Test Case ID | TC-1257 |
| Requirement ID | FR-591 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Backup failure alerts the owner |
| Test Type | Negative |
| Priority | High |
| Preconditions | Test setup with a wrong bucket value |
| Test Data | invalid bucket |
| Steps | 1. Run the backup. |
| Expected Result | The job fails (red) and the alert address is notified (delivery path UNKNOWN). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1258 — Weekly restore test restores and verifies the latest dump
| Field | Value |
|---|---|
| Test Case ID | TC-1258 |
| Requirement ID | FR-592 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Weekly restore test restores and verifies the latest dump |
| Test Type | Integration / Backup |
| Priority | Medium |
| Preconditions | Test bucket with a dump; scratch database |
| Test Data | latest dump |
| Steps | 1. Run the restore test.<br>2. Read the verification output. |
| Expected Result | Dump is decrypted, restored into scratch and checked; the run is green. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1259 — Timed restore drill from backup into a copy
| Field | Value |
|---|---|
| Test Case ID | TC-1259 |
| Requirement ID | FR-593 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Timed restore drill from backup into a copy |
| Test Type | Backup / Recovery |
| Priority | High |
| Preconditions | A test copy; product owner approves the drill |
| Test Data | latest dump |
| Steps | 1. Note the start time.<br>2. Restore.<br>3. Run the read-only verification script on the copy.<br>4. Note elapsed time. |
| Expected Result | The copy passes verification; elapsed time is recorded as the actual restore time. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | No RTO is defined (Q-134). |

##### TC-1260 — Point-in-time recovery window and runbook accuracy
| Field | Value |
|---|---|
| Test Case ID | TC-1260 |
| Requirement ID | FR-593 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Point-in-time recovery window and runbook accuracy |
| Test Type | Documentation / UNCLEAR |
| Priority | High |
| Preconditions | Access to the database provider console |
| Test Data | none |
| Steps | 1. Read the provider's recovery window.<br>2. Compare with docs/runbooks/backup-restore.md. |
| Expected Result | Record the window and any contradictions (GAP-244, GAP-254). |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Cannot be verified from the repo. |

##### TC-1261 — Realtime health endpoint
| Field | Value |
|---|---|
| Test Case ID | TC-1261 |
| Requirement ID | FR-594 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Realtime health endpoint |
| Test Type | Smoke / API |
| Priority | Medium |
| Preconditions | Realtime server running in the test environment |
| Test Data | none |
| Steps | 1. GET /healthz on the realtime server. |
| Expected Result | Answers 200 (body shape UNKNOWN); a chat message sent while the API is up reaches the recipient. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

##### TC-1262 — Health through the ERP host keeps the visitor's IP for the limiter
| Field | Value |
|---|---|
| Test Case ID | TC-1262 |
| Requirement ID | FR-548 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Health through the ERP host keeps the visitor's IP for the limiter |
| Test Type | Integration / Security |
| Priority | High |
| Preconditions | Deployed environment with the ERP rewrite |
| Test Data | 70 requests from one network |
| Steps | 1. Send 70 requests to the ERP host health path in a minute. |
| Expected Result | The 61st is limited per real client IP, not per ERP server. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | FR-570. |

##### TC-1263 — Cron endpoint under load does not exhaust the database pool
| Field | Value |
|---|---|
| Test Case ID | TC-1263 |
| Requirement ID | FR-552 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Cron endpoint under load does not exhaust the database pool |
| Test Type | Performance / Security |
| Priority | Medium |
| Preconditions | Test environment only |
| Test Data | 100 authorized calls to the same cheap job |
| Steps | 1. Send 100 calls over 10 seconds. |
| Expected Result | Service stays responsive; health stays 200. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | GAP-241 (no limiter). |

##### TC-1264 — Unknown paths and unsupported verbs through the ERP rewrite
| Field | Value |
|---|---|
| Test Case ID | TC-1264 |
| Requirement ID | FR-567 |
| Module | Platform, Infrastructure and Non-Functional |
| Test Scenario | Unknown paths and unsupported verbs through the ERP rewrite |
| Test Type | Regression / API |
| Priority | High |
| Preconditions | ERP and api services |
| Test Data | GET /api/v1/does-not-exist |
| Steps | 1. Request through the ERP host. |
| Expected Result | 404 envelope from the api service, not an HTML page. |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | - |

### 13. Data Model & Data Integrity

**Environment for every TC: the LOCAL test database `edura_test`, labelled `edura-env:test` (or a disposable LOCAL scratch database where the TC says so). Never dev, never production.** Prefix every Prisma/script command with `EDURA_ENV=test`.

**P0 (standard precondition):** edura_test prepared per WF-116 and seeded with seed.ts (center NILE). Connect as the owner role, then `BEGIN; SET LOCAL ROLE edura_app;`. End with `ROLLBACK`. Use SAVEPOINTs when a step is expected to fail. Look up ids with a SELECT first (e.g. `SELECT id FROM centers WHERE short_id='NILE'`). Required columns for an INSERT: see data.md for that entity.

Passwords: none needed — see docs/guides/test-credentials.md for login tests in other modules.

##### TC-1265 — Tenant context hides another center's rows

| Field | Value |
|---|---|
| Test Case ID | TC-1265 |
| Requirement ID | FR-595 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Tenant context hides another center's rows |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; center B created inside the transaction under bypass |
| Test Data | NILE id; center B (required columns per data.md Center), one rooms row for B |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert center B and a rooms row for B.<br>2. `SELECT set_config('app.bypass_rls','off',true);` SELECT set_config('app.current_center_id', '<NILE id>', true);<br>3. `SELECT count(*) FROM rooms WHERE center_id = '<B id>';`<br>4. `SELECT count(*) FROM centers;`<br>5. ROLLBACK |
| Expected Result | Step 3 returns 0; step 4 returns 1 (NILE only) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1266 — Cross-tenant INSERT rejected by WITH CHECK

| Field | Value |
|---|---|
| Test Case ID | TC-1266 |
| Requirement ID | FR-595 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Cross-tenant INSERT rejected by WITH CHECK |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; center B as in previous TC |
| Test Data | rooms row with center_id = B |
| Steps | 1. Create B under bypass, turn bypass off.<br>2. SELECT set_config('app.current_center_id', '<NILE id>', true);<br>3. INSERT INTO rooms (…required columns…, center_id) VALUES (…, '<B id>');<br>4. ROLLBACK |
| Expected Result | Error `new row violates row-level security policy for table "rooms"` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1267 — No context set returns no tenant rows

| Field | Value |
|---|---|
| Test Case ID | TC-1267 |
| Requirement ID | FR-595 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | No context set returns no tenant rows |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. `SELECT count(*) FROM centers;` `SELECT count(*) FROM payments;` with no GUC set<br>2. ROLLBACK |
| Expected Result | Both return 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1268 — Exactly the 41 pinned tables have FORCE RLS

| Field | Value |
|---|---|
| Test Case ID | TC-1268 |
| Requirement ID | FR-595 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Exactly the 41 pinned tables have FORCE RLS |
| Test Type | Database |
| Priority | Critical |
| Preconditions | Owner connection to edura_test (read-only query) |
| Test Data | — |
| Steps | 1. `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity ORDER BY 1;` |
| Expected Result | 41 rows, identical to the list in apps/erp/tests/db/rls-table-set.test.ts:15-25 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Also run that suite |

##### TC-1269 — Tenant GUC does not survive the transaction

| Field | Value |
|---|---|
| Test Case ID | TC-1269 |
| Requirement ID | FR-596 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Tenant GUC does not survive the transaction |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | NILE id |
| Steps | 1. BEGIN; SELECT set_config('app.current_center_id', '<NILE id>', true); COMMIT;<br>2. On the same connection: `SELECT current_setting('app.current_center_id', true);` |
| Expected Result | Empty string or NULL — no leak into the next transaction |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1270 — Platform bypass sees every center

| Field | Value |
|---|---|
| Test Case ID | TC-1270 |
| Requirement ID | FR-596 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Platform bypass sees every center |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; center B created |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. Create B.<br>3. `SELECT count(*) FROM centers;`<br>4. ROLLBACK |
| Expected Result | Count ≥ 2 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1271 — Staff are scoped to their own center through authorizeCenterActor

| Field | Value |
|---|---|
| Test Case ID | TC-1271 |
| Requirement ID | FR-596 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Staff are scoped to their own center through authorizeCenterActor |
| Test Type | Database (automated suite) |
| Priority | Critical |
| Preconditions | edura_test prepared; bun installed |
| Test Data | — |
| Steps | 1. `EDURA_ENV=test bun run test:db:local` (ERP suites center-staff-delegation, sessions-staff-scope, poc-m01-staff-session-idor) |
| Expected Result | All three suites pass |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Suites: apps/erp/tests/db/center-staff-delegation.test.ts, sessions-staff-scope.test.ts, poc-m01-staff-session-idor.test.ts |

##### TC-1272 — App role is not privileged

| Field | Value |
|---|---|
| Test Case ID | TC-1272 |
| Requirement ID | FR-597 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | App role is not privileged |
| Test Type | Database |
| Priority | Critical |
| Preconditions | Owner connection to edura_test |
| Test Data | — |
| Steps | 1. `SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname='edura_app';` |
| Expected Result | false, false, true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1273 — Client refuses to serve as the owner role

| Field | Value |
|---|---|
| Test Case ID | TC-1273 |
| Requirement ID | FR-597 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Client refuses to serve as the owner role |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | edura_test; a throw-away script using `createPrismaClient` with DATABASE_URL set to the LOCAL owner URL |
| Test Data | — |
| Steps | 1. Run any query (e.g. `prisma.subject.count()`) through the client |
| Expected Result | Throws an error starting `role-guard: REFUSING TO SERVE as database role` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | packages/database/src/extensions/index.ts:250-324 |

##### TC-1274 — Catalog readable under tenant context

| Field | Value |
|---|---|
| Test Case ID | TC-1274 |
| Requirement ID | FR-598 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Catalog readable under tenant context |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. SELECT set_config('app.current_center_id', '<NILE id>', true);<br>2. `SELECT count(*) FROM subjects; SELECT count(*) FROM tracks;` |
| Expected Result | Both > 0 (seeded catalog) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1275 — Catalog write without bypass rejected

| Field | Value |
|---|---|
| Test Case ID | TC-1275 |
| Requirement ID | FR-598 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Catalog write without bypass rejected |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. SELECT set_config('app.current_center_id', '<NILE id>', true);<br>2. INSERT INTO subjects (…required columns…) VALUES (…);<br>3. `UPDATE subjects SET name_ar = name_ar;` (row count)<br>4. ROLLBACK |
| Expected Result | Step 2: RLS violation; step 3: UPDATE 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Column names per data.md Subject |

##### TC-1276 — Append-only tables refuse UPDATE and DELETE

| Field | Value |
|---|---|
| Test Case ID | TC-1276 |
| Requirement ID | FR-599 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Append-only tables refuse UPDATE and DELETE |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | 9 tables: transactions, points_ledger, audit_logs, session_settlements, teacher_system_status_changes, external_teacher_settlements, wallet_ledger, parent_wallet_ledger, center_wallet_ledger |
| Steps | 1. For each table T: `UPDATE T SET id = id WHERE false;` then `DELETE FROM T WHERE false;` (each in its own SAVEPOINT)<br>2. ROLLBACK |
| Expected Result | Every statement fails with `permission denied for table T` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1277 — Grant map matches verify-db

| Field | Value |
|---|---|
| Test Case ID | TC-1277 |
| Requirement ID | FR-599 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Grant map matches verify-db |
| Test Type | Database |
| Priority | Critical |
| Preconditions | Owner connection to edura_test |
| Test Data | — |
| Steps | 1. `SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE grantee='edura_app' AND table_name IN (…9 tables…) GROUP BY 1;` |
| Expected Result | Each row lists exactly INSERT,SELECT |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1278 — ORM refuses update on a ledger model

| Field | Value |
|---|---|
| Test Case ID | TC-1278 |
| Requirement ID | FR-599 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | ORM refuses update on a ledger model |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | edura_test; script via the app Prisma client (edura_app) |
| Test Data | any transactions id (or a non-existent id) |
| Steps | 1. `prisma.transaction.update({ where:{id}, data:{} })`<br>2. `prisma.walletLedger.deleteMany({})` |
| Expected Result | Both throw `… is append-only (PRD Database Conventions). Use a reversal-entry insert instead of …` before reaching the DB |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1279 — No DELETE on payments, invoices, payouts

| Field | Value |
|---|---|
| Test Case ID | TC-1279 |
| Requirement ID | FR-600 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | No DELETE on payments, invoices, payouts |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. `DELETE FROM payments WHERE false;` `DELETE FROM invoices WHERE false;` `DELETE FROM payouts WHERE false;` (separate savepoints)<br>2. ROLLBACK |
| Expected Result | Each: permission denied |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1280 — ORM refuses hard delete of a payment

| Field | Value |
|---|---|
| Test Case ID | TC-1280 |
| Requirement ID | FR-600 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | ORM refuses hard delete of a payment |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | As TC for ledger ORM |
| Test Data | — |
| Steps | 1. `prisma.payment.delete({ where:{id:'<any uuid>'} })` |
| Expected Result | Throws `… must not be hard-deleted (financial record). Void/reject it via a status update instead.` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1281 — Hard DELETE on users denied

| Field | Value |
|---|---|
| Test Case ID | TC-1281 |
| Requirement ID | FR-601 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Hard DELETE on users denied |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. `DELETE FROM users WHERE false;`<br>2. ROLLBACK |
| Expected Result | permission denied for table users |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Also covered by apps/erp/tests/db/c08-users-no-delete.test.ts |

##### TC-1282 — ORM delete becomes soft delete; list hides, findUnique returns

| Field | Value |
|---|---|
| Test Case ID | TC-1282 |
| Requirement ID | FR-601 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | ORM delete becomes soft delete; list hides, findUnique returns |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | edura_test; scratch user created by the script (is_demo=true) |
| Test Data | scratch user |
| Steps | 1. `prisma.user.delete({where:{id}})`<br>2. `SELECT deleted_at FROM users WHERE id=…` (owner)<br>3. `prisma.user.findMany({where:{id}})`<br>4. `prisma.user.findUnique({where:{id}})`<br>5. Clean up scratch user as owner |
| Expected Result | 2: deleted_at set; 3: empty; 4: returns the row (findUnique not filtered — see GAP-263) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1283 — Status change deletes auth_sessions (trigger)

| Field | Value |
|---|---|
| Test Case ID | TC-1283 |
| Requirement ID | FR-602 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Status change deletes auth_sessions (trigger) |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Student lina.hassan@student.nile-academy.eg; one auth_sessions row inserted for her (id, token, user_id, expires_at …) |
| Steps | 1. INSERT auth_sessions row for Lina.<br>2. `UPDATE users SET status='suspended' WHERE email='lina.hassan@student.nile-academy.eg';`<br>3. `SELECT count(*) FROM auth_sessions WHERE user_id = '<Lina id>';`<br>4. ROLLBACK |
| Expected Result | Step 3 returns 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1284 — Setting deleted_at or bumping token_version also revokes

| Field | Value |
|---|---|
| Test Case ID | TC-1284 |
| Requirement ID | FR-602 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Setting deleted_at or bumping token_version also revokes |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | As above |
| Steps | 1. Insert a session; `UPDATE users SET token_version = token_version + 1 WHERE …;` count sessions.<br>2. Insert again; `UPDATE users SET deleted_at = now() WHERE …;` count.<br>3. ROLLBACK |
| Expected Result | 0 after each update |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1285 — ORM bumps token_version on deactivation

| Field | Value |
|---|---|
| Test Case ID | TC-1285 |
| Requirement ID | FR-602 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | ORM bumps token_version on deactivation |
| Test Type | Integration |
| Priority | Critical |
| Preconditions | edura_test; scratch user |
| Test Data | — |
| Steps | 1. Read token_version.<br>2. `prisma.user.update({where:{id}, data:{status:'suspended'}})`.<br>3. Read token_version.<br>4. Repeat with data `{status:'suspended', tokenVersion: 7}` |
| Expected Result | Step 3 = old + 1; step 4 = 7 (caller value wins) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Also apps/erp/tests/db/c03-status-revocation.test.ts, l1-session-invalidation.test.ts |

##### TC-1286 — password_hash mirrors to the credential row

| Field | Value |
|---|---|
| Test Case ID | TC-1286 |
| Requirement ID | FR-603 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | password_hash mirrors to the credential row |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Teacher hossam.aziz@nile-academy.eg; dummy hash string `test-hash-not-a-password` |
| Steps | 1. `UPDATE users SET password_hash='test-hash-not-a-password' WHERE email='hossam.aziz@nile-academy.eg';`<br>2. `SELECT password FROM auth_accounts WHERE user_id=… AND provider_id='credential';`<br>3. `UPDATE users SET password_hash=NULL …;` repeat step 2<br>4. ROLLBACK |
| Expected Result | Step 2 equals the dummy value; after step 3 no credential row |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Do not print real hashes in the report |

##### TC-1287 — Default reads omit passwordHash

| Field | Value |
|---|---|
| Test Case ID | TC-1287 |
| Requirement ID | FR-604 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Default reads omit passwordHash |
| Test Type | Integration |
| Priority | High |
| Preconditions | edura_test; app Prisma client |
| Test Data | admin@nile-academy.eg |
| Steps | 1. `prisma.user.findFirst({where:{email}})` |
| Expected Result | Result object has no `passwordHash` key |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1288 — Payment amount upper bound

| Field | Value |
|---|---|
| Test Case ID | TC-1288 |
| Requirement ID | FR-605 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Payment amount upper bound |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | NILE; required payment columns (receipt_number, recorded_by, data_source …) |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT payment amount 99999900 → note result.<br>3. INSERT payment amount 99999901.<br>4. ROLLBACK |
| Expected Result | Step 2 succeeds; step 3 check violation (23514) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1289 — Wallet balances cannot go negative

| Field | Value |
|---|---|
| Test Case ID | TC-1289 |
| Requirement ID | FR-605 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Wallet balances cannot go negative |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Lina's student_profiles row; Mona's parent_profiles; Hossam's teacher_profiles; NILE |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. `UPDATE student_profiles SET wallet_balance = -1 WHERE …;` (savepoint) and the same for parent_profiles, teacher_profiles, centers<br>3. Set each to 0<br>4. ROLLBACK |
| Expected Result | Each -1 → check violation; 0 accepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1290 — Transaction amount must be non-negative

| Field | Value |
|---|---|
| Test Case ID | TC-1290 |
| Requirement ID | FR-605 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Transaction amount must be non-negative |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | required transactions columns |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); INSERT transaction amount -1<br>2. ROLLBACK |
| Expected Result | check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1291 — wallet_ledger balance_after ≥ 0

| Field | Value |
|---|---|
| Test Case ID | TC-1291 |
| Requirement ID | FR-606 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | wallet_ledger balance_after ≥ 0 |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Lina student id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT wallet_ledger (student_id, type, delta, balance_after) with balance_after = -1, then = 0<br>3. ROLLBACK |
| Expected Result | -1 rejected; 0 accepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1292 — parent_wallet_ledger balance_after ≥ 0

| Field | Value |
|---|---|
| Test Case ID | TC-1292 |
| Requirement ID | FR-606 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | parent_wallet_ledger balance_after ≥ 0 |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Mona parent id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); INSERT parent_wallet_ledger with balance_after = -1<br>2. ROLLBACK |
| Expected Result | check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Also apps/erp/tests/db/l01-wallet-balance-after.test.ts |

##### TC-1293 — Subscription target shape

| Field | Value |
|---|---|
| Test Case ID | TC-1293 |
| Requirement ID | FR-607 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Subscription target shape |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Lina, Hossam, NILE course |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT subscription target_type='center', center_id NULL<br>3. INSERT target_type='teacher', center_id = NILE<br>4. ROLLBACK |
| Expected Result | Both check violations (subs_target_shape) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1294 — Subscription plan shape and price

| Field | Value |
|---|---|
| Test Case ID | TC-1294 |
| Requirement ID | FR-607 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Subscription plan shape and price |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | as above |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. plan='per_session', session_id NULL<br>3. plan='monthly', session_id set<br>4. price = 0<br>5. ROLLBACK |
| Expected Result | All rejected (subs_plan_session / subs_price_positive) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1295 — Only one active monthly subscription per student and course

| Field | Value |
|---|---|
| Test Case ID | TC-1295 |
| Requirement ID | FR-607 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Only one active monthly subscription per student and course |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | as above |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT valid active monthly subscription (with activation data)<br>3. INSERT a second identical active one<br>4. ROLLBACK |
| Expected Result | Step 3: 23505 on subs_one_active_monthly |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1296 — Reversal must be negative and linked

| Field | Value |
|---|---|
| Test Case ID | TC-1296 |
| Requirement ID | FR-608 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Reversal must be negative and linked |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; one original payment of 10000 |
| Test Data | original payment |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT payment reversal_of_id = original, amount = +500<br>3. ROLLBACK |
| Expected Result | check violation payments_reversal_is_negative |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1297 — refunded_total cannot exceed amount

| Field | Value |
|---|---|
| Test Case ID | TC-1297 |
| Requirement ID | FR-608 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | refunded_total cannot exceed amount |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; original 10000 |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. `UPDATE payments SET refunded_total = 10000 WHERE id=…;` (ok)<br>3. `… = 10001`<br>4. `… = -1`<br>5. ROLLBACK |
| Expected Result | Step 2 ok; 3 and 4 violate payments_refunded_within_amount |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1298 — External refund reference unique per channel; confirmation pair

| Field | Value |
|---|---|
| Test Case ID | TC-1298 |
| Requirement ID | FR-608 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | External refund reference unique per channel; confirmation pair |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; two reversal rows |
| Test Data | channel non-cash, same refund_external_ref |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. Set the same external ref + channel on both reversals<br>3. Repeat with channel cash_drawer<br>4. Set refund_confirmed_at without refund_confirmed_by<br>5. ROLLBACK |
| Expected Result | 2: 23505; 3: allowed; 4: check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1299 — Several partial refunds allowed on one counter receipt

| Field | Value |
|---|---|
| Test Case ID | TC-1299 |
| Requirement ID | FR-608 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Several partial refunds allowed on one counter receipt |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; original 10000 |
| Test Data | two reversals −3000 and −2000 |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert both reversals, set refunded_total = 5000<br>2. ROLLBACK |
| Expected Result | Both accepted (payments_one_refund_per_payment no longer exists) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/refund-bound.test.ts, c06-refund-guards.test.ts |

##### TC-1300 — Settlement must conserve the money

| Field | Value |
|---|---|
| Test Case ID | TC-1300 |
| Requirement ID | FR-609 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Settlement must conserve the money |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0; a NILE session id |
| Test Data | per_session_price 10000, present_count 3 |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT session_settlements with totals summing to 30000 → ok<br>3. INSERT another (new session id) with totals summing to 29999<br>4. ROLLBACK |
| Expected Result | Step 3: session_settlements_conserve violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1301 — One settlement per session

| Field | Value |
|---|---|
| Test Case ID | TC-1301 |
| Requirement ID | FR-609 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | One settlement per session |
| Test Type | Database |
| Priority | Critical |
| Preconditions | As above |
| Test Data | same session_id twice |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert a valid settlement<br>2. insert a second for the same session_id<br>3. ROLLBACK |
| Expected Result | 23505 on session_id |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1302 — present_count must be positive

| Field | Value |
|---|---|
| Test Case ID | TC-1302 |
| Requirement ID | FR-609 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | present_count must be positive |
| Test Type | Database |
| Priority | Critical |
| Preconditions | As above |
| Test Data | present_count 0, totals 0 |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert<br>2. ROLLBACK |
| Expected Result | check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/settlements-for-all.test.ts, settled-lesson-lock.test.ts |

##### TC-1303 — Paid intent needs paid_at

| Field | Value |
|---|---|
| Test Case ID | TC-1303 |
| Requirement ID | FR-610 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Paid intent needs paid_at |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | Lina id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT payment_intents status='paid', paid_at NULL<br>3. ROLLBACK |
| Expected Result | check violation payment_intents_paid_consistency |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1304 — student_id required except for parent/center top-ups

| Field | Value |
|---|---|
| Test Case ID | TC-1304 |
| Requirement ID | FR-610 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | student_id required except for parent/center top-ups |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. purpose='subscription', student_id NULL → note<br>3. purpose='parent_wallet_topup', student_id NULL → note<br>4. ROLLBACK |
| Expected Result | 2 rejected; 3 accepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1305 — Duplicate idempotency key rejected

| Field | Value |
|---|---|
| Test Case ID | TC-1305 |
| Requirement ID | FR-610 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Duplicate idempotency key rejected |
| Test Type | Database |
| Priority | Critical |
| Preconditions | P0 |
| Test Data | same idempotency_key twice |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert two intents with one key<br>2. ROLLBACK |
| Expected Result | 23505 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1306 — Counter payment replay rejected by client_request_id

| Field | Value |
|---|---|
| Test Case ID | TC-1306 |
| Requirement ID | FR-611 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Counter payment replay rejected by client_request_id |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | NILE; client_request_id 'tc-req-1' |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT two payments for NILE with client_request_id 'tc-req-1'<br>3. INSERT two with NULL client_request_id<br>4. ROLLBACK |
| Expected Result | 2: 23505; 3: both accepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1307 — Payout client_request_id unique

| Field | Value |
|---|---|
| Test Case ID | TC-1307 |
| Requirement ID | FR-611 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Payout client_request_id unique |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | two payouts same client_request_id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert both<br>2. ROLLBACK |
| Expected Result | 23505 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1308 — One live affiliation per teacher–center pair

| Field | Value |
|---|---|
| Test Case ID | TC-1308 |
| Requirement ID | FR-612 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | One live affiliation per teacher–center pair |
| Test Type | Database |
| Priority | High |
| Preconditions | P0; seeded active Hossam–NILE affiliation |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT a pending affiliation Hossam–NILE<br>3. Mark the existing one removed (removed_at, status='removed'), retry step 2<br>4. ROLLBACK |
| Expected Result | 2: 23505; 3: accepted |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/superadmin/tests/db/c04-dedupe-guards.test.ts, c05-dedupe-guards.test.ts |

##### TC-1309 — One open shift per staff member

| Field | Value |
|---|---|
| Test Case ID | TC-1309 |
| Requirement ID | FR-612 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | One open shift per staff member |
| Test Type | Database |
| Priority | High |
| Preconditions | P0; a center_staff user |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert two open center_shifts for the same staff<br>2. ROLLBACK |
| Expected Result | 23505 center_shifts_one_open_per_staff |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1310 — wallet_settings is a singleton

| Field | Value |
|---|---|
| Test Case ID | TC-1310 |
| Requirement ID | FR-612 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | wallet_settings is a singleton |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `INSERT INTO wallet_settings DEFAULT VALUES;` twice (or once if a row exists)<br>2. ROLLBACK |
| Expected Result | The row beyond the first: 23505 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1311 — Student code generated and valid

| Field | Value |
|---|---|
| Test Case ID | TC-1311 |
| Requirement ID | FR-613 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Student code generated and valid |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | scratch student_profiles row (required columns, no student_code) |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); INSERT … RETURNING student_code<br>2. `SELECT student_code_for('<new id>'::uuid);`<br>3. ROLLBACK |
| Expected Result | Code returned, equals step 2, passes the shape CHECK |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/student-id-card.test.ts |

##### TC-1312 — Malformed student code rejected

| Field | Value |
|---|---|
| Test Case ID | TC-1312 |
| Requirement ID | FR-613 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Malformed student code rejected |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Lina profile |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `UPDATE student_profiles SET student_code='ABC' WHERE …;`<br>2. ROLLBACK |
| Expected Result | check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1313 — National ID unique

| Field | Value |
|---|---|
| Test Case ID | TC-1313 |
| Requirement ID | FR-614 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | National ID unique |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | two scratch students same national_id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert both<br>2. ROLLBACK |
| Expected Result | 23505 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1314 — qr_version must be positive

| Field | Value |
|---|---|
| Test Case ID | TC-1314 |
| Requirement ID | FR-614 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | qr_version must be positive |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Lina profile |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `UPDATE student_profiles SET qr_version=0 WHERE …;`<br>2. ROLLBACK |
| Expected Result | check violation student_profiles_qr_version_positive |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1315 — Conversation pair canonical; no self-block

| Field | Value |
|---|---|
| Test Case ID | TC-1315 |
| Requirement ID | FR-615 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Conversation pair canonical; no self-block |
| Test Type | Database |
| Priority | Medium |
| Preconditions | P0 |
| Test Data | two user ids a<b |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT conversation user_a_id=b, user_b_id=a<br>3. INSERT conversation_blocks blocker = blocked = a<br>4. ROLLBACK |
| Expected Result | Both check violations |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1316 — Team note exactly one scope

| Field | Value |
|---|---|
| Test Case ID | TC-1316 |
| Requirement ID | FR-616 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Team note exactly one scope |
| Test Type | Database |
| Priority | Medium |
| Preconditions | P0 |
| Test Data | NILE id, Hossam id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT team_notes with both center_id and teacher_id<br>3. with neither<br>4. ROLLBACK |
| Expected Result | Both rejected (team_notes_exactly_one_scope) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1317 — Public handle shape

| Field | Value |
|---|---|
| Test Case ID | TC-1317 |
| Requirement ID | FR-617 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Public handle shape |
| Test Type | Database |
| Priority | Medium |
| Preconditions | P0 |
| Test Data | handles 'ab', '-ab', 'a--b', 41 chars |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); insert each for a scratch owner<br>2. ROLLBACK |
| Expected Result | All rejected by public_handles_shape |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/public-handles.test.ts |

##### TC-1318 — Onsite course cannot carry an online URL

| Field | Value |
|---|---|
| Test Case ID | TC-1318 |
| Requirement ID | FR-618 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Onsite course cannot carry an online URL |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | NILE course |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `UPDATE courses SET delivery_mode='onsite', online_url='https://example.test' WHERE …;`<br>2. ROLLBACK |
| Expected Result | check violation courses_delivery_mode_shape |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1319 — Course price bound

| Field | Value |
|---|---|
| Test Case ID | TC-1319 |
| Requirement ID | FR-618 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Course price bound |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | NILE course |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); set price to 99999901<br>2. ROLLBACK |
| Expected Result | check violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1320 — External teacher needs a managing center

| Field | Value |
|---|---|
| Test Case ID | TC-1320 |
| Requirement ID | FR-619 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | External teacher needs a managing center |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Hossam teacher profile |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `UPDATE teacher_profiles SET system_status='external', managed_by_center_id=NULL WHERE …;`<br>2. ROLLBACK |
| Expected Result | check violation teacher_external_needs_center |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1321 — External settlement period and amount

| Field | Value |
|---|---|
| Test Case ID | TC-1321 |
| Requirement ID | FR-619 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | External settlement period and amount |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | NILE, Hossam |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. INSERT external_teacher_settlements with period_end = period_start<br>3. with amount_paid = 0<br>4. ROLLBACK |
| Expected Result | Both rejected |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/external-teachers.test.ts |

##### TC-1322 — audit_logs is append-only

| Field | Value |
|---|---|
| Test Case ID | TC-1322 |
| Requirement ID | FR-620 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | audit_logs is append-only |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. `UPDATE audit_logs SET id=id WHERE false;` `DELETE FROM audit_logs WHERE false;`<br>2. ROLLBACK |
| Expected Result | permission denied (both) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1323 — Audited update writes an audit row in the same transaction

| Field | Value |
|---|---|
| Test Case ID | TC-1323 |
| Requirement ID | FR-620 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Audited update writes an audit row in the same transaction |
| Test Type | Database (automated suite) |
| Priority | High |
| Preconditions | edura_test |
| Test Data | — |
| Steps | 1. Run apps/superadmin/tests/db/h3-audit-atomicity.test.ts and admin02-back-office-audit.test.ts |
| Expected Result | Pass; an audit row exists for each audited write |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Swallowed audit failure is GAP-266 |

##### TC-1324 — Reference sequences exist and advance

| Field | Value |
|---|---|
| Test Case ID | TC-1324 |
| Requirement ID | FR-621 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Reference sequences exist and advance |
| Test Type | Database |
| Priority | Medium |
| Preconditions | P0 |
| Test Data | — |
| Steps | 1. `SELECT count(*) FROM information_schema.sequences WHERE sequence_schema='public';`<br>2. `SELECT nextval('txn_ref_seq') < nextval('txn_ref_seq');`<br>3. ROLLBACK (sequence values are not rolled back — acceptable on test) |
| Expected Result | 1 = 6; 2 = true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1325 — search_text is generated and cannot be written

| Field | Value |
|---|---|
| Test Case ID | TC-1325 |
| Requirement ID | FR-622 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | search_text is generated and cannot be written |
| Test Type | Database |
| Priority | Medium |
| Preconditions | P0 |
| Test Data | NILE center |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `UPDATE centers SET search_text='x' WHERE …;`<br>2. `SELECT edura_search_normalize('أحمد') = edura_search_normalize('احمد');`<br>3. ROLLBACK |
| Expected Result | 1: error (generated column); 2: true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/erp/tests/db/search-normalize.test.ts |

##### TC-1326 — Base seed flags demo data

| Field | Value |
|---|---|
| Test Case ID | TC-1326 |
| Requirement ID | FR-623 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Base seed flags demo data |
| Test Type | Database |
| Priority | High |
| Preconditions | edura_test after seed.ts (non-production label, no --no-demo) |
| Test Data | Seed accounts (see testdata.md) |
| Steps | 1. `SELECT email, role, is_demo FROM users WHERE is_demo ORDER BY email;`<br>2. `SELECT short_id, is_demo FROM centers;` |
| Expected Result | NILE accounts listed with is_demo = true; NILE is_demo = true; platform staff is_demo true only when created from fallback emails |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1327 — Demo seed then --purge restores the census

| Field | Value |
|---|---|
| Test Case ID | TC-1327 |
| Requirement ID | FR-623 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Demo seed then --purge restores the census |
| Test Type | Database (seed/purge) |
| Priority | High |
| Preconditions | edura_test labelled test; verify-db census captured before |
| Test Data | delivery-mode-demo-seed.ts |
| Steps | 1. Census (verify-db).<br>2. `EDURA_ENV=test` run the delivery-mode demo seed.<br>3. Census.<br>4. Run it with `--purge`.<br>5. Census |
| Expected Result | 3 differs from 1 (courses); 5 equals 1 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1328 — Money demo seed purge leaves no wallet/payment rows

| Field | Value |
|---|---|
| Test Case ID | TC-1328 |
| Requirement ID | FR-623 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Money demo seed purge leaves no wallet/payment rows |
| Test Type | Database (seed/purge) |
| Priority | High |
| Preconditions | edura_test; ADMIN_URL set to the LOCAL owner URL |
| Test Data | parent-pay-demo-seed.ts |
| Steps | 1. Census of payments, wallet_ledger, parent_wallet_ledger, center_wallet_ledger, transactions, session_settlements.<br>2. Run the seed, then `--purge`.<br>3. Census again |
| Expected Result | payments, wallet_ledger, parent_wallet_ledger back to step 1. Record any remaining center_wallet_ledger / transactions / session_settlements rows (expected gap — GAP-269) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1329 — Owner purge refuses without ADMIN_URL

| Field | Value |
|---|---|
| Test Case ID | TC-1329 |
| Requirement ID | FR-624 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Owner purge refuses without ADMIN_URL |
| Test Type | Database (seed/purge) |
| Priority | High |
| Preconditions | edura_test; ADMIN_URL unset in the shell |
| Test Data | counter-demo-seed.ts --purge |
| Steps | 1. Run the purge with ADMIN_URL unset |
| Expected Result | Throws before deleting; census unchanged |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1330 — seed refuses an unlabelled database

| Field | Value |
|---|---|
| Test Case ID | TC-1330 |
| Requirement ID | FR-625 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | seed refuses an unlabelled database |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | A disposable LOCAL database `edura_scratch` with no COMMENT label; migrated |
| Test Data | — |
| Steps | 1. Run seed.ts against `edura_scratch`<br>2. Drop `edura_scratch` |
| Expected Result | Message `seed: REFUSING TO RUN — target database carries no 'edura-env:' label.`; no rows written |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1331 — wipe-data refuses a label mismatch

| Field | Value |
|---|---|
| Test Case ID | TC-1331 |
| Requirement ID | FR-625 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | wipe-data refuses a label mismatch |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | `edura_scratch` labelled `edura-env:dev` |
| Test Data | — |
| Steps | 1. Run wipe-data with env `test --yes` against it<br>2. Drop scratch |
| Expected Result | Refuses (label mismatch); no TRUNCATE |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1332 — HTTP money seeds refuse a production label

| Field | Value |
|---|---|
| Test Case ID | TC-1332 |
| Requirement ID | FR-625 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | HTTP money seeds refuse a production label |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | `edura_scratch` labelled `edura-env:production` (LOCAL disposable only — never the real production endpoint) |
| Test Data | settled-lessons-demo-seed.ts |
| Steps | 1. Run the seed against the scratch DB<br>2. Drop scratch |
| Expected Result | assertNotProduction refuses before any HTTP call or write |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1333 — Production-label seed writes catalog and staff only

| Field | Value |
|---|---|
| Test Case ID | TC-1333 |
| Requirement ID | FR-625 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Production-label seed writes catalog and staff only |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | `edura_scratch` labelled `edura-env:production`, migrated; SEED_SUPERADMIN_* / SEED_ACCOUNTANT_* set to test values |
| Test Data | — |
| Steps | 1. Run seed.ts<br>2. `SELECT count(*) FROM users; SELECT count(*) FROM centers; SELECT count(*) FROM points_rules;`<br>3. Unset one SEED_* var and re-run<br>4. Drop scratch |
| Expected Result | 2: users = 2, centers = 0, points_rules = 7; 3: refuses naming the missing variable |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1334 — verify-db passes on a fresh test database

| Field | Value |
|---|---|
| Test Case ID | TC-1334 |
| Requirement ID | FR-626 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | verify-db passes on a fresh test database |
| Test Type | Database |
| Priority | High |
| Preconditions | edura_test prepared per WF-116 |
| Test Data | — |
| Steps | 1. `EDURA_ENV=test` run packages/database/scripts/verify-db.ts (read-only) |
| Expected Result | All checks pass; shape 84 tables / 6 sequences / 41 RLS / 62 policies / 82 migrations |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1335 — verify-db reports grant drift

| Field | Value |
|---|---|
| Test Case ID | TC-1335 |
| Requirement ID | FR-626 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | verify-db reports grant drift |
| Test Type | Database |
| Priority | High |
| Preconditions | `edura_scratch` migrated + edura_app |
| Test Data | — |
| Steps | 1. As owner: `GRANT UPDATE ON transactions TO edura_app;`<br>2. Run verify-db against scratch<br>3. Drop scratch |
| Expected Result | verify-db fails naming transactions |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1336 — Cleanup refuses a non-production label

| Field | Value |
|---|---|
| Test Case ID | TC-1336 |
| Requirement ID | FR-627 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Cleanup refuses a non-production label |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | edura_test (label test) |
| Test Data | — |
| Steps | 1. Run production-cleanup `census`<br>2. Run `cleanup --confirm=wipe-0-users` |
| Expected Result | 1: `census expects production (or dev for rehearsal) — reached 'test'`; 2: `cleanup only runs against production — reached 'test'` |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1337 — Cleanup rehearsal keeps catalog and staff

| Field | Value |
|---|---|
| Test Case ID | TC-1337 |
| Requirement ID | FR-627 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Cleanup rehearsal keeps catalog and staff |
| Test Type | Database (seed/purge) |
| Priority | Critical |
| Preconditions | `edura_scratch` labelled `edura-env:production`, seeded with full demo set (LOCAL disposable only) |
| Test Data | — |
| Steps | 1. census → note N<br>2. cleanup with a wrong N<br>3. cleanup with `--confirm=wipe-<N>-users`<br>4. Count users, centers, subjects, commission_settings<br>5. Drop scratch |
| Expected Result | 2 refuses; after 3 only the 1–2 staff users, the full catalog and the global commission row remain |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1338 — Concurrent status transition: only one wins

| Field | Value |
|---|---|
| Test Case ID | TC-1338 |
| Requirement ID | FR-628 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Concurrent status transition: only one wins |
| Test Type | Database |
| Priority | High |
| Preconditions | P0; two psql sessions; a pending payout |
| Test Data | payout id |
| Steps | 1. Both sessions: BEGIN; SELECT set_config('app.bypass_rls','on',true);<br>2. Session A: `UPDATE payouts SET status='approved' WHERE id=… AND status='pending';`<br>3. Session B: same statement (waits), then A COMMITs… (use ROLLBACK at the end of both on test)<br> |
| Expected Result | A: UPDATE 1; B: UPDATE 0 after A commits |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/superadmin/tests/db/m03-payout-maker-checker.test.ts, apps/erp/tests/db/h1-payout-race.test.ts |

##### TC-1339 — Referenced catalog row cannot be deleted

| Field | Value |
|---|---|
| Test Case ID | TC-1339 |
| Requirement ID | FR-629 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Referenced catalog row cannot be deleted |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Lina's grade_level_id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `DELETE FROM grade_levels WHERE id = '<Lina grade_level_id>';`<br>2. ROLLBACK |
| Expected Result | 23503 foreign key violation |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1340 — Auth rows cascade with the user

| Field | Value |
|---|---|
| Test Case ID | TC-1340 |
| Requirement ID | FR-630 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Auth rows cascade with the user |
| Test Type | Database |
| Priority | Medium |
| Preconditions | Owner connection (no SET ROLE) to edura_test; BEGIN |
| Test Data | scratch user + one auth_sessions + one auth_accounts row |
| Steps | 1. Insert scratch rows.<br>2. `DELETE FROM users WHERE id=…;`<br>3. Count auth_sessions / auth_accounts for that id<br>4. ROLLBACK |
| Expected Result | 3: 0 and 0 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1341 — Seed creates the documented accounts

| Field | Value |
|---|---|
| Test Case ID | TC-1341 |
| Requirement ID | FR-623 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Seed creates the documented accounts |
| Test Type | Database |
| Priority | High |
| Preconditions | edura_test after seed.ts |
| Test Data | Emails in testdata.md |
| Steps | 1. `SELECT email, role, status FROM users WHERE email IN ('admin@nile-academy.eg','hossam.aziz@nile-academy.eg','sara.fawzy@nile-academy.eg','lina.hassan@student.nile-academy.eg','mona.hassan@email.eg');` |
| Expected Result | 5 rows: center_admin, teacher, assistant, student, parent; all active |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1342 — Seed points rules

| Field | Value |
|---|---|
| Test Case ID | TC-1342 |
| Requirement ID | FR-623 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Seed points rules |
| Test Type | Database |
| Priority | High |
| Preconditions | edura_test after seed.ts |
| Test Data | — |
| Steps | 1. `SELECT event_name, points_value FROM points_rules ORDER BY 1;` |
| Expected Result | 7 active rows: attendance 10, cash_payment 20, first_booking 50, lesson_booking 5, online_payment 20, streak_bonus 25, teacher_rating 15 |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1343 — Reverse mirror: credential password write updates users.password_hash

| Field | Value |
|---|---|
| Test Case ID | TC-1343 |
| Requirement ID | FR-603 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Reverse mirror: credential password write updates users.password_hash |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Teacher hossam.aziz@nile-academy.eg; dummy string `test-hash-reverse` |
| Steps | 1. `UPDATE auth_accounts SET password='test-hash-reverse' WHERE user_id=… AND provider_id='credential';`<br>2. `SELECT password_hash = 'test-hash-reverse' FROM users WHERE id=…;`<br>3. ROLLBACK |
| Expected Result | Step 2 returns true |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | Trigger auth_accounts_credential_sync_back |

##### TC-1344 — Explicit opt-in returns the hash; plain select does not

| Field | Value |
|---|---|
| Test Case ID | TC-1344 |
| Requirement ID | FR-604 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Explicit opt-in returns the hash; plain select does not |
| Test Type | Integration |
| Priority | High |
| Preconditions | As previous TC |
| Test Data | admin@nile-academy.eg |
| Steps | 1. `prisma.user.findFirst({where:{email}, omit:{passwordHash:false}})`<br>2. `prisma.user.findMany({take:5})` |
| Expected Result | 1: `passwordHash` key present (do not print its value); 2: no element has the key |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1345 — Owner purge with ADMIN_URL set removes only demo rows

| Field | Value |
|---|---|
| Test Case ID | TC-1345 |
| Requirement ID | FR-624 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Owner purge with ADMIN_URL set removes only demo rows |
| Test Type | Database (seed/purge) |
| Priority | High |
| Preconditions | edura_test; ADMIN_URL set to the LOCAL owner URL of edura_test; census captured |
| Test Data | counter-demo-seed.ts |
| Steps | 1. Run the seed.<br>2. Run it with `--purge`.<br>3. Census; `SELECT count(*) FROM users WHERE email IN (<seed.ts emails>);` |
| Expected Result | Census equals the pre-seed census; the 5 seed.ts accounts remain |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |

##### TC-1346 — Conditional transition on an already-moved row affects nothing

| Field | Value |
|---|---|
| Test Case ID | TC-1346 |
| Requirement ID | FR-628 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Conditional transition on an already-moved row affects nothing |
| Test Type | Database |
| Priority | High |
| Preconditions | P0; one payout set to approved inside the transaction |
| Test Data | payout id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true);<br>2. `UPDATE payouts SET status='approved' WHERE id=… AND status='pending';`<br>3. ROLLBACK |
| Expected Result | UPDATE 0 — no second transition |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | apps/superadmin/tests/db/l03-payout-generation-race.test.ts, apps/superadmin/tests/db/h3-refund-race.test.ts |

##### TC-1347 — Referenced track cannot be deleted

| Field | Value |
|---|---|
| Test Case ID | TC-1347 |
| Requirement ID | FR-629 |
| Module | Data Model & Data Integrity (DAT) |
| Test Scenario | Referenced track cannot be deleted |
| Test Type | Database |
| Priority | High |
| Preconditions | P0 |
| Test Data | Lina's track_id |
| Steps | 1. SELECT set_config('app.bypass_rls','on',true); `DELETE FROM tracks WHERE id = '<Lina track_id>';`<br>2. ROLLBACK |
| Expected Result | 23503 foreign key violation (student_profiles.track_id is onDelete Restrict) |
| Actual Result | _To be filled by tester_ |
| Status | Not Run |
| Notes | — |
