import { SettingsScreen } from "@/features/settings/settings-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("settings");

export default function Page() {
  return <SettingsScreen />;
}
