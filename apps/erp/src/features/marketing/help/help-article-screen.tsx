import { Container } from "@/components/kit/container";
import { Eyebrow } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/lib/i18n";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getTranslations } from "next-intl/server";
import { MarketingShell } from "../marketing-shell";
import styles from "../marketing.module.css";
import { TrackedCta } from "../tracked-cta";
import { articlesInCategory, findArticle } from "./articles";
import { loadArticle, loadArticleMeta } from "./load";
import { helpMdxComponents } from "./mdx-components";
import { HelpArticleView } from "./help-article-view";

const RELATED_LIMIT = 4;

export async function HelpArticleScreen({
  locale,
  slug,
}: {
  locale: Locale;
  slug: string;
}) {
  const t = await getTranslations("marketing");
  const meta = findArticle(slug);
  if (!meta) return null; // the route calls notFound() before reaching here

  const article = await loadArticle(locale, slug);
  const rtl = locale === "ar";
  const BackArrow = rtl ? ArrowRight : ArrowLeft;

  const siblings = articlesInCategory(meta.category);
  const at = siblings.findIndex((a) => a.slug === slug);
  const related = await Promise.all(
    Array.from({ length: Math.min(RELATED_LIMIT, siblings.length - 1) }, (_, i) =>
      loadArticleMeta(locale, siblings[(at + 1 + i) % siblings.length]!.slug),
    ),
  );

  return (
    <MarketingShell active="/help">
      <Container className="py-10 sm:py-14">
        <div className="mx-auto max-w-[46rem]">
          <Link
            href="/help"
            className="inline-flex items-center gap-2 text-[13px] transition-colors hover:text-(--indigo)"
            style={{ color: "var(--ink-2)" }}
          >
            <BackArrow className="size-4" aria-hidden />
            {t("help.backToHelp")}
          </Link>

          <div className="mt-6">
            <Eyebrow>{t(`help.categories.${meta.category}`)}</Eyebrow>
            <h1
              className="mt-2 text-[1.75rem] font-extrabold sm:text-[2.125rem]"
              style={{ color: "var(--ink)", letterSpacing: "-0.025em", lineHeight: 1.2 }}
            >
              {article.title}
            </h1>
            {article.summary ? (
              <p className={`${styles.lead} mt-4`} style={{ color: "var(--ink-2)" }}>
                {article.summary}
              </p>
            ) : null}
          </div>

          <hr className="my-8" style={{ border: 0, borderTop: "1px solid var(--rule)" }} />

          <HelpArticleView slug={slug} category={meta.category}>
            <div className={styles.prose}>
              <MDXRemote source={article.body} components={helpMdxComponents} />
            </div>
          </HelpArticleView>

          {related.length > 0 ? (
            <section className="mt-14">
              <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>
                {t("help.relatedTitle")}
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/help/${a.slug}`}
                      className={`${styles.cardMuted} block h-full transition-colors`}
                    >
                      <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                        {a.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className={`${styles.cardMuted} mt-10 text-center`}>
            <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>
              {t("help.stillStuck")}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ink-2)" }}>
              {t("help.stillStuckBody")}
            </p>
            <div className="mt-5 flex justify-center">
              <TrackedCta
                href="/contact"
                cta="contact"
                surface="help_article"
                className="px-7 py-2.5"
              >
                {t("nav.contact")}
              </TrackedCta>
            </div>
          </div>
        </div>
      </Container>
    </MarketingShell>
  );
}
