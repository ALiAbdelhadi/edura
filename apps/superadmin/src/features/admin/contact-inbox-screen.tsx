"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Inbox, Lock, Mail, Phone } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { toast } from "@repo/ui/components/sonner";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";

type Submission = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: string;
  source: string | null;
  status: "new" | "handled" | "spam";
  handledByName: string | null;
  handledAt: string | null;
  handledNote: string | null;
  createdAt: string;
};

const TONE = {
  new: "pending",
  handled: "paid",
  spam: "neutral",
} as const;

export function ContactInboxScreen() {
  const t = useTranslations("contactInbox");
  const locale = useLocale() as Locale;

  const [status, setStatus] = useState<string>("new");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query: Record<string, string> = { page: String(page), limit: "25" };
  if (status !== "all") query.status = status;
  if (q.trim()) query.q = q.trim();

  const req = useCustom({ url: "admin/contact-submissions", method: "get", config: { query } });
  const { mutateAsync: triage } = useCustomMutation();

  const result = req.result?.data as
    | { data: Submission[]; total: number; newCount: number }
    | undefined;
  const rows = result?.data ?? [];
  const total = result?.total ?? 0;
  const newCount = result?.newCount ?? 0;

  const setRowStatus = async (row: Submission, next: Submission["status"]) => {
    setBusy(row.id);
    try {
      await triage({
        url: `admin/contact-submissions/${row.id}/status`,
        method: "post",
        values: { status: next },
      });
      toast.success(t("triagedOk"));
      void req.query.refetch();
    } catch {
      toast.error(t("triageFail"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        rule
      />

      <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
        <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
        <span>{t("readOnlyNotice")}</span>
      </p>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        <label className="text-xs">
          <span className="mb-1 block text-ink-2">{t("filterSearch")}</span>
          <Input
            value={q}
            placeholder={t("filterSearchPlaceholder")}
            className="w-64"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <div className="flex gap-1">
          {(["new", "handled", "spam", "all"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? "default" : "outline"}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {t(`status.${s}`)}
            </Button>
          ))}
        </div>

        <div className="ms-auto text-xs text-ink-2">
          {t("waiting")} <Num.Figure value={newCount} locale={locale} />
        </div>
      </div>

      {req.query.isLoading ? (
        <PageSpinner label={t("loading")} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const expanded = open === row.id;
            return (
              <li
                key={row.id}
                className="rounded-xl border border-rule bg-sheet shadow-[var(--lift)]"
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : row.id)}
                  className="flex w-full items-start gap-3 p-4 text-start"
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{row.name}</span>
                      <StatusBadge tone={TONE[row.status]}>{t(`status.${row.status}`)}</StatusBadge>
                      {row.source ? (
                        <code className="num rounded bg-field px-1.5 py-0.5 text-[11px] text-ink-2" dir="ltr">
                          {row.source}
                        </code>
                      ) : null}
                    </div>
                    {row.subject ? (
                      <p className="mt-1 text-[13px] font-medium text-ink">{row.subject}</p>
                    ) : null}
                    {!expanded ? (
                      <p className="mt-1 line-clamp-1 text-[13px] text-ink-2">{row.message}</p>
                    ) : null}
                  </div>
                  <span className="num shrink-0 text-xs text-ink-3" dir="ltr">
                    {formatDate(row.createdAt, locale, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-rule px-4 py-4">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                      {row.message}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-2">
                      {row.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3.5" aria-hidden="true" />
                          <a className="num underline" dir="ltr" href={`mailto:${row.email}`}>
                            {row.email}
                          </a>
                        </span>
                      ) : null}
                      {row.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="size-3.5" aria-hidden="true" />
                          <span className="num" dir="ltr">
                            {row.phone}
                          </span>
                        </span>
                      ) : null}
                    </div>

                    {row.handledAt ? (
                      <p className="mt-3 text-xs text-ink-3">
                        {t("handledBy", {
                          who: row.handledByName ?? "—",
                          when: formatDate(row.handledAt, locale, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          }),
                        })}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {row.status !== "handled" ? (
                        <Button
                          size="sm"
                          disabled={busy === row.id}
                          onClick={() => void setRowStatus(row, "handled")}
                        >
                          {t("markHandled")}
                        </Button>
                      ) : null}
                      {row.status !== "spam" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === row.id}
                          onClick={() => void setRowStatus(row, "spam")}
                        >
                          {t("markSpam")}
                        </Button>
                      ) : null}
                      {row.status !== "new" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === row.id}
                          onClick={() => void setRowStatus(row, "new")}
                        >
                          {t("reopen")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {total > 25 ? (
        <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("prev")}
          </Button>
          <span>
            <Num.Figure value={total} locale={locale} /> {t("totalSuffix")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
