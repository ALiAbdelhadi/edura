/**
 * A money figure that the page COUNTS UP.
 *
 * ── Why this is not `<Num>` ───────────────────────────────────────────────
 *
 * `@repo/ui`'s `<Num>` is the product's figure component and it is used
 * everywhere else, including on this page's own reasoning. It takes a NUMBER
 * and formats it. This one takes a pre-formatted STRING, because GSAP rewrites
 * its `textContent` frame by frame while it tots up — handing that job to a
 * component that reformats on every render would fight the tween, and passing
 * a number would mean re-implementing `formatEGP` inside an `onUpdate`.
 *
 * What it does NOT re-invent is the meaning. `.figure` restates `<Num>`'s
 * typographic contract (Latin digits, mono, tabular, bidi-isolated — see
 * globals.css) and `tone` is `<Num>`'s own MoneyTone vocabulary, reading the
 * same tokens:
 *
 *   out    money leaving the teacher's pocket   --red
 *   in     what came in                         --teal
 *   net    the decisive figure                  --ink, 600
 *   muted  an intermediate line                 --ink-2
 *
 * That is where the page's colour comes from: it is the ledger's own
 * arithmetic, not decoration.
 *
 * The FINAL value is what ships in the HTML — `data-count` carries a copy for
 * the counter to read — so a figure is never a zero waiting for a script, and
 * the page is correct with JavaScript disabled.
 */
export type MoneyTone = "out" | "in" | "net" | "muted" | "plain";

const TONE: Record<MoneyTone, string> = {
  out: "text-red",
  /* `--money-in`, not `--teal` — see the block that declares it in
     globals.css. `--teal` measures 4.30:1 on `--field`, and `--field` is
     exactly what a register row takes on hover, so the palette's own value
     failed AA on the one row that uses this tone. This is that value darkened
     against `--ink`; it is a www-local name, so the shared palette two other
     apps read is untouched. */
  in: "text-(--money-in)",
  net: "font-semibold text-ink",
  muted: "text-ink-2",
  plain: "",
};

export function Figure({
  value,
  currency,
  className = "",
  emphasis = false,
  post = false,
  total = false,
  tone = "plain",
}: {
  value: string;
  currency?: string;
  className?: string;
  emphasis?: boolean;
  /** Tot this figure up when it is reached. */
  post?: boolean;
  /** This is the answer, not a line item: it posts more slowly. */
  total?: boolean;
  tone?: MoneyTone;
}) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      {/* `data-figure` marks a LINE ITEM, and the total deliberately does not
          carry it: otherwise the hero's row loop would claim the total too and
          post it a second time, at line-item speed, fighting its own tween. */}
      <span
        className={`figure ${TONE[tone]} ${
          emphasis ? "text-[1.375rem] font-medium" : "text-[0.9375rem]"
        }`}
        {...(post || total ? { "data-count": value } : {})}
        {...(post && !total ? { "data-figure": "" } : {})}
        {...(total ? { "data-total-figure": "", "data-total": "" } : {})}
      >
        {value}
      </span>
      {/* No `font-body` here. It was a dead class — `--font-body` is not a
          token this repo defines — and it was also unnecessary: this span is a
          SIBLING of the `.figure` above, not a child of it, so it already
          inherits the body face the locale set on `<body>`. Naming a family
          here would be worse than nothing, because the body face differs per
          locale (`--ar-body` vs `--lat-body`) and a fixed one would be wrong
          on half the site. */}
      {currency ? <span className="text-[0.6875rem] text-ink-3">{currency}</span> : null}
    </span>
  );
}
