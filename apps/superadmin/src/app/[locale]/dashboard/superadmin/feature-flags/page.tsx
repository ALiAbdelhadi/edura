import { localizedTitle } from "@/lib/i18n/page-metadata";
import { FeatureFlagsScreen } from "@/features/admin/feature-flags-screen";

export const generateMetadata = localizedTitle("featureFlags");

export default function FeatureFlagsPage() {
  return <FeatureFlagsScreen />;
}
