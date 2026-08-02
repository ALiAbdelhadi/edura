import { HELP_ARTICLES, findArticle } from "@/features/marketing/help/articles";
import { HelpArticleScreen } from "@/features/marketing/help/help-article-screen";
import { loadArticleMeta } from "@/features/marketing/help/load";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/lib/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

/**
 * Every locale × slug is enumerated, so all 22 pages are prerendered at build
 * time. That is what makes the plain `fs` reads in help/load.ts safe: they run
 * on the build machine, never on a request.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    HELP_ARTICLES.map((a) => ({ locale, slug: a.slug })),
  );
}

/** An unknown slug is a 404, not an empty page. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!findArticle(slug)) return {};
  const { title, summary } = await loadArticleMeta(locale as Locale, slug);
  return {
    title: `${title} — Edura`,
    description: summary,
    alternates: {
      canonical: `/${locale}/help/${slug}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/help/${slug}`])),
    },
  };
}

export default async function HelpArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!findArticle(slug)) notFound();
  setRequestLocale(locale as Locale);
  return <HelpArticleScreen locale={locale as Locale} slug={slug} />;
}
