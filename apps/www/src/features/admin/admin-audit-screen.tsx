"use client";

/* سجل التدقيق / Center audit log — the owner's copy.
   ══════════════════════════════════════════════════════════════════════════════

   The back office has had this screen since the center-oversight work; the people
   whose staff the log is ABOUT did not. That asymmetry is the thing being fixed:
   a center owner is asked to trust a record of their own counter, and trust needs
   to be inspectable.

   The form follows the guarantee, exactly as in the back-office twin:

   - THE ACTOR IS NEVER BLANK. An unattributed action in an audited system is a gap
     the interface should not create — an automated write reads «النظام».
   - STICKY DAY HEADERS. A log is read as a sequence of days.
   - BEFORE AND AFTER, SIDE BY SIDE. What makes an action checkable is not that it
     was logged but that the CHANGE is legible.
   - EVERY REF IS MONO AND ISOLATED. Action names, ids and timestamps are Latin runs
     sitting beside Arabic prose — the product's most common bidi break.
   - AND ONE THING THE BACK OFFICE DOES NOT SAY: this screen states, in the owner's
     own language, that the log cannot be edited — by them, by their staff, or by
     us. A tamper-proof record nobody knows is tamper-proof buys no trust. */

import { Fragment, useEffect, useState } from "react";
import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, ScrollText } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";

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
        today: new Date(now).toISOString().slice(0, 10),
        yesterday: new Date(now - 86_400_000).toISOString().slice(0, 10),
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

  const req = useCustom({ url: "center/audit-logs", method: "get", config: { query } });
  const optionsReq = useCustom({ url: "center/audit-logs/actors", method: "get" });

  const result = req.result?.data as { data: Row[]; total: number } | undefined;
  const options = optionsReq.result?.data as Options | undefined;
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

  // Grouped into days so each day carries a sticky header.
  const days: { day: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    const last = days[days.length - 1];
    if (last && last.day === k) last.rows.push(r);
    else days.push({ day: k, rows: [r] });
  }

  const dayLabel = (day: string) => {
    // `today` / `yesterday` come from state, not from a clock read during
    // render: reading the clock while rendering is impure (the same render can
    // produce different output), and it is also wrong across midnight — a
    // board left open overnight would keep calling yesterday "today" until
    // something unrelated re-rendered it. The effect below re-stamps on mount
    // and once an hour.
    if (day === todayKeys.today) return t("today");
    if (day === todayKeys.yesterday) return t("yesterday");
    return formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("subtitle")} />

      {/* The guarantee, stated to the person being asked to rely on it. */}
      <p className="flex gap-2 rounded-xl border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>{t("immutableNotice")}</span>
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterActor")}</span>
          <select
            value={actorId}
            onChange={(e) => {
              setActorId(e.target.value);
              setPage(1);
            }}
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

        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterFrom")}</span>
          <Input
            type="date"
            value={from}
            className="w-40"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterTo")}</span>
          <Input
            type="date"
            value={to}
            className="w-40"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            {t("clear")}
          </Button>
        ) : null}
      </div>

      {req.query.isLoading ? (
        <PageSpinner label={t("loading")} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-rule bg-sheet shadow-[var(--lift)]">
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
                        <code className="num text-[12px] font-medium text-ink" dir="ltr">
                          {r.action}
                        </code>
                        <p className="mt-0.5 text-[12px] text-ink-2">
                          {/* NEVER blank. */}
                          {r.actorName ?? t("system")}
                          {r.onBehalfOf ? (
                            <span className="text-ink-3">
                              {" "}
                              — {t("onBehalfOf")} {r.onBehalfOfName ?? ""}
                            </span>
                          ) : null}
                        </p>
                        {r.targetId ? (
                          <code className="num mt-0.5 block text-[11px] text-ink-3" dir="ltr">
                            {r.targetType ? `${r.targetType} · ` : ""}
                            {r.targetId}
                          </code>
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
