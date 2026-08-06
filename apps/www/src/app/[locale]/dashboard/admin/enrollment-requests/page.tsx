import { AdminEnrollmentRequestsScreen } from "@/features/admin/admin-enrollment-requests-screen";
import { localizedTitle } from "@/lib/i18n/page-metadata";

export const generateMetadata = localizedTitle("enrollmentRequests");

export default function Page() {
  return <AdminEnrollmentRequestsScreen />;
}
