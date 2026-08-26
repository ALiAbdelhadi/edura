"use client";
// Managers are authorized for the full collaboration set at the API layer —
// `delegatedWithCenter(..., { staffAllow: MANAGER })` covers GET, POST, accept,
// reject and cancel — but the staff portal had no surface for it, so the
// capability was reachable only by a card that went nowhere. Same panel the
// center admin renders inside /dashboard/admin/teachers.
//
// Receptionists and accountants never see this route: it is in the MANAGER
// branch of `navForRole`, and the API refuses the other two tiers.
//
// THE KNOWN GAP RECORDED HERE IS CLOSED. This route had no sidebar entry and,
// once the de-duplication pass deleted the manager card grid that used to link
// to it, no inbound link anywhere in the app — so a capability that tier is
// fully authorised for was reachable only by typing the URL, and a teacher's
// request to this centre could sit unanswered with nobody able to find it.
// It now has a nav row (and therefore a phone-bar slot, since the bar is
// derived from that array) via a `nav.collaborationRequests` row in
// dashboard-shell.tsx's NAV_KEY table. That key is deliberately NEW:
// `nav.affiliations` ("الانتسابات") is the superseded name collaboration
// requests replaced, so reusing it would have put a retired term back in the
// sidebar.
import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
export default function Page() {
  return <CollaborationPanel role="center" />;
}
