import { localizedTitle } from "@/lib/i18n/page-metadata";
import { CentersScreen } from "@/features/admin/centers-screen";

export const generateMetadata = localizedTitle("centers");

export default function SuperadminCentersPage() {
  return <CentersScreen />;
}
