import { localizedTitle } from "@/lib/i18n/page-metadata";
import { CatalogAdminScreen } from "@/features/admin/catalog/catalog-admin-screen";

export const generateMetadata = localizedTitle("catalog");
export default function Page() {
  return <CatalogAdminScreen />;
}
