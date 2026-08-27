"use client";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { useLogin } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { PasswordInput } from "@repo/ui/components/password-input";
import type { Locale } from "@repo/ui/lib/format";
import { TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState } from "react";

export default function LoginPage() {
  const { mutate: login, isPending } = useLogin();
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);

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
  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const on = e.getModifierState?.("CapsLock");
    if (typeof on === "boolean") setCapsLock(on);
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-paper p-6">
      <div className="absolute inset-x-0 top-0 flex justify-end p-6">
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-rule bg-sheet p-6 shadow-(--lift-2)">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/edura-mark.svg" alt="" width={40} height={40} className="mb-4 size-10 shrink-0" />
          <Eyebrow locale={locale} script="latin" marker={false} className="mb-2">
            back office
          </Eyebrow>
          <h1
            className="text-[28px] leading-tight text-ink"
            style={
              locale === "en"
                ? { fontFamily: "var(--lat-display)", letterSpacing: "var(--lat-display-track)", fontWeight: 700 }
                : { fontFamily: "var(--ar-display)", fontWeight: 700 }
            }
          >
            {t("auth.backofficeTitle")}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">{t("auth.backofficeSubtitle")}</p>
          <span aria-hidden="true" className="mt-4 h-[2px] w-8 bg-gold" />
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="flex gap-2 rounded-md border border-destructive bg-red-soft p-3 text-xs text-destructive"
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
              autoFocus
              required
              dir="ltr"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              dir="ltr"
              value={password}
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
            />
            {capsLock ? (
              <p role="status" className="flex items-center gap-1.5 text-xs text-amber">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                {t("auth.capsLockOn")}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t("auth.signingIn") : t("auth.signInTitle")}
          </Button>
        </form>
      </div>
    </div>
  );
}
