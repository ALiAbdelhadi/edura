"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCustomMutation } from "@refinedev/core";
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
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
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
                        <span className="text-xs text-ink-2">locked — settled</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button size="sm" onClick={() => setCompleting(s)}>
                            Complete &amp; settle
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
      toast.success(t("op_sessionCompleted"));
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
              <p className="text-xs text-red">
                No students are marked present — settling now distributes nothing. Check the
                attendance first.
              </p>
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
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  const [f, setF] = useState({ newDate: "", newStartTime: "", newEndTime: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!session || !f.newDate || !f.newStartTime || !f.newEndTime || !f.reason.trim()) {
      toast.error(t("op_needDateTimesReason"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/sessions/${session.id}/postpone`,
        method: "post",
        values: f,
      });
      toast.success(t("op_sessionPostponed"));
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
          <DialogTitle>{t("op_postponeSession")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            Checked against the teacher&apos;s and the hall&apos;s other bookings. Refused if the
            session has already been settled.
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t("op_newDate")}</span>
            <Input type="date" value={f.newDate} onChange={(e) => set("newDate")(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t("op_start")}</span>
              <Input
                type="time"
                value={f.newStartTime}
                onChange={(e) => set("newStartTime")(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t("op_end")}</span>
              <Input
                type="time"
                value={f.newEndTime}
                onChange={(e) => set("newEndTime")(e.target.value)}
              />
            </label>
          </div>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t("op_reason")}<span className="text-red">*</span>
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

type AttendanceRow = {
  id: string;
  studentName: string | null;
  courseTitle: string | null;
  status: string;
  sessionDate: string | null;
};

export function AttendanceTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useOversight<Paged<AttendanceRow> & { summary: { status: string; count: number }[] }>(
    centerId,
    "attendance",
    { enabled, query: { limit: "100" } },
  );
  const { mutateAsync } = useCustomMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

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
        toast.success(t("op_attendanceCorrected"));
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
                <div className="mt-1 text-xs">Reason: {r.reason}</div>
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
      toast.error(t("op_needBroadcast"));
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
        <Megaphone className="size-4" />{t("op_broadcast")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("op_broadcastTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-ink-2">
              Goes to this center&apos;s enrolled students (and their parents for a course
              broadcast). It is sent as the platform, not as the center.
            </p>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t("op_scope")}</span>
              <Select value={scope} onValueChange={(v) => setScope(v as "center" | "course")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="center">{t("op_wholeCenter")}</SelectItem>
                  <SelectItem value="course">{t("op_oneCourse")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {scope === "course" ? (
              <label className="space-y-1 text-sm">
                <span className="block font-medium">{t("op_course")}</span>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("op_pickCourse")} />
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
              <span className="block font-medium">{t("op_title")}</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t("op_message")}</span>
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
          A center-level block withdraws that student&apos;s enrollments <em>at this center only</em>,
          through the reversible cascade journal — lifting it restores exactly those rows.
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
