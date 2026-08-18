import { localizedTitle } from "@/lib/i18n/page-metadata";
import { SuperAdminDashboard } from "@/features/admin/super-admin-dashboard";
import { SuperAdminFirstRun } from "@/features/tour/first-run";

export const generateMetadata = localizedTitle("overview");
export default function Page() {
  return (
    <>
      {/* First entry only: the guided tour offers itself once, then never again
          (user_prefs.tour_completed). Mounted here rather than inside the
          dashboard, whose early returns would hide it on a slow or empty
          first visit. */}
      <SuperAdminFirstRun />
      <SuperAdminDashboard />
    </>
  );
}
