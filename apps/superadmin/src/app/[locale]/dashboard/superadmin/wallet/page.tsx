import { localizedTitle } from "@/lib/i18n/page-metadata";
import { WalletSettingsScreen } from "@/features/settings/wallet-settings-screen";

export const generateMetadata = localizedTitle("walletPolicy");

export default function SuperadminWalletPolicyPage() {
  return <WalletSettingsScreen />;
}
