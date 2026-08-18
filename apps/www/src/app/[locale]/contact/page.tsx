import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Button } from "@repo/ui/components/button";

import { ContactForm } from "@/components/contact-form";
import { PageFrame, PageHero } from "@/components/page-frame";
import { Section, SectionTitle } from "@/components/section";
import { appUrl } from "@/lib/app-origin";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

/**
 * CONTACT — a triage, then a form.
 *
 * The default contact page is one box that turns every question into the same
 * question, so somebody has to read all of them to find the urgent one. This
 * one names the three routes first, and TWO OF THEM ARE NOT THIS FORM: a
 * signed-in user is faster in the app (we already know who they are), and
 * anything about a specific student belongs with the center, which holds the
 * data and can verify who is asking.
 *
 * That is not deflection — it is the honest answer. A public form cannot
 * discuss a child's attendance with someone it cannot identify.
 */

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const c = getPages(locale).contact;

  return {
    title: c.meta.title,
    description: c.meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/contact`])),
    },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const c = getPages(locale).contact;

  return (
    <PageFrame locale={locale} t={t}>
      <PageHero locale={locale} label={c.label} headline={c.headline} lede={c.lede} note={c.note} />

      {/* ── The triage ──────────────────────────────────────────────────── */}
      <Section id="routes" label={c.routes.label} locale={locale}>
        <ol className="border-t border-rule">
          {c.routes.items.map((route, index) => (
            <li
              key={route.title}
              className="grid gap-3 border-b border-rule py-7 sm:grid-cols-[2.5rem_1fr] sm:gap-6"
            >
              {/* These ARE a sequence — try the app, then the center, then us
                  — so unlike most lists on this site they earn an order
                  marker. */}
              <span aria-hidden="true" className="figure text-[0.8125rem] text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h2 className="display text-[1.0625rem] leading-snug text-ink">{route.title}</h2>
                <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
                  {route.body}
                </p>
                {route.cta ? (
                  <div className="mt-5">
                    <Button asChild variant="gold" size="ledger" className="tap">
                      <a href={appUrl(locale, "/login")}>{route.cta}</a>
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Reach us ────────────────────────────────────────────────────
            A phone number and an address, because a business that publishes
            neither reads as one you cannot find. Both are PLACEHOLDERS today
            — see the note in `pages.ts` for why the digits are all zeros. */}
      <Section id="reach" label={c.reach.label} locale={locale}>
        <dl className="grid max-w-[62rem] gap-px border border-rule bg-rule sm:grid-cols-2">
          <div className="bg-sheet px-5 py-5 sm:px-6">
            <dt className="text-[0.8125rem] font-semibold text-ink-3">{c.reach.phoneLabel}</dt>
            {/* `dir="ltr"` and the figure face: a phone number is a Latin,
                LTR run, and inside an Arabic page the `+` migrates to the
                wrong end of it without the isolate. */}
            <dd className="figure mt-2 text-[1.0625rem] text-ink">{c.reach.phone}</dd>
          </div>
          <div className="bg-sheet px-5 py-5 sm:px-6">
            <dt className="text-[0.8125rem] font-semibold text-ink-3">{c.reach.addressLabel}</dt>
            <dd className="mt-2 text-[1.0625rem] text-ink">{c.reach.address}</dd>
          </div>
        </dl>
        <p className="mt-4 max-w-[58ch] text-[0.8125rem] text-ink-3">
          {c.reach.placeholderNote}
        </p>
      </Section>

      {/* ── The form, with the child-safety line ABOVE it ────────────────── */}
      <Section id="form" label={c.form.label} locale={locale}>
        <SectionTitle>{c.form.title}</SectionTitle>

        {/* Above the fields, not below them in small print. Most of this
            product's users are minors, and an open box invites somebody to
            paste a child's name and school into it. A warning under the send
            button is read after the sending. */}
        <div className="mt-8 max-w-[62rem] border border-rule bg-sheet p-6 sm:p-7">
          <h3 className="display text-[1.0625rem] leading-snug text-ink">{c.safety.title}</h3>
          <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-[1.75] text-ink-2">
            {c.safety.body}
          </p>
        </div>

        <div className="mt-10">
          <ContactForm locale={locale} copy={c.form} />
        </div>
      </Section>
    </PageFrame>
  );
}
