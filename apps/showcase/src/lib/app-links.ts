const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3002";

export function appUrl(path: string, locale: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${APP_ORIGIN}/${locale}${clean}`;
}

export const loginUrl = (locale: string) => appUrl("/login", locale);
export const registerUrl = (locale: string) => appUrl("/register", locale);
