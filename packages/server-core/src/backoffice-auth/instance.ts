import type { AdminAuth } from "./create-auth";

// The one back-office better-auth instance the session reader uses. The host
// builds it with createAdminAuth (the Next app adds nextCookies(); a service adds
// its own cookie plugin) and registers it here at module load, before any
// session read. Separate from erp-auth/instance.ts on purpose: two doors, two
// instances, and no reader ever falls through to the other.
let instance: AdminAuth | null = null;

export function setAdminAuth(auth: AdminAuth): void {
  instance = auth;
}

export function adminAuth(): AdminAuth {
  if (!instance) throw new Error("Back-office auth instance not registered — call setAdminAuth first");
  return instance;
}
