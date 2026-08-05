"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { SectionHead } from "@repo/ui/components/ledger";
import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";

/**
 * Self-service password change.
 *
 * The server bumps `token_version`, which revokes EVERY session including this
 * one — so on success there is nothing to stay logged in with. Rather than
 * leave the user on a screen whose next request 401s, this signs out cleanly
 * and sends them to the sign-in page. Saying so BEFORE they submit is the
 * point of the description line: being logged out must not read as a bug.
 */
export function PasswordCard({ locale }: { locale?: string }) {
  const t = useTranslations();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // The kernel throws its refusals in English (it serves both apps and has no
  // locale). Same treatment as the door screen: map the known ones onto i18n
  // keys so an Arabic UI never answers in English.
  const localizedError = (err: any) => {
    const message: string = err?.message ?? "";
    if (/current password/i.test(message)) return t("security.currentPasswordWrong");
    if (/no password/i.test(message)) return t("security.noPasswordSet");
    return message || t("security.actionFailed");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error(t("security.passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      await api
        .post("me/password", { json: { currentPassword: current, newPassword: next } })
        .json();
      toast.success(t("security.passwordChanged"));
      setCurrent("");
      setNext("");
      setConfirm("");
      // Clear the (already server-side dead) cookie before leaving, so the
      // sign-in page is not reached carrying a stale token.
      await authClient.signOut().catch(() => undefined);
      window.location.href = `/${locale ?? "ar"}/login`;
    } catch (err: any) {
      // The api client's beforeError hook already lifts the envelope's
      // `error.message` onto err.message — re-reading the body here would
      // consume an already-consumed stream and lose the real reason.
      toast.error(localizedError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("security.passwordTitle")} />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="text-[13px] text-ink-2">{t("security.passwordDesc")}</p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3 sm:max-w-sm">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium" htmlFor="current-password">
              {t("security.currentPassword")}
            </label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium" htmlFor="new-password">
              {t("security.newPassword")}
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <span className="text-[12px] text-ink-3">{t("security.passwordRules")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium" htmlFor="confirm-password">
              {t("security.confirmPassword")}
            </label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <div>
            <Button type="submit" disabled={busy || !current || !next || !confirm}>
              {busy ? <Spinner /> : <KeyRound className="size-4" aria-hidden />}
              {t("security.changePassword")}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
