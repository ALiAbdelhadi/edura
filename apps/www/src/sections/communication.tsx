import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Section, SectionBody, SectionTitle } from "@/components/section";

/**
 * How the product reaches a human being.
 *
 * WHY THIS IS ONE SECTION AND NOT FOUR FEATURE BULLETS. Messaging, the
 * WhatsApp claim link and the Monday digest look like three unrelated
 * features and are one promise: nobody has to hand out a personal phone
 * number for this business to run. Split across the role pages they read as
 * plumbing; together they answer the question a parent actually asks, which
 * is who can talk to my child.
 *
 * PLACED BETWEEN Counter AND Integrity, and the order is the argument: the
 * counter section ends with a student walking through a door, this one says
 * how anyone reaches them afterwards, and Integrity then answers what stops
 * that reach being abused. Communication before guarantees, because a
 * guarantee about messaging means nothing to a reader who has not been told
 * there is messaging.
 *
 * Text-only, like `integrity.tsx`. Every claim here is a rule rather than a
 * screen, and a screenshot of a chat window would say less than the sentence.
 */
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
