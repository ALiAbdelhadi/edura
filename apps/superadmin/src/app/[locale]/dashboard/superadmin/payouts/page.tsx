import { localizedTitle } from "@/lib/i18n/page-metadata";
import { PayoutsScreen } from "@/features/payouts/payouts-screen";

export const generateMetadata = localizedTitle("payouts");

export default function SuperadminPayoutsPage() {
  return <PayoutsScreen />;
}
