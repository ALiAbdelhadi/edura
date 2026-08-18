import { Eyebrow } from "@repo/ui/components/eyebrow";

import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import { Figure, type MoneyTone } from "./figure";

/**
 * THE SIGNATURE.
 *
 * The hero is not a headline over a screenshot — it is the artifact this
 * product exists to produce: one lesson, settled. Price, the two deductions,
 * a struck rule, and what the teacher is left with. The audience is a center
 * owner who is sceptical of claims and convinced by an itemised sheet, so the
 * page opens with the sheet.
 *
 * Three rules it must not break:
 *  - the figures column is the khana, and every amount aligns to it;
 *  - the total is closed with `2px double var(--ink)`, drawn from --ink. The
 *    16%-alpha hairline looks almost right there and is exactly the swap no
 *    screenshot review catches;
 *  - COLOUR HERE IS THE ARITHMETIC, not decoration. The two deductions are
 *    money leaving the teacher's pocket, so they take `--red` through the
 *    shared system's `out` money tone; the teacher's share is the decisive
 *    figure and takes `net`. That vocabulary is `<Num>`'s, and it is the same
 *    one the app uses on every settlement screen — so a center owner reading
 *    this page and then the product sees one language, not two;
 *  - THE FINAL FIGURES SHIP IN THE HTML. The page tots them up on load, but
 *    it counts from the real value in the markup, never toward it — so a
 *    failed script leaves a correct sheet rather than a column of zeros.
 *
 * The split is 15% platform / 15% center / 70% teacher — the teacher's share
 * derived as the REMAINDER, the way the engine derives it, so the two cannot
 * disagree by a piastre.
 */

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
  /** Signed already — the minus belongs INSIDE the isolated LTR run, or the
   *  bidi algorithm parks it on the far side of the amount in Arabic. */
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
      {/* The gap between the label and its rate is a flex `gap`, NOT a margin
          on the rate. `.figure` sets `direction: ltr`, so a logical margin on
          that span resolves against ITS direction, not the row's — `ms-2` puts
          the space on the far side of the number in Arabic and the rate ends up
          welded to the label. */}
      <div data-row-label="" className="flex items-baseline gap-2 px-5 py-3.5 sm:px-6">
        <span className={`text-[0.9375rem] ${total ? "font-medium text-ink" : "text-ink-2"}`}>
          {label}
        </span>
        {/* The rate is a figure, so it goes through the figure treatment like
            every other number here: mono, and bidi-isolated. Without the
            isolate "15%" renders as "%15" in Arabic — the sign migrates to the
            wrong side of the number — and a body face under `lang="ar"` can
            substitute Arabic-Indic digits, which would leave one number on the
            row in a different numeral system from the rest. */}
        {note ? <span className="figure text-[0.75rem] text-ink-3">{note}</span> : null}
      </div>

      <div className="khana relative flex w-[8.5rem] items-baseline justify-end px-5 py-3.5 sm:w-[10.5rem] sm:px-6">
        {/* الخط — the rule struck under the column.

            In a pre-ruled ledger this is the ONE line a bookkeeper draws by
            hand, which is why it is the only rule on this page that animates.
            It is its own element rather than the cell's `border-top` because a
            border cannot be drawn along its length; `.draw-inline` gives it a
            reading-axis origin so it strikes right-to-left in Arabic. */}
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
