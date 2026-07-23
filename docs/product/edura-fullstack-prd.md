# EduConnect — Full-Stack Developer PRD

Version: 1.0 | Date: July 2026 | Audience: Full-Stack Developer + Claude AI Confidential — Internal Use Only

## 0. CLAUDE.md Root Instructions (Copy to project root) [URL 🔗](http://claude.md/)

> ## ⚠️ NOT AUTHORITATIVE — historical draft
>
> The `CLAUDE.md` reproduced in this section is the **original PRD-era draft**.
> It is **not** the project's instructions and must not be copied to the project
> root. The authoritative version is the root [CLAUDE.md](../../CLAUDE.md),
> which has since diverged substantially — it carries the approved 10-step
> roadmap, the binding §"Approved decisions" list, the Descoped and Deferred
> sections, and the security-remediation register, none of which appear below.
>
> Where this draft and the root `CLAUDE.md` disagree, **the root file wins**.
> This section is kept only to show what the PRD originally proposed.

```
\# CLAUDE.md — EduConnect Project Instructions
## Project Overview
EduConnect is an Egyptian EdTech marketplace connecting Teachers, Centers, Students,
Hybrid model: online booking + offline classroom attendance.
Primary language: Arabic RTL. EGP currency. Egyptian market.
## Monetization Model
- Student pays full lesson price
- Platform deducts EGP 2 from Teacher per booked lesson
- Platform deducts EGP 2 from Center per booked lesson
- Platform earns EGP 4 per booked lesson total
- Teacher net = lesson_price - EGP 2 - center_share
- Center net = center_share - EGP 2
## Roles & RBAC
| Role | Access Surface | Key Permissions
|--------------|--------------------|------------------------------------------------
| super_admin | Web dashboard | All permissions. Sole authority for approvals,
| accountant | Web dashboard | Finance only: invoices, transactions, payouts,
| center | Web dashboard | Own classrooms, linked teachers, attendance, ce
| teacher | Mobile + Web | Own lessons, attendance (offline), grades, wall
| parent | Mobile app | View-only: children's attendance, grades, expen
| student | Mobile app | Search, book, pay, view content, AI assistant,
## Security Rules (Non-Negotiable)
- Super Admin is the ONLY role that can: approve/reject registrations, manage blackli
define/modify point rules, manually adjust points, create accountant accounts
- Accountant cannot access non-financial modules
- Teachers cannot see other teachers' data
- Parents can only see their own linked children
- Students can only see their own data + public teacher profiles
- Sensitive actions (delete, blacklist, reject) MUST trigger confirmation dialog befo
## Tech Stack (Recommended)
- Backend: Node.js (Express or NestJS) + PostgreSQL
- Mobile: React Native (iOS + Android)
- Web: React + TypeScript
- Auth: JWT + refresh tokens, role-based middleware
- Payments: Paymob + Fawry integration
- Push notifications: Firebase Cloud Messaging (FCM)
- SMS: for OTP and invitations
- AI: Claude API (academic bot) or similar LLM
```


```
\- File storage: S3-compatible (PDFs, images, certificates)
- Offline sync: local SQLite on mobile, sync queue on reconnect
## Key Non-Negotiables
1. Offline mode for teacher attendance (capture locally → sync on reconnect)
2. Automatic money distribution on lesson completion
3. FCM + Email notifications for all critical events
4. Arabic RTL UI with EGP thousands separators (e.g., ١٠٬٠٠٠ or 10,000 EGP)
5. Dark/light mode following device preference + manual override
6. Skeleton loaders on all data screens
7. Empty states with clear CTA on all empty lists
8. Confirmation dialogs for: delete, blacklist, reject, bulk actions
9. All financial records are immutable — corrections via reversal entries only
10. Duplicate prevention: match on mobile number, auto-merge on account claim
## Folder Structure Convention
src/
├── modules/
│ ├── auth/
│ ├── users/
│ ├── centers/
│ ├── classrooms/
│ ├── teachers/
│ ├── students/
│ ├── parents/
│ ├── lessons/
│ ├── attendance/
│ ├── grades/
│ ├── content/
│ ├── payments/
│ ├── invoices/
│ ├── transactions/
│ ├── payouts/
│ ├── notifications/
│ ├── blacklist/
│ ├── points/
│ ├── chatbot/
│ ├── ratings/
│ └── reports/
├── shared/
│ ├── middleware/
│ ├── guards/
│ ├── decorators/
│ ├── dto/
│ └── utils/
└── config/
## Database Conventions
- All tables use UUID primary keys
- Timestamps: created_at, updated_at on every table
- Soft deletes: deleted_at nullable (never hard-delete financial records)
- Enum status fields: use string enums, not integers
- All money stored as integers (piasters/cents), display as EGP with division by 100
- Audit log: all sensitive mutations logged to audit_logs table
```


## 1. Product Overview

EduConnect is a hybrid EdTech marketplace for the Egyptian market. It connects Teachers and Learning Centers with Students and Parents through a structured booking, attendance, grading, and financial settlement system.

## Business Model Summary

```
Student pays lesson price (e.g., 200 EGP)
└─ Platform deducts: 2 EGP from Teacher side
└─ Platform deducts: 2 EGP from Center side
└─ Platform earns: 4 EGP per lesson
Teacher receives: 200 EGP - 2 EGP (platform) - center_share (agreed %)
Center receives: center_share - 2 EGP (platform)
```

## 2. System Architecture

## 2.1 Delivery Surfaces

| Surface | Roles | Stack |
| --- | --- | --- |
| Mobile App (iOS + Android) | Student, Parent, Teacher | React Native |
| Web Dashboard | Super Admin, Accountant, Center, Teacher | React + TypeScript |
| Admin Panel | Super Admin only | React + TypeScript |

## 2.2 Core Services Architecture

```
│ API Gateway (REST) │
│ Auth │ Users │ Lessons │ Finance │ AI/Chatbot │
│ Service │ & Roles │ & Attend │ Service │ Service │
│ PostgreSQL (Primary DB) │
│ FCM │ S3 Storage │ Paymob/Fawry │ Claude API │
```

## 2.3 Authentication & RBAC

```
POST /auth/register → Create account (student/parent self-register)
POST /auth/login → Returns access_token + refresh_token
POST /auth/refresh → Rotate tokens
POST /auth/verify-otp → Phone/email verification
```


```
Middleware: RoleGuard → checks JWT role claim against route permission
Roles: super_admin | accountant | center | teacher | parent | student
```

## 3. Database Schema (Core Tables)

## 3.1 Users & Roles

```
-- users (base table for all roles)
CREATE TABLE users (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
phone VARCHAR(20) UNIQUE NOT NULL,
email VARCHAR(255) UNIQUE,
password_hash TEXT NOT NULL,
role VARCHAR(20) NOT NULL, -- super_admin|accountant|center|teacher|pare
status VARCHAR(20) DEFAULT 'pending', -- pending|active|suspended|blacklis
language VARCHAR(5) DEFAULT 'ar',
theme VARCHAR(10) DEFAULT 'system', -- light|dark|system
fcm_token TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW(),
deleted_at TIMESTAMPTZ -- soft delete
);
-- teacher_profiles
CREATE TABLE teacher_profiles (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id),
full_name VARCHAR(255) NOT NULL,
bio TEXT,
subjects TEXT[], -- array of subjects
grades TEXT[], -- array of grade levels
experience_years INT,
lesson_price INT NOT NULL, -- in piasters
rating_avg DECIMAL(3,2) DEFAULT 0,
rating_count INT DEFAULT 0,
wallet_balance INT DEFAULT 0, -- in piasters
certificates JSONB, -- [{name, file_url, issued_by}]
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- student_profiles
CREATE TABLE student_profiles (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id), -- NULL for temporary students
full_name VARCHAR(255) NOT NULL,
phone VARCHAR(20),
grade VARCHAR(50),
entity_type VARCHAR(20) DEFAULT 'registered', -- registered|invited|external
invite_code VARCHAR(20) UNIQUE,
points_balance INT DEFAULT 0,
invitation_sent_at TIMESTAMPTZ,
claimed_at TIMESTAMPTZ,
```


```
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- center_profiles
CREATE TABLE center_profiles (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id), -- NULL for shadow centers
name VARCHAR(255) NOT NULL,
address TEXT,
area VARCHAR(100),
phone VARCHAR(20),
classroom_count INT DEFAULT 0,
entity_type VARCHAR(20) DEFAULT 'registered', -- registered|shadow|external
status VARCHAR(20) DEFAULT 'pending', -- pending|active|rejected|blacklist
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 3.2 Lessons & Attendance

```
-- lessons
CREATE TABLE lessons (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
teacher_id UUID REFERENCES teacher_profiles(id),
center_id UUID REFERENCES center_profiles(id),
classroom_id UUID REFERENCES classrooms(id),
title VARCHAR(255) NOT NULL,
subject VARCHAR(100),
grade VARCHAR(50),
scheduled_at TIMESTAMPTZ NOT NULL,
duration_mins INT DEFAULT 60,
max_students INT,
price INT NOT NULL, -- in piasters
status VARCHAR(20) DEFAULT 'scheduled', -- scheduled|ongoing|completed|can
cancellation_reason TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- lesson_enrollments
CREATE TABLE lesson_enrollments (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
lesson_id UUID REFERENCES lessons(id),
student_id UUID REFERENCES student_profiles(id),
payment_status VARCHAR(20) DEFAULT 'pending', -- pending|paid|refunded
payment_method VARCHAR(20), -- online|cash
amount_paid INT, -- in piasters
enrolled_at TIMESTAMPTZ DEFAULT NOW()
);
-- attendance_records
CREATE TABLE attendance_records (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
lesson_id UUID REFERENCES lessons(id),
```


```
student_id UUID REFERENCES student_profiles(id),
status VARCHAR(20) NOT NULL, -- present|absent|late|removed
marked_by UUID REFERENCES users(id), -- teacher or center
marked_at TIMESTAMPTZ DEFAULT NOW(),
synced BOOLEAN DEFAULT true, -- false = captured offline, not yet synced
local_timestamp TIMESTAMPTZ, -- device time when marked offline
notes TEXT
);
-- classrooms
CREATE TABLE classrooms (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
center_id UUID REFERENCES center_profiles(id),
name VARCHAR(100) NOT NULL,
capacity INT,
facilities TEXT[], -- ['AC', 'projector', 'wifi']
photos TEXT[], -- S3 URLs
is_active BOOLEAN DEFAULT true,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- classroom_bookings
CREATE TABLE classroom_bookings (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
classroom_id UUID REFERENCES classrooms(id),
lesson_id UUID REFERENCES lessons(id),
teacher_id UUID REFERENCES teacher_profiles(id),
status VARCHAR(20) DEFAULT 'pending', -- pending|approved|rejected
center_share INT, -- agreed EGP amount or percentage
requested_at TIMESTAMPTZ DEFAULT NOW(),
decided_at TIMESTAMPTZ
);
```

## 3.3 Finance Tables

```
-- transactions (immutable ledger — NO hard deletes, corrections via reversal)
CREATE TABLE transactions (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
ref_number VARCHAR(30) UNIQUE NOT NULL, -- TXN-2026-XXXXX
type VARCHAR(30) NOT NULL, -- payment|commission|payout|refund|adjustmen
amount INT NOT NULL, -- in piasters
from_entity_id UUID, -- user or center
to_entity_id UUID,
lesson_id UUID REFERENCES lessons(id),
status VARCHAR(20) DEFAULT 'pending', -- pending|completed|failed|reversed
payment_method VARCHAR(20), -- online_paymob|online_fawry|cash
gateway_ref VARCHAR(100), -- external gateway transaction ID
notes TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- invoices
CREATE TABLE invoices (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
```


```
invoice_number VARCHAR(30) UNIQUE NOT NULL, -- INV-2026-XXXXX
type VARCHAR(20) NOT NULL, -- student_invoice|teacher_statement|center_s
issued_to_id UUID REFERENCES users(id),
period_start DATE,
period_end DATE,
subtotal INT, -- piasters
commission INT, -- piasters
net_amount INT, -- piasters
status VARCHAR(20) DEFAULT 'issued', -- issued|paid|void
pdf_url TEXT, -- S3 URL
qr_code TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- payouts
CREATE TABLE payouts (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
beneficiary_id UUID REFERENCES users(id),
beneficiary_type VARCHAR(20), -- teacher|center
period_start DATE,
period_end DATE,
lesson_count INT,
gross_amount INT, -- piasters
commission INT, -- piasters
net_payable INT, -- piasters
status VARCHAR(20) DEFAULT 'pending', -- pending|approved|paid|rejected
approved_by UUID REFERENCES users(id),
paid_at TIMESTAMPTZ,
receipt_url TEXT,
created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 3.4 Points System

```
-- points_rules (Super Admin controlled ONLY)
CREATE TABLE points_rules (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
event_name VARCHAR(100) NOT NULL, -- attendance|online_payment|homework|first_
points_value INT NOT NULL,
is_active BOOLEAN DEFAULT true,
created_by UUID REFERENCES users(id), -- must be super_admin
updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- points_ledger (append-only, no updates)
CREATE TABLE points_ledger (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
student_id UUID REFERENCES student_profiles(id),
delta INT NOT NULL, -- positive = earned, negative = deducted
balance_after INT NOT NULL,
event_name VARCHAR(100),
rule_id UUID REFERENCES points_rules(id),
adjusted_by UUID REFERENCES users(id), -- NULL if automatic, super_admin if man
reason TEXT,
internal_note TEXT, -- hidden from student
```


```
created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 3.5 Notifications & Blacklist

```
-- notifications
CREATE TABLE notifications (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
recipient_id UUID REFERENCES users(id),
title VARCHAR(255),
body TEXT,
type VARCHAR(50), -- registration_approved|absence|payment|cancellation
channels TEXT[], -- ['fcm', 'email', 'sms']
status VARCHAR(20) DEFAULT 'pending', -- pending|sent|failed
fcm_message_id VARCHAR(255),
read_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- blacklist_entries
CREATE TABLE blacklist_entries (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
target_id UUID REFERENCES users(id), -- blacklisted user
level VARCHAR(20) NOT NULL, -- platform|center|teacher
imposed_by_id UUID REFERENCES users(id), -- super_admin|center|teacher
reason TEXT NOT NULL,
is_active BOOLEAN DEFAULT true,
removed_at TIMESTAMPTZ,
removed_by UUID REFERENCES users(id),
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- audit_logs
CREATE TABLE audit_logs (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
actor_id UUID REFERENCES users(id),
action VARCHAR(100) NOT NULL, -- e.g., 'center.approved', 'blacklist.added
target_type VARCHAR(50), -- center|teacher|student|lesson|payout
target_id UUID,
before_state JSONB,
after_state JSONB,
ip_address INET,
created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 3.6 Chatbot & AI

```
-- chatbot_config (Super Admin controlled)
CREATE TABLE chatbot_config (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
support_bot_enabled BOOLEAN DEFAULT true,
academic_bot_enabled BOOLEAN DEFAULT true,
monthly_token_limit INT DEFAULT 1000000,
```


```
tokens_used_this_month INT DEFAULT 0,
last_reset_at DATE,
updated_by UUID REFERENCES users(id)
);
-- chatbot_faq
CREATE TABLE chatbot_faq (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
question TEXT NOT NULL,
answer TEXT NOT NULL,
category VARCHAR(50), -- booking|payment|grades|attendance
is_active BOOLEAN DEFAULT true,
created_at TIMESTAMPTZ DEFAULT NOW()
);
-- chatbot_conversations
CREATE TABLE chatbot_conversations (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
user_id UUID REFERENCES users(id),
session_id UUID,
messages JSONB, -- [{role, content, timestamp}]
bot_type VARCHAR(20), -- support|academic
handed_off BOOLEAN DEFAULT false,
handoff_to VARCHAR(50), -- teacher|assistant|support
satisfaction INT, -- 1-5
created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4. API Endpoints Specification

## 4.1 Auth

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/verify-otp
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

## 4.2 Super Admin — Management

```
\# Centers
GET /api/v1/admin/centers?status=pending|active|rejected|blacklisted
GET /api/v1/admin/centers/:id
POST /api/v1/admin/centers/:id/approve [SA only]
POST /api/v1/admin/centers/:id/reject [SA only] body: {reason}
POST /api/v1/admin/centers/:id/blacklist [SA only] body: {reason}
PATCH /api/v1/admin/centers/:id/toggle [SA only] enable/disable
# Teachers
GET /api/v1/admin/teachers?status=...
```


```
POST /api/v1/admin/teachers/:id/approve [SA only]
POST /api/v1/admin/teachers/:id/reject [SA only]
POST /api/v1/admin/teachers/:id/blacklist [SA only]
POST /api/v1/admin/teachers/:id/link-center
DELETE /api/v1/admin/teachers/:id/unlink-center
# Students
GET /api/v1/admin/students?grade=&subject=&center_id=
GET /api/v1/admin/students/:id
POST /api/v1/admin/students/:id/blacklist [SA only]
POST /api/v1/admin/students/:id/link-parent
DELETE /api/v1/admin/students/:id/unlink-parent
# Permissions
GET /api/v1/admin/users/:id/permissions
POST /api/v1/admin/accountants [SA only] create accountant
PATCH /api/v1/admin/users/:id/permissions
# Notifications (bulk)
POST /api/v1/admin/notifications/bulk body: {target: 'all'|'teachers'|segment,
GET /api/v1/admin/notifications/history
# Points [SA ONLY — all endpoints]
GET /api/v1/admin/points/rules
POST /api/v1/admin/points/rules
PATCH /api/v1/admin/points/rules/:id
DELETE /api/v1/admin/points/rules/:id
GET /api/v1/admin/points/students/:id/ledger
POST /api/v1/admin/points/students/:id/adjust body: {delta, reason, internal_note}
# Dashboard KPIs
GET /api/v1/admin/dashboard/kpis
GET /api/v1/admin/dashboard/revenue-chart?period=weekly|monthly
GET /api/v1/admin/dashboard/user-growth-chart
```

## 4.3 Accountant — Finance

```
\# Dashboard
GET /api/v1/finance/dashboard/kpis
GET /api/v1/finance/dashboard/revenue-chart
# Transactions
GET /api/v1/finance/transactions?from=&to=&type=&status=&search=
GET /api/v1/finance/transactions/:id
GET /api/v1/finance/transactions/export?format=pdf|excel
# Invoices
GET /api/v1/finance/invoices?type=&student_id=&teacher_id=
GET /api/v1/finance/invoices/:id
POST /api/v1/finance/invoices/:id/send-email
GET /api/v1/finance/invoices/:id/pdf
# Payouts
GET /api/v1/finance/payouts?status=pending|approved|paid
POST /api/v1/finance/payouts/:id/approve
```


```
POST /api/v1/finance/payouts/bulk-approve body: {ids: []}
GET /api/v1/finance/payouts/:id/receipt
# Reports
GET /api/v1/finance/reports/revenue?period=daily|monthly|yearly
GET /api/v1/finance/reports/teacher-statement/:teacher_id?from=&to=
GET /api/v1/finance/reports/center-statement/:center_id?from=&to=
GET /api/v1/finance/reports/refunds?from=&to=
GET /api/v1/finance/reports/trial-balance?period=
# Alerts
GET /api/v1/finance/alerts
```

## 4.4 Center

```
\# Dashboard
GET /api/v1/center/dashboard
# Classrooms
GET /api/v1/center/classrooms
POST /api/v1/center/classrooms
PATCH /api/v1/center/classrooms/:id
DELETE /api/v1/center/classrooms/:id (soft delete, blocks if future bookings exist)
GET /api/v1/center/classrooms/:id/calendar?from=&to=
GET /api/v1/center/classrooms/:id/usage-history
# Classroom Booking Requests
GET /api/v1/center/booking-requests?status=pending
POST /api/v1/center/booking-requests/:id/approve body: {center_share}
POST /api/v1/center/booking-requests/:id/reject body: {reason}
# Teachers
GET /api/v1/center/teachers
GET /api/v1/center/teachers/:id/performance
PATCH /api/v1/center/teachers/:id/share body: {share_amount_piasters}
# Attendance
GET /api/v1/center/attendance?lesson_id=
POST /api/v1/center/attendance body: {lesson_id, student_id, status}
POST /api/v1/center/attendance/notify-parents body: {lesson_id, absent_student_ids
# Finance
GET /api/v1/center/finance/monthly-revenue
GET /api/v1/center/finance/teacher-dues
GET /api/v1/center/finance/export?format=pdf|excel
# Blacklist
GET /api/v1/center/blacklist
POST /api/v1/center/blacklist body: {student_id, reason}
DELETE /api/v1/center/blacklist/:id (remove from blacklist)
```


```
\# Profile
GET /api/v1/teacher/profile
PATCH /api/v1/teacher/profile
POST /api/v1/teacher/profile/upload-certificate
# Lessons
GET /api/v1/teacher/lessons?from=&to=
POST /api/v1/teacher/lessons
PATCH /api/v1/teacher/lessons/:id
POST /api/v1/teacher/lessons/:id/cancel body: {reason}
GET /api/v1/teacher/lessons/:id/roster
# Classroom Booking
POST /api/v1/teacher/classroom-requests body: {classroom_id, lesson_id}
# Attendance
GET /api/v1/teacher/attendance/:lesson_id
POST /api/v1/teacher/attendance/mark body: {lesson_id, records: [{student_id, s
POST /api/v1/teacher/attendance/sync body: {offline_records: [...]} ← offline
# Grades
GET /api/v1/teacher/grades/:lesson_id
POST /api/v1/teacher/grades body: {student_id, lesson_id, type, score
GET /api/v1/teacher/grades/:student_id/summary
# Content
GET /api/v1/teacher/content?lesson_id=
POST /api/v1/teacher/content/upload multipart: {file, lesson_id, title, access
DELETE /api/v1/teacher/content/:id
# Wallet & Finance
GET /api/v1/teacher/wallet
GET /api/v1/teacher/wallet/transactions
POST /api/v1/teacher/wallet/payout-request
# Ratings
GET /api/v1/teacher/ratings
POST /api/v1/teacher/ratings/:id/reply
# Assistants
GET /api/v1/teacher/assistants
POST /api/v1/teacher/assistants body: {user_id, permissions: []}
DELETE /api/v1/teacher/assistants/:id
```

## 4.6 Student

```
\# Search & Discovery
GET /api/v1/student/teachers?subject=&grade=&area=&min_price=&max_price=&sort=rati
GET /api/v1/student/teachers/:id/profile
GET /api/v1/student/centers/nearby?lat=&lng=&radius_km=
# Booking
```


```
POST /api/v1/student/bookings body: {lesson_id, payment_method}
GET /api/v1/student/bookings
GET /api/v1/student/bookings/:id
POST /api/v1/student/bookings/:id/refund body: {reason}
# Payments
POST /api/v1/student/payments/initiate body: {lesson_id, method: paymob|fawry}
POST /api/v1/student/payments/webhook ← payment gateway callback
GET /api/v1/student/payments/history
# Schedule
GET /api/v1/student/schedule?from=&to=
# Grades
GET /api/v1/student/grades?teacher_id=
GET /api/v1/student/grades/progress-chart
# Content
GET /api/v1/student/content?lesson_id=
GET /api/v1/student/content/:id/download
# Points
GET /api/v1/student/points
GET /api/v1/student/points/history
# AI Assistant
POST /api/v1/student/ai/summarize body: {content_id}
POST /api/v1/student/ai/generate-questions body: {content_id, difficulty: easy|medi
POST /api/v1/student/ai/explain body: {concept, subject}
# Ratings
POST /api/v1/student/ratings body: {teacher_id, lesson_id, stars, comme
PATCH /api/v1/student/ratings/:id (edit within 24 hours)
# Chatbot
POST /api/v1/student/chatbot/message body: {message, session_id}
```

## 4.7 Parent

```
GET /api/v1/parent/children
POST /api/v1/parent/children/link body: {student_id, verification_code}
GET /api/v1/parent/children/:id/summary
GET /api/v1/parent/children/:id/attendance
GET /api/v1/parent/children/:id/grades
GET /api/v1/parent/children/:id/schedule
GET /api/v1/parent/children/:id/expenses
GET /api/v1/parent/children/:id/blacklist-status
POST /api/v1/parent/chat/send body: {recipient_id, message}
GET /api/v1/parent/chat/conversations
```


## 4.8 Temporary Entities

```
\# Temporary students (created by teacher or center)
POST /api/v1/teacher/temp-students body: {full_name, phone, grade, subject}
POST /api/v1/center/temp-students body: {full_name, phone, grade, subject}
POST /api/v1/temp-students/:id/send-invite ← sends SMS/WhatsApp invite
POST /api/v1/temp-students/claim body: {invite_code, user_id} ← merges dat
# Shadow centers
POST /api/v1/teacher/shadow-centers body: {name, area, phone, classroom_count}
```

## 5. Module-by-Module Business Logic

## 5.1 Money Distribution (Critical — Auto on lesson completion)

```
// Triggered when: lesson.status changes to 'completed' AND all enrollments are paid
async function distributeLessonRevenue(lessonId) {
const lesson = await getLessonWithEnrollments(lessonId);
const booking = await getClassroomBooking(lessonId);
const PLATFORM_TEACHER_FEE = 200; // 2 EGP in piasters
const PLATFORM_CENTER_FEE = 200; // 2 EGP in piasters
for (const enrollment of lesson.paidEnrollments) {
const lessonPrice = enrollment.amount_paid;
const centerShare = booking?.center_share ?? 0;
// Teacher net
const teacherNet = lessonPrice - PLATFORM_TEACHER_FEE - centerShare;
// Center net
const centerNet = centerShare - PLATFORM_CENTER_FEE;
// Platform net
const platformNet = PLATFORM_TEACHER_FEE + PLATFORM_CENTER_FEE;
// Record transactions
await createTransaction({ type: 'payment', from: student, to: platform, amount: l
await createTransaction({ type: 'commission', from: teacher, to: platform, amount
await createTransaction({ type: 'commission', from: center, to: platform, amount
// Update wallets
await updateTeacherWallet(lesson.teacher_id, +teacherNet);
await updateCenterWallet(booking.center_id, +centerNet);
// Trigger points
await awardPoints(enrollment.student_id, 'online_payment');
await awardPoints(enrollment.student_id, 'attendance'); // if marked present
}
}
```


## 5.2 Registration Approval Flow

- 1. Teacher/Center submits registration form

- 2. Record created with status = 'pending'

- 3. Super Admin sees in pending queue (dashboard badge count)

- 4. Super Admin reviews and:

a. Approves → status = 'active', FCM + Email sent with approval message

- b. Rejects → status = 'rejected', Email sent with reason, record kept for audit

- 5. All approval/rejection actions written to audit_logs

## 5.3 Offline Attendance Sync

## Mobile (offline):

- 1. Teacher marks attendance → saved to local SQLite with synced = false

- 2. Offline indicator shown in UI

- 3. Queue holds: {lesson_id, student_id, status, local_timestamp}

## On reconnect:

- 1. App detects network → calls POST /api/v1/teacher/attendance/sync

- 2. Server receives array of offline records

- 3. Server validates: lesson exists, no conflict with existing records

- 4. Server inserts with synced = true, preserves local_timestamp

- 5. Conflict rule: if server already has a record for same lesson+student → keep ser

- 6. Parent notifications sent after successful sync

## 5.4 Temporary Student → Full Account Merge

- 1. Teacher creates temp student: {name, phone, grade}

→ student_profiles row: user_id = NULL, entity_type = 'invited', invite_code = gen

- 2. Attendance/grades/payments recorded against student_profiles.id

- 3. Platform sends SMS: "Your code is {invite_code} - join EduConnect"

- 4. Student downloads app, registers with same phone number

- 5. On registration: system detects invite_code match OR phone match

- 6. Merge: student_profiles.user_id = new_user.id, entity_type = 'registered'

- 7. All historical records (attendance, grades, payments, points) preserved

- 8. Duplicate check: if phone already exists → offer to link, not create new

## 5.5 Invoice Generation

## Auto-generate on:

- \- Student payment confirmed → PaymentReceipt (INV-2026-XXXXX)

- \- Lesson completed → StudentInvoice for the lesson list

- \- Month end → TeacherStatement, CenterStatement

## Invoice format:

Number: INV-{YEAR}-{5-digit-sequence} (e.g., INV-2026-00001)

QR Code: URL to /invoices/verify/{invoice_number}

PDF: generated via Puppeteer or similar, stored on S3

Auto-email: sent to recipient email on generation


## 5.6 Chatbot Intent Routing

```
User message → NLP intent detection
├─ Platform intent (booking/payment/schedule/grades/attendance)
│ └─ FAQ lookup → if found: return answer
│ └─ if not found: DB query → if found: return structured answer
│ └─ if not found: hand off to teacher/assistant/support
├─ Academic intent (explain/summarize/questions)
│ └─ Check: academic_bot_enabled? AND tokens_used < monthly_limit?
│ └─ yes → Claude API call with subject context
│ → Deduct tokens from chatbot_config.tokens_used_this_month
│ └─ no → "Academic bot unavailable" message
└─ Human request
└─ Hand off to appropriate channel
```

## 5.7 Points Engine

```
// Triggered after specific events
async function awardPoints(studentId, eventName) {
const rule = await getActiveRule(eventName);
if (!rule) return;
const student = await getStudent(studentId);
const newBalance = student.points_balance + rule.points_value;
await db.transaction(async (trx) => {
await trx('student_profiles').where({id: studentId}).update({points_balance: newB
await trx('points_ledger').insert({
student_id: studentId,
delta: rule.points_value,
balance_after: newBalance,
event_name: eventName,
rule_id: rule.id
});
});
}
// Events that trigger point awards:
// attendance (present) → award points
// online_payment → award points
// first_booking → welcome bonus
// lesson_booking (each new booking) → award points
// teacher_rating (after submitting) → award points
// streak_bonus → consecutive lesson attendance
```

## 6. Notification Matrix

| Event | Who Receives | Channels |
| --- | --- | --- |
| Registration approved | Teacher / Center | FCM + Email |
| Registration rejected | Teacher / Center | Email (with reason) |


| Event | Who Receives | Channels |
| --- | --- | --- |
| Student absence | Parent | FCM |
| Student removed from lesson | Parent | FCM + SMS |
| New payment received | Student + Parent | FCM |
| Lesson cancelled | All enrolled students | FCM + SMS |
| New grade entered | Student + Parent | FCM |
| Classroom booking request | Center | FCM |
| Classroom request approved/rejected | Teacher | FCM |
| Blacklist action | Affected user | Email + FCM |
| Payout approved | Teacher / Center | FCM + Email |
| New chat message | Recipient | FCM |
| Lesson reminder (30 min before) | Student | FCM |
| Homework deadline | Student | FCM |
| Invite code sent | Temp student | SMS |

## 7. Blacklist Business Rules

Platform Blacklist (Super Admin only):

- \- User cannot login or use any feature

- \- All active bookings cancelled, refunds processed

- \- Cannot re-register with same phone/email without SA approval

## Center Blacklist (Center):

- \- Student cannot book lessons at that center

- \- Student can still use other centers

- \- Reason and date recorded

## Teacher Blacklist (Teacher):

- \- Student cannot book that teacher's lessons

- \- Student can book other teachers

- \- Reason and date recorded

## All levels:

- \- Confirmation dialog required before adding

- \- Reason is mandatory

- \- Removable with reason

- \- All entries logged in audit_logs


## 8. Security & Validation Rules

## 8.1 RBAC Enforcement

```
Route: POST /api/v1/admin/centers/:id/approve
Guard: requireRole(['super_admin'])
→ If role !== 'super_admin' → 403 Forbidden
Route: POST /api/v1/admin/points/rules
Guard: requireRole(['super_admin'])
→ Points rules: ONLY super_admin, no exceptions
Route: GET /api/v1/finance/transactions
Guard: requireRole(['super_admin', 'accountant'])
→ Accountant can read, cannot modify non-finance data
```

## 8.2 Data Isolation

```
Teachers: can only access their own lessons, students in their lessons
Centers: can only access their own classrooms, linked teachers
Students: can only access their own bookings, grades, payments
Parents: can only access their linked children's data
```

## 8.3 Input Validation Rules

```
All money inputs: integer (piasters), min 0, max 99999900 (999,999 EGP)
Phone numbers: Egyptian format validation (+20 or 01x)
Dates: ISO 8601, reject past dates for new lesson creation
File uploads: PDF max 10MB, images max 5MB, allowed types enforced
Rating: integer 1-5 only, one rating per student per lesson
Edit rating: only within 24 hours of submission
```

## 9. Non-Functional Requirements

## 9.1 Performance Targets

| Metric | Target |
| --- | --- |
| API response time (p95) | < 500ms |
| Payment webhook processing | < 2s |
| Offline sync completion | < 10s for 100 records |
| Invoice PDF generation | < 5s |
| Search results | < 300ms |


## 9.2 Localization

Primary: Arabic (ar) — RTL layout

Numbers: Arabic-Indic numerals optional, Western numerals default

Currency: EGP with thousands separator (e.g., 10,000 EGP)

Dates: Arabic month names or dd/mm/yyyy

Error messages: Arabic primary, English secondary

Future: English full support (i18n keys from day 1)

## 9.3 Offline Capability

Teacher mobile app must function without internet for:

- \- Viewing lesson roster (cached on app open)

- \- Marking attendance (stored locally, synced on reconnect)

- \- Reading cached grades and lesson info

Offline indicator: persistent banner when no connectivity

Sync status: show "X records pending sync" counter

Auto-retry: attempt sync every 30 seconds when network detected

## 10. Development Phases

## Phase 0 — Foundation (Week 1–2)

- [ ] Auth module (register, login, OTP, JWT)

- [ ] User/Role base tables + RBAC middleware

- [ ] Super Admin: center + teacher approval flow

- [ ] FCM notification setup

## Phase 1 — Core Operations (Week 3–6)

- [ ] Teacher: lessons, attendance (online), grades, content

- [ ] Student: search, booking, payment (Paymob/Fawry), schedule

- [ ] Center: classrooms, booking requests, basic dashboard

- [ ] Money distribution engine (auto on lesson completion)

- [ ] Invoice generation (student receipt + teacher statement)

## Phase 2 — Finance & Admin (Week 7–9)

- [ ] Accountant dashboard + all finance views

- [ ] Transaction ledger + payout workflow

- [ ] Financial reports + PDF/Excel export

- [ ] Blacklist system (all 3 levels)


- [ ] Bulk notifications

## Phase 3 — Engagement (Week 10–12)

- [ ] Offline attendance sync

- [ ] Ratings system

- [ ] Points engine + student ledger

- [ ] Temporary students + shadow centers + merge flow

- [ ] Parent app (view-only: attendance, grades, expenses)

## Phase 4 — AI & Polish (Week 13–15)

- [ ] Chatbot (support bot + academic bot)

- [ ] AI student assistant (summarize, Q&A generation)

- [ ] GPS nearest center

- [ ] Smart accountant alerts

- [ ] Financial aid system (spec pending)

## 11. Open Decisions (Must Resolve Before Development)

| Decision | Impact | Owner |
| --- | --- | --- |
| VAT/tax treatment (inclusive vs exclusive) | Invoice structure, pricing display | Tarek |
| Final tech stack (NestJS vs Express, React Native vs Flutter) | Folder structure, tooling | Developer |
| Payment gateway contract (Paymob/Fawry keys, test vs live) | Payment module | Tarek |
| Claude API vs GPT-4o for academic bot | Chatbot module | Tarek |
| Financial aid system detailed spec | Phase 4 scope | Tarek |
| Points redemption/rewards catalog | Points module Phase 4 | Tarek |
| Center share: flat EGP amount vs percentage | Money distribution formula | Tarek |
| Chatbot live-support routing (WhatsApp vs internal) | Handoff logic | Tarek |

EduConnect PRD for Full-Stack Developer — Internal Use Only

Generated: July 2026
