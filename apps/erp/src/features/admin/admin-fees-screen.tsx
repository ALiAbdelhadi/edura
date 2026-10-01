/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { LineChart } from "@/components/charts";
import { Combobox } from "@/components/kit/combobox";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { DateRangeField, EMPTY_RANGE, type DateKeyRange } from "@/components/kit/date-range-field";
import { EmptyState } from "@/components/kit/empty-state";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import CopyableText from "@/components/ui/copyable-text";
import StudentLink from "@/components/ui/student-link";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustom, useList } from "@refinedev/core";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { Button } from "@repo/ui/components/button";
import { QuerySection } from "@repo/ui/components/query-section";
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
import { toast } from "@repo/ui/components/sonner";
import { cn } from "@repo/ui/lib/utils";
import {
  BarChart3,
  DollarSign,
  FileText,
  Plus,
  Receipt,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Amount, Badge, Computation, DateText, Eyebrow, FinalityNotice, Num, PageHead, Sheet, SheetHead, TwoStepCommit, postMoney, readApiError } from "./ledger";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import { asArray } from "@/lib/refine/as-array";
import { QUERY_FRESHNESS } from "@/lib/refine";
import { newIdempotencyKey } from "@/features/student/idempotency";

type RefundChannel = "cash_drawer" | "bank_transfer" | "gateway";
// Every channel a refund row can carry — used to RENDER rows, including any
// `gateway` row that reached the database through the API.
const REFUND_CHANNELS: readonly RefundChannel[] = ["cash_drawer", "bank_transfer", "gateway"];
// The channels the picker OFFERS. `gateway` is deliberately absent: a gateway
// refund is confirmed only by the provider's webhook, and the Paymob webhook
// has no reversal handling yet — so arming one today creates an obligation
// nobody can complete. Add it back here once the Paymob webhook accepts
// reversal events and calls the confirmation path.
type OfferedRefundChannel = "cash_drawer" | "bank_transfer";
const OFFERED_REFUND_CHANNELS: readonly OfferedRefundChannel[] = ["cash_drawer", "bank_transfer"];
function channelOf(value: unknown): RefundChannel {
  return REFUND_CHANNELS.includes(value as RefundChannel) ? (value as RefundChannel) : "cash_drawer";
}

function isRefundRow(record: { amount?: number | null }): boolean {
  return Number(record?.amount ?? 0) < 0;
}

/**
 * A receipt may carry several partial refunds (migration 20260908120000), so
 * the button stays until `refunded_total` reaches the amount. The dialog
 * computes the remainder from the same two fields.
 */
function isAlreadyRefunded(record: { amount?: number | null; refundedTotal?: number | null }): boolean {
  const amount = Number(record?.amount ?? 0);
  return amount > 0 && Number(record?.refundedTotal ?? 0) >= amount;
}

export function AdminFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate, formatClockRange, locale } =
    useFormatters();
  const [range, setRange] = useState<DateKeyRange>(EMPTY_RANGE);
  useParamSeed("from", (v) => setRange((r) => ({ ...r, from: v })));
  useParamSeed("to", (v) => setRange((r) => ({ ...r, to: v })));
  const dateQuery = useMemo(
    () => ({
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
    }),
    [range],
  );

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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubOpen, setIsSubOpen] = useState(false);
  const pickersWanted = isFormOpen || isSubOpen;
  const { query: studentsQuery, result: studentsResult } = useList({
    resource: "students",
    pagination: { mode: "off" },
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: pickersWanted },
  });
  const { query: coursesQuery, result: coursesResult } = useList({
    resource: "courses",
    pagination: { mode: "off" },
    queryOptions: { ...QUERY_FRESHNESS.list, enabled: pickersWanted },
  });
  const { result: enrollmentsResult } = useList({
    resource: "enrollments",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    pagination: { mode: "off" },
  });

  const { query: walletQuery, result: walletRes } = useCustom({ url: "center/wallet", method: "get" });
  const { query: creditQuery, result: creditRes } = useCustom({ url: "center/credit", method: "get" });
  const { query: centerPayoutsQuery, result: centerPayoutsRes } = useCustom({ url: "center/wallet/payouts", method: "get" });
  const { query: unconfirmedQuery, result: unconfirmedRes } = useCustom({
    url: "payments/refunds/unconfirmed",
    method: "get",
  });
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  // One idempotency key per open of the withdraw dialog — a timeout retry
  // inside the same session resolves to the same payout server-side.
  const withdrawKey = useRef("");
  const [withdrawEgp, setWithdrawEgp] = useState("");

  const centerCredit = ((creditRes as { data?: unknown })?.data ?? null) as
    | { creditBalance: number; entries: { id: string; type: string; delta: number; balanceAfter: number; reason: string | null; createdAt: string }[] }
    | null;
  const [creditTopupEgp, setCreditTopupEgp] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMockIntent, setCreditMockIntent] = useState<{ intentId: string; amount: number } | null>(null);
  const onlineCheckout = useOnlineCheckout();

  const initiateCreditTopup = async () => {
    const egp = Number(creditTopupEgp);
    if (!Number.isFinite(egp) || egp < 10) {
      toast.error(t("adminManage.fees.creditTopupInvalid"));
      return;
    }
    setCreditBusy(true);
    try {
      const intent = await postMoney<{ id: string; amount: number; checkout?: { url?: string } }>(
        "center/credit/topup",
        {
          amount: Math.round(egp * 100),
          method: "card",
          idempotencyKey: `cctop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      );
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setCreditMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        goToCheckout(intent.checkout.url);
      }
    } catch (err) {
      const e = await readApiError(err);
      toast.error(e.message || t("adminManage.fees.creditTopupFailed"));
    } finally {
      setCreditBusy(false);
    }
  };

  const completeCreditMock = async () => {
    if (!creditMockIntent) return;
    setCreditBusy(true);
    try {
      await postMoney(`payments/intents/${creditMockIntent.intentId}/mock-complete`, {
        outcome: "success",
      });
      toast.success(t("adminManage.fees.creditTopupDone"));
      setCreditMockIntent(null);
      setCreditTopupEgp("");
      creditQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      toast.error(e.message || t("adminManage.fees.creditTopupFailed"));
    } finally {
      setCreditBusy(false);
    }
  };

  const centerWallet = walletRes?.data as
    | { balance: number; available: number; pendingPayouts?: { count: number; amount: number } }
    | undefined;
  const centerPayouts = asArray<any>(centerPayoutsRes?.data);

  const withdrawPiasters = useMemo(() => {
    const raw = withdrawEgp.trim();
    if (raw === "") return centerWallet?.available ?? 0;
    const egp = Number(raw);
    return Number.isFinite(egp) && egp > 0 ? Math.round(egp * 100) : 0;
  }, [withdrawEgp, centerWallet?.available]);

  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const handleWithdraw = async () => {
    const egp = withdrawEgp.trim() === "" ? null : Number(withdrawEgp);
    if (egp !== null && (!Number.isFinite(egp) || egp <= 0)) {
      toast.error(t("adminManage.fees.walletInvalidAmount"));
      return;
    }
    setWithdrawBusy(true);
    try {
      await postMoney("center/wallet/payout-request", {
        ...(egp === null ? {} : { amount: Math.round(egp * 100) }),
        clientRequestId: withdrawKey.current,
      });
      setIsWithdrawOpen(false);
      setWithdrawEgp("");
      toast.success(t("adminManage.fees.walletRequestSubmitted"));
      walletQuery.refetch();
      centerPayoutsQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        toast.error(t("adminManage.fees.walletIndeterminate"), { duration: 12000 });
        setIsWithdrawOpen(false);
        walletQuery.refetch();
        centerPayoutsQuery.refetch();
      } else {
        toast.error(e.message || t("adminManage.fees.recordFailed"));
      }
    } finally {
      setWithdrawBusy(false);
    }
  };

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

  const [subBusy, setSubBusy] = useState(false);

  const handleRecordSubscription = async () => {
    if (!subStudentId || !subCourseId) {
      toast.error(t("adminManage.fees.subMissingFields"));
      return;
    }
    if (subPlan === "per_session" && !subSessionId) {
      toast.error(t("adminManage.fees.subMissingSession"));
      return;
    }
    setSubBusy(true);
    try {
      const data = await postMoney<{ receiptNumber?: string }>("center/subscriptions", {
        studentId: subStudentId,
        courseId: subCourseId,
        plan: subPlan,
        ...(subPlan === "per_session"
          ? { sessionId: subSessionId, markAttendance: subMarkAttendance }
          : {}),
      });
      setIsSubOpen(false);
      resetSubForm();
      const receipt = data?.receiptNumber;
      toast.success(
        `${t("adminManage.fees.subscriptionRecorded")}${receipt ? ` — ${receipt}` : ""}`,
      );
      paymentsQuery.refetch();
      reportsQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        toast.error(t("adminManage.fees.writeIndeterminate"), { duration: 12000 });
        setIsSubOpen(false);
        paymentsQuery.refetch();
        reportsQuery.refetch();
      } else {
        toast.error(e.message || t("adminManage.fees.recordFailed"));
      }
    } finally {
      setSubBusy(false);
    }
  };

  const payments = (paymentsResult?.data ?? []) as any[];
  const reports = (reportsResult?.data as any) || null;
  const students = (studentsResult?.data ?? []) as any[];
  const courses = (coursesResult?.data ?? []) as any[];
  const enrollments = (enrollmentsResult?.data ?? []) as any[];

  const studentOptions = useMemo(
    () =>
      students.map((s) => ({
        value: String(s.id || s.studentId),
        label: `${s.name || t("adminManage.fees.unnamedStudent")}${s.email ? ` (${s.email})` : ""}`,
      })),
    [students],
  );

  const courseOptions = useMemo(
    () =>
      courses.map((c) => ({
        value: String(c.id),
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
        paymentMethod: z.enum(["cash", "instapay", "pos_card", "mobile_wallet"]),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const defaultValues: FormValues = {
    studentId: "",
    courseId: "",
    amount: undefined as unknown as number,
    paymentMethod: "cash",
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const handleOpenChange = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) form.reset(defaultValues);
  };

  const [paymentBusy, setPaymentBusy] = useState(false);

  const [refundRow, setRefundRow] = useState<any | null>(null);
  const [refundEgp, setRefundEgp] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // Where the money goes back. Defaults to the drawer because that is what a
  // counter does; the operator changes it when it is a transfer or a card
  // reversal. `wallet` is deliberately not offered — a student wallet credit is
  // a balance the family cannot spend (WALLET_SPENDABILITY.md).
  const [refundChannel, setRefundChannel] = useState<OfferedRefundChannel>("cash_drawer");
  const [refundBusy, setRefundBusy] = useState(false);
  const refundKey = useRef("");

  const [confirmRow, setConfirmRow] = useState<any | null>(null);
  const [confirmRef, setConfirmRef] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const unconfirmedRefunds = asArray<any>((unconfirmedRes as { data?: unknown })?.data);

  const handleConfirmRefund = async () => {
    if (!confirmRow) return;
    const ref = confirmRef.trim();
    if (!ref) {
      toast.error(t("adminManage.fees.refundRefRequired"));
      return;
    }
    setConfirmBusy(true);
    try {
      await postMoney(`payments/${confirmRow.id}/refund/confirm`, { externalRef: ref });
      toast.success(t("adminManage.fees.refundConfirmed"));
      setConfirmRow(null);
      setConfirmRef("");
      unconfirmedQuery.refetch();
      paymentsQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        toast.error(t("adminManage.fees.writeIndeterminate"), { duration: 12000 });
        setConfirmRow(null);
        unconfirmedQuery.refetch();
      } else {
        toast.error(e.message || t("adminManage.fees.recordFailed"));
      }
    } finally {
      setConfirmBusy(false);
    }
  };

  const refundOriginal =
    Math.abs(Number(refundRow?.amount ?? 0)) - Number(refundRow?.refundedTotal ?? 0);
  const refundPiasters = useMemo(() => {
    const egp = Number(refundEgp.trim());
    return Number.isFinite(egp) && egp > 0 ? Math.round(egp * 100) : 0;
  }, [refundEgp]);
  const refundExceeds = refundPiasters > refundOriginal;

  const openRefund = (row: any) => {
    // Minted once per dialog opening, so a retry after the 45s money-write
    // timeout resolves to the SAME refund instead of minting a second one.
    refundKey.current = newIdempotencyKey("refund");
    setRefundChannel("cash_drawer");
    setRefundRow(row);
    setRefundEgp(
      ((Math.abs(Number(row.amount ?? 0)) - Number(row.refundedTotal ?? 0)) / 100).toFixed(2),
    );
    setRefundReason("");
  };

  const closeRefund = (open: boolean) => {
    if (open) return;
    setRefundRow(null);
    setRefundEgp("");
    setRefundReason("");
  };

  const handleRefund = async () => {
    if (!refundRow) return;
    const reason = refundReason.trim();
    if (!reason) {
      toast.error(t("adminManage.fees.refundReasonRequired"));
      return;
    }
    if (refundPiasters <= 0 || refundExceeds) {
      toast.error(t("adminManage.fees.validAmountError"));
      return;
    }

    setRefundBusy(true);
    try {
      await postMoney(`payments/${refundRow.id}/refund`, {
        amount: refundPiasters,
        reason,
        refundChannel,
        clientRequestId: refundKey.current,
      });
      toast.success(t("adminManage.fees.refundDone"));
      closeRefund(false);
      paymentsQuery.refetch();
      reportsQuery.refetch();
      walletQuery.refetch();
      unconfirmedQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        toast.error(t("adminManage.fees.writeIndeterminate"), { duration: 12000 });
        closeRefund(false);
        paymentsQuery.refetch();
        reportsQuery.refetch();
      } else {
        toast.error(e.message || t("adminManage.fees.recordFailed"));
      }
    } finally {
      setRefundBusy(false);
    }
  };

  const handleRecordPayment = async (values: {
    studentId: string;
    courseId: string;
    amount: number;
    paymentMethod: "cash" | "instapay" | "pos_card" | "mobile_wallet";
  }) => {
    const amountPiastres = Math.round(Number(values.amount) * 100);
    if (!Number.isFinite(amountPiastres) || amountPiastres <= 0) {
      toast.error(t("adminManage.fees.validAmountError"));
      return;
    }

    setPaymentBusy(true);
    try {
      await postMoney("payments", {
        studentId: values.studentId,
        courseId: values.courseId,
        amount: amountPiastres,
        paymentMethod: values.paymentMethod,
      });
      setIsFormOpen(false);
      form.reset(defaultValues);
      toast.success(t("adminManage.fees.paymentRecorded"));
      paymentsQuery.refetch();
      reportsQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        toast.error(t("adminManage.fees.writeIndeterminate"), { duration: 12000 });
        setIsFormOpen(false);
        paymentsQuery.refetch();
        reportsQuery.refetch();
      } else {
        toast.error(e.message || t("adminManage.fees.recordFailed"));
      }
    } finally {
      setPaymentBusy(false);
    }
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
      id: "studentCode",
      header: t("adminHome.students_colCode"),
      enableSorting: false,
      cell: ({ row }) => (
        <CopyableText
          value={row.original.studentCode || row.original.studentId}
          label={t("adminHome.students_colCode")}
        />
      ),
    },
    {
      accessorKey: "courseName",
      header: t("adminManage.fees.course"),
      cell: ({ row }) =>
        row.original.courseName ||
        (row.original.courseId ? t("adminManage.fees.unknownCourse") : "—"),
    },
    {
      id: "amount",
      header: t("adminManage.fees.amount"),
      cell: ({ row }) => {
        const record = row.original;
        return (
          <Amount
            piasters={record.amount ?? 0}
            locale={locale}
            className={cn(
              "text-[13px] font-semibold",
              isRefundRow(record) ? "text-destructive" : "text-[var(--teal)]",
            )}
          />
        );
      },
    },
    {
      id: "date",
      header: t("adminManage.fees.date"),
      cell: ({ row }) => {
        const record = row.original;
        if (!record.paidAt)
          return <span className="text-[var(--ink-3)]">{t("adminManage.fees.notAvailable")}</span>;
        try {
          return (
            <DateText className="text-xs text-[var(--ink-3)]">
              {formatDate(record.paidAt, { month: "short", day: "numeric", year: "numeric" })}
            </DateText>
          );
        } catch {
          return <span className="text-[var(--ink-3)]">{t("adminManage.fees.notAvailable")}</span>;
        }
      },
    },
    {
      accessorKey: "receiptNumber",
      header: t("adminManage.fees.receiptNumber"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-0.5">
          <CopyableText
            value={row.original.receiptNumber}
            label={t("adminManage.fees.receiptNumberLabel")}
          />
          {row.original.id ? <ReceiptLink paymentId={row.original.id} /> : null}
        </div>
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
        <Badge tone={isRefundRow(row.original) ? "failed" : "done"}>
          {isRefundRow(row.original)
            ? t("adminManage.fees.refund")
            : t("adminManage.fees.receipt")}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: t("adminManage.fees.refundOpen"),
      enableSorting: false,
      cell: ({ row }) =>
        isRefundRow(row.original) || isAlreadyRefunded(row.original) ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => openRefund(row.original)}
          >
            <Undo2 className="size-4" aria-hidden />
            {t("adminManage.fees.refundOpen")}
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.fees")}
        subtitle={t("adminManage.fees.subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeField
              value={range}
              onChange={setRange}
              formatDate={formatDate}
              placeholder={t("adminManage.fees.pickDateRange")}
              clearLabel={t("adminManage.fees.reset")}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Sheet>
          <SheetHead title={t("adminManage.fees.netProfit")} />
          <div className="flex flex-col p-[18px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] pb-3.5">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminManage.fees.revenueTotal")}
              </span>
              <Amount piasters={revenue} locale={locale} className="text-[15px] text-[var(--ink)]" />
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminManage.fees.expensesTotal")}
              </span>
              <Amount
                piasters={-expenses}
                locale={locale}
                className="text-[15px] text-destructive"
              />
            </div>
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("adminManage.fees.netProfit")}
              </span>
              <Amount
                piasters={netProfit}
                locale={locale}
                className="text-[22px] font-semibold text-[var(--money)]"
              />
            </div>
          </div>
        </Sheet>

        <Sheet>
          <SheetHead
            title={t("adminManage.fees.walletTitle")}
            action={
              <Button
                variant="outline"
                size="sm"
                className="border-[var(--rule)]"
                onClick={() => {
                  withdrawKey.current = newIdempotencyKey("cpay");
                  setIsWithdrawOpen(true);
                }}
                disabled={(centerWallet?.available ?? 0) <= 0}
              >
                {t("adminManage.fees.walletWithdraw")}
              </Button>
            }
          />
          <QuerySection query={walletQuery} className="m-[18px]">
          <div className="flex flex-col p-[18px]">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] pb-3.5">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminManage.fees.walletBalance")}
              </span>
              <Amount
                piasters={centerWallet?.balance ?? 0}
                locale={locale}
                className="text-[15px] text-[var(--ink)]"
              />
            </div>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-2)] py-3.5">
              <span className="flex items-baseline gap-1.5 text-[13px] text-[var(--ink-2)]">
                {t("adminManage.fees.walletReserved")}
                <Num className="text-[11px] text-[var(--ink-3)]">
                  ({centerWallet?.pendingPayouts?.count ?? 0})
                </Num>
              </span>
              <Amount
                piasters={-(centerWallet?.pendingPayouts?.amount ?? 0)}
                locale={locale}
                className="text-[15px] text-destructive"
              />
            </div>
            <div className="lg-total mt-1 flex items-baseline justify-between gap-3 pt-3">
              <span className="text-[13px] font-semibold text-[var(--ink)]">
                {t("adminManage.fees.walletAvailable")}
              </span>
              <Amount
                piasters={centerWallet?.available ?? 0}
                locale={locale}
                className="text-[17px] font-semibold text-[var(--money)]"
              />
            </div>
          </div>
          </QuerySection>

          <QuerySection
            query={centerPayoutsQuery}
            skeleton={<></>}
            isEmpty={centerPayouts.length === 0}
            empty={<></>}
            className="m-[18px] mt-0"
          >
          {centerPayouts.length > 0 ? (
            <div className="border-t border-[var(--rule)]">
              <div className="border-b border-[var(--rule)] bg-[var(--field)] px-4 py-2.5">
                <Eyebrow>{t("adminManage.fees.walletPayoutHistory")}</Eyebrow>
              </div>
              {centerPayouts.slice(0, 5).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--rule-2)] px-4 py-2.5 last:border-b-0"
                >
                  <Amount
                    piasters={p.netPayable ?? 0}
                    locale={locale}
                    className="text-[13px] font-semibold text-[var(--ink)]"
                  />
                  <Badge
                    tone={
                      p.status === "paid" ? "done" : p.status === "rejected" ? "failed" : "pending"
                    }
                  >
                    {t(`status.${p.status}` as Parameters<typeof t>[0])}
                  </Badge>
                  <DateText className="text-[11px] text-[var(--ink-3)]">{formatDate(p.createdAt)}</DateText>
                </div>
              ))}
            </div>
          ) : null}
          </QuerySection>
        </Sheet>

        <Sheet>
          <SheetHead title={t("adminManage.fees.creditTitle")} />
          <QuerySection query={creditQuery} className="m-[18px]">
          <div className="flex flex-col p-[18px]">
            <div className="flex items-baseline justify-between gap-3 pb-3.5">
              <span className="text-[13px] text-[var(--ink-2)]">
                {t("adminManage.fees.creditBalance")}
              </span>
              <Amount
                piasters={centerCredit?.creditBalance ?? 0}
                locale={locale}
                className={
                  (centerCredit?.creditBalance ?? 0) < 0
                    ? "text-[17px] font-semibold text-destructive"
                    : "text-[17px] font-semibold text-[var(--money)]"
                }
              />
            </div>
            {(centerCredit?.creditBalance ?? 0) < 0 ? (
              <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-destructive">
                {t("adminManage.fees.creditArrearsHint")}
              </p>
            ) : null}
            {!onlineCheckout ? null : creditMockIntent ? (
              <div className="flex flex-col gap-2 rounded-lg border border-[var(--rule)] bg-[var(--field)] p-3">
                <span className="text-[13px] text-[var(--ink-2)]">
                  {t("adminManage.fees.creditMockConfirm", {
                    amount: formatEGP(creditMockIntent.amount, { decimals: true }),
                  })}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" disabled={creditBusy} onClick={() => void completeCreditMock()}>
                    {t("adminManage.fees.creditMockPay")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreditMockIntent(null)}>
                    {t("actions.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="credit-topup" className="mb-1 block text-[12px] text-[var(--ink-2)]">
                    {t("adminManage.fees.creditTopupAmount")}
                  </label>
                  <Input
                    id="credit-topup"
                    type="number"
                    min={10}
                    step="0.01"
                    inputMode="decimal"
                    dir="ltr"
                    className="num h-10"
                    placeholder="1000"
                    value={creditTopupEgp}
                    onChange={(e) => setCreditTopupEgp(e.target.value)}
                  />
                </div>
                <Button className="h-10" disabled={creditBusy} onClick={() => void initiateCreditTopup()}>
                  {t("adminManage.fees.creditTopup")}
                </Button>
              </div>
            )}
            {(centerCredit?.entries?.length ?? 0) > 0 ? (
              <div className="mt-4 border-t border-[var(--rule)] pt-2">
                <Eyebrow>{t("adminManage.fees.creditLedger")}</Eyebrow>
                {centerCredit!.entries.slice(0, 6).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--rule-2)] py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-2)]">
                      {e.reason ?? e.type}
                    </span>
                    <Amount piasters={e.delta} locale={locale} className="text-[13px]" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          </QuerySection>
        </Sheet>

      </div>

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

          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="withdraw-amount"
                className="mb-1 block text-[13px] font-medium text-[var(--ink)]"
              >
                {t("adminManage.fees.walletAmountEgp")}
              </label>
              <Input
                id="withdraw-amount"
                type="number"
                min="0"
                step="0.01"
                dir="ltr"
                className="num"
                placeholder={t("adminManage.fees.walletEmptyMeansAll")}
                value={withdrawEgp}
                onChange={(e) => setWithdrawEgp(e.target.value)}
              />
            </div>

            <Computation
              lines={[
                {
                  label: t("adminManage.fees.walletBalance"),
                  value: <Amount piasters={centerWallet?.balance ?? 0} locale={locale} />,
                },
                {
                  label: t("adminManage.fees.walletReserved"),
                  value: (
                    <Amount
                      piasters={-(centerWallet?.pendingPayouts?.amount ?? 0)}
                      locale={locale}
                    />
                  ),
                  tone: "out",
                },
              ]}
              totalLabel={t("adminManage.fees.walletRequested")}
              totalValue={<Amount piasters={withdrawPiasters} locale={locale} />}
            />

            <FinalityNotice>{t("adminManage.fees.walletFinality")}</FinalityNotice>

            <TwoStepCommit
              resetKey={withdrawEgp}
              icon={<DollarSign className="size-4" />}
              label={t("adminManage.fees.walletArm", {
                amount: formatEGP(withdrawPiasters, { decimals: true }),
              })}
              armedLabel={t("adminManage.fees.walletConfirmFinal")}
              busy={withdrawBusy}
              disabled={withdrawPiasters <= 0}
              onCommit={handleWithdraw}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Refunds armed but not yet handed over. This is the queue an operator
          works, and the thing to check a shift's unexplained cash variance
          against — a drawer that is heavier than expected usually means a
          cash_drawer refund on this list was never actually paid out. */}
      <QuerySection
        query={unconfirmedQuery}
        skeleton={<></>}
        isEmpty={unconfirmedRefunds.length === 0}
        empty={<></>}
      >
        {unconfirmedRefunds.length > 0 ? (
          <Sheet>
            <div className="border-b border-[var(--rule)] bg-[var(--field)] px-4 py-2.5">
              <Eyebrow>{t("adminManage.fees.refundsAwaiting")}</Eyebrow>
            </div>
            {unconfirmedRefunds.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-2)] px-4 py-2.5 last:border-b-0"
              >
                <div className="flex flex-col gap-0.5">
                  <Amount
                    piasters={Math.abs(Number(r.amount ?? 0))}
                    locale={locale}
                    className="text-[13px] font-semibold text-[var(--ink)]"
                  />
                  <span className="text-[12px] text-[var(--ink-3)]">
                    <Num>{r.receiptNumber ?? ""}</Num>
                    {" · "}
                    {t(`adminManage.fees.refundChannel_${channelOf(r.refundChannel)}`)}
                  </span>
                </div>
                {r.refundChannel === "gateway" ? (
                  <span className="text-[12px] text-[var(--ink-3)]">
                    {t("adminManage.fees.refundGatewayWaits")}
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmRow(r);
                      setConfirmRef("");
                    }}
                  >
                    {t("adminManage.fees.refundConfirmOpen")}
                  </Button>
                )}
              </div>
            ))}
          </Sheet>
        ) : null}
      </QuerySection>

      <Dialog
        open={!!confirmRow}
        onOpenChange={(open) => {
          if (open) return;
          setConfirmRow(null);
          setConfirmRef("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.fees.refundConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[var(--ink-2)]">
              {t("adminManage.fees.refundConfirmBody", {
                amount: formatEGP(Math.abs(Number(confirmRow?.amount ?? 0)), { decimals: true }),
              })}
            </p>
            <div>
              <label
                htmlFor="refund-ref"
                className="mb-1 block text-[13px] font-medium text-[var(--ink)]"
              >
                {t("adminManage.fees.refundRef")}
              </label>
              <Input
                id="refund-ref"
                value={confirmRef}
                onChange={(e) => setConfirmRef(e.target.value)}
                placeholder={t("adminManage.fees.refundRefPlaceholder")}
              />
            </div>
            <FinalityNotice>{t("adminManage.fees.refundConfirmFinality")}</FinalityNotice>
            <TwoStepCommit
              resetKey={`${confirmRow?.id ?? ""}:${confirmRef}`}
              icon={<Undo2 className="size-4" />}
              label={t("adminManage.fees.refundConfirmArm")}
              armedLabel={t("adminManage.fees.refundConfirmFinal2")}
              busy={confirmBusy}
              disabled={!confirmRef.trim()}
              onCommit={handleConfirmRefund}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundRow} onOpenChange={closeRefund}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adminManage.fees.refundTitle")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Computation
              lines={[
                {
                  label: t("adminManage.fees.student"),
                  value: refundRow?.studentName || t("adminManage.fees.unnamedStudent"),
                },
                {
                  label: t("adminManage.fees.receiptNumberLabel"),
                  value: <Num>{refundRow?.receiptNumber ?? ""}</Num>,
                },
              ]}
              totalLabel={t("adminManage.fees.refundOriginalAmount")}
              totalValue={<Amount piasters={refundOriginal} locale={locale} />}
            />

            <div>
              <label
                htmlFor="refund-amount"
                className="mb-1 block text-[13px] font-medium text-[var(--ink)]"
              >
                {t("adminManage.fees.refundAmountEgp")}
              </label>
              <Input
                id="refund-amount"
                type="number"
                min="0"
                step="0.01"
                dir="ltr"
                className="num"
                value={refundEgp}
                onChange={(e) => setRefundEgp(e.target.value)}
                aria-describedby="refund-amount-hint"
              />
              <p
                id="refund-amount-hint"
                className={cn(
                  "mt-1 text-[12px]",
                  refundExceeds ? "text-destructive" : "text-[var(--ink-3)]",
                )}
              >
                {refundExceeds
                  ? t("adminManage.fees.refundExceeds")
                  : t("adminManage.fees.refundMax", {
                      amount: formatEGP(refundOriginal, { decimals: true }),
                    })}
              </p>
            </div>

            <div>
              <span className="mb-1 block text-[13px] font-medium text-[var(--ink)]">
                {t("adminManage.fees.refundChannel")}
              </span>
              {/* Three plain buttons rather than a dropdown: the operator is
                  counter staff and the choice decides where real money goes,
                  so it is shown in full rather than hidden behind a control
                  that has to be opened to be read. */}
              <div className="flex flex-wrap gap-2">
                {OFFERED_REFUND_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setRefundChannel(ch)}
                    aria-pressed={refundChannel === ch}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-3 py-2 text-[13px] font-medium transition-colors",
                      refundChannel === ch
                        ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                        : "border-[var(--rule)] bg-[var(--field)] text-[var(--ink)] hover:border-[var(--ink-3)]",
                    )}
                  >
                    {t(`adminManage.fees.refundChannel_${ch}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-[var(--ink-3)]">
                {t(`adminManage.fees.refundChannelHint_${refundChannel}`)}
              </p>
            </div>

            <div>
              <label
                htmlFor="refund-reason"
                className="mb-1 block text-[13px] font-medium text-[var(--ink)]"
              >
                {t("adminManage.fees.refundReason")}
              </label>
              <Input
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t("adminManage.fees.refundReasonPlaceholder")}
              />
            </div>

            <FinalityNotice>{t("adminManage.fees.refundFinality")}</FinalityNotice>

            <TwoStepCommit
              resetKey={`${refundRow?.id ?? ""}:${refundEgp}:${refundReason}:${refundChannel}`}
              icon={<Undo2 className="size-4" />}
              label={t("adminManage.fees.refundArm", {
                amount: formatEGP(refundPiasters, { decimals: true }),
              })}
              armedLabel={t("adminManage.fees.refundConfirmFinal")}
              busy={refundBusy}
              disabled={refundPiasters <= 0 || refundExceeds || !refundReason.trim()}
              onCommit={handleRefund}
            />
          </div>
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
          <QuerySection query={paymentsQuery} skeleton={<PageSpinner />}>
            <DataTable
              columns={columns}
              data={payments}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={Receipt}
                  title={t("activation.empty.payments.title")}
                  description={t("activation.empty.payments.body")}
                  action={
                    <Button
                      onClick={() => {
                        track(ANALYTICS_EVENTS.EMPTY_STATE_CTA_CLICKED, { list: "payments" });
                        setIsFormOpen(true);
                      }}
                    >
                      {t("activation.empty.payments.cta")}
                    </Button>
                  }
                />
              }
            />
          </QuerySection>
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
                <select
                  aria-label={t("adminManage.fees.session")}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={subSessionId}
                  onChange={(e) => setSubSessionId(e.target.value)}
                >
                  <option value="">{t("adminManage.fees.selectSession")}</option>
                  {((subSessionsResult?.data ?? []) as any[])
                    .filter((s) => s.status === "scheduled")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatDate(s.date)} {formatClockRange(s.startTime, s.endTime)}
                      </option>
                    ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={subMarkAttendance}
                    onChange={(e) => setSubMarkAttendance(e.target.checked)}
                  />
                  {t("adminManage.fees.markAttendanceNow")}
                </label>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("adminManage.fees.subCashHint")}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleRecordSubscription}
              disabled={subBusy}
            >
              {subBusy ? <Spinner /> : null}
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
              noValidate
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
                        step="0.01"
                        inputMode="decimal"
                        dir="ltr"
                        className="num"
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

              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shared.checkin.methodLabel")}</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup">
                        {(["cash", "instapay", "pos_card", "mobile_wallet"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={field.value === m}
                            onClick={() => field.onChange(m)}
                            className={cn(
                              "h-10 rounded-lg border text-[13px] font-medium transition-colors",
                              field.value === m
                                ? "border-(--ink) bg-(--ink) text-(--paper)"
                                : "border-(--rule) bg-(--sheet) text-(--ink-2)",
                            )}
                          >
                            {t(
                              m === "cash"
                                ? "shared.checkin.methodCash"
                                : m === "instapay"
                                  ? "shared.checkin.methodInstapay"
                                  : m === "pos_card"
                                    ? "shared.checkin.methodPosCard"
                                    : "shared.checkin.methodMobileWallet",
                            )}
                          </button>
                        ))}
                      </div>
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
                <Button type="submit" disabled={paymentBusy}>
                  {paymentBusy ? <Spinner /> : null}
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
