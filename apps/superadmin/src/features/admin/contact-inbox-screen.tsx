"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Inbox, Lock, Mail, Phone } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { formatDate, type Locale } from "@repo/ui/lib/format";

import { ListButtonFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";
import { useAction } from "@/lib/api/use-action";

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


export function ContactInboxScreen() {
  const t = useTranslations("contactInbox");
  const locale = useLocale() as Locale;

  const [open, setOpen] = useState<string | null>(null);

  const list = useCustomListScreen<Submission>({
    url: "admin/contact-submissions",
    initialFilters: { status: "new" },
    select: (data) => {
      const d = data as { data?: Submission[]; total?: number } | undefined;
      return { rows: d?.data ?? [], total: d?.total ?? 0 };
    },
  });
  // The unread count is about the whole inbox rather than this page, so it
  // rides on the same response instead of costing a second request.
  const newCount = (list.data as { newCount?: number } | undefined)?.newCount ?? 0;
  const { run: triage, busyKey: busy } = useAction({
    method: "post",
    successMsg: t("triagedOk"),
  });

  const setRowStatus = async (row: Submission, next: Submission["status"]) => {
    const res = await triage({
      url: `admin/contact-submissions/${row.id}/status`,
      values: { status: next },
      key: row.id,
    });
    if (res.ok) list.query.refetch();
  };

  return (
    <ListShell
      list={list}
      title={t("title")}
      description={t("subtitle")}
      loadingLabel={t("loading")}
      emptyIcon={Inbox}
      emptyTitle={t("emptyTitle")}
      emptyDescription={t("emptyBody")}
      notice={
        <p className="flex gap-2 rounded-lg border border-rule bg-field p-3 text-[13px] text-ink-2">
          <Lock className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>{t("readOnlyNotice")}</span>
        </p>
      }
      toolbar={
        <>
          <ListSearch
            list={list}
            className="w-64"
            placeholder={t("filterSearchPlaceholder")}
            clearLabel={t("filterSearch")}
          />
          <ListButtonFilter
            list={list}
            name="status"
            options={["new", "handled", "spam"]}
            render={(s) => t(asKey(`status.${s}`))}
            allLabel={t("status.all")}
          />
          <div className="ms-auto text-xs text-ink-2">
            {t("waiting")} <Num.Figure value={newCount} locale={locale} />
          </div>
        </>
      }
      // A submission is a message with a body to read and a triage decision to
      // make on it — an expandable card, not a table row.
      body={
        <ul className="flex flex-col gap-2">
          {list.rows.map((row) => {
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
                      <StatusBadge tone={statusTone(row.status)}>{t(`status.${row.status}`)}</StatusBadge>
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
      }
    />
  );
}
