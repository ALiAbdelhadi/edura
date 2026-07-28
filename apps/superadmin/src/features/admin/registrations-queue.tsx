"use client";

/* طلبات التسجيل / Registrations — a decision queue.
   ══════════════════════════════════════════════════════════════════════════════

   Converted to the list + panel archetype (D-038). The screen previously rendered a
   filled Approve and a FILLED DESTRUCTIVE Reject in every row, at equal weight — the
   exact pattern §5.2 removes from payouts, for the same reason: an operator scanning
   a queue should not have two saturated buttons per row competing for a decision they
   have not made yet. Selecting a row opens the panel; that is where the action lives.

   NOT a two-step commit. Approving a registration writes no ledger entry and the
   status can be changed again — claiming permanence where there is none devalues the
   ceremony where permanence is real (D-022). Rejection still requires its reason,
   because a rejection with no reason cannot be explained to the applicant (D-026). */

import React, { useEffect, useState } from "react";
import { useApiUrl, useCustom, useInvalidate } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Check, Landmark, RefreshCcw, TriangleAlert, UserRound, X } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num, ProseCount } from "@repo/ui/components/num";
import { StatusBadge, type StatusTone } from "@repo/ui/components/status-badge";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { asKey } from "@/lib/i18n/keys";

type CenterRow = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  admins: { name: string; email: string | null }[];
};
type TeacherRow = { id: string; name: string; email: string | null; status: string; createdAt: string };
type Kind = "centers" | "teachers";

type Selected = {
  kind: Kind;
  id: string;
  name: string;
  email: string | null;
  status: string;
  createdAt: string;
};

const TONE: Record<string, StatusTone> = {
  active: "paid",
  rejected: "rejected",
  pending: "pending",
};

const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export function RegistrationsQueue() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();

  const [status, setStatus] = useState<"pending" | "active" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Selected | null>(null);

  const { query, result } = useCustom<{ centers: CenterRow[]; teachers: TeacherRow[] }>({
    url: "admin/registrations",
    method: "get",
    config: { query: { status } },
  });

  const centers = result?.data?.centers ?? [];
  const teachers = result?.data?.teachers ?? [];

  // The panel must never outlive its subject (D-038).
  useEffect(() => {
    if (!open) return;
    const still =
      open.kind === "centers"
        ? centers.some((c) => c.id === open.id)
        : teachers.some((x) => x.id === open.id);
    if (!still) setOpen(null);
  }, [centers, teachers, open]);

  const refresh = () => void query.refetch();

  async function runDecision(kind: Kind, id: string, decision: "approve" | "reject", reason?: string) {
    setBusy(id);
    try {
      const res = await fetch(`${apiUrl}/admin/${kind}/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "reject" ? { reason } : {}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || t("common.requestFailed"));
      }
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
            tone={TONE[row.original.status] ?? "neutral"}
            // Waiting is the operator's real metric (D-026).
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

  const total = centers.length + teachers.length;

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
              setStatus(s);
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
          {query.isLoading ? (
            <TableSkeleton rows={4} columns={3} />
          ) : query.isError ? (
            (() => {
              const denied = (query.error as { statusCode?: number } | null)?.statusCode === 403;
              return (
                <EmptyState
                  tone={denied ? "denied" : "error"}
                  icon={TriangleAlert}
                  title={t(denied ? "adminManage.reg_deniedTitle" : "adminManage.reg_loadError")}
                  description={t(denied ? "adminManage.reg_deniedBody" : "adminManage.reg_loadErrorBody")}
                  action={
                    denied ? undefined : (
                      <Button variant="outline" onClick={refresh}>
                        <RefreshCcw className="size-4" aria-hidden="true" />
                        {t("adminManage.reg_retry")}
                      </Button>
                    )
                  }
                />
              );
            })()
          ) : total === 0 ? (
            <EmptyState
              tone="empty"
              icon={Landmark}
              title={status === "pending" ? t("adminManage.noPendingCenters") : t("adminManage.noCenters")}
              description={status === "pending" ? t("adminManage.noCentersDesc") : undefined}
            />
          ) : (
            <>
              {centers.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <Eyebrow locale={locale}>{t("nav.centers")}</Eyebrow>
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
                  <Eyebrow locale={locale}>{t("nav.teachers")}</Eyebrow>
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
          )}
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
              {/* One press — this writes no ledger entry (D-022). */}
              <Button
                className="h-[46px] w-full justify-center gap-2 font-semibold"
                disabled={busy === selected.id}
                onClick={() => onDecide(selected.kind, selected.id, "approve")}
              >
                <Check className="size-4" aria-hidden="true" />
                {t("actions.approve")}
              </Button>
              {/* Bordered, never filled — not a twin of the approve. */}
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
          <StatusBadge tone={TONE[selected.status] ?? "neutral"}>
            {t(asKey(`status.${selected.status}`))}
          </StatusBadge>
        </div>
      )}
    </aside>
  );
}
