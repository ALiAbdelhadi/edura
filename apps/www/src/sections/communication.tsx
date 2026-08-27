import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Section, SectionBody, SectionTitle } from "@/components/section";

export function Communication({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <Section id="communication" label={t.communication.label} locale={locale}>
      <SectionTitle>{t.communication.title}</SectionTitle>
      <SectionBody>{t.communication.body}</SectionBody>
      <div className="mt-12 grid gap-x-14 sm:grid-cols-2">
        {t.communication.entries.map((entry) => (
          <article key={entry.title} className="border-t border-rule py-7">
            <h3 className="display text-[1.125rem] leading-snug text-ink">{entry.title}</h3>
            <p className="mt-3 max-w-[48ch] text-[0.9375rem] leading-[1.75] text-ink-2">
              {entry.detail}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
