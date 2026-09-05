"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useInvalidate } from "@refinedev/core";
import { api } from "@/lib/api/client";
import { useLocale, useTranslations } from "next-intl";
import { Check, Landmark, UserRound, X } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num, ProseCount } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

import { TwoStepCommit } from "@/components/kit/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { ListShell } from "@/components/kit/list-shell";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { useCustomListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type CenterRow = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  admins: { name: string; email: string | null }[];
};
type TeacherRow = { id: string; name: string; email: string | null; status: string; createdAt: string };
type Payload = {
  centers?: CenterRow[];
  teachers?: TeacherRow[];
  centersTotal?: number;
  teachersTotal?: number;
};
type Kind = "centers" | "teachers";

type Selected = {
  kind: Kind;
  id: string;
  name: string;
  email: string | null;
  status: string;
  createdAt: string;
};

const PAGE_SIZE = 20;

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function RegistrationsQueue() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const invalidate = useInvalidate();

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Selected | null>(null);

  const list = useCustomListScreen<CenterRow | TeacherRow>({
    url: "admin/registrations",
    pageSize: PAGE_SIZE,
    initialFilters: { status: "pending" },
    // `rows` exists so the shared shell knows whether the page is empty; the
    // two halves are read off `data` and rendered as their own sections.
    //
    // `total` is the LARGER half, not the sum: both halves share one page, so
    // "there is a next page" means either half still has rows past this one.
    // A sum would invent pages that neither half can fill.
    select: (d) => {
      const p = (d ?? {}) as Payload;
      return {
        rows: [...(p.centers ?? []), ...(p.teachers ?? [])],
        total: Math.max(p.centersTotal ?? 0, p.teachersTotal ?? 0),
      };
    },
  });

  const payload = (list.data ?? {}) as Payload;
  // Memoised because the effect below depends on them: `?? []` mints a new
  // array on every render while the request is in flight, which would re-run
  // the effect each time.
  const centers = useMemo(() => payload.centers ?? [], [payload.centers]);
  const teachers = useMemo(() => payload.teachers ?? [], [payload.teachers]);
  const centersTotal = payload.centersTotal ?? 0;
  const teachersTotal = payload.teachersTotal ?? 0;
  const status = (list.filter("status") ?? "pending") as "pending" | "active" | "rejected";
  const page = list.page;

  useEffect(() => {
    if (!open) return;
    const still =
      open.kind === "centers"
        ? centers.some((c) => c.id === open.id)
        : teachers.some((x) => x.id === open.id);
    if (!still) setOpen(null);
  }, [centers, teachers, open]);

  const refresh = () => void list.query.refetch();

  async function runDecision(kind: Kind, id: string, decision: "approve" | "reject", reason?: string) {
    setBusy(id);
    try {
      await api.post(`admin/${kind}/${id}/${decision}`, {
        json: decision === "reject" ? { reason } : {},
      });
      toast.success(decision === "approve" ? t("status.approved") : t("status.rejected"));
      setOpen(null);
      refresh();
      invalidate({ resource: "notifications", invalidates: ["list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setBusy(null);
    }
  }

  const identity = (name: string, email: string | null, kind: Kind) => (
    <IdentityCell
      kind={kind === "centers" ? "center" : "person"}
      initials={initialsOf(name)}
      name={name}
      meta={email ? <Num.Code>{email}</Num.Code> : undefined}
    />
  );

  function cols<T extends { id: string; status: string; createdAt: string }>(
    kind: Kind,
    nameOf: (r: T) => string,
    emailOf: (r: T) => string | null,
    headLabel: string,
  ): ColumnDef<T, unknown>[] {
    return [
      {
        id: "name",
        header: headLabel,
        cell: ({ row }) => identity(nameOf(row.original), emailOf(row.original), kind),
      },
      {
        id: "status",
        header: t("adminManage.colStatus"),
        cell: ({ row }) => (
          <StatusBadge
            tone={statusTone(row.original.status)}
            age={
              row.original.status === "pending" ? (
                <ProseCount
                  count={daysSince(row.original.createdAt)}
                  locale={locale}
                  forms={{
                    one: t("adminManage.reg_day_one"),
                    two: t.has(asKey("adminManage.reg_day_two"))
                      ? t(asKey("adminManage.reg_day_two"))
                      : undefined,
                    few: t.has(asKey("adminManage.reg_day_few"))
                      ? t(asKey("adminManage.reg_day_few"))
                      : undefined,
                    many: t("adminManage.reg_day_many"),
                  }}
                />
              ) : undefined
            }
          >
            {t(asKey(`status.${row.original.status}`))}
          </StatusBadge>
        ),
      },
      {
        id: "createdAt",
        header: t("adminManage.colSubmitted"),
        cell: ({ row }) => (
          <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
        ),
      },
    ];
  }


  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={t("nav.registrations")}
        description={t("adminManage.reg_subtitle")}
        rule
      />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rule bg-sheet px-4 py-3 shadow-[var(--lift)]">
        {(["pending", "active", "rejected"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => {
              list.setFilter("status", s);
              setOpen(null);
            }}
            className={cn(
              "focus-ledger rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
              status === s
                ? "border-indigo bg-indigo-soft font-semibold text-indigo"
                : "border-rule text-ink-2 hover:bg-rule-2",
            )}
          >
            {t(asKey(`status.${s}`))}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <ListShell
            list={list}
            loadingLabel={t("common.loading")}
            emptyIcon={Landmark}
            emptyTitle={
              status === "pending"
                ? t("adminManage.noPendingCenters")
                : t("adminManage.noCenters")
            }
            emptyDescription={
              status === "pending" ? t("adminManage.noCentersDesc") : undefined
            }
            errorTitle={t("adminManage.reg_loadError")}
            errorDescription={t("adminManage.reg_loadErrorBody")}
            deniedTitle={t("adminManage.reg_deniedTitle")}
            deniedDescription={t("adminManage.reg_deniedBody")}
            body={
              <>
                {centers.length > 0 ? (
                  <section className="flex flex-col gap-2">
                    <SectionHead
                      label={t("nav.centers")}
                      locale={locale}
                      page={page}
                      shown={centers.length}
                      total={centersTotal}
                    />
                    <DataTable<CenterRow, unknown>
                      columns={cols<CenterRow>(
                        "centers",
                        (r) => r.name,
                        (r) => r.admins[0]?.email ?? null,
                        t("nav.centers"),
                      )}
                      data={centers}
                      density="compact"
                      pageSize={centers.length || 1}
                      onRowClick={(r) =>
                        setOpen({
                          kind: "centers",
                          id: r.id,
                          name: r.name,
                          email: r.admins[0]?.email ?? null,
                          status: r.status,
                          createdAt: r.createdAt,
                        })
                      }
                    />
                  </section>
                ) : null}

                {teachers.length > 0 ? (
                  <section className="flex flex-col gap-2">
                    <SectionHead
                      label={t("nav.teachers")}
                      locale={locale}
                      page={page}
                      shown={teachers.length}
                      total={teachersTotal}
                    />
                    <DataTable<TeacherRow, unknown>
                      columns={cols<TeacherRow>(
                        "teachers",
                        (r) => r.name,
                        (r) => r.email,
                        t("nav.teachers"),
                      )}
                      data={teachers}
                      density="compact"
                      pageSize={teachers.length || 1}
                      onRowClick={(r) =>
                        setOpen({
                          kind: "teachers",
                          id: r.id,
                          name: r.name,
                          email: r.email,
                          status: r.status,
                          createdAt: r.createdAt,
                        })
                      }
                    />
                  </section>
                ) : null}
              </>
            }
            footer={
              list.pageCount > 1 ? (
                <div className="flex items-center justify-end gap-2 rounded-xl border border-rule bg-field px-4 py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => {
                      list.setPage(Math.max(1, page - 1));
                      setOpen(null);
                    }}
                  >
                    {t("adminManage.reg_prev")}
                  </Button>
                  <Num className="text-[11px] text-ink-3">
                    {page} / {list.pageCount}
                  </Num>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= list.pageCount}
                    onClick={() => {
                      list.setPage(page + 1);
                      setOpen(null);
                    }}
                  >
                    {t("adminManage.reg_next")}
                  </Button>
                </div>
              ) : (
                // The shared pager reports "from-to / total", which would be a
                // lie here: `total` is the larger half, not the row count.
                <></>
              )
            }
          />
        </div>

        <DecisionPanel
          selected={open}
          locale={locale}
          busy={busy}
          onClose={() => setOpen(null)}
          onDecide={runDecision}
        />
      </div>
    </div>
  );
}

function SectionHead({
  label,
  locale,
  page,
  shown,
  total,
}: {
  label: string;
  locale: Locale;
  page: number;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Eyebrow locale={locale}>{label}</Eyebrow>
      {total > shown ? (
        <Num className="text-[11px] text-ink-3">
          {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + shown} / {total}
        </Num>
      ) : null}
    </div>
  );
}

function DecisionPanel({
  selected,
  locale,
  busy,
  onClose,
  onDecide,
}: {
  selected: Selected | null;
  locale: Locale;
  busy: string | null;
  onClose: () => void;
  onDecide: (kind: Kind, id: string, decision: "approve" | "reject", reason?: string) => void;
}) {
  const t = useTranslations();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    setRejecting(false);
    setReason("");
  }, [selected?.id]);

  if (!selected) {
    return (
      <aside className="hidden w-[396px] shrink-0 self-stretch border-rule ps-5 lg:block lg:border-s">
        <EmptyState
          tone="empty"
          icon={UserRound}
          title={t("adminManage.reg_panelEmpty")}
          description={t("adminManage.reg_panelEmptyBody")}
        />
      </aside>
    );
  }

  const waiting = daysSince(selected.createdAt);
  const actionable = selected.status === "pending";

  return (
    <aside className="w-[396px] shrink-0 self-stretch border-rule ps-5 lg:border-s">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow locale={locale}>{t("adminManage.reg_panelEyebrow")}</Eyebrow>
          <h2 className="mt-1 truncate text-[17px] font-bold text-ink">{selected.name}</h2>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {selected.kind === "centers"
              ? t("adminManage.reg_kindCenter")
              : t("adminManage.reg_kindTeacher")}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("adminManage.reg_panelClose")}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <dl className="mt-4 flex flex-col gap-2 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{t("adminManage.reg_contact")}</dt>
          <dd>{selected.email ? <Num.Code>{selected.email}</Num.Code> : "—"}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-2">{t("adminManage.reg_submitted")}</dt>
          <dd>
            <Num.Date value={selected.createdAt} locale={locale} />
          </dd>
        </div>
        {actionable ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-2">{t("adminManage.reg_waiting")}</dt>
            <dd className="text-ink">
              <ProseCount
                count={waiting}
                locale={locale}
                forms={{
                  one: t("adminManage.reg_day_one"),
                  two: t.has(asKey("adminManage.reg_day_two")) ? t(asKey("adminManage.reg_day_two")) : undefined,
                  few: t.has(asKey("adminManage.reg_day_few")) ? t(asKey("adminManage.reg_day_few")) : undefined,
                  many: t("adminManage.reg_day_many"),
                }}
              />
            </dd>
          </div>
        ) : null}
      </dl>

      {actionable ? (
        <>
          <p className="mt-3 text-xs text-ink-3">{t("adminManage.reg_approveNote")}</p>

          {rejecting ? (
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-xs text-ink-2" htmlFor="reg-reason">
                {t("adminManage.rejectTitle")}
              </label>
              <Textarea
                id="reg-reason"
                rows={3}
                value={reason}
                aria-label={t("adminManage.rejectReasonAria")}
                placeholder={t("adminManage.reasonPlaceholder")}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-ink-3">{t("adminManage.rejectReasonHint")}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>
                  {t("actions.cancel")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red text-red hover:bg-red-soft"
                  disabled={busy === selected.id || !reason.trim()}
                  onClick={() => {
                    if (!reason.trim()) {
                      toast.error(t("adminManage.reasonRequired"));
                      return;
                    }
                    onDecide(selected.kind, selected.id, "reject", reason.trim());
                  }}
                >
                  {t("adminManage.reg_rejectSubmit")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {/* Approving activates a live account and grants access at once —
                  as irreversible as the reject beside it, which already costs a
                  typed reason. TwoStepCommit is the kit's arm-then-confirm
                  primitive, the same one guarding payout approval. */}
              <TwoStepCommit
                resetKey={selected.id}
                disabled={busy === selected.id}
                busy={busy === selected.id}
                icon={Check}
                onCommit={() => onDecide(selected.kind, selected.id, "approve")}
                labels={{
                  action: t("actions.approve"),
                  confirm: t("adminManage.reg_approveConfirm"),
                  armedHint: t("adminManage.reg_approveArmedHint"),
                  armedAnnouncement: t("adminManage.reg_approveAnnounce"),
                }}
              />
              <Button
                variant="outline"
                className="border-rule text-red hover:bg-red-soft"
                onClick={() => setRejecting(true)}
              >
                {t("actions.reject")}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4">
          <StatusBadge tone={statusTone(selected.status)}>
            {t(asKey(`status.${selected.status}`))}
          </StatusBadge>
        </div>
      )}
    </aside>
  );
}
