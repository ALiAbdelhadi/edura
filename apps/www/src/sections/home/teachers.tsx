import { Arrow } from "@/components/arrow";
import { Section, SectionBody, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { appUrl } from "@/lib/app-origin";
import { subjectMeta } from "@/lib/catalog";

import { TeacherCards } from "./teacher-cards";

// Sample teachers as cards. They are illustrations, said so under the grid:
// real teachers, names and times only exist inside an account.
export function Teachers({ t, locale }: { t: Messages; locale: Locale }) {
  const s = t.teachers;
  const items = s.items.map((item) => {
    const subject = subjectMeta(item.subject);
    return {
      ...item,
      category: subject.category,
      terms: [item.role, item.grade, item.when, s.modes[item.mode], subject.terms].join(" "),
    };
  });

  return (
    <Section id="teachers">
      <div data-reveal="" className="max-w-[40rem]">
        <SectionTitle>{s.title}</SectionTitle>
        <SectionBody>{s.lede}</SectionBody>
      </div>

      <div data-reveal="">
        <TeacherCards t={s} cards={t.cards} locale={locale} items={items} />
      </div>

      <div
        data-reveal=""
        className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="t-meta max-w-[56ch]">{s.note}</p>
        <a href={appUrl(locale, "/register?role=student")} className="btn btn-pen shrink-0">
          {s.cta}
          <Arrow />
        </a>
      </div>
    </Section>
  );
}
