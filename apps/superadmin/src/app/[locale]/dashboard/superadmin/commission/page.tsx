import { localizedTitle } from "@/lib/i18n/page-metadata";
import { CommissionSettingsScreen } from "@/features/settings/commission-settings-screen";

export const generateMetadata = localizedTitle("commission");

export default function SuperadminCommissionPage() {
  return <CommissionSettingsScreen readOnly={false} />;
}
