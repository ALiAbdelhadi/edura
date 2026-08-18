import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Section, SectionTitle } from "@/components/section";

export function Integrity({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <Section id="integrity" label={t.integrity.label} locale={locale}>
      <SectionTitle>{t.integrity.title}</SectionTitle>

      <div className="mt-12 grid gap-x-14 sm:grid-cols-2">
        {t.integrity.entries.map((entry) => (
          <article key={entry.title} className="border-t border-rule py-7">
            <h3 className="display text-[1.125rem] leading-snug text-ink">
              {entry.title}
            </h3>
            <p className="mt-3 max-w-[48ch] text-[0.9375rem] leading-[1.75] text-ink-2">
              {entry.detail}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
