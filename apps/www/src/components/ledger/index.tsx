"use client";

import { cloneElement, isValidElement } from "react";
import type { ComponentProps, CSSProperties, ReactElement, ReactNode } from "react";
import { useFormatters } from "@/lib/i18n/use-formatters";
import styles from "./ledger.module.css";

export { ledgerMono } from "./fonts";
export const ledgerShellScope = styles.shellScope;
export const ledgerScope = styles.scope;

const ARABIC = /[؀-ۿ]/;

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Num({
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

export function Hairline({ className }: { className?: string }) {
  return <div className={cx(styles.hairline, className)} />;
}

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
      className={cx(styles.eyebrow, "h-10.5 px-3.5 font-semibold")}
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
      className={cx("px-3.5 py-3", className)}
      style={{ textAlign: align, color: "var(--ink)" }}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: ReactNode }) {
  return <tr className={styles.rowDivider}>{children}</tr>;
}

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
  asChild?: boolean;
} & ComponentProps<"button">) {
  const style =
    variant === "primary"
      ? { background: "var(--indigo)", color: "var(--indigo-ink)", border: "1px solid var(--indigo)" }
      : variant === "danger"
        ? { background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }
        : { background: "var(--sheet)", color: "var(--ink)", border: "1px solid var(--rule)" };

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
