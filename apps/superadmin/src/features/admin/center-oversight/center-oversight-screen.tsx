"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomMutation } from "@refinedev/core";
import { ArrowLeft, Inbox, Info, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { toast } from "@repo/ui/components/sonner";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num } from "@repo/ui/components/num";
import { StatusBadge } from "@repo/ui/components/status-badge";
import type { Locale } from "@repo/ui/lib/format";
import { cn } from "@repo/ui/lib/utils";
import { asKey } from "@/lib/i18n/keys";
import { useOversight, type Paged } from "./use-oversight";
import { FinanceTab } from "./finance-tab";
import { ControlAction } from "./control-actions";
import { CollabRequestButton } from "./collab-request-dialog";
import {
  StudentsTab,
  TeachersTab,
  StaffTab,
  CenterAdminsCard,
} from "./people-tabs";
import {
  CoursesTab,
  EnrollmentsTab,
  EnrollmentRequestsCard,
  RoomsTab,
} from "./academic-tabs";
import {
  SessionsTab,
  AttendanceTab,
  DeletionRequestsTab,
  BroadcastCard,
  CenterBlacklistCard,
} from "./operations-tabs";
import { ReportsTab, PlatformActionsCard } from "./platform-tabs";
import { AuditLogTable } from "../audit-log-screen";

type Overview = {
  center: {
    id: string;
    name: string;
    shortId: string;
    status: string;
    description: string | null;
    address: string | null;
    area: string | null;
    governorate: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    logoUrl: string | null;
    classroomCount: number;
    walletBalance: number;
    isDemo: boolean;
    createdAt: string;
  };
  admins: { id: string; name?: string | null; email?: string | null; status?: string }[];
  counts: Record<string, number>;
};

const TAB_GROUPS = [
  { key: "overview", tabs: ["overview"] },
  { key: "people", tabs: ["teachers", "students", "staff"] },
  { key: "academic", tabs: ["rooms", "courses", "sessions", "enrollments", "attendance"] },
  { key: "money", tabs: ["subscriptions", "finance"] },
  { key: "platform", tabs: ["pending", "deletions", "reports", "audit"] },
] as const;

const GROUP_OF = new Map<string, string>(
  TAB_GROUPS.flatMap((g) => g.tabs.map((t) => [t, g.key] as const)),
);

export function CenterOversightScreen({ centerId }: { centerId: string }) {
  const [tab, setTab] = useState<string>("overview");
  const t = useTranslations("oversight");
  const tStatus = useTranslations("status");
  const locale = useLocale() as Locale;
  const overview = useOversight<Overview>(centerId, "overview");
  const center = overview.data?.center;

  if (overview.isLoading) return <PageSpinner />;
  if (!center) return <p className="p-4 text-sm text-ink-2">{t("notFound")}</p>;

  const isActive = center.status === "active";
  const canToggle = ["active", "suspended"].includes(center.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {center.name}
            <Badge variant="secondary">{tStatus(asKey(center.status))}</Badge>
            <Badge variant="outline">{center.shortId}</Badge>
            {center.isDemo ? <StatusBadge tone="neutral">{t("demo")}</StatusBadge> : null}
          </span>
        }
        description={t("headerDesc")}
        actions={
          <>
            <BroadcastCard centerId={centerId} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/superadmin/centers">
                <ArrowLeft className="size-4" />
                {t("allCenters")}
              </Link>
            </Button>
            {canToggle ? (
              <ControlAction
                label={isActive ? t("deactivate") : t("activate")}
                title={isActive ? t("deactivateQ") : t("activateQ")}
                destructive={isActive}
                requireReason={isActive}
                confirmText={isActive ? t("deactivateBtn") : t("activateBtn")}
                url={`admin/centers/${centerId}/status`}
                values={{ action: isActive ? "deactivate" : "activate" }}
                onDone={overview.refetch}
                description={
                  <>
                    <p>
                      <strong>{center.name}</strong> {t("movesFrom")}{" "}
                      <Num.Code>{center.status}</Num.Code> {t("to")}{" "}
                      <Num.Code>{isActive ? "suspended" : "active"}</Num.Code>.
                    </p>
                    <p>
                      {isActive
                        ? t("deactivateBody")
                        : t("activateBody")}
                    </p>
                  </>
                }
              />
            ) : (
              <Badge variant="outline">
                <Num.Code>{center.status}</Num.Code> — {t("statusUseFlow")}
              </Badge>
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
            <MetricCard label={t("cntTeachers")} value={<Num.Figure value={overview.data?.counts.teachers ?? 0} locale={locale} />} />
            <MetricCard label={t("cntStudents")} value={<Num.Figure value={overview.data?.counts.students ?? 0} locale={locale} />} />
            <MetricCard label={t("cntCourses")} value={<Num.Figure value={overview.data?.counts.courses ?? 0} locale={locale} />} />
            <MetricCard label={t("cntRooms")} value={<Num.Figure value={overview.data?.counts.rooms ?? 0} locale={locale} />} />
            <MetricCard label={t("cntStaff")} value={<Num.Figure value={overview.data?.counts.staff ?? 0} locale={locale} />} />
            <MetricCard label={t("cntActiveSubs")} value={<Num.Figure value={overview.data?.counts.activeSubscriptions ?? 0} locale={locale} />} />
            <MetricCard label={t("cntSessions")} value={<Num.Figure value={overview.data?.counts.sessions ?? 0} locale={locale} />} />
            <MetricCard label={t("cntPendingCollabs")} value={<Num.Figure value={overview.data?.counts.pendingCollaborations ?? 0} locale={locale} />} />
          </div>

          <CenterProfileCard center={center} onSaved={overview.refetch} />

          <CenterAdminsCard centerId={centerId} />

          <PlatformActionsCard centerId={centerId} />
        </TabsContent>

        <TabsContent value="rooms">
          <RoomsTab centerId={centerId} enabled={tab === "rooms"} />
        </TabsContent>

        <TabsContent value="teachers">
          <TeachersTab centerId={centerId} enabled={tab === "teachers"} />
        </TabsContent>

        <TabsContent value="students" className="space-y-4">
          <StudentsTab centerId={centerId} enabled={tab === "students"} />
          {tab === "students" ? <CenterBlacklistCard centerId={centerId} /> : null}
        </TabsContent>

        <TabsContent value="courses">
          <CoursesTab centerId={centerId} enabled={tab === "courses"} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab centerId={centerId} enabled={tab === "sessions"} />
        </TabsContent>

        <TabsContent value="enrollments">
          <EnrollmentsTab centerId={centerId} enabled={tab === "enrollments"} />
        </TabsContent>

        <TabsContent value="subscriptions">
          <SimpleTable
            centerId={centerId}
            tab="subscriptions"
            enabled={tab === "subscriptions"}
            columns={[
              { key: "studentName", label: t("colStudent") },
              { key: "courseTitle", label: t("colCourse") },
              { key: "plan", label: t("colPlan"), enumNs: "plans" },
              { key: "price", label: t("colPrice"), money: true },
              { key: "status", label: t("colStatus"), enumNs: "status" },
              { key: "paymentMethod", label: t("colMethod"), enumNs: "methods" },
              { key: "periodEnd", label: t("colCoversUntil"), date: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab centerId={centerId} enabled={tab === "attendance"} />
        </TabsContent>

        <TabsContent value="staff">
          <StaffTab centerId={centerId} enabled={tab === "staff"} />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <PendingTab centerId={centerId} enabled={tab === "pending"} />
          {tab === "pending" ? <EnrollmentRequestsCard centerId={centerId} /> : null}
        </TabsContent>

        <TabsContent value="deletions">
          <DeletionRequestsTab centerId={centerId} enabled={tab === "deletions"} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab centerId={centerId} enabled={tab === "reports"} />
        </TabsContent>

        <TabsContent value="finance">
          {tab === "finance" ? <FinanceTab centerId={centerId} /> : null}
        </TabsContent>

        <TabsContent value="audit">
          <Alert className="mb-3">
            <Info className="size-4" />
            <AlertTitle>{t("auditTitle")}</AlertTitle>
            <AlertDescription>
              {t("auditBody")}
            </AlertDescription>
          </Alert>
          {tab === "audit" ? <AuditLogTable fixedCenterId={centerId} /> : null}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-ink-2">
        {t("walletLine")}: <Num.Money piasters={center.walletBalance} locale={locale} sign={false} />{" "}
        · {t("registered")}{" "}
        <Num.Date value={center.createdAt} locale={locale} options={{ dateStyle: "medium" }} />
      </p>
    </div>
  );
}

type ProfileField = {
  key: "name" | "phone" | "whatsapp" | "email" | "governorate" | "area" | "address" | "logoUrl";
  labelKey: string;
  required?: boolean;
};

const PROFILE_FIELDS: ProfileField[] = [
  { key: "name", labelKey: "fName", required: true },
  { key: "phone", labelKey: "fPhone" },
  { key: "whatsapp", labelKey: "fWhatsapp" },
  { key: "email", labelKey: "fEmail" },
  { key: "governorate", labelKey: "fGovernorate" },
  { key: "area", labelKey: "fArea" },
  { key: "address", labelKey: "fAddress" },
  { key: "logoUrl", labelKey: "fLogoUrl" },
];

function CenterProfileCard({
  center,
  onSaved,
}: {
  center: Overview["center"];
  onSaved: () => void;
}) {
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      PROFILE_FIELDS.map((f) => [f.key, (center[f.key] as string | null) ?? ""]),
    ),
  );
  const [description, setDescription] = useState(center.description ?? "");
  const [classroomCount, setClassroomCount] = useState(String(center.classroomCount ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    for (const f of PROFILE_FIELDS) {
      const next = form[f.key].trim();
      const current = ((center[f.key] as string | null) ?? "").trim();
      if (next === current) continue;
      if (f.required && !next) {
        toast.error(`${t(asKey(f.labelKey))} ${t("cannotBeEmpty")}`);
        return;
      }
      patch[f.key] = next === "" ? (f.required ? undefined : null) : next;
    }
    if (description.trim() !== (center.description ?? "").trim()) {
      patch.description = description.trim() || null;
    }
    const cc = Number(classroomCount);
    if (Number.isFinite(cc) && cc !== center.classroomCount) patch.classroomCount = Math.round(cc);

    if (!Object.keys(patch).length) {
      toast.info(t("nothingChanged"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({ url: `admin/centers/${center.id}`, method: "patch", values: patch });
      toast.success(t("profileSaved"));
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to update profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profileTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <Info className="size-4" />
          <AlertTitle>{t("editableTitle")}</AlertTitle>
          <AlertDescription>
            {t("editableBody")}
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1 text-sm">
              <span className="font-medium">
                {t(asKey(f.labelKey))}
                {f.required ? <span className="text-red"> *</span> : null}
              </span>
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t("fClassroomCount")}</span>
            <Input
              type="number"
              min={0}
              value={classroomCount}
              onChange={(e) => setClassroomCount(e.target.value)}
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("fDescription")}</span>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save className="size-4" />}
          {t("saveProfile")}
        </Button>
      </CardContent>
    </Card>
  );
}

type Col = {
  key: string;
  label: string;
  money?: boolean;
  date?: boolean;
  enumNs?: string;
};

function SimpleTable({
  centerId,
  tab,
  enabled,
  columns,
  note,
}: {
  centerId: string;
  tab: string;
  enabled: boolean;
  columns: Col[];
  note?: string;
}) {
  const t = useTranslations("oversight");
  const tRoot = useTranslations();
  const tEnum = (key: string, raw: string) =>
    tRoot.has(asKey(key)) ? tRoot(asKey(key)) : raw;
  const locale = useLocale() as Locale;
  const req = useOversight<Paged<Record<string, unknown>>>(centerId, tab, {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.data ?? [];
  return (
    <div className="space-y-2">
      {note ? <p className="text-xs text-ink-2">{note}</p> : null}
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("nothingHere")} />
      ) : (
        <>
          <p className="text-xs text-ink-2">
            {t("showing")} <Num.Figure value={rows.length} locale={locale} /> {t("of")}{" "}
            <Num.Figure value={req.data?.total ?? rows.length} locale={locale} />
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.money ? "text-end" : undefined}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={(r.id as string) ?? i}>
                    {columns.map((c) => {
                      const v = r[c.key];
                      return (
                        <TableCell
                          key={c.key}
                          className={c.money ? "text-end tabular-nums" : undefined}
                        >
                          {v == null ? (
                            "—"
                          ) : c.money ? (
                            <Num.Money piasters={v as number} locale={locale} tone="muted" sign={false} />
                          ) : c.date ? (
                            <Num.Date
                              value={v as string}
                              locale={locale}
                              options={{ dateStyle: "medium" }}
                              className="text-[11px] text-ink-3"
                            />
                          ) : c.enumNs ? (
                            tEnum(`${c.enumNs}.${String(v)}`, String(v))
                          ) : (
                            String(v)
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function PendingTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const req = useOversight<{
    collaborationRequests: {
      id: string;
      initiator: string;
      teacherName: string | null;
      subjectName: string | null;
      roomId: string | null;
      proposedPricingMethod: string | null;
      startDate: string;
      expiresAt: string;
    }[];
    enrollmentRequests: {
      id: string;
      studentName: string | null;
      courseTitle: string | null;
      submittedAt: string;
    }[];
    affiliations: { id: string; teacherName: string | null; invitedAt: string }[];
  }>(centerId, "pending", { enabled });

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const collabs = req.data?.collaborationRequests ?? [];
  const affs = req.data?.affiliations ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("collabRequests")}</CardTitle>
          <CollabRequestButton centerId={centerId} onDone={req.refetch} />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-ink-2">
            Deciding here runs the same transaction the teacher or center would run — affiliation,
            course, schedule and the frozen pricing snapshot, all or nothing. No rate is entered:
            approving a hall that offers both pricing methods only picks which
            superadmin-configured rate applies.
          </p>
          {collabs.length === 0 ? (
            <p className="text-sm text-ink-2">{t("nothingPending")}</p>
          ) : (
            collabs.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {c.subjectName ?? "—"} · {c.teacherName ?? "—"}
                  </div>
                  <div className="text-xs text-ink-2">
                    {t("initiatedBy")} {c.initiator} · {t("starts")}{" "}
                    <Num.Date value={c.startDate} locale={locale} options={{ dateStyle: "medium" }} /> ·{" "}
                    {t("expires")}{" "}
                    <Num.Date value={c.expiresAt} locale={locale} options={{ dateStyle: "medium" }} />
                    {" · "}
                    {c.roomId
                      ? `${t("hallBooked")}${c.proposedPricingMethod ? "" : ` (${t("methodNotChosen")})`}`
                      : t("noHall")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <ControlAction
                    label={t("approve")}
                    title={t("approveQ")}
                    confirmText={t("approve")}
                    url={`admin/collaboration-requests/${c.id}/decide`}
                    values={{
                      decision: "approve",
                      ...(c.roomId && !c.proposedPricingMethod
                        ? { pricingMethod: "whole_room_percent" }
                        : {}),
                    }}
                    onDone={req.refetch}
                    description={
                      <>
                        <p>
                          {t("approveBody")}
                        </p>
                        {c.roomId && !c.proposedPricingMethod ? (
                          <p>
                            {t("approveMethodNote")}
                          </p>
                        ) : null}
                      </>
                    }
                  />
                  <ControlAction
                    label={t("reject")}
                    title={t("rejectQ")}
                    destructive
                    requireReason
                    confirmText={t("reject")}
                    url={`admin/collaboration-requests/${c.id}/decide`}
                    values={{ decision: "reject" }}
                    onDone={req.refetch}
                    description={
                      <p>
                        {t("rejectBody")}
                      </p>
                    }
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("otherPending")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="font-medium">{t("pendingAffiliations")} (<Num.Figure value={affs.length} locale={locale} />)</p>
            {affs.length === 0 ? (
              <p className="text-ink-2">{t("none")}</p>
            ) : (
              <ul className="text-ink-2">
                {affs.map((a) => (
                  <li key={a.id}>
                    {a.teacherName ?? "—"} · {t("invited")}{" "}
                    <Num.Date value={a.invitedAt} locale={locale} options={{ dateStyle: "medium" }} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
