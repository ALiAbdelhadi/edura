/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Calendar } from "@/components/kit/calendar";
import { LineChart } from "@/components/charts";
import { Combobox } from "@/components/kit/combobox";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { StatCard } from "@/components/kit/stat-card";
import { StatusBadge } from "@/components/kit/status-badge";
import CopyableText from "@/components/ui/copyable-text";
import StudentLink from "@/components/ui/student-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreate, useCustom, useList } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import dayjs from "dayjs";
import {
  BarChart3,
  Calendar as CalendarIcon,
  DollarSign,
  FileText,
  Plus,
  Receipt,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type DateRange = { from: Date | undefined; to?: Date | undefined };

export function AdminFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate } = useFormatters();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const dateQuery = useMemo(
    () => ({
      ...(dateRange?.from
        ? { from: dayjs(dateRange.from).format("YYYY-MM-DD") }
        : {}),
      ...(dateRange?.to ? { to: dayjs(dateRange.to).format("YYYY-MM-DD") } : {}),
    }),
    [dateRange],
  );

  const resetRange = () => setDateRange(undefined);

  const paymentFilters = useMemo(() => {
    const filters: Array<{ field: string; operator: "eq"; value: string }> = [];
    if (dateQuery.from) filters.push({ field: "from", operator: "eq", value: dateQuery.from });
    if (dateQuery.to) filters.push({ field: "to", operator: "eq", value: dateQuery.to });
    return filters;
  }, [dateQuery]);

  const { query: paymentsQuery, result: paymentsResult } = useList({
    resource: "payments",
    filters: paymentFilters,
  });
  const { query: reportsQuery, result: reportsResult } = useCustom({
    url: "reports/net-profit",
    method: "get",
    config: { query: dateQuery },
  });
  const { query: studentsQuery, result: studentsResult } = useList({
    resource: "students",
    pagination: { mode: "off" },
  });
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    pagination: { mode: "off" },
  });
  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    pagination: { mode: "off" },
  });
  const { mutate: createPayment, mutation: createMutation } = useCreate();
  const { mutate: createSubscription, mutation: subMutation } = useCreate();
  const { mutate: requestPayout, mutation: payoutMutation } = useCreate();

  // Center wallet + withdraw (Step 4.5).
  const { query: walletQuery, result: walletRes } = useCustom({ url: "center/wallet", method: "get" });
  const { query: centerPayoutsQuery, result: centerPayoutsRes } = useCustom({ url: "center/wallet/payouts", method: "get" });
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawEgp, setWithdrawEgp] = useState("");

  const centerWallet = walletRes?.data as
    | { balance: number; available: number; pendingPayouts?: { count: number; amount: number } }
    | undefined;
  const centerPayouts = (centerPayoutsRes?.data ?? []) as any[];

  const handleWithdraw = () => {
    const egp = withdrawEgp.trim() === "" ? null : Number(withdrawEgp);
    if (egp !== null && (!Number.isFinite(egp) || egp <= 0)) {
      toast.error(t("adminManage.fees.walletInvalidAmount"));
      return;
    }
    requestPayout(
      {
        resource: "center/wallet/payout-request",
        values: egp === null ? {} : { amount: Math.round(egp * 100) },
      },
      {
        onSuccess: () => {
          setIsWithdrawOpen(false);
          setWithdrawEgp("");
          toast.success(t("adminManage.fees.walletRequestSubmitted"));
          walletQuery.refetch();
          centerPayoutsQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("adminManage.fees.recordFailed")),
      },
    );
  };

  const [isFormOpen, setIsFormOpen] = useState(false);

  // Walk-in cash subscription (Step 4): one-step counter workflow — pay cash
  // for a plan (+ optional immediate check-in for a per-session pass).
  const [isSubOpen, setIsSubOpen] = useState(false);
  const [subStudentId, setSubStudentId] = useState("");
  const [subCourseId, setSubCourseId] = useState("");
  const [subPlan, setSubPlan] = useState<"monthly" | "per_session">("monthly");
  const [subSessionId, setSubSessionId] = useState("");
  const [subMarkAttendance, setSubMarkAttendance] = useState(true);

  const { result: subSessionsResult } = useList({
    resource: "sessions",
    filters: subCourseId ? [{ field: "courseId", operator: "eq", value: subCourseId }] : [],
    pagination: { mode: "off" },
    queryOptions: { enabled: isSubOpen && !!subCourseId && subPlan === "per_session" },
  });

  const resetSubForm = () => {
    setSubStudentId("");
    setSubCourseId("");
    setSubPlan("monthly");
    setSubSessionId("");
    setSubMarkAttendance(true);
  };

  const handleRecordSubscription = () => {
    if (!subStudentId || !subCourseId) {
      toast.error(t("adminManage.fees.subMissingFields"));
      return;
    }
    if (subPlan === "per_session" && !subSessionId) {
      toast.error(t("adminManage.fees.subMissingSession"));
      return;
    }
    createSubscription(
      {
        resource: "center/subscriptions",
        values: {
          studentId: subStudentId,
          courseId: subCourseId,
          plan: subPlan,
          ...(subPlan === "per_session"
            ? { sessionId: subSessionId, markAttendance: subMarkAttendance }
            : {}),
        },
      },
      {
        onSuccess: (res: any) => {
          setIsSubOpen(false);
          resetSubForm();
          const receipt = res?.data?.data?.receiptNumber ?? res?.data?.receiptNumber;
          toast.success(
            `${t("adminManage.fees.subscriptionRecorded")}${receipt ? ` — ${receipt}` : ""}`,
          );
          paymentsQuery.refetch();
          reportsQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("adminManage.fees.recordFailed")),
      },
    );
  };

  const payments = (paymentsResult?.data ?? []) as any[];
  const reports = (reportsResult?.data as any) || null;
  const students = (studentsResult?.data ?? []) as any[];
  const courses = (coursesResult?.data ?? []) as any[];
  const enrollments = (enrollmentsResult?.data ?? []) as any[];

  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: String(s.id || s.studentId || s._id),
        label: `${s.name || t("adminManage.fees.unnamedStudent")}${s.email ? ` (${s.email})` : ""}`,
      })),
    [students],
  );

  const courseOptions = useMemo(
    () =>
      courses.map((c) => ({
        value: String(c.id || c._id),
        label: c.title || c.subject || t("adminManage.fees.untitledClass"),
      })),
    [courses],
  );

  const schema = useMemo(
    () =>
      z.object({
        studentId: z.string().min(1, t("adminManage.fees.selectStudentRequired")),
        courseId: z.string().min(1, t("adminManage.fees.selectClassRequired")),
        amount: z.number({ error: t("adminManage.fees.enterAmountRequired") }),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const defaultValues: FormValues = {
    studentId: "",
    courseId: "",
    amount: undefined as unknown as number,
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleOpenChange = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) form.reset(defaultValues);
  };

  const handleRecordPayment = (values: { studentId: string; courseId: string; amount: number }) => {
    const amountPiastres = Math.round(Number(values.amount) * 100);
    if (!Number.isFinite(amountPiastres) || amountPiastres <= 0) {
      toast.error(t("adminManage.fees.validAmountError"));
      return;
    }

    createPayment(
      {
        resource: "payments",
        values: {
          studentId: values.studentId,
          courseId: values.courseId,
          amount: amountPiastres,
        },
      },
      {
        onSuccess: () => {
          setIsFormOpen(false);
          form.reset(defaultValues);
          toast.success(t("adminManage.fees.paymentRecorded"));
          paymentsQuery.refetch();
          reportsQuery.refetch();
        },
        onError: (err: any) => toast.error(err?.message || t("adminManage.fees.recordFailed")),
      }
    );
  };

  const revenue = reports?.revenue || 0;
  const expenses = reports?.expenses || 0;
  const netProfit = reports?.netProfit || 0;
  const totalOwed = enrollments.reduce((sum: number, row: any) => sum + (row.coursePrice ?? 0), 0);

  const paymentTrendSeries = useMemo(() => {
    const monthMap = new Map<string, { label: string; netPaid: number }>();
    for (const payment of payments) {
      if (!payment?.paidAt) continue;
      const date = new Date(payment.paidAt);
      const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = formatDate(date, { month: "short", year: "2-digit" });
      const existing = monthMap.get(period) ?? { label, netPaid: 0 };
      existing.netPaid += payment.amount ?? 0;
      monthMap.set(period, existing);
    }
    const ordered = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value)
      .slice(-8);
    let cumulativePaid = 0;
    let cumulativeNet = 0;
    const points = ordered.map((row) => {
      cumulativeNet += row.netPaid;
      if (row.netPaid > 0) cumulativePaid += row.netPaid;
      return {
        label: row.label,
        paid: cumulativePaid,
        outstanding: Math.max(totalOwed - cumulativeNet, 0),
      };
    });
    return [
      {
        id: "paid",
        label: t("adminManage.fees.paid"),
        color: "var(--success)",
        points: points.map((row) => ({ x: row.label, value: row.paid })),
      },
      {
        id: "outstanding",
        label: t("adminManage.fees.outstanding"),
        color: "var(--warning)",
        points: points.map((row) => ({ x: row.label, value: row.outstanding })),
      },
    ];
  }, [payments, totalOwed]);

  const columns: ColumnDef<any>[] = [
    {
      accessorKey: "studentName",
      header: t("adminManage.fees.student"),
      cell: ({ row }) => (
        <StudentLink
          studentId={row.original.studentId}
          name={row.original.studentName || t("adminManage.fees.unknownStudent")}
        />
      ),
    },
    {
      id: "studentId",
      header: t("adminManage.fees.userId"),
      enableSorting: false,
      cell: ({ row }) => (
        <CopyableText value={row.original.studentId} label={t("adminManage.fees.userId")} />
      ),
    },
    {
      accessorKey: "courseName",
      header: t("adminManage.fees.course"),
      cell: ({ row }) => row.original.courseName || t("adminManage.fees.unknownCourse"),
    },
    {
      id: "amount",
      header: t("adminManage.fees.amount"),
      cell: ({ row }) => {
        const record = row.original;
        return (
          <span
            className={cn(
              "font-semibold tabular-nums",
              record.type === "refund" ? "text-warning" : "text-success",
            )}
          >
            {record.type === "refund" ? "-" : ""}
            {formatEGP(record.amount)}
          </span>
        );
      },
    },
    {
      id: "date",
      header: t("adminManage.fees.date"),
      cell: ({ row }) => {
        const record = row.original;
        if (!record.paidAt) return t("adminManage.fees.notAvailable");
        try {
          return formatDate(record.paidAt, { month: "short", day: "numeric", year: "numeric" });
        } catch {
          return t("adminManage.fees.notAvailable");
        }
      },
    },
    {
      accessorKey: "receiptNumber",
      header: t("adminManage.fees.receiptNumber"),
      enableSorting: false,
      cell: ({ row }) => (
        <CopyableText
          value={row.original.receiptNumber}
          label={t("adminManage.fees.receiptNumberLabel")}
        />
      ),
    },
    {
      accessorKey: "adminName",
      header: t("adminManage.fees.recordedBy"),
      cell: ({ row }) => row.original.adminName || t("roles.admin"),
    },
    {
      id: "type",
      header: t("adminManage.fees.type"),
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge tone={row.original.type === "refund" ? "warning" : "success"}>
          {row.original.type === "refund"
            ? t("adminManage.fees.refund")
            : t("adminManage.fees.receipt")}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {t("adminManage.fees.dateRange")}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-56 justify-start gap-2 font-normal"
                >
                  <CalendarIcon className="size-4 text-muted-foreground" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <span>
                        {formatDate(dateRange.from)} –{" "}
                        {formatDate(dateRange.to)}
                      </span>
                    ) : (
                      formatDate(dateRange.from)
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      {t("adminManage.fees.pickDateRange")}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  defaultMonth={dateRange?.from}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
          <Button variant="outline" onClick={resetRange}>
            {t("adminManage.fees.reset")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t("adminManage.fees.revenueTotal")}
          value={<span className="text-success">{formatEGP(revenue)}</span>}
          icon={DollarSign}
          accent
        />
        <StatCard
          label={t("adminManage.fees.expensesTotal")}
          value={<span className="text-warning">{formatEGP(expenses)}</span>}
          icon={FileText}
        />
        <StatCard
          label={t("adminManage.fees.netProfit")}
          value={<span className="text-info">{formatEGP(netProfit)}</span>}
          icon={BarChart3}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminManage.fees.walletTitle")}</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              onClick={() => setIsWithdrawOpen(true)}
              disabled={(centerWallet?.available ?? 0) <= 0}
            >
              <DollarSign className="size-4" />
              {t("adminManage.fees.walletWithdraw")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={t("adminManage.fees.walletBalance")} value={formatEGP(centerWallet?.balance ?? 0)} icon={DollarSign} accent />
            <StatCard label={t("adminManage.fees.walletAvailable")} value={formatEGP(centerWallet?.available ?? 0)} icon={DollarSign} />
            <StatCard
              label={t("adminManage.fees.walletReserved")}
              value={`${formatEGP(centerWallet?.pendingPayouts?.amount ?? 0)} (${centerWallet?.pendingPayouts?.count ?? 0})`}
              icon={Receipt}
            />
          </div>
          {centerPayouts.length > 0 ? (
            <div className="space-y-1">
              <div className="text-sm font-medium">{t("adminManage.fees.walletPayoutHistory")}</div>
              {centerPayouts.slice(0, 5).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="font-semibold">{formatEGP(p.netPayable ?? 0)}</span>
                  <StatusBadge
                    tone={p.status === "paid" ? "success" : p.status === "rejected" ? "danger" : "warning"}
                  >
                    {p.status}
                  </StatusBadge>
                  <span className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={isWithdrawOpen}
        onOpenChange={(open) => {
          setIsWithdrawOpen(open);
          if (!open) setWithdrawEgp("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.fees.walletWithdraw")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("adminManage.fees.walletAvailable")}: <strong>{formatEGP(centerWallet?.available ?? 0)}</strong>
            </p>
            <div>
              <div className="mb-1 text-sm font-medium">{t("adminManage.fees.walletAmountEgp")}</div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("adminManage.fees.walletEmptyMeansAll")}
                value={withdrawEgp}
                onChange={(e) => setWithdrawEgp(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleWithdraw} disabled={payoutMutation.isPending}>
              {payoutMutation.isPending ? <Spinner /> : null}
              {t("adminManage.fees.walletConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>{t("adminManage.fees.paymentLog")}</CardTitle>
          <CardAction>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsSubOpen(true)}>
                <Receipt className="size-4" />
                {t("adminManage.fees.recordSubscription")}
              </Button>
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="size-4" />
                {t("adminManage.fees.recordPayment")}
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("adminManage.fees.paidVsOutstanding")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                series={paymentTrendSeries}
                showArea
                yValueFormatter={(value) => formatShortEGP(value)}
                emptyText={t("adminManage.fees.notEnoughHistory")}
              />
            </CardContent>
          </Card>
          {paymentsQuery.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={payments}
              pageSize={10}
              emptyState={
                <EmptyState icon={Receipt} title={t("adminManage.fees.noPayments")} />
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isSubOpen}
        onOpenChange={(open) => {
          setIsSubOpen(open);
          if (!open) resetSubForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.fees.recordSubscription")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-medium">{t("adminManage.fees.student")}</div>
              <Combobox
                options={studentOptions}
                value={subStudentId}
                onChange={(v) => setSubStudentId(v ?? "")}
                placeholder={t("adminManage.fees.selectStudent")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
                disabled={studentsQuery.isLoading}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("adminManage.fees.course")}</div>
              <Combobox
                options={courses.map((c: any) => ({ value: c.id, label: c.title }))}
                value={subCourseId}
                onChange={(v) => {
                  setSubCourseId(v ?? "");
                  setSubSessionId("");
                }}
                placeholder={t("adminManage.fees.selectClass")}
                searchPlaceholder={t("actions.search")}
                emptyText={t("common.noData")}
                disabled={coursesQuery.isLoading}
              />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">{t("adminManage.fees.plan")}</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={subPlan === "monthly" ? "default" : "outline"}
                  onClick={() => setSubPlan("monthly")}
                >
                  {t("adminManage.fees.planMonthly")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={subPlan === "per_session" ? "default" : "outline"}
                  onClick={() => setSubPlan("per_session")}
                >
                  {t("adminManage.fees.planPerSession")}
                </Button>
              </div>
            </div>
            {subPlan === "per_session" ? (
              <div className="space-y-2">
                <div className="mb-1 text-sm font-medium">{t("adminManage.fees.session")}</div>
                <Select
                  value={subSessionId || undefined}
                  onValueChange={setSubSessionId}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("adminManage.fees.session")}
                  >
                    <SelectValue placeholder={t("adminManage.fees.selectSession")} />
                  </SelectTrigger>
                  <SelectContent>
                    {((subSessionsResult?.data ?? []) as any[])
                      .filter((s) => s.status === "scheduled")
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {new Date(s.date).toLocaleDateString()} {s.startTime}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sub-mark-attendance"
                    checked={subMarkAttendance}
                    onCheckedChange={(v) => setSubMarkAttendance(v === true)}
                  />
                  <Label htmlFor="sub-mark-attendance" className="text-sm font-normal">
                    {t("adminManage.fees.markAttendanceNow")}
                  </Label>
                </div>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("adminManage.fees.subCashHint")}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleRecordSubscription}
              disabled={subMutation.isPending}
            >
              {subMutation.isPending ? <Spinner /> : null}
              {t("adminManage.fees.confirmCashSubscription")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFormOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.fees.recordPayment")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleRecordPayment)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="studentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.fees.student")}</FormLabel>
                    <FormControl>
                      <Combobox
                        options={studentOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("adminManage.fees.selectStudent")}
                        searchPlaceholder={t("actions.search")}
                        emptyText={t("common.noData")}
                        disabled={studentsQuery.isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="courseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.fees.class")}</FormLabel>
                    <FormControl>
                      <Combobox
                        options={courseOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("adminManage.fees.selectClass")}
                        searchPlaceholder={t("actions.search")}
                        emptyText={t("common.noData")}
                        disabled={coursesQuery.isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.fees.amountEgp")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.01}
                        step={10}
                        inputMode="decimal"
                        placeholder="800"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const v = e.target.valueAsNumber;
                          field.onChange(
                            e.target.value === "" || Number.isNaN(v) ? undefined : v,
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Spinner /> : null}
                  {t("adminManage.fees.record")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
