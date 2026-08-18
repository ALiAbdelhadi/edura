"use client";

import { CenterWizard } from "@/features/onboarding/center-wizard";
import { StudentWizard } from "@/features/onboarding/student-wizard";
import { TeacherWizard } from "@/features/onboarding/teacher-wizard";
import { useRouter } from "@/i18n/navigation";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const DASHBOARD_BY_ROLE: Record<string, string> = {
  student: "/dashboard/student",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
  center_admin: "/dashboard/admin",
};

type TokenState = "checking" | "ok" | "expired" | "invalid" | "mismatch";

export default function OnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const editMode = params.get("edit") === "1";
  const emailToken = params.get("token");
  const [role, setRole] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<TokenState>(emailToken ? "checking" : "ok");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/v1/me");
        if (meRes.status === 401) {
          const here = `${window.location.pathname}${window.location.search}`;
          return router.replace(`/login?next=${encodeURIComponent(here)}`);
        }
        const me = (await meRes.json()).data;
        if (me.role !== "student" && me.role !== "teacher" && me.role !== "center_admin")
          return router.replace(DASHBOARD_BY_ROLE[me.role] ?? "/dashboard/student");

        const obRes = await fetch("/api/v1/me/onboarding");
        const ob = (await obRes.json()).data;
        if (ob?.onboardingCompleted && !editMode)
          return router.replace(DASHBOARD_BY_ROLE[me.role] ?? "/");

        if (emailToken) {
          const tokRes = await fetch(
            `/api/v1/me/onboarding-email?token=${encodeURIComponent(emailToken)}`,
          );
          const tok = (await tokRes.json()).data;
          if (!cancelled) setTokenState((tok?.status as TokenState) ?? "invalid");
        }

        if (!cancelled) setRole(me.role);
      } catch {
        if (!cancelled) router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, editMode, emailToken]);

  const resend = async () => {
    setResendState("sending");
    try {
      const res = await fetch("/api/v1/me/onboarding-email", { method: "POST" });
      const data = res.ok ? (await res.json()).data : null;
      setResendState(data?.sent ? "sent" : "failed");
    } catch {
      setResendState("failed");
    }
  };

  if (role && emailToken && (tokenState === "expired" || tokenState === "invalid")) {
    return (
      <OnboardingTokenNotice
        state={tokenState}
        resendState={resendState}
        onResend={resend}
        onContinue={() => setTokenState("ok")}
      />
    );
  }

  if (role === "student") return <StudentWizard />;
  if (role === "teacher") return <TeacherWizard />;
  if (role === "center_admin") return <CenterWizard />;
  return (
    <div className="mx-auto grid max-w-2xl gap-4 px-4 py-16">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
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
    <div className="mx-auto max-w-md px-4 py-16">
      <div
        className="rounded-xl p-6"
        style={{ background: "var(--sheet)", border: "1px solid var(--rule)" }}
      >
        <h1 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
          {state === "expired"
            ? t("auth.onboardingLinkExpiredTitle")
            : t("auth.onboardingLinkInvalidTitle")}
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("auth.onboardingLinkHint")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg px-4 py-2 text-sm font-bold"
            style={{ background: "var(--indigo)", color: "var(--paper)" }}
          >
            {t("auth.onboardingContinueCta")}
          </button>
          <button
            type="button"
            onClick={onResend}
            disabled={resendState === "sending" || resendState === "sent"}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ color: "var(--indigo)", border: "1px solid var(--indigo)" }}
          >
            {resendState === "sending"
              ? t("auth.onboardingResendSending")
              : resendState === "sent"
                ? t("auth.onboardingResendSent")
                : t("auth.onboardingResendCta")}
          </button>
          {resendState === "failed" ? (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {t("auth.onboardingResendFailed")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
