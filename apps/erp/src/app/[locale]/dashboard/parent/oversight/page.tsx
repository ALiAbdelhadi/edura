import { OversightScreen } from "@/features/parent/oversight-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("childSafety");

export default function OversightPage() {
  return <OversightScreen />;
}
