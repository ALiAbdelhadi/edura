"use client";

import { PasswordInput } from "@/components/kit/password-input";
import { PageSpinner } from "@/components/kit/spinner";
import { Link } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { CheckCircle2, Loader2, Lock, UserCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function InviteAcceptPage() {
  const t = useTranslations();
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <PageSpinner label={t("common.loading")} />
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}

function InviteAcceptContent() {
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
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                <XCircle className="size-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">
                  {t("auth.inviteInvalidTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("auth.inviteInvalidSubtitle")}
                </p>
              </div>
              <Link href="/login">
                <Button>{t("auth.goToSignIn")}</Button>
              </Link>
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
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/12 text-success">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">
                  {t("auth.inviteDoneTitle")}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t("auth.inviteDoneSubtitle")}
                </p>
              </div>
              <Link href="/login">
                <Button>{t("auth.signInTitle")}</Button>
              </Link>
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
      const res = await fetch("/api/v1/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || t("auth.inviteFailed"));
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
          {/* A bare <img>: next/image REFUSES SVG unless the optimizer is
              opened to it, so this rendered as a broken image — on the page a
              family lands on from the invite link in their WhatsApp or email,
              which is the worst screen in the product to greet someone with a
              broken logo. `priority` becomes eager + high fetch priority.
              `alt` STAYS "Edura" here: unlike the marketing chrome, no wordmark
              is rendered beside this one, so it is the only thing naming the
              product on the screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/edura-logo.svg"
            alt="Edura"
            width={120}
            height={90}
            loading="eager"
            fetchPriority="high"
            className="mb-4 h-22.5 w-auto"
          />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("auth.inviteTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auth.inviteSubtitle")}
          </p>
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
                <Label htmlFor="password">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute inset-y-0 inset-s-0 my-auto ms-3 size-4 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    className="ps-9"
                    placeholder={t("auth.passwordMinPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute inset-y-0 inset-s-0 my-auto ms-3 size-4 text-muted-foreground" />
                  <PasswordInput
                    id="confirm"
                    className="ps-9"
                    placeholder={t("auth.reenterPasswordPlaceholder")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserCheck className="size-4" />
                )}
                {t("auth.activateButton")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
