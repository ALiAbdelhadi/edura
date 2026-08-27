import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Button } from "@repo/ui/components/button";

import { Ink } from "@/components/ink";
import { SettlementRegister } from "@/components/settlement-register";

export function Hero({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <section className="mx-auto w-full max-w-[87.5rem] px-6 pt-16 pb-16 md:px-10 lg:pt-24 lg:pb-24">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,31rem)_1fr] lg:gap-20">
        <div className="order-2 lg:order-1">
          <SettlementRegister t={t} locale={locale} />
        </div>

        <div className="order-1 lg:order-2">
          <Ink
            as="h1"
            text={t.hero.headline}
            className="display max-w-[16ch] text-[clamp(2.25rem,1.4rem+3.2vw,3.5rem)] leading-[1.15] text-ink"
          />

          <p className="mt-6 max-w-[52ch] text-[1.0625rem] leading-[1.8] text-ink-2">
            {t.hero.lede}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild variant="ledger" size="ledger" className="tap">
              <a href="#closing">{t.hero.primary}</a>
            </Button>
            <Button asChild variant="gold" size="ledger" className="tap">
              <a href="#money">{t.hero.secondary}</a>
            </Button>
          </div>

          <ul className="mt-10 space-y-3 border-t border-rule pt-6">
            {t.hero.assurances.map((line) => (
              <li key={line} className="flex items-baseline gap-3 text-[0.875rem] text-ink-3">
                <span aria-hidden="true" className="mt-1.5 h-[2px] w-4 shrink-0 bg-gold" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
