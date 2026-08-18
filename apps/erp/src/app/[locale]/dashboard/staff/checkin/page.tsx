import { AdminCheckinScreen } from "@/features/admin/admin-checkin-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("checkin");

// Reuses the center check-in screen — all its endpoints (checkin/lookup/suggest,
// subscriptions, walk-in, wallet-topup) are receptionist-allowed via center-actor.
export default function Page() {
  return <AdminCheckinScreen />;
}
