/**
 * The issuer mark, drawn the way an engraved document carries a crest:
 * one ink, hairline weight, no fill and no gradient.
 *
 * It is the open book and its spine and nothing else — a cap and tassel are
 * shapes at 200px and a smudge at the 20px this actually renders at.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* the two leaves */}
      <path d="M16 5.4C13.4 3.5 10.1 2.6 6.2 2.9c-.7.1-1.2.6-1.2 1.3v13.6c0 .8.6 1.4 1.4 1.3 3.6-.3 6.8.5 9.6 2.4" />
      <path d="M16 5.4c2.6-1.9 5.9-2.8 9.8-2.5.7.1 1.2.6 1.2 1.3v13.6c0 .8-.6 1.4-1.4 1.3-3.6-.3-6.8.5-9.6 2.4" />
      {/* the spine */}
      <path d="M16 5.4v16.1" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark className="h-5 w-auto text-gold" />
      {/* The lettering drops below `sm` and the mark carries the brand alone.
          At 320px the header is wordmark + language + theme + CTA, and the
          full lettering is ~110px of that — enough to push the row into a
          horizontal scroll. The link's `aria-label` still says Edura, so
          nothing is lost to a screen reader. */}
      <span
        lang="en"
        dir="ltr"
        className="hidden font-lat-display text-[1.125rem] font-bold tracking-[0.01em] text-ink sm:inline"
      >
        Edura
      </span>
    </span>
  );
}
