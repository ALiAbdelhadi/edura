import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { ROLE_SLUGS, getRolePage } from "@/i18n/roles";

import { Wordmark } from "./mark";

export function SiteFooter({ t, locale }: { t: Messages; locale: Locale }) {
  const columns = [
    {
      heading: t.roles.label,
      links: ROLE_SLUGS.map((slug) => ({
        label: getRolePage(locale, slug).label,
        href: `/${locale}/for/${slug}`,
      })),
    },
    {
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
        { label: t.footer.links.privacy, href: `/${locale}/privacy` },
        { label: t.footer.links.terms, href: `/${locale}/terms` },
      ],
    },
  ];

  return (
    <footer className="wrap">
      <div className="border-t border-rule pt-14 pb-10 md:pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_repeat(4,auto)] lg:gap-14">
          <div>
            <Wordmark locale={locale} />
            <p className="t-meta mt-4 max-w-[34ch]">{t.footer.tagline}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:contents">
            {columns.map((col) => (
              <nav key={col.heading} aria-label={col.heading}>
                <p className="text-[0.875rem] font-medium text-ink">{col.heading}</p>
                <ul className="mt-4 flex flex-col gap-2.5 text-[0.9375rem] [@media(pointer:coarse)]:gap-0">
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

        <p className="t-meta mt-14 border-t border-rule pt-6">
          <span className="figure">2026</span> {locale === "ar" ? "«لينكتك»" : "Linktich"} · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
