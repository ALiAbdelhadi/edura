import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { CATALOG_COUNTS } from "@/lib/catalog";

const ORDER = ["systems", "grades", "tracks", "subjects"] as const;

// The catalog as one strip of figures under the hero. Every number is counted
// from the catalog itself, never typed in.
export function Figures({ t, locale }: { t: Messages; locale: Locale }) {
  const s = t.subjects;
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US");

  return (
    <section aria-label={s.figuresLabel}>
      <div className="wrap pb-16 md:pb-20">
        <dl data-reveal="" className="stat-strip">
          {ORDER.map((key) => (
            <div key={key} className="stat">
              <dt className="t-meta">{s.figures[key]}</dt>
              <dd className="figure stat-value">{number.format(CATALOG_COUNTS[key])}</dd>
            </div>
          ))}
        </dl>
        <p data-reveal="" className="t-meta mt-4 text-center">
          {s.detail}
        </p>
      </div>
    </section>
  );
}
