import { localizedTitle } from "@/lib/i18n/page-metadata";
import { CollaborationRequestsScreen } from "@/features/collaboration/collaboration-requests-screen";

export const generateMetadata = localizedTitle("collaborations");

export default function SuperadminCollaborationsPage() {
  return <CollaborationRequestsScreen />;
}
