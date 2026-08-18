import { AdminAuditScreen } from "@/features/admin/admin-audit-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("auditLog");

export default function AdminAuditPage() {
  return <AdminAuditScreen />;
}
