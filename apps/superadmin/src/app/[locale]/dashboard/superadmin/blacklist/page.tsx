import { localizedTitle } from "@/lib/i18n/page-metadata";
import { BlacklistScreen } from "@/features/admin/blacklist-screen";

export const generateMetadata = localizedTitle("blacklist");

export default function SuperadminBlacklistPage() {
  return <BlacklistScreen />;
}
