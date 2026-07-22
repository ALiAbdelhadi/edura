"use client";
import { CenterStaffScreen } from "@/features/admin/center-staff-screen";
// Owner-only staff management (create/role/deactivate). The API is gated to
// center_admin — staff can never reach it (hard exclusion #4).
export default function Page() {
  return <CenterStaffScreen />;
}
