"use client";

import { useState } from "react";
import Link from "next/link";
import { useCustomMutation } from "@refinedev/core";
import { ArrowLeft, Info, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
import { StatCard } from "@/components/kit/stat-card";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useOversight, type Paged } from "./use-oversight";
import { FinanceTab } from "./finance-tab";
import { ControlAction } from "./control-actions";
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

// ---------------------------------------------------------------------------
// One center, end to end: everything readable on the left-hand tabs, and a
// closed set of named, audited actions inline where they belong.
// ---------------------------------------------------------------------------

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

const TABS = [
  "overview",
  "rooms",
  "teachers",
  "students",
  "courses",
  "sessions",
  "enrollments",
  "subscriptions",
  "attendance",
  "staff",
  "pending",
  "deletions",
  "reports",
  "finance",
  "audit",
] as const;

export function CenterOversightScreen({ centerId }: { centerId: string }) {
  const [tab, setTab] = useState<string>("overview");
  const { formatEGP, formatDate, formatNumber } = useFormatters();
  const overview = useOversight<Overview>(centerId, "overview");
  const center = overview.data?.center;

  if (overview.isLoading) return <PageSpinner />;
  if (!center) return <p className="p-4 text-sm text-muted-foreground">Center not found.</p>;

  const isActive = center.status === "active";
  const canToggle = ["active", "suspended"].includes(center.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Center oversight"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {center.name}
            <Badge variant="secondary">{center.status}</Badge>
            <Badge variant="outline">{center.shortId}</Badge>
            {center.isDemo ? <Badge variant="outline">demo</Badge> : null}
          </span>
        }
        description="Full read visibility across this center, plus a fixed set of audited control actions. Financial records are visible but never editable here."
        actions={
          <>
            <BroadcastCard centerId={centerId} />
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/superadmin/centers">
                <ArrowLeft className="size-4" />
                All centers
              </Link>
            </Button>
            {canToggle ? (
              <ControlAction
                label={isActive ? "Deactivate center" : "Activate center"}
                title={isActive ? "Deactivate this center?" : "Activate this center?"}
                destructive={isActive}
                requireReason={isActive}
                confirmText={isActive ? "Deactivate" : "Activate"}
                url={`admin/centers/${centerId}/status`}
                values={{ action: isActive ? "deactivate" : "activate" }}
                onDone={overview.refetch}
                description={
                  <>
                    <p>
                      <strong>{center.name}</strong> moves from{" "}
                      <code>{center.status}</code> to{" "}
                      <code>{isActive ? "suspended" : "active"}</code>.
                    </p>
                    <p>
                      {isActive
                        ? "Its center-admin accounts are suspended with it, and every live session is cut on the next request. Courses, enrollments, rosters and all financial history are left untouched — reactivating restores access exactly."
                        : "Its center-admin accounts are reactivated with it and can sign in again."}
                    </p>
                  </>
                }
              />
            ) : (
              <Badge variant="outline">
                status &lsquo;{center.status}&rsquo; — use the registration / blacklist flow
              </Badge>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ---------------- Overview ---------------- */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Teachers" value={formatNumber(overview.data?.counts.teachers ?? 0)} />
            <StatCard label="Students" value={formatNumber(overview.data?.counts.students ?? 0)} />
            <StatCard label="Courses" value={formatNumber(overview.data?.counts.courses ?? 0)} />
            <StatCard label="Rooms" value={formatNumber(overview.data?.counts.rooms ?? 0)} />
            <StatCard label="Staff accounts" value={formatNumber(overview.data?.counts.staff ?? 0)} />
            <StatCard
              label="Active subscriptions"
              value={formatNumber(overview.data?.counts.activeSubscriptions ?? 0)}
            />
            <StatCard label="Sessions" value={formatNumber(overview.data?.counts.sessions ?? 0)} />
            <StatCard
              label="Pending collaborations"
              value={formatNumber(overview.data?.counts.pendingCollaborations ?? 0)}
            />
          </div>

          <CenterProfileCard center={center} onSaved={overview.refetch} />

          <CenterAdminsCard centerId={centerId} />

          <PlatformActionsCard centerId={centerId} />
        </TabsContent>

        {/* ---------------- Rooms ---------------- */}
        <TabsContent value="rooms">
          <RoomsTab centerId={centerId} enabled={tab === "rooms"} />
        </TabsContent>

        {/* ---------------- Teachers ---------------- */}
        <TabsContent value="teachers">
          <TeachersTab centerId={centerId} enabled={tab === "teachers"} />
        </TabsContent>

        {/* ---------------- Students ---------------- */}
        <TabsContent value="students" className="space-y-4">
          <StudentsTab centerId={centerId} enabled={tab === "students"} />
          {tab === "students" ? <CenterBlacklistCard centerId={centerId} /> : null}
        </TabsContent>

        {/* ---------------- Courses ---------------- */}
        <TabsContent value="courses">
          <CoursesTab centerId={centerId} enabled={tab === "courses"} />
        </TabsContent>

        {/* ---------------- Sessions ---------------- */}
        <TabsContent value="sessions">
          <SessionsTab centerId={centerId} enabled={tab === "sessions"} />
        </TabsContent>

        {/* ---------------- Enrollments ---------------- */}
        <TabsContent value="enrollments">
          <EnrollmentsTab centerId={centerId} enabled={tab === "enrollments"} />
        </TabsContent>

        {/* ---------------- Subscriptions ---------------- */}
        <TabsContent value="subscriptions">
          <SimpleTable
            centerId={centerId}
            tab="subscriptions"
            enabled={tab === "subscriptions"}
            columns={[
              { key: "studentName", label: "Student" },
              { key: "courseTitle", label: "Course" },
              { key: "plan", label: "Plan" },
              { key: "price", label: "Price", money: true },
              { key: "status", label: "Status" },
              { key: "paymentMethod", label: "Method" },
              { key: "periodEnd", label: "Covers until", date: true },
            ]}
          />
        </TabsContent>

        {/* ---------------- Attendance ---------------- */}
        <TabsContent value="attendance">
          <AttendanceTab centerId={centerId} enabled={tab === "attendance"} />
        </TabsContent>

        {/* ---------------- Staff ---------------- */}
        <TabsContent value="staff">
          <StaffTab centerId={centerId} enabled={tab === "staff"} />
        </TabsContent>

        {/* ---------------- Pending ---------------- */}
        <TabsContent value="pending" className="space-y-4">
          <PendingTab centerId={centerId} enabled={tab === "pending"} />
          {tab === "pending" ? <EnrollmentRequestsCard centerId={centerId} /> : null}
        </TabsContent>

        {/* ---------------- Deletion requests ---------------- */}
        <TabsContent value="deletions">
          <DeletionRequestsTab centerId={centerId} enabled={tab === "deletions"} />
        </TabsContent>

        {/* ---------------- Reports ---------------- */}
        <TabsContent value="reports">
          <ReportsTab centerId={centerId} enabled={tab === "reports"} />
        </TabsContent>

        {/* ---------------- Finance ---------------- */}
        <TabsContent value="finance">
          {tab === "finance" ? <FinanceTab centerId={centerId} /> : null}
        </TabsContent>

        {/* ---------------- Audit ---------------- */}
        <TabsContent value="audit">
          <Alert className="mb-3">
            <Info className="size-4" />
            <AlertTitle>Every control action on this center</AlertTitle>
            <AlertDescription>
              Who did it, what changed (before and after), and when. The audit table itself is
              append-only at the database level — it cannot be edited or erased from here.
            </AlertDescription>
          </Alert>
          {tab === "audit" ? <AuditLogTable fixedCenterId={centerId} /> : null}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Center wallet balance: {formatEGP(center.walletBalance)} · registered{" "}
        {formatDate(center.createdAt, { dateStyle: "medium" })}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile editor — the allowlisted fields only.
// ---------------------------------------------------------------------------

type ProfileField = {
  key: "name" | "phone" | "whatsapp" | "email" | "governorate" | "area" | "address" | "logoUrl";
  label: string;
  required?: boolean;
};

const PROFILE_FIELDS: ProfileField[] = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "governorate", label: "Governorate" },
  { key: "area", label: "Area" },
  { key: "address", label: "Address" },
  { key: "logoUrl", label: "Logo URL" },
];

function CenterProfileCard({
  center,
  onSaved,
}: {
  center: Overview["center"];
  onSaved: () => void;
}) {
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
        toast.error(`${f.label} cannot be empty`);
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
      toast.info("Nothing changed");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({ url: `admin/centers/${center.id}`, method: "patch", values: patch });
      toast.success("Profile updated — recorded in the audit log");
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
        <CardTitle className="text-base">Center profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <Info className="size-4" />
          <AlertTitle>What is editable here</AlertTitle>
          <AlertDescription>
            Identity and contact details only. The wallet balance, receipt sequence, short ID
            and account status are not editable from this form — and neither are the revenue
            split or commission percentages, which keep their own pricing screen so a
            money-sensitive number never has two edit paths.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1 text-sm">
              <span className="font-medium">
                {f.label}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </span>
              <Input
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Classroom count</span>
            <Input
              type="number"
              min={0}
              value={classroomCount}
              onChange={(e) => setClassroomCount(e.target.value)}
            />
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Description</span>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save className="size-4" />}
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Generic read-only table for the simple tabs.
// ---------------------------------------------------------------------------

type Col = { key: string; label: string; money?: boolean; date?: boolean };

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
  const { formatEGP, formatDate } = useFormatters();
  const req = useOversight<Paged<Record<string, unknown>>>(centerId, tab, {
    enabled,
    query: { limit: "100" },
  });
  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.data ?? [];
  return (
    <div className="space-y-2">
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {req.data?.total ?? rows.length}
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
                          {v == null
                            ? "—"
                            : c.money
                              ? formatEGP(v as number)
                              : c.date
                                ? formatDate(v as string, { dateStyle: "medium" })
                                : String(v)}
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

// ---------------------------------------------------------------------------
// Pending items — approve / reject
// ---------------------------------------------------------------------------

function PendingTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatDate } = useFormatters();
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
        <CardHeader>
          <CardTitle className="text-base">Collaboration requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Deciding here runs the same transaction the teacher or center would run — affiliation,
            course, schedule and the frozen pricing snapshot, all or nothing. No rate is entered:
            approving a hall that offers both pricing methods only picks which
            superadmin-configured rate applies.
          </p>
          {collabs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing pending.</p>
          ) : (
            collabs.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {c.subjectName ?? "—"} · {c.teacherName ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    initiated by {c.initiator} · starts {formatDate(c.startDate, { dateStyle: "medium" })} ·
                    expires {formatDate(c.expiresAt, { dateStyle: "medium" })}
                    {c.roomId ? ` · hall booked${c.proposedPricingMethod ? ` (${c.proposedPricingMethod})` : " (method not chosen yet)"}` : " · no hall"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <ControlAction
                    label="Approve"
                    title="Approve on behalf of the platform?"
                    confirmText="Approve"
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
                          Creates the affiliation, the course, its sessions and the frozen pricing
                          snapshot in one transaction. Both the teacher and the center are notified
                          that the platform decided.
                        </p>
                        {c.roomId && !c.proposedPricingMethod ? (
                          <p>
                            This hall offers both pricing methods and the teacher never chose one.
                            Approving here applies <code>whole_room_percent</code>.
                          </p>
                        ) : null}
                      </>
                    }
                  />
                  <ControlAction
                    label="Reject"
                    title="Reject on behalf of the platform?"
                    destructive
                    requireReason
                    confirmText="Reject"
                    url={`admin/collaboration-requests/${c.id}/decide`}
                    values={{ decision: "reject" }}
                    onDone={req.refetch}
                    description={
                      <p>
                        The request is closed and both sides are notified with the reason. No
                        course or schedule is created.
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
          <CardTitle className="text-base">Other pending items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="font-medium">Pending teacher affiliations ({affs.length})</p>
            {affs.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="text-muted-foreground">
                {affs.map((a) => (
                  <li key={a.id}>
                    {a.teacherName ?? "—"} · invited{" "}
                    {formatDate(a.invitedAt, { dateStyle: "medium" })}
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
