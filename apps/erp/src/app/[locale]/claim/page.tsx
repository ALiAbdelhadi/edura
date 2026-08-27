"use client";

import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { LedgerButton, ledgerTrackTight } from "@/components/ledger";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { toast } from "@repo/ui/components/sonner";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const LANDING: Record<string, string> = {
  student: "/onboarding",
  assistant: "/dashboard/assistant",
  center_staff: "/dashboard/staff",
  teacher: "/dashboard/teacher",
};

function ClaimInner() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<"authenticating" | "credentials" | "invalid">(
    token ? "authenticating" : "invalid",
  );
  const [role, setRole] = useState<string | null>(null);
  const [fixedEmail, setFixedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    (async () => {
      const { error: claimError } = await authClient.$fetch(
        "/invite-token/claim",
        { method: "POST", body: { token } },
      );
      if (!claimError) {
        const me = await fetch("/api/v1/me")
          .then((r) => r.json())
          .catch(() => null);
        const user = me?.data ?? null;
        setRole(user?.role ?? null);
        setFixedEmail(user?.email ?? null);
        if (user?.hasPassword) router.replace(LANDING[user.role] ?? "/dashboard");
        else setPhase("credentials");
      } else {
        setPhase("invalid");
      }
    })();
  }, [token, router]);

  const saveCredentials = async () => {
    if (!fixedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error(t("auth.emailInvalid"));
      return;
    }
    if (!/[A-Za-z]/.test(password)) {
      toast.error(t("auth.passwordNeedsLetter"));
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error(t("auth.passwordNeedsDigit"));
      return;
    }
    setBusy(true);
    try {
      await api.post("me/credentials", {
        json: fixedEmail ? { password } : { email: email.trim(), password },
      });
      toast.success(t("claim.credentialsSaved"));
      router.replace(LANDING[role ?? "student"] ?? "/dashboard");
    } catch (err: any) {
      toast.error(err?.message || t("claim.credentialsFailed"));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = password.length >= 8 && (!!fixedEmail || !!email.trim());

  return (
    <AuthCenteredShell>
      {phase === "authenticating" ? (
        <div className="flex items-center gap-3 py-4" style={{ color: "var(--ink-2)" }}>
          <Spinner />
          <span>{t("claim.authenticating")}</span>
        </div>
      ) : phase === "invalid" ? (
        <div className="space-y-2">
          <div
            className="flex size-11 items-center justify-center rounded-lg"
            style={{ background: "var(--red-soft)", color: "var(--red)" }}
          >
            <KeyRound className="size-5" aria-hidden />
          </div>
          <h1 className={`pt-2 text-xl font-bold ${ledgerTrackTight}`} style={{ color: "var(--ink)" }}>
            {t("claim.invalidTitle")}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("claim.invalidBody")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1
              className={`text-xl font-bold ${ledgerTrackTight}`}
              style={{ color: "var(--ink)" }}
            >
              {t("claim.credentialsTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {fixedEmail ? t("claim.staffBody") : t("claim.credentialsBody")}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="claim-email" style={{ color: "var(--ink-2)" }}>
                {t("auth.email")}
              </Label>
              {fixedEmail ? (
                <Input
                  id="claim-email"
                  type="email"
                  dir="ltr"
                  className="font-[family-name:var(--ledger-mono)]"
                  value={fixedEmail}
                  readOnly
                  disabled
                />
              ) : (
                <Input
                  id="claim-email"
                  type="email"
                  dir="ltr"
                  className="font-[family-name:var(--ledger-mono)]"
                  placeholder={t("claim.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="claim-password" style={{ color: "var(--ink-2)" }}>
                {t("auth.password")}
              </Label>
              <PasswordInput
                id="claim-password"
                placeholder={t("claim.passwordPlaceholder")}
                autoComplete="new-password"
                showLabel={t("auth.showPassword")}
                hideLabel={t("auth.hidePassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <LedgerButton
              variant="primary"
              className="w-full"
              disabled={busy || !canSubmit}
              onClick={saveCredentials}
            >
              {busy ? <Spinner /> : <CheckCircle2 className="size-4" aria-hidden />}
              {t("claim.continue")}
            </LedgerButton>
          </div>
        </div>
      )}
    </AuthCenteredShell>
  );
}


export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner />
    </Suspense>
  );
}
