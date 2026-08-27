import { CollaborationPanel } from "@/features/collaboration/collaboration-panel";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("collaborationRequests");

export default function Page() {
  return <CollaborationPanel role="center" />;
}
