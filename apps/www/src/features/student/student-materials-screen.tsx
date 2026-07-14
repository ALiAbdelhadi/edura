"use client";

import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { FileText, Download } from "lucide-react";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { PageHeader } from "@/components/kit/page-header";
import { StatusBadge, type StatusTone } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

const TYPE_TONES: Record<string, StatusTone> = {
  lecture: "info",
  homework: "warning",
  exam: "danger",
  other: "neutral",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudentMaterialsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({ resource: "enrollments" });
  const { query: materialsQuery, result: materialsResult } = useList({ resource: "materials" });

  const enrollments = (enrollmentsResult?.data ?? []) as any[];
  const materials = (materialsResult?.data ?? []) as any[];

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((e) => {
      const cid = e.courseId?.toString?.() || e.courseId;
      if (cid && e.courseName) map.set(cid, e.courseName);
    });
    return map;
  }, [enrollments]);

  const handleDownload = async (id: string) => {
    try {
      const response = await api.get(`materials/${id}/download`).json<{ data: { url: string } }>();
      window.open(response.data.url, "_blank");
    } catch (err: any) {
      toast.error(err?.message || t("studentMaterials.downloadFailed"));
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "title",
      header: t("studentMaterials.title"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-destructive" />
          <span>{row.original.title}</span>
        </div>
      ),
    },
    {
      id: "course",
      header: t("studentMaterials.course"),
      cell: ({ row }) => courseMap.get(row.original.courseId?.toString?.()) || "—",
    },
    {
      accessorKey: "type",
      header: t("studentMaterials.type"),
      cell: ({ row }) => {
        const v = row.original.type as string;
        return (
          <StatusBadge tone={TYPE_TONES[v] || "neutral"}>
            {v ? t(asKey(`studentMaterials.types.${v}`)) : "—"}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: "fileSizeBytes",
      header: t("studentMaterials.size"),
      cell: ({ row }) => formatBytes(row.original.fileSizeBytes),
    },
    {
      accessorKey: "createdAt",
      header: t("studentMaterials.uploaded"),
      cell: ({ row }) => (row.original.createdAt ? formatDate(row.original.createdAt) : "—"),
    },
    {
      id: "actions",
      header: t("studentMaterials.actions"),
      cell: ({ row }) => {
        const id = row.original.id || row.original._id;
        return (
          <Button size="sm" onClick={() => handleDownload(id)}>
            <Download className="size-4" />
            {t("studentMaterials.download")}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("studentMaterials.pageTitle")} />

      <Card>
        <CardContent>
          {materialsQuery.isLoading || enrollmentsQuery.isLoading ? (
            <PageSpinner label={t("common.loading")} />
          ) : (
            <DataTable
              columns={columns}
              data={materials}
              pageSize={10}
              emptyState={<EmptyState icon={FileText} title={t("studentMaterials.noMaterials")} />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
