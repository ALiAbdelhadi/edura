import { authBaseUrl } from "../auth/auth-env";
export function appBaseUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base =
    process.env.APP_BASE_URL ||
    (vercel ? `https://${vercel}` : "") ||
    authBaseUrl() ||
    "http://localhost:3002";
  return base.replace(/\/+$/, "");
}
