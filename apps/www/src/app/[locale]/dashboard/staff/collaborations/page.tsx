"use client";
// Managers are authorized for the full collaboration set at the API layer —
// `delegatedWithCenter(..., { staffAllow: MANAGER })` covers GET, POST, accept,
// reject and cancel — but the staff portal had no surface for it, so the
// capability was reachable only by a card that went nowhere. Same panel the
// center admin renders inside /dashboard/admin/teachers.
//
// Receptionists and accountants never see this route: the manager's card grid
// in CenterStaffPortalHome is the only link to it, and the API refuses them.
//
// KNOWN GAP: no sidebar entry, so DashboardShell falls back to the first nav
// item and titles the chrome "Overview". Adding an entry needs a NAV_KEY row in
// dashboard-shell.tsx (shared, not this session's to edit) — every existing key
// is wrong here: `nav.affiliations` ("الانتسابات") is the superseded name that
// collaboration requests replaced. Filed as a request; the panel labels itself
// correctly meanwhile.
import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
export default function Page() {
  return <CollaborationPanel role="center" />;
}
