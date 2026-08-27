import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Figure, type MoneyTone } from "./figure";

const PRICE = "120.00";
const PLATFORM = "−18.00";
const CENTER = "−18.00";
const TEACHER = "84.00";

function Row({
  label,
  note,
  value,
  currency,
  total = false,
  tone = "plain",
}: {
  label: string;
  note?: string;
  value: string;
  currency: string;
  total?: boolean;
  tone?: MoneyTone;
}) {
  return (
    <div
      data-row=""
      className={`grid grid-cols-[1fr_auto] items-center ${total ? "" : "border-b border-rule"}`}
    >
      <div data-row-label="" className="flex items-baseline gap-2 px-5 py-3.5 sm:px-6">
        <span className={`text-[0.9375rem] ${total ? "font-medium text-ink" : "text-ink-2"}`}>
          {label}
        </span>
        {note ? <span className="figure text-[0.75rem] text-ink-3">{note}</span> : null}
      </div>

      <div className="khana relative flex w-[8.5rem] items-baseline justify-end px-5 py-3.5 sm:w-[10.5rem] sm:px-6">

        {total ? (
          <i
            data-total-rule=""
            aria-hidden="true"
            className="total-rule draw-inline absolute start-0 end-0 top-0 block"
          />
        ) : null}
        <Figure
          value={value}
          currency={currency}
          emphasis={total}
          post={!total}
          total={total}
          tone={tone}
        />
      </div>
    </div>
  );
}

export function SettlementRegister({ t, locale }: { t: Messages; locale: Locale }) {
  return (
    <figure className="m-0" data-register="">
      <div className="border border-rule bg-sheet">
        <header data-register-head="" className="border-b border-rule px-5 py-4 sm:px-6">
          <Eyebrow locale={locale} tone="gold">{t.register.caption}</Eyebrow>
          <p className="mt-2 text-[0.9375rem] text-ink">{t.register.session}</p>
        </header>

        <Row label={t.register.price} value={PRICE} currency={t.register.currency} tone="in" />
        <Row
          label={t.register.platform}
          note="15%"
          value={PLATFORM}
          currency={t.register.currency}
          tone="out"
        />
        <Row
          label={t.register.center}
          note="15%"
          value={CENTER}
          currency={t.register.currency}
          tone="out"
        />
        <Row
          label={t.register.teacher}
          value={TEACHER}
          currency={t.register.currency}
          tone="net"
          total
        />
      </div>

      <figcaption className="mt-3 max-w-[42ch] text-[0.75rem] leading-relaxed text-ink-3">
        {t.register.footnote}
      </figcaption>
    </figure>
  );
}
