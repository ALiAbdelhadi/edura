"use client";

/* Login — paper canvas, a single --sheet card, a mono eyebrow, no gradient.
   ══════════════════════════════════════════════════════════════════════════════

   The eyebrow reads `back office` with script="latin". That is the ONE legitimate
   override in D-003: the reason for the Latin eyebrow form is the SCRIPT, not the
   language setting, and `back office` is a genuinely Latin string even on an Arabic
   page. Everything else on this screen takes its script from the locale.

   Unlike the www auth screens, the form sits ON a sheet: this is the door to the
   ledger, and the card is the first statement that this object is a record.

   ── The error message is deliberately generic. Do not "improve" it. ──────────

   `authorize()` returns null for a wrong password, an unknown email, a
   non-super_admin/accountant role, a soft-deleted account AND a tripped C2 rate
   limit — all five are indistinguishable to the client on purpose. Telling the
   operator which one it was would leak whether an email exists (H5's whole point:
   bcrypt runs unconditionally against a DUMMY_HASH so the timing matches too) and
   would hand an attacker their throttle state. So this screen cannot say "you are
   rate limited", and the one honest thing it can say is that the credentials were
   rejected. The security fixes are untouchable (constitution §7); a friendlier
   message here would quietly undo C2 and H5.

   ── No seal here. ────────────────────────────────────────────────────────────

   The single-animation budget is spent on the moment something became PERMANENT
   (§2.5). Signing in commits nothing to the ledger, so it gets no seal and no
   motion — spending the one animation on a transition would spend it on nothing. */

import { useLogin } from "@refinedev/core";
import { Button } from "@repo/ui/components/button";
import { Eyebrow } from "@repo/ui/components/eyebrow";
import { Input } from "@repo/ui/components/input";
import { PasswordInput } from "@repo/ui/components/password-input";
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

  /* Caps Lock reveals nothing about the account, so unlike the error message this
     IS safe to surface — and it is worth surfacing on a field whose content the
     operator cannot see. */
  const trackCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const on = e.getModifierState?.("CapsLock");
    if (typeof on === "boolean") setCapsLock(on);
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
          {/* rounded-md = 8px, matching the sidebar's initials tile (§2.4). */}
          <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-indigo-soft">
            <ShieldCheck className="size-6 text-indigo" aria-hidden="true" />
          </div>

          {/* Latin by SCRIPT, not by language setting (D-003). */}
          <Eyebrow locale={locale} script="latin" marker={false} className="mb-2">
            back office
          </Eyebrow>

          {/* §2.3 page title: 26 / 700 / -0.02em. */}
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink">
            {t("auth.backofficeTitle")}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-2">{t("auth.backofficeSubtitle")}</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="flex gap-2 rounded-md border border-red bg-red-soft p-3 text-xs text-red"
            >
              <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            {/* First focusable element — the operator's hands start here. */}
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
            {/* The promoted <PasswordInput>, not a bare type="password": an
                operator typing a credential they cannot see, on a screen that
                rejects every role but two, retypes it blind on a typo. The
                toggle is `aria-pressed` and its label is localised — the reveal
                state has to be announced, not just drawn. */}
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
              // Announced, not merely coloured — same rule as the armed commit.
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
