import { Fragment, type ElementType } from "react";

import { splitWords } from "@/lib/motion";

/**
 * Text whose words the page can ink in one at a time.
 *
 * Used in exactly TWO places — the hero headline and the closing line — which
 * bracket the page. Every other line of prose on this site is printed, and
 * printed things do not animate; that restraint is what keeps the motion from
 * becoming a fade-up on every section.
 *
 * The split happens HERE, on the server, so the words are in the HTML that
 * ships. A client-side splitter shows the unsplit line first and reflows it,
 * and it also means the page reads correctly with JavaScript disabled.
 *
 * Word-level only — see `splitWords`. There is no character mode.
 */
export function Ink({
  as: Tag = "span",
  text,
  className = "",
}: {
  as?: ElementType;
  text: string;
  className?: string;
}) {
  const parts = splitWords(text);

  return (
    <Tag className={className} data-ink="">
      {parts.map((part, i) =>
        /^\s+$/.test(part) ? (
          // Whitespace stays a bare text node. An inline-block wrapper around
          // a space collapses it and welds the two words together — and the
          // gap between inline-block siblings comes from exactly this node.
          <Fragment key={i}>{part}</Fragment>
        ) : (
          // No `will-change` here: it is a permanent compositor hint on every
          // word of the headline for the sake of one 0.5s entrance. GSAP
          // applies and removes it around the tween that needs it.
          <span key={i} className="inline-block" data-ink-word="">
            {part}
          </span>
        ),
      )}
    </Tag>
  );
}
