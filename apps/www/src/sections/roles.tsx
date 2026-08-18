import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import Link from "next/link";
import { Eyebrow } from "@repo/ui/components/eyebrow";

import { RolePlate, type RoleEntry } from "@/components/role-plate";
import { Section, SectionTitle } from "@/components/section";
import { ROLE_SLUGS, getRolePage } from "@/i18n/roles";
import type { MediaKey } from "@/media/manifest";

/**
 * Five roles as five entries in the register — not five cards in a grid.
 *
 * Each entry leads with the QUESTION that role opens the app to answer,
 * because that is what actually distinguishes them; the capability list
 * underneath is secondary and is set as such.
 *
 * One plate stands beside the register and changes with the role being read.
 * The rows are handed to the client component as plain strings, so they still
 * render on the server and hydration buys nothing but the selection.
 */
const SHOT_KEYS: MediaKey[] = [
  "roleCenter",
  "roleTeacher",
  "roleParent",
  "roleStudent",
  "roleAssistant",
];

export function Roles({ t, locale }: { t: Messages; locale: Locale }) {
  const captions = [
    t.media.roleCenter,
    t.media.roleTeacher,
    t.media.roleParent,
    t.media.roleStudent,
    t.media.roleAssistant,
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

        {/* The way into each role's own page.

            These sit OUTSIDE the register on purpose. Every row above is a
            `role="radio"`, and a link nested inside a radio is an interactive
            control inside an interactive control — a keyboard reader would
            have to escape the group to reach it, and a screen reader would
            announce both. Four links under the group is the same destination
            with none of that. */}
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
