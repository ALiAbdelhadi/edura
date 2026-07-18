"use client";

import React, { useMemo, useState } from "react";
import { useCustom } from "@refinedev/core";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Badge } from "@repo/ui/components/badge";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { StatusBadge } from "@/components/kit/status-badge";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { TableSkeleton } from "@/components/ui/skeletons";
import { EntityDialog, type FieldSpec, type FieldValue } from "./entity-dialog";
import { useCatalogMutation } from "./use-catalog-mutation";
import type { SubjectRow } from "./types";


function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function SubjectsTab() {
  const t = useTranslations();
  const { mutate, busy } = useCatalogMutation();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ row?: SubjectRow } | null>(null);

  const subjectsQ = useCustom<SubjectRow[]>({ url: "admin/catalog/subjects", method: "get" });
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
    const okRes = await mutate(
      row ? `admin/catalog/subjects/${row.id}` : "admin/catalog/subjects",
      row ? "PATCH" : "POST",
      payload,
    );
    if (okRes) {
      toast.success(row ? t("catalog.toasts.updated") : t("catalog.toasts.created"));
      setDialog(null);
      void subjectsQ.query.refetch();
    }
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
        <code className="text-xs text-muted-foreground" dir="ltr">
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
      header: "",
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
          className="max-w-xs"
        />
        <Button onClick={() => setDialog({})}>
          <Plus className="size-4" />
          {t("catalog.subjects.add")}
        </Button>
      </div>

      {subjectsQ.query.isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <DataTable columns={columns} data={filtered} />
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
