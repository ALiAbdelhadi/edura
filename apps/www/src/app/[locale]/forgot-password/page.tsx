"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";

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
      const res = await fetch("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || t("auth.forgotFailed"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("common.genericError"));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCenteredShell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("auth.forgotSentTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("auth.forgotSentSubtitle", { email })}
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/login">{t("auth.backToSignIn")}</Link>
          </Button>
        </div>
      </AuthCenteredShell>
    );
  }

  return (
    <AuthCenteredShell>
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/edura-logo.svg"
          alt="Edura"
          width={120}
          height={90}
          priority
          className="mb-4 h-[90px] w-auto"
        />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("auth.forgotPassword")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("auth.sendResetLink")}
        </Button>
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
