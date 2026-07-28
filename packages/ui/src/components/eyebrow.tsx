/* <Eyebrow> — the system's primary hierarchy marker.
   ══════════════════════════════════════════════════════════════════════════════

   It labels every section, every nav group, and every table header. Because it is the
   product's main ranking device, it has to work equally well in both languages — and
   as specified, it did not.

   ── The problem it resolves ───────────────────────────────────────────────────

   The Latin eyebrow is `10px / 600 / 0.12em uppercase` in IBM Plex Mono. Arabic can
   carry none of those three:

     uppercase        Arabic has no case. The property is inert.
     letter-spacing   Arabic is a CONNECTED script. Tracking breaks the joins and
                      produces near-unreadable text.
     monospace        IBM Plex Mono ships no Arabic glyphs, so the text silently falls
                      back to another family — the mono guarantee is lost with no
                      visible error.

   Applied verbatim to Arabic, the eyebrow therefore degrades to plain small text,
   while rendering fully in English. That leaves the hierarchy STRONGER in the
   secondary language than in the primary one. For an Arabic-first product that is
   backwards, and it is a flaw in the design system rather than in any screen.

   ── The resolution ────────────────────────────────────────────────────────────

   The MARKER is the shared invariant — a 2×9px rule at the start edge, in both
   scripts. Case, tracking and mono become the LATIN-ONLY variant; weight, size and
   word-spacing are the Arabic one. Each script gets the "engineered, not prose"
   signal it can actually carry, and neither language's hierarchy is the weaker.

   word-spacing is the honest substitute for letter-spacing: it widens the space
   CHARACTER only and never touches the intra-word joins. It contributes least of the
   three though — the marker and the weight do the real work.

   Arabic is 12px, not 10px, because 10px Latin caps have a ~7px cap band and Arabic
   needs more size to match that optically. 11 reads under-weight beside the Latin
   form; 13 out-ranks the items below it; 600 is the body-emphasis weight and so fails
   to read as a label at all.

   The device costs the system nothing new — no colour, no second font, no animation.
   It reuses the hairline rule, which is already the system's structural vocabulary.

   ── Script selection ──────────────────────────────────────────────────────────

   Chosen by LOCALE, not by a caller-supplied flag, so a screen cannot accidentally
   apply the Latin recipe to an Arabic string. The one exception is `script="latin"`,
   for genuinely Latin strings inside an Arabic page — `back office`, `SLA 48h`,
   `TRX-`, `⌘K`, `DD MMM YYYY`. Those keep the Latin form in every locale, because the
   reason for the Latin form is the SCRIPT, not the language setting. */

import * as React from "react";

import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

export type EyebrowProps = React.ComponentProps<"span"> & {
  locale: Locale;
  /**
   * Force a script. Omit to follow the locale.
   * `latin` for Latin content inside an Arabic page (`back office`, `TRX-`, `⌘K`).
   */
  script?: "latin" | "arabic";
  /** The marker rule. On by default — it is the shared invariant, not an ornament. */
  marker?: boolean;
  /** Renders as `<div>` etc. when the eyebrow is a block-level group label. */
  asChild?: never;
};

export function Eyebrow({
  locale,
  script,
  marker = true,
  className,
  children,
  ...props
}: EyebrowProps) {
  const resolved = script ?? (locale === "ar" ? "arabic" : "latin");

  return (
    <span
      className={cn(
        "inline-flex items-center text-ink-3",
        // The marker is drawn as a pseudo-element in currentColor so it tracks any
        // colour override on the eyebrow itself, and sits at the START edge in both
        // directions without a per-direction rule.
        marker &&
          "before:me-[7px] before:h-[9px] before:w-[2px] before:flex-none before:rounded-[1px] before:bg-current before:content-['']",
        resolved === "latin"
          ? "num text-[10px] font-semibold uppercase tracking-[0.12em]"
          : // No uppercase, no tracking, no mono — see the header comment. Each of
            // the three is a silent failure in Arabic, not a no-op.
            "text-[12px] font-bold [word-spacing:0.1em]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
