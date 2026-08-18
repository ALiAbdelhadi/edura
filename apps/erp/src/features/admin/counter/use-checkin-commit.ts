"use client";

import { api } from "@/lib/api/client";
import { toast } from "@repo/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { postMoney, readApiError } from "../ledger";

/**
 * TAKE THE CASH, THEN MARK THE ATTENDANCE — once, for every counter surface.
 *
 * This is `admin-checkin-screen`'s commit flow lifted out unchanged, because a
 * second surface now performs the same act from a different starting point (the
 * board starts at a LESSON and finds the student; the check-in screen starts at
 * a STUDENT and finds the lesson). Two copies of a two-call money sequence is
 * how the two ends drift, and the comments below are the reasons the sequence
 * is shaped the way it is — they have to travel with it.
 *
 * The caller supplies `refresh`: whatever re-reads coverage on ITS screen after
 * a commit lands. That is the only thing that differs between the two.
 */

export type CheckinTarget = {
  studentId: string;
  sessionId: string;
  courseId: string;
  courseTitle: string;
  pricePerSession: number | null;
  /** The screen's last-known coverage. Stale is fine — the server decides. */
  covered: boolean;
};

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
  // The payment step is part of the check-in flow, not a separate screen: it
  // attaches to the one row it belongs to and carries the server's price.
  const [payment, setPayment] = useState<PaymentPrompt | null>(null);

  const clearPayment = () => setPayment(null);

  /** Posts the check-in and reports the resulting stage. Shared by both entries
   *  into the flow — the direct one and the one that follows cash collection. */
  const commitCheckin = async (target: CheckinTarget) => {
    // Long timeout too: this is the second half of a money commit, and giving
    // up early here is what strands a paid student without attendance.
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

  /**
   * Entry to the flow. An uncovered student is not an error — it is the next
   * step, so it never surfaces as a red toast. Where the screen's own state
   * already says the session is uncovered we go straight to collection instead
   * of firing a request we know will 402; where that answer is stale, the
   * server's `needs_payment` lands on the same step. One flow, two doors.
   */
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

  /**
   * Did the cash actually land? Re-reads coverage from the server.
   *
   * The client cannot tell a failed write from a lost response. `api` times out
   * at 10s (lib/api/client.ts) and the subscriptions transaction writes Payment
   * + Transaction + points + notification — so a slow counter connection can
   * time the CLIENT out while the SERVER commits. Coverage is the server's own
   * answer to "was this paid for", so ask it rather than guessing.
   */
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

  /**
   * The armed commit: take the cash, then check in, without leaving the row.
   *
   * These are deliberately TWO server calls. The subscriptions endpoint can do
   * both atomically via `markAttendance: true`, but that path predates Step 6 —
   * it writes `status: "present"` unconditionally with no `counterAt`, so it
   * would mark a student present even under `counter_and_door` (where the
   * counter alone must NOT count as present) and would leave the later door
   * check-in rejecting with `no_counter`. Correct staging is worth the split.
   *
   * What the split costs is atomicity, so the gap is closed here: if the charge
   * appears to fail we re-read coverage before saying so, and if the charge
   * landed but the check-in did not, we say THAT — never something that reads
   * as "nothing happened", which is what invites a second charge.
   */
  const collectAndCheckin = async (target: CheckinTarget) => {
    setBusy(true);
    let charged = false;
    try {
      try {
        await postMoney("center/subscriptions", {
          studentId: target.studentId,
          courseId: target.courseId,
          plan: "per_session",
          sessionId: target.sessionId,
          // Staged check-in happens in the next call — see the note above.
          markAttendance: false,
        });
        charged = true;
      } catch (chargeErr) {
        // Self-heal: the write may have committed while the client gave up.
        if (await coverageLanded(target.studentId, target.sessionId)) {
          charged = true;
        } else {
          const e = await readApiError(chargeErr);
          toast.error(e.message || t("shared.checkin.cashFailed"));
          return;
        }
      }

      toast.success(t("shared.checkin.cashCollected"));
      await commitCheckin(target);
    } catch (err) {
      const e = await readApiError(err);
      if (charged) {
        // The money is in the ledger and the student is covered; only the
        // attendance mark is missing. Say so explicitly and leave the row on
        // its now-covered "check in" action — collecting again would
        // double-charge a family standing at the counter.
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
