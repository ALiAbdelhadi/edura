import { StaffSettingsScreen } from "@/features/settings/portal-settings/staff";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("settings");

export default function Page() {
  return <StaffSettingsScreen />;
}
