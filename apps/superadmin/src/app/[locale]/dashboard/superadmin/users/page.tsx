import { localizedTitle } from "@/lib/i18n/page-metadata";
import { UsersScreen } from "@/features/admin/users-screen";

export const generateMetadata = localizedTitle("users");

export default function Page() {
  return <UsersScreen />;
}
