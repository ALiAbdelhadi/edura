import { assertServiceBootEnv } from "@repo/service-kit/boot";
import { env } from "./env";

// The back office signs its sessions with SUPERADMIN_NEXTAUTH_SECRET, never
// the ERP's NEXTAUTH_SECRET (create-auth.ts falls back to it in dev only).
export function assertBootEnv(): void {
  assertServiceBootEnv({ isProduction: env.isProduction, proxySecret: env.proxySecret, secretVar: "SUPERADMIN_NEXTAUTH_SECRET" });
}
