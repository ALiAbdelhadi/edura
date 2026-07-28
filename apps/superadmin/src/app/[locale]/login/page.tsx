"use client";

/* Login — paper canvas, a single --sheet card, a mono eyebrow, no gradient.
   ══════════════════════════════════════════════════════════════════════════════

   The eyebrow reads `back office` with script="latin". That is the ONE legitimate
   override in D-003: the reason for the Latin eyebrow form is the SCRIPT, not the
   language setting, and `back office` is a genuinely Latin string even on an Arabic
   page. Everything else on this screen takes its script from the locale.

   Unlike the www auth screens, the form sits ON a sheet: this is the door to the
   ledger, and the card is the first statement that this object is a record. */

import { useLogin } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import type { Locale } from "@repo/ui/lib/format";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export default function LoginPage() {
  const { mutate: login, isPending } = useLogin();
  const t = useTranslations();
  const locale = useLocale() as Locale;
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
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-paper p-6">
      {/* The login page renders outside the dashboard shell, so this is the only
          way to switch language before signing in. Suspense because the switcher
          reads useSearchParams(). */}
      <div className="absolute inset-x-0 top-0 flex justify-end p-6">
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-rule bg-sheet p-6 shadow-[var(--lift)]">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-indigo-soft">
            <ShieldCheck className="size-6 text-indigo" aria-hidden="true" />
          </div>
          {/* Latin by SCRIPT, not by language setting (D-003). */}
          <Eyebrow locale={locale} script="latin" marker={false} className="mb-2">
            back office
          </Eyebrow>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {t("auth.backofficeTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">{t("auth.backofficeSubtitle")}</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="flex gap-2 rounded-lg border border-red bg-red-soft p-3 text-xs text-red"
            >
              <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              dir="ltr"
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
              dir="ltr"
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
