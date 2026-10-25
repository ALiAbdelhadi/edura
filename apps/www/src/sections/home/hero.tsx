import { Arrow } from "@/components/arrow";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { appUrl } from "@/lib/app-origin";

import { Week } from "./week";

// The thesis on one side, the week it is about on the other.
export function Hero({ t, locale }: { t: Messages; locale: Locale }) {
  const h = t.hero;

  return (
    <section aria-labelledby="hero-title">
      <div className="wrap grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-12 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        <div>
          <h1 id="hero-title" data-rise="" className="t-display text-ink">
            {h.title}
          </h1>
          <p data-rise="" className="t-lede mt-6">
            {h.lede}
          </p>
          <div data-rise="" className="mt-9 flex flex-wrap items-center gap-3">
            <a href={appUrl(locale, "/register?role=student")} className="btn btn-pen">
              {h.primary}
              <Arrow />
            </a>
            <a href="#how" className="btn btn-quiet">
              {h.secondary}
            </a>
          </div>
          <p data-rise="" className="t-meta mt-4">
            {h.note}
          </p>
        </div>

        <div data-rise="" className="lg:justify-self-end">
          <Week week={h.week} />
        </div>
      </div>
    </section>
  );
}
