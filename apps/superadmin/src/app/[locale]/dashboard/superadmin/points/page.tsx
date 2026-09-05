import { localizedTitle } from "@/lib/i18n/page-metadata";
import { PointsRulesScreen } from "@/features/admin/points-rules-screen";

export const generateMetadata = localizedTitle("points");

export default function SuperadminPointsPage() {
  return <PointsRulesScreen />;
}
