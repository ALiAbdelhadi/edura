# EduPlatform — Features & System Behavior (v2)

> Revised after the scoping review. Terminology and structural changes are noted inline. Open questions and V1 deferrals are listed at the end.

---

## 🧱 Core Concepts & Data Model

**Top-level entities** (platform-wide, independent of any center):

- **Student** — self-registered account, identified by email or phone
- **Parent** — self-registered account, optionally linked to one or more students
- **Teacher** — account created via center invite, owns a public profile
- **Center** — organization running courses, has one or more admins

**Relational entities:**

- **CenterTeacherAffiliation** — links a teacher to a center with a status
- **ParentStudentLink** — connects a parent account to a student account
- **Course** — a recurring class definition at a center
- **Session** — a single meeting of a course
- **Enrollment** — a student's active membership in a course
- **EnrollmentRequest** — a student-initiated pending request to join a course
- **AttendanceRecord** — a student's status for a single session
- **Grade** — a scored entry (homework/exam) in a course for a student
- **Payment** — a cash payment (positive amount) or refund (negative amount)
- **Review** — a student's rating + written review for a teacher
- **Notification** — an in-app + push message to a user

**Terminology change from v1:** the word "Lesson" is replaced by **Course** (recurring class) and **Session** (a single meeting). A course contains many sessions.

---

## 👨‍👩‍👦 Parent Portal

### Features
- Register and log in with email and password; reset password via email
- Link to one or more student accounts via the student's family-link code, or via mutual email/phone approval
- Switch between linked children from a single account
- View all teachers of each linked child (name, subject, photo, rating)
- View each child's weekly session schedule (subject, teacher, room, date/time, price)
- View each child's attendance record per session (present / absent / excused)
- View each child's grades on homework and exams
- Receive payment receipts when the center records a cash payment for their child
- View the full payment history per child
- Receive instant notifications for: absence, session cancellation, session postponement, new grades, new homework/materials, payment receipts, enrollment approvals
- View all notifications in a unified inbox with type filters and mark-as-read
- Unlink from a child at any time from settings

---

## 🧑‍🎓 Student Portal

### Features
- Register and log in with email and password (or phone); reset password via email
- Display a personal family-link code for a parent to link to the account; rotate the code if needed
- Approve or reject a parent's link request when initiated by the parent
- Browse and search centers, teachers, and courses by location, subject, rating, price range, schedule, and distance
- View full course detail: schedule, price, subject, teacher profile, room, remaining seats, and reviews
- Submit an enrollment request for a course; view the status of all submitted requests
- Cancel a pending enrollment request
- View their own enrolled courses in a weekly session schedule
- View their own attendance record per session (read-only)
- View their own grades on homework and exams
- Receive instant notifications for: enrollment request status changes, session cancellations/postponements, new grades, new materials, payment receipts
- Rate teachers (1–5 stars) and leave a written review after attending at least one session with them at any center
- Read other students' reviews on any teacher's public profile
- Download PDF study materials uploaded by the teacher for enrolled courses (signed URL, 1-hour expiry)

---

## 🏫 Center Portal

### Features
- Register and log in with email and password; invite multiple admins with equal permissions
- Add existing students to the center's roster via exact-match email or phone lookup
- Pre-create a shell student account and invite the student via email if they're not yet on the platform
- Record operational parent contact information (name + phone) as a free-text field on a student's center record — separate from any platform parent account
- Enroll and unenroll students in courses manually
- Review and approve or decline student-submitted enrollment requests in a shared admin inbox
- Invite teachers to the center by email: either lookup of an existing teacher account, or pre-create a shell and invite
- Remove teachers from the center (blocked if the teacher has active courses at this center — must cancel or reassign first)
- Define rooms with names and maximum student capacity
- Create courses by assigning a teacher, default room, subject, title, schedule pattern, start/end dates, price, and max students
- Reassign a course's teacher to another affiliated teacher of the same center
- View conflict warnings when scheduling overlapping sessions in the same room or with the same teacher
- Mark student attendance per session (present / absent / excused); edit attendance up to 7 days after the session
- Record cash payments per student per course and generate a sequential receipt number
- Record refunds as negative payment entries
- View a full payment log filterable by student, course, and date
- Log center expenses with date, amount, and category
- View revenue and expense reports with net profit, filterable by date range
- Blacklist students with a reason to prevent re-enrollment; remove from the blacklist when needed
- Send custom notification broadcasts to all parents or to parents of a specific course
- Cancel an entire course (cascades to all future non-completed sessions)
- View admin dashboard: total students, total teachers, total courses, monthly revenue, attendance rate, today's sessions

---

## 👨‍🏫 Teacher Portal

### Features
- Activate account via center invite email and set a password; reset password via email
- Create and edit a public profile: bio, subjects taught, qualifications, experience, and profile photo (profile is owned by the teacher; no center can edit it)
- Accept or decline center invitations
- Leave a center at any time (blocked if there are active courses at that center)
- View all assigned courses and their sessions with full schedule details
- View the list of enrolled students per course
- View (read-only) attendance for their own sessions
- Cancel a session with a required reason
- Postpone a session to a new date and time (re-runs conflict detection)
- Create named grade entries per course (type: homework or exam, max score, date) and enter per-student scores; edit or delete entries as needed
- Upload, replace, and delete PDF study materials (notes, homework, exams) scoped to a specific course
- View personal dashboard: total active students, upcoming sessions today, average attendance rate, pending grade entries

---

## ⚙️ System Behavior

### Authentication & Roles
- Four distinct roles: `parent`, `student`, `center_admin`, `teacher`
- All roles authenticate via email + password using session-based auth
- Students and parents self-register; teachers are created via center invite; center admins self-register or are invited by another admin
- A center can have multiple admins with identical permissions
- Password reset is available to all roles via email

### Accounts, Onboarding & Linking

**Student onboarding — two paths, center's choice:**
- **Lookup** — center enters the student's exact email or phone; if a matching account exists, it is added to the center's roster. Partial search and browsing the user base is not permitted.
- **Pre-create** — center creates a shell student account with email; system sends the student a set-password invite email. On activation, the shell becomes a normal account, and any existing roster membership, enrollments, attendance, and grades are preserved.
- **Collision** — if the pre-create email matches an existing account, creation is blocked and the admin is pushed to the lookup path. If a student self-registers with an email that has a pending shell, the registration claims the shell.
- **Consent on add** — when added to a center's roster, the student is auto-joined and notified; they may leave and report unwanted additions.

**Teacher onboarding — same two paths:**
- Lookup by email for existing teacher accounts
- Pre-create a shell teacher account + set-password invite
- Invite state lives on the `CenterTeacherAffiliation`: `pending` → `active` on acceptance, `declined` on rejection, `expired` after 30 days of no response. Re-invite allowed any time after expiry, decline, or removal.

**Parent ↔ student linking — two paths:**
- **Family-link code** — student's profile displays a 10–12 char rotatable code; parent enters the code to link instantly (the code is the consent).
- **Mutual approval** — either party enters the other's exact email or phone; the other party receives a link request (`pending` → `approved` / `rejected` / `revoked`).
- **Not center-mediated** — the center does not create or broker the platform-level parent link.
- **One parent per student at a time** — a second link attempt while an active link exists is rejected. A parent may be linked to multiple students.
- **Unlinking** — either side can unilaterally unlink; access revokes immediately. Link history is retained for audit.
- **Operational parent contact** (name + phone on the student's center record) is a separate concept — a center can hold this information regardless of whether a platform parent account exists.

### Courses & Sessions
- A **course** defines a recurring class: teacher, default room, subject, title, schedule pattern, start/end dates, price (informational), max students, and status (`active` / `ended` / `cancelled`).
- The V1 schedule pattern is "days of the week + start time + end time + start date + end date." Full iCal RRULE is out of scope.
- **Sessions are pre-generated** from the schedule pattern at course creation. If the course's end date is extended, additional sessions are generated for the new range. If the pattern changes, only future non-completed sessions are regenerated; completed, cancelled, and postponed sessions are preserved.
- A session may individually override the course's default room.
- Session statuses: `scheduled` / `cancelled` / `postponed` / `completed`. A postponed session keeps its `original_date` and stores the `new_date` + `new_start_time` + `new_end_time` on the same record.
- **Conflict detection** runs at the session level on creation and on postponement, blocking overlaps for the same room or the same teacher. A conflict response returns details of the clashing session.
- **Course-level cancellation** cascades to all future non-completed sessions in one action, with a single fan-out notification per enrolled student and linked parent.
- Courses can only be scheduled with teachers whose affiliation is `active`.

### Enrollment

- **Admin-initiated direct enrollment** — center admin enrolls a student directly into a course. Blocked if the student is on the center's blacklist.
- **Student-initiated enrollment requests** — students submit an `EnrollmentRequest` from a course's detail page. Status flow: `pending` → `approved` / `declined` / `cancelled` (by student) / `expired` (after 14 days of no action).
- Blacklisted students cannot submit a request; the request button is hidden and a message is shown explaining the enrollment is blocked (the specific blacklist reason is never shown to the student).
- Only one active request per (student, course) is allowed.
- **Capacity is checked at approval time**, not at submission time. If the course is full at approval, the admin is prompted to decline with a course-full reason. No waitlist in V1.
- All admins share the pending-request inbox; any admin can approve or decline. A notification fires to all admins on a new request.
- Decline reason is optional; if provided, it is shown to the student.
- Enrollment is into a course, not a session. Attendance records are generated only from the enrollment date forward.
- Mid-course enrollment is allowed; price is not auto-prorated (free-form payment model handles negotiation).
- A student may not be actively enrolled in the same course twice. After unenrollment, re-enrollment is allowed and creates a new enrollment record.

### Attendance
- Attendance is marked exclusively by center staff. Teachers can **view** attendance for their own sessions but cannot edit it.
- Each attendance record stores: student, session, status (`present` / `absent` / `excused`), timestamp, and the admin who marked it.
- Admins can edit attendance up to 7 days after the session; records are locked thereafter to prevent retroactive tampering.
- Marking a student as absent automatically sends a notification to the student and any linked parent. A later edit that flips absent → present sends a correction notification; the original is not un-sent.

### Cancellation & Postponement
- **Authority** — only the assigned teacher of a session can cancel or postpone it. Center admins cancel only at the course level (or indirectly via teacher-removal reassignment). A cancellation reason is required.
- **Postponement** updates the same session record (status → `postponed`), stores the new date and time, and re-runs conflict detection on the new slot. Conflicts block the postponement.
- **Notifications** on cancellation or postponement fan out to enrolled students, their linked parents, and all center admins. The notification includes the reason, original date/time, and (for postponements) the new date/time.
- **Refunds are fully manual.** Cancellation does not automatically refund. If a refund is appropriate, the admin records it as a negative payment.
- There are no rate limits on teacher cancellations in V1; centers monitor patterns via the admin dashboard.

### Notifications
- All notification types flow through a shared service and are delivered via Firebase Cloud Messaging (FCM) as well as stored in the in-app inbox.
- **Trigger list:**
  - Absence marked → student and linked parent
  - Session cancelled or postponed → enrolled students, linked parents, all center admins
  - Course cancelled → all enrolled students, their linked parents, all center admins (single fan-out)
  - New grade entered → student and linked parent
  - New material uploaded → enrolled students and linked parents
  - Cash payment recorded → linked parent (with receipt link); falls back to student if no parent linked
  - Enrollment request submitted → all center admins
  - Enrollment request approved or declined → the requesting student
  - Student added to a center's roster → the student
  - Teacher invited by a center → the teacher
  - Parent link requested (mutual-approval path) → the other party
  - Center admin broadcast → targeted parents (all parents of a course, or all parents of the center)
- **Parent fallback rule** — notifications destined for "the parent" are sent to the student when no parent is linked.
- Users can view all notifications in a unified inbox and mark them as read.

### Payments
- All payments are cash only; no online payment gateway.
- Payments are recorded manually by center staff per student per course.
- **Free-form log model** — there are no enforced billing cycles and no system-tracked arrears in V1. A `price` on a course is informational only; the admin may record any amount at payment time (supporting discounts, scholarships, negotiated pricing, and sibling rates without special logic).
- Each payment record stores: student, course, amount (signed; negative = refund), date, the admin who recorded it, and an auto-generated receipt number.
- Receipt format: `RCP-{center_short_id}-{YYYY}-{00001}`, sequential per center.
- Revenue and expense reports are computed by summing payment records and expense entries in the date range.
- A payment receipt is accessible on a dedicated printable page by the linked parent, or by the student if no parent is linked.

### Grades & Materials
- Only teachers can create grade entries or upload materials; centers have no access to academic content.
- A grade entry has: course, type (`homework` / `exam`), name, max score, date. Scores are entered per enrolled student; numeric only, no letter grades, no weighted averages in V1.
- Teachers can edit or delete grade entries; students and linked parents see changes reflected.
- Materials are PDF only, stored in S3/Cloudinary, and served via signed URLs with a 1-hour expiry.
- Materials are scoped to a course (flat list, sorted by upload date) with a title and a type (`notes` / `homework` / `exam`).
- Only students currently enrolled in the course can generate a signed URL. Unenrolling revokes access to future downloads.
- When a teacher leaves or is removed from a center, their historical grades and materials remain attached to past courses; enrolled students retain access until course end. The teacher keeps read access in their own archive.

### Reviews & Ratings
- A student may submit a review for a teacher only after having attended at least one session with that teacher at any center.
- Each student can submit one review per teacher (editable, not duplicatable).
- A review stores the rating, text, the student, the teacher, the center, and the course as context.
- A teacher's overall rating is an unweighted mean across all their reviews and is displayed from the first review onward with the review count visible.
- Reviews are displayed on the teacher's public profile, paginated 20 at a time, optionally filterable by center.
- Reviews are final once submitted; only the authoring student can edit. Platform-level moderation of abusive reviews is deferred beyond V1.

### Multi-Child Parent Support
- A parent account may be linked to multiple students.
- All parent-facing pages scope data to the currently selected child.
- The active child is selected via a switcher in the navigation.
- A parent who links to a single student will not see the switcher.

### Discovery
- Students can discover content via three entry points: **by course**, **by center**, and **by teacher** — all converge on the course detail page.
- Courses, centers, and teachers are all indexed for discovery. Centers without at least one active course are excluded from results.
- **Filters**: subject (fixed curated list, platform-managed), rating (minimum teacher rating), price range, distance, days of the week, and time-of-day bucket (morning / afternoon / evening).
- **Grade level is a free-text tag on courses** in V1. Students do not carry a structured grade on their profile. Course titles should include the grade by convention (UI placeholder: `"e.g., Physics — Grade 12 Science"`).
- **Location**: GPS at search time with permission prompt; fallback to manual city/area selection; students may save a preferred area. Distance is straight-line geospatial (MongoDB 2dsphere), not driving distance.
- **Teacher subject filter** matches the teacher's declared subjects on their profile, not only the subjects of their currently-running courses.
- **Remaining seats** on a course is live-computed from current enrollments, not stored.
- In V1, students cannot message centers or teachers on the platform. Contact happens externally via the phone/WhatsApp numbers on the center's profile.

### Authority Matrix (summary)

| Action | Student | Parent | Teacher | Center Admin |
|---|---|---|---|---|
| Enter / edit grades | — | — | ✅ | — |
| Upload / delete materials | — | — | ✅ | — |
| Mark / edit attendance | — | — | 👁 view only | ✅ |
| Cancel / postpone session | — | — | ✅ | — |
| Cancel entire course | — | — | — | ✅ |
| Enroll / unenroll student | — | — | — | ✅ |
| Submit enrollment request | ✅ | — | — | — |
| Approve / decline request | — | — | — | ✅ |
| Record payment / refund | — | — | — | ✅ |
| Blacklist / unblacklist | — | — | — | ✅ |
| Submit review | ✅ | — | — | — |
| Invite / remove teacher | — | — | — | ✅ |
| Leave a center | — | — | ✅ | — |
| Edit teacher profile | — | — | ✅ | — |

### Language & Platform
- The platform is web-only in V1.
- Full bilingual support: Arabic and English, including RTL layout for Arabic.

---

## 🧩 V1 Scope & Deferrals

The following are deliberately **out of scope for V1** and should be revisited later:

- **Very young students (no email/phone).** V1 targets teens and adults. Primary-school students and below need a model — candidates include parent-managed credentials, dependent sub-profiles under the parent, or center-created shells with dummy identifiers.
- **Multi-parent linking.** One parent per student at a time. Co-parents, grandparents, and observer roles are deferred.
- **Active payment tracking / arrears.** Free-form log only in V1. Monthly subscription, per-session billing, and packaged-term billing are candidate upgrades.
- **Waitlist on full courses.** Full = declined; no automatic queue in V1.
- **Structured grade level and streams.** Free-text in V1. Full Egyptian taxonomy (Primary / Prep / Secondary + Literary / Scientific / Math streams) is a later upgrade.
- **Messaging / chat** between students, parents, teachers, and centers. External channels only (phone, WhatsApp) in V1.
- **Review moderation.** Reviews are final once submitted; platform-level takedown for abuse comes later.
- **Admin emergency session cancellation** (when a teacher goes unreachable). If needed, add a narrow, audit-logged "admin emergency cancel" on a single session.
- **Driving-distance discovery.** V1 uses straight-line geospatial distance only.
- **iCal RRULE schedule patterns.** V1 supports simple weekly patterns only.
- **Native mobile apps.** Web-only in V1 (FCM is used for push to the web client).

---

## ❓ Open Questions / To Revisit

Smaller items identified in review but not yet decided. Suggested resolutions included:

- **Multi-admin governance** — can admins remove each other? Suggested: yes, any admin can remove another, but not the last remaining admin. Final admin can only be replaced by inviting another first.
- **Review eligibility with "excused" attendance** — does excused count as having attended for purposes of unlocking reviews? Suggested: present only counts, excused and absent do not.
- **Subject taxonomy ownership** — who curates and extends the platform-managed subject list? Suggested: a platform super-admin role, out of the V1 role set.
- **Center registration verification** — any admin approval flow before a new center is live, or self-serve? Suggested: self-serve for V1, but flag for abuse.
- **Data retention** — when a student's account is deleted, what happens to their attendance, grades, payments (financial records), and reviews? Suggested: anonymize personal fields, retain financial and academic records for the center's legal and historical needs.
- **Audit log surface** — the data model captures "who did what" (attendance admin, payment admin, grade teacher, etc.), but is there a unified admin-facing audit log UI in V1? Suggested: no dedicated UI in V1; surface per-entity in detail views.
