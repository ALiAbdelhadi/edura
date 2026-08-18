"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner } from "@/components/kit/spinner";
import { toast } from "@repo/ui/components/sonner";
import { Badge, DataTable, EmptyState, Num, PageHead, type Column } from "./ledger";

/**
 * THE COMPLETENESS REPORT.
 *
 * Manual entry fails silently: a lesson nobody marked attendance for simply has
 * no attendance, and nothing anywhere complains. This screen is the complaint.
 *
 * Two design rules it follows:
 *   - EVERY ROW IS A DOOR. A report that says "12 problems" without saying
 *     which twelve trains people to ignore it, so each finding links to the
 *     exact group or lesson to open.
 *   - BLOCKING FIRST. "Money is stuck" and "this will become a problem" are not
 *     the same and are never sorted together.
 */

type Gap = {
  kind: string;
  severity: "blocking" | "warning";
  teacherId: string;
  teacherName: string;
  targetType: "session" | "course" | "enrollment";
  targetId: string;
  courseId: string;
  courseTitle: string;
  date: string | null;
  detail: Record<string, string | number | null>;
};

type Report = { gaps: Gap[]; blocking: number; counts: Record<string, number> };

export function ExternalTeacherGapsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    api
      .get("center/external-teachers/gaps")
      .json<{ data: Report }>()
      .then((r) => setReport(r.data))
      .catch((e: Error) => toast.error(e.message));
  }, []);

  const columns: Column<Gap>[] = [
    {
      id: "finding",
      header: t("externalTeachers.gaps_title"),
      cell: (r) => (
        <span className="text-[13px] text-[var(--ink)]">
          {t(`externalTeachers.gap_${r.kind}` as never)}
        </span>
      ),
    },
    {
      id: "teacher",
      header: t("roles.teacher"),
      cell: (r) => (
        <Link
          href={`/dashboard/admin/external-teachers/${r.teacherId}`}
          className="text-[13px] text-[var(--indigo)] underline-offset-4 hover:underline"
        >
          {r.teacherName}
        </Link>
      ),
    },
    {
      id: "group",
      header: t("nav.classes"),
      cell: (r) => <span className="text-[13px] text-[var(--ink-2)]">{r.courseTitle}</span>,
    },
    {
      id: "detail",
      header: t("externalTeachers.source"),
      cell: (r) => (
        <span className="text-xs text-[var(--ink-3)]">
          {Object.entries(r.detail)
            .filter(([, v]) => v !== null && v !== "")
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ")}
        </span>
      ),
    },
    {
      id: "date",
      header: t("receipt.date"),
      numeric: true,
      cell: (r) =>
        r.date ? <Num className="text-xs text-[var(--ink-3)]">{formatDate(r.date)}</Num> : <span>—</span>,
    },
    {
      id: "severity",
      header: t("adminHome.teachers_status"),
      cell: (r) => (
        <Badge tone={r.severity === "blocking" ? "failed" : "pending"}>
          {r.severity === "blocking"
            ? t("externalTeachers.gap_blocking")
            : t("externalTeachers.gap_warning")}
        </Badge>
      ),
    },
  ];

  if (!report) return <PageSpinner />;

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("externalTeachers.gaps_title")}
        subtitle={t("externalTeachers.subtitle")}
      />
      <DataTable
        columns={columns}
        rows={report.gaps}
        rowKey={(r) => `${r.kind}:${r.targetId}`}
        caption={t("externalTeachers.gaps_title")}
        empty={
          <EmptyState
            icon={<CheckCircle2 className="size-6" />}
            title={t("externalTeachers.gaps_clean")}
            hint={t("externalTeachers.gaps_cleanHint")}
          />
        }
      />
    </div>
  );
}
