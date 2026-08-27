import Link from "next/link";

import type { Messages } from "@/i18n/messages";
import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
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
    <footer className="border-t border-rule">
      <div className="mx-auto w-full max-w-[87.5rem] px-6 py-10 md:px-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:gap-14">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-[34ch] text-[0.875rem] leading-relaxed text-ink-3">
              {t.footer.tagline}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:contents">
            {columns.map((col) => (
              <nav key={col.heading}>
                <Eyebrow locale={locale} tone="gold">{col.heading}</Eyebrow>
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

        <p className="mt-12 border-t border-rule pt-6 text-[0.8125rem] text-ink-3">
          <span className="figure">2026</span> Edura · {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
