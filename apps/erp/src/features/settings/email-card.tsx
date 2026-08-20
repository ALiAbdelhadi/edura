"use client";

import { useState } from "react";
import { AtSign, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

/**
 * Correct your own login email.
 *
 * The email row above this card was read-only for the life of the product, and
 * for a student it is very often not a value they typed: a receptionist enters
 * it at a walk-in counter from a number read aloud. Making it editable is the
 * point of this card; the two things around it are what make that safe to
 * offer, and both are stated up front rather than discovered on submit.
 *
 * The password field appears ONLY for an account that has a password. A
 * walk-in student who has not set credentials yet has nothing to prove and is
 * asked for nothing — the route agrees, so the form matches the rule instead of
 * guessing at it.
 *
 * Sign-in is NOT interrupted: the credential did not change. What does change
 * is the address every reset link and receipt goes to, which is why the current
 * password is the price of changing it.
 */
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
      // The route answers in English (it is shared with the back office). Map
      // the refusals a person can act on, so an Arabic screen never replies in
      // English about their own account.
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
