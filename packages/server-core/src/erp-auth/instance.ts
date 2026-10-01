import type { ErpAuth } from "./create-auth";

// The one better-auth instance the session reader uses. The host builds it with
// createErpAuth (the Next app adds nextCookies(); a service adds nothing) and
// registers it here at module load, before any session read.
let instance: ErpAuth | null = null;

export function setErpAuth(auth: ErpAuth): void {
  instance = auth;
}

export function erpAuth(): ErpAuth {
  if (!instance) throw new Error("ERP auth instance not registered — call setErpAuth first");
  return instance;
}
