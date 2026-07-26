"use client";

import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { LogOut, ShieldAlert, ArrowRightLeft, BarChart3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatCard } from "@/components/kit/stat-card";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useAdminGet } from "./use-oversight";

// ---------------------------------------------------------------------------
// PHASE 5 — the Reports tab (the center's own reporting, for any center) and
// the platform-only actions no center has.
// ---------------------------------------------------------------------------

const REPORTS = [
  { key: "revenue", label: "Revenue" },
  { key: "net-profit", label: "Net profit" },
  { key: "expenses", label: "Expenses" },
  { key: "course-fill-rates", label: "Course fill rates" },
  { key: "attendance-by-course", label: "Attendance by course" },
  { key: "enrollment-funnel", label: "Enrollment funnel" },
] as const;

export function ReportsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatEGP, formatNumber } = useFormatters();
  const [report, setReport] = useState<string>("revenue");
  const dash = useAdminGet<Record<string, unknown>>(`admin/centers/${centerId}/dashboard`, {
    enabled,
  });
  const data = useAdminGet<unknown>(`admin/centers/${centerId}/reports/${report}`, {
    enabled,
  });

  if (!enabled) return null;

  const d = (dash.data ?? {}) as Record<string, number | undefined>;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);

  return (
    <div className="space-y-4">
      <Alert>
        <BarChart3 className="size-4" />
        <AlertTitle>The center&apos;s own reporting</AlertTitle>
        <AlertDescription>
          These are the same aggregations the center sees on its portal, read for this center.
          Every figure is derived — nothing on this tab writes.
        </AlertDescription>
      </Alert>

      {dash.isLoading ? (
        <PageSpinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Students" value={formatNumber(num(d.totalStudents))} />
          <StatCard label="Active classes" value={formatNumber(num(d.activeClasses))} />
          <StatCard label="Revenue" value={formatEGP(num(d.totalRevenue))} />
          <StatCard
            label="Attendance rate"
            value={`${Math.round(num(d.attendanceRate))}%`}
          />
        </div>
      )}

      <Tabs value={report} onValueChange={setReport}>
        <TabsList className="flex-wrap">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORTS.map((r) => (
          <TabsContent key={r.key} value={r.key}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{r.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.isLoading ? (
                  <Spinner />
                ) : (
                  <pre className="overflow-x-auto rounded-md bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                    {JSON.stringify(data.data ?? {}, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Platform-only actions
// ===========================================================================

export function PlatformActionsCard({ centerId }: { centerId: string }) {
  const [open, setOpen] = useState<null | "move" | "logout" | "dob">(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>No center can do these</AlertTitle>
            <AlertDescription>
              They exist for platform support, so each one is narrow and says what it will not
              do. Moving a course between centers is deliberately not offered — its pricing was
              frozen from this center and its sessions have settled here.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen("move")}>
              <ArrowRightLeft className="size-4" />
              Move a student to another center
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("logout")}>
              <LogOut className="size-4" />
              Force logout
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("dob")}>
              Verify a date of birth
            </Button>
          </div>
        </CardContent>
      </Card>

      <MoveStudentDialog open={open === "move"} onClose={() => setOpen(null)} centerId={centerId} />
      <ForceLogoutDialog open={open === "logout"} onClose={() => setOpen(null)} centerId={centerId} />
      <VerifyDobDialog open={open === "dob"} onClose={() => setOpen(null)} centerId={centerId} />
    </>
  );
}

function useRoster(centerId: string, enabled: boolean) {
  const req = useAdminGet<{ items: { studentId: string; name?: string | null }[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled },
  );
  return req.data?.items ?? [];
}

function MoveStudentDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const { mutateAsync } = useCustomMutation();
  const students = useRoster(centerId, open);
  const centers = useAdminGet<{ id: string; name: string; status: string }[]>("admin/centers", {
    enabled: open,
    query: { take: "100" },
  });
  const [studentId, setStudentId] = useState("");
  const [toCenterId, setToCenterId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    leftBehind: { activeEnrollments: number; activeSubscriptions: number; payments: number };
  }>(null);

  const submit = async () => {
    if (!studentId || !toCenterId || !reason.trim()) {
      toast.error("Student, destination and a reason are required");
      return;
    }
    setBusy(true);
    try {
      const res = (await mutateAsync({
        url: `admin/platform/students/${studentId}/move`,
        method: "post",
        values: { fromCenterId: centerId, toCenterId, reason: reason.trim() },
      })) as { data?: { leftBehind?: { activeEnrollments: number; activeSubscriptions: number; payments: number } } };
      setResult({
        leftBehind: res?.data?.leftBehind ?? {
          activeEnrollments: 0,
          activeSubscriptions: 0,
          payments: 0,
        },
      });
      toast.success("Student moved — roster only");
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to move the student");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setResult(null);
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move a student to another center</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p>The student is now on the destination center&apos;s roster.</p>
            <Alert>
              <AlertTitle>What stayed at this center</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  <li>{result.leftBehind.activeEnrollments} active enrollment(s)</li>
                  <li>{result.leftBehind.activeSubscriptions} active subscription(s)</li>
                  <li>{result.leftBehind.payments} payment record(s)</li>
                </ul>
                These are facts about what happened here, and some have already settled — they
                are never moved. Enrol the student at the new center as a new arrival.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Roster only.</strong> Enrollments, subscriptions, payments and wallet
              history stay at this center.
            </p>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Student</span>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.studentId} value={s.studentId}>
                      {s.name ?? s.studentId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Destination center</span>
              <Select value={toCenterId} onValueChange={setToCenterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a center" />
                </SelectTrigger>
                <SelectContent>
                  {(centers.data ?? [])
                    .filter((c) => c.id !== centerId && c.status === "active")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">
                Reason <span className="text-destructive">*</span>
              </span>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Spinner /> : null}
              Move student
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ForceLogoutDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const { mutateAsync } = useCustomMutation();
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!userId.trim() || !reason.trim()) {
      toast.error("A user id and a reason are required");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/platform/users/${userId.trim()}/force-logout`,
        method: "post",
        values: { reason: reason.trim(), centerId },
      });
      toast.success("Every live session for that account is now dead");
      setUserId("");
      setReason("");
      onClose();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to force logout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Force logout</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Kills every live session on the account&apos;s next request. It changes no status and
            deletes nothing — <strong>the person can sign straight back in</strong>. If you mean
            to stop them using the platform, deactivate the account instead.
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">User id</span>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">
              Reason <span className="text-destructive">*</span>
            </span>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Force logout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDobDialog({
  open,
  onClose,
  centerId,
}: {
  open: boolean;
  onClose: () => void;
  centerId: string;
}) {
  const { mutateAsync } = useCustomMutation();
  const students = useRoster(centerId, open);
  const [studentId, setStudentId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Age is derived when the date CHANGES, not during render: reading the clock
  // mid-render is impure and the compiler rejects it.
  const [age, setAge] = useState<number | null>(null);
  const onDobChange = (v: string) => {
    setDateOfBirth(v);
    setAge(v ? Math.floor((Date.now() - new Date(v).getTime()) / (365.2425 * 864e5)) : null);
  };
  const wouldBeAdult = age !== null && age >= 18;

  const submit = async () => {
    if (!studentId || !dateOfBirth || !reason.trim()) {
      toast.error("Student, date of birth and a reason are required");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/platform/students/${studentId}/verify-dob`,
        method: "post",
        values: { dateOfBirth, reason: reason.trim(), centerId },
      });
      toast.success("Date of birth verified — recorded in the audit log");
      setDateOfBirth("");
      setAge(null);
      setReason("");
      onClose();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to verify");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-warning" />
            Verify a date of birth
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A student counts as a <strong>minor</strong> unless a verified date of birth shows
            18 or over, and parent oversight of their conversations is active for every minor.
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Student</span>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.studentId} value={s.studentId}>
                    {s.name ?? s.studentId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Date of birth</span>
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(e) => onDobChange(e.target.value)}
            />
          </label>
          {wouldBeAdult ? (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>This turns parent oversight OFF</AlertTitle>
              <AlertDescription>
                {age} years old — verifying this makes them an adult, and their parent will no
                longer be able to see their conversations with staff and teachers.
              </AlertDescription>
            </Alert>
          ) : age !== null ? (
            <p className="text-xs text-muted-foreground">
              {age} years old — still a minor, so parent oversight stays on.
            </p>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="block font-medium">
              Reason — what evidence was seen? <span className="text-destructive">*</span>
            </span>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button
            variant={wouldBeAdult ? "destructive" : "default"}
            onClick={submit}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
