"use client";

import { useLogin } from "@refinedev/core";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export default function LoginPage() {
  const { mutate: login, isPending } = useLogin();
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login(
      { email, password },
      {
        onSuccess: (result) => {
          if (!result.success) {
            setError(t("auth.invalidCredentialsBackoffice"));
          }
        },
      },
    );
  };

  return (
    // Same identity as the www auth screens: the form sits directly on the
    // page background — no card, no border, no boxed padding.
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      {/* Locale toggle — the login page renders outside the dashboard shell,
          so this is the only way to switch language before signing in.
          Suspense because the switcher reads useSearchParams(). */}
      <div className="absolute inset-x-0 top-0 flex justify-end p-6">
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("auth.backofficeTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("auth.backofficeSubtitle")}
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t("auth.signingIn") : t("auth.signInTitle")}
          </Button>
        </form>
      </div>
    </div>
  );
}
