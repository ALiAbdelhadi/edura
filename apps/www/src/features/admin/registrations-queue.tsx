"use client";

import React, { useState } from "react";
import { useCustom, useApiUrl, useInvalidate } from "@refinedev/core";
import { Landmark, UserRound, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@repo/ui/components/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { toast } from "@repo/ui/components/sonner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Spinner } from "@/components/kit/spinner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { PageHeader } from "@/components/kit/page-header";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { TableSkeleton } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/kit/empty-state";

type CenterRow = { id: string; name: string; status: string; createdAt: string; admins: { name: string; email: string | null }[] };
type TeacherRow = { id: string; name: string; email: string | null; status: string; createdAt: string };

type Kind = "centers" | "teachers";

export function RegistrationsQueue() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const apiUrl = useApiUrl();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState<"pending" | "active" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ kind: Kind; id: string } | null>(null);
  const [reason, setReason] = useState("");

  const { query, result } = useCustom<{ centers: CenterRow[]; teachers: TeacherRow[] }>({
    url: "admin/registrations",
    method: "get",
    config: { query: { status } },
  });

  const centers = result?.data?.centers ?? [];
  const teachers = result?.data?.teachers ?? [];

  const refresh = () => query.refetch();

  async function runDecision(kind: Kind, id: string, decision: "approve" | "reject", rejectReason?: string) {
    setBusy(id);
    try {
      const res = await fetch(`${apiUrl}/admin/${kind}/${id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "reject" ? { reason: rejectReason } : {}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error?.message || t("common.requestFailed"));
      }
      toast.success(decision === "approve" ? t("status.approved") : t("status.rejected"));
      refresh();
      invalidate({ resource: "notifications", invalidates: ["list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.failed"));
    } finally {
      setBusy(null);
    }
  }

  function openReject(kind: Kind, id: string) {
    setReason("");
    setRejectTarget({ kind, id });
  }

  function confirmReject() {
    if (!reason.trim()) {
      toast.error(t("adminManage.reasonRequired"));
      return;
    }
    const target = rejectTarget;
    if (!target) return;
    setRejectTarget(null);
    void runDecision(target.kind, target.id, "reject", reason);
  }

  const statusBadge = (s: string) => {
    const tone: StatusTone = s === "active" ? "success" : s === "rejected" ? "danger" : "warning";
    const label = t(("status." + s) as Parameters<typeof t>[0]);
    return <StatusBadge tone={tone}>{label}</StatusBadge>;
  };

  const renderActions = (kind: Kind, r: { id: string; status: string }) =>
    r.status === "pending" ? (
      <div className="flex items-center gap-2">
        <ConfirmDialog
          trigger={
            <Button size="sm" disabled={busy === r.id}>
              {busy === r.id ? <Spinner /> : <Check className="size-4" />}
              {t("actions.approve")}
            </Button>
          }
          title={t("adminManage.confirmApprovalTitle")}
          description={t("adminManage.confirmApprovalBody")}
          confirmText={t("actions.approve")}
          cancelText={t("actions.cancel")}
          onConfirm={() => void runDecision(kind, r.id, "approve")}
        />
        <Button
          size="sm"
          variant="destructive"
          disabled={busy === r.id}
          onClick={() => openReject(kind, r.id)}
        >
          <X className="size-4" />
          {t("actions.reject")}
        </Button>
      </div>
    ) : null;

  const centerCols: ColumnDef<CenterRow>[] = [
    {
      id: "name",
      header: t("nav.centers"),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2">
            <Landmark aria-hidden className="size-4 text-info" />
            <div>
              <p className="font-medium text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.admins[0]?.email ?? "—"}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("adminManage.colStatus"),
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: "createdAt",
      header: "",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => renderActions("centers", row.original),
    },
  ];

  const teacherCols: ColumnDef<TeacherRow>[] = [
    {
      id: "name",
      header: t("nav.teachers"),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2">
            <UserRound aria-hidden className="size-4 text-primary" />
            <div>
              <p className="font-medium text-foreground">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.email ?? "—"}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: "createdAt",
      header: "",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => renderActions("teachers", row.original),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("nav.registrations")} />

      <ToggleGroup
        type="single"
        variant="outline"
        value={status}
        onValueChange={(v) => v && setStatus(v as typeof status)}
      >
        <ToggleGroupItem value="pending">{t("status.pending")}</ToggleGroupItem>
        <ToggleGroupItem value="active">{t("status.active")}</ToggleGroupItem>
        <ToggleGroupItem value="rejected">{t("status.rejected")}</ToggleGroupItem>
      </ToggleGroup>

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.centers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <TableSkeleton rows={4} columns={4} />
          ) : centers.length === 0 ? (
            <EmptyState
              title={status === "pending" ? t("adminManage.noPendingCenters") : t("adminManage.noCenters")}
              description={status === "pending" ? t("adminManage.noCentersDesc") : undefined}
            />
          ) : (
            <DataTable columns={centerCols} data={centers} pageSize={centers.length || 1} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nav.teachers")}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <TableSkeleton rows={3} columns={4} />
          ) : teachers.length === 0 ? (
            <EmptyState title={t("adminManage.noTeachers")} />
          ) : (
            <DataTable columns={teacherCols} data={teachers} pageSize={teachers.length || 1} />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.rejectTitle")}</DialogTitle>
            <DialogDescription>{t("adminManage.rejectReasonHint")}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={reason}
            aria-label={t("adminManage.rejectReasonAria")}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("adminManage.reasonPlaceholder")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              {t("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              {t("actions.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
