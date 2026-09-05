"use client";

import { useState } from "react";
import { useCustom } from "@refinedev/core";
import { useLocale, useTranslations } from "next-intl";
import { ShieldBan, UserRound, X } from "lucide-react";

import { IdentityCell, initialsOf } from "@repo/ui/components/identity-cell";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";

import type { ColumnDef } from "@/components/kit/data-table";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { ListFilter, ListSearch, ListShell } from "@/components/kit/list-shell";
import { ReasonDialog } from "@/components/kit/reason-dialog";
import { useAction } from "@/lib/api/use-action";
import { useListScreen } from "@/lib/api/use-list-screen";
import { asKey } from "@/lib/i18n/keys";

type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  attendanceMode: "counter_only" | "counter_and_door" | null;
  centers: { centerId: string; name: string | null; status: string }[];
};

type CenterOption = { id: string; name: string };

const MODES = ["counter_only", "counter_and_door"] as const;
const STATUSES = ["active", "pending", "suspended"] as const;

export function TeachersScreen() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const list = useListScreen<TeacherRow>({ resource: "admin/teachers" });
  const [pendingMode, setPendingMode] = useState<{ id: string; mode: string } | null>(null);
  const [banning, setBanning] = useState<TeacherRow | null>(null);
  const { run: patch } = useAction({ method: "patch" });
  const { run: post } = useAction();
  const { run: link, busyKey: linkBusy } = useAction({
    onSuccess: () => list.query.refetch(),
  });
  const [linking, setLinking] = useState<TeacherRow | null>(null);

  // Centres are picked, not typed. Loaded only when the picker opens.
  const centersQ = useCustom<CenterOption[]>({
    url: "admin/centers",
    method: "get",
    config: { query: { take: "100" } },
    queryOptions: { enabled: !!linking },
  });
  const centerOptions = (() => {
    const d = centersQ.result?.data as unknown;
    return Array.isArray(d) ? (d as CenterOption[]) : [];
  })();

  // NOTE: the normal path for a teacher to join a centre is a collaboration
  // request, which both sides accept. This is the administrative override for
  // when that flow cannot run -- it writes the affiliation directly.
  const linkCenter = (teacherId: string, centerId: string) =>
    link({
      url: `admin/teachers/${teacherId}/link-center`,
      values: { centerId },
      key: teacherId,
      successMsg: t("teachers.centerLinked"),
    });

  const unlinkCenter = async (teacherId: string, centerId: string) => {
    const res = await link({
      url: `admin/teachers/${teacherId}/unlink-center`,
      method: "delete",
      query: { centerId },
      key: `${teacherId}:${centerId}`,
      successMsg: t("teachers.centerUnlinked"),
    });
    if (!res.ok) throw res.error;
  };

  const blacklist = async (reason: string) => {
    if (!banning) return;
    const res = await post({
      url: `admin/teachers/${banning.id}/blacklist`,
      values: { reason },
      successMsg: t("blacklist.blacklistedToast"),
    });
    if (!res.ok) throw res.error;
    setBanning(null);
    list.query.refetch();
  };

  const setTeacherMode = async (row: TeacherRow, next: string) => {
    if (next === row.attendanceMode || pendingMode) return;
    setPendingMode({ id: row.id, mode: next });
    try {
      const res = await patch({
        url: `admin/teachers/${row.id}/attendance-mode`,
        values: { mode: next },
        successMsg: t("teachers.modeSaved"),
      });
      if (res.ok) list.query.refetch();
    } finally {
      setPendingMode(null);
    }
  };

  const columns: ColumnDef<TeacherRow, unknown>[] = [
    {
      id: "name",
      header: t("teachers.colName"),
      cell: ({ row }) => (
        <IdentityCell
          initials={initialsOf(row.original.name ?? "—")}
          name={row.original.name ?? "—"}
        />
      ),
    },
    {
      id: "contact",
      header: t("teachers.colContact"),
      cell: ({ row }) => (
        <>
          {row.original.email ? (
            <Num.Code className="block">{row.original.email}</Num.Code>
          ) : (
            <span className="text-[13px]">—</span>
          )}
          {row.original.phone ? (
            <Num.Code className="block">{row.original.phone}</Num.Code>
          ) : null}
        </>
      ),
    },
    {
      id: "status",
      header: t("teachers.colStatus"),
      cell: ({ row }) => (
        <StatusBadge tone={statusTone(row.original.status)}>
          {t(asKey(`status.${row.original.status}`))}
        </StatusBadge>
      ),
    },
    {
      id: "mode",
      header: t("teachers.colMode"),
      cell: ({ row }) =>
        row.original.attendanceMode === null ? (
          <span className="text-[11px] text-ink-3">{t("teachers.noProfile")}</span>
        ) : (
          <select
            value={
              pendingMode?.id === row.original.id
                ? pendingMode.mode
                : row.original.attendanceMode
            }
            aria-label={t("teachers.modeAria")}
            aria-busy={pendingMode?.id === row.original.id}
            disabled={pendingMode !== null}
            onChange={(e) => void setTeacherMode(row.original, e.target.value)}
            className="focus-ledger h-8 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {t(asKey(`teachers.mode_${m}`))}
              </option>
            ))}
          </select>
        ),
    },
    {
      id: "centers",
      header: t("teachers.colCenters"),
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.original.centers.map((c) => (
            <Badge key={c.centerId} variant="secondary" className="gap-1">
              {c.name ?? c.centerId.slice(0, 8)}
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    aria-label={t("teachers.unlinkCenter")}
                    disabled={linkBusy === `${row.original.id}:${c.centerId}`}
                    className="hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                }
                destructive
                title={t("teachers.unlinkTitle")}
                description={t("teachers.unlinkBody")}
                confirmText={t("teachers.unlinkCenter")}
                onConfirm={() => unlinkCenter(row.original.id, c.centerId)}
              />
            </Badge>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[12px]"
            onClick={() => setLinking(row.original)}
          >
            {t("teachers.linkCenter")}
          </Button>
        </div>
      ),
    },
    {
      id: "blacklist",
      header: t("common.colActions"),
      cell: ({ row }) =>
        row.original.status === "blacklisted" ? (
          <span className="text-[11px] text-red">{t("blacklist.stateActive")}</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-red"
            onClick={() => setBanning(row.original)}
          >
            <ShieldBan className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("blacklist.blacklistAction")}</span>
          </Button>
        ),
    },
    {
      id: "joined",
      header: t("teachers.colJoined"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.createdAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
  ];

  return (
    <>
    <ListShell
      list={list}
      title={t("teachers.title")}
      description={t("teachers.description")}
      columns={columns}
      toolbar={
        <>
          <ListSearch
            list={list}
            placeholder={t("teachers.searchPlaceholder")}
            clearLabel={t("teachers.clearSearch")}
          />
          <ListFilter
            list={list}
            name="status"
            anyLabel={t("teachers.anyStatus")}
            options={STATUSES}
            render={(s) => t(asKey(`status.${s}`))}
          />
          <ListFilter
            list={list}
            name="mode"
            anyLabel={t("teachers.anyMode")}
            options={MODES}
            render={(m) => t(asKey(`teachers.mode_${m}`))}
          />
        </>
      }
      loadingLabel={t("common.loading")}
      emptyIcon={UserRound}
      emptyTitle={t("teachers.empty")}
      emptyDescription={t("teachers.emptyBody")}
      errorTitle={t("teachers.loadError")}
      errorDescription={t("teachers.loadErrorBody")}
      deniedTitle={t("teachers.deniedTitle")}
      deniedDescription={t("teachers.deniedBody")}
    />

    <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("teachers.linkTitle")}</DialogTitle>
          <DialogDescription>{t("teachers.linkBody")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <label className="text-xs text-ink-2" htmlFor="link-center">
            {t("teachers.colCenters")}
          </label>
          <select
            id="link-center"
            defaultValue=""
            className="focus-ledger h-9 rounded-lg border border-rule bg-field px-2 text-[13px] text-ink"
            onChange={(e) => {
              const centerId = e.target.value;
              if (!centerId || !linking) return;
              void linkCenter(linking.id, centerId).then(() => setLinking(null));
            }}
          >
            <option value="">{t("teachers.pickCenter")}</option>
            {centerOptions
              .filter((c) => !linking?.centers.some((x) => x.centerId === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>
      </DialogContent>
    </Dialog>

    <ReasonDialog
      open={!!banning}
      onOpenChange={(o) => !o && setBanning(null)}
      title={t("blacklist.blacklistTitle")}
      description={t("blacklist.blacklistBody")}
      confirmText={t("blacklist.blacklistAction")}
      onConfirm={blacklist}
    />
    </>
  );
}
