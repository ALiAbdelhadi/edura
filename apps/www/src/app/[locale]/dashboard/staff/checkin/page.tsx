"use client";
// Reuses the center check-in screen — all its endpoints (checkin/lookup/suggest,
// subscriptions, walk-in, wallet-topup) are receptionist-allowed via center-actor.
import { AdminCheckinScreen } from "@/features/admin/admin-checkin-screen";
export default function Page() {
  return <AdminCheckinScreen />;
}
