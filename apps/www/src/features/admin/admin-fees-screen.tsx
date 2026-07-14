"use client";

import { useMemo, useState } from "react";
import { useList, useCreate, useCustom } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dayjs, { type Dayjs } from "dayjs";
import {
  Plus,
  DollarSign,
  FileText,
  BarChart3,
  Receipt,
} from "lucide-react";
import { useTranslations } from "next-intl";
import CopyableText from "@/components/ui/copyable-text";
import StudentLink from "@/components/ui/student-link";
import { LineChart } from "@/components/charts";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { Combobox } from "@/components/kit/combobox";
import { StatCard } from "@/components/kit/stat-card";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";

export function AdminFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate } = useFormatters();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const dateQuery = useMemo(
    () => ({
      ...(range?.[0] ? { from: range[0].format("YYYY-MM-DD") } : {}),
      ...(range?.[1] ? { to: range[1].format("YYYY-MM-DD") } : {}),
    }),
    [range],
  );

  const applyRange = (start: string, end: string) => {
    setStartDraft(start);
    setEndDraft(end);
    if (start && end) setRange([dayjs(start), dayjs(end)]);
    else setRange(null);
  };

  const resetRange = () => {
    setStartDraft("");
    setEndDraft("");
    setRange(null);
  };

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

  const [isFormOpen, setIsFormOpen] = useState(false);

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
            <Input
              type="date"
              className="w-40"
              value={startDraft}
              onChange={(event) => applyRange(event.target.value, endDraft)}
            />
            <Input
              type="date"
              className="w-40"
              value={endDraft}
              onChange={(event) => applyRange(startDraft, event.target.value)}
            />
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
          <CardTitle>{t("adminManage.fees.paymentLog")}</CardTitle>
          <CardAction>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="size-4" />
              {t("adminManage.fees.recordPayment")}
            </Button>
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
