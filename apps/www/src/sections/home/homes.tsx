import Link from "next/link";

import { Arrow } from "@/components/arrow";
import { LineArt } from "@/components/line-art";
import { Section, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

const ROLES = [
  { key: "student", ground: "pen" },
  { key: "parent", ground: "marker" },
] as const;

// The two accounts the site speaks to, each opening its own page.
export function Homes({ t, locale }: { t: Messages; locale: Locale }) {
  const h = t.homes;

  return (
    <Section id="roles">
      <div data-reveal="" className="max-w-[40rem]">
        <SectionTitle>{h.title}</SectionTitle>
      </div>

      <ul role="list" data-reveal="" className="tile-grid mt-10">
        {ROLES.map(({ key, ground }) => (
          <li key={key} className="flex">
            <Link href={`/${locale}/for/${key}`} className="tile tile-link">
              <span className="tile-cover" data-ground={ground}>
                <LineArt name={key} className="tile-art" />
              </span>
              <span className="tile-body">
                <span className="t-h3 block">{h[key].title}</span>
                <span className="tile-text block">{h[key].body}</span>
                <span className="tile-more">
                  {h.more}
                  <Arrow />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
