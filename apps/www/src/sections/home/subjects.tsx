import { Section, SectionBody, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { appUrl } from "@/lib/app-origin";
import { gradesByGroup, subjectsByGroup } from "@/lib/catalog";

import { SubjectCards } from "./subject-cards";

// Every subject as a card, one stage at a time.
export function Subjects({ t, locale }: { t: Messages; locale: Locale }) {
  const s = t.subjects;

  return (
    <Section id="subjects">
      <div data-reveal="" className="max-w-[40rem]">
        <SectionTitle>{s.title}</SectionTitle>
        <SectionBody>{s.lede}</SectionBody>
      </div>

      <div data-reveal="" className="mt-10">
        <SubjectCards
          t={t.cards}
          locale={locale}
          groups={subjectsByGroup(locale)}
          grades={gradesByGroup(locale)}
          initial="general-secondary"
          registerHref={appUrl(locale, "/register?role=student")}
        />
      </div>
    </Section>
  );
}
