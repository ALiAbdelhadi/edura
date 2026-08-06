import { localizedTitle } from "@/lib/i18n/page-metadata";
import { RegistrationsQueue } from "@/features/admin/registrations-queue";

export const generateMetadata = localizedTitle("registrations");
export default function Page() {
  return <RegistrationsQueue />;
}
