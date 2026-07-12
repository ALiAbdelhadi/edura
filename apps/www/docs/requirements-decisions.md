# Edura — Requirements Decisions

> Session date: 2026-05-13
> Branch: `claude/identify-use-case-gaps-On8h3`
> Status: All P and B blocks decided. Ready for implementation.

---

## How to read this document

Each section maps to a decision block from the requirements-gathering session. Format:

```
Decision: [what was chosen]
Deferred: [what is explicitly out of scope for phase 1]
Risk: [flagged concern, not overriding the decision]
```

---

## P-blocks — Product decisions

### P1 — Roles & access

- Roles: **Admin, Teacher, Student, Parent**
- Hierarchy: Admin > Teacher > Student, Parent (Parent is lateral to Student, not above)
- Role assignment: Admin-only; Teachers cannot self-promote
- A single user account may hold multiple roles (e.g. a Teacher who is also a Parent)

### P2 — Course lifecycle

- States: `draft → published → archived`
- Only Admin and the owning Teacher can change state
- Archived courses remain readable (students keep access to historical content)
- `draft` courses are invisible to Students and Parents

### P3 — Enrolment flow

- Students self-enrol OR Admin/Teacher enrols them
- Parent can request enrolment on behalf of their linked child; requires Teacher or Admin approval
- Enrolment approval sends a notification to the student and parent

### P4 — Session / scheduling

- Sessions are live class instances attached to a course
- A Teacher creates sessions; Admin can edit or cancel any session
- Session states: `scheduled → live → completed → cancelled`
- Reminder notification fires 30 min before scheduled start (see B3)

### P5 — Assignments & submissions

- Assignments belong to a course; visible to enrolled students only
- Submission types supported: text, file upload (Cloudinary), link
- Late submissions allowed by default; Teacher may set a hard deadline that blocks submission
- Resubmission allowed until deadline or until graded

### P6 — Grading

- Grades are per-submission, per-student
- Grade types: numeric (0–100) or letter (A–F); configured per course by Teacher
- Grade visibility: student sees their own grade only; parent sees their linked child's grades
- Teacher can override a grade; override is logged (see B7 risk note)

### P7 — Payments

- Payment required before or at enrolment confirmation (configurable per course)
- Payment states: `pending → paid → failed → refunded`
- Payment gateway: determined by existing integration (not changed in this session)
- Receipts: generated on `paid` state transition; accessible from student/parent portal
- Refunds: Admin-only action

### P8 — Parent–child linking

- A Parent links to one or more Student accounts
- Link request initiated by Parent, approved by the Student (if adult) or Admin (if minor)
- Linked Parent inherits read access to child's grades, attendance, sessions, notifications
- Parent cannot act as the student (no submission, no enrolment self-service beyond P3)

### P9 — Attendance

- Attendance recorded per session per enrolled student
- States: `present`, `absent`, `late`, `excused`
- Teacher marks attendance; Admin can edit
- Attendance visible to: Teacher, Admin, the student, and linked Parent

### P10 — Content / materials

- Course materials (files, links, embeds) attached to a course or a specific session
- Upload via Cloudinary; link via URL
- Visible to enrolled students only; draft materials visible to Teacher and Admin

### P11 — Messaging / communication

- In-app direct messaging between: Teacher ↔ Student, Teacher ↔ Parent, Admin ↔ anyone
- Students cannot initiate a message to Admin directly (must go via Teacher)
- No group chat in phase 1; thread is one-to-one
- Deferred: broadcast messaging (covered by Admin notification broadcast in B3)

### P12 — Dashboard per role

- **Admin**: platform KPIs, enrolment totals, revenue, flagged items
- **Teacher**: my courses, upcoming sessions, pending grading, recent messages
- **Student**: my courses, upcoming sessions, recent grades, unread notifications
- **Parent**: child's courses, upcoming sessions, recent grades, linked-child switcher

### P13 — Profile & settings

- All users: avatar (Cloudinary), display name, contact email, password change
- Notification preferences stored under profile (per-event toggles, see B3)
- Admin can view and edit any profile; cannot change another Admin's password

### P14 — Search

- Global search bar in nav: searches courses, users (Admin/Teacher only), sessions
- Per-table search on all list pages (see B4)
- Search is server-side ILIKE / pg_trgm; no external search service

### P15 — Mobile / responsive

- Responsive first (flexbox/grid); no separate mobile app in phase 1
- Minimum supported viewport: 360 px wide
- Touch targets ≥ 44 px

### P16 — Theming

- Default Ant Design 5 token theme; single brand color override (`primary`)
- Dark mode: deferred to phase 2
- No per-tenant white-labelling in phase 1

### P17 — Localization

- English only in phase 1
- User-facing strings centralized in a single module (e.g. `lib/copy.ts`) so a future i18n library can be slotted in without touching every component
- Always English numerals and date formats (e.g. `Jan 5, 2026`, `1,234`)

### P18 — Data deletion / GDPR

- Soft-delete for users: `deleted_at` timestamp; data retained for 30 days then hard-purged
- Student can request account deletion; triggers Admin approval workflow
- Course data (grades, submissions) is anonymized on student hard-delete, not removed

### P19 — Accessibility

- Deferred from formal audit; opportunistic: semantic HTML, `alt` text on all images, keyboard-navigable interactive elements, `aria-label` on icon-only buttons
- Formal WCAG 2.1 AA audit scheduled as a follow-up phase item

---

## B-blocks — Technical/cross-cutting decisions

### B1 — Backend/UI field mismatches

- **Casing**: API responses stay `snake_case`; converted to `camelCase` at the fetch boundary via a single transform layer (not scattered across components)
- **Schema source of truth**: Zod schemas defined server-side, inferred TS types exported and shared with the UI via a shared types location (`types/`)
- **Nullability**: `null` = value is known to be absent; key omitted = field is not applicable. UI normalizes both to `undefined` after the transform
- **Enums**: shared constants in `lib/constants/` (or `types/enums.ts`); no magic strings on either side

### B2 — Auth

*(Decisions recorded in an earlier session; not restated here — see `docs/EduPlatform_Spec_v2.md`.)*

### B3 — Notifications & alerts

- **Delivery**: in-app notification bell with unread count only (no email, push, or SMS in phase 1)
- **Realtime**: WebSocket or SSE; polling fallback on disconnect
- **Triggers** (all roles receive relevant subset):
  - New assignment posted
  - Grade posted or updated
  - Session reminder (30 min before)
  - Admin broadcast
  - Payment due / payment received
  - Parent approval request
  - Enrolment status change (confirmed or rejected)
- **Preferences**: per-event toggles stored in `userPrefs`; no channel toggle needed (single channel)
- **Bundling**: same-type events within a 10-minute window are collapsed (e.g. "5 new grades posted")
- **Admin broadcast targeting**: by role, by course, or by specific user list
- **Retention**: auto-archive after 30 days; viewable in `/notifications` history

### B4 — Filters, search, sort

- **Filter UX**: unified `FilterBar` component used on all list pages; searchbox + facet chips + clear-all button
- **URL sync**: all filter and sort state reflected in URL query params (shareable, bookmarkable)
- **Search**: server-side ILIKE / `pg_trgm` on relevant text columns
- **Sort**: single-column, toggled by clicking column headers; sort state in URL
- **Saved views**: not built; URL bookmarks serve this need

### B5 — Permissions / RBAC

*(Decisions recorded earlier; not restated here.)*

### B6 — i18n / a11y

- See P17 and P19 above.

### B7 — Audit, observability, rate-limiting

- **Audit**: app logs only; no dedicated `audit_log` table in phase 1
- **Observability**: console logs only; host platform captures stdout
- **Rate limiting**: none at the app layer in phase 1 (host/proxy relied upon)
- **Retention**: 30 days for all logs

> **Risk flags (not overriding decisions):**
> 1. No audit table on a platform with payments, grades, parent approvals, and minors. If disputes arise there is no defensible actor/action/timestamp record. Minimum viable: log role changes, grade overrides, payment events, deletes.
> 2. Console-only logs do not survive container restarts on most hosts. Ensure the host platform ships stdout to durable log storage (Netlify, Vercel, Railway, etc. do this by default).
> 3. No app-level rate limiting leaves auth endpoints (login, password reset, parent-link request) open to brute-force and enumeration. A 5 req/min per-IP limit on `/api/auth/*` is a low-cost fix.
> 4. 30-day retention applied to payment records may conflict with tax/regulatory minimums (often 5–7 years). Payment records should be in a separate retention class even if the general log story stays minimal.

### B8 — Onboarding, help, docs

- **First login**: role-specific 3–4 step product tour, dismissible, stored as `userPrefs.tourCompleted`; re-launchable from the help menu
- **In-app help**: info popover (1–2 sentences) on each dashboard widget via an `(i)` icon
- **Empty-state CTAs**: role-aware actions on every empty list/dashboard:
  - Admin → "Add course" / "Invite user"
  - Teacher → "Schedule a session" / "Create assignment"
  - Student → "Browse courses"
  - Parent → "Link a child"
- **External docs**: internal only (`README.md`, `AGENTS.md`); no public docs site in phase 1

---

## Final — Export & reporting

- **Phase**: deferred to phase 2 entirely
- **Future format decisions** (logged for phase 2 planning): sync for small exports, async with in-app/email notification for large ones
- **TODO**: at the start of phase 2, decide: formats (CSV, XLSX, PDF, JSON), entry points (per-table, prebuilt reports, admin bulk, self-export)

---

## Open risk items (requires explicit decision to close)

| # | Area | Risk | Recommended action |
|---|------|------|--------------------|
| R1 | Audit | No audit trail for sensitive mutations | Add append-only `audit_log` for role changes, grade overrides, payment events, deletes |
| R2 | Observability | Console logs lost on container restart | Confirm host platform ships stdout to durable storage |
| R3 | Rate limiting | Auth endpoints unprotected at app layer | Add 5 req/min per-IP limit on `/api/auth/*` |
| R4 | Payment retention | 30-day retention may violate tax law | Create separate retention class for payment records |
| R5 | A11y | Formal WCAG audit deferred | Schedule before public launch |

---

## Deferred to phase 2

- Dark mode
- Per-tenant white-labelling
- Email / push / SMS notifications
- Saved filter views
- Full audit log table
- Structured logging + Sentry + OTel
- App-level rate limiting
- Export & reporting (all formats and entry points)
- Public documentation site
- Mobile native app
- Multi-language / i18n library
