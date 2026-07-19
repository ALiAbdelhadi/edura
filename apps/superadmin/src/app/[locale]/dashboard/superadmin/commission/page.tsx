import { CommissionSettingsScreen } from "@/features/settings/commission-settings-screen";

export const metadata = { title: "Commission | Edura Back-office" };

export default function SuperadminCommissionPage() {
  return <CommissionSettingsScreen readOnly={false} />;
}
