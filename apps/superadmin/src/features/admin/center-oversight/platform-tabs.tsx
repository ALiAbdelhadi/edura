"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LogOut, ShieldAlert, ArrowRightLeft, BarChart3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
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
import { MetricCard } from "@repo/ui/components/metric-card";
import { Num, ProseCount } from "@repo/ui/components/num";
import { formatPercent, type Locale } from "@repo/ui/lib/format";
import { asKey } from "@/lib/i18n/keys";
import { useAdminGet } from "./use-oversight";

const REPORTS = [
  { key: "revenue", labelKey: "rp_revenue" },
  { key: "net-profit", labelKey: "rp_netProfit" },
  { key: "expenses", labelKey: "ma_expenses" },
  { key: "course-fill-rates", labelKey: "rp_courseFillRates" },
  { key: "attendance-by-course", labelKey: "rp_attendanceByCourse" },
  { key: "enrollment-funnel", labelKey: "rp_enrollmentFunnel" },
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
        <AlertTitle>{t("rp_ownReporting")}</AlertTitle>
        <AlertDescription>{t("rp_ownReportingBody")}</AlertDescription>
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
              {t(asKey(r.labelKey))}
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORTS.map((r) => (
          <TabsContent key={r.key} value={r.key}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t(asKey(r.labelKey))}</CardTitle>
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
  const { run: move, busy } = useAction<{
    leftBehind?: { activeEnrollments: number; activeSubscriptions: number; payments: number };
  }>({ successMsg: t("pf_movedOk") });
  const students = useRoster(centerId, open);
  const centers = useAdminGet<{ id: string; name: string; status: string }[]>("admin/centers", {
    enabled: open,
    query: { take: "100" },
  });
  const [result, setResult] = useState<null | {
    leftBehind: { activeEnrollments: number; activeSubscriptions: number; payments: number };
  }>(null);

  // Not an EntityDialog: on success the same dialog stops being a form and
  // becomes a report of what stayed behind. The form half still shares
  // `useFieldForm`, so the three required boxes validate like every other one.
  const fields: FieldSpec[] = [
    {
      name: "studentId",
      label: t("pf_student"),
      type: "select",
      required: true,
      placeholder: t("pf_pickStudent"),
      options: students.map((s) => ({ value: s.studentId, label: s.name ?? s.studentId })),
    },
    {
      name: "toCenterId",
      label: t("pf_destination"),
      type: "select",
      required: true,
      placeholder: t("pf_pickCenter"),
      options: (centers.data ?? [])
        .filter((c) => c.id !== centerId && c.status === "active")
        .map((c) => ({ value: c.id, label: c.name })),
    },
    { name: "reason", label: t("pf_reason"), type: "textarea", rows: 2, required: true },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    onSubmit: async (v) => {
      const res = await move({
        url: `admin/platform/students/${String(v.studentId)}/move`,
        values: {
          fromCenterId: centerId,
          toCenterId: v.toCenterId,
          reason: String(v.reason).trim(),
        },
      });
      if (res.ok) {
        setResult({
          leftBehind: res.data?.leftBehind ?? {
            activeEnrollments: 0,
            activeSubscriptions: 0,
            payments: 0,
          },
        });
      }
      return res;
    },
  });

  const close = () => {
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pf_moveStudent")}</DialogTitle>
        </DialogHeader>
        {result ? (
          <>
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
                  {t("pf_stayedNote")}
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={close}>{t("pf_done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <Form {...form}>
            <DialogForm onSubmit={() => void submit()}>
              <FormRootError message={rootError} />
              <p className="text-xs text-ink-2">
                <strong>{t("pf_rosterOnly")}</strong> {t("pf_rosterOnlyBody")}
              </p>

              <FieldControls fields={fields} form={form} />

              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null}
                  {t("pf_moveBtn")}
                </Button>
              </DialogFooter>
            </DialogForm>
          </Form>
        )}
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
  const { run, busy } = useAction({ successMsg: t("pf_logoutOk") });

  // Required-ness used to be one `toast.error` naming neither empty box.
  // EntityDialog's schema puts the message under the field that is missing.
  return (
    <EntityDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("pf_logoutTitle")}
      note={t("pf_logoutBody")}
      busy={busy}
      fields={[
        {
          name: "userId",
          label: t("pf_userId"),
          type: "text",
          required: true,
          dir: "ltr",
          placeholder: t("pf_userIdPlaceholder"),
        },
        { name: "reason", label: t("pf_reason"), type: "textarea", rows: 2, required: true },
      ]}
      submitLabel={t("pf_forceLogout")}
      onSubmit={async (v) => {
        const res = await run({
          url: `admin/platform/users/${String(v.userId).trim()}/force-logout`,
          values: { reason: String(v.reason).trim(), centerId },
        });
        if (res.ok) onClose();
        return res;
      }}
    />
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
  const { run, busy } = useAction({ successMsg: t("pf_dobOk") });
  const students = useRoster(centerId, open);

  // Not an EntityDialog: the age this dialog derives has to appear BETWEEN the
  // date box and the reason box, and the confirm button turns destructive when
  // the date would switch a child to an adult. It still shares the validation,
  // the reset-on-open and the server-field-error wiring through `useFieldForm`.
  const fields: FieldSpec[] = [
    {
      name: "studentId",
      label: t("pf_student"),
      type: "select",
      required: true,
      placeholder: t("pf_pickStudent"),
      options: students.map((s) => ({
        value: s.studentId,
        label: s.name ?? s.studentId,
      })),
    },
    { name: "dateOfBirth", label: t("pf_dob"), type: "date", required: true },
    { name: "reason", label: t("pf_dobReason"), type: "textarea", rows: 2, required: true },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    open,
    onSubmit: async (v) => {
      const res = await run({
        url: `admin/platform/students/${String(v.studentId)}/verify-dob`,
        values: {
          dateOfBirth: v.dateOfBirth,
          reason: String(v.reason).trim(),
          centerId,
        },
      });
      if (res.ok) onClose();
      return res;
    },
  });

  // "Today" is read once per opening rather than during render: a birth date
  // does not need a clock that ticks, and calling Date.now() in the render
  // body is the impurity the linter rejects.
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  useEffect(() => {
    if (open) setOpenedAt(Date.now());
  }, [open]);

  const dob = String(form.watch("dateOfBirth") ?? "");
  const age =
    dob && openedAt
      ? Math.floor((openedAt - new Date(dob).getTime()) / (365.2425 * 864e5))
      : null;
  const wouldBeAdult = age !== null && age >= 18;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <Form {...form}>
          <DialogForm onSubmit={() => void submit()}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-amber" />
                {t("pf_dobTitle")}
              </DialogTitle>
            </DialogHeader>

            <FormRootError message={rootError} />

            <p className="text-xs text-ink-2">
              {t("pf_dobBody1")} <strong>{t("pf_dobMinor")}</strong> {t("pf_dobBody2")}
            </p>

            <FieldControls fields={fields.slice(0, 2)} form={form} />

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

            <FieldControls fields={fields.slice(2)} form={form} />

            <DialogFooter>
              <Button
                type="submit"
                variant={wouldBeAdult ? "destructive" : "default"}
                disabled={busy}
              >
                {busy ? <Spinner /> : null}
                {t("pf_verifyBtn")}
              </Button>
            </DialogFooter>
          </DialogForm>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
