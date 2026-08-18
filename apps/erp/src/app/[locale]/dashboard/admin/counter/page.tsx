import { CenterCounterScreen } from "@/features/admin/counter/center-counter-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("checkin");

export default function AdminCounterPage() {
  return <CenterCounterScreen />;
}
