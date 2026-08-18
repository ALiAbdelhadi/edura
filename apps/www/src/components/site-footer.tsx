import Link from "next/link";

import type { Messages } from "@/i18n/messages";
import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import { ROLE_SLUGS, getRolePage } from "@/i18n/roles";
import { Wordmark } from "./mark";

/**
 * THE FOOTER IS THE SITE'S COMPLETE INDEX — that is its job, and it is the
 * only surface that has one. The header shows what fits; this shows
 * everything, which is why `tools/verify.ts` asserts that every public route
 * except the landing appears here.
 */
export function SiteFooter({ t, locale }: { t: Messages; locale: Locale }) {
  const columns = [
    {
      /* DERIVED FROM `ROLE_SLUGS`, not typed out.

         The hand-written version listed three of the five role pages — the
         student and assistant pages were in the nav and in the sitemap and
         reachable from the landing, and missing from the site's own index. It
         also carried its own copies of their labels, and they were the SAME
         STRINGS as the pages' own (`footer.links.centers` was "للسناتر", and
         so is `getRolePage(…, "center").label`). Two ways to go wrong, both
         closed by reading the one table the nav already reads: a sixth role
         appears here the day it exists, under the name its own page uses. */
      heading: t.roles.label,
      links: ROLE_SLUGS.map((slug) => ({
        label: getRolePage(locale, slug).label,
        href: `/${locale}/for/${slug}`,
      })),
    },
    {
      /* "الشركة / Company" used to head this column, and once `/contact`
         landed beside pricing, the FAQ and the guarantees it had become a
         catch-all with a heading true of exactly one of its four items. A
         price list is not a company page. Split by what the reader is
         actually after: what the platform is and costs, versus getting an
         answer out of us. */
      heading: t.footer.platform,
      links: [
        { label: t.footer.links.pricing, href: `/${locale}/pricing` },
        { label: t.footer.links.trust, href: `/${locale}/trust` },
      ],
    },
    {
      heading: t.footer.help,
      links: [
        { label: t.footer.links.faq, href: `/${locale}/faq` },
        { label: t.footer.links.contact, href: `/${locale}/contact` },
      ],
    },
    {
      heading: t.footer.legal,
      links: [
        // BOTH legal pages are this site's own. `/terms` pointed at the product
        // app for as long as no local copy existed; one exists now, and a public
        // legal link must not bounce a signed-out reader into the app to read it.
        { label: t.footer.links.privacy, href: `/${locale}/privacy` },
        { label: t.footer.links.terms, href: `/${locale}/terms` },
      ],
    },
  ];

  return (
    <footer className="border-t border-rule">
      <div className="mx-auto w-full max-w-[87.5rem] px-6 py-10 md:px-10 md:py-14">
        {/* One `auto` per link column at `lg`, so the brand block takes the
            slack and each column stays as wide as its longest label rather
            than being stretched to an equal fifth. */}
        <div className="grid gap-10 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:gap-14">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-[34ch] text-[0.875rem] leading-relaxed text-ink-3">
              {t.footer.tagline}
            </p>
          </div>

          {/* `lg:contents` — the wrapper exists ONLY to grid the four columns
              on small screens, and at `lg` it removes itself from layout so
              they become direct children of the row above, beside the brand.
              Without it the two layouts could not share one set of markup.

              It earns its place below `lg`: stacked one per row, four columns
              of which three hold two links each ran the footer to ~790px on a
              390px phone — most of it the gap between a two-item list and the
              next heading. Two columns halves that. */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:contents">
            {columns.map((col) => (
              <nav key={col.heading}>
                <Eyebrow locale={locale} tone="gold">{col.heading}</Eyebrow>
                {/* `flex` + `gap`, not `space-y`: the gap is what collapses on
                    a touch device so the 44px rows below do not add their
                    padding on top of a margin and stretch the column. */}
                <ul className="mt-4 flex flex-col gap-2.5 text-[0.875rem] [@media(pointer:coarse)]:gap-0">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="rule-link rule-link-row">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* The legal entity line belongs here and is not written yet. It is a
            code comment rather than a visible "[pending]" chip: a placeholder
            on a public page is worse than its absence. */}
        {/* TODO(legal): registered entity name, commercial register no., tax card no. */}

        <p className="mt-12 border-t border-rule pt-6 text-[0.8125rem] text-ink-3">
          <span className="figure">2026</span> Edura · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
