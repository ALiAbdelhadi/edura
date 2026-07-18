import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3002").replace(
  /\/$/,
  "",
);

const PUBLIC_PATHS = ["", "/login", "/register", "/forgot-password"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${BASE_URL}/${routing.defaultLocale}${path}`,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          `${BASE_URL}/${locale}${path}`,
        ]),
      ),
    },
  }));
}
