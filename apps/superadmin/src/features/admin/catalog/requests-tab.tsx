"use client";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useCustom } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SubjectRequestRow, SubjectRow } from "./types";
import { useCatalogMutation } from "./use-catalog-mutation";


function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

type ApproveDraft = {
  mode: "new" | "existing";
  code: string;
  nameAr: string;
  nameEn: string;
  isAzhari: boolean;
  subjectId: string;
};

export function RequestsTab() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { mutate, busy } = useCatalogMutation();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [approveTarget, setApproveTarget] = useState<SubjectRequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SubjectRequestRow | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [draft, setDraft] = useState<ApproveDraft>({
    mode: "new",
    code: "",
    nameAr: "",
    nameEn: "",
    isAzhari: false,
    subjectId: "",
  });

  const requestsQ = useCustom<SubjectRequestRow[]>({
    url: "admin/catalog/subject-requests",
    method: "get",
    config: { query: { status } },
  });
  const subjectsQ = useCustom<SubjectRow[]>({ url: "admin/catalog/subjects", method: "get" });

  const requests = asArray<SubjectRequestRow>(requestsQ.result?.data);
  const subjects = asArray<SubjectRow>(subjectsQ.result?.data);

  function openApprove(row: SubjectRequestRow) {
    setDraft({ mode: "new", code: "", nameAr: row.suggestedName, nameEn: "", isAzhari: false, subjectId: "" });
    setApproveTarget(row);
  }

  async function submitApprove() {
    if (!approveTarget) return;
    const body =
      draft.mode === "new"
        ? {
            newSubject: {
              code: draft.code.trim(),
              nameAr: draft.nameAr.trim(),
              ...(draft.nameEn.trim() ? { nameEn: draft.nameEn.trim() } : {}),
              isAzhari: draft.isAzhari,
            },
          }
        : { subjectId: draft.subjectId };
    const okRes = await mutate(`admin/catalog/subject-requests/${approveTarget.id}/approve`, "POST", body);
    if (okRes) {
      toast.success(t("status.approved"));
      setApproveTarget(null);
      void requestsQ.query.refetch();
      void subjectsQ.query.refetch();
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const okRes = await mutate(`admin/catalog/subject-requests/${rejectTarget.id}/reject`, "POST", {
      ...(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {}),
    });
    if (okRes) {
      toast.success(t("status.rejected"));
      setRejectTarget(null);
      setReviewNote("");
      void requestsQ.query.refetch();
    }
  }

  const statusBadge = (s: SubjectRequestRow["status"]) => {
    const tone: StatusTone = s === "approved" ? "success" : s === "rejected" ? "danger" : "warning";
    return <StatusBadge tone={tone}>{t(("status." + s) as Parameters<typeof t>[0])}</StatusBadge>;
  };

  const columns: ColumnDef<SubjectRequestRow, unknown>[] = [
    {
      accessorKey: "suggestedName",
      header: t("catalog.requests.suggestedName"),
      cell: ({ row }) => <span className="font-medium">{row.original.suggestedName}</span>,
    },
    {
      accessorKey: "requestedBy.name",
      header: t("catalog.requests.requestedBy"),
      cell: ({ row }) => (
        <div className="grid">
          <span>{row.original.requestedBy?.name ?? "—"}</span>
          <span className="text-xs text-muted-foreground" dir="ltr">
            {row.original.requestedBy?.email ?? ""}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "notes",
      header: t("catalog.requests.notes"),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.notes ?? "—"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: t("catalog.requests.reviewedAt"),
      cell: ({ row }) =>
        row.original.reviewedAt ? formatDate(row.original.reviewedAt) : formatDate(row.original.createdAt),
    },
    {
      accessorKey: "status",
      header: "",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.status === "pending" ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => openApprove(row.original)} disabled={busy}>
              <Check className="size-4" />
              {t("actions.approve")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejectTarget(row.original)} disabled={busy}>
              <X className="size-4" />
              {t("actions.reject")}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="grid gap-4">
      <ToggleGroup
        type="single"
        value={status}
        onValueChange={(v) => v && setStatus(v as typeof status)}
        variant="outline"
      >
        <ToggleGroupItem value="pending">{t("status.pending")}</ToggleGroupItem>
        <ToggleGroupItem value="approved">{t("status.approved")}</ToggleGroupItem>
        <ToggleGroupItem value="rejected">{t("status.rejected")}</ToggleGroupItem>
      </ToggleGroup>

      {requestsQ.query.isLoading ? (
        <TableSkeleton rows={4} />
      ) : requests.length === 0 ? (
        <EmptyState title={t("catalog.requests.empty")} />
      ) : (
        <DataTable columns={columns} data={requests} />
      )}

      {}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("catalog.requests.approveTitle")}</DialogTitle>
            <DialogDescription>{t("catalog.requests.approveBody")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <ToggleGroup
              type="single"
              value={draft.mode}
              onValueChange={(v) => v && setDraft((d) => ({ ...d, mode: v as "new" | "existing" }))}
              variant="outline"
            >
              <ToggleGroupItem value="new">{t("catalog.requests.createNew")}</ToggleGroupItem>
              <ToggleGroupItem value="existing">{t("catalog.requests.linkExisting")}</ToggleGroupItem>
            </ToggleGroup>

            {draft.mode === "new" ? (
              <>
                <div className="grid gap-1.5">
                  <Label>{t("catalog.fields.code")}</Label>
                  <Input
                    dir="ltr"
                    value={draft.code}
                    onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                    placeholder="new-subject-code"
                  />
                  <p className="text-xs text-muted-foreground">{t("catalog.fields.codeHint")}</p>
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("catalog.fields.nameAr")}</Label>
                  <Input
                    dir="rtl"
                    value={draft.nameAr}
                    onChange={(e) => setDraft((d) => ({ ...d, nameAr: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>{t("catalog.fields.nameEn")}</Label>
                  <Input
                    dir="ltr"
                    value={draft.nameEn}
                    onChange={(e) => setDraft((d) => ({ ...d, nameEn: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="req-azhari"
                    checked={draft.isAzhari}
                    onCheckedChange={(c) => setDraft((d) => ({ ...d, isAzhari: c === true }))}
                  />
                  <Label htmlFor="req-azhari">{t("catalog.fields.isAzhari")}</Label>
                </div>
              </>
            ) : (
              <div className="grid gap-1.5">
                <Label>{t("catalog.offerings.subject")}</Label>
                <Select value={draft.subjectId} onValueChange={(v) => setDraft((d) => ({ ...d, subjectId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("catalog.offerings.subject")} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={busy}>
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={() => void submitApprove()}
              disabled={
                busy ||
                (draft.mode === "new" ? !draft.code.trim() || !draft.nameAr.trim() : !draft.subjectId)
              }
            >
              {busy ? <Spinner /> : null}
              {t("actions.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("catalog.requests.rejectTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label>{t("catalog.requests.reviewNote")}</Label>
            <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={busy}>
              {t("actions.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void submitReject()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("actions.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
