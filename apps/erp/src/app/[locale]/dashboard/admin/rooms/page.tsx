import { AdminRoomsScreen } from "@/features/admin/admin-rooms-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("rooms");

export default function Page() {
  return <AdminRoomsScreen />;
}
