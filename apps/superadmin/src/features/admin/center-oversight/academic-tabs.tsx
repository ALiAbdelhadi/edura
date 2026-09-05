"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { Form } from "@repo/ui/components/form";
import {
  EntityDialog,
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { useAction } from "@/lib/api/use-action";
import { useAdminGet, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

const DAY_KEYS = [
  "collabSun",
  "collabMon",
  "collabTue",
  "collabWed",
  "collabThu",
  "collabFri",
  "collabSat",
] as const;

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

export function CoursesTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
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
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
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
                                {t.rich("ac_cancelCourseBody1", {
                                  count: c.activeEnrollments,
                                  b: (chunks) => <strong>{chunks}</strong>,
                                })}
                              </p>
                              <p>
                                {t.rich("ac_cancelCourseBody2", {
                                  b: (chunks) => <strong>{chunks}</strong>,
                                })}
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
  const t = useTranslations("oversight");
  return (
    <div className="flex flex-wrap gap-1">
      {DAY_KEYS.map((d, i) => (
        <Button
          key={d}
          type="button"
          size="sm"
          variant={value.includes(i) ? "default" : "outline"}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i])}
        >
          {t(d)}
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
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/courses`,
    successMsg: t("ac_courseCreated"),
    onSuccess: () => onDone(),
  });
  const rooms = useAdminGet<{ rooms: { id: string; name: string }[] }>(
    `admin/centers/${centerId}/rooms`,
    { enabled: open },
  );

  // Was one toast ("fill in the course fields") that named none of the six
  // boxes it checked. Required-ness is per field now, and a server 422 lands
  // on the input it names (M-7 / M-11 / M-22).
  const details: FieldSpec[] = [
    { name: "title", label: t("ac_title"), type: "text", required: true },
    { name: "subject", label: t("ac_subject"), type: "text", required: true },
    {
      name: "teacherId",
      label: t("ac_teacher"),
      type: "select",
      required: true,
      placeholder: t("ac_pickAffiliated"),
      options: teachers.map((x) => ({ value: x.teacherId, label: x.teacherName ?? x.teacherId })),
    },
    {
      name: "defaultRoomId",
      label: t("ac_hallOptional"),
      type: "select",
      placeholder: t("ac_noHall"),
      options: (rooms.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name })),
    },
    { name: "price", label: t("ac_priceEgp"), type: "number", min: 0 },
    { name: "maxStudents", label: t("ac_maxStudents"), type: "number", min: 1, required: true },
    { name: "startTime", label: t("ac_startTime"), type: "time", required: true },
    {
      name: "endTime",
      label: t("ac_endTime"),
      type: "time",
      required: true,
      validate: (v) =>
        String(v.endTime) <= String(v.startTime) ? t("collabBadTimes") : undefined,
    },
    { name: "startDate", label: t("ac_startDate"), type: "date", required: true },
    {
      name: "endDate",
      label: t("ac_endDate"),
      type: "date",
      required: true,
      validate: (v) =>
        String(v.endDate) < String(v.startDate) ? t("collabBadTimes") : undefined,
    },
  ];
  const schedule: FieldSpec[] = [
    {
      name: "days",
      label: t("ac_daysOfWeek"),
      type: "custom",
      required: true,
      render: (field) => (
        <DayPicker
          value={(field.value as number[] | undefined) ?? []}
          onChange={field.onChange}
        />
      ),
    },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields: [...details, ...schedule],
    open,
    initial: { maxStudents: 30, startTime: "16:00", endTime: "18:00", days: [] },
    onSubmit: async (v) => {
      const res = await run({
        values: {
          title: String(v.title).trim(),
          subject: String(v.subject).trim(),
          teacherId: v.teacherId,
          ...(v.defaultRoomId ? { defaultRoomId: v.defaultRoomId } : {}),
          price: Math.round(Number(v.price || 0) * 100),
          maxStudents: Number(v.maxStudents),
          schedulePattern: {
            daysOfWeek: v.days,
            startTime: v.startTime,
            endTime: v.endTime,
            startDate: v.startDate,
            endDate: v.endDate,
          },
        },
      });
      if (res.ok) onOpenChange(false);
      return res;
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("ac_newCourse")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-ink-2">{t("ac_courseCreateNote")}</p>
              <FormRootError message={rootError} />
              <FieldControls fields={details} form={form} className="grid gap-3 sm:grid-cols-2" />
              <FieldControls fields={schedule} form={form} className="grid gap-3" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}
                {t("ac_createGenerate")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
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
  const tt = useTranslations();
  const { run, busy } = useAction({
    method: "patch",
    successMsg: t("ac_courseUpdated"),
    onSuccess: () => onDone(),
  });

  const open = !!course;

  const general: FieldSpec[] = [
    { name: "title", label: t("ac_title"), type: "text", required: true },
    { name: "maxStudents", label: t("ac_maxStudents"), type: "number", min: 1 },
  ];
  const plans: FieldSpec[] = [
    { name: "perMonth", label: t("ac_monthlyPlan"), type: "number", min: 0 },
    { name: "perSession", label: t("ac_perSessionPlan"), type: "number", min: 0 },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields: [...general, ...plans],
    open,
    resetKey: course?.id,
    initial: {
      title: course?.title ?? "",
      maxStudents: course?.maxStudents ?? "",
      perMonth: course?.pricePerMonth != null ? course.pricePerMonth / 100 : "",
      perSession: course?.pricePerSession != null ? course.pricePerSession / 100 : "",
    },
    onSubmit: async (v) => {
      if (!course) return;
      const patch: Record<string, unknown> = {};
      const title = String(v.title).trim();
      if (title && title !== course.title) patch.title = title;
      const nextMax = v.maxStudents === "" ? null : Number(v.maxStudents);
      if (nextMax !== null && Number.isFinite(nextMax) && nextMax !== course.maxStudents) {
        patch.maxStudents = nextMax;
      }
      const pm = v.perMonth === "" ? null : Math.round(Number(v.perMonth) * 100);
      const ps = v.perSession === "" ? null : Math.round(Number(v.perSession) * 100);
      if (pm !== course.pricePerMonth) patch.pricePerMonth = pm;
      if (ps !== course.pricePerSession) patch.pricePerSession = ps;
      if (!Object.keys(patch).length) {
        toast.info(t("ac_nothingChanged"));
        return;
      }
      const res = await run({
        url: `admin/centers/${centerId}/courses/${course.id}`,
        values: patch,
      });
      if (res.ok) onClose();
      return res;
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("ac_editCourse")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-ink-2">{t("ac_editCourseNote")}</p>
              <FormRootError message={rootError} />
              <FieldControls fields={general} form={form} className="grid gap-3" />
              <FieldControls fields={plans} form={form} className="grid gap-3 sm:grid-cols-2" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}
                {tt("actions.save")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
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
  const { run, busy } = useAction({
    successMsg: t("ac_teacherReassigned"),
    onSuccess: () => onDone(),
  });

  return (
    <EntityDialog
      open={!!course}
      onOpenChange={(o) => !o && onClose()}
      title={t("ac_reassignTeacher")}
      note={t.rich("ac_reassignNote", { b: (chunks) => <strong>{chunks}</strong> })}
      busy={busy}
      fields={[
        {
          name: "teacherId",
          label: t("ac_newTeacher"),
          type: "select",
          required: true,
          placeholder: t("ac_pickTeacher"),
          options: teachers
            .filter((x) => x.teacherId !== course?.teacherId)
            .map((x) => ({ value: x.teacherId, label: x.teacherName ?? x.teacherId })),
        },
      ]}
      submitLabel={t("ac_reassign")}
      onSubmit={async (v) => {
        if (!course) return;
        const res = await run({
          url: `admin/centers/${centerId}/courses/${course.id}/reassign-teacher`,
          values: { teacherId: v.teacherId },
        });
        if (res.ok) onClose();
        return res;
      }}
    />
  );
}
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
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<EnrollmentRow[]>(`admin/centers/${centerId}/enrollments`, { enabled });
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
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
                        description={<p>{t("ac_unenrolBody")}</p>}
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
  const { run, busy } = useAction({
    url: `admin/centers/${centerId}/enrollments`,
    successMsg: t("ac_studentEnrolled"),
    onSuccess: () => onDone(),
  });
  const students = useAdminGet<{ items: { studentId: string; name?: string | null }[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled: open },
  );
  const courses = useAdminGet<Paged<CourseRow>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("ac_enrolStudent")}
      note={t("ac_enrolDialogNote")}
      busy={busy}
      fields={[
        {
          name: "studentId",
          label: t("ac_studentRoster"),
          type: "select",
          required: true,
          placeholder: t("ac_pickStudent"),
          options: (students.data?.items ?? []).map((s) => ({
            value: s.studentId,
            label: s.name ?? s.studentId,
          })),
        },
        {
          name: "courseId",
          label: t("ac_course"),
          type: "select",
          required: true,
          placeholder: t("ac_pickCourse"),
          options: (courses.data?.data ?? []).map((c) => ({ value: c.id, label: c.title })),
        },
      ]}
      submitLabel={t("ac_enrol")}
      onSubmit={async (v) => {
        const res = await run({
          values: { studentId: v.studentId, courseId: v.courseId },
        });
        if (res.ok) onOpenChange(false);
        return res;
      }}
    />
  );
}

type RequestRow = {
  id: string;
  studentName: string | null;
  courseTitle: string | null;
  submittedAt: string;
  expiresAt: string;
};

export function EnrollmentRequestsCard({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
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
        <p className="text-xs text-ink-2">{t("ac_requestsNote")}</p>
        {req.isLoading ? (
          <Spinner />
        ) : req.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={req.refetch}
            retryLabel={queryStrings.retry}
          />
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
                  description={<p>{t("ac_approveRequestBody")}</p>}
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

type RoomRow = {
  id: string;
  name: string;
  capacity: number | null;
  price: number | null;
  photos?: string[];
};

export function RoomsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<{ rooms: RoomRow[] }>(`admin/centers/${centerId}/rooms`, { enabled });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
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
                    <Badge variant="outline">{t("ac_seats", { count: room.capacity })}</Badge>
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
                    description={<p>{t("ac_deactivateHallBody")}</p>}
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
  const { run, busy } = useAction({ onSuccess: () => onDone() });

  return (
    <EntityDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={room ? t("ac_editHall") : t("ac_addHall")}
      busy={busy}
      // Re-seeded on every open, so switching halls no longer needs the
      // `seeded` sentinel this component kept to detect the swap itself.
      initial={{
        name: room?.name ?? "",
        capacity: room?.capacity ?? "",
        price: room?.price != null ? room.price / 100 : "",
      }}
      fields={[
        { name: "name", label: t("ac_name"), type: "text", required: true },
        { name: "capacity", label: t("ac_capacity"), type: "number" },
        { name: "price", label: t("ac_hallPriceEgp"), type: "number" },
      ]}
      onSubmit={async (v) => {
        const capacity = Number(v.capacity);
        const price = Number(v.price);
        const res = await run({
          url: room
            ? `admin/centers/${centerId}/rooms/${room.id}`
            : `admin/centers/${centerId}/rooms/create`,
          method: room ? "patch" : "post",
          values: {
            name: String(v.name).trim(),
            capacity: capacity > 0 ? capacity : null,
            price: price > 0 ? Math.round(price * 100) : null,
          },
          successMsg: room ? t("ac_hallUpdated") : t("ac_hallCreated"),
        });
        if (res.ok) onClose();
        return res;
      }}
    />
  );
}
