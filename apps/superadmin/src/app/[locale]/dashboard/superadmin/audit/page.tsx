import { localizedTitle } from "@/lib/i18n/page-metadata";
import { AuditLogScreen } from "@/features/admin/audit-log-screen";

export const generateMetadata = localizedTitle("auditLog");

export default function AuditLogPage() {
  return <AuditLogScreen />;
}
