import Link from "next/link";

import { LineArt, type LineArtName } from "@/components/line-art";
import { Section, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

const ART: LineArtName[] = ["guardian", "code", "isolation"];
const GROUNDS = ["pen", "marker", "field"] as const;

// Three plain statements about minors and data as cards, and a link to the full page.
export function Safety({ t, locale }: { t: Messages; locale: Locale }) {
  const s = t.safety;

  return (
    <Section id="safety">
      <div data-reveal="" className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[40rem]">
          <SectionTitle>{s.title}</SectionTitle>
        </div>
        <Link href={`/${locale}/trust`} className="btn btn-quiet shrink-0 self-start sm:self-auto">
          {s.more}
        </Link>
      </div>

      <ul role="list" data-reveal="" className="tile-grid mt-10" data-cols="3">
        {s.items.map((item, i) => (
          <li key={item.title} className="tile">
            <span className="tile-cover" data-ground={GROUNDS[i % GROUNDS.length]}>
              <LineArt name={ART[i % ART.length]!} className="tile-art" />
            </span>
            <span className="tile-body">
              <h3 className="t-h3">{item.title}</h3>
              <p className="tile-text">{item.body}</p>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
