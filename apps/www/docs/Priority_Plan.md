# Edura — Priority Plan

> Last updated: 2026-05-09
> Context: Post Refine + Ant Design migration. All 4 portals are wired end-to-end. Build and typecheck pass. This document prioritizes the remaining work to take the project from "migrated" to "shippable v1".
>
> **Progress:** Tier 0 (1–4) ✅ · Tier 1 (5–7) ✅ · Tier 2 #9 ✅ · Tier 2 #10 ✅. Remaining: Tier 2 #8 (Playwright).

---

## Tier 0 — Demo-critical (ship this week)

User-visible breakage. Without these the demo looks unfinished.

| # | Item | Effort | Why now |
|---|------|--------|---------|
| 1 | **Resolve Messages screen** — either delete nav entries + screen, or stub a "Coming soon" empty state | XS (1–2h) | Pure mock data is the most obvious broken thing across all 4 portals |
| 2 | **Verify mock fallbacks removed** from `AdminDashboard` / `StudentDashboard` / `TeacherDashboard` (per Frontend Gap Plan #8) | XS (1h) | Dashboards silently render fake numbers on API failure → demo lies |
| 3 | **Seed completeness check** — confirm `EnrollmentRequest`, `Notification`, `ParentStudentLink`, `AttendanceRecord` rows exist; add what's missing | S (2–3h) | New screens are empty without these → looks broken |
| 4 | **Smoke-test each portal in browser** end-to-end with seeded creds; file bugs for anything red | S (2h) | We've never verified the migration outcome; cheap insurance |

---

## Tier 1 — Functional gaps blocking real use (next sprint)

Features the platform claims to support but you can't actually do from the UI.

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 5 | **Teacher per-session attendance UI** — list students for a session, mark present/absent/late, save | M (1d) | API exists (`POST /sessions/:id/attendance`); without this, teachers can't take attendance from the UI at all |
| 6 | **Admin Expenses screen** — list/create/edit/delete | S (½d) | Mirrors Fees screen pattern; needed for accurate net-profit reporting |
| 7 | **Teacher affiliation invite acceptance** — landing page from email link | S (½d) | Otherwise invited teachers can't onboard |

---

## Tier 2 — Hardening

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 8 | **Playwright smoke suite** — login + happy-path per portal (4 specs) | M (1d) | Catches regressions; we only have Newman API tests today |
| 9 | **Parent–child authorization fix** — validate `studentId` in `GET /me/attendance` belongs to the parent | XS (30m) | Security: any parent can currently fetch any student's attendance |
| 10 | **Drop dead code** — `lib/mockData.ts`, palette imports, unused stores from pre-Refine era | S (2h) | Reduces confusion |

---

## Tier 3 — Defer to V2

Don't build now unless a customer asks.

- Center self-registration / admin onboarding flow (`POST /auth/register/center`, `/centers/me/admins`)
- Search/discovery screens (`/search/centers|courses|teachers`) — only matters for a multi-center marketplace
- Real Messages / threads API + UI (chat is V2 per spec)
- Push notification device-token management UI

---

## Suggested execution order

| Week | Focus | Items |
|---|---|---|
| **Week 1** | Demo lock-in | Tier 0 — items 1, 2, 3, 4 (in order). Green smoke pass by end of week. |
| **Week 2** | Functional close-out | Tier 1 — items 5, 6, 7. After this every nav item works and every core daily task can be done in the UI. |
| **Week 3** | Hardening | Tier 2 — items 8, 9, 10. Project becomes shippable v1; regressions caught; known security gap closed. |
| **Backlog** | Deferred | Tier 3 stays parked until a product driver arrives. |

---

## Cross-references

- `docs/Frontend_Gap_Plan.md` — original post-migration gap analysis
- `docs/testing-and-gaps.md` — detailed API/UI mismatch list and manual test cases
- `docs/RUNBOOK.md` §12 — Known Gaps & Deferred Work
