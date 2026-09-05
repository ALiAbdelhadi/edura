"use client";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useCustom } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Num } from "@repo/ui/components/num";
import { useQueryStrings } from "@repo/ui/components/query-section";
import type { Locale } from "@repo/ui/lib/format";
import { Check, RefreshCcw, TriangleAlert, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { useState } from "react";
import type { SubjectRequestRow, SubjectRow } from "./types";
import {
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "./entity-dialog";
import { Form } from "@repo/ui/components/form";
import { useAction } from "@/lib/api/use-action";


function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function RequestsTab() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const { run, busy } = useAction();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [approveTarget, setApproveTarget] = useState<SubjectRequestRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SubjectRequestRow | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  const requestsQ = useCustom<SubjectRequestRow[]>({
    url: "admin/catalog/subject-requests",
    method: "get",
    config: { query: { status } },
  });
  const subjectsQ = useCustom<SubjectRow[]>({ url: "admin/catalog/subjects", method: "get" });

  const requests = asArray<SubjectRequestRow>(requestsQ.result?.data);
  const subjects = asArray<SubjectRow>(subjectsQ.result?.data);

  function openApprove(row: SubjectRequestRow) {
    setApproveTarget(row);
  }

  // Approve either mints a new subject or links an existing one. Each mode
  // needs different answers, which used to be expressed as a Save button that
  // sat dead with no indication of which box it was waiting on; `requiredWhen`
  // puts the message under the field the current mode actually needs.
  const approveFields: FieldSpec[] = [
    {
      name: "mode",
      label: t("catalog.requests.approveMode"),
      type: "custom",
      required: true,
      render: (field) => (
        <ToggleGroup
          type="single"
          value={String(field.value ?? "new")}
          onValueChange={(v) => v && field.onChange(v)}
          variant="outline"
        >
          <ToggleGroupItem value="new">{t("catalog.requests.createNew")}</ToggleGroupItem>
          <ToggleGroupItem value="existing">{t("catalog.requests.linkExisting")}</ToggleGroupItem>
        </ToggleGroup>
      ),
    },
    {
      name: "code",
      label: t("catalog.fields.code"),
      type: "text",
      dir: "ltr",
      placeholder: "new-subject-code",
      hint: t("catalog.fields.codeHint"),
      requiredWhen: (v) => v.mode === "new",
    },
    {
      name: "nameAr",
      label: t("catalog.fields.nameAr"),
      type: "text",
      dir: "rtl",
      requiredWhen: (v) => v.mode === "new",
    },
    { name: "nameEn", label: t("catalog.fields.nameEn"), type: "text", dir: "ltr" },
    { name: "isAzhari", label: t("catalog.fields.isAzhari"), type: "checkbox" },
    {
      name: "subjectId",
      label: t("catalog.offerings.subject"),
      type: "select",
      placeholder: t("catalog.offerings.subject"),
      options: subjects.map((s) => ({ value: s.id, label: s.nameAr })),
      requiredWhen: (v) => v.mode === "existing",
    },
  ];

  const approveForm = useFieldForm({
    fields: approveFields,
    open: !!approveTarget,
    resetKey: approveTarget?.id ?? "",
    initial: {
      mode: "new",
      code: "",
      nameAr: approveTarget?.suggestedName ?? "",
      nameEn: "",
      isAzhari: false,
      subjectId: "",
    },
    onSubmit: async (v) => {
      if (!approveTarget) return;
      const nameEn = String(v.nameEn ?? "").trim();
      const body =
        v.mode === "new"
          ? {
              newSubject: {
                code: String(v.code).trim(),
                nameAr: String(v.nameAr).trim(),
                ...(nameEn ? { nameEn } : {}),
                isAzhari: Boolean(v.isAzhari),
              },
            }
          : { subjectId: v.subjectId };
      const res = await run({
        url: `admin/catalog/subject-requests/${approveTarget.id}/approve`,
        values: body,
        successMsg: t("status.approved"),
      });
      if (res.ok) {
        setApproveTarget(null);
        void requestsQ.query.refetch();
        void subjectsQ.query.refetch();
      }
      return res;
    },
  });

  const mode = String(approveForm.form.watch("mode") ?? "new");
  const visibleApproveFields = approveFields.filter((f) => {
    if (f.name === "subjectId") return mode === "existing";
    if (["code", "nameAr", "nameEn", "isAzhari"].includes(f.name)) return mode === "new";
    return true;
  });

  async function submitReject() {
    if (!rejectTarget) return;
    const res = await run({
      url: `admin/catalog/subject-requests/${rejectTarget.id}/reject`,
      values: { ...(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {}) },
      successMsg: t("status.rejected"),
    });
    if (res.ok) {
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
          <span className="text-xs text-ink-2" dir="ltr">
            {row.original.requestedBy?.email ?? ""}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "notes",
      header: t("catalog.requests.notes"),
      cell: ({ row }) => <span className="text-sm text-ink-2">{row.original.notes ?? "—"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: t("catalog.requests.reviewedAt"),
      cell: ({ row }) => (
        <Num.Date
          value={row.original.reviewedAt ?? row.original.createdAt}
          locale={locale}
          className="text-[11px] text-ink-3"
        />
      ),
    },
    {
      accessorKey: "status",
      header: t("common.colStatus"),
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: "actions",
      header: t("common.colActions"),
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
      ) : requestsQ.query.isError ? (
        (() => {
          const denied =
            (requestsQ.query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={denied ? queryStrings.denied : queryStrings.loadFailed}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => void requestsQ.query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {queryStrings.retry}
                  </Button>
                )
              }
            />
          );
        })()
      ) : requests.length === 0 ? (
        <EmptyState title={t("catalog.requests.empty")} />
      ) : (
        <DataTable columns={columns} data={requests} />
      )}

      {}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <Form {...approveForm.form}>
            <DialogForm onSubmit={() => void approveForm.submit()}>
              <DialogHeader>
                <DialogTitle>{t("catalog.requests.approveTitle")}</DialogTitle>
                <DialogDescription>{t("catalog.requests.approveBody")}</DialogDescription>
              </DialogHeader>

              <FormRootError message={approveForm.rootError} />
              <FieldControls fields={visibleApproveFields} form={approveForm.form} />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApproveTarget(null)}
                  disabled={busy}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("actions.approve")}
                </Button>
              </DialogFooter>
            </DialogForm>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("catalog.requests.rejectTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="catalog-review-note">{t("catalog.requests.reviewNote")}</Label>
            <Textarea
              id="catalog-review-note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
            />
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
