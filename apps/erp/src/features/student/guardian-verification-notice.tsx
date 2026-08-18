"use client";

import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { LedgerButton, Sheet } from "@/features/student/ledger";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { MailCheck, ShieldCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

type State = {
  hasGuardianEmail: boolean;
  guardianEmailHint: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

/**
 * The COMPLEMENT of GuardianContactNotice, never a second copy of it.
 *
 * That one fires when there is no guardian email at all and says a capability
 * is switched off. This one fires when an address IS on file but nobody has
 * proven it reaches them. The two states are mutually exclusive, so a student
 * never sees both banners arguing about the same subject.
 *
 * IT DOES NOT CLAIM A LOCK, because there isn't one. The messaging gate still
 * opens on the address being present (that flip is a separate, deliberate
 * decision), and a banner that threatened a consequence which does not exist
 * would be the kind of lie that teaches people to ignore banners. It says what
 * is true: this is a safety step, and today it changes nothing about the
 * account.
 *
 * Dismissable, and quiet once confirmed — a permanent green tick is clutter.
 */
export function GuardianVerificationNotice({ studentId }: { studentId?: string }) {
  const t = useTranslations();
  const [state, setState] = useState<State | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("me/guardian-verification").json<{ data: State }>();
      setState(res.data);
    } catch {
      // A role with no guardian concept, or no profile yet: show nothing. This
      // banner must never break the page it sits on.
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = async () => {
    setSending(true);
    try {
      const res = await api
        .post("me/guardian-verification", { json: {} })
        .json<{ data: { guardianEmailHint: string } }>();
      toast.success(t("guardian.verifySent", { email: res.data.guardianEmailHint }));
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message ?? t("guardian.verifyFailed"),
      );
    } finally {
      setSending(false);
    }
  };

  // Only the pending state has anything to say. No email → the other banner
  // owns that case. Verified → nothing to ask for.
  if (!state?.hasGuardianEmail || state.verified) return null;
  // Someone else's child: a parent viewing a linked student cannot resend on
  // their behalf from here, so the banner would be a dead end.
  if (studentId) return null;
  if (dismissed) return null;

  return (
    <Sheet className="p-5">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0" style={{ color: "var(--amber)" }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("guardian.verifyPendingTitle")}
          </p>
          <p className="max-w-[68ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("guardian.verifyPendingBody", { email: state.guardianEmailHint ?? "" })}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {t("guardian.verifyNoop")}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <LedgerButton type="button" variant="primary" onClick={resend} disabled={sending}>
              {sending ? (
                <>
                  <Spinner className="size-4" /> {t("guardian.verifySending")}
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> {t("guardian.verifyResend")}
                </>
              )}
            </LedgerButton>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="dismiss"
          onClick={() => setDismissed(true)}
        >
          <X className="size-4" />
        </Button>
      </div>
    </Sheet>
  );
}
