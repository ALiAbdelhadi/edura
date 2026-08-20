"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { PageSpinner } from "@/components/kit/spinner";
import { toast } from "@repo/ui/components/sonner";
import { Badge, DataTable, DateText, EmptyState, PageHead, type Column } from "./ledger";

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
  // A SCOPED translator for the detail column. `describeDetail` cannot take the
  // global one: `ReturnType<typeof useTranslations>` resolves to the narrowest
  // overload of an overloaded generic, so every key handed to it was rejected
  // even though the messages contain them — the failure looked like a missing
  // translation and was a parameter type.
  const te = useTranslations("externalTeachers");
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
        <span className="text-xs text-[var(--ink-3)]">{describeDetail(r.detail, te)}</span>
      ),
    },
    {
      id: "date",
      header: t("receipt.date"),
      numeric: true,
      cell: (r) =>
        r.date ? <DateText className="text-xs text-[var(--ink-3)]">{formatDate(r.date)}</DateText> : <span>—</span>,
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

/**
 * Turns a gap's `detail` payload into a sentence an operator can read.
 *
 * This column used to print the payload verbatim —
 * `Object.entries(detail).map(([k, v]) => \`${k}: ${v}\`)` — which put
 * `marked: 0 · enrolled: 0`, `status: scheduled · settled: no` and a raw
 * `studentId: c8204eb0-6a5c-…` on a screen a centre owner reads. Untranslated
 * English keys in an otherwise Arabic table, and a database id next to a
 * child's name.
 *
 * THE ID IS DROPPED, not translated. `studentId` identifies the row for the
 * server; the operator needs the student's NAME, and a UUID on screen is at
 * best noise and at worst something that ends up in a screenshot.
 *
 * Unknown keys fall back to their values only — so a detail shape added later
 * degrades to something readable instead of leaking a key name.
 *
 * THE PARAMETER IS `te`, NOT `t`, AND THAT MATTERS. It receives the
 * `externalTeachers`-scoped translator from the caller. Naming it `t` shadowed
 * the file's ROOT translator (`const t = useTranslations()` above), and
 * tests/unit/i18n-parity.test.ts binds translator variables per FILE — so every
 * `gapDetail_*` call in here was resolved against the root dictionary, where
 * those keys correctly do not exist, and the suite reported nine missing keys
 * that were present all along under `externalTeachers`. The screen itself was
 * never broken. Keep the name aligned with the binding it is handed.
 */
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
    // "none of 0 marked" is a sentence about nothing. A lesson with no roster
    // at all gets the plain statement instead of a ratio.
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

  // Values only, never the keys — see the note above.
  const rest = Object.entries(detail)
    .filter(([k, v]) => v !== null && v !== "" && !/id$/i.test(k))
    .map(([, v]) => String(v));
  return rest.length ? rest.join(" · ") : te("gapDetail_none");
}
