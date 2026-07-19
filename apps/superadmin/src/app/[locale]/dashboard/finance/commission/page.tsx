import { CommissionSettingsScreen } from "@/features/settings/commission-settings-screen";

export const metadata = { title: "Commission | Edura Back-office" };

export default function FinanceCommissionPage() {
  return <CommissionSettingsScreen readOnly />;
}
