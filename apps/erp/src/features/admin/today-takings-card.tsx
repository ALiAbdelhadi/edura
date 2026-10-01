"use client";

import { Link } from "@/i18n/navigation";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { QuerySection } from "@repo/ui/components/query-section";
import { useList } from "@refinedev/core";
import { todayKey } from "@repo/shared/date-key";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Amount, Eyebrow, Sheet, SheetHead } from "./ledger";
import { takingsOf, type TakingsRow } from "./takings";

export function TodayTakingsCard() {
  const t = useTranslations();
  const { locale } = useFormatters();

  const day = useMemo(() => todayKey(), []);

  const { query, result } = useList({
    resource: "payments",
    filters: [
      { field: "from", operator: "eq", value: day },
      { field: "to", operator: "eq", value: day },
    ],
    pagination: { mode: "off" },
  });

  const rows = (result?.data ?? []) as TakingsRow[];
  const takings = takingsOf(rows);
  if (query.isLoading) return null;

  return (
    <Sheet>
      <SheetHead
        title={t("adminHome.takings_title")}
        action={
          <Link
            href={`/dashboard/admin/fees?from=${day}&to=${day}`}
            className="text-[13px] font-semibold text-(--indigo)"
          >
            {t("adminHome.takings_seeRows")}
          </Link>
        }
      />
      <QuerySection query={query} skeleton={<></>} className="m-4.5">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 p-4.5">
        <div className="min-w-40">
          <Eyebrow>{t("adminHome.takings_net")}</Eyebrow>
          <p className="mt-1.5 mb-0">
            <Amount
              piasters={takings.net}
              locale={locale}
              className="text-2xl font-semibold tracking-[-0.01em] text-(--money)"
            />
          </p>
          <p className="mt-1 mb-0 text-[12px] text-(--ink-3)">
            {t("adminHome.takings_receipts", { n: takings.receipts })}
          </p>
        </div>
        {takings.refunds > 0 ? (
          <>
            <div aria-hidden className="hidden h-11.5 w-px bg-(--rule) sm:block" />
            <div className="min-w-35">
              <Eyebrow>{t("adminHome.takings_refunded")}</Eyebrow>
              <p className="mt-1.5 mb-0">
                <Amount
                  piasters={-takings.refunded}
                  locale={locale}
                  className="text-base font-semibold text-destructive"
                />
              </p>
              <p className="mt-1 mb-0 text-xs text-(--ink-3)">
                {t("adminHome.takings_refundCount", { n: takings.refunds })}
              </p>
            </div>
          </>
        ) : null}
        {takings.receipts === 0 && takings.refunds === 0 ? (
          <p className="m-0 self-center text-sm text-(--ink-3)">
            {t("adminHome.takings_none")}
          </p>
        ) : null}
      </div>
      </QuerySection>
      <p className="m-0 border-t border-(--rule-2) px-4.5 py-2 text-xs text-(--ink-3)">
        {t("adminHome.takings_methodNote")}
      </p>
    </Sheet>
  );
}
