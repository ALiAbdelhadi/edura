import { appBaseUrl } from "@repo/server-core/http/app-url";

/**
 * Where ERP-facing links minted by the back office point. Its own variable
 * because the deploy runbook overrides APP_BASE_URL on this project with the
 * back office's own host, so every generic resolver here answers "this app".
 * Throws in production rather than misdirecting a credential.
 */
export function erpBaseUrl(): string {
  const explicit = process.env.ERP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ERP_BASE_URL is required in production on apps/superadmin (it is where a 'view as' handoff is posted and where ERP users' reset links point; APP_BASE_URL here is this app's own host)",
    );
  }
  return appBaseUrl().replace(/\/+$/, "");
}
