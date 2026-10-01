"use client";

import { DateRangeField } from "@/components/kit/date-range-field";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { useOnDemand } from "@/lib/api/use-on-demand";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@/lib/refine";
import { todayKey } from "@repo/shared/date-key";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { ChevronDown, ChevronRight, Lock, ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useEffect, useState } from "react";

type Row = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  beforeState: unknown;
  afterState: unknown;
  onBehalfOf: string | null;
  onBehalfOfName: string | null;
  createdAt: string;
};

type Options = {
  actors: { id: string; name: string; role: string }[];
  actions: string[];
};

const PAGE_SIZE = 50;
const dayKey = (iso: string) => iso.slice(0, 10);

export function AdminAuditScreen() {
  const t = useTranslations("centerAudit");
  const queryStrings = useQueryStrings();
  const { formatDate } = useFormatters();

  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [todayKeys, setTodayKeys] = useState<{ today: string; yesterday: string }>({
    today: "",
    yesterday: "",
  });

  useEffect(() => {
    const stamp = () => {
      const now = Date.now();
      setTodayKeys({
        today: todayKey(new Date(now)),
        yesterday: todayKey(new Date(now - 86_400_000)),
      });
    };
    stamp();
    const id = setInterval(stamp, 3_600_000);
    return () => clearInterval(id);
  }, []);

  const query: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
  if (actorId) query.actorId = actorId;
  if (action.trim()) query.action = action.trim();
  if (from) query.from = from;
  if (to) query.to = to;

  const req = useCustom({ url: "center/audit-logs", method: "get", config: { query }, queryOptions: QUERY_FRESHNESS.list });
  const optionsReq = useOnDemand<Options>("center/audit-logs/actors");

  const result = req.result?.data as { data: Row[]; total: number } | undefined;
  const options = optionsReq.data;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;

  const hasFilters = !!(actorId || action.trim() || from || to);
  const clear = () => {
    setActorId("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  const days: { day: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    const last = days.at(-1);
    if (last && last.day === k) last.rows.push(r);
    else days.push({ day: k, rows: [r] });
  }

  const dayLabel = (day: string) => {
    if (day === todayKeys.today) return t("today");
    if (day === todayKeys.yesterday) return t("yesterday");
    return formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <p className="flex gap-2 rounded-xl border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>{t("immutableNotice")}</span>
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-(--lift)">
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterActor")}</span>
          <select
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
            onFocus={optionsReq.request}
            onPointerDown={optionsReq.request}
            className="focus-ledger h-9 w-52 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink"
          >
            <option value="">{t("filterActorPlaceholder")}</option>
            {(options?.actors ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterAction")}</span>
          <Input
            value={action}
            list="center-audit-actions"
            placeholder={t("filterActionPlaceholder")}
            className="num w-56"
            dir="ltr"
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
          <datalist id="center-audit-actions">
            {(options?.actions ?? []).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <DateRangeField
          value={{ from, to }}
          onChange={(next) => {
            setFrom(next.from);
            setTo(next.to);
            setPage(1);
          }}
          formatDate={formatDate}
          placeholder={t("filterFrom")}
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            {t("clear")}
          </Button>
        ) : null}
      </div>
      {req.query.isLoading ? (
        <PageSpinner label={t("loading")} />
      ) : req.query.isError ? (
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={() => req.query.refetch()}
          retryLabel={queryStrings.retry}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-(--lift)">
          {days.map(({ day, rows: dayRows }) => (
            <Fragment key={day}>
              <p className="sticky top-0 z-10 border-b border-rule bg-field px-4 py-1.5 text-[11px] font-semibold text-ink-2">
                {dayLabel(day)}
              </p>
              {dayRows.map((r) => {
                const open = expanded === r.id;
                const hasDiff = r.beforeState != null || r.afterState != null;
                return (
                  <div key={r.id} className="border-b border-rule-2 last:border-b-0">
                    <button
                      type="button"
                      disabled={!hasDiff}
                      onClick={() => setExpanded(open ? null : r.id)}
                      aria-expanded={open}
                      className="flex w-full items-start gap-3 px-4 py-3 text-start disabled:cursor-default"
                    >
                      {hasDiff ? (
                        open ? (
                          <ChevronDown className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                        ) : (
                          <ChevronRight
                            className="mt-0.5 size-4 shrink-0 text-ink-3 rtl:rotate-180"
                            aria-hidden="true"
                          />
                        )
                      ) : (
                        <span className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-[12px] font-medium text-ink">
                          {actionLabel(r.action, t)}
                        </span>
                        <p className="mt-0.5 text-[12px] text-ink-2">
                          {r.actorName ?? t("system")}
                          {r.onBehalfOf ? (
                            <span className="text-ink-3">
                              {" "}
                              — {t("onBehalfOf")} {r.onBehalfOfName ?? ""}
                            </span>
                          ) : null}
                        </p>
                        {r.targetId ? (
                          <p className="mt-0.5 text-[11px] text-ink-3">
                            {r.targetType ? entityLabel(r.targetType, t) : null}
                            {r.targetType ? " · " : ""}
                            <code className="num" dir="ltr">{r.targetId}</code>
                          </p>
                        ) : null}
                      </div>
                      <code className="num shrink-0 text-[11px] text-ink-3" dir="ltr">
                        {formatDate(r.createdAt, { hour: "2-digit", minute: "2-digit" })}
                      </code>
                    </button>
                    {open && hasDiff ? (
                      <div className="grid grid-cols-1 gap-3 border-t border-rule-2 bg-field px-4 py-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-ink-3">{t("before")}</p>
                          <pre
                            className="num overflow-x-auto rounded-lg border border-rule bg-sheet p-2 text-[11px] text-ink-2"
                            dir="ltr"
                          >
                            {JSON.stringify(r.beforeState ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold text-ink-3">{t("after")}</p>
                          <pre
                            className="num overflow-x-auto rounded-lg border border-rule bg-sheet p-2 text-[11px] text-ink-2"
                            dir="ltr"
                          >
                            {JSON.stringify(r.afterState ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("prev")}
          </Button>
          <span className="num" dir="ltr">
            {total} {t("totalSuffix")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function actionLabel(action: string, t: ReturnType<typeof useTranslations<"centerAudit">>): string {
  const key = `action_${action.replace(/\./g, "_")}` as never;
  if (t.has(key)) return t(key);
  return action.replace(/[._]/g, " ").trim();
}

function entityLabel(entity: string, t: ReturnType<typeof useTranslations<"centerAudit">>): string {
  const key = `entity_${entity}` as never;
  if (t.has(key)) return t(key);
  return entity.replace(/[._]/g, " ").trim();
}
