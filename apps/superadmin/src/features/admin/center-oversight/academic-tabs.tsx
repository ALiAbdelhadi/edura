"use client";

import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { Info, Lock, Pencil, Plus } from "lucide-react";
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
import { useAdminGet, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

// ---------------------------------------------------------------------------
// PHASE 2 — Academic tabs. Courses, enrollments and enrollment requests, run
// through the same kernel the center portal runs, scoped to this center.
// ---------------------------------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CourseRow = {
  id: string;
  title: string;
  status: string;
  teacherId: string;
  teacherName: string | null;
  roomName: string | null;
  activeEnrollments: number;
  maxStudents: number;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  pricingMethod: string | null;
};

// ===========================================================================
// Courses
// ===========================================================================

export function CoursesTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatEGP } = useFormatters();
  const req = useAdminGet<Paged<CourseRow>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled, query: { limit: "100" } },
  );
  const teachers = useAdminGet<{ affiliations: { teacherId: string; teacherName: string | null; status: string }[] }>(
    `admin/centers/${centerId}/affiliations`,
    { enabled },
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [reassigning, setReassigning] = useState<CourseRow | null>(null);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.data ?? [];
  const activeTeachers = (teachers.data?.affiliations ?? []).filter((t) => t.status === "active");

  return (
    <div className="space-y-3">
      <Alert>
        <Lock className="size-4" />
        <AlertTitle>The pricing snapshot is frozen and not editable</AlertTitle>
        <AlertDescription>
          A course&apos;s pricing method and revenue split were frozen when it was created, from
          the platform pricing configuration — settlement reads them, so changing one would
          re-rate a live course. They are shown here and edited nowhere. The hall cannot be
          swapped for the same reason: a different hall means a new class.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New course
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No courses at this center.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Hall</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="text-end">Monthly</TableHead>
                <TableHead>Pricing method</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>{c.teacherName ?? "—"}</TableCell>
                  <TableCell>{c.roomName ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "active" ? "secondary" : "outline"}>
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.activeEnrollments} / {c.maxStudents}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {c.pricePerMonth != null ? formatEGP(c.pricePerMonth) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.pricingMethod ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setReassigning(c)}>
                        Reassign teacher
                      </Button>
                      {c.status !== "cancelled" ? (
                        <ControlAction
                          label="Cancel course"
                          title="Cancel this course?"
                          destructive
                          requireReason
                          confirmText="Cancel course"
                          url={`admin/centers/${centerId}/courses/${c.id}/cancel`}
                          values={{}}
                          onDone={req.refetch}
                          description={
                            <>
                              <p>
                                Future sessions are cancelled and{" "}
                                <strong>{c.activeEnrollments}</strong> enrolled student(s) are
                                notified with your reason.
                              </p>
                              <p>
                                This <strong>refunds nothing</strong> and cancels no
                                subscription. Sessions that already settled are untouched — use
                                the refund flow for money.
                              </p>
                            </>
                          }
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CourseCreateDialog
        open={creating}
        onOpenChange={setCreating}
        centerId={centerId}
        teachers={activeTeachers}
        onDone={req.refetch}
      />
      <CourseEditDialog
        course={editing}
        centerId={centerId}
        onClose={() => setEditing(null)}
        onDone={req.refetch}
      />
      <ReassignDialog
        course={reassigning}
        centerId={centerId}
        teachers={activeTeachers}
        onClose={() => setReassigning(null)}
        onDone={req.refetch}
      />
    </div>
  );
}

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAYS.map((d, i) => (
        <Button
          key={d}
          type="button"
          size="sm"
          variant={value.includes(i) ? "default" : "outline"}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i])}
        >
          {d}
        </Button>
      ))}
    </div>
  );
}

function CourseCreateDialog({
  open,
  onOpenChange,
  centerId,
  teachers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  centerId: string;
  teachers: { teacherId: string; teacherName: string | null }[];
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const rooms = useAdminGet<{ rooms: { id: string; name: string }[] }>(
    `admin/centers/${centerId}/rooms`,
    { enabled: open },
  );
  const [f, setF] = useState({
    title: "",
    subject: "",
    teacherId: "",
    defaultRoomId: "",
    price: "",
    maxStudents: "30",
    startTime: "16:00",
    endTime: "18:00",
    startDate: "",
    endDate: "",
  });
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!f.title || !f.subject || !f.teacherId || !days.length || !f.startDate || !f.endDate) {
      toast.error("Title, subject, teacher, days and dates are required");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/courses`,
        method: "post",
        values: {
          title: f.title.trim(),
          subject: f.subject.trim(),
          teacherId: f.teacherId,
          ...(f.defaultRoomId ? { defaultRoomId: f.defaultRoomId } : {}),
          price: Math.round(Number(f.price || 0) * 100),
          maxStudents: Number(f.maxStudents),
          schedulePattern: {
            daysOfWeek: days,
            startTime: f.startTime,
            endTime: f.endTime,
            startDate: f.startDate,
            endDate: f.endDate,
          },
        },
      });
      toast.success("Course created — schedule generated, recorded in the audit log");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to create the course");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The teacher must already have an active affiliation with this center. Picking a hall
            freezes that hall&apos;s pricing method and rate onto the course — permanently.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Title">
              <Input value={f.title} onChange={(e) => set("title")(e.target.value)} />
            </Labeled>
            <Labeled label="Subject">
              <Input value={f.subject} onChange={(e) => set("subject")(e.target.value)} />
            </Labeled>
            <Labeled label="Teacher">
              <Select value={f.teacherId} onValueChange={set("teacherId")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an affiliated teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.teacherId} value={t.teacherId}>
                      {t.teacherName ?? t.teacherId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Hall (optional — frozen once set)">
              <Select value={f.defaultRoomId} onValueChange={set("defaultRoomId")}>
                <SelectTrigger>
                  <SelectValue placeholder="No hall" />
                </SelectTrigger>
                <SelectContent>
                  {(rooms.data?.rooms ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Price (EGP)">
              <Input type="number" value={f.price} onChange={(e) => set("price")(e.target.value)} />
            </Labeled>
            <Labeled label="Max students">
              <Input
                type="number"
                value={f.maxStudents}
                onChange={(e) => set("maxStudents")(e.target.value)}
              />
            </Labeled>
            <Labeled label="Start time">
              <Input type="time" value={f.startTime} onChange={(e) => set("startTime")(e.target.value)} />
            </Labeled>
            <Labeled label="End time">
              <Input type="time" value={f.endTime} onChange={(e) => set("endTime")(e.target.value)} />
            </Labeled>
            <Labeled label="Start date">
              <Input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} />
            </Labeled>
            <Labeled label="End date">
              <Input type="date" value={f.endDate} onChange={(e) => set("endDate")(e.target.value)} />
            </Labeled>
          </div>
          <Labeled label="Days of week">
            <DayPicker value={days} onChange={setDays} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Create &amp; generate schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseEditDialog({
  course,
  centerId,
  onClose,
  onDone,
}: {
  course: CourseRow | null;
  centerId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const [title, setTitle] = useState("");
  const [maxStudents, setMaxStudents] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [perSession, setPerSession] = useState("");
  const [busy, setBusy] = useState(false);

  const open = !!course;
  if (open && title === "" && course) {
    // Seed once when the dialog opens.
    setTitle(course.title);
    setMaxStudents(String(course.maxStudents));
    setPerMonth(course.pricePerMonth != null ? String(course.pricePerMonth / 100) : "");
    setPerSession(course.pricePerSession != null ? String(course.pricePerSession / 100) : "");
  }

  const close = () => {
    setTitle("");
    onClose();
  };

  const save = async () => {
    if (!course) return;
    const patch: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== course.title) patch.title = title.trim();
    if (Number(maxStudents) !== course.maxStudents) patch.maxStudents = Number(maxStudents);
    const pm = perMonth.trim() === "" ? null : Math.round(Number(perMonth) * 100);
    const ps = perSession.trim() === "" ? null : Math.round(Number(perSession) * 100);
    if (pm !== course.pricePerMonth) patch.pricePerMonth = pm;
    if (ps !== course.pricePerSession) patch.pricePerSession = ps;
    if (!Object.keys(patch).length) {
      toast.info("Nothing changed");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/courses/${course.id}`,
        method: "patch",
        values: patch,
      });
      toast.success("Course updated — recorded in the audit log");
      close();
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to update the course");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit course</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Plan prices set what a NEW subscription costs. Existing subscriptions keep the price
            they were bought at, and the course&apos;s frozen revenue split never changes.
          </p>
          <Labeled label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Labeled>
          <Labeled label="Max students">
            <Input
              type="number"
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
            />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Monthly plan (EGP, empty = disabled)">
              <Input type="number" value={perMonth} onChange={(e) => setPerMonth(e.target.value)} />
            </Labeled>
            <Labeled label="Per-session plan (EGP, empty = disabled)">
              <Input
                type="number"
                value={perSession}
                onChange={(e) => setPerSession(e.target.value)}
              />
            </Labeled>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  course,
  centerId,
  teachers,
  onClose,
  onDone,
}: {
  course: CourseRow | null;
  centerId: string;
  teachers: { teacherId: string; teacherName: string | null }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!course || !teacherId) {
      toast.error("Pick a teacher");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/courses/${course.id}/reassign-teacher`,
        method: "post",
        values: { teacherId },
      });
      toast.success("Teacher reassigned — recorded in the audit log");
      setTeacherId("");
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to reassign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!course} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign teacher</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Only <strong>future</strong> sessions move to the new teacher. Past sessions keep
            theirs — they record who actually taught, and some may already have been settled to
            that person.
          </p>
          <Labeled label="New teacher (must be affiliated with this center)">
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a teacher" />
              </SelectTrigger>
              <SelectContent>
                {teachers
                  .filter((t) => t.teacherId !== course?.teacherId)
                  .map((t) => (
                    <SelectItem key={t.teacherId} value={t.teacherId}>
                      {t.teacherName ?? t.teacherId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="block font-medium">{label}</span>
      {children}
    </label>
  );
}

// ===========================================================================
// Enrollments
// ===========================================================================

type EnrollmentRow = {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  status: string;
  enrolledAt: string;
  unenrolledAt: string | null;
};

export function EnrollmentsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatDate } = useFormatters();
  const req = useAdminGet<EnrollmentRow[]>(`admin/centers/${centerId}/enrollments`, { enabled });
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Enrolling creates the roster link only — it does <strong>not</strong> create a
          subscription, so it does not hand out paid coverage. Unenrolling refunds nothing.
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Enrol a student
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No enrollments.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.studentName || e.studentId}</TableCell>
                  <TableCell>{e.courseName}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "active" ? "secondary" : "outline"}>
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(e.enrolledAt, { dateStyle: "medium" })}</TableCell>
                  <TableCell className="text-end">
                    {e.status === "active" ? (
                      <ControlAction
                        label="Unenrol"
                        title="Unenrol this student?"
                        destructive
                        confirmText="Unenrol"
                        method="delete"
                        url={`admin/centers/${centerId}/enrollments/${e.id}`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            The record survives with an unenrolled date, so the history stays
                            readable. Nothing is refunded.
                          </p>
                        }
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EnrolDialog
        open={adding}
        onOpenChange={setAdding}
        centerId={centerId}
        onDone={req.refetch}
      />
    </div>
  );
}

function EnrolDialog({
  open,
  onOpenChange,
  centerId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  centerId: string;
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const students = useAdminGet<{ items: { studentId: string; name?: string | null }[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled: open },
  );
  const courses = useAdminGet<Paged<CourseRow>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!studentId || !courseId) {
      toast.error("Pick a student and a course");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/enrollments`,
        method: "post",
        values: { studentId, courseId },
      });
      toast.success("Student enrolled — recorded in the audit log");
      setStudentId("");
      setCourseId("");
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to enrol");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Refused if the student is blacklisted at platform, center or teacher level, or if the
            course is not this center&apos;s.
          </p>
          <Labeled label="Student (from this center's roster)">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a student" />
              </SelectTrigger>
              <SelectContent>
                {(students.data?.items ?? []).map((s) => (
                  <SelectItem key={s.studentId} value={s.studentId}>
                    {s.name ?? s.studentId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Course">
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                {(courses.data?.data ?? [])
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} ({c.activeEnrollments}/{c.maxStudents})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Enrol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Enrollment requests (rendered inside the Pending tab)
// ===========================================================================

type RequestRow = {
  id: string;
  studentName: string | null;
  courseTitle: string | null;
  status: string;
  submittedAt: string;
  expiresAt: string;
};

export function EnrollmentRequestsCard({ centerId }: { centerId: string }) {
  const { formatDate } = useFormatters();
  const req = useAdminGet<RequestRow[]>(`admin/centers/${centerId}/enrollment-requests`, {
    query: { status: "pending" },
  });
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enrollment requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Approving creates the enrollment and notifies the student. Refused when the course is
          full or the request has expired — the same rules the center is held to.
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing pending.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="text-sm">
                <div className="font-medium">
                  {r.studentName ?? "—"} → {r.courseTitle ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  submitted {formatDate(r.submittedAt, { dateStyle: "medium" })} · expires{" "}
                  {formatDate(r.expiresAt, { dateStyle: "medium" })}
                </div>
              </div>
              <div className="flex gap-2">
                <ControlAction
                  label="Approve"
                  title="Approve this enrollment request?"
                  confirmText="Approve"
                  url={`admin/centers/${centerId}/enrollment-requests/${r.id}/decide`}
                  values={{ decision: "approve" }}
                  onDone={req.refetch}
                  description={
                    <p>
                      Creates the enrollment and notifies the student. No subscription is created
                      — this grants a seat, not paid coverage.
                    </p>
                  }
                />
                <ControlAction
                  label="Decline"
                  title="Decline this enrollment request?"
                  destructive
                  requireReason
                  confirmText="Decline"
                  url={`admin/centers/${centerId}/enrollment-requests/${r.id}/decide`}
                  values={{ decision: "decline" }}
                  onDone={req.refetch}
                  description={<p>The student is notified with your reason.</p>}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Rooms — wire the existing API to buttons (Phase 2 item)
// ===========================================================================

type RoomRow = {
  id: string;
  name: string;
  capacity: number | null;
  price: number | null;
  photos?: string[];
};

export function RoomsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const { formatEGP } = useFormatters();
  const req = useAdminGet<{ rooms: RoomRow[] }>(`admin/centers/${centerId}/rooms`, { enabled });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rooms = req.data?.rooms ?? [];

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Hall price is not a revenue share</AlertTitle>
        <AlertDescription>
          The price here is what the center shows teachers when booking. The revenue split and
          the per-student rate are platform pricing configuration and live on their own screen.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add hall
        </Button>
      </div>

      {rooms.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No active halls.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{room.name}</span>
                  {room.capacity != null ? (
                    <Badge variant="outline">{room.capacity} seats</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Hall price</span>
                  <span className="tabular-nums">
                    {room.price != null ? formatEGP(room.price) : "—"}
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <ControlAction
                    label="Deactivate"
                    title="Deactivate this hall?"
                    destructive
                    confirmText="Deactivate"
                    url={`admin/centers/${centerId}/rooms/${room.id}/status`}
                    values={{ isActive: false }}
                    onDone={req.refetch}
                    description={
                      <p>
                        Soft — never a delete, so its sessions and settlement records keep
                        resolving.
                      </p>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoomDialog
        centerId={centerId}
        room={editing}
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={req.refetch}
      />
    </div>
  );
}

function RoomDialog({
  centerId,
  room,
  open,
  onClose,
  onDone,
}: {
  centerId: string;
  room: RoomRow | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { mutateAsync } = useCustomMutation();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);

  const key = room?.id ?? "new";
  if (open && seeded !== key) {
    setSeeded(key);
    setName(room?.name ?? "");
    setCapacity(room?.capacity != null ? String(room.capacity) : "");
    setPrice(room?.price != null ? String(room.price / 100) : "");
  }

  const close = () => {
    setSeeded(null);
    onClose();
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const values: Record<string, unknown> = {
      name: name.trim(),
      capacity: capacity.trim() === "" ? null : Number(capacity),
      price: price.trim() === "" ? null : Math.round(Number(price) * 100),
    };
    setBusy(true);
    try {
      if (room) {
        await mutateAsync({
          url: `admin/centers/${centerId}/rooms/${room.id}`,
          method: "patch",
          values,
        });
      } else {
        await mutateAsync({
          url: `admin/centers/${centerId}/rooms/create`,
          method: "post",
          values,
        });
      }
      toast.success(room ? "Hall updated" : "Hall created");
      close();
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to save the hall");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{room ? "Edit hall" : "Add hall"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Labeled label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Labeled>
          <Labeled label="Capacity">
            <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Labeled>
          <Labeled label="Hall price (EGP)">
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Labeled>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
