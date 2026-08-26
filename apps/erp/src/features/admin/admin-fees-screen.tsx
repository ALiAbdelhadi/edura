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
import { useMemo, useState } from "react";
import { useParamSeed } from "@/lib/api/use-param-seed";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Amount, Badge, Computation, DateText, Eyebrow, FinalityNotice, Num, PageHead, Sheet, SheetHead, TwoStepCommit, postMoney, readApiError } from "./ledger";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { ReceiptLink } from "@/features/receipts/receipt-link";
import { asArray } from "@/lib/refine/as-array";

/**
 * The direction of a payment row, read off the figure itself.
 *
 * `payments` has no `type` column — the schema stores the direction in the SIGN
 * of `amount` ("positive=payment, negative=refund"). Every reader here used to
 * compare against a `record.type` that does not exist, so a refund rendered as
 * a teal "Receipt" carrying a negative number.
 */
function isRefundRow(record: { amount?: number | null }): boolean {
  return Number(record?.amount ?? 0) < 0;
}

export function AdminFeesScreen() {
  const t = useTranslations();
  const { formatEGP, formatShortEGP, formatDate, formatClockRange, locale } =
    useFormatters();
  // One <DateRangeField> replaces the pair of raw `<input type="date">` plus the
  // separate reset button, and the three pieces of state they needed (two draft
  // strings kept in sync with a dayjs tuple). The field speaks YYYY-MM-DD, which
  // is already the query's language, so nothing is converted here at all.
  const [range, setRange] = useState<DateKeyRange>(EMPTY_RANGE);
  // Arrived from «اتحصّل النهاردة» on the home: land on the SAME rows that
  // figure summed, rather than on the whole log with the day still to pick.
  // A total you cannot open is a claim; a total whose rows you can read is a
  // record. Seeds once and then leaves the operator's own edits alone — see
  // `useParamSeed`.
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

  // Center wallet + withdraw (Step 4.5).
  const { query: walletQuery, result: walletRes } = useCustom({ url: "center/wallet", method: "get" });
  // Phase 4 (D4): the center<->platform credit position.
  const { query: creditQuery, result: creditRes } = useCustom({ url: "center/credit", method: "get" });
  const { query: centerPayoutsQuery, result: centerPayoutsRes } = useCustom({ url: "center/wallet/payouts", method: "get" });
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawEgp, setWithdrawEgp] = useState("");

  const centerCredit = ((creditRes as { data?: unknown })?.data ?? null) as
    | { creditBalance: number; entries: { id: string; type: string; delta: number; balanceAfter: number; reason: string | null; createdAt: string }[] }
    | null;
  const [creditTopupEgp, setCreditTopupEgp] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);
  const [creditMockIntent, setCreditMockIntent] = useState<{ intentId: string; amount: number } | null>(null);
  // MVP blocker #2: the top-up CONTROLS are absent when online checkout
  // cannot settle; the balance, arrears hint and ledger always render.
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

  /**
   * What the armed button will actually request, in piasters. An empty field
   * means "everything available" — so the button says that figure rather than
   * leaving the operator to infer it.
   */
  const withdrawPiasters = useMemo(() => {
    const raw = withdrawEgp.trim();
    if (raw === "") return centerWallet?.available ?? 0;
    const egp = Number(raw);
    return Number.isFinite(egp) && egp > 0 ? Math.round(egp * 100) : 0;
  }, [withdrawEgp, centerWallet?.available]);

  const [withdrawBusy, setWithdrawBusy] = useState(false);

  /**
   * Deliberately a raw `postMoney` rather than refine's `useCreate`.
   *
   * Two reasons, both about this being an irreversible ledger write:
   *  - refine routes through the shared data provider, which cannot carry a
   *    per-request timeout, so this would keep the 10s default. A payout request
   *    reserves money; the client giving up while the server commits is the
   *    worst failure mode this screen has.
   *  - the data provider also flattens the error envelope, discarding `code`,
   *    so a business-rule refusal arrives as ky's generic English string.
   */
  const handleWithdraw = async () => {
    const egp = withdrawEgp.trim() === "" ? null : Number(withdrawEgp);
    if (egp !== null && (!Number.isFinite(egp) || egp <= 0)) {
      toast.error(t("adminManage.fees.walletInvalidAmount"));
      return;
    }
    setWithdrawBusy(true);
    try {
      await postMoney(
        "center/wallet/payout-request",
        egp === null ? {} : { amount: Math.round(egp * 100) },
      );
      setIsWithdrawOpen(false);
      setWithdrawEgp("");
      toast.success(t("adminManage.fees.walletRequestSubmitted"));
      walletQuery.refetch();
      centerPayoutsQuery.refetch();
    } catch (err) {
      const e = await readApiError(err);
      if (e.indeterminate) {
        // No answer from the server — the request MAY have been recorded. Never
        // say "failed" here; a second armed press would reserve the money twice.
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

  const [subBusy, setSubBusy] = useState(false);

  /**
   * Cash subscription at the counter — a ledger write, so it goes through
   * `postMoney` for the same two reasons as the payout: the 45s timeout, and an
   * error envelope that survives to the operator instead of being flattened.
   *
   * This is the heaviest write on the screen (Payment + Transaction + points +
   * notification, and optionally an attendance mark), which makes it the most
   * likely of the three to breach the shared 10s default.
   */
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
        // No answer — the charge may have committed. Send the operator to the
        // payment log rather than letting them record the same cash twice.
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
        // Phase 1: how the desk took the money. Cash preselected.
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

  // ---------------------------------------------------------------------
  // REFUND — the correction this screen documented but never offered.
  //
  // The whole path already existed on the server: `payments.amount` is SIGNED
  // by design ("positive=payment, negative=refund" in the schema), the route's
  // body schema is `signedMoneySchema`, and `recordPayment` mirrors a negative
  // amount into the ledger as `type: "refund"` with the parties reversed, skips
  // the points award, and notifies the family with "Refund recorded". Every
  // piece was reachable except a button: this client refused any amount `<= 0`,
  // so a center could collect and then had no way to correct its own
  // collection — the log rendered refunds it could not produce.
  //
  // The boundary this adds is deliberately narrow:
  //   - it opens FROM a specific receipt, never as a free-floating negative;
  //   - the amount is capped at that receipt's own value, and the commit is
  //     BLOCKED rather than silently clamped when it exceeds it;
  //   - a reason is required and is written into the ledger row's note along
  //     with the original receipt number;
  //   - it is the same two-step, amount-carrying commit as every other write
  //     here, through the same `postMoney` wrapper (so a dropped connection
  //     reports "check before repeating" instead of inviting a second refund).
  //
  // HONEST LIMIT: `payments` has no `reversal_of` column, so nothing at the
  // database level links a refund to its receipt or stops a second refund
  // against the same one. The cap here is a UI guard and the link lives in the
  // note. Making it an invariant is a migration, and a migration needs its own
  // approved plan.
  // ---------------------------------------------------------------------
  const [refundRow, setRefundRow] = useState<any | null>(null);
  const [refundEgp, setRefundEgp] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  const refundOriginal = Math.abs(Number(refundRow?.amount ?? 0));
  const refundPiasters = useMemo(() => {
    const egp = Number(refundEgp.trim());
    return Number.isFinite(egp) && egp > 0 ? Math.round(egp * 100) : 0;
  }, [refundEgp]);
  const refundExceeds = refundPiasters > refundOriginal;

  const openRefund = (row: any) => {
    setRefundRow(row);
    // Pre-filled with the full receipt, because refunding all of it is the
    // common case and re-typing a figure that is already on screen is how the
    // wrong figure gets typed.
    setRefundEgp((Math.abs(Number(row.amount ?? 0)) / 100).toFixed(2));
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
      await postMoney("payments", {
        studentId: refundRow.studentId,
        // `courseId` is deliberately NOT sent. `recordPayment` verifies an
        // ACTIVE enrolment whenever a course is named, and a refund is most
        // needed exactly when that is no longer true — a student who withdrew,
        // or was moved. A refund answers to a receipt, not to a roster.
        amount: -refundPiasters,
        note: `${t("adminManage.fees.refundNotePrefix", {
          receipt: refundRow.receiptNumber ?? "",
        })} — ${reason}`,
      });
      toast.success(t("adminManage.fees.refundDone"));
      closeRefund(false);
      paymentsQuery.refetch();
      reportsQuery.refetch();
      walletQuery.refetch();
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

  /** Manual payment entry — a ledger write, same treatment as the other two. */
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
      // The printable student code, not the internal UUID — the code is what
      // the receipt in the same row carries.
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
      // A row with no `courseId` has no class to name — a refund is one, and so
      // is any payment recorded against the student rather than a class. It read
      // "unknown course", which describes a lookup that failed rather than a
      // column that is legitimately empty.
      cell: ({ row }) =>
        row.original.courseName ||
        (row.original.courseId ? t("adminManage.fees.unknownCourse") : "—"),
    },
    {
      id: "amount",
      header: t("adminManage.fees.amount"),
      cell: ({ row }) => {
        const record = row.original;
        // A refund is money leaving the center — red, signed. A receipt is money
        // arriving — teal. The sign comes from the figure itself, not a prefix
        // glued onto a formatted string.
        //
        // It is read off the AMOUNT, not off a `type` field: `payments` has no
        // such column (the schema stores the direction in the sign), so the old
        // `record.type === "refund"` was never true and every refund rendered as
        // a teal "Receipt" — with a negative figure inside it.
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
          {/* The counter is where a receipt is most often ASKED for out loud. */}
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
        // Only a receipt can be refunded. A refund row offers nothing: refunding
        // a refund is a payment, and it would be recorded as one.
        isRefundRow(row.original) ? null : (
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
        {/* The P&L reads as one statement closing on the accountant's rule.
            Three disconnected stat cards made the operator do the subtraction. */}
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

        {/* أموال محتجزة — a real reconciliation, not three tiles. Balance minus
            what is already committed to pending payouts equals what can move. */}
        <Sheet>
          <SheetHead
            title={t("adminManage.fees.walletTitle")}
            action={
              <Button
                variant="outline"
                size="sm"
                className="border-[var(--rule)]"
                onClick={() => setIsWithdrawOpen(true)}
                disabled={(centerWallet?.available ?? 0) <= 0}
              >
                {t("adminManage.fees.walletWithdraw")}
              </Button>
            }
          />
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
                  {/* Status was rendered raw from the API — an untranslated
                      English enum in an Arabic-first screen. */}
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
        </Sheet>

        {/* Phase 4 (D4): the center<->platform CREDIT position. Separate from
            the wallet above on purpose — wallet_balance is platform-held money
            owed TO the center; this is the two-way position the settlement
            debits land on. Negative = arrears. */}
        <Sheet>
          <SheetHead title={t("adminManage.fees.creditTitle")} />
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

          {/* This is the decision panel: the whole computation before the
              commit, then a commit that names its own amount. It was a single
              click on a button labelled only "confirm" — an irreversible payout
              request against the center's wallet with no figure on the control
              and no statement of consequence. */}
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
              // Disarms if the operator edits the amount after arming — the
              // armed button must never carry a figure that is no longer true.
              resetKey={withdrawEgp}
              icon={<DollarSign className="size-4" />}
              // `decimals: true` matters: formatEGP rounds to whole pounds by
              // default, so a 13.33 balance produced a button reading "13 ج.م"
              // above a total reading "13.33 ج.م". The commit sent the correct
              // 1333 piasters either way, but a button that names a different
              // figure than the total it sits under defeats the whole point of
              // making the button carry its own amount.
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

      {/* REFUND — opened from one receipt, capped by that receipt, reasoned,
          and committed in the same two steps as every other write here. */}
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
              // Editing either the figure or the reason after arming disarms:
              // the armed button names an amount, and the note it will write is
              // part of the same commitment.
              resetKey={`${refundRow?.id ?? ""}:${refundEgp}:${refundReason}`}
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
          {paymentsQuery.isLoading ? (
            <PageSpinner />
          ) : (
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
            {/* `noValidate` — the zod schema is the only validator, so its
                Arabic messages appear under the field instead of the browser
                stopping the submit with an English bubble. */}
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
                        /* `step` is a validity rule, not a stepper size. At
                           `step={10}` the browser rejected every amount that
                           was not 10n + 0.01 — including this field's own
                           placeholder, 800 — and rejected it by refusing to
                           submit. */
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
                      {/* Phase 1: same four counter channels as the check-in
                          desk — big targets, one always selected. */}
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
