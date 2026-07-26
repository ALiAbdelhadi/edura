"use client";

import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { AlertTriangle, Megaphone, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useAdminGet, useOversight, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

// ---------------------------------------------------------------------------
// PHASE 3 — Operations tabs.
//
// The one screen here that moves money is "Complete session": it runs the same
// settlement a teacher's own complete runs. So it never fires from a bare row
// button — it opens a PREVIEW of exactly what will be distributed first.
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string;
  courseId: string;
  courseTitle: string | null;
  teacherName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  distributedAt: string | null;
};

export function SessionsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatDate } = useFormatters();
  const req = useOversight<Paged<SessionRow>>(centerId, "sessions", {
    enabled,
    query: { limit: "100" },
  });
  const [completing, setCompleting] = useState<SessionRow | null>(null);
  const [postponing, setPostponing] = useState<SessionRow | null>(null);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.data ?? [];

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>Settled sessions are locked</AlertTitle>
        <AlertDescription>
          Once a session has been settled its revenue is already distributed, so it can no longer
          be cancelled, moved, or completed again. Completing a session is the one action on this
          screen that writes to the ledger — it always shows a preview first.
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No sessions.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Settled</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const settled = !!s.distributedAt;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.courseTitle ?? "—"}</TableCell>
                    <TableCell>{s.teacherName ?? "—"}</TableCell>
                    <TableCell>{formatDate(s.date, { dateStyle: "medium" })}</TableCell>
                    <TableCell>
                      {s.startTime}–{s.endTime}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {settled ? (
                        <Badge variant="outline">
                          {formatDate(s.distributedAt as string, { dateStyle: "short" })}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {settled ? (
                        <span className="text-xs text-muted-foreground">locked — settled</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" onClick={() => setCompleting(s)}>
                            Complete &amp; settle
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPostponing(s)}>
                            Postpone
                          </Button>
                          <ControlAction
                            label="Cancel"
                            title="Cancel this session?"
                            destructive
                            requireReason
                            confirmText="Cancel session"
                            url={`admin/centers/${centerId}/sessions/${s.id}/cancel`}
                            values={{}}
                            onDone={req.refetch}
                            description={
                              <p>
                                Students are notified. Refused if the session has already been
                                settled.
                              </p>
                            }
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CompleteSessionDialog
        session={completing}
        centerId={centerId}
        onClose={() => setCompleting(null)}
        onDone={req.refetch}
      />
      <PostponeDialog
        session={postponing}
        centerId={centerId}
        onClose={() => setPostponing(null)}
        onDone={req.refetch}
      />
    </div>
  );
}

type Preview = {
  courseTitle: string;
  presentCount: number;
  plannedSessions: number;
  perSessionPrice: number;
  alreadySettled: boolean;
  frozenPricing: {
    pricingMethod: string | null;
    splitPlatformBp: number | null;
    splitTeacherBp: number | null;
    splitCenterBp: number | null;
    m2CenterFee: number | null;
    m2CenterBp: number | null;
  } | null;
};

/** §3.1 — never a bare button. Shows what will be distributed, then confirms. */
function CompleteSessionDialog({
  session,
  centerId,
  onClose,
  onDone,
}: {
  session: SessionRow | null;
  centerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { formatEGP } = useFormatters();
  const { mutateAsync } = useCustomMutation();
  const [busy, setBusy] = useState(false);
  const preview = useAdminGet<Preview>(
    `admin/centers/${centerId}/sessions/${session?.id}/settlement-preview`,
    { enabled: !!session },
  );

  const p = preview.data;
  const bp = (v: number | null | undefined) => (v == null ? "—" : `${(v / 100).toFixed(2)}%`);

  const run = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/sessions/${session.id}/complete`,
        method: "post",
        values: {},
      });
      toast.success("Session completed — revenue distributed and recorded in the audit log");
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to complete the session");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />
            Complete and settle this session?
          </DialogTitle>
        </DialogHeader>

        {preview.isLoading || !p ? (
          <PageSpinner />
        ) : (
          <div className="space-y-3 text-sm">
            <Alert>
              <AlertTitle>This writes to the ledger</AlertTitle>
              <AlertDescription>
                It runs the same settlement the teacher&apos;s own &ldquo;complete&rdquo; runs, at
                the rates frozen onto this course when it was created. It happens exactly once —
                a settled session cannot be settled again.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border p-3">
              <p className="font-medium">{p.courseTitle}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <dt className="text-muted-foreground">Students present</dt>
                <dd className="text-end font-semibold tabular-nums">{p.presentCount}</dd>
                <dt className="text-muted-foreground">Per-session price</dt>
                <dd className="text-end tabular-nums">{formatEGP(p.perSessionPrice)}</dd>
                <dt className="text-muted-foreground">Pricing method</dt>
                <dd className="text-end">{p.frozenPricing?.pricingMethod ?? "commission model"}</dd>
                <dt className="text-muted-foreground">Platform / teacher / center</dt>
                <dd className="text-end tabular-nums">
                  {bp(p.frozenPricing?.splitPlatformBp)} / {bp(p.frozenPricing?.splitTeacherBp)} /{" "}
                  {bp(p.frozenPricing?.splitCenterBp)}
                </dd>
              </dl>
            </div>

            {p.presentCount === 0 ? (
              <p className="text-xs text-destructive">
                No students are marked present — settling now distributes nothing. Check the
                attendance first.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || preview.isLoading || p?.alreadySettled}>
            {busy ? <Spinner /> : null}
            Complete &amp; distribute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostponeDialog({
  session,
  centerId,
  onClose,
  onDone,
}: {
  session: SessionRow | null;
  centerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const [f, setF] = useState({ newDate: "", newStartTime: "", newEndTime: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!session || !f.newDate || !f.newStartTime || !f.newEndTime || !f.reason.trim()) {
      toast.error("Date, times and a reason are required");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/sessions/${session.id}/postpone`,
        method: "post",
        values: f,
      });
      toast.success("Session postponed — students notified, recorded in the audit log");
      setF({ newDate: "", newStartTime: "", newEndTime: "", reason: "" });
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to postpone");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Postpone session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Checked against the teacher&apos;s and the hall&apos;s other bookings. Refused if the
            session has already been settled.
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">New date</span>
            <Input type="date" value={f.newDate} onChange={(e) => set("newDate")(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Start</span>
              <Input
                type="time"
                value={f.newStartTime}
                onChange={(e) => set("newStartTime")(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">End</span>
              <Input
                type="time"
                value={f.newEndTime}
                onChange={(e) => set("newEndTime")(e.target.value)}
              />
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">
              Reason <span className="text-destructive">*</span>
            </span>
            <Textarea rows={2} value={f.reason} onChange={(e) => set("reason")(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Postpone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Attendance — correction
// ===========================================================================

type AttendanceRow = {
  id: string;
  studentName: string | null;
  courseTitle: string | null;
  status: string;
  sessionDate: string | null;
};

export function AttendanceTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatDate } = useFormatters();
  const req = useOversight<Paged<AttendanceRow> & { summary: { status: string; count: number }[] }>(
    centerId,
    "attendance",
    { enabled, query: { limit: "100" } },
  );
  const { mutateAsync } = useCustomMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.data ?? [];

  const correct = async (id: string, status: string) => {
    setBusyId(id);
    try {
      const res = (await mutateAsync({
        url: `admin/centers/${centerId}/attendance/${id}`,
        method: "patch",
        values: { status },
      })) as { data?: { settlementDivergence?: { diverged?: boolean } } };
      if (res?.data?.settlementDivergence?.diverged) {
        toast.warning(
          "Corrected — but this session was already settled, so the attendance no longer matches the settled headcount. The settlement was NOT recomputed; the divergence is in the audit log.",
        );
      } else {
        toast.success("Attendance corrected — recorded in the audit log");
      }
      req.refetch();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to correct attendance");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>Correcting a settled session does not move money</AlertTitle>
        <AlertDescription>
          The attendance record is the truth about a student, so it can always be corrected. But
          if the session has already settled, the settlement is <strong>not</strong> recomputed —
          that would re-rate a distributed lesson. The divergence from the settled headcount is
          written into the audit log instead of being discovered later.
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No attendance records.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Correct to</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.studentName ?? "—"}</TableCell>
                  <TableCell>{a.courseTitle ?? "—"}</TableCell>
                  <TableCell>
                    {a.sessionDate ? formatDate(a.sessionDate, { dateStyle: "medium" }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      {(["present", "absent", "excused"] as const).map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={a.status === s ? "default" : "outline"}
                          disabled={busyId === a.id || a.status === s}
                          onClick={() => correct(a.id, s)}
                        >
                          {busyId === a.id ? <Spinner /> : null}
                          {s}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Deletion requests — the 13th tab
// ===========================================================================

type DeletionRow = {
  id: string;
  reason: string;
  status: string;
  requestedAt: string;
  userId: { id: string; name: string; email: string | null; role: string } | string;
};

export function DeletionRequestsTab({
  centerId,
  enabled,
}: {
  centerId: string;
  enabled: boolean;
}) {
  const { formatDate } = useFormatters();
  const req = useAdminGet<DeletionRow[]>(`admin/centers/${centerId}/deletion-requests`, {
    enabled,
    query: { status: "pending" },
  });

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data ?? [];

  return (
    <div className="space-y-3">
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>Approving is a soft delete</AlertTitle>
        <AlertDescription>
          The account is marked deleted and its live session is cut on the next request, but the
          row survives — so payments, settlements and every ledger reference to that person stay
          resolvable. Nothing financial is erased.
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No pending deletion requests.</p>
      ) : (
        rows.map((r) => {
          const u = typeof r.userId === "string" ? null : r.userId;
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {u?.name ?? (typeof r.userId === "string" ? r.userId : "—")}
                  {u?.role ? (
                    <Badge variant="outline" className="ms-2">
                      {u.role}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {u?.email ? `${u.email} · ` : ""}
                  requested {formatDate(r.requestedAt, { dateStyle: "medium" })}
                </div>
                <div className="mt-1 text-xs">Reason: {r.reason}</div>
              </div>
              <div className="flex gap-2">
                <ControlAction
                  label="Approve"
                  title="Approve this deletion request?"
                  destructive
                  requireReason
                  confirmText="Approve deletion"
                  url={`admin/centers/${centerId}/deletion-requests/${r.id}/decide`}
                  values={{ decision: "approve" }}
                  onDone={req.refetch}
                  description={
                    <>
                      <p>
                        The account is soft-deleted and loses access on its very next request.
                      </p>
                      <p>
                        Financial history is <strong>preserved</strong> — nothing in the ledger is
                        removed or rewritten.
                      </p>
                    </>
                  }
                />
                <ControlAction
                  label="Reject"
                  title="Reject this deletion request?"
                  confirmText="Reject"
                  url={`admin/centers/${centerId}/deletion-requests/${r.id}/decide`}
                  values={{ decision: "reject" }}
                  onDone={req.refetch}
                  description={<p>The account keeps working. Your note is recorded.</p>}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ===========================================================================
// Broadcast (Overview) + center blacklist (Students)
// ===========================================================================

export function BroadcastCard({ centerId }: { centerId: string }) {
  const { mutateAsync } = useCustomMutation();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"center" | "course">("center");
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const courses = useAdminGet<Paged<{ id: string; title: string }>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );

  const send = async () => {
    if (!title.trim() || !body.trim() || (scope === "course" && !courseId)) {
      toast.error("Title, message and (for a course broadcast) a course are required");
      return;
    }
    setBusy(true);
    try {
      const res = (await mutateAsync({
        url: `admin/centers/${centerId}/broadcast`,
        method: "post",
        values: { scope, ...(scope === "course" ? { courseId } : {}), title, body },
      })) as { data?: { recipients?: number } };
      toast.success(`Sent to ${res?.data?.recipients ?? 0} recipient(s)`);
      setTitle("");
      setBody("");
      setOpen(false);
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Megaphone className="size-4" />
        Broadcast
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Broadcast a notification</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Goes to this center&apos;s enrolled students (and their parents for a course
              broadcast). It is sent as the platform, not as the center.
            </p>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Scope</span>
              <Select value={scope} onValueChange={(v) => setScope(v as "center" | "course")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="center">Whole center</SelectItem>
                  <SelectItem value="course">One course</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {scope === "course" ? (
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Course</span>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {(courses.data?.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Message</span>
              <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
          </div>
          <DialogFooter>
            <Button onClick={send} disabled={busy}>
              {busy ? <Spinner /> : null}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type BlacklistEntry = {
  id: string;
  targetId: string;
  reason: string;
  createdAt: string;
};

export function CenterBlacklistCard({ centerId }: { centerId: string }) {
  const { formatDate } = useFormatters();
  const req = useAdminGet<BlacklistEntry[]>(`admin/centers/${centerId}/blacklist`);
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Center blacklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          A center-level block withdraws that student&apos;s enrollments <em>at this center only</em>,
          through the reversible cascade journal — lifting it restores exactly those rows.
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is blocked at this center.</p>
        ) : (
          rows.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{b.targetId}</div>
                <div className="text-xs text-muted-foreground">
                  {b.reason} · {formatDate(b.createdAt, { dateStyle: "medium" })}
                </div>
              </div>
              <ControlAction
                label="Lift"
                title="Lift this block?"
                confirmText="Lift"
                requireReason
                method="delete"
                url={`admin/centers/${centerId}/blacklist/${b.id}`}
                values={{}}
                onDone={req.refetch}
                description={
                  <p>
                    The cascade journal is replayed: exactly the enrollments this block withdrew
                    are restored, and nothing else.
                  </p>
                }
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
