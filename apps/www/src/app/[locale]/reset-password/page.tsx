"use client";

import { PasswordInput } from "@/components/kit/password-input";
import { PageSpinner } from "@/components/kit/spinner";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { CheckCircle2, Loader2, Lock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
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
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <XCircle className="size-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {t("auth.resetInvalidTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("auth.resetInvalidSubtitle")}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/forgot-password">{t("auth.requestNewLink")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {t("auth.resetDoneTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("auth.resetDoneSubtitle")}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href="/login">{t("auth.signInTitle")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
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
            {t("auth.resetTitle")}
          </h1>
        </div>

        <Card>
          <CardContent>
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("auth.resetButton")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
