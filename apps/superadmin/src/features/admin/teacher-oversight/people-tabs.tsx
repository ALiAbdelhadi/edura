"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@repo/ui/components/badge";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Info } from "lucide-react";
import type { Locale } from "@repo/ui/lib/format";

import { Link } from "@/i18n/navigation";
import { OversightTable, type Col } from "./oversight-table";
import { useTeacherOversight, type Paged } from "./use-teacher-oversight";

type Row = Record<string, unknown>;

export function CentersTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<{ data: Row[]; total: number }>(teacherId, "centers", {
    enabled,
    query: { includeRemoved: "1" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    {
      key: "centerName",
      label: t("colCenter"),
      render: (r) =>
        r.centerId ? (
          <Link
            className="focus-ledger font-medium underline underline-offset-2"
            href={`/dashboard/superadmin/centers/${String(r.centerId)}`}
          >
            {(r.centerName as string) ?? String(r.centerId).slice(0, 8)}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: t("colStatus"),
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>{String(r.status)}</StatusBadge>
      ),
    },
    { key: "courses", label: t("colCourses"), figure: true },
    { key: "centerShare", label: t("colCenterShare"), figure: true },
    { key: "dataSource", label: t("colSource") },
    { key: "invitedAt", label: t("colInvited"), date: true },
    { key: "removedAt", label: t("colRemoved"), date: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>{t("centersNote")}</AlertTitle>
        <AlertDescription>{t("centersNoteBody")}</AlertDescription>
      </Alert>
      <OversightTable
        locale={locale}
        loading={req.isLoading}
        failed={req.isError}
        onRetry={req.refetch}
        rows={req.data?.data ?? []}
        total={req.data?.total ?? 0}
        columns={columns}
        emptyText={t("noCenters")}
      />
    </div>
  );
}

export function AssistantsTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<{ data: Row[]; total: number }>(teacherId, "assistants", {
    enabled,
    query: { includeRemoved: "1" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    {
      key: "assistantName",
      label: t("colAssistant"),
      render: (r) =>
        r.assistantId ? (
          <Link
            className="focus-ledger font-medium underline underline-offset-2"
            href={`/dashboard/superadmin/users/${String(r.assistantId)}`}
          >
            {(r.assistantName as string) ?? String(r.assistantId).slice(0, 8)}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "assistantEmail", label: t("colEmail"), code: true },
    {
      key: "assistantStatus",
      label: t("colStatus"),
      render: (r) =>
        r.assistantStatus ? (
          <StatusBadge tone={statusTone(String(r.assistantStatus))}>
            {String(r.assistantStatus)}
          </StatusBadge>
        ) : (
          "—"
        ),
    },
    { key: "title", label: t("colTitle") },
    { key: "removedAt", label: t("colRemoved"), date: true },
    { key: "createdAt", label: t("colCreated"), date: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>{t("assistantsNote")}</AlertTitle>
        <AlertDescription>{t("assistantsNoteBody")}</AlertDescription>
      </Alert>
      <OversightTable
        locale={locale}
        loading={req.isLoading}
        failed={req.isError}
        onRetry={req.refetch}
        rows={req.data?.data ?? []}
        total={req.data?.total ?? 0}
        columns={columns}
        emptyText={t("noAssistants")}
      />
    </div>
  );
}

export function StudentsTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<Paged<Row>>(teacherId, "students", {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;

  const columns: Col[] = [
    {
      key: "name",
      label: t("colStudent"),
      render: (r) => (
        <Link
          className="focus-ledger font-medium underline underline-offset-2"
          href={`/dashboard/superadmin/users/${String(r.id)}`}
        >
          {(r.name as string) ?? String(r.id).slice(0, 8)}
        </Link>
      ),
    },
    { key: "studentCode", label: t("colCode"), code: true },
    { key: "email", label: t("colEmail"), code: true },
    { key: "phone", label: t("colPhone"), code: true },
    {
      key: "status",
      label: t("colStatus"),
      render: (r) => (
        <StatusBadge tone={statusTone(String(r.status))}>{String(r.status)}</StatusBadge>
      ),
    },
    {
      key: "courses",
      label: t("colCourses"),
      render: (r) => {
        const courses = (r.courses as { courseId: string; title: string | null }[]) ?? [];
        if (!courses.length) return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {courses.map((c) => (
              <Badge key={c.courseId} variant="secondary">
                {c.title ?? c.courseId.slice(0, 8)}
              </Badge>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">{t("studentsNote")}</p>
      <OversightTable
        locale={locale}
        loading={req.isLoading}
        failed={req.isError}
        onRetry={req.refetch}
        rows={req.data?.data ?? []}
        total={req.data?.total ?? 0}
        columns={columns}
        emptyText={t("noStudents")}
      />
    </div>
  );
}

export function PendingTab({ teacherId, enabled }: { teacherId: string; enabled: boolean }) {
  const t = useTranslations("teacherOversight");
  const locale = useLocale() as Locale;
  const req = useTeacherOversight<{
    collaborationRequests: Row[];
    affiliations: Row[];
  }>(teacherId, "pending", { enabled });
  if (!enabled) return null;

  const collabs = req.data?.collaborationRequests ?? [];
  const affiliations = req.data?.affiliations ?? [];

  const centerCol: Col = {
    key: "centerName",
    label: t("colCenter"),
    render: (r) =>
      r.centerId ? (
        <Link
          className="focus-ledger font-medium underline underline-offset-2"
          href={`/dashboard/superadmin/centers/${String(r.centerId)}`}
        >
          {(r.centerName as string) ?? String(r.centerId).slice(0, 8)}
        </Link>
      ) : (
        "—"
      ),
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">{t("pendingCollabs")}</h3>
        <OversightTable
          locale={locale}
          loading={req.isLoading}
          failed={req.isError}
          onRetry={req.refetch}
          rows={collabs}
          total={collabs.length}
          emptyText={t("nothingPending")}
          columns={[
            centerCol,
            { key: "initiator", label: t("colInitiator") },
            { key: "status", label: t("colStatus") },
            { key: "expiresAt", label: t("colExpires"), date: true },
            { key: "createdAt", label: t("colCreated"), date: true },
          ]}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">{t("pendingAffiliations")}</h3>
        <OversightTable
          locale={locale}
          loading={req.isLoading}
          failed={req.isError}
          onRetry={req.refetch}
          rows={affiliations}
          total={affiliations.length}
          emptyText={t("nothingPending")}
          columns={[
            centerCol,
            { key: "status", label: t("colStatus") },
            { key: "invitedAt", label: t("colInvited"), date: true },
            { key: "expiresAt", label: t("colExpires"), date: true },
          ]}
        />
      </section>
    </div>
  );
}
