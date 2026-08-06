import { localizedTitle } from "@/lib/i18n/page-metadata";
import { DeletionQueueScreen } from "@/features/admin/deletion-queue-screen";

export const generateMetadata = localizedTitle("deletionQueue");

export default function DeletionRequestsPage() {
  return <DeletionQueueScreen />;
}
