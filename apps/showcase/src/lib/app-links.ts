/**
 * Links into the main app (apps/www).
 *
 * The showcase is deployed on its own subdomain (approved 2026-08-02), so
 * every sign-in / sign-up link is CROSS-ORIGIN and cannot be a next-intl
 * <Link>. It is a plain anchor to an absolute URL.
 *
 * The locale is carried across because www uses `localePrefix: "always"` too —
 * a visitor reading the Arabic showcase must not land on an English login page.
 */
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3002";

export function appUrl(path: string, locale: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${APP_ORIGIN}/${locale}${clean}`;
}

export const loginUrl = (locale: string) => appUrl("/login", locale);
export const registerUrl = (locale: string) => appUrl("/register", locale);
