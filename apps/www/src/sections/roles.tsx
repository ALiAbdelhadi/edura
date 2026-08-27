import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import Link from "next/link";
import { Eyebrow } from "@repo/ui/components/eyebrow";

import { RolePlate, type RoleEntry } from "@/components/role-plate";
import { Section, SectionTitle } from "@/components/section";
import { ROLE_SLUGS, getRolePage } from "@/i18n/roles";
import type { MediaKey } from "@/media/manifest";

const SHOT_KEYS: MediaKey[] = [
  "roleCenter",
  "roleTeacher",
  "roleParent",
  "roleStudent",
  "roleAssistant",
  "roleStaff",
];

export function Roles({ t, locale }: { t: Messages; locale: Locale }) {
  const captions = [
    t.media.roleCenter,
    t.media.roleTeacher,
    t.media.roleParent,
    t.media.roleStudent,
    t.media.roleAssistant,
    t.media.roleStaff,
  ];

  const entries: RoleEntry[] = t.roles.entries.map((entry, i) => ({
    key: SHOT_KEYS[i]!,
    who: entry.who,
    question: entry.question,
    detail: entry.detail,
    caption: captions[i]!,
  }));

  return (
    <Section id="roles" label={t.roles.label} locale={locale}>
      <SectionTitle>{t.roles.title}</SectionTitle>

      <div className="mt-12">
        <RolePlate entries={entries} plateLabel={t.media.roles} locale={locale} />

        <nav className="mt-10 border-t border-rule pt-6">
          <Eyebrow locale={locale} tone="gold">
            {t.roles.pagesLabel}
          </Eyebrow>
          <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {ROLE_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={`/${locale}/for/${slug}`} className="rule-link rule-link-row text-[1.0625rem]">
                  {getRolePage(locale, slug).label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Section>
  );
}
