"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Pencil, ShieldBan } from "lucide-react";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num } from "@repo/ui/components/num";
import { PageHeader } from "@repo/ui/components/page-header";
import { StatusBadge } from "@repo/ui/components/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { cn } from "@repo/ui/lib/utils";
import type { Locale } from "@repo/ui/lib/format";

import { PageSpinner } from "@/components/kit/spinner";
import { ReasonDialog } from "@/components/kit/reason-dialog";
import { ControlAction } from "@/features/admin/center-oversight/control-actions";
import { EntityDialog, type FieldSpec } from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";
import { asKey } from "@/lib/i18n/keys";
import { Link } from "@/i18n/navigation";

import { useTeacherOversight } from "./use-teacher-oversight";
import { AssistantsTab, CentersTab, PendingTab, StudentsTab } from "./people-tabs";
import { AttendanceTab, CoursesTab, EnrollmentsTab, SessionsTab } from "./academic-tabs";
import { MoneyTab } from "./money-tabs";
import { AuditTab } from "./platform-tabs";

type Overview = {
  teacher: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    locale: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    isDemo: boolean;
    createdAt: string;
  };
  profile: {
    id: string;
    bio: string | null;
    subjects: string[];
    qualifications: string | null;
    experienceYears: number;
    photoUrl: string | null;
    lessonPrice: number | null;
    ratingAvg: number;
    ratingCount: number;
    walletBalance: number;
    attendanceMode: "counter_only" | "counter_and_door";
    systemStatus: string;
    accessLevel: string;
  } | null;
  managedByCenter: { id: string; name: string; status: string } | null;
  counts: {
    courses: number;
    activeCourses: number;
    sessions: number;
    students: number;
    activeSubscriptions: number;
    centers: number;
    assistants: number;
    pendingCollaborations: number;
    settlements: number;
  };
};

// Grouped exactly like the centre screen: a small row of groups on top, and
// the tabs of the active group under it. Eight flat tabs is a wall.
const TAB_GROUPS = [
  { key: "overview", tabs: ["overview"] },
  { key: "people", tabs: ["centers", "assistants", "students"] },
  { key: "academic", tabs: ["courses", "sessions", "enrollments", "attendance"] },
  { key: "money", tabs: ["money"] },
  { key: "platform", tabs: ["pending", "audit"] },
] as const;

const GROUP_OF = new Map<string, string>(
  TAB_GROUPS.flatMap((g) => g.tabs.map((t) => [t, g.key] as [string, string])),
);

export function TeacherOversightScreen({ teacherId }: { teacherId: string }) {
  const [tab, setTab] = useState<string>("overview");
  const [editing, setEditing] = useState(false);
  const [banning, setBanning] = useState(false);
  const t = useTranslations("teacherOversight");
  const tStatus = useTranslations("status");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;

  const overview = useTeacherOversight<Overview>(teacherId, "overview");
  const teacher = overview.data?.teacher;
  const profile = overview.data?.profile ?? null;

  const { run: patch, busy: saving } = useAction({
    url: `admin/teachers/${teacherId}`,
    method: "patch",
    onSuccess: () => overview.refetch(),
  });
  const { run: post } = useAction();

  if (overview.isLoading) return <PageSpinner />;
  if (
    overview.isError &&
    (overview.error as { statusCode?: number } | null)?.statusCode !== 404
  ) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={overview.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
  if (!teacher) return <p className="p-4 text-sm text-ink-2">{t("notFound")}</p>;

  const isActive = teacher.status === "active";
  // Same gate the centre header uses: only the ACTIVE <-> SUSPENDED pair is a
  // toggle. `pending` belongs to approve/reject and `blacklisted` to the
  // blacklist, each with its own audited flow.
  const canToggle = ["active", "suspended"].includes(teacher.status);

  const fields: FieldSpec[] = [
    { name: "name", label: t("fName"), type: "text", required: true },
    { name: "email", label: t("fEmail"), type: "email", required: true, dir: "ltr" },
    { name: "phone", label: t("fPhone"), type: "text", dir: "ltr" },
    {
      name: "subjects",
      label: t("fSubjects"),
      type: "text",
      hint: t("fSubjectsHint"),
    },
    { name: "qualifications", label: t("fQualifications"), type: "textarea", rows: 2 },
    { name: "bio", label: t("fBio"), type: "textarea", rows: 3 },
    { name: "experienceYears", label: t("fExperience"), type: "number", min: 0, max: 80 },
    { name: "lessonPrice", label: t("fLessonPrice"), type: "number", min: 0 },
  ];

  const blacklist = async (reason: string) => {
    const res = await post({
      url: `admin/teachers/${teacherId}/blacklist`,
      values: { reason },
      successMsg: t("blacklisted"),
    });
    if (!res.ok) throw res.error;
    setBanning(false);
    overview.refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {teacher.name ?? teacher.id.slice(0, 8)}
            <Badge variant="secondary">{tStatus(asKey(teacher.status))}</Badge>
            {profile ? (
              <Badge variant="outline">
                {t(asKey(`mode_${profile.attendanceMode}`))}
              </Badge>
            ) : (
              <Badge variant="outline">{t("noProfile")}</Badge>
            )}
            {teacher.isDemo ? <StatusBadge tone="neutral">{t("demo")}</StatusBadge> : null}
          </span>
        }
        description={t("headerDesc")}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/superadmin/teachers">
                <ArrowLeft className="size-4" />
                {t("allTeachers")}
              </Link>
            </Button>

            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t("editProfile")}
            </Button>

            {teacher.status === "pending" ? (
              <>
                <ControlAction
                  label={t("approve")}
                  title={t("approveQ")}
                  confirmText={t("approve")}
                  url={`admin/teachers/${teacherId}/approve`}
                  values={{}}
                  onDone={overview.refetch}
                  description={<p>{t("approveBody")}</p>}
                />
                <ControlAction
                  label={t("reject")}
                  title={t("rejectQ")}
                  destructive
                  requireReason
                  confirmText={t("reject")}
                  url={`admin/teachers/${teacherId}/reject`}
                  values={{}}
                  onDone={overview.refetch}
                  description={<p>{t("rejectBody")}</p>}
                />
              </>
            ) : null}

            {canToggle ? (
              <ControlAction
                label={isActive ? t("deactivate") : t("activate")}
                title={isActive ? t("deactivateQ") : t("activateQ")}
                destructive={isActive}
                // Reason is required in BOTH directions here, unlike the
                // centre toggle: `setUserSuspended` demands one to reinstate
                // as well, so an optional box would be a 422 with no way back
                // to it.
                requireReason
                confirmText={isActive ? t("deactivateBtn") : t("activateBtn")}
                url={`admin/teachers/${teacherId}/status`}
                values={{ action: isActive ? "deactivate" : "activate" }}
                onDone={overview.refetch}
                description={
                  <>
                    <p>
                      <strong>{teacher.name ?? teacher.id.slice(0, 8)}</strong>{" "}
                      {t("movesFrom")} <Num.Code>{teacher.status}</Num.Code>{" "}
                      {t("to")}{" "}
                      <Num.Code>{isActive ? "suspended" : "active"}</Num.Code>.
                    </p>
                    <p>{isActive ? t("deactivateBody") : t("activateBody")}</p>
                  </>
                }
              />
            ) : (
              <Badge variant="outline">
                <Num.Code>{teacher.status}</Num.Code> — {t("statusUseFlow")}
              </Badge>
            )}

            {teacher.status === "blacklisted" ? null : (
              <Button
                size="sm"
                variant="ghost"
                className="text-red"
                onClick={() => setBanning(true)}
              >
                <ShieldBan className="size-4" aria-hidden="true" />
                {t("blacklist")}
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div
          role="tablist"
          aria-label={t("sections")}
          className="flex flex-wrap items-center gap-1 border-b border-rule pb-2"
        >
          {TAB_GROUPS.map((g) => {
            const active = GROUP_OF.get(tab) === g.key;
            return (
              <button
                key={g.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(g.tabs[0])}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-2 hover:bg-field hover:text-ink",
                )}
              >
                {t(asKey(`grp_${g.key}`))}
              </button>
            );
          })}
        </div>

        {(TAB_GROUPS.find((g) => g.key === GROUP_OF.get(tab))?.tabs.length ?? 0) > 1 ? (
          <TabsList className="flex-wrap">
            {TAB_GROUPS.find((g) => g.key === GROUP_OF.get(tab))?.tabs.map((x) => (
              <TabsTrigger key={x} value={x}>
                {t(asKey(`tab_${x}`))}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : null}

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("cntCourses")}
              value={<Num.Figure value={overview.data?.counts.courses ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntStudents")}
              value={<Num.Figure value={overview.data?.counts.students ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntSessions")}
              value={<Num.Figure value={overview.data?.counts.sessions ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntCenters")}
              value={<Num.Figure value={overview.data?.counts.centers ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntAssistants")}
              value={<Num.Figure value={overview.data?.counts.assistants ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntActiveSubs")}
              value={
                <Num.Figure
                  value={overview.data?.counts.activeSubscriptions ?? 0}
                  locale={locale}
                />
              }
            />
            <MetricCard
              label={t("cntSettlements")}
              value={<Num.Figure value={overview.data?.counts.settlements ?? 0} locale={locale} />}
            />
            <MetricCard
              label={t("cntPendingCollabs")}
              value={
                <Num.Figure
                  value={overview.data?.counts.pendingCollaborations ?? 0}
                  locale={locale}
                />
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profileTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                <Row label={t("fEmail")} value={teacher.email} code />
                <Row label={t("fPhone")} value={teacher.phone} code />
                <Row label={t("colStatus")} value={tStatus(asKey(teacher.status))} />
                <Row
                  label={t("fEmailVerified")}
                  value={teacher.emailVerified ? t("yes") : t("no")}
                />
                <Row
                  label={t("f2fa")}
                  value={teacher.twoFactorEnabled ? t("yes") : t("no")}
                />
                <Row label={t("fExperience")} value={profile?.experienceYears ?? "—"} />
                <Row
                  label={t("fSubjects")}
                  value={profile?.subjects.length ? profile.subjects.join(", ") : "—"}
                />
                <Row label={t("fQualifications")} value={profile?.qualifications} />
                <Row
                  label={t("fLessonPrice")}
                  value={
                    profile?.lessonPrice != null ? (
                      <Num.Money piasters={profile.lessonPrice} locale={locale} sign={false} />
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  label={t("fWallet")}
                  value={
                    <Num.Money
                      piasters={profile?.walletBalance ?? 0}
                      locale={locale}
                      sign={false}
                    />
                  }
                />
                <Row label={t("fSystemStatus")} value={profile?.systemStatus} />
                <Row label={t("fAccessLevel")} value={profile?.accessLevel} />
                <Row
                  label={t("fRating")}
                  value={
                    profile?.ratingCount
                      ? `${profile.ratingAvg.toFixed(1)} (${profile.ratingCount})`
                      : "—"
                  }
                />
                <Row
                  label={t("fManagedBy")}
                  value={
                    overview.data?.managedByCenter ? (
                      <Link
                        className="focus-ledger underline underline-offset-2"
                        href={`/dashboard/superadmin/centers/${overview.data.managedByCenter.id}`}
                      >
                        {overview.data.managedByCenter.name}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row label={t("fBio")} value={profile?.bio} />
                <Row
                  label={t("colCreated")}
                  value={
                    <Num.Date
                      value={teacher.createdAt}
                      locale={locale}
                      options={{ dateStyle: "medium" }}
                    />
                  }
                />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="centers">
          <CentersTab teacherId={teacherId} enabled={tab === "centers"} />
        </TabsContent>
        <TabsContent value="assistants">
          <AssistantsTab teacherId={teacherId} enabled={tab === "assistants"} />
        </TabsContent>
        <TabsContent value="students">
          <StudentsTab teacherId={teacherId} enabled={tab === "students"} />
        </TabsContent>
        <TabsContent value="courses">
          <CoursesTab teacherId={teacherId} enabled={tab === "courses"} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab teacherId={teacherId} enabled={tab === "sessions"} />
        </TabsContent>
        <TabsContent value="enrollments">
          <EnrollmentsTab teacherId={teacherId} enabled={tab === "enrollments"} />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceTab teacherId={teacherId} enabled={tab === "attendance"} />
        </TabsContent>
        <TabsContent value="money">
          <MoneyTab teacherId={teacherId} enabled={tab === "money"} />
        </TabsContent>
        <TabsContent value="pending">
          <PendingTab teacherId={teacherId} enabled={tab === "pending"} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab teacherId={teacherId} enabled={tab === "audit"} />
        </TabsContent>
      </Tabs>

      <EntityDialog
        open={editing}
        onOpenChange={setEditing}
        title={t("editTitle")}
        note={t("editNote")}
        busy={saving}
        fields={fields}
        initial={{
          name: teacher.name ?? "",
          email: teacher.email ?? "",
          phone: teacher.phone ?? "",
          subjects: profile?.subjects.join(", ") ?? "",
          qualifications: profile?.qualifications ?? "",
          bio: profile?.bio ?? "",
          experienceYears: profile?.experienceYears ?? 0,
          lessonPrice: profile?.lessonPrice ?? undefined,
        }}
        onSubmit={async (v) => {
          // Only what actually changed is sent: the service refuses an empty
          // patch, and shipping every field would write an audit entry saying
          // nothing changed.
          const values: Record<string, unknown> = {};
          const str = (k: string) => String(v[k] ?? "").trim();

          if (str("name") !== (teacher.name ?? "")) values.name = str("name");
          if (str("email") !== (teacher.email ?? "")) values.email = str("email");
          if (str("phone") !== (teacher.phone ?? "")) values.phone = str("phone") || null;

          if (profile) {
            const subjects = str("subjects")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (subjects.join(",") !== profile.subjects.join(",")) values.subjects = subjects;
            if (str("qualifications") !== (profile.qualifications ?? "")) {
              values.qualifications = str("qualifications") || null;
            }
            if (str("bio") !== (profile.bio ?? "")) values.bio = str("bio") || null;

            const years = Number(v.experienceYears ?? 0);
            if (Number.isFinite(years) && years !== profile.experienceYears) {
              values.experienceYears = Math.trunc(years);
            }
            const price = v.lessonPrice === "" || v.lessonPrice == null ? null : Number(v.lessonPrice);
            if (price !== profile.lessonPrice) {
              values.lessonPrice = price === null || Number.isNaN(price) ? null : Math.trunc(price);
            }
          }

          const res = await patch({ values, successMsg: t("profileSaved") });
          if (res.ok) setEditing(false);
          return res;
        }}
      />

      <ReasonDialog
        open={banning}
        onOpenChange={setBanning}
        title={t("blacklistTitle")}
        description={t("blacklistBody")}
        confirmText={t("blacklist")}
        onConfirm={blacklist}
      />
    </div>
  );
}

function Row({
  label,
  value,
  code = false,
}: {
  label: string;
  value: React.ReactNode;
  code?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule-2 pb-1.5">
      <dt className="shrink-0 text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-end text-ink">
        {value == null || value === "" ? (
          "—"
        ) : code ? (
          <Num.Code>{String(value)}</Num.Code>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
