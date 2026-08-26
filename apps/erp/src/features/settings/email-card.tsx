"use client";

import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { AtSign, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function EmailCard({
  email,
  hasPassword,
  emailVerified,
  onChanged,
}: {
  email?: string | null;
  hasPassword?: boolean;
  emailVerified?: boolean;
  onChanged?: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("me/email", {
        json: {
          email: next.trim(),
          ...(hasPassword ? { currentPassword: password } : {}),
        },
      });
      toast.success(t("shared.emailChanged"));
      setNext("");
      setPassword("");
      setOpen(false);
      onChanged?.();
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? "";

      if (/already in use/i.test(message)) toast.error(t("shared.emailTaken"));
      else if (/password/i.test(message)) toast.error(t("security.currentPasswordWrong"));
      else if (/guardian/i.test(message)) toast.error(t("shared.emailIsGuardians"));
      else toast.error(message || t("shared.emailChangeFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <AtSign className="size-4" aria-hidden />
            {t("shared.emailCardTitle")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="text-[13px] text-ink-3">{t("shared.emailCardSubtitle")}</p>

        <p className="mt-3 num text-[15px] font-semibold text-ink" dir="ltr">
          {email || t("shared.emailNoneOnFile")}
        </p>
        {email && !emailVerified ? (
          <p className="mt-1 text-xs text-ink-3">{t("shared.emailUnverified")}</p>
        ) : null}

        {!open ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setOpen(true)}
          >
            {t("shared.emailChangeCta")}
          </Button>
        ) : (
          <form className="mt-4 grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="em-new">{t("shared.emailNew")}</Label>
              <Input
                id="em-new"
                type="email"
                dir="ltr"
                className="num"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            {hasPassword ? (
              <div className="grid gap-1.5">
                <Label htmlFor="em-pass">{t("security.currentPassword")}</Label>
                <PasswordInput
                  id="em-pass"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-ink-3">{t("shared.emailPasswordWhy")}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : <Save className="size-4" aria-hidden />}
                {t("shared.emailSave")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setNext("");
                  setPassword("");
                }}
              >
                {t("actions.cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
