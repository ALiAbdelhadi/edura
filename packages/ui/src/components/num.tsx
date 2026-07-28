import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

/**
 * الدفتر / The Ledger — figures.
 *
 * There are TWO numeral paths in this product and they are deliberately
 * separate components. See `ProseCount` below for the other one.
 *
 * `<Num>` is the DATA path: money, IDs, dates, transaction refs, table
 * figures, counts of 3+, percentages, phone numbers, account tails. It
 * renders Latin digits in IBM Plex Mono with tabular figures, isolated
 * left-to-right.
 *
 * Why `<bdi>` rather than a `<span dir="ltr">`: `bdi` isolates its contents
 * from the surrounding bidirectional algorithm by default, which is exactly
 * what a Latin figure inside an Arabic sentence needs. Without isolation,
 * "‎TRX-98421‎" adjacent to Arabic punctuation reorders visually — the digits
 * stay put but the dash and any trailing punctuation jump. That bug is
 * invisible in LTR review and obvious to every Arabic reader.
 *
 * Why tabular figures: money columns are end-aligned and compared down the
 * column. Proportional digits make 1s narrower than 8s, so a column of
 * amounts stops lining up at the decimal.
 */

export interface NumProps extends React.ComponentProps<"bdi"> {
  /**
   * Render at the weight/size of a decisive figure (the net amount, the big
   * count). Purely typographic — it does not change the numeral system.
   */
  emphasis?: boolean
}

function Num({ className, emphasis, ...props }: NumProps) {
  return (
    <bdi
      data-slot="num"
      dir="ltr"
      className={cn(
        "font-mono [font-variant-numeric:tabular-nums]",
        emphasis && "font-semibold",
        className,
      )}
      {...props}
    />
  )
}

/**
 * `<ProseCount>` is the PROSE path: a small count living inside an Arabic
 * sentence where grammatical agreement matters — «١٦ قراراً بانتظارك اليوم»,
 * «٣ أيام». It renders Arabic-Indic numerals in the Arabic locale, in the
 * body face, NOT isolated, because it is part of the sentence rather than a
 * datum embedded in one.
 *
 * These two are NOT one component behind a boolean, and that is a decision
 * rather than an oversight. They differ along four independent axes —
 * numeral system, font family, bidi isolation, and whether the value
 * participates in pluralisation — and the choice between them is semantic
 * ("is this a datum or is this prose?"), not stylistic. A single component
 * with a `prose` flag would make it possible to render a currency amount in
 * Arabic-Indic numerals inside a table, which breaks column alignment, breaks
 * copy-paste into a spreadsheet, and breaks the tabular-figures guarantee.
 * The safe default has to be the data path, and a flag that must never be
 * passed on money is better expressed as a separate import.
 *
 * Arabic dual agreement wins for 1–2: «يومان», not «٢ أيام». Pass the already
 * agreed string as children; this component does not pluralise for you.
 */

export interface ProseCountProps extends React.ComponentProps<"span"> {
  /** The numeric value. Converted to Arabic-Indic digits when `locale` is ar. */
  value: number
  /** Active locale. Only "ar" switches numeral system. */
  locale?: string
}

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]

/** 1234 → "١٢٣٤". Digits only; separators and signs are left alone. */
export function toArabicIndic(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]!)
}

function ProseCount({
  className,
  value,
  locale = "ar",
  ...props
}: ProseCountProps) {
  const rendered = locale === "ar" ? toArabicIndic(value) : String(value)
  return (
    <span data-slot="prose-count" className={cn(className)} {...props}>
      {rendered}
    </span>
  )
}

export { Num, ProseCount }
