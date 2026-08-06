"use client";

import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { PasswordInput } from "@/components/kit/password-input";
import { PageSpinner } from "@/components/kit/spinner";
import { LedgerButton } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { Label } from "@repo/ui/components/label";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function ResetPasswordPage() {
  const t = useTranslations();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <PageSpinner label={t("common.loading")} />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <XCircle className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {t("auth.resetInvalidTitle")}
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("auth.resetInvalidSubtitle")}
            </p>
          </div>
          <LedgerButton asChild variant="primary" className="w-full">
            <Link href="/forgot-password">{t("auth.requestNewLink")}</Link>
          </LedgerButton>
        </div>
      </AuthCenteredShell>
    );
  }

  if (done) {
    return (
      <AuthCenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg" style={{ background: "var(--teal-soft)", color: "var(--teal)" }}>
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {t("auth.resetDoneTitle")}
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("auth.resetDoneSubtitle")}
            </p>
          </div>
          <LedgerButton asChild variant="primary" className="w-full">
            <Link href="/login">{t("auth.signInTitle")}</Link>
          </LedgerButton>
        </div>
      </AuthCenteredShell>
    );
  }

  const handleSubmit = async () => {
    if (!password || password.length < 8) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsNoMatch"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || t("auth.resetFailed"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("common.genericError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCenteredShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}>
          {t("auth.resetTitle")}
        </h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={{ color: "var(--red)", background: "var(--red-soft)", border: "1px solid var(--red)" }}
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">{t("auth.newPassword")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute inset-y-0 inset-s-0 z-10 my-auto ms-3 size-4 text-muted-foreground" />
            <PasswordInput
              id="password"
              className="ps-9"
              placeholder={t("auth.passwordMinPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute inset-y-0 inset-s-0 z-10 my-auto ms-3 size-4 text-muted-foreground" />
            <PasswordInput
              id="confirm"
              className="ps-9"
              placeholder={t("auth.reenterPasswordPlaceholder")}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <LedgerButton type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("auth.resetButton")}
        </LedgerButton>
      </form>
    </AuthCenteredShell>
  );
}
