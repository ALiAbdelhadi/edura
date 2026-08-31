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
import { api } from "@/lib/api/client";
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
      const res = await api
        .post("me/onboarding-email")
        .json<{ data?: { sent?: boolean } }>();
      setResendState(res.data?.sent ? "sent" : "failed");
    } catch {
      setResendState("failed");
    }
  };

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
