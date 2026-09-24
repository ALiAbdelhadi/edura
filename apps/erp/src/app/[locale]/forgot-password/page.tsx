"use client";

import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { LedgerButton, ledgerTrackTight } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!email) {
      setError(t("auth.enterEmailAddress"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("auth/password/forgot", { json: { email, locale } });
      setSent(true);
    } catch (err) {
      setError((err as { message?: string })?.message || t("auth.forgotFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg" style={{ background: "var(--teal-soft)", color: "var(--teal)" }}>
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className={`text-xl font-bold ${ledgerTrackTight}`} style={{ color: "var(--ink)" }}>
              {t("auth.forgotSentTitle")}
            </h1>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("auth.forgotSentSubtitle", { email })}
            </p>
          </div>
          <LedgerButton asChild variant="primary" className="w-full">
            <Link href="/login">{t("auth.backToSignIn")}</Link>
          </LedgerButton>
        </div>
      </AuthCenteredShell>
    );
  }

  return (
    <AuthCenteredShell>
      <div className="mb-6">
        <h1 className={`text-2xl font-bold ${ledgerTrackTight}`} style={{ color: "var(--ink)" }}>
          {t("auth.forgotPassword")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("auth.forgotSubtitle")}
        </p>
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
          <Label htmlFor="email">{t("auth.email")}</Label>
          <div className="relative" dir="ltr">
            <Mail className="pointer-events-none absolute inset-y-0 inset-s-0 my-auto ms-3 size-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              className="ps-9"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>
        <LedgerButton type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("auth.sendResetLink")}
        </LedgerButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </AuthCenteredShell>
  );
}
