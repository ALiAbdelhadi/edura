"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CalendarDays, Megaphone, ShieldAlert, Trash2, UserCheck } from "lucide-react";
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
import { asKey } from "@/lib/i18n/keys";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import {
  EntityDialog,
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { Form } from "@repo/ui/components/form";
import { useAction } from "@/lib/api/use-action";
import { useAdminGet, useOversight, type Paged } from "./use-oversight";
import { ControlAction } from "./control-actions";

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
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useOversight<Paged<SessionRow>>(centerId, "sessions", {
    enabled,
    query: { limit: "100" },
  });
  const [completing, setCompleting] = useState<SessionRow | null>(null);
  const [postponing, setPostponing] = useState<SessionRow | null>(null);
  const [marking, setMarking] = useState<SessionRow | null>(null);

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

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>{t("op_settledLocked")}</AlertTitle>
        <AlertDescription>
          {t("op_settledLockedBody")}
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("op_noSessions")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("op_course")}</TableHead>
                <TableHead>{t("op_teacher")}</TableHead>
                <TableHead>{t("op_date")}</TableHead>
                <TableHead>{t("op_time")}</TableHead>
                <TableHead>{t("op_status")}</TableHead>
                <TableHead>{t("op_settled")}</TableHead>
                <TableHead className="text-end">{t("op_actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const settled = !!s.distributedAt;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.courseTitle ?? "—"}</TableCell>
                    <TableCell>{s.teacherName ?? "—"}</TableCell>
                    <TableCell><Num.Date value={s.date} locale={locale} options={{ dateStyle: "medium" }} className="text-[11px] text-ink-3" /></TableCell>
                    <TableCell>
                      <Num.ClockRange start={s.startTime} end={s.endTime} locale={locale} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {settled ? (
                        <Badge variant="outline">
                          <Num.Date value={s.distributedAt as string} locale={locale} options={{ dateStyle: "short" }} />
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {settled ? (
                        <span className="text-xs text-ink-2">{t("op_lockedSettled")}</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" onClick={() => setCompleting(s)}>
                            {t("op_completeSettle")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setMarking(s)}>
                            {t("op_markAttendance")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPostponing(s)}>{t("op_postpone")}</Button>
                          <ControlAction
                            label={t("op_cancel")}
                            title={t("op_cancelSessionQ")}
                            destructive
                            requireReason
                            confirmText={t("op_cancelSession")}
                            url={`admin/centers/${centerId}/sessions/${s.id}/cancel`}
                            values={{}}
                            onDone={req.refetch}
                            description={<p>{t("op_cancelSessionBody")}</p>}
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

      <AttendanceSheetDialog
        centerId={centerId}
        session={marking}
        onClose={() => setMarking(null)}
        onDone={() => {
          setMarking(null);
          req.refetch();
        }}
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const queryStrings = useQueryStrings();
  const { run: complete, busy } = useAction({
    successMsg: t("op_sessionCompleted"),
    onSuccess: () => onDone(),
  });
  const preview = useAdminGet<Preview>(
    `admin/centers/${centerId}/sessions/${session?.id}/settlement-preview`,
    { enabled: !!session },
  );

  const p = preview.data;
  const bp = (v: number | null | undefined) => (v == null ? "—" : `${(v / 100).toFixed(2)}%`);

  const run = async () => {
    if (!session) return;
    const res = await complete({
      url: `admin/centers/${centerId}/sessions/${session.id}/complete`,
      values: {},
    });
    if (res.ok) onClose();
  };

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber" />{t("op_completeQ")}</DialogTitle>
        </DialogHeader>

        {preview.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={() => preview.refetch()}
            retryLabel={queryStrings.retry}
          />
        ) : preview.isLoading || !p ? (
          <PageSpinner />
        ) : (
          <div className="space-y-3 text-sm">
            <Alert>
              <AlertTitle>{t("op_writesToLedger")}</AlertTitle>
              <AlertDescription>
                {t("op_writesToLedgerBody")}
              </AlertDescription>
            </Alert>

            <div className="rounded-md border p-3">
              <p className="font-medium">{p.courseTitle}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <dt className="text-ink-2">{t("op_studentsPresent")}</dt>
                <dd className="text-end"><Num.Figure value={p.presentCount} locale={locale} className="font-semibold" /></dd>
                <dt className="text-ink-2">{t("op_perSessionPrice")}</dt>
                <dd className="text-end"><Num.Money piasters={p.perSessionPrice} locale={locale} sign={false} /></dd>
                <dt className="text-ink-2">{t("op_pricingMethod")}</dt>
                <dd className="text-end">{p.frozenPricing?.pricingMethod ?? t("op_commissionModel")}</dd>
                <dt className="text-ink-2">{t("op_splitLabel")}</dt>
                <dd className="text-end">
                  <Num>
                    {bp(p.frozenPricing?.splitPlatformBp)} / {bp(p.frozenPricing?.splitTeacherBp)} /{" "}
                    {bp(p.frozenPricing?.splitCenterBp)}
                  </Num>
                </dd>
              </dl>
            </div>

            {p.presentCount === 0 ? (
              <p className="text-xs text-red">{t("op_nonePresent")}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("op_cancel")}</Button>
          <Button
            onClick={run}
            disabled={busy || preview.isLoading || preview.isError || !p || p.alreadySettled}
          >
            {busy ? <Spinner /> : null}
            {t("op_completeDistribute")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused",
  "counter_only",
  "removed",
] as const;

type AttendanceEntry = {
  studentId: string;
  studentName?: string | null;
  status: string;
};

/**
 * The register for one session, edited as a sheet and saved in one PUT.
 * Row-by-row saving was never the shape of this job: a teacher calls a class
 * roll in one pass, and one request is also one audit entry.
 */
function AttendanceSheetDialog({
  centerId,
  session,
  onClose,
  onDone,
}: {
  centerId: string;
  session: { id: string; courseTitle: string | null } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const req = useAdminGet<{ entries?: AttendanceEntry[] } | AttendanceEntry[]>(
    `admin/centers/${centerId}/sessions/${session?.id ?? ""}/attendance`,
    { enabled: !!session },
  );
  const { run, busy } = useAction({ method: "put" });

  const rows: AttendanceEntry[] = (() => {
    const d = req.data as unknown;
    if (Array.isArray(d)) return d as AttendanceEntry[];
    const e = (d as { entries?: AttendanceEntry[] } | undefined)?.entries;
    return Array.isArray(e) ? e : [];
  })();

  // One select per student, keyed by id, so a server 422 can name the row it
  // rejected and the sheet re-seeds when the register arrives.
  const statusOptions = ATTENDANCE_STATUSES.map((x) => ({
    value: x,
    label: tt(asKey(`attendanceStatus.${x}`)),
  }));
  const fields: FieldSpec[] = rows.map((r) => ({
    name: r.studentId,
    label: r.studentName ?? r.studentId.slice(0, 8),
    type: "select",
    options: statusOptions,
  }));

  const { form, submit, rootError } = useFieldForm({
    fields,
    open: !!session,
    resetKey: `${session?.id ?? ""}:${rows.map((r) => r.studentId).join(",")}`,
    initial: Object.fromEntries(rows.map((r) => [r.studentId, r.status ?? "absent"])),
    onSubmit: async (v) => {
      if (!session || rows.length === 0) return;
      const res = await run({
        url: `admin/centers/${centerId}/sessions/${session.id}/attendance`,
        values: {
          entries: rows.map((r) => ({ studentId: r.studentId, status: v[r.studentId] })),
        },
        successMsg: t("op_attendanceSaved"),
      });
      if (res.ok) onDone();
      return res;
    },
  });

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle>{t("op_markAttendance")}</DialogTitle>
            </DialogHeader>

            <div className="py-2">
              {req.isLoading ? (
                <PageSpinner />
              ) : req.isError ? (
                <LoadError
                  message={queryStrings.loadFailed}
                  onRetry={req.refetch}
                  retryLabel={queryStrings.retry}
                />
              ) : rows.length === 0 ? (
                <p className="text-[13px] text-ink-3">{t("op_noAttendees")}</p>
              ) : (
                <>
                  <FormRootError message={rootError} />
                  <FieldControls
                    fields={fields}
                    form={form}
                    className="grid max-h-[50vh] gap-3 overflow-y-auto py-1 sm:grid-cols-2"
                  />
                </>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                {tt("actions.cancel")}
              </Button>
              <Button type="submit" disabled={busy || rows.length === 0}>
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
  const t = useTranslations("oversight");
  const { run, busy } = useAction({
    successMsg: t("op_sessionPostponed"),
    onSuccess: () => onDone(),
  });

  // The four boxes were checked by one toast that named none of them.
  const fields: FieldSpec[] = [
    { name: "newDate", label: t("op_newDate"), type: "date", required: true },
    { name: "newStartTime", label: t("op_start"), type: "time", required: true },
    { name: "newEndTime", label: t("op_end"), type: "time", required: true },
    { name: "reason", label: t("op_reason"), type: "textarea", rows: 2, required: true },
  ];

  return (
    <EntityDialog
      open={!!session}
      onOpenChange={(o) => !o && onClose()}
      title={t("op_postponeSession")}
      note={t("op_postponeNote")}
      busy={busy}
      fields={fields}
      submitLabel={t("op_postpone")}
      onSubmit={async (v) => {
        if (!session) return;
        const res = await run({
          url: `admin/centers/${centerId}/sessions/${session.id}/postpone`,
          values: v,
        });
        if (res.ok) onClose();
        return res;
      }}
    />
  );
}

type AttendanceRow = {
  id: string;
  studentName: string | null;
  courseTitle: string | null;
  status: string;
  sessionDate: string | null;
};

export function AttendanceTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useOversight<Paged<AttendanceRow> & { summary: { status: string; count: number }[] }>(
    centerId,
    "attendance",
    { enabled, query: { limit: "100" } },
  );
  // No successMsg: a correction that moved the settlement is a WARNING, not a
  // success, so the wording depends on the response. The error toast still
  // belongs to the hook, so there is still only ever one of it.
  const { run: correctOne, busyKey: busyId } = useAction<{
    settlementDivergence?: { diverged?: boolean };
  }>({ method: "patch", onSuccess: () => req.refetch() });

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

  const correct = async (id: string, status: string) => {
    const res = await correctOne({
      url: `admin/centers/${centerId}/attendance/${id}`,
      values: { status },
      key: id,
    });
    if (!res.ok) return;
    if (res.data?.settlementDivergence?.diverged) {
      toast.warning(t("op_correctedDiverged"));
    } else {
      toast.success(t("op_attendanceCorrected"));
    }
  };

  return (
    <div className="space-y-3">
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>{t("op_correctNoMoney")}</AlertTitle>
        <AlertDescription>
          {t("op_correctNoMoneyBody")}
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <EmptyState icon={UserCheck} title={t("op_noAttendance")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("op_student")}</TableHead>
                <TableHead>{t("op_course")}</TableHead>
                <TableHead>{t("op_session")}</TableHead>
                <TableHead>{t("op_status")}</TableHead>
                <TableHead className="text-end">{t("op_correctTo")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.studentName ?? "—"}</TableCell>
                  <TableCell>{a.courseTitle ?? "—"}</TableCell>
                  <TableCell>
                    {a.sessionDate ? <Num.Date value={a.sessionDate} locale={locale} options={{ dateStyle: "medium" }} /> : "—"}
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
                          {tt(asKey(`status.${s}`))}
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
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<DeletionRow[]>(`admin/centers/${centerId}/deletion-requests`, {
    enabled,
    query: { status: "pending" },
  });

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
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>{t("op_softDelete")}</AlertTitle>
        <AlertDescription>
          {t("op_softDeleteBody")}
        </AlertDescription>
      </Alert>

      {rows.length === 0 ? (
        <EmptyState icon={Trash2} title={t("op_noDeletions")} />
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
                <div className="text-xs text-ink-2">
                  {u?.email ? `${u.email} · ` : ""}
                  {t("op_requested")} <Num.Date value={r.requestedAt} locale={locale} options={{ dateStyle: "medium" }} />
                </div>
                <div className="mt-1 text-xs">{t("reason")}: {r.reason}</div>
              </div>
              <div className="flex gap-2">
                <ControlAction
                  label={t("op_approve")}
                  title={t("op_approveDeletionQ")}
                  destructive
                  requireReason
                  confirmText={t("op_approveDeletion")}
                  url={`admin/centers/${centerId}/deletion-requests/${r.id}/decide`}
                  values={{ decision: "approve" }}
                  onDone={req.refetch}
                  description={
                    <>
                      <p>
                        {t("op_accountSoftDeleted")}
                      </p>
                      <p>
                        {t("op_financialPreserved1")} <strong>{t("op_financialPreserved2")}</strong> {t("op_financialPreserved3")}
                      </p>
                    </>
                  }
                />
                <ControlAction
                  label={t("op_reject")}
                  title={t("op_rejectDeletionQ")}
                  confirmText={t("op_reject")}
                  url={`admin/centers/${centerId}/deletion-requests/${r.id}/decide`}
                  values={{ decision: "reject" }}
                  onDone={req.refetch}
                  description={<p>{t("op_accountKeepsWorking")}</p>}
                />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function BroadcastCard({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const { run: send_, busy } = useAction<{ recipients?: number }>({
    url: `admin/centers/${centerId}/broadcast`,
  });
  const [open, setOpen] = useState(false);
  const courses = useAdminGet<Paged<{ id: string; title: string }>>(
    `admin/centers/${centerId}/oversight/courses`,
    { enabled: open, query: { limit: "100" } },
  );

  // The course picker is required only when the broadcast is scoped to one
  // course, and hidden otherwise — `requiredWhen` puts that on the field
  // instead of in a toast that named none of the three empty boxes.
  const fields: FieldSpec[] = [
    {
      name: "scope",
      label: t("op_scope"),
      type: "select",
      required: true,
      options: [
        { value: "center", label: t("op_wholeCenter") },
        { value: "course", label: t("op_oneCourse") },
      ],
    },
    {
      name: "courseId",
      label: t("op_course"),
      type: "select",
      placeholder: t("op_pickCourse"),
      requiredWhen: (v) => v.scope === "course",
      options: (courses.data?.data ?? []).map((c) => ({ value: c.id, label: c.title })),
    },
    { name: "title", label: t("op_title"), type: "text", required: true },
    { name: "body", label: t("op_message"), type: "textarea", rows: 4, required: true },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    initial: { scope: "center" },
    open,
    onSubmit: async (v) => {
      const res = await send_({
        values: {
          scope: v.scope,
          ...(v.scope === "course" ? { courseId: v.courseId } : {}),
          title: v.title,
          body: v.body,
        },
      });
      if (res.ok) {
        // The count comes back with the response, so this toast is raised here
        // rather than as a static successMsg.
        toast.success(t("op_broadcastSent", { count: res.data?.recipients ?? 0 }));
        setOpen(false);
      }
      return res;
    },
  });

  const visible = fields.filter(
    (f) => f.name !== "courseId" || form.watch("scope") === "course",
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Megaphone className="size-4" />{t("op_broadcast")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <Form {...form}>
            <DialogForm onSubmit={() => void submit()}>
              <DialogHeader>
                <DialogTitle>{t("op_broadcastTitle")}</DialogTitle>
              </DialogHeader>

              <FormRootError message={rootError} />
              <p className="text-xs text-ink-2">{t("op_broadcastNote")}</p>

              <FieldControls fields={visible} form={form} />

              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {tt("chat.send")}
                </Button>
              </DialogFooter>
            </DialogForm>
          </Form>
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
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<BlacklistEntry[]>(`admin/centers/${centerId}/blacklist`);
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("op_centerBlacklist")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-ink-2">
          {t.rich("op_blacklistNote", { em: (chunks) => <em>{chunks}</em> })}
        </p>
        {req.isLoading ? (
          <Spinner />
        ) : req.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={req.refetch}
            retryLabel={queryStrings.retry}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-2">{t("op_nobodyBlocked")}</p>
        ) : (
          rows.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{b.targetId}</div>
                <div className="text-xs text-ink-2">
                  {b.reason} · <Num.Date value={b.createdAt} locale={locale} options={{ dateStyle: "medium" }} />
                </div>
              </div>
              <ControlAction
                label={t("op_lift")}
                title={t("op_liftQ")}
                confirmText={t("op_lift")}
                requireReason
                method="delete"
                url={`admin/centers/${centerId}/blacklist/${b.id}`}
                values={{}}
                onDone={req.refetch}
                description={<p>{t("op_liftBody")}</p>}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
