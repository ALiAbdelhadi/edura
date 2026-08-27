"use client";

import { api } from "@/lib/api/client";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { postMoney, readApiError } from "../ledger";

export type CheckinTarget = {
  studentId: string;
  sessionId: string;
  courseId: string;
  courseTitle: string;
  pricePerSession: number | null;
  covered: boolean;
};

export const COUNTER_METHODS = ["cash", "instapay", "pos_card", "mobile_wallet"] as const;
export type CounterMethod = (typeof COUNTER_METHODS)[number];

export type PaymentPrompt = {
  studentId: string;
  sessionId: string;
  courseId: string;
  courseTitle: string;
  pricePerSession: number | null;
};

export function useCheckinCommit(opts: {
  refresh: (studentId: string) => void | Promise<void>;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentPrompt | null>(null);

  const clearPayment = () => setPayment(null);
  const commitCheckin = async (target: CheckinTarget) => {
    const data = await postMoney<{ status?: string }>("center/checkin", {
      studentId: target.studentId,
      sessionId: target.sessionId,
    });
    toast.success(
      data?.status === "present"
        ? t("shared.checkin.present")
        : t("shared.checkin.counterDone"),
    );
    clearPayment();
    await opts.refresh(target.studentId);
  };

  const startCheckin = async (target: CheckinTarget) => {
    if (!target.covered) {
      setPayment({
        studentId: target.studentId,
        sessionId: target.sessionId,
        courseId: target.courseId,
        courseTitle: target.courseTitle,
        pricePerSession: target.pricePerSession,
      });
      return;
    }
    setBusy(true);
    try {
      await commitCheckin(target);
    } catch (err) {
      const e = await readApiError(err);
      if (e.code === "needs_payment") {
        const dt = e.details ?? {};
        setPayment({
          studentId: target.studentId,
          sessionId: target.sessionId,
          courseId: target.courseId,
          courseTitle: (dt.courseTitle as string | undefined) ?? target.courseTitle,
          pricePerSession:
            (dt.pricePerSession as number | null | undefined) ?? target.pricePerSession,
        });
      } else {
        toast.error(e.message || t("shared.checkin.checkinFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const coverageLanded = async (studentId: string, sessionId: string) => {
    try {
      const res = await api
        .get(`center/checkin/suggest?studentId=${studentId}`)
        .json<{
          data: {
            suggested: { sessionId: string; covered: boolean }[];
            today: { sessionId: string; covered: boolean }[];
          };
        }>();
      return [...res.data.suggested, ...res.data.today].some(
        (x) => x.sessionId === sessionId && x.covered,
      );
    } catch {
      return false;
    }
  };

  const collectAndCheckin = async (target: CheckinTarget, method: CounterMethod = "cash") => {
    setBusy(true);
    let charged = false;
    try {
      try {
        await postMoney("center/subscriptions", {
          studentId: target.studentId,
          courseId: target.courseId,
          plan: "per_session",
          sessionId: target.sessionId,
          markAttendance: false,
          paymentMethod: method,
        });
        charged = true;
      } catch (chargeErr) {
        if (await coverageLanded(target.studentId, target.sessionId)) {
          charged = true;
        } else {
          const e = await readApiError(chargeErr);
          toast.error(e.message || t("shared.checkin.cashFailed"));
          return;
        }
      }

      toast.success(t("shared.checkin.paymentCollected"));
      await commitCheckin(target);
    } catch (err) {
      const e = await readApiError(err);
      if (charged) {
        toast.error(t("shared.checkin.paidNotCheckedIn"), { duration: 12000 });
        clearPayment();
        await opts.refresh(target.studentId);
      } else {
        toast.error(e.message || t("shared.checkin.checkinFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return { busy, payment, clearPayment, startCheckin, collectAndCheckin };
}
