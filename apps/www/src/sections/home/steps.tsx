import { LineArt, type LineArtName } from "@/components/line-art";
import { Section, SectionTitle } from "@/components/section";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

const ART: LineArtName[] = ["register", "subscribe", "pay", "attend"];
const GROUNDS = ["pen", "marker", "field", "pen"] as const;

// The four sign-up steps as cards. The only numbered list on the page.
export function Steps({ t, locale }: { t: Messages; locale: Locale }) {
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");

  return (
    <Section id="how">
      <div data-reveal="" className="max-w-[40rem]">
        <SectionTitle>{t.steps.title}</SectionTitle>
      </div>

      <ol data-reveal="" className="tile-grid mt-10" data-cols="4">
        {t.steps.items.map((item, i) => (
          <li key={item.title} className="tile">
            <span className="tile-cover" data-ground={GROUNDS[i]}>
              <LineArt name={ART[i]!} className="tile-art" />
              <span aria-hidden="true" className="tile-index figure">
                {number.format(i + 1)}
              </span>
            </span>
            <span className="tile-body">
              <h3 className="t-h3">{item.title}</h3>
              <p className="tile-text">{item.body}</p>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
