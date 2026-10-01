import { registerAfterScheduler as register } from "@repo/service-kit/after";

export function registerAfterScheduler(): void {
  register("[admin-api]");
}
