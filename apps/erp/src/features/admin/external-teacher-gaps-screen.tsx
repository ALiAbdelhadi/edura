"use client";

import { PageSpinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Badge, DataTable, DateText, EmptyState, PageHead, type Column } from "./ledger";

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
  const te = useTranslations("externalTeachers");
  const queryStrings = useQueryStrings();
  const { formatDate } = useFormatters();
  const [report, setReport] = useState<Report | null | "error">(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setReport(null);
    api
      .get("center/external-teachers/gaps")
      .json<{ data: Report }>()
      .then((r) => setReport(r.data))
      .catch(() => setReport("error"));
  }, [nonce]);

  const columns: Column<Gap>[] = [
    {
      id: "finding",
      header: t("externalTeachers.gaps_title"),
      cell: (r) => (
        <span className="text-[13px] text-(--ink)">
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
          className="text-[13px] text-(--indigo) underline-offset-4 hover:underline"
        >
          {r.teacherName}
        </Link>
      ),
    },
    {
      id: "group",
      header: t("nav.classes"),
      cell: (r) => <span className="text-[13px] text-(--ink-2)">{r.courseTitle}</span>,
    },
    {
      id: "detail",
      header: t("externalTeachers.source"),
      cell: (r) => (
        <span className="text-xs text-(--ink-3)">{describeDetail(r.detail, te)}</span>
      ),
    },
    {
      id: "date",
      header: t("receipt.date"),
      numeric: true,
      cell: (r) =>
        r.date ? <DateText className="text-xs text-(--ink-3)">{formatDate(r.date)}</DateText> : <span>—</span>,
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

  if (report === "error") {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={() => setNonce((n) => n + 1)}
        retryLabel={queryStrings.retry}
      />
    );
  }

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

function describeDetail(
  detail: Record<string, string | number | null>,
  te: ReturnType<typeof useTranslations<"externalTeachers">>,
): string {
  const has = (k: string) => detail[k] !== undefined && detail[k] !== null && detail[k] !== "";

  if (has("studentName")) {
    return te("gapDetail_student", { name: String(detail.studentName) });
  }
  if (has("enrolled")) {
    const enrolled = Number(detail.enrolled);
    const marked = Number(detail.marked ?? 0);
    if (enrolled === 0) return te("gapDetail_noneMarked");
    return marked === 0
      ? te("gapDetail_noAttendance", { enrolled })
      : te("gapDetail_attendance", { marked, enrolled });
  }
  if (has("settled")) return te("gapDetail_notSettled");
  if ("pricePerMonth" in detail || "pricePerSession" in detail) {
    return te("gapDetail_noPrice");
  }
  if ("sessions" in detail) return te("gapDetail_noSessions");
  if ("students" in detail) return te("gapDetail_noStudents");

  const rest = Object.entries(detail)
    .filter(([k, v]) => v !== null && v !== "" && !/id$/i.test(k))
    .map(([, v]) => String(v));
  return rest.length ? rest.join(" · ") : te("gapDetail_none");
}
