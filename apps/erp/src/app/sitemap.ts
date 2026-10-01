import { HELP_ARTICLES } from "@/features/marketing/help/articles";
import { MARKETING_LINKS } from "@/features/marketing/nav";
import { routing } from "@/i18n/routing";
import { serviceGet } from "@/lib/server/service-fetch";
import { appBaseUrl } from "@repo/shared/app-url";
import type { MetadataRoute } from "next";

const BASE_URL = appBaseUrl();

const AUTH_PATHS = ["/login", "/register", "/forgot-password"];

function entry(path: string, priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE_URL}/${routing.defaultLocale}${path}`,
    priority,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `${BASE_URL}/${locale}${path}`]),
      ),
    },
  };
}

async function publicHandleEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const { data } = await serviceGet<{ handle: string; updatedAt: string }[]>(
      "/api/v1/public/sitemap-handles",
      undefined,
      { anonymous: true },
    );
    if (!data) return [];
    return data.map((r) => ({
      ...entry(`/p/${r.handle}`, 0.7),
      lastModified: new Date(r.updatedAt),
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    ...MARKETING_LINKS.filter((l) => l.inSitemap).map((l) =>
      entry(l.href, l.href === "" ? 1 : 0.8),
    ),
    ...HELP_ARTICLES.map((a) => entry(`/help/${a.slug}`, 0.6)),
    ...AUTH_PATHS.map((p) => entry(p, 0.5)),
    ...(await publicHandleEntries()),
  ];
}