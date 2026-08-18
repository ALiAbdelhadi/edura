# Full endpoint inventory — resolved roles

Generated from source at commit `ac5e941`. `super_admin*` = admitted via the
super_admin short-circuit in apps/superadmin/src/lib/authz/require-role.ts:7,
not by being named in the call. `RL` = wrapped in withRateLimit.

**526 method+path rows** across 50 modules.


## erp: /api/auth/[...all]  (2 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/auth/[...all]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/auth/[...all]/route.ts |
| POST | `/api/auth/[...all]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/auth/[...all]/route.ts |

## erp: /api/health  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/health` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/health/route.ts |

## erp: /api/v1/%5Fping  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/%5Fping` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/%5Fping/route.ts |

## erp: /api/v1/affiliations  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| DELETE | `/api/v1/affiliations/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/affiliations/[id]/route.ts |
| POST | `/api/v1/affiliations/[id]/accept` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/affiliations/[id]/accept/route.ts |
| POST | `/api/v1/affiliations/[id]/decline` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/affiliations/[id]/decline/route.ts |

## erp: /api/v1/attendance  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| PATCH | `/api/v1/attendance/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/attendance/[id]/route.ts |

## erp: /api/v1/auth  (8 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/invite/accept` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/invite/accept/route.ts |
| POST | `/api/v1/auth/login` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/login/route.ts |
| POST | `/api/v1/auth/password/forgot` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/password/forgot/route.ts |
| POST | `/api/v1/auth/password/reset` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/password/reset/route.ts |
| POST | `/api/v1/auth/register/center` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/register/center/route.ts |
| POST | `/api/v1/auth/register/parent` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/register/parent/route.ts |
| POST | `/api/v1/auth/register/student` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/register/student/route.ts |
| POST | `/api/v1/auth/register/teacher` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/auth/register/teacher/route.ts |

## erp: /api/v1/catalog  (2 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/catalog/subjects` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/catalog/subjects/route.ts |
| GET | `/api/v1/catalog/tree` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/catalog/tree/route.ts |

## erp: /api/v1/center  (50 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/center/audit-logs` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/audit-logs/route.ts |
| GET | `/api/v1/center/audit-logs/actors` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/audit-logs/actors/route.ts |
| GET | `/api/v1/center/blacklist` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/blacklist/route.ts |
| POST | `/api/v1/center/blacklist` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/blacklist/route.ts |
| DELETE | `/api/v1/center/blacklist/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/blacklist/[id]/route.ts |
| POST | `/api/v1/center/checkin` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/checkin/route.ts |
| GET | `/api/v1/center/checkin/lookup` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/checkin/lookup/route.ts |
| GET | `/api/v1/center/checkin/suggest` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/checkin/suggest/route.ts |
| GET | `/api/v1/center/counter/roster` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/counter/roster/route.ts |
| GET | `/api/v1/center/counter/sessions` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/counter/sessions/route.ts |
| GET | `/api/v1/center/counter/teachers` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/counter/teachers/route.ts |
| GET | `/api/v1/center/external-teachers` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/center/external-teachers/route.ts |
| POST | `/api/v1/center/external-teachers` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/route.ts |
| DELETE | `/api/v1/center/external-teachers/[teacherId]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/route.ts |
| GET | `/api/v1/center/external-teachers/[teacherId]` | `requireRole(center_admin) allow:MANAGER` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/route.ts |
| PATCH | `/api/v1/center/external-teachers/[teacherId]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/convert` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/convert/route.ts |
| GET | `/api/v1/center/external-teachers/[teacherId]/grades` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/grades/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/grades` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/grades/route.ts |
| PUT | `/api/v1/center/external-teachers/[teacherId]/grades/[gradeId]/scores` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/grades/[gradeId]/scores/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/invite` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/invite/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/restore` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/restore/route.ts |
| GET | `/api/v1/center/external-teachers/[teacherId]/settlements` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/settlements/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/settlements` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/settlements/route.ts |
| GET | `/api/v1/center/external-teachers/[teacherId]/statement` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/statement/route.ts |
| GET | `/api/v1/center/external-teachers/[teacherId]/students` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/students/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/students` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/students/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/students/enroll` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/students/enroll/route.ts |
| POST | `/api/v1/center/external-teachers/[teacherId]/students/lookup` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/external-teachers/[teacherId]/students/lookup/route.ts |
| GET | `/api/v1/center/external-teachers/balances` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/center/external-teachers/balances/route.ts |
| GET | `/api/v1/center/external-teachers/gaps` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/center/external-teachers/gaps/route.ts |
| GET | `/api/v1/center/staff` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/staff/route.ts |
| POST | `/api/v1/center/staff` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/staff/route.ts |
| DELETE | `/api/v1/center/staff/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/staff/[id]/route.ts |
| PATCH | `/api/v1/center/staff/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/staff/[id]/route.ts |
| POST | `/api/v1/center/staff/[id]/invite` | `requireRole(center_admin)` | center_admin | RL | apps/erp/src/app/api/v1/center/staff/[id]/invite/route.ts |
| GET | `/api/v1/center/staff/me` | `requireRole(center_staff)` | center_staff |  | apps/erp/src/app/api/v1/center/staff/me/route.ts |
| GET | `/api/v1/center/students/[id]/guardian-contact` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] | RL | apps/erp/src/app/api/v1/center/students/[id]/guardian-contact/route.ts |
| POST | `/api/v1/center/students/[id]/guardian-contact` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] | RL | apps/erp/src/app/api/v1/center/students/[id]/guardian-contact/route.ts |
| POST | `/api/v1/center/students/import` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/center/students/import/route.ts |
| GET | `/api/v1/center/subscriptions` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/center/subscriptions/route.ts |
| POST | `/api/v1/center/subscriptions` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/subscriptions/route.ts |
| POST | `/api/v1/center/temp-students` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/temp-students/route.ts |
| POST | `/api/v1/center/walk-in` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] | RL | apps/erp/src/app/api/v1/center/walk-in/route.ts |
| POST | `/api/v1/center/walk-in/resend` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] | RL | apps/erp/src/app/api/v1/center/walk-in/resend/route.ts |
| GET | `/api/v1/center/wallet` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/center/wallet/route.ts |
| POST | `/api/v1/center/wallet-topup` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/center/wallet-topup/route.ts |
| POST | `/api/v1/center/wallet/payout-request` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/center/wallet/payout-request/route.ts |
| GET | `/api/v1/center/wallet/payouts` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/center/wallet/payouts/route.ts |
| GET | `/api/v1/center/wallet/transactions` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/center/wallet/transactions/route.ts |

## erp: /api/v1/centers  (10 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/centers/[id]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/centers/[id]/route.ts |
| GET | `/api/v1/centers/[id]/rooms` | `requireRole(teacher,assistant)` | teacher, assistant |  | apps/erp/src/app/api/v1/centers/[id]/rooms/route.ts |
| GET | `/api/v1/centers/me` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/centers/me/route.ts |
| PATCH | `/api/v1/centers/me` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/centers/me/route.ts |
| GET | `/api/v1/centers/me/admins` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/centers/me/admins/route.ts |
| DELETE | `/api/v1/centers/me/admins/[userId]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/centers/me/admins/[userId]/route.ts |
| POST | `/api/v1/centers/me/admins/invite` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/centers/me/admins/invite/route.ts |
| DELETE | `/api/v1/centers/me/logo` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/centers/me/logo/route.ts |
| GET | `/api/v1/centers/me/logo` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/centers/me/logo/route.ts |
| POST | `/api/v1/centers/me/logo` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/centers/me/logo/route.ts |

## erp: /api/v1/collaboration-requests  (5 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/collaboration-requests` | `delegatedWithCenter allow:MANAGER` | teacher, assistant, center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/collaboration-requests/route.ts |
| POST | `/api/v1/collaboration-requests` | `delegatedWithCenter allow:MANAGER` | teacher, assistant, center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/collaboration-requests/route.ts |
| POST | `/api/v1/collaboration-requests/[id]/accept` | `delegatedWithCenter allow:MANAGER` | teacher, assistant, center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/collaboration-requests/[id]/accept/route.ts |
| POST | `/api/v1/collaboration-requests/[id]/cancel` | `delegatedWithCenter allow:MANAGER` | teacher, assistant, center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/collaboration-requests/[id]/cancel/route.ts |
| POST | `/api/v1/collaboration-requests/[id]/reject` | `delegatedWithCenter allow:MANAGER` | teacher, assistant, center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/collaboration-requests/[id]/reject/route.ts |

## erp: /api/v1/contact  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/contact` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/contact/route.ts |

## erp: /api/v1/courses  (6 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/courses` | `getSessionUser` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/courses/route.ts |
| POST | `/api/v1/courses` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/courses/route.ts |
| GET | `/api/v1/courses/[id]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/courses/[id]/route.ts |
| PATCH | `/api/v1/courses/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/courses/[id]/route.ts |
| POST | `/api/v1/courses/[id]/cancel` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/courses/[id]/cancel/route.ts |
| POST | `/api/v1/courses/[id]/reassign-teacher` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/courses/[id]/reassign-teacher/route.ts |

## erp: /api/v1/cron  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/cron/[job]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/cron/[job]/route.ts |

## erp: /api/v1/dashboards  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/dashboards/admin` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/dashboards/admin/route.ts |
| GET | `/api/v1/dashboards/admin/checklist` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/dashboards/admin/checklist/route.ts |
| GET | `/api/v1/dashboards/student` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/dashboards/student/route.ts |
| GET | `/api/v1/dashboards/teacher` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/dashboards/teacher/route.ts |

## erp: /api/v1/deletion-requests  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/deletion-requests` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/deletion-requests/route.ts |
| POST | `/api/v1/deletion-requests/[id]/approve` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/deletion-requests/[id]/approve/route.ts |
| POST | `/api/v1/deletion-requests/[id]/reject` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/deletion-requests/[id]/reject/route.ts |

## erp: /api/v1/door-checkin  (2 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/door-checkin` | `requireRole(assistant,teacher)` | assistant, teacher |  | apps/erp/src/app/api/v1/door-checkin/route.ts |
| POST | `/api/v1/door-checkin` | `requireRole(assistant,teacher)` | assistant, teacher |  | apps/erp/src/app/api/v1/door-checkin/route.ts |

## erp: /api/v1/enrollment-requests  (5 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/enrollment-requests` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/enrollment-requests/route.ts |
| POST | `/api/v1/enrollment-requests` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/enrollment-requests/route.ts |
| DELETE | `/api/v1/enrollment-requests/[id]` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/enrollment-requests/[id]/route.ts |
| POST | `/api/v1/enrollment-requests/[id]/approve` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/enrollment-requests/[id]/approve/route.ts |
| POST | `/api/v1/enrollment-requests/[id]/decline` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/enrollment-requests/[id]/decline/route.ts |

## erp: /api/v1/enrollments  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/enrollments` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/enrollments/route.ts |
| POST | `/api/v1/enrollments` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/enrollments/route.ts |
| DELETE | `/api/v1/enrollments/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/enrollments/[id]/route.ts |

## erp: /api/v1/expenses  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/expenses` | `requireRole(center_admin) allow:ACCOUNTANT` | center_admin |  | apps/erp/src/app/api/v1/expenses/route.ts |
| POST | `/api/v1/expenses` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/expenses/route.ts |
| DELETE | `/api/v1/expenses/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/expenses/[id]/route.ts |
| PATCH | `/api/v1/expenses/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/expenses/[id]/route.ts |

## erp: /api/v1/grades  (6 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/grades` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/route.ts |
| POST | `/api/v1/grades` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/route.ts |
| DELETE | `/api/v1/grades/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/[id]/route.ts |
| GET | `/api/v1/grades/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/[id]/route.ts |
| PATCH | `/api/v1/grades/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/[id]/route.ts |
| PUT | `/api/v1/grades/[id]/scores` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/grades/[id]/scores/route.ts |

## erp: /api/v1/guardian  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/guardian/verify` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/guardian/verify/route.ts |

## erp: /api/v1/internal  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/internal/chat-notify` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/internal/chat-notify/route.ts |

## erp: /api/v1/materials  (5 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/materials` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/materials/route.ts |
| POST | `/api/v1/materials` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/materials/route.ts |
| DELETE | `/api/v1/materials/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/materials/[id]/route.ts |
| PATCH | `/api/v1/materials/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/materials/[id]/route.ts |
| GET | `/api/v1/materials/[id]/download` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/materials/[id]/download/route.ts |

## erp: /api/v1/me  (44 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/me` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/route.ts |
| PATCH | `/api/v1/me` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/route.ts |
| GET | `/api/v1/me/affiliations` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/me/affiliations/route.ts |
| GET | `/api/v1/me/attendance` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/attendance/route.ts |
| GET | `/api/v1/me/children` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/me/children/route.ts |
| POST | `/api/v1/me/credentials` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) | RL | apps/erp/src/app/api/v1/me/credentials/route.ts |
| GET | `/api/v1/me/data-rights/deletion` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/deletion/route.ts |
| POST | `/api/v1/me/data-rights/deletion` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/deletion/route.ts |
| DELETE | `/api/v1/me/data-rights/deletion/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/deletion/[id]/route.ts |
| GET | `/api/v1/me/data-rights/exports` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/exports/route.ts |
| POST | `/api/v1/me/data-rights/exports` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/exports/route.ts |
| DELETE | `/api/v1/me/data-rights/exports/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/exports/[id]/route.ts |
| GET | `/api/v1/me/data-rights/exports/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/data-rights/exports/[id]/route.ts |
| POST | `/api/v1/me/delete-request` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/delete-request/route.ts |
| POST | `/api/v1/me/device-tokens` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/device-tokens/route.ts |
| DELETE | `/api/v1/me/device-tokens/[token]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/device-tokens/[token]/route.ts |
| GET | `/api/v1/me/family-code` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/family-code/route.ts |
| POST | `/api/v1/me/family-code/rotate` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/family-code/rotate/route.ts |
| GET | `/api/v1/me/guardian-contact` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) | RL | apps/erp/src/app/api/v1/me/guardian-contact/route.ts |
| POST | `/api/v1/me/guardian-contact` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) | RL | apps/erp/src/app/api/v1/me/guardian-contact/route.ts |
| GET | `/api/v1/me/guardian-verification` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/guardian-verification/route.ts |
| POST | `/api/v1/me/guardian-verification` | `requireRole(student)` | student | RL | apps/erp/src/app/api/v1/me/guardian-verification/route.ts |
| GET | `/api/v1/me/onboarding` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/onboarding/route.ts |
| PATCH | `/api/v1/me/onboarding` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/onboarding/route.ts |
| POST | `/api/v1/me/onboarding` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/onboarding/route.ts |
| GET | `/api/v1/me/onboarding-email` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/onboarding-email/route.ts |
| POST | `/api/v1/me/onboarding-email` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/onboarding-email/route.ts |
| GET | `/api/v1/me/parent-wallet` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/me/parent-wallet/route.ts |
| GET | `/api/v1/me/parent-wallet/history` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/me/parent-wallet/history/route.ts |
| POST | `/api/v1/me/password` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) | RL | apps/erp/src/app/api/v1/me/password/route.ts |
| GET | `/api/v1/me/points` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/points/route.ts |
| GET | `/api/v1/me/points/history` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/points/history/route.ts |
| GET | `/api/v1/me/prefs` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/prefs/route.ts |
| PATCH | `/api/v1/me/prefs` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/prefs/route.ts |
| GET | `/api/v1/me/profile-checklist` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/profile-checklist/route.ts |
| DELETE | `/api/v1/me/push-subscription` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/push-subscription/route.ts |
| POST | `/api/v1/me/push-subscription` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/push-subscription/route.ts |
| POST | `/api/v1/me/roster/choice` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/roster/choice/route.ts |
| GET | `/api/v1/me/student-card` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/me/student-card/route.ts |
| POST | `/api/v1/me/subject-requests` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/me/subject-requests/route.ts |
| GET | `/api/v1/me/subjects` | `requireRole(teacher,assistant)` | teacher, assistant |  | apps/erp/src/app/api/v1/me/subjects/route.ts |
| GET | `/api/v1/me/subscriptions` | `requireRole(student,parent)` | student, parent |  | apps/erp/src/app/api/v1/me/subscriptions/route.ts |
| GET | `/api/v1/me/wallet` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/wallet/route.ts |
| GET | `/api/v1/me/wallet/history` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/me/wallet/history/route.ts |

## erp: /api/v1/messages  (16 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/messages` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/route.ts |
| DELETE | `/api/v1/messages/blocks` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/blocks/route.ts |
| GET | `/api/v1/messages/blocks` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/blocks/route.ts |
| POST | `/api/v1/messages/blocks` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/blocks/route.ts |
| GET | `/api/v1/messages/contacts` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/contacts/route.ts |
| GET | `/api/v1/messages/conversations` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/conversations/route.ts |
| POST | `/api/v1/messages/conversations` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/conversations/route.ts |
| GET | `/api/v1/messages/conversations/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/conversations/[id]/route.ts |
| POST | `/api/v1/messages/conversations/[id]/read` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/conversations/[id]/read/route.ts |
| GET | `/api/v1/messages/groups` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/route.ts |
| POST | `/api/v1/messages/groups` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/route.ts |
| GET | `/api/v1/messages/groups/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/[id]/route.ts |
| POST | `/api/v1/messages/groups/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/[id]/route.ts |
| POST | `/api/v1/messages/groups/[id]/mute` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/[id]/mute/route.ts |
| POST | `/api/v1/messages/groups/[id]/read` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/groups/[id]/read/route.ts |
| POST | `/api/v1/messages/reports` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/messages/reports/route.ts |

## erp: /api/v1/notifications  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/notifications/route.ts |
| POST | `/api/v1/notifications/[id]/read` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/notifications/[id]/read/route.ts |
| POST | `/api/v1/notifications/broadcast` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/notifications/broadcast/route.ts |
| POST | `/api/v1/notifications/read-all` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/notifications/read-all/route.ts |

## erp: /api/v1/parent  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/parent/oversight/children` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/parent/oversight/children/route.ts |
| GET | `/api/v1/parent/oversight/children/[studentId]/conversations` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/parent/oversight/children/[studentId]/conversations/route.ts |
| GET | `/api/v1/parent/oversight/children/[studentId]/conversations/[id]` | `requireRole(parent)` | parent |  | apps/erp/src/app/api/v1/parent/oversight/children/[studentId]/conversations/[id]/route.ts |

## erp: /api/v1/parent-links  (5 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/parent-links` | `requireRole(parent,student)` | parent, student |  | apps/erp/src/app/api/v1/parent-links/route.ts |
| POST | `/api/v1/parent-links` | `requireRole(parent,student)` | parent, student |  | apps/erp/src/app/api/v1/parent-links/route.ts |
| DELETE | `/api/v1/parent-links/[id]` | `requireRole(parent,student)` | parent, student |  | apps/erp/src/app/api/v1/parent-links/[id]/route.ts |
| POST | `/api/v1/parent-links/[id]/approve` | `requireRole(parent,student)` | parent, student |  | apps/erp/src/app/api/v1/parent-links/[id]/approve/route.ts |
| POST | `/api/v1/parent-links/[id]/reject` | `requireRole(parent,student)` | parent, student |  | apps/erp/src/app/api/v1/parent-links/[id]/reject/route.ts |

## erp: /api/v1/payments  (11 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/payments` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/payments/route.ts |
| POST | `/api/v1/payments` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/payments/route.ts |
| GET | `/api/v1/payments/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/payments/[id]/route.ts |
| PATCH | `/api/v1/payments/[id]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/payments/[id]/route.ts |
| GET | `/api/v1/payments/[id]/receipt` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/payments/[id]/receipt/route.ts |
| POST | `/api/v1/payments/initiate` | `requireRole(student)` | student | RL | apps/erp/src/app/api/v1/payments/initiate/route.ts |
| GET | `/api/v1/payments/intents/[id]` | `requireRole(student,parent)` | student, parent |  | apps/erp/src/app/api/v1/payments/intents/[id]/route.ts |
| POST | `/api/v1/payments/intents/[id]/mock-complete` | `requireRole(student,parent)` | student, parent |  | apps/erp/src/app/api/v1/payments/intents/[id]/mock-complete/route.ts |
| POST | `/api/v1/payments/parent-wallet-topup/initiate` | `requireRole(parent)` | parent | RL | apps/erp/src/app/api/v1/payments/parent-wallet-topup/initiate/route.ts |
| POST | `/api/v1/payments/paymob/webhook` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/payments/paymob/webhook/route.ts |
| POST | `/api/v1/payments/wallet-topup/initiate` | `requireRole(student)` | student | RL | apps/erp/src/app/api/v1/payments/wallet-topup/initiate/route.ts |

## erp: /api/v1/realtime  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/realtime/token` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/realtime/token/route.ts |

## erp: /api/v1/reports  (9 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/reports/attendance-by-course` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/reports/attendance-by-course/route.ts |
| GET | `/api/v1/reports/course-fill-rates` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/reports/course-fill-rates/route.ts |
| GET | `/api/v1/reports/enrollment-funnel` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/reports/enrollment-funnel/route.ts |
| GET | `/api/v1/reports/expenses` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/reports/expenses/route.ts |
| GET | `/api/v1/reports/expenses-timeseries` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/reports/expenses-timeseries/route.ts |
| GET | `/api/v1/reports/export` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/reports/export/route.ts |
| GET | `/api/v1/reports/net-profit` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/reports/net-profit/route.ts |
| GET | `/api/v1/reports/revenue` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/reports/revenue/route.ts |
| GET | `/api/v1/reports/revenue-timeseries` | `centerStaff allow:ACCOUNTANT` | center_admin, center_staff[center_accountant] (READ-ONLY) |  | apps/erp/src/app/api/v1/reports/revenue-timeseries/route.ts |

## erp: /api/v1/reviews  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/reviews` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/reviews/route.ts |
| POST | `/api/v1/reviews` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/reviews/route.ts |
| PATCH | `/api/v1/reviews/[id]` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/reviews/[id]/route.ts |
| GET | `/api/v1/reviews/eligible` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/reviews/eligible/route.ts |

## erp: /api/v1/rooms  (6 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/rooms` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/rooms/route.ts |
| POST | `/api/v1/rooms` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/rooms/route.ts |
| DELETE | `/api/v1/rooms/[id]` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/rooms/[id]/route.ts |
| PATCH | `/api/v1/rooms/[id]` | `centerStaff` | center_admin ONLY (owner) |  | apps/erp/src/app/api/v1/rooms/[id]/route.ts |
| POST | `/api/v1/rooms/[id]/photos` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/rooms/[id]/photos/route.ts |
| GET | `/api/v1/rooms/per-student-availability` | `centerStaff allow:MANAGER` | center_admin, center_staff[manager] |  | apps/erp/src/app/api/v1/rooms/per-student-availability/route.ts |

## erp: /api/v1/roster  (11 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/roster/students` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/roster/students/route.ts |
| POST | `/api/v1/roster/students` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/roster/students/route.ts |
| DELETE | `/api/v1/roster/students/[studentId]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/roster/students/[studentId]/route.ts |
| GET | `/api/v1/roster/students/[studentId]` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/roster/students/[studentId]/route.ts |
| PATCH | `/api/v1/roster/students/[studentId]` | `requireRole(center_admin) allow:MANAGER` | center_admin |  | apps/erp/src/app/api/v1/roster/students/[studentId]/route.ts |
| POST | `/api/v1/roster/students/invite` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] |  | apps/erp/src/app/api/v1/roster/students/invite/route.ts |
| POST | `/api/v1/roster/students/lookup` | `centerStaff allow:RECEPTION` | center_admin, center_staff[receptionist,manager] | RL | apps/erp/src/app/api/v1/roster/students/lookup/route.ts |
| GET | `/api/v1/roster/teachers` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/roster/teachers/route.ts |
| DELETE | `/api/v1/roster/teachers/[teacherId]` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/roster/teachers/[teacherId]/route.ts |
| POST | `/api/v1/roster/teachers/invite` | `requireRole(center_admin)` | center_admin |  | apps/erp/src/app/api/v1/roster/teachers/invite/route.ts |
| POST | `/api/v1/roster/teachers/lookup` | `requireRole(center_admin)` | center_admin | RL | apps/erp/src/app/api/v1/roster/teachers/lookup/route.ts |

## erp: /api/v1/search  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/search` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/search/route.ts |
| GET | `/api/v1/search/centers` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/search/centers/route.ts |
| GET | `/api/v1/search/courses` | `getSessionUser` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) | RL | apps/erp/src/app/api/v1/search/courses/route.ts |
| GET | `/api/v1/search/teachers` | `NONE` | PUBLIC (unauthenticated) | RL | apps/erp/src/app/api/v1/search/teachers/route.ts |

## erp: /api/v1/sessions  (8 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/sessions` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/sessions/route.ts |
| GET | `/api/v1/sessions/[id]` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/sessions/[id]/route.ts |
| GET | `/api/v1/sessions/[id]/attendance` | `requireSession` | any authenticated www role (center_admin, center_staff, teacher, assistant, parent, student) |  | apps/erp/src/app/api/v1/sessions/[id]/attendance/route.ts |
| PUT | `/api/v1/sessions/[id]/attendance` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/sessions/[id]/attendance/route.ts |
| POST | `/api/v1/sessions/[id]/cancel` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/sessions/[id]/cancel/route.ts |
| POST | `/api/v1/sessions/[id]/complete` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/sessions/[id]/complete/route.ts |
| POST | `/api/v1/sessions/[id]/postpone` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/sessions/[id]/postpone/route.ts |
| GET | `/api/v1/sessions/[id]/settlement-preview` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/sessions/[id]/settlement-preview/route.ts |

## erp: /api/v1/subjects  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/subjects` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/subjects/route.ts |

## erp: /api/v1/subscriptions  (2 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/subscriptions/[id]/cancel` | `requireRole(student,parent)` | student, parent |  | apps/erp/src/app/api/v1/subscriptions/[id]/cancel/route.ts |
| POST | `/api/v1/subscriptions/checkout` | `requireRole(student,parent)` | student, parent | RL | apps/erp/src/app/api/v1/subscriptions/checkout/route.ts |

## erp: /api/v1/teacher  (15 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/teacher/assistants` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/assistants/route.ts |
| POST | `/api/v1/teacher/assistants` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/assistants/route.ts |
| DELETE | `/api/v1/teacher/assistants/[id]` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/assistants/[id]/route.ts |
| POST | `/api/v1/teacher/assistants/[id]/invite` | `requireRole(teacher)` | teacher | RL | apps/erp/src/app/api/v1/teacher/assistants/[id]/invite/route.ts |
| GET | `/api/v1/teacher/attendance-mode` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/attendance-mode/route.ts |
| PATCH | `/api/v1/teacher/attendance-mode` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/teacher/attendance-mode/route.ts |
| POST | `/api/v1/teacher/attendance/sync` | `requireRole(teacher,assistant)` | teacher, assistant |  | apps/erp/src/app/api/v1/teacher/attendance/sync/route.ts |
| GET | `/api/v1/teacher/blacklist` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/blacklist/route.ts |
| POST | `/api/v1/teacher/blacklist` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/teacher/blacklist/route.ts |
| DELETE | `/api/v1/teacher/blacklist/[id]` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/teacher/blacklist/[id]/route.ts |
| POST | `/api/v1/teacher/temp-students` | `delegated` | teacher, assistant |  | apps/erp/src/app/api/v1/teacher/temp-students/route.ts |
| GET | `/api/v1/teacher/wallet` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/wallet/route.ts |
| POST | `/api/v1/teacher/wallet/payout-request` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/wallet/payout-request/route.ts |
| GET | `/api/v1/teacher/wallet/payouts` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/wallet/payouts/route.ts |
| GET | `/api/v1/teacher/wallet/transactions` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teacher/wallet/transactions/route.ts |

## erp: /api/v1/teachers  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/teachers/[teacherId]` | `NONE` | PUBLIC (unauthenticated) |  | apps/erp/src/app/api/v1/teachers/[teacherId]/route.ts |
| DELETE | `/api/v1/teachers/me/photo` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teachers/me/photo/route.ts |
| GET | `/api/v1/teachers/me/photo` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teachers/me/photo/route.ts |
| POST | `/api/v1/teachers/me/photo` | `requireRole(teacher)` | teacher |  | apps/erp/src/app/api/v1/teachers/me/photo/route.ts |

## erp: /api/v1/team-notes  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/team-notes` | `delegatedWithCenter allow:STAFF_ALL` | teacher, assistant, center_admin, center_staff[all] |  | apps/erp/src/app/api/v1/team-notes/route.ts |
| POST | `/api/v1/team-notes` | `delegatedWithCenter allow:STAFF_ALL` | teacher, assistant, center_admin, center_staff[all] |  | apps/erp/src/app/api/v1/team-notes/route.ts |
| DELETE | `/api/v1/team-notes/[id]` | `delegatedWithCenter allow:STAFF_ALL` | teacher, assistant, center_admin, center_staff[all] |  | apps/erp/src/app/api/v1/team-notes/[id]/route.ts |
| PATCH | `/api/v1/team-notes/[id]` | `delegatedWithCenter allow:STAFF_ALL` | teacher, assistant, center_admin, center_staff[all] |  | apps/erp/src/app/api/v1/team-notes/[id]/route.ts |

## erp: /api/v1/temp-students  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/temp-students` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/temp-students/route.ts |
| POST | `/api/v1/temp-students/[id]/send-invite` | `delegatedWithCenter` | teacher, assistant, center_admin |  | apps/erp/src/app/api/v1/temp-students/[id]/send-invite/route.ts |
| POST | `/api/v1/temp-students/claim` | `requireRole(student)` | student |  | apps/erp/src/app/api/v1/temp-students/claim/route.ts |

## superadmin: /api/auth/[...all]  (2 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/auth/[...all]` | `NONE` | PUBLIC (unauthenticated) |  | apps/superadmin/src/app/api/auth/[...all]/route.ts |
| POST | `/api/auth/[...all]` | `NONE` | PUBLIC (unauthenticated) |  | apps/superadmin/src/app/api/auth/[...all]/route.ts |

## superadmin: /api/health  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/health` | `NONE` | PUBLIC (unauthenticated) |  | apps/superadmin/src/app/api/health/route.ts |

## superadmin: /api/v1/admin  (205 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/v1/admin/accountants` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/accountants/route.ts |
| GET | `/api/v1/admin/audit-logs` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/audit-logs/route.ts |
| GET | `/api/v1/admin/audit-logs/actions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/audit-logs/actions/route.ts |
| GET | `/api/v1/admin/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/blacklist/route.ts |
| POST | `/api/v1/admin/blacklist/[id]/remove` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/blacklist/[id]/remove/route.ts |
| GET | `/api/v1/admin/catalog/grade-levels` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/grade-levels/route.ts |
| POST | `/api/v1/admin/catalog/grade-levels` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/grade-levels/route.ts |
| PATCH | `/api/v1/admin/catalog/grade-levels/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/grade-levels/[id]/route.ts |
| POST | `/api/v1/admin/catalog/grade-tracks` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/grade-tracks/route.ts |
| DELETE | `/api/v1/admin/catalog/grade-tracks/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/grade-tracks/[id]/route.ts |
| GET | `/api/v1/admin/catalog/offerings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/offerings/route.ts |
| POST | `/api/v1/admin/catalog/offerings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/offerings/route.ts |
| DELETE | `/api/v1/admin/catalog/offerings/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/offerings/[id]/route.ts |
| PATCH | `/api/v1/admin/catalog/offerings/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/offerings/[id]/route.ts |
| GET | `/api/v1/admin/catalog/stages` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/stages/route.ts |
| POST | `/api/v1/admin/catalog/stages` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/stages/route.ts |
| PATCH | `/api/v1/admin/catalog/stages/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/stages/[id]/route.ts |
| GET | `/api/v1/admin/catalog/subject-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subject-requests/route.ts |
| POST | `/api/v1/admin/catalog/subject-requests/[id]/approve` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subject-requests/[id]/approve/route.ts |
| POST | `/api/v1/admin/catalog/subject-requests/[id]/reject` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subject-requests/[id]/reject/route.ts |
| GET | `/api/v1/admin/catalog/subjects` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subjects/route.ts |
| POST | `/api/v1/admin/catalog/subjects` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subjects/route.ts |
| PATCH | `/api/v1/admin/catalog/subjects/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/subjects/[id]/route.ts |
| GET | `/api/v1/admin/catalog/systems` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/systems/route.ts |
| POST | `/api/v1/admin/catalog/systems` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/systems/route.ts |
| PATCH | `/api/v1/admin/catalog/systems/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/systems/[id]/route.ts |
| GET | `/api/v1/admin/catalog/tracks` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/tracks/route.ts |
| POST | `/api/v1/admin/catalog/tracks` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/tracks/route.ts |
| PATCH | `/api/v1/admin/catalog/tracks/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/catalog/tracks/[id]/route.ts |
| GET | `/api/v1/admin/centers` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/route.ts |
| GET | `/api/v1/admin/centers/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/route.ts |
| PATCH | `/api/v1/admin/centers/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/route.ts |
| GET | `/api/v1/admin/centers/[id]/admins` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/admins/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/admins/[userId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/admins/[userId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/admins/invite` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/admins/invite/route.ts |
| GET | `/api/v1/admin/centers/[id]/affiliations` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/affiliations/route.ts |
| PUT | `/api/v1/admin/centers/[id]/affiliations/[affiliationId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/affiliations/[affiliationId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/approve` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/approve/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/attendance/[attendanceId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/attendance/[attendanceId]/route.ts |
| GET | `/api/v1/admin/centers/[id]/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/blacklist/route.ts |
| POST | `/api/v1/admin/centers/[id]/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/blacklist/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/blacklist/[entryId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/blacklist/[entryId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/broadcast` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/broadcast/route.ts |
| POST | `/api/v1/admin/centers/[id]/checkin` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/checkin/route.ts |
| GET | `/api/v1/admin/centers/[id]/checkin/lookup` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/checkin/lookup/route.ts |
| GET | `/api/v1/admin/centers/[id]/checkin/suggest` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/checkin/suggest/route.ts |
| POST | `/api/v1/admin/centers/[id]/collaboration-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/collaboration-requests/route.ts |
| POST | `/api/v1/admin/centers/[id]/courses` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/courses/route.ts |
| GET | `/api/v1/admin/centers/[id]/courses/[courseId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/courses/[courseId]/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/courses/[courseId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/courses/[courseId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/courses/[courseId]/cancel` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/courses/[courseId]/cancel/route.ts |
| POST | `/api/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/courses/[courseId]/reassign-teacher/route.ts |
| GET | `/api/v1/admin/centers/[id]/dashboard` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/dashboard/route.ts |
| GET | `/api/v1/admin/centers/[id]/deletion-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/deletion-requests/route.ts |
| POST | `/api/v1/admin/centers/[id]/deletion-requests/[requestId]/decide` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/deletion-requests/[requestId]/decide/route.ts |
| GET | `/api/v1/admin/centers/[id]/enrollment-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/enrollment-requests/route.ts |
| POST | `/api/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/enrollment-requests/[requestId]/decide/route.ts |
| GET | `/api/v1/admin/centers/[id]/enrollments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/enrollments/route.ts |
| POST | `/api/v1/admin/centers/[id]/enrollments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/enrollments/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/enrollments/[enrollmentId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/enrollments/[enrollmentId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/members/[userId]/status` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/members/[userId]/status/route.ts |
| GET | `/api/v1/admin/centers/[id]/money/expenses` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/expenses/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/expenses` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/expenses/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/money/expenses/[expenseId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/expenses/[expenseId]/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/money/expenses/[expenseId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/expenses/[expenseId]/route.ts |
| GET | `/api/v1/admin/centers/[id]/money/payments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payments/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/payments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payments/route.ts |
| GET | `/api/v1/admin/centers/[id]/money/payments/[paymentId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payments/[paymentId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/payments/[paymentId]/refund` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payments/[paymentId]/refund/route.ts |
| GET | `/api/v1/admin/centers/[id]/money/payout-request` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payout-request/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/payout-request` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/payout-request/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/subscriptions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/subscriptions/route.ts |
| POST | `/api/v1/admin/centers/[id]/money/wallet-topup` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/money/wallet-topup/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/attendance` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/attendance/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/courses` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/courses/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/enrollments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/enrollments/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/finance` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/finance/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/invoices` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/invoices/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/overview` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/overview/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/payments` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/payments/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/payouts` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/payouts/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/pending` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/pending/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/sessions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/sessions/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/settlements` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/settlements/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/staff` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/staff/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/statement` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/statement/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/students` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/students/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/subscriptions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/subscriptions/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/transactions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/transactions/route.ts |
| GET | `/api/v1/admin/centers/[id]/oversight/wallet` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/oversight/wallet/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/per-student-rate/route.ts |
| PUT | `/api/v1/admin/centers/[id]/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/per-student-rate/route.ts |
| POST | `/api/v1/admin/centers/[id]/reject` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/reject/route.ts |
| GET | `/api/v1/admin/centers/[id]/reports/[report]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/reports/[report]/route.ts |
| GET | `/api/v1/admin/centers/[id]/rooms` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/rooms/[roomId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate/route.ts |
| PUT | `/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/per-student-rate/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/split/route.ts |
| PUT | `/api/v1/admin/centers/[id]/rooms/[roomId]/split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/split/route.ts |
| POST | `/api/v1/admin/centers/[id]/rooms/[roomId]/status` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/[roomId]/status/route.ts |
| POST | `/api/v1/admin/centers/[id]/rooms/create` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/rooms/create/route.ts |
| GET | `/api/v1/admin/centers/[id]/roster/students` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/route.ts |
| POST | `/api/v1/admin/centers/[id]/roster/students` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/roster/students/[studentId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/[studentId]/route.ts |
| GET | `/api/v1/admin/centers/[id]/roster/students/[studentId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/[studentId]/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/roster/students/[studentId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/[studentId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/roster/students/invite` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/invite/route.ts |
| POST | `/api/v1/admin/centers/[id]/roster/students/lookup` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/students/lookup/route.ts |
| GET | `/api/v1/admin/centers/[id]/roster/teachers` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/teachers/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/roster/teachers/[teacherId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/teachers/[teacherId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/roster/teachers/invite` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/teachers/invite/route.ts |
| POST | `/api/v1/admin/centers/[id]/roster/teachers/lookup` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/roster/teachers/lookup/route.ts |
| GET | `/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance/route.ts |
| PUT | `/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/attendance/route.ts |
| POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/cancel` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/cancel/route.ts |
| POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/complete` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/complete/route.ts |
| POST | `/api/v1/admin/centers/[id]/sessions/[sessionId]/postpone` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/postpone/route.ts |
| GET | `/api/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/sessions/[sessionId]/settlement-preview/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/split/route.ts |
| GET | `/api/v1/admin/centers/[id]/split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/split/route.ts |
| PUT | `/api/v1/admin/centers/[id]/split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/split/route.ts |
| GET | `/api/v1/admin/centers/[id]/staff` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/staff/route.ts |
| POST | `/api/v1/admin/centers/[id]/staff` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/staff/route.ts |
| DELETE | `/api/v1/admin/centers/[id]/staff/[linkId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/staff/[linkId]/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/staff/[linkId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/staff/[linkId]/route.ts |
| POST | `/api/v1/admin/centers/[id]/staff/[linkId]/invite` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/staff/[linkId]/invite/route.ts |
| POST | `/api/v1/admin/centers/[id]/status` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/status/route.ts |
| POST | `/api/v1/admin/centers/[id]/students/[studentId]/membership` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/students/[studentId]/membership/route.ts |
| POST | `/api/v1/admin/centers/[id]/temp-students` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/temp-students/route.ts |
| POST | `/api/v1/admin/centers/[id]/temp-students/[tempId]/invite` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/temp-students/[tempId]/invite/route.ts |
| PATCH | `/api/v1/admin/centers/[id]/toggle` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/toggle/route.ts |
| POST | `/api/v1/admin/centers/[id]/walk-in` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/centers/[id]/walk-in/route.ts |
| POST | `/api/v1/admin/centers/[id]/walk-in/resend` | `requireRole(super_admin)` | super_admin | RL | apps/superadmin/src/app/api/v1/admin/centers/[id]/walk-in/resend/route.ts |
| GET | `/api/v1/admin/collaboration-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/collaboration-requests/route.ts |
| GET | `/api/v1/admin/collaboration-requests/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/collaboration-requests/[id]/route.ts |
| POST | `/api/v1/admin/collaboration-requests/[id]/decide` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/collaboration-requests/[id]/decide/route.ts |
| GET | `/api/v1/admin/commission-settings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/commission-settings/route.ts |
| PUT | `/api/v1/admin/commission-settings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/commission-settings/route.ts |
| GET | `/api/v1/admin/contact-submissions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/contact-submissions/route.ts |
| POST | `/api/v1/admin/contact-submissions/[id]/status` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/contact-submissions/[id]/status/route.ts |
| GET | `/api/v1/admin/dashboard/decision-queue` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/dashboard/decision-queue/route.ts |
| GET | `/api/v1/admin/dashboard/kpis` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/dashboard/kpis/route.ts |
| GET | `/api/v1/admin/dashboard/revenue-chart` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/dashboard/revenue-chart/route.ts |
| GET | `/api/v1/admin/dashboard/user-growth-chart` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/dashboard/user-growth-chart/route.ts |
| GET | `/api/v1/admin/deletion-requests` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/deletion-requests/route.ts |
| POST | `/api/v1/admin/deletion-requests/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/deletion-requests/[id]/route.ts |
| GET | `/api/v1/admin/feature-flags` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/feature-flags/route.ts |
| PUT | `/api/v1/admin/feature-flags` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/feature-flags/route.ts |
| POST | `/api/v1/admin/impersonation/stop` | `getSessionUser` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/admin/impersonation/stop/route.ts |
| GET | `/api/v1/admin/messaging/blocks` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/blocks/route.ts |
| GET | `/api/v1/admin/messaging/conversations` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/conversations/route.ts |
| GET | `/api/v1/admin/messaging/conversations/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/conversations/[id]/route.ts |
| DELETE | `/api/v1/admin/messaging/messages/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/messages/[id]/route.ts |
| GET | `/api/v1/admin/messaging/reports` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/reports/route.ts |
| PATCH | `/api/v1/admin/messaging/reports/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/messaging/reports/[id]/route.ts |
| GET | `/api/v1/admin/notifications/history` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/notifications/history/route.ts |
| GET | `/api/v1/admin/payment-intents` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/payment-intents/route.ts |
| GET | `/api/v1/admin/payment-intents/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/payment-intents/[id]/route.ts |
| POST | `/api/v1/admin/platform/students/[studentId]/move` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/platform/students/[studentId]/move/route.ts |
| POST | `/api/v1/admin/platform/students/[studentId]/verify-dob` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/platform/students/[studentId]/verify-dob/route.ts |
| POST | `/api/v1/admin/platform/users/[userId]/force-logout` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/platform/users/[userId]/force-logout/route.ts |
| GET | `/api/v1/admin/points/rules` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/rules/route.ts |
| POST | `/api/v1/admin/points/rules` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/rules/route.ts |
| DELETE | `/api/v1/admin/points/rules/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/rules/[id]/route.ts |
| PATCH | `/api/v1/admin/points/rules/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/rules/[id]/route.ts |
| POST | `/api/v1/admin/points/students/[id]/adjust` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/students/[id]/adjust/route.ts |
| GET | `/api/v1/admin/points/students/[id]/ledger` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/points/students/[id]/ledger/route.ts |
| GET | `/api/v1/admin/registrations` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/registrations/route.ts |
| GET | `/api/v1/admin/revenue-split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/revenue-split/route.ts |
| PUT | `/api/v1/admin/revenue-split` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/revenue-split/route.ts |
| DELETE | `/api/v1/admin/revenue-split/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/revenue-split/per-student-rate/route.ts |
| PUT | `/api/v1/admin/revenue-split/per-student-rate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/revenue-split/per-student-rate/route.ts |
| GET | `/api/v1/admin/session-settlements` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/session-settlements/route.ts |
| GET | `/api/v1/admin/session-settlements/export` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/admin/session-settlements/export/route.ts |
| GET | `/api/v1/admin/students` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/students/route.ts |
| GET | `/api/v1/admin/students/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/students/[id]/route.ts |
| POST | `/api/v1/admin/students/[id]/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/students/[id]/blacklist/route.ts |
| POST | `/api/v1/admin/students/[id]/link-parent` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/students/[id]/link-parent/route.ts |
| DELETE | `/api/v1/admin/students/[id]/unlink-parent` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/students/[id]/unlink-parent/route.ts |
| GET | `/api/v1/admin/subscriptions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/subscriptions/route.ts |
| GET | `/api/v1/admin/subscriptions/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/subscriptions/[id]/route.ts |
| GET | `/api/v1/admin/teachers` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/route.ts |
| POST | `/api/v1/admin/teachers/[id]/approve` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/approve/route.ts |
| PATCH | `/api/v1/admin/teachers/[id]/attendance-mode` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/attendance-mode/route.ts |
| POST | `/api/v1/admin/teachers/[id]/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/blacklist/route.ts |
| POST | `/api/v1/admin/teachers/[id]/link-center` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/link-center/route.ts |
| POST | `/api/v1/admin/teachers/[id]/reject` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/reject/route.ts |
| DELETE | `/api/v1/admin/teachers/[id]/unlink-center` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/teachers/[id]/unlink-center/route.ts |
| GET | `/api/v1/admin/users` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/route.ts |
| GET | `/api/v1/admin/users/[id]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/route.ts |
| POST | `/api/v1/admin/users/[id]/blacklist` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/blacklist/route.ts |
| GET | `/api/v1/admin/users/[id]/card` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/card/route.ts |
| POST | `/api/v1/admin/users/[id]/card` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/card/route.ts |
| POST | `/api/v1/admin/users/[id]/impersonate` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/impersonate/route.ts |
| POST | `/api/v1/admin/users/[id]/password-reset` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/password-reset/route.ts |
| GET | `/api/v1/admin/users/[id]/permissions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/permissions/route.ts |
| PATCH | `/api/v1/admin/users/[id]/permissions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/permissions/route.ts |
| POST | `/api/v1/admin/users/[id]/reset-2fa` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/reset-2fa/route.ts |
| POST | `/api/v1/admin/users/[id]/revoke-sessions` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/revoke-sessions/route.ts |
| DELETE | `/api/v1/admin/users/[id]/sessions/[sessionId]` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/sessions/[sessionId]/route.ts |
| PATCH | `/api/v1/admin/users/[id]/status` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/users/[id]/status/route.ts |
| GET | `/api/v1/admin/wallet-settings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/wallet-settings/route.ts |
| PUT | `/api/v1/admin/wallet-settings` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/wallet-settings/route.ts |
| GET | `/api/v1/admin/whatsapp-messages` | `requireRole(super_admin)` | super_admin |  | apps/superadmin/src/app/api/v1/admin/whatsapp-messages/route.ts |

## superadmin: /api/v1/finance  (29 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/finance/alerts` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/alerts/route.ts |
| GET | `/api/v1/finance/commission-settings` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/commission-settings/route.ts |
| GET | `/api/v1/finance/dashboard` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/dashboard/route.ts |
| GET | `/api/v1/finance/dashboard/revenue-chart` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/dashboard/revenue-chart/route.ts |
| GET | `/api/v1/finance/invoices` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/invoices/route.ts |
| POST | `/api/v1/finance/invoices` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/invoices/route.ts |
| GET | `/api/v1/finance/invoices/[id]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/invoices/[id]/route.ts |
| GET | `/api/v1/finance/invoices/[id]/pdf` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/invoices/[id]/pdf/route.ts |
| POST | `/api/v1/finance/invoices/[id]/send-email` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/invoices/[id]/send-email/route.ts |
| GET | `/api/v1/finance/payment-intents` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payment-intents/route.ts |
| GET | `/api/v1/finance/payment-intents/[id]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payment-intents/[id]/route.ts |
| GET | `/api/v1/finance/payouts` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/route.ts |
| POST | `/api/v1/finance/payouts` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/route.ts |
| POST | `/api/v1/finance/payouts/[id]/approve` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/[id]/approve/route.ts |
| GET | `/api/v1/finance/payouts/[id]/receipt` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/[id]/receipt/route.ts |
| POST | `/api/v1/finance/payouts/[id]/reject` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/[id]/reject/route.ts |
| POST | `/api/v1/finance/payouts/bulk-approve` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/bulk-approve/route.ts |
| GET | `/api/v1/finance/payouts/counts` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/payouts/counts/route.ts |
| GET | `/api/v1/finance/refunds` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/refunds/route.ts |
| POST | `/api/v1/finance/refunds` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/refunds/route.ts |
| GET | `/api/v1/finance/reports/center-statement/[centerId]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/reports/center-statement/[centerId]/route.ts |
| GET | `/api/v1/finance/reports/refunds` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/reports/refunds/route.ts |
| GET | `/api/v1/finance/reports/revenue` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/reports/revenue/route.ts |
| GET | `/api/v1/finance/reports/teacher-statement/[teacherId]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/reports/teacher-statement/[teacherId]/route.ts |
| GET | `/api/v1/finance/reports/trial-balance` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/reports/trial-balance/route.ts |
| GET | `/api/v1/finance/subscriptions` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/subscriptions/route.ts |
| GET | `/api/v1/finance/subscriptions/[id]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/subscriptions/[id]/route.ts |
| GET | `/api/v1/finance/transactions` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/transactions/route.ts |
| GET | `/api/v1/finance/transactions/[id]` | `requireRole(accountant,super_admin)` | accountant, super_admin |  | apps/superadmin/src/app/api/v1/finance/transactions/[id]/route.ts |

## superadmin: /api/v1/me  (4 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/me` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/me/route.ts |
| PATCH | `/api/v1/me` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/me/route.ts |
| GET | `/api/v1/me/prefs` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/me/prefs/route.ts |
| PATCH | `/api/v1/me/prefs` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/me/prefs/route.ts |

## superadmin: /api/v1/notifications  (3 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/notifications` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/notifications/route.ts |
| POST | `/api/v1/notifications/[id]/read` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/notifications/[id]/read/route.ts |
| POST | `/api/v1/notifications/read-all` | `requireSession` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/notifications/read-all/route.ts |

## superadmin: /api/v1/search  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| GET | `/api/v1/search` | `requireRole(super_admin,accountant)` | super_admin, accountant |  | apps/superadmin/src/app/api/v1/search/route.ts |

## www-landing  (1 rows)

| Method | Path | Gate | Allowed roles | RL | Handler |
|---|---|---|---|---|---|
| POST | `/api/contact` | `NONE` | PUBLIC (unauthenticated) |  | apps/www/src/app/api/contact/route.ts |
