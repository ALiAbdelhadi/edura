"use client";

import { cn } from "@repo/ui/lib/utils";
import * as React from "react";
import { Num } from "./num";

/* ------------------------------------------------------------------------ */
/* Eyebrow                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Mono eyebrow. Labels every section and table header.
 *
 * `latin` gates `text-transform: uppercase` — Arabic has no case, and
 * uppercasing it is a no-op at best and a shaping bug at worst. Callers pass
 * latin only for Latin/mono strings.
 */
export function Eyebrow({
  children,
  latin = false,
  className,
  ...rest
}: React.ComponentProps<"span"> & { latin?: boolean }) {
  return (
    <span
      className={cn("lg-eyebrow", className)}
      data-latin={latin || undefined}
      {...rest}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Card / sheet                                                              */
/* ------------------------------------------------------------------------ */

export function Sheet({
  children,
  blocking = false,
  className,
  ...rest
}: React.ComponentProps<"div"> & { blocking?: boolean }) {
  return (
    <div
      className={cn("lg-card", className)}
      data-blocking={blocking || undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Section heading inside a sheet: eyebrow + optional right-hand link. */
export function SheetHead({
  title,
  latin,
  action,
}: {
  title: React.ReactNode;
  latin?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--rule)] px-4 py-3">
      <Eyebrow latin={latin}>{title}</Eyebrow>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Page header                                                               */
/* ------------------------------------------------------------------------ */

export function PageHead({
  title,
  subtitle,
  actions,
  rule = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  rule?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        rule && "border-b border-[var(--rule)] pb-[18px]",
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-[26px] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--ink-2)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Status badge                                                              */
/* ------------------------------------------------------------------------ */

export type BadgeTone = "pending" | "done" | "failed" | "neutral" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  pending: "text-[var(--amber)] bg-[var(--amber-soft)]",
  done: "text-[var(--teal)] bg-[var(--teal-soft)]",
  failed: "text-[var(--red)] bg-[var(--red-soft)]",
  neutral: "text-[var(--ink-2)] bg-[var(--rule-2)]",
  info: "text-[var(--indigo)] bg-[var(--indigo-soft)]",
};

/**
 * Colour discipline: amber = waiting, teal = money out / confirmed, red =
 * irreversible or blocking, indigo = brand. A badge is never coloured for
 * decoration, and never two saturated colours in one row.
 *
 * `age` exists because waiting is the operator's real metric — a pending badge
 * that does not say how long it has been pending is withholding the number the
 * screen exists to surface.
 */
export function Badge({
  tone = "neutral",
  icon,
  age,
  children,
}: {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  age?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] px-2 py-[2px] text-xs font-semibold",
        BADGE_TONE[tone],
      )}
    >
      {icon}
      {children}
      {age ? (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <Num className="text-[11px] font-medium">{age}</Num>
        </>
      ) : null}
    </span>
  );
}

/** The permanence stamp. Only ever on a row that just became irreversible. */
export function Seal({ children }: { children: React.ReactNode }) {
  return (
    <span className="lg-seal" dir="ltr">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Row identity                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Used in every table that lists people or centers. Initials tile + name +
 * a mono second line carrying the code/email, wrapped ltr when it is Latin.
 */
export function RowIdentity({
  name,
  meta,
  kind = "person",
  metaLatin = true,
  initialsFrom,
}: {
  name: React.ReactNode;
  meta?: React.ReactNode;
  kind?: "person" | "center";
  metaLatin?: boolean;
  /** Supply when `name` is a node (e.g. a link) rather than a plain string. */
  initialsFrom?: string;
}) {
  const initials = React.useMemo(() => {
    const source = initialsFrom ?? (typeof name === "string" ? name : null);
    if (!source) return "—";
    return (
      source
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("") || "—"
    );
  }, [name, initialsFrom]);

  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "flex size-[30px] shrink-0 items-center justify-center rounded-[7px] text-xs font-semibold",
          kind === "center"
            ? "bg-[var(--teal-soft)] text-[var(--teal)]"
            : "bg-[var(--indigo-soft)] text-[var(--indigo)]",
        )}
      >
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
          {name}
        </span>
        {meta ? (
          metaLatin ? (
            <Num className="block truncate text-[11px] text-[var(--ink-3)]">
              {meta}
            </Num>
          ) : (
            <span className="block truncate text-[11px] text-[var(--ink-3)]">
              {meta}
            </span>
          )
        ) : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Empty & error states                                                      */
/* ------------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="text-[var(--ink-3)]">{icon}</div> : null}
      <p className="m-0 text-sm font-semibold text-[var(--ink)]">{title}</p>
      {hint ? (
        <p className="m-0 max-w-[46ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  hint,
  onRetry,
  retryLabel,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="m-0 text-sm font-semibold text-[var(--red)]">{title}</p>
      {hint ? (
        <p className="m-0 max-w-[46ch] text-[13px] leading-relaxed text-[var(--ink-2)]">
          {hint}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 h-9 rounded-lg border border-[var(--rule)] bg-[var(--sheet)] px-3 text-[13px] font-semibold text-[var(--ink)]"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
