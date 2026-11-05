"use client";

import { useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Wallet } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import { Chip, Hairline, LedgerButton, Num } from "@/features/student/ledger";
import { newIdempotencyKey } from "@/features/student/idempotency";
import { goToCheckout } from "@/lib/payments/checkout-redirect";
import { useOnlineCheckout } from "@/lib/payments/use-online-checkout";
import { Spinner } from "@/components/kit/spinner";
import { WALLET_ENABLED } from "@/lib/config/features";
import { useFormatters } from "@/lib/i18n/use-formatters";

export type SubscribableCourse = {
  id: string;
  price: number | null;
  pricePerMonth: number | null;
  pricePerSession: number | null;
  upcomingSessions?: { id: string; date: string; startTime: string; endTime: string }[];
};

// The one place a student turns a course into money. Both discovery surfaces
// (My Subjects and Find a teacher) render this, so neither can grow its own
// checkout: same endpoints, same idempotency key shape, same wallet rule.
export function CourseSubscribeActions({
  course,
  onChanged,
}: {
  course: SubscribableCourse;
  onChanged?: () => void;
}) {
  const t = useTranslations();
  const { formatEGP, formatDate, formatClock } = useFormatters();
  const { mutateAsync: call } = useCustomMutation();
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [mockIntent, setMockIntent] = useState<{ intentId: string; amount: number } | null>(null);
  const [mockBusy, setMockBusy] = useState(false);
  const onlineCheckout = useOnlineCheckout();

  // Deliberately NOT gated on useOnlineCheckout: wallet money is already on the
  // platform, so spending it needs no gateway.
  const { query: walletQuery, result: walletRes } = useCustom({
    url: "me/wallet",
    method: "get",
    queryOptions: { enabled: WALLET_ENABLED },
  });
  const walletBalance =
    typeof (walletRes?.data as { balance?: number } | undefined)?.balance === "number"
      ? (walletRes!.data as { balance: number }).balance
      : null;
  const canOfferWallet = WALLET_ENABLED && walletBalance !== null && walletBalance > 0;
  const affords = (price: number | null) =>
    walletBalance !== null && price !== null && walletBalance >= price;

  const requestEnrollment = async () => {
    setBusy(true);
    try {
      await call({ url: "enrollment-requests", method: "post", values: { courseId: course.id } });
      toast.success(t("studentBrowse.enrollmentSent"));
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || t("studentBrowse.enrollmentFailed"));
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async (
    plan: "monthly" | "per_session",
    payFrom: "gateway" | "wallet" = "gateway",
  ) => {
    setBusy(true);
    try {
      if (plan === "per_session" && !sessionId) {
        toast.error(t("studentSubjects.pickSessionFirst"));
        return;
      }
      const res = await call({
        url: "subscriptions/checkout",
        method: "post",
        values: {
          courseId: course.id,
          plan,
          ...(plan === "per_session" ? { sessionId } : {}),
          method: "card",
          payFrom,
          idempotencyKey: newIdempotencyKey(`sub-${course.id}-${plan}-${payFrom}`),
        },
      });
      // The wallet branch settles server-side and returns no checkout to follow.
      if (payFrom === "wallet") {
        toast.success(t("studentSubjects.paidFromBalance"));
        onChanged?.();
        walletQuery.refetch();
        return;
      }
      const intent = (res as any)?.data?.data ?? (res as any)?.data;
      if (intent?.checkout?.url?.includes("mock-checkout")) {
        setMockIntent({ intentId: intent.id, amount: intent.amount });
      } else if (intent?.checkout?.url) {
        goToCheckout(intent.checkout.url);
      }
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setBusy(false);
    }
  };

  const completeMockPayment = async (outcome: "success" | "failure") => {
    if (!mockIntent || mockBusy) return;
    setMockBusy(true);
    try {
      await call({
        url: `payments/intents/${mockIntent.intentId}/mock-complete`,
        method: "post",
        values: { outcome },
      });
      if (outcome === "success") toast.success(t("studentSubjects.subscriptionActive"));
      else toast.error(t("studentSubjects.paymentDeclined"));
    } catch (err: any) {
      toast.error(err?.message || t("studentSubjects.checkoutFailed"));
    } finally {
      setMockBusy(false);
      setMockIntent(null);
      onChanged?.();
    }
  };

  const hasPlan = !!(course.pricePerMonth || course.pricePerSession);

  if (!hasPlan) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <Num style={{ color: "var(--ink)", fontWeight: 600 }}>{formatEGP(course.price ?? 0)}</Num>
        <LedgerButton variant="primary" disabled={busy} onClick={requestEnrollment}>
          {busy ? <Spinner /> : null}
          {t("studentBrowse.requestEnrollment")}
        </LedgerButton>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
      {course.pricePerMonth ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {onlineCheckout ? (
            <LedgerButton variant="primary" disabled={busy} onClick={() => subscribe("monthly")}>
              {busy ? <Spinner /> : null}
              {t("studentSubjects.subscribeMonthly")}
              <Num>{formatEGP(course.pricePerMonth)}</Num>
            </LedgerButton>
          ) : null}
          {canOfferWallet ? (
            <LedgerButton
              variant={onlineCheckout ? undefined : "primary"}
              disabled={busy || !affords(course.pricePerMonth)}
              onClick={() => subscribe("monthly", "wallet")}
            >
              <Wallet className="size-4" aria-hidden />
              {t("studentSubjects.payFromBalance")}
              <Num>{formatEGP(course.pricePerMonth)}</Num>
            </LedgerButton>
          ) : null}
        </div>
      ) : null}

      {course.pricePerSession ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger size="sm" className="text-xs" aria-label={t("studentSubjects.pickSession")}>
              <SelectValue placeholder={t("studentSubjects.pickSession")} />
            </SelectTrigger>
            <SelectContent>
              {(course.upcomingSessions ?? []).map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {formatDate(session.date, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                  {formatClock(session.startTime)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {onlineCheckout ? (
            <LedgerButton disabled={busy} onClick={() => subscribe("per_session")}>
              {t("studentSubjects.bookSession")}
              <Num>{formatEGP(course.pricePerSession)}</Num>
            </LedgerButton>
          ) : null}
          {canOfferWallet ? (
            <LedgerButton
              variant={onlineCheckout ? undefined : "primary"}
              disabled={busy || !affords(course.pricePerSession)}
              onClick={() => subscribe("per_session", "wallet")}
            >
              <Wallet className="size-4" aria-hidden />
              {t("studentSubjects.payFromBalance")}
              <Num>{formatEGP(course.pricePerSession)}</Num>
            </LedgerButton>
          ) : null}
        </div>
      ) : null}

      {canOfferWallet ? (
        <p
          className="m-0 text-[12px] leading-relaxed sm:text-end"
          style={{
            color:
              affords(course.pricePerMonth) || affords(course.pricePerSession)
                ? "var(--ink-3)"
                : "var(--red)",
          }}
        >
          {affords(course.pricePerMonth) || affords(course.pricePerSession)
            ? t("studentSubjects.balanceAvailable", { amount: formatEGP(walletBalance ?? 0) })
            : t("studentSubjects.insufficientBalance", { amount: formatEGP(walletBalance ?? 0) })}
        </p>
      ) : null}

      {!onlineCheckout &&
      !affords(course.pricePerMonth) &&
      !affords(course.pricePerSession) ? (
        <p className="m-0 max-w-48 text-[12.5px] leading-relaxed text-ink-2 sm:text-end">
          {t("studentSubjects.subscribeAtCenter")}
        </p>
      ) : null}

      {mockIntent ? (
        <div className="w-full">
          <Hairline />
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Chip tone="amber">{t("studentSubjects.mockCheckoutTitle")}</Chip>
              <Num style={{ color: "var(--ink)", fontWeight: 600 }}>
                {formatEGP(mockIntent.amount)}
              </Num>
              <span style={{ color: "var(--ink-3)" }}>{t("studentSubjects.mockCheckoutHint")}</span>
            </div>
            <div className="flex gap-2">
              <LedgerButton
                variant="primary"
                disabled={mockBusy}
                onClick={() => completeMockPayment("success")}
              >
                {t("studentSubjects.mockPay")}
              </LedgerButton>
              <LedgerButton
                variant="danger"
                disabled={mockBusy}
                onClick={() => completeMockPayment("failure")}
              >
                {t("studentSubjects.mockFail")}
              </LedgerButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
