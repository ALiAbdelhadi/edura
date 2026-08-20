"use client";

import {
  CenterWizard,
  type CenterState,
} from "@/features/onboarding/center-wizard";
import {
  StudentWizard,
  type StudentState,
} from "@/features/onboarding/student-wizard";
import {
  TeacherWizard,
  type TeacherState,
} from "@/features/onboarding/teacher-wizard";
import type { CatalogSystem } from "@/features/onboarding/types";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  LedgerButton,
  Sheet,
  ledgerMono,
  ledgerScope,
  ledgerShellScope,
} from "@/components/ledger";

export type OnboardingTokenState = "ok" | "expired" | "invalid" | "mismatch";

export type WizardRole = "student" | "teacher" | "center_admin";

/**
 * What is left of this screen once the routing left it.
 *
 * It used to open with three sequential fetches — `/api/v1/me`, then
 * `/api/v1/me/onboarding`, then the token check — under a skeleton, and only
 * then mount a wizard that fetched the catalog tree and the SAME onboarding
 * state again. All of that is resolved in one server pass now (see page.tsx),
 * so this component starts already knowing who it is drawing for and paints the
 * wizard filled on first render.
 *
 * What genuinely belongs on the client stays: the expired/invalid link notice
 * is a decision the reader makes (continue anyway, or resend), and resending is
 * an action, not a load.
 */
export default function OnboardingClient({
  role,
  tokenState,
  tree,
  state,
}: {
  role: WizardRole;
  tokenState: OnboardingTokenState;
  tree: CatalogSystem[];
  state: unknown;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");

  const resend = async () => {
    setResendState("sending");
    try {
      const res = await fetch("/api/v1/me/onboarding-email", {
        method: "POST",
      });
      const data = res.ok ? (await res.json()).data : null;
      setResendState(data?.sent ? "sent" : "failed");
    } catch {
      setResendState("failed");
    }
  };

  // `mismatch` deliberately does NOT block: the link was signed for a different
  // student, but this one is signed in and entitled to onboard.
  if (!dismissed && (tokenState === "expired" || tokenState === "invalid")) {
    return (
      <OnboardingTokenNotice
        state={tokenState}
        resendState={resendState}
        onResend={resend}
        onContinue={() => setDismissed(true)}
      />
    );
  }

  if (role === "student") {
    return <StudentWizard initial={{ tree, state: state as StudentState }} />;
  }
  if (role === "teacher") {
    return <TeacherWizard initial={{ tree, state: state as TeacherState }} />;
  }
  return <CenterWizard initial={{ tree, state: state as CenterState }} />;
}

function OnboardingTokenNotice({
  state,
  resendState,
  onResend,
  onContinue,
}: {
  state: "expired" | "invalid";
  resendState: "idle" | "sending" | "sent" | "failed";
  onResend: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations();
  return (
    /* The same two scopes the wizard itself carries — this notice is the first
       thing some readers ever see of the product, and it used to render with
       raw inline colours and no focus ring. */
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} ${ledgerScope} min-h-dvh`}
      style={{ background: "var(--paper)" }}
    >
      <div className="mx-auto max-w-md px-4 py-16">
        <Sheet className="p-6">
          <h1 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
            {state === "expired"
              ? t("auth.onboardingLinkExpiredTitle")
              : t("auth.onboardingLinkInvalidTitle")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("auth.onboardingLinkHint")}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {/* Continuing is the path forward and reads as primary; resending
                is the fallback. The old screen gave them near-equal weight. */}
            <LedgerButton variant="primary" className="min-h-11 w-full" onClick={onContinue}>
              {t("auth.onboardingContinueCta")}
            </LedgerButton>
            <LedgerButton
              className="min-h-11 w-full"
              onClick={onResend}
              disabled={resendState === "sending" || resendState === "sent"}
            >
              {resendState === "sending"
                ? t("auth.onboardingResendSending")
                : resendState === "sent"
                  ? t("auth.onboardingResendSent")
                  : t("auth.onboardingResendCta")}
            </LedgerButton>
            {resendState === "failed" ? (
              <p className="text-xs" style={{ color: "var(--red)" }} role="status">
                {t("auth.onboardingResendFailed")}
              </p>
            ) : null}
          </div>
        </Sheet>
      </div>
    </div>
  );
}
