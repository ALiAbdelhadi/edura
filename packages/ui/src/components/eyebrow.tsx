import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

/**
 * الدفتر / The Ledger — the section label.
 *
 * A mono, letterspaced, uppercase micro-label above every section, card title
 * and table header group. It is what makes the interface read as a printed
 * ledger rather than a dashboard, and it carries no information the heading
 * below it does not already carry — it is a register marker, not a subtitle.
 *
 * THE ARABIC RESOLUTION (this is the whole reason the component exists rather
 * than a utility class):
 *
 * The Latin treatment — IBM Plex Mono, `text-transform: uppercase`,
 * `letter-spacing: 0.12em` — is actively wrong for Arabic on three counts:
 *
 *   1. IBM Plex Mono has no Arabic glyphs. An Arabic eyebrow set in it falls
 *      back to an arbitrary system face, so «قرار الصرف» and `back office`
 *      would render in two unrelated typefaces at the same size.
 *   2. Arabic is a cursive script: letters JOIN. `letter-spacing` pulls those
 *      joins apart and produces disconnected letterforms — not a stylistic
 *      choice but a broken word. This is the single most common way a design
 *      system built in English damages Arabic text.
 *   3. Arabic is unicameral — it has no capital letters — so
 *      `text-transform: uppercase` is a no-op at best. It is applied here
 *      only to Latin strings, per Handoff I §2.3.
 *
 * So an Arabic eyebrow keeps the size, weight and colour, and drops the face,
 * the tracking and the transform. Same register, different script.
 *
 * Detection is automatic (first Arabic-range character wins) because the
 * caller usually passes a translated string and cannot know at the call site
 * which script it will be in at runtime. `script` overrides it for the rare
 * mixed case.
 */

const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

export interface EyebrowProps extends React.ComponentProps<"div"> {
  /**
   * Force a script treatment. Omit to detect from the text content, which is
   * what you want whenever the content is a translated string.
   */
  script?: "latin" | "arabic"
  /** Render as a different element — `span` inline, `th` in a table head. */
  asChild?: never
}

function Eyebrow({ className, script, children, ...props }: EyebrowProps) {
  const detected =
    script ??
    (ARABIC_RANGE.test(extractText(children)) ? "arabic" : "latin")

  return (
    <div
      data-slot="eyebrow"
      data-script={detected}
      className={cn(
        "text-[10px] leading-none font-semibold text-ink-3",
        detected === "latin"
          ? "font-mono tracking-[0.12em] uppercase"
          : // No mono (no Arabic glyphs), no tracking (breaks cursive joining),
            // no uppercase (Arabic is unicameral).
            "font-sans tracking-normal normal-case",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Flatten children to a string so script detection can inspect the text. */
function extractText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractText(node.props.children)
  }
  return ""
}

export { Eyebrow }
