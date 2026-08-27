"use client";

import { useMemo } from "react";
import { useList } from "@refinedev/core";
import { Download, FileText } from "lucide-react";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { useTranslations } from "next-intl";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";
import {
  Chip,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Num,
  PageTitle,
  Sheet,
} from "@/features/student/ledger";

type Material = {
  id?: string;
  _id?: string;
  title: string;
  courseId?: { toString?: () => string } | string;
  type?: string;
  fileSizeBytes?: number | null;
  createdAt?: string | null;
};

const TYPE_TONES: Record<string, "indigo" | "amber" | "red" | "neutral"> = {
  lecture: "indigo",
  homework: "amber",
  exam: "red",
  other: "neutral",
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StudentMaterialsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const { query: enrollmentsQuery, result: enrollmentsResult } = useList({
    resource: "enrollments",
  });
  const { query: materialsQuery, result: materialsResult } = useList({ resource: "materials" });

  const enrollments = (enrollmentsResult?.data ?? []) as {
    courseId?: { toString?: () => string } | string;
    courseName?: string;
  }[];
  const materials = (materialsResult?.data ?? []) as Material[];

  const courseMap = useMemo(() => {
    const map = new Map<string, string>();
    enrollments.forEach((e) => {
      const cid = typeof e.courseId === "string" ? e.courseId : e.courseId?.toString?.();
      if (cid && e.courseName) map.set(cid, e.courseName);
    });
    return map;
  }, [enrollments]);

  const handleDownload = async (id: string) => {
    try {
      const response = await api.get(`materials/${id}/download`).json<{ data: { url: string } }>();
      window.open(response.data.url, "_blank");
    } catch (err) {
      toast.error((err as { message?: string })?.message || t("studentMaterials.downloadFailed"));
    }
  };

  const loading = materialsQuery.isLoading || enrollmentsQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageTitle
        title={t("studentMaterials.pageTitle")}
        subtitle={t("studentMaterials.subtitle")}
      />

      {loading ? (
        <PageSpinner label={t("common.loading")} />
      ) : materials.length === 0 ? (
        <Sheet className="p-5">
          <LedgerEmpty title={t("studentMaterials.noMaterials")} />
        </Sheet>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {materials.map((m, i) => {
            const id = m.id || m._id || String(i);
            const cid = typeof m.courseId === "string" ? m.courseId : m.courseId?.toString?.();
            const course = (cid && courseMap.get(cid)) || "—";
            const type = m.type;
            return (
              <li key={id}>
                <Sheet className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <InitialsTile name={course === "—" ? "?" : course} size={36} tone="indigo" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[15px] font-semibold leading-snug"
                        style={{ color: "var(--ink)" }}
                      >
                        {m.title}
                      </p>
                      <p className="mt-0.5 truncate text-sm" style={{ color: "var(--ink-2)" }}>
                        {course}
                      </p>
                    </div>
                    {type ? (
                      <Chip tone={TYPE_TONES[type] ?? "neutral"}>
                        {t(asKey(`studentMaterials.types.${type}`))}
                      </Chip>
                    ) : null}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3">
                    <Num style={{ color: "var(--ink-3)", fontSize: 11 }}>
                      {formatBytes(m.fileSizeBytes)}
                      {m.createdAt ? ` · ${formatDate(m.createdAt)}` : ""}
                    </Num>
                    <LedgerButton
                      variant="secondary"
                      onClick={() => handleDownload(id)}
                      aria-label={`${t("studentMaterials.download")} — ${m.title}`}
                    >
                      <Download className="size-4" aria-hidden />
                      {t("studentMaterials.download")}
                    </LedgerButton>
                  </div>
                </Sheet>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
