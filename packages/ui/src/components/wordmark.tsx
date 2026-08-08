/* <Wordmark> — the name, locked up with its rule.
   ══════════════════════════════════════════════════════════════════════════════

   The lockup is a 3px gold vertical rule and the name. Not an icon and a name —
   the MARK (`edura-mark.svg`, the engraved book) is a separate device for square
   spaces: favicons, app icons, the ID card's issuer stamp. This is the
   horizontal signature, and the two are never stacked into one graphic.

   ── Why a rule and not a glyph ────────────────────────────────────────────────

   Gold is a STROKE in this system — rules, borders, marks, underlines, never a
   fill and never body text. The wordmark therefore has to carry the brand colour
   the same way every other surface does, which leaves exactly one shape: a rule.
   It is also the only device that reads identically in both scripts, since it
   contains no letterform to redraw for Arabic.

   ── The three numbers ─────────────────────────────────────────────────────────

     3px    the rule's width. Heavier than the 2px hairline used for structure,
            because this one is a signature rather than a divider — at 2px it
            reads as an accidental border on the name.
     0.68×  the rule's height, as a fraction of CAP HEIGHT (not font-size, and
            not line-height). Shorter than the caps, so it sits under the name's
            shoulder rather than fencing it.
     9px    the gap. Wide enough that the rule is a separate object; narrow
            enough that it is part of the lockup and not a stray line.

   ── Baseline alignment, without a magic number ────────────────────────────────

   The rule sits ON the baseline, not centred on the x-height. That is done by
   the flexbox baseline rule rather than by an offset: a block-level child of a
   `align-items: baseline` container aligns its BOTTOM MARGIN EDGE to the row's
   baseline. So the rule's foot lands exactly where the letters' feet land, and
   it stays there when the font size, the family or the script changes — none of
   which a hand-tuned `translateY` would survive.

   ── Two scripts, one lockup ───────────────────────────────────────────────────

   Latin is Cormorant Garamond 500 with -0.012em tracking. Arabic is Amiri 700
   「إدورا」 with NO tracking — Arabic is a connected script and letter-spacing
   breaks the joins. The weights differ (500 vs 700) because Amiri's 700 is
   optically the match for Cormorant's 500 at the same size; equal numbers would
   leave the Arabic looking lighter than the Latin, which for an Arabic-first
   product is the wrong way round. */

import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

export type WordmarkProps = Omit<React.ComponentProps<"span">, "children"> & {
  locale: Locale;
  /**
   * `ink` — the name in --ink on the page ground (default).
   * `reverse` — the name in --paper, for use ON --ink. The rule stays gold in
   * both: it is the brand colour, and it holds against either ground.
   */
  tone?: "ink" | "reverse";
  /** Type size in px. The rule and gap scale from it. */
  size?: number;
  /** Drop the rule — for favicon-adjacent places where only the name fits. */
  rule?: boolean;
};

/** Cap height as a fraction of font-size, close enough for both display faces. */
const CAP = 0.7;

export function Wordmark({
  locale,
  tone = "ink",
  size = 20,
  rule = true,
  className,
  style,
  ...props
}: WordmarkProps) {
  const arabic = locale === "ar";

  return (
    <span
      dir={arabic ? "rtl" : "ltr"}
      className={cn("inline-flex items-baseline", className)}
      style={{
        // The gap is part of the lockup's geometry, so it is stated once here
        // rather than as a utility that a caller could override to 8 or 12.
        gap: rule ? 9 : 0,
        fontSize: size,
        lineHeight: 1,
        color: tone === "reverse" ? "var(--paper)" : "var(--ink)",
        ...style,
      }}
      {...props}
    >
      {rule ? (
        <span
          aria-hidden
          style={{
            width: 3,
            height: size * CAP * 0.68,
            flex: "none",
            backgroundColor: "var(--gold)",
          }}
        />
      ) : null}
      <span
        style={
          arabic
            ? {
                fontFamily: "var(--ar-display)",
                fontWeight: 700,
                // No letter-spacing. See the header comment.
              }
            : {
                fontFamily: "var(--lat-display)",
                fontWeight: 500,
                letterSpacing: "-0.012em",
              }
        }
      >
        {arabic ? "إدورا" : "Edura"}
      </span>
    </span>
  );
}
