"use client";

import { useState } from "react";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCcw, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import type { Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { asKey } from "@/lib/i18n/keys";

type Period = { from: string; to: string };

type TrialBalance = {
  lines: { type: string; count: number; total: number }[];
  platformNet: number;
};

type RefundsReport = {
  count: number;
  total: number;
  refunds: { id: string; amount: number; createdAt: string; centerId: string | null }[];
};

const TABS = ["trialBalance", "refunds", "centerStatement", "teacherStatement"] as const;

export function FinanceReportsScreen() {
  const t = useTranslations();
  const [tab, setTab] = useState<string>("trialBalance");
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [centerId, setCenterId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const query: Record<string, string> = {};
  if (period.from) query.from = period.from;
  if (period.to) query.to = period.to;

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title={t("financeReports.title")} description={t("financeReports.description")} rule />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="rep-from">{t("financeReports.from")}</Label>
            <Input
              id="rep-from"
              type="date"
              value={period.from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rep-to">{t("financeReports.to")}</Label>
            <Input
              id="rep-to"
              type="date"
              value={period.to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <p className="text-xs text-ink-3">{t("financeReports.periodHint")}</p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((x) => (
            <TabsTrigger key={x} value={x}>
              {t(asKey(`financeReports.tab_${x}`))}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="trialBalance">
          {tab === "trialBalance" ? <TrialBalancePanel query={query} /> : null}
        </TabsContent>
        <TabsContent value="refunds">
          {tab === "refunds" ? <RefundsPanel query={query} /> : null}
        </TabsContent>
        <TabsContent value="centerStatement">
          <StatementPanel
            kind="center"
            id={centerId}
            setId={setCenterId}
            query={query}
            enabled={tab === "centerStatement"}
          />
        </TabsContent>
        <TabsContent value="teacherStatement">
          <StatementPanel
            kind="teacher"
            id={teacherId}
            setId={setTeacherId}
            query={query}
            enabled={tab === "teacherStatement"}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({
  req,
  children,
}: {
  req: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  children: React.ReactNode;
}) {
  const queryStrings = useQueryStrings();
  if (req.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (req.isError) {
    return (
      <EmptyState
        tone="error"
        icon={TriangleAlert}
        title={queryStrings.loadFailed}
        action={
          <Button variant="outline" onClick={() => void req.refetch()}>
            <RefreshCcw className="size-4" aria-hidden="true" />
            {queryStrings.retry}
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

function TrialBalancePanel({ query }: { query: Record<string, string> }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const req = useCustom<TrialBalance>({
    url: "finance/reports/trial-balance",
    method: "get",
    config: { query },
  });
  const data = req.result?.data as TrialBalance | undefined;

  return (
    <Panel req={req.query}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("financeReports.tab_trialBalance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("financeReports.colType")}</TableHead>
                <TableHead>{t("financeReports.colCount")}</TableHead>
                <TableHead>{t("financeReports.colTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.lines ?? []).map((l) => (
                <TableRow key={l.type}>
                  <TableCell>{t(asKey(`transactions.type_${l.type}`))}</TableCell>
                  <TableCell>
                    <Num.Figure value={l.count} locale={locale} />
                  </TableCell>
                  <TableCell>
                    <Num.Money piasters={l.total} locale={locale} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 flex items-baseline justify-between border-t border-rule pt-3 text-[13px] font-semibold">
            <span>{t("financeReports.platformNet")}</span>
            <Num.Money piasters={data?.platformNet ?? 0} locale={locale} />
          </p>
        </CardContent>
      </Card>
    </Panel>
  );
}

function RefundsPanel({ query }: { query: Record<string, string> }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const req = useCustom<RefundsReport>({
    url: "finance/reports/refunds",
    method: "get",
    config: { query },
  });
  const data = req.result?.data as RefundsReport | undefined;

  return (
    <Panel req={req.query}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("financeReports.tab_refunds")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-2">{t("financeReports.refundCount")}</span>
            <Num.Figure value={data?.count ?? 0} locale={locale} />
          </p>
          <p className="flex items-baseline justify-between text-[13px] font-semibold">
            <span>{t("financeReports.refundTotal")}</span>
            <Num.Money piasters={data?.total ?? 0} locale={locale} />
          </p>
          {(data?.refunds ?? []).length === 0 ? (
            <p className="text-[13px] text-ink-3">{t("financeReports.noRows")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("financeReports.colWhen")}</TableHead>
                  <TableHead>{t("financeReports.colTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.refunds ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Num.Date value={r.createdAt} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <Num.Money piasters={r.amount} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Panel>
  );
}

function StatementPanel({
  kind,
  id,
  setId,
  query,
  enabled,
}: {
  kind: "center" | "teacher";
  id: string;
  setId: (v: string) => void;
  query: Record<string, string>;
  enabled: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const req = useCustom<Record<string, unknown>>({
    url: `finance/reports/${kind}-statement/${id}`,
    method: "get",
    config: { query },
    queryOptions: { enabled: enabled && id.trim().length > 0 },
  });
  const data = req.result?.data as Record<string, unknown> | undefined;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`stmt-${kind}`}>
            {t(asKey(kind === "center" ? "financeReports.centerId" : "financeReports.teacherId"))}
          </Label>
          <Input
            id={`stmt-${kind}`}
            dir="ltr"
            className="max-w-md"
            value={id}
            placeholder="uuid"
            onChange={(e) => setId(e.target.value)}
          />
          <p className="text-xs text-ink-3">{t("financeReports.idHint")}</p>
        </div>

        {id.trim().length === 0 ? (
          <p className="text-[13px] text-ink-3">{t("financeReports.enterId")}</p>
        ) : (
          <Panel req={req.query}>
            <dl className="grid gap-1.5 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
              {Object.entries(data ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-ink-2">{k}</dt>
                  <dd className="min-w-0 truncate text-end text-ink" dir="ltr">
                    {typeof v === "number" ? (
                      <Num.Money piasters={v} locale={locale} />
                    ) : v === null || v === undefined ? (
                      "—"
                    ) : typeof v === "object" ? (
                      JSON.stringify(v)
                    ) : (
                      String(v)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}
      </CardContent>
    </Card>
  );
}
