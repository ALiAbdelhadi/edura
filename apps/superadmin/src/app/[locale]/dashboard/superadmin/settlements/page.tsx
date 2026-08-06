import { localizedTitle } from "@/lib/i18n/page-metadata";
import { RoomSettlementsScreen } from "@/features/settlements/room-settlements-screen";

export const generateMetadata = localizedTitle("roomSettlements");

export default function SuperadminSettlementsPage() {
  return <RoomSettlementsScreen />;
}
