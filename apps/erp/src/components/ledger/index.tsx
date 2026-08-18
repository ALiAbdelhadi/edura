"use client";

import { cloneElement, isValidElement } from "react";
import type { ComponentProps, CSSProperties, ReactElement, ReactNode } from "react";
import { clockParts, type Locale } from "@repo/ui/lib/format";
import { useFormatters } from "@/lib/i18n/use-formatters";
import styles from "./ledger.module.css";

export { ledgerMono } from "./fonts";
/** Wraps DashboardShell — re-points the tokens the shared chrome is built from. */
export const ledgerShellScope = styles.shellScope;
/** The page-content canvas inside the shell. */
export const ledgerScope = styles.scope;

const ARABIC = /[؀-ۿ]/;

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ── Num ───────────────────────────────────────────────────────────────────
   Every figure in the system. Rendered `dir="ltr"` because numbers, dates,
   IDs, refs and emails are Latin data sitting inside Arabic prose — without
   the isolation the bidi algorithm reorders them. */
function NumBase({
  children,
  className,
  ...rest
}: { children: ReactNode } & ComponentProps<"span">) {
  return (
    <span dir="ltr" className={cx(styles.num, className)} {...rest}>
      {children}
    </span>
  );
}

/* ── Clock ─────────────────────────────────────────────────────────────────
   A lesson time — `4:00 عصرًا`, `4:00 عصرًا – 6:00 مساءً`. The numerals are data
   and stay in the figure face; the day period is a WORD and must not be, because
   the mono face ships no Arabic glyphs and would drop it into a fallback family
   with no error.

   ONE `dir="ltr"` wrapper around the WHOLE range, never one per time: two
   separately isolated times in an RTL row lay out right-to-left, so
   `4:00 – 6:00` renders as `6:00 – 4:00` — a lesson that ends before it starts.

   Only the MARKUP is local. Which 12-hour face and which day period an hour
   carries comes from `clockParts` in @repo/ui, the one place it is decided. */
const clockWrap = "inline-flex items-baseline gap-1 whitespace-nowrap";

function ClockPeriod({ children }: { children: string }) {
  return <span className="font-sans">{children}</span>;
}

function Clock({
  value,
  locale,
  className,
  ...rest
}: { value: string | null | undefined; locale: Locale } & Omit<
  ComponentProps<"span">,
  "children"
>) {
  const parts = clockParts(value, locale);
  if (!parts) {
    return (
      <NumBase className={className} {...rest}>
        {value ?? ""}
      </NumBase>
    );
  }
  return (
    <span dir="ltr" className={cx(clockWrap, className)}>
      <span className={styles.num} {...rest}>
        {parts.face}
      </span>
      <ClockPeriod>{parts.period}</ClockPeriod>
    </span>
  );
}

function ClockRange({
  start,
  end,
  locale,
  className,
  ...rest
}: {
  start: string | null | undefined;
  end: string | null | undefined;
  locale: Locale;
} & Omit<ComponentProps<"span">, "children">) {
  const a = clockParts(start, locale);
  const b = clockParts(end, locale);
  if (!a || !b) {
    return (
      <Clock value={a ? start : end} locale={locale} className={className} {...rest} />
    );
  }
  return (
    <span dir="ltr" className={cx(clockWrap, className)}>
      <span className={styles.num} {...rest}>
        {a.face}
      </span>
      {a.period === b.period ? null : <ClockPeriod>{a.period}</ClockPeriod>}
      <span aria-hidden>–</span>
      <span className={styles.num} {...rest}>
        {b.face}
      </span>
      <ClockPeriod>{b.period}</ClockPeriod>
    </span>
  );
}


/** A joined literal — `"16:00 – 17:30"` — as the guided-tour worlds hold them. */
function splitClockText(value: string | null | undefined) {
  const [start, end, ...rest] = (value ?? "").split(/\s*[–—-]\s*/);
  return rest.length > 0 ? { start: value, end: undefined } : { start, end };
}

function ClockText({
  value,
  ...props
}: { value: string | null | undefined; locale: Locale } & Omit<
  ComponentProps<"span">,
  "children"
>) {
  const { start, end } = splitClockText(value);
  return end ? (
    <ClockRange start={start} end={end} {...props} />
  ) : (
    <Clock value={start} {...props} />
  );
}

export const Num = Object.assign(NumBase, { Clock, ClockRange, ClockText });

/* ── Money ─────────────────────────────────────────────────────────────────
   Outflow negative with a leading − in --red; inflow + in --teal; the
   decisive net figure in --ink; neutral context in --ink-2 (handoff §4). */
export function Money({
  piasters,
  signed = false,
  tone = "auto",
  className,
  weight = 500,
}: {
  piasters: number | null | undefined;
  signed?: boolean;
  tone?: "auto" | "ink" | "muted" | "teal" | "red";
  className?: string;
  weight?: 400 | 500 | 600;
}) {
  const { formatEGP } = useFormatters();
  const v = piasters ?? 0;
  const resolved =
    tone === "auto" ? (v < 0 ? "red" : v > 0 ? "teal" : "muted") : tone;
  const color =
    resolved === "red"
      ? "var(--red)"
      : resolved === "teal"
        ? "var(--teal)"
        : resolved === "muted"
          ? "var(--ink-2)"
          : "var(--ink)";

  return (
    <Num className={className} style={{ color, fontWeight: weight }}>
      {signed && v > 0 ? "+" : signed && v < 0 ? "−" : ""}
      {formatEGP(Math.abs(v))}
    </Num>
  );
}

/* ── Eyebrow ───────────────────────────────────────────────────────────────
   Mono, letterspaced, labels every section. Uppercase is applied ONLY to
   Latin strings — Arabic never receives text-transform: uppercase. */
export function Eyebrow({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const latin = !ARABIC.test(children);
  return (
    <div
      className={cx(styles.eyebrow, latin && styles.eyebrowLatin, className)}
      dir={latin ? "ltr" : undefined}
    >
      {children}
    </div>
  );
}

/* ── Sheet ─────────────────────────────────────────────────────────────────
   The paper card. `blocking` swaps the hairline for a --red border; it never
   fills the card, because a red wash reads as an error state rather than a
   held decision. */
export function Sheet({
  children,
  className,
  blocking = false,
  ...rest
}: {
  children: ReactNode;
  blocking?: boolean;
} & ComponentProps<"div">) {
  return (
    <div
      className={cx(styles.sheet, blocking && styles.blocking, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Page + section headings ─────────────────────────────────────────────── */
export function PageTitle({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-4">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1
          className="text-2xl font-bold sm:text-[26px]"
          style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-[68ch] text-sm" style={{ color: "var(--ink-2)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2
          className="text-[15px] font-semibold"
          style={{ color: "var(--ink)" }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/* ── Chip ──────────────────────────────────────────────────────────────────
   amber = waiting · teal = confirmed / money out · red = irreversible or
   blocking · indigo = brand · neutral = draft. A chip is never coloured for
   decoration. */
const CHIP_TONES = {
  amber: styles.chipAmber,
  teal: styles.chipTeal,
  red: styles.chipRed,
  indigo: styles.chipIndigo,
  neutral: styles.chipNeutral,
} as const;

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof CHIP_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx(styles.chip, CHIP_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* ── InitialsTile ──────────────────────────────────────────────────────────
   Identity and orientation. The student portal is explicitly allowed to use
   the softs and this pattern generously — it is warmth inside the range, not
   a deviation from the system. */
const TILE_TONES = {
  indigo: { color: "var(--indigo)", background: "var(--indigo-soft)" },
  teal: { color: "var(--teal)", background: "var(--teal-soft)" },
  amber: { color: "var(--amber)", background: "var(--amber-soft)" },
} as const;

export function InitialsTile({
  name,
  tone = "indigo",
  size = 32,
}: {
  name: string;
  tone?: keyof typeof TILE_TONES;
  size?: number;
}) {
  // Split on whitespace but keep only word-initial letters. Course names here
  // routinely contain separators ("التفسير — الثالث الثانوي"), and taking the
  // first character of every token turns the dash into an initial.
  const initials = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span
      aria-hidden
      className={styles.tile}
      style={{
        ...TILE_TONES[tone],
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials}
    </span>
  );
}

/* ── Rules ─────────────────────────────────────────────────────────────────
   The closing line of any total. Kept as a component so the 2px-double
   treatment cannot drift between screens. */
export function DoubleTotal({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        styles.doubleTotal,
        "flex items-baseline justify-between gap-4 pt-3",
      )}
    >
      <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

/* A bare rule: `border-top` on a zero-height box, carrying NO margin of its
   own. Separation is the caller's decision — a rule inside a dense table row
   and one splitting a sheet in two want different air — so the space is passed
   in rather than baked here. Without `className` there was no way to give it
   any, and the rule butted against whatever sat on either side. */
export function Hairline({ className }: { className?: string }) {
  return <div className={cx(styles.hairline, className)} />;
}

/* ── Empty state ───────────────────────────────────────────────────────────
   States what is absent and, where there is one, the way out. An empty state
   with no next step reads as a broken screen. */
export function LedgerEmpty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <p className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
        {title}
      </p>
      {hint ? (
        <p className="max-w-[48ch] text-xs" style={{ color: "var(--ink-3)" }}>
          {hint}
        </p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/* ── Table shells ──────────────────────────────────────────────────────────
   `comfortable` density per the student brief: th 42px / td 13px 14px. */
export function LedgerTable({
  head,
  children,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead className={styles.field}>
          <tr className="border-b" style={{ borderColor: "var(--rule)" }}>
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <th
      scope="col"
      className={cx(styles.eyebrow, "h-[42px] px-3.5 font-semibold whitespace-nowrap")}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "start",
  className,
}: {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <td
      // Never wraps — the table is allowed to outgrow the phone and scroll inside
      // LedgerTable's container; a wrapped amount reads as two amounts.
      className={cx("px-3.5 py-3 whitespace-nowrap", className)}
      style={{ textAlign: align, color: "var(--ink)" }}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className={styles.rowDivider}>{children}</tr>;
}

/* ── Buttons ───────────────────────────────────────────────────────────────
   Primary is indigo; secondary is bordered, never filled. A destructive
   action is bordered red text — never an equal-weight twin of the safe one. */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50";

export function LedgerButton({
  variant = "secondary",
  className,
  children,
  asChild = false,
  ...rest
}: {
  variant?: "primary" | "secondary" | "danger";
  /** Render the single child element as the control (e.g. a <Link>). */
  asChild?: boolean;
} & ComponentProps<"button">) {
  const style =
    variant === "primary"
      ? { background: "var(--indigo)", color: "var(--indigo-ink)", border: "1px solid var(--indigo)" }
      : variant === "danger"
        ? { background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }
        : { background: "var(--sheet)", color: "var(--ink)", border: "1px solid var(--rule)" };

  // A local `asChild` rather than Radix's Slot: @radix-ui/react-slot is a
  // dependency of packages/ui, not of this app, and one cloneElement is
  // cheaper than adding a direct dep for a single prop.
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string; style?: CSSProperties }>;
    return cloneElement(child, {
      className: cx(BUTTON_BASE, className, child.props.className),
      style: { ...style, ...child.props.style },
    });
  }

  return (
    <button className={cx(BUTTON_BASE, className)} style={style} {...rest}>
      {children}
    </button>
  );
}
