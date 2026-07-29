import { routing } from "@/i18n/routing";
import { appBaseUrl } from "@repo/server-core/http/app-url";
import type { MetadataRoute } from "next";

const BASE_URL = appBaseUrl();

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
