"use client";

import { useState } from "react";
import { useCustom, useOne } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { Award, GraduationCap, Link2, ShieldBan, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Dialog,
  DialogContent,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { LoadError } from "@repo/ui/components/ledger";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { StatusBadge } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { ReasonDialog } from "@/components/kit/reason-dialog";
import type { ColumnDef } from "@/components/kit/data-table";
import { ListSearch, ListShell } from "@/components/kit/list-shell";
import { Spinner } from "@/components/kit/spinner";
import { useAction } from "@/lib/api/use-action";
import { useListScreen } from "@/lib/api/use-list-screen";

type StudentRow = {
  id: string;
  userId: string | null;
  fullName: string | null;
  phone: string | null;
  grade: string | null;
  entityType: string | null;
  pointsBalance: number | null;
  createdAt: string;
};

type ParentLink = {
  linkId: string;
  parentId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type StudentDetail = {
  student: { id: string; userId: string | null; fullName: string | null; studentCode: string | null; grade: string | null };
  activeEnrollments: number;
  parentLinks: ParentLink[];
  blacklist: { level: string; reason: string | null }[];
};

type ParentOption = { id: string; name: string | null; email: string | null };

type LedgerRow = {
  id: string;
  eventName: string | null;
  reason: string | null;
  points: number;
  createdAt: string;
};

export function StudentsScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const [open, setOpen] = useState<StudentRow | null>(null);

  const list = useListScreen<StudentRow>({ resource: "admin/students" });

  // The roster row a super admin opens carries its parents, its enrollment
  // count and its blacklist entries -- none of which the list needs, so they
  // are fetched on open rather than shipped with every row.
  const detailQ = useOne({
    resource: "admin/students",
    id: open?.id ?? "",
    queryOptions: { enabled: !!open },
  });
  const detail = detailQ.result?.data as StudentDetail | undefined;

  const columns: ColumnDef<StudentRow, unknown>[] = [
    {
      id: "name",
      header: t("students.colName"),
      cell: ({ row }) => (
        <IdentityCell
          initials={initialsOf(row.original.fullName ?? "—")}
          name={row.original.fullName ?? "—"}
          meta={row.original.phone ? <Num.Code>{row.original.phone}</Num.Code> : undefined}
        />
      ),
    },
    {
      id: "grade",
      header: t("students.colGrade"),
      cell: ({ row }) => row.original.grade ?? <span className="text-ink-3">—</span>,
    },
    {
      id: "points",
      header: t("students.colPoints"),
      cell: ({ row }) => <Num.Figure value={row.original.pointsBalance ?? 0} locale={locale} />,
    },
    {
      id: "joined",
      header: t("students.colJoined"),
      cell: ({ row }) => (
        <Num.Date value={row.original.createdAt} locale={locale} className="text-[11px] text-ink-3" />
      ),
    },
  ];

  return (
    <>
      <ListShell
        list={list}
        title={t("students.title")}
        description={t("students.description")}
        columns={columns}
        onRowClick={(row) => setOpen(row)}
        rowLabel={(row) => row.fullName ?? row.id}
        toolbar={
          <ListSearch
            list={list}
            placeholder={t("students.searchPlaceholder")}
            clearLabel={t("students.clearSearch")}
          />
        }
        loadingLabel={t("common.loading")}
        emptyIcon={GraduationCap}
        emptyTitle={t("students.empty")}
        emptyDescription={t("students.emptyBody")}
        errorTitle={t("students.loadError")}
        errorDescription={t("students.loadErrorBody")}
        deniedTitle={t("students.deniedTitle")}
        deniedDescription={t("students.deniedBody")}
      />

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.fullName ?? t("students.detailTitle")}</DialogTitle>
          </DialogHeader>
          {detailQ.query.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : detailQ.query.isError || !detail ? (
            <LoadError
              message={queryStrings.loadFailed}
              onRetry={() => void detailQ.query.refetch()}
              retryLabel={queryStrings.retry}
            />
          ) : (
            <StudentDetailBody
              detail={detail}
              studentUserId={open?.userId ?? null}
              onChanged={() => {
                void detailQ.query.refetch();
                list.query.refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StudentDetailBody({
  detail,
  studentUserId,
  onChanged,
}: {
  detail: StudentDetail;
  studentUserId: string | null;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const queryStringsInner = useQueryStrings();
  const [linking, setLinking] = useState(false);
  const [blacklisting, setBlacklisting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [delta, setDelta] = useState("0");
  const { run, busy, busyKey } = useAction({ onSuccess: onChanged });

  // Parents are picked, not typed: a mistyped uuid would either 404 or, worse,
  // attach the wrong adult to a child.
  const parentsQ = useCustom<ParentOption[]>({
    url: "admin/users",
    method: "get",
    config: { query: { role: "parent", limit: "100" } },
    queryOptions: { enabled: linking },
  });
  const parents = (() => {
    const d = parentsQ.result?.data as unknown;
    return Array.isArray(d) ? (d as ParentOption[]) : [];
  })();
  const [parentId, setParentId] = useState("");

  const link = async () => {
    if (!parentId || !studentUserId) return;
    const res = await run({
      // NOTE: link/unlink address the student by USER id, while the detail
      // above is addressed by PROFILE id. Both come off the list row.
      url: `admin/students/${studentUserId}/link-parent`,
      values: { parentId },
      successMsg: t("students.parentLinked"),
    });
    if (res.ok) {
      setLinking(false);
      setParentId("");
    }
  };

  // Points activity is its own read, taken when the operator asks for it.
  const ledgerQ = useCustom<{ balance: number; ledger: LedgerRow[] }>({
    url: `admin/points/students/${studentUserId ?? ""}/ledger`,
    method: "get",
    queryOptions: { enabled: !!studentUserId && showLedger },
  });
  const ledger = ledgerQ.result?.data as { balance: number; ledger: LedgerRow[] } | undefined;

  const adjust = async (reason: string) => {
    const value = Number(delta);
    if (!studentUserId || !Number.isInteger(value) || value === 0) return;
    const res = await run({
      url: `admin/points/students/${studentUserId}/adjust`,
      values: { delta: value, reason },
      successMsg: t("points.adjusted"),
    });
    if (!res.ok) throw res.error;
    setDelta("0");
    void ledgerQ.query.refetch();
  };

  const blacklist = async (reason: string) => {
    if (!studentUserId) return;
    const res = await run({
      url: `admin/students/${studentUserId}/blacklist`,
      values: { reason },
      successMsg: t("blacklist.blacklistedToast"),
    });
    if (!res.ok) throw res.error;
  };

  const unlink = async (linkId: string) => {
    if (!studentUserId) return;
    const res = await run({
      url: `admin/students/${studentUserId}/unlink-parent`,
      method: "delete",
      query: { linkId },
      key: linkId,
      successMsg: t("students.parentUnlinked"),
    });
    if (!res.ok) throw res.error;
  };

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-2 rounded-[10px] border border-rule bg-field p-4 text-[13px]">
        <Fact label={t("students.studentCode")}>
          {detail.student.studentCode ? <Num.Code>{detail.student.studentCode}</Num.Code> : "—"}
        </Fact>
        <Fact label={t("students.colGrade")}>{detail.student.grade ?? "—"}</Fact>
        <Fact label={t("students.activeEnrollments")}>{detail.activeEnrollments}</Fact>
      </dl>

      {detail.blacklist.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {detail.blacklist.map((b, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-red bg-red-soft p-2.5">
              <TriangleAlert className="mt-px size-4 shrink-0 text-red" aria-hidden="true" />
              <div className="text-[13px] text-red">
                <StatusBadge tone="rejected">{b.level}</StatusBadge>
                {b.reason ? <p className="mt-1">{b.reason}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{t("students.parents")}</h3>
        {detail.parentLinks.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t("students.noParents")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {detail.parentLinks.map((p) => (
              <li key={p.linkId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">{p.name ?? "—"}</p>
                  {p.email ? <Num.Code className="text-[11px]">{p.email}</Num.Code> : null}
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon" className="size-7 text-red" disabled={busy}>
                      <Trash2 className="size-3.5" />
                      <span className="sr-only">{t("students.unlinkParent")}</span>
                    </Button>
                  }
                  destructive
                  title={t("students.unlinkTitle")}
                  description={t("students.unlinkBody")}
                  onConfirm={() => unlink(p.linkId)}
                />
              </li>
            ))}
          </ul>
        )}

        {linking ? (
          <DialogForm
            onSubmit={() => void link()}
            className="flex flex-col gap-2 rounded-lg border border-rule p-3"
          >
            <label className="text-xs text-ink-2" htmlFor="link-parent">
              {t("students.pickParent")}
            </label>
            <select
              id="link-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="focus-ledger h-9 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink"
            >
              <option value="">{t("students.pickParentPlaceholder")}</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.email ?? p.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setLinking(false)}>
                {t("actions.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={!parentId || busy}>
                {busy && busyKey === null ? <Spinner /> : null}
                {t("students.linkParent")}
              </Button>
            </div>
          </DialogForm>
        ) : (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={!studentUserId}
              onClick={() => setLinking(true)}
            >
              <Link2 className="size-4" aria-hidden="true" />
              {t("students.linkParent")}
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-rule pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-ink">{t("points.ledger")}</h3>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowLedger((v) => !v)}>
              <Award className="size-4" aria-hidden="true" />
              {showLedger ? t("actions.hide") : t("actions.view")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!studentUserId || busy}
              onClick={() => setAdjusting(true)}
            >
              {t("points.adjust")}
            </Button>
          </div>
        </div>

        {showLedger ? (
          ledgerQ.query.isLoading ? (
            <div className="flex justify-center py-3">
              <Spinner />
            </div>
          ) : ledgerQ.query.isError || !ledger ? (
            <p className="text-[13px] text-red">{queryStringsInner.loadFailed}</p>
          ) : (
            <>
              <p className="text-[13px] text-ink-2">
                {t("points.balance")}: <Num.Figure value={ledger.balance} locale={locale} />
              </p>
              {ledger.ledger.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("points.noLedger")}</p>
              ) : (
                <ul className="flex max-h-56 flex-col divide-y divide-rule overflow-y-auto">
                  {ledger.ledger.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span className="min-w-0 truncate text-ink-2">{e.reason ?? e.eventName}</span>
                      <Num.Figure
                        value={e.points}
                        locale={locale}
                        className={e.points < 0 ? "text-red" : "text-ink"}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        ) : null}
      </section>

      <section className="flex flex-col items-start gap-2 border-t border-rule pt-3">
        <Button
          size="sm"
          variant="outline"
          className="border-red text-red hover:bg-red-soft"
          disabled={!studentUserId || busy}
          onClick={() => setBlacklisting(true)}
        >
          <ShieldBan className="size-4" aria-hidden="true" />
          {t("blacklist.blacklistAction")}
        </Button>
      </section>

      <ReasonDialog
        open={adjusting}
        onOpenChange={(o) => {
          if (!o) setDelta("0");
          setAdjusting(o);
        }}
        destructive={false}
        title={t("points.adjustTitle")}
        description={t("points.adjustBody")}
        confirmText={t("points.adjust")}
        onConfirm={adjust}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="points-delta">{t("points.adjustDelta")}</Label>
          <Input
            id="points-delta"
            type="number"
            step={1}
            dir="ltr"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={blacklisting}
        onOpenChange={setBlacklisting}
        title={t("blacklist.blacklistTitle")}
        description={t("blacklist.blacklistBody")}
        confirmText={t("blacklist.blacklistAction")}
        onConfirm={blacklist}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
