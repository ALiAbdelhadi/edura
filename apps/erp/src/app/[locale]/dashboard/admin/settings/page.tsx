import { AdminSettingsScreen } from "@/features/settings/portal-settings/admin";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("settings");

export default function Page() {
  return <AdminSettingsScreen />;
}
