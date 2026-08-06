import { localizedTitle } from "@/lib/i18n/page-metadata";
import { SecurityScreen } from "@/features/security/security-screen";

export const generateMetadata = localizedTitle("security");
export default function Page() {
  return <SecurityScreen />;
}
