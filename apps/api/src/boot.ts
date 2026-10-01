import { assertServiceBootEnv } from "@repo/service-kit/boot";
import { env } from "./env";

export function assertBootEnv(): void {
  assertServiceBootEnv({ isProduction: env.isProduction, proxySecret: env.proxySecret, secretVar: "NEXTAUTH_SECRET" });
}
