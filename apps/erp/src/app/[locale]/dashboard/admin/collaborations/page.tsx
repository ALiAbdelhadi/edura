import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("collaborationRequests");

/**
 * طلبات التعاون — a DESTINATION, not a band on the Teachers page.
 *
 * This panel is a request inbox with two directions and five actions
 * (list, create, accept, reject, cancel). It was rendered inline at the top of
 * `/dashboard/admin/teachers`, which put a 1,058-line queue inside a 307-line
 * directory and pushed the teacher list below the fold on every device. Every
 * other queue in this portal — enrolment requests, the counter, off-system
 * gaps — is its own page, because a decision waiting on you is something you
 * navigate TO.
 *
 * Promoting it here also fixes the staff portal for free: the manager's route
 * at `/dashboard/staff/collaborations` had existed with no nav entry and no
 * inbound link since the de-duplication pass deleted the card grid that used
 * to point at it, so a capability that tier is fully authorised for
 * (`delegatedWithCenter(..., { staffAllow: MANAGER })`) was reachable only by
 * typing the URL. One `NAV_KEY` row unblocked both portals.
 *
 * NO HEADING HERE. The panel is a self-titled `<Card>` carrying its own title
 * and its own create action; a `PageHead` above it would be the same words
 * twice. Same shape as the staff route, deliberately.
 */
export default function Page() {
  return <CollaborationPanel role="center" />;
}
