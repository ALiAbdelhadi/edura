"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCustomMutation } from "@refinedev/core";
import { BookOpen, ClipboardList, DoorOpen, Info, Lock, Pencil, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { EmptyState } from "@repo/ui/components/empty-state";
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
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
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
        <AlertTitle>{t("ac_frozenTitle")}</AlertTitle>
        <AlertDescription>
          {t("ac_frozenBody")}
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />{t("ac_newCourse")}</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={BookOpen} title={t("ac_noCourses")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ac_course")}</TableHead>
                <TableHead>{t("ac_teacher")}</TableHead>
                <TableHead>{t("ac_hall")}</TableHead>
                <TableHead>{t("ac_status")}</TableHead>
                <TableHead>{t("ac_enrolled")}</TableHead>
                <TableHead className="text-end">{t("ac_monthly")}</TableHead>
                <TableHead>{t("ac_pricingMethod")}</TableHead>
                <TableHead className="text-end">{t("ac_actions")}</TableHead>
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
                    {c.pricePerMonth != null ? <Num.Money piasters={c.pricePerMonth} locale={locale} sign={false} /> : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.pricingMethod ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        <Pencil className="size-4" />{t("ac_edit")}</Button>
                      <Button size="sm" variant="outline" onClick={() => setReassigning(c)}>{t("ac_reassignTeacher")}</Button>
                      {c.status !== "cancelled" ? (
                        <ControlAction
                          label={t("ac_cancelCourse")}
                          title={t("ac_cancelCourseQ")}
                          destructive
                          requireReason
                          confirmText={t("ac_cancelCourse")}
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
  const t = useTranslations("oversight");
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
      toast.error(t("ac_needCourseFields"));
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
      toast.success(t("ac_courseCreated"));
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
          <DialogTitle>{t("ac_newCourse")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            The teacher must already have an active affiliation with this center. Picking a hall
            freezes that hall&apos;s pricing method and rate onto the course — permanently.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label={t("ac_title")}>
              <Input value={f.title} onChange={(e) => set("title")(e.target.value)} />
            </Labeled>
            <Labeled label={t("ac_subject")}>
              <Input value={f.subject} onChange={(e) => set("subject")(e.target.value)} />
            </Labeled>
            <Labeled label={t("ac_teacher")}>
              <Select value={f.teacherId} onValueChange={set("teacherId")}>
                <SelectTrigger>
                  <SelectValue placeholder={t("ac_pickAffiliated")} />
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
            <Labeled label={t("ac_hallOptional")}>
              <Select value={f.defaultRoomId} onValueChange={set("defaultRoomId")}>
                <SelectTrigger>
                  <SelectValue placeholder={t("ac_noHall")} />
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
            <Labeled label={t("ac_priceEgp")}>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={f.price}
                onChange={(e) => set("price")(e.target.value)}
              />
            </Labeled>
            <Labeled label={t("ac_maxStudents")}>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={f.maxStudents}
                onChange={(e) => set("maxStudents")(e.target.value)}
              />
            </Labeled>
            <Labeled label={t("ac_startTime")}>
              <Input type="time" value={f.startTime} onChange={(e) => set("startTime")(e.target.value)} />
            </Labeled>
            <Labeled label={t("ac_endTime")}>
              <Input type="time" value={f.endTime} onChange={(e) => set("endTime")(e.target.value)} />
            </Labeled>
            <Labeled label={t("ac_startDate")}>
              <Input type="date" value={f.startDate} onChange={(e) => set("startDate")(e.target.value)} />
            </Labeled>
            <Labeled label={t("ac_endDate")}>
              <Input type="date" value={f.endDate} onChange={(e) => set("endDate")(e.target.value)} />
            </Labeled>
          </div>
          <Labeled label={t("ac_daysOfWeek")}>
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
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  const [title, setTitle] = useState("");
  const [maxStudents, setMaxStudents] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [perSession, setPerSession] = useState("");
  const [busy, setBusy] = useState(false);

  const open = !!course;

  /* SEEDED ON THE COURSE, NOT ON THE TITLE BEING EMPTY. The old condition was
     `title === ""`, which is a state the OPERATOR can reach: select the title,
     delete it to retype it, and the component re-seeded on the very next
     render — restoring the old title and throwing away any edit already made
     to max students or either plan price. Keying on the course id seeds once
     per opening and never fights the person typing. */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (course && seededFor !== course.id) {
    setSeededFor(course.id);
    setTitle(course.title);
    setMaxStudents(String(course.maxStudents));
    setPerMonth(course.pricePerMonth != null ? String(course.pricePerMonth / 100) : "");
    setPerSession(course.pricePerSession != null ? String(course.pricePerSession / 100) : "");
  }

  const close = () => {
    setSeededFor(null);
    setTitle("");
    onClose();
  };

  const save = async () => {
    if (!course) return;
    const patch: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== course.title) patch.title = title.trim();
    /* An EMPTY box is "I have not typed a number", not "zero". `Number("")` is
       0, so clearing the field used to patch the course down to a capacity of
       zero. A blank leaves max students alone. */
    const nextMax = maxStudents.trim() === "" ? null : Number(maxStudents);
    if (nextMax !== null && Number.isFinite(nextMax) && nextMax !== course.maxStudents) {
      patch.maxStudents = nextMax;
    }
    const pm = perMonth.trim() === "" ? null : Math.round(Number(perMonth) * 100);
    const ps = perSession.trim() === "" ? null : Math.round(Number(perSession) * 100);
    if (pm !== course.pricePerMonth) patch.pricePerMonth = pm;
    if (ps !== course.pricePerSession) patch.pricePerSession = ps;
    if (!Object.keys(patch).length) {
      toast.info(t("ac_nothingChanged"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/courses/${course.id}`,
        method: "patch",
        values: patch,
      });
      toast.success(t("ac_courseUpdated"));
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
          <DialogTitle>{t("ac_editCourse")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            Plan prices set what a NEW subscription costs. Existing subscriptions keep the price
            they were bought at, and the course&apos;s frozen revenue split never changes.
          </p>
          <Labeled label={t("ac_title")}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Labeled>
          <Labeled label={t("ac_maxStudents")}>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={maxStudents}
              onChange={(e) => setMaxStudents(e.target.value)}
            />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label={t("ac_monthlyPlan")}>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={perMonth}
                onChange={(e) => setPerMonth(e.target.value)}
              />
            </Labeled>
            <Labeled label={t("ac_perSessionPlan")}>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
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
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!course || !teacherId) {
      toast.error(t("ac_needTeacher"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/courses/${course.id}/reassign-teacher`,
        method: "post",
        values: { teacherId },
      });
      toast.success(t("ac_teacherReassigned"));
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
          <DialogTitle>{t("ac_reassignTeacher")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            Only <strong>future</strong> sessions move to the new teacher. Past sessions keep
            theirs — they record who actually taught, and some may already have been settled to
            that person.
          </p>
          <Labeled label={t("ac_newTeacher")}>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger>
                <SelectValue placeholder={t("ac_pickTeacher")} />
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const req = useAdminGet<EnrollmentRow[]>(`admin/centers/${centerId}/enrollments`, { enabled });
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-2">
          {t("ac_enrolNote1")} <strong>{t("ac_enrolNote2")}</strong> {t("ac_enrolNote3")}
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />{t("ac_enrolStudent")}</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("ac_noEnrollments")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ac_student")}</TableHead>
                <TableHead>{t("ac_course")}</TableHead>
                <TableHead>{t("ac_status")}</TableHead>
                <TableHead>{t("ac_enrolled")}</TableHead>
                <TableHead className="text-end">{t("ac_actions")}</TableHead>
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
                  <TableCell><Num.Date value={e.enrolledAt} locale={locale} options={{ dateStyle: "medium" }} className="text-[11px] text-ink-3" /></TableCell>
                  <TableCell className="text-end">
                    {e.status === "active" ? (
                      <ControlAction
                        label={t("ac_unenrol")}
                        title={t("ac_unenrolQ")}
                        destructive
                        confirmText={t("ac_unenrol")}
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
  const t = useTranslations("oversight");
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
      toast.error(t("ac_needStudentCourse"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/enrollments`,
        method: "post",
        values: { studentId, courseId },
      });
      toast.success(t("ac_studentEnrolled"));
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
          <DialogTitle>{t("ac_enrolStudent")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            Refused if the student is blacklisted at platform, center or teacher level, or if the
            course is not this center&apos;s.
          </p>
          <Labeled label={t("ac_studentRoster")}>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder={t("ac_pickStudent")} />
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
          <Labeled label={t("ac_course")}>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder={t("ac_pickCourse")} />
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const req = useAdminGet<RequestRow[]>(`admin/centers/${centerId}/enrollment-requests`, {
    query: { status: "pending" },
  });
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("ac_enrollmentRequests")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-ink-2">
          Approving creates the enrollment and notifies the student. Refused when the course is
          full or the request has expired — the same rules the center is held to.
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-2">{t("ac_nothingPending")}</p>
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
                <div className="text-xs text-ink-2">
                  {t("ac_submitted")}{" "}
                  <Num.Date value={r.submittedAt} locale={locale} options={{ dateStyle: "medium" }} /> ·{" "}
                  {t("ac_expires")}{" "}
                  <Num.Date value={r.expiresAt} locale={locale} options={{ dateStyle: "medium" }} />
                </div>
              </div>
              <div className="flex gap-2">
                <ControlAction
                  label={t("ac_approve")}
                  title={t("ac_approveQ")}
                  confirmText={t("ac_approve")}
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
                  label={t("ac_decline")}
                  title={t("ac_declineQ")}
                  destructive
                  requireReason
                  confirmText={t("ac_decline")}
                  url={`admin/centers/${centerId}/enrollment-requests/${r.id}/decide`}
                  values={{ decision: "decline" }}
                  onDone={req.refetch}
                  description={<p>{t("ac_studentNotified")}</p>}
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
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
        <AlertTitle>{t("ac_hallPriceTitle")}</AlertTitle>
        <AlertDescription>
          {t("ac_hallPriceBody")}
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />{t("ac_addHall")}</Button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title={t("ac_noHalls")} />
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
                  <span className="text-ink-2">{t("ac_hallPrice")}</span>
                  <span className="tabular-nums">
                    {room.price != null ? <Num.Money piasters={room.price} locale={locale} sign={false} /> : "—"}
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(room)}>
                    <Pencil className="size-4" />{t("ac_edit")}</Button>
                  <ControlAction
                    label={t("ac_deactivate")}
                    title={t("ac_deactivateHallQ")}
                    destructive
                    confirmText={t("ac_deactivate")}
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
  const t = useTranslations("oversight");
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
      toast.error(t("ac_needName"));
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
          <Labeled label={t("ac_name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Labeled>
          <Labeled label={t("ac_capacity")}>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Labeled>
          <Labeled label={t("ac_hallPriceEgp")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
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
