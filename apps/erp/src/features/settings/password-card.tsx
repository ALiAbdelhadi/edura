"use client";

import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { Button } from "@repo/ui/components/button";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function PasswordCard({ locale }: { locale?: string }) {
  const t = useTranslations();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const localizedError = (err: any) => {
    const raw: string = err?.serverMessage ?? err?.message ?? "";
    if (/current password/i.test(raw)) return t("security.currentPasswordWrong");
    if (/no password/i.test(raw)) return t("security.noPasswordSet");
    return err?.message || t("security.actionFailed");
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
      await authClient.signOut().catch(() => undefined);
      window.location.href = `/${locale ?? "ar"}/login`;
    } catch (err: any) {
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
