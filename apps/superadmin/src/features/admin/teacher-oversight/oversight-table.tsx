"use client";

import type * as React from "react";
import { useTranslations } from "next-intl";

import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Num } from "@repo/ui/components/num";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";

import { PageSpinner } from "@/components/kit/spinner";

/**
 * The read-only table every teacher tab renders, and a deliberate twin of
 * `LedgerTable` in `center-oversight/finance-tab.tsx` — same column spec, same
 * loading / failed / empty states, same money and date cells.
 *
 * It is a copy rather than an import because that one is a file-local
 * component inside a centre screen, and lifting it out would mean editing the
 * centre surface this work is not allowed to disturb. Extracting both into
 * `components/kit/` is worth doing on its own, later, as a pure refactor.
 */
export type Col = {
  key: string;
  label: string;
  money?: boolean;
  date?: boolean;
  code?: boolean;
  figure?: boolean;
  /** Renders the cell itself, for a badge or a link. */
  render?: (row: Record<string, unknown>) => React.ReactNode;
};

export function OversightTable({
  locale,
  loading,
  failed,
  onRetry,
  rows,
  total,
  columns,
  emptyText,
  onRowClick,
  rowLabel,
}: {
  locale: Locale;
  loading: boolean;
  failed?: boolean;
  onRetry?: () => void;
  rows: Record<string, unknown>[];
  total: number;
  columns: Col[];
  emptyText?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  rowLabel?: (row: Record<string, unknown>) => string;
}) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();

  if (loading) return <PageSpinner />;
  if (failed) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => onRetry?.()}
        retryLabel={queryStrings.retry}
      />
    );
  }
  if (!rows.length) {
    return <p className="p-4 text-[13px] text-ink-3">{emptyText ?? t("noRows")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-1.5 text-[11px] text-ink-3">
        {t("showing")}
        <Num.Figure value={rows.length} locale={locale} />
        {t("of")}
        <Num.Figure value={total} locale={locale} />
      </p>

      <div className="overflow-x-auto rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
        <Table>
          <TableHeader>
            <TableRow className="border-rule bg-field hover:bg-field">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.money || c.figure ? "h-[34px] px-3 text-end" : "h-[34px] px-3"}
                >
                  <Eyebrow locale={locale} marker={false}>
                    {c.label}
                  </Eyebrow>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow
                key={(r.id as string) ?? i}
                className={
                  onRowClick ? "focus-ledger cursor-pointer border-rule-2" : "border-rule-2"
                }
                {...(onRowClick
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      "aria-label": rowLabel?.(r),
                      onClick: () => onRowClick(r),
                      onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        if (e.target !== e.currentTarget) return;
                        e.preventDefault();
                        onRowClick(r);
                      },
                    }
                  : {})}
              >
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <TableCell
                      key={c.key}
                      className={
                        c.money || c.figure ? "px-3 py-[7px] text-end" : "px-3 py-[7px] text-[13px]"
                      }
                    >
                      {c.render ? (
                        c.render(r)
                      ) : v == null ? (
                        "—"
                      ) : c.money ? (
                        <Num.Money
                          piasters={v as number}
                          locale={locale}
                          tone="muted"
                          sign={false}
                        />
                      ) : c.figure ? (
                        <Num.Figure value={v as number} locale={locale} />
                      ) : c.date ? (
                        <Num.Date
                          value={v as string}
                          locale={locale}
                          options={{ dateStyle: "medium", timeStyle: "short" }}
                          className="text-[11px] text-ink-3"
                        />
                      ) : c.code ? (
                        <Num.Code>{String(v)}</Num.Code>
                      ) : (
                        String(v)
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
