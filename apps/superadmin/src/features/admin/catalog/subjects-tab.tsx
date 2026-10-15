"use client";

import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { StatusBadge } from "@/components/kit/status-badge";
import { TableSkeleton } from "@/components/ui/skeletons";
import { useCustom } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { BookOpen, Pencil, Plus, RefreshCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { EntityDialog, type FieldSpec, type FieldValue } from "./entity-dialog";
import type { SubjectRow } from "./types";
import { useAction } from "@/lib/api/use-action";


function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function SubjectsTab() {
  const t = useTranslations();
  const queryStrings = useQueryStrings();
  const { run, busy } = useAction();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ row?: SubjectRow } | null>(null);

  const subjectsQ = useCustom<SubjectRow[]>({
    url: "admin/catalog/subjects",
    method: "get",
    queryOptions: QUERY_FRESHNESS.reference,
  });
  const subjects = asArray<SubjectRow>(subjectsQ.result?.data);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.nameAr.toLowerCase().includes(q) ||
        (s.nameEn ?? "").toLowerCase().includes(q) ||
        s.code.includes(q),
    );
  }, [subjects, search]);

  const fields: FieldSpec[] = [
    {
      name: "code",
      label: t("catalog.fields.code"),
      type: "text",
      required: true,
      disabled: !!dialog?.row,
      hint: t("catalog.fields.codeHint"),
      dir: "ltr",
    },
    { name: "nameAr", label: t("catalog.fields.nameAr"), type: "text", required: true, dir: "rtl" },
    { name: "nameEn", label: t("catalog.fields.nameEn"), type: "text", dir: "ltr" },
    { name: "sortOrder", label: t("catalog.fields.sortOrder"), type: "number" },
    { name: "isAzhari", label: t("catalog.fields.isAzhari"), type: "checkbox" },
    { name: "isSecondLanguage", label: t("catalog.fields.isSecondLanguage"), type: "checkbox" },
    { name: "isActive", label: t("catalog.fields.isActive"), type: "checkbox" },
  ];

  async function submit(values: Record<string, FieldValue>) {
    const row = dialog?.row;
    const payload: Record<string, unknown> = { ...values };
    if (payload.nameEn === "") delete payload.nameEn;
    if (row) delete payload.code;
    const res = await run({
      url: row ? `admin/catalog/subjects/${row.id}` : "admin/catalog/subjects",
      method: row ? "patch" : "post",
      values: payload,
      successMsg: row ? t("catalog.toasts.updated") : t("catalog.toasts.created"),
    });
    if (res.ok) {
      setDialog(null);
      void subjectsQ.query.refetch();
    }
    // Returned so the dialog can put a 422's `fields` on the offending input.
    return res;
  }

  const columns: ColumnDef<SubjectRow, unknown>[] = [
    {
      accessorKey: "nameAr",
      header: t("catalog.fields.nameAr"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.nameAr}</span>
          {row.original.isAzhari ? <Badge variant="secondary">{t("catalog.subjects.azhari")}</Badge> : null}
          {row.original.isSecondLanguage ? (
            <Badge variant="outline">{t("catalog.subjects.secondLanguage")}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: t("catalog.fields.code"),
      cell: ({ row }) => (
        <code className="text-xs text-ink-2" dir="ltr">
          {row.original.code}
        </code>
      ),
    },
    {
      accessorKey: "_count.offerings",
      header: t("catalog.subjects.offeringsCount"),
      cell: ({ row }) => row.original._count.offerings,
    },
    {
      accessorKey: "_count.teacherSubjects",
      header: t("catalog.subjects.teachersCount"),
      cell: ({ row }) => row.original._count.teacherSubjects,
    },
    {
      accessorKey: "isActive",
      header: t("catalog.fields.isActive"),
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusBadge tone="success">{t("status.active")}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">{t("status.suspended")}</StatusBadge>
        ),
    },
    {
      id: "actions",
      header: t("common.colActions"),
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => setDialog({ row: row.original })}>
          <Pencil className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("catalog.subjects.searchPlaceholder")}
          aria-label={t("catalog.subjects.searchPlaceholder")}
          className="max-w-xs"
        />
        <Button onClick={() => setDialog({})}>
          <Plus className="size-4" />
          {t("catalog.subjects.add")}
        </Button>
      </div>

      {subjectsQ.query.isLoading ? (
        <TableSkeleton rows={6} />
      ) : subjectsQ.query.isError ? (
        (() => {
          const denied =
            (subjectsQ.query.error as { statusCode?: number } | null)?.statusCode === 403;
          return (
            <EmptyState
              tone={denied ? "denied" : "error"}
              icon={TriangleAlert}
              title={denied ? queryStrings.denied : queryStrings.loadFailed}
              action={
                denied ? undefined : (
                  <Button variant="outline" onClick={() => void subjectsQ.query.refetch()}>
                    <RefreshCcw className="size-4" aria-hidden="true" />
                    {queryStrings.retry}
                  </Button>
                )
              }
            />
          );
        })()
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          emptyState={
            <EmptyState
              tone="empty"
              icon={BookOpen}
              title={t("catalog.subjects.empty")}
              description={t("catalog.subjects.emptyHint")}
            />
          }
        />
      )}

      {dialog ? (
        <EntityDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={dialog.row ? t("catalog.subjects.edit") : t("catalog.subjects.add")}
          fields={fields}
          initial={dialog.row ?? { isActive: true, sortOrder: 0 }}
          busy={busy}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
