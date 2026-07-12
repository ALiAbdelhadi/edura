# Frontend Gap Plan — Post-Refine Migration

> Written after completing the Refine v5 + Ant Design 5 migration.
> Goal: wire all existing backend APIs to real frontend screens and remove mock-data fallbacks.

---

## 1. Current State

- **20 screens** migrated from DaisyUI/Zustand to Refine + Ant Design.
- **Build & typecheck pass.**
- **Backend APIs exist** for most V1 features, but several have no frontend screen.
- **Mock data still present** in some dashboards and the Messages screen.

---

## 2. Missing Screens (Backend API → Frontend Gap)

### Priority 1 — Core Business Flows

| # | Feature | Backend Routes | Screen Needed | Role |
|---|---------|---------------|---------------|------|
| 1 | **Enrollment Requests** | `GET/POST /enrollment-requests`, `POST /:id/approve\|decline` | `AdminEnrollmentRequestsScreen` | Admin |
| 2 | **Rooms Management** | `GET/POST /rooms`, `PUT/DELETE /rooms/:id` | `AdminRoomsScreen` | Admin |
| 3 | **Materials** | `GET/POST /materials`, `GET /:id/download`, `DELETE /:id` | `TeacherMaterialsScreen` + `StudentMaterialsScreen` | Teacher / Student / Parent |

### Priority 2 — User Features

| # | Feature | Backend Routes | Screen Needed | Role |
|---|---------|---------------|---------------|------|
| 4 | **Notifications Inbox** | `GET /notifications`, `POST /:id/read`, `POST /read-all` | `NotificationsScreen` (replaces Messages) | All |
| 5 | **Parent-Student Linking** | `GET/POST /parent-links`, `POST /me/family-code/rotate` | `ParentLinkingScreen` + `StudentFamilyCodeScreen` | Parent / Student |
| 6 | **Reviews** | `GET/POST /reviews`, `PUT/DELETE /reviews/:id` | `StudentReviewsScreen` + `TeacherReviewsScreen` | Student / Teacher |

### Priority 3 — Cleanup

| # | Task | Details |
|---|------|---------|
| 7 | Remove `MessagesScreen` mock data | Replace with Notifications inbox or delete (chat is V2 per spec) |
| 8 | Remove dashboard mock fallbacks | `AdminDashboard`, `StudentDashboard`, `TeacherDashboard` — drop `MOCK_*` fallbacks |
| 9 | Remove `palette` from `mockData.ts` | Compute chart colors dynamically or from a tiny utility |
| 10 | Add `enrollment-requests` to `dataProvider.ts` resource map | Maps to `enrollment-requests` REST path |

---

## 3. Technical Patterns

### Screen Structure
Follow the established pattern:
```tsx
"use client";
import { useList, useUpdate, useDelete } from "@refinedev/core";
import { Table, Card, Tag, Button, Space, Statistic, Row, Col } from "antd";

export function SomeScreen() {
  const { query, result } = useList({ resource: "some-resource" });
  const items = (result?.data ?? []) as any[];
  // ... render
}
```

### Page Wiring
```tsx
// app/dashboard/admin/some-feature/page.tsx
"use client";
import { AdminSomeFeatureScreen } from "@/components/screens/AdminSomeFeatureScreen";
export default function Page() { return <AdminSomeFeatureScreen />; }
```

### Layout Nav Items
Update `app/dashboard/{role}/layout.tsx` navItems array:
```tsx
{ href: "/dashboard/admin/enrollment-requests", icon: "bell", label: "Requests" },
```

### Data Provider Resources
Add to `lib/refine/dataProvider.ts` `RESOURCE_MAP`:
```ts
"enrollment-requests": "enrollment-requests",
"rooms": "rooms",
"materials": "materials",
"notifications": "notifications",
"parent-links": "parent-links",
"reviews": "reviews",
```

---

## 4. Acceptance Criteria per Screen

### AdminEnrollmentRequestsScreen
- [ ] Table lists all enrollment requests for admin's center
- [ ] Columns: student name/email, course title, status, submitted date, expires date
- [ ] Filter by status (pending, approved, declined, expired)
- [ ] **Approve** action with capacity check handled by backend
- [ ] **Decline** action with optional reason input
- [ ] Auto-expiry handled (backend lazy-expiry on read)
- [ ] Statistics cards: Total Pending, Approved Today, Declined

### AdminRoomsScreen
- [ ] Table of rooms with name, capacity, location/notes
- [ ] Add room modal with Form
- [ ] Edit room inline or modal
- [ ] Delete room with confirmation

### TeacherMaterialsScreen
- [ ] List materials grouped by course
- [ ] Upload material modal: select course, title, file upload
- [ ] Delete material with confirmation
- [ ] Download link (backend returns signed URL)

### StudentMaterialsScreen
- [ ] List materials for enrolled courses only
- [ ] Download button per material

### NotificationsScreen
- [ ] List notifications with title, body, read/unread status, timestamp
- [ ] Mark individual as read
- [ ] Mark all as read
- [ ] Unread badge count in layout header

### ParentLinkingScreen
- [ ] Parent: enter family code to link
- [ ] Parent: view linked children, unlink option
- [ ] Parent: pending link requests (approve/reject)

### StudentFamilyCodeScreen
- [ ] Display current family code
- [ ] Rotate family code button

### StudentReviewsScreen
- [ ] List teachers eligible for review (at least one present attendance)
- [ ] Submit review: rating (1-5), comment
- [ ] Edit own review
- [ ] View teacher's reviews

---

## 5. Build Order

1. **Enrollment Requests** (highest business value)
2. **Rooms** (simplest CRUD, quick win)
3. **Materials** (teacher upload + student download)
4. **Notifications Inbox** (replaces Messages mock)
5. **Parent-Student Linking**
6. **Reviews**
7. **Cleanup** — remove mock fallbacks, delete MessagesScreen
