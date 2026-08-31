"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num, ProseCount } from "@repo/ui/components/num";
import { formatPercent, type Locale } from "@repo/ui/lib/format";
import { asKey } from "@/lib/i18n/keys";
import { useAdminGet } from "./use-oversight";

const REPORTS = [
  { key: "revenue", label: "Revenue" },
  { key: "net-profit", label: "Net profit" },
  { key: "expenses", label: "Expenses" },
  { key: "course-fill-rates", label: "Course fill rates" },
  { key: "attendance-by-course", label: "Attendance by course" },
  { key: "enrollment-funnel", label: "Enrollment funnel" },
] as const;

export function ReportsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
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
      ) : dash.isError ? (
        <LoadError
          message={queryStrings.loadFailed}
          onRetry={dash.refetch}
          retryLabel={queryStrings.retry}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label={t("rp_students")} value={<Num.Figure value={num(d.totalStudents)} locale={locale} />} />
          <MetricCard label={t("rp_activeClasses")} value={<Num.Figure value={num(d.activeClasses)} locale={locale} />} />
          <MetricCard label={t("rp_revenue")} value={<Num.Money piasters={num(d.totalRevenue)} locale={locale} sign={false} short align="start" />} />
          <MetricCard
            label={t("rp_attendanceRate")}
            value={<Num>{formatPercent(Math.round(num(d.attendanceRate)), locale)}</Num>}
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
                ) : data.isError ? (
                  <LoadError
                    message={queryStrings.loadFailed}
                    onRetry={data.refetch}
                    retryLabel={queryStrings.retry}
                  />
                ) : (
                  <pre className="overflow-x-auto rounded-md bg-field p-3 text-xs whitespace-pre-wrap">
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

export function PlatformActionsCard({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const [open, setOpen] = useState<null | "move" | "logout" | "dob">(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pf_title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>{t("pf_noCenterCan")}</AlertTitle>
            <AlertDescription>
              {t("pf_noCenterCanBody")}
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen("move")}>
              <ArrowRightLeft className="size-4" />
              {t("pf_moveStudent")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("logout")}>
              <LogOut className="size-4" />
              {t("pf_forceLogout")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen("dob")}>
              {t("pf_verifyDob")}
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const forms = (stem: string) => ({
    one: t(asKey(`${stem}_one`)),
    two: t.has(asKey(`${stem}_two`)) ? t(asKey(`${stem}_two`)) : undefined,
    few: t.has(asKey(`${stem}_few`)) ? t(asKey(`${stem}_few`)) : undefined,
    many: t(asKey(`${stem}_many`)),
  });
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
      toast.error(t("pf_moveNeeds"));
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
      toast.success(t("pf_movedOk"));
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
          <DialogTitle>{t("pf_moveStudent")}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p>{t("pf_onRoster")}</p>
            <Alert>
              <AlertTitle>{t("pf_stayed")}</AlertTitle>
              <AlertDescription>
                <ul className="list-inside list-disc">
                  <li><ProseCount count={result.leftBehind.activeEnrollments} locale={locale} forms={forms("pf_enroll")} /></li>
                  <li><ProseCount count={result.leftBehind.activeSubscriptions} locale={locale} forms={forms("pf_sub")} /></li>
                  <li><ProseCount count={result.leftBehind.payments} locale={locale} forms={forms("pf_pay")} /></li>
                </ul>
                These are facts about what happened here, and some have already settled — they
                are never moved. Enrol the student at the new center as a new arrival.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-2">
              <strong>{t("pf_rosterOnly")}</strong> {t("pf_rosterOnlyBody")}
            </p>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">{t("pf_student")}</span>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pf_pickStudent")} />
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
              <span className="block font-medium">{t("pf_destination")}</span>
              <Select value={toCenterId} onValueChange={setToCenterId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("pf_pickCenter")} />
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
                {t("pf_reason")} <span className="text-red" aria-hidden="true">*</span>
              </span>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={close}>{t("pf_done")}</Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("pf_moveBtn")}
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
  const t = useTranslations("oversight");
  const { mutateAsync } = useCustomMutation();
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!userId.trim() || !reason.trim()) {
      toast.error(t("pf_logoutNeeds"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/platform/users/${userId.trim()}/force-logout`,
        method: "post",
        values: { reason: reason.trim(), centerId },
      });
      toast.success(t("pf_logoutOk"));
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
          <DialogTitle>{t("pf_logoutTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            {t("pf_logoutBody")}
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t("pf_userId")}</span>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">
              {t("pf_reason")} <span className="text-red" aria-hidden="true">*</span>
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
  const t = useTranslations("oversight");
  const locale = useLocale() as Locale;
  const { mutateAsync } = useCustomMutation();
  const students = useRoster(centerId, open);
  const [studentId, setStudentId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [age, setAge] = useState<number | null>(null);
  const onDobChange = (v: string) => {
    setDateOfBirth(v);
    setAge(v ? Math.floor((Date.now() - new Date(v).getTime()) / (365.2425 * 864e5)) : null);
  };
  const wouldBeAdult = age !== null && age >= 18;

  const submit = async () => {
    if (!studentId || !dateOfBirth || !reason.trim()) {
      toast.error(t("pf_dobNeeds"));
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/platform/students/${studentId}/verify-dob`,
        method: "post",
        values: { dateOfBirth, reason: reason.trim(), centerId },
      });
      toast.success(t("pf_dobOk"));
      setDateOfBirth("");
      setAge(null);
      setReason("");
      onClose();
    } catch (e) {
      toast.error(t("pf_verifyFail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-amber" />
            {t("pf_dobTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-ink-2">
            {t("pf_dobBody1")} <strong>{t("pf_dobMinor")}</strong> {t("pf_dobBody2")}
          </p>
          <label className="space-y-1 text-sm">
            <span className="block font-medium">{t("pf_student")}</span>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder={t("pf_pickStudent")} />
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
            <span className="block font-medium">{t("pf_dob")}</span>
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(e) => onDobChange(e.target.value)}
            />
          </label>
          {wouldBeAdult ? (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>{t("pf_oversightOff")}</AlertTitle>
              <AlertDescription>
                <Num.Figure value={age} locale={locale} /> {t("pf_yearsOldAdult")}
              </AlertDescription>
            </Alert>
          ) : age !== null ? (
            <p className="text-xs text-ink-2">
              <Num.Figure value={age} locale={locale} /> {t("pf_yearsOldMinor")}
            </p>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="block font-medium">
              {t("pf_dobReason")} <span className="text-red" aria-hidden="true">*</span>
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
            {t("pf_verifyBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
