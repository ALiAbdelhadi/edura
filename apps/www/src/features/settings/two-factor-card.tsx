"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { SectionHead } from "@repo/ui/components/ledger";
import { PasswordInput } from "@/components/kit/password-input";
import { Spinner } from "@/components/kit/spinner";
import { authClient } from "@/lib/auth/client";

type Phase = "idle" | "password" | "verify" | "disabling";

/**
 * Guided TOTP enrollment (QR + backup codes). On www this is offered to
 * center owners (center_admin) — optional but encouraged. The same component
 * drives the REQUIRED enrollment in apps/superadmin.
 */
export function TwoFactorCard() {
  const t = useTranslations();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void authClient.getSession().then(({ data }) => {
      setEnabled(
        Boolean((data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled),
      );
    });
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data) {
        toast.error(t("security.actionFailed"));
        return;
      }
      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes ?? []);
      setPassword("");
      setPhase("verify");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        toast.error(t("security.invalidCode"));
        return;
      }
      toast.success(t("security.enabledToast"));
      setEnabled(true);
      setPhase("idle");
      setTotpUri(null);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) {
        toast.error(t("security.actionFailed"));
        return;
      }
      toast.success(t("security.disabledToast"));
      setEnabled(false);
      setPhase("idle");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success(t("security.codesCopied"));
    } catch {
      toast.error(t("security.actionFailed"));
    }
  };

  if (enabled === null) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("security.twoFactorTitle")} />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-ink-2">
            {enabled ? t("security.twoFactorDescOn") : t("security.twoFactorDescOff")}
          </p>
          {phase === "idle" ? (
            <Button
              type="button"
              variant={enabled ? "outline" : "default"}
              onClick={() => setPhase(enabled ? "disabling" : "password")}
            >
              {enabled ? (
                <ShieldOff className="size-4" aria-hidden />
              ) : (
                <ShieldCheck className="size-4" aria-hidden />
              )}
              {enabled ? t("security.disable") : t("security.enable")}
            </Button>
          ) : null}
        </div>

        {phase === "password" || phase === "disabling" ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-4">
            <p className="text-[13px] font-semibold text-ink">
              {t("security.passwordPrompt")}
            </p>
            <div className="flex gap-2">
              <PasswordInput
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showLabel={t("auth.showPassword")}
                hideLabel={t("auth.hidePassword")}
              />
              <Button
                type="button"
                disabled={busy || password.length === 0}
                onClick={phase === "disabling" ? disable : start}
              >
                {busy ? <Spinner /> : null}
                {t("security.verify")}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "verify" && totpUri ? (
          <div className="mt-4 flex flex-col gap-4 border-t border-rule pt-4">
            <p className="text-[13px] text-ink-2">{t("security.scanQr")}</p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <QRCodeSVG value={totpUri} size={168} aria-hidden />
            </div>
            {backupCodes.length > 0 ? (
              <div className="rounded-lg border border-rule bg-paper p-3">
                <p className="text-[13px] font-semibold text-ink">
                  {t("security.backupCodes")}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-3">
                  {t("security.backupCodesDesc")}
                </p>
                <div
                  className="mt-2 grid grid-cols-2 gap-1 font-[family-name:var(--ledger-mono)] text-[13px] text-ink"
                  dir="ltr"
                >
                  {backupCodes.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={copyCodes}
                >
                  <Copy className="size-3.5" aria-hidden />
                  {t("security.copyCodes")}
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder={t("security.codePlaceholder")}
                className="font-[family-name:var(--ledger-mono)]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={confirm}
              >
                {busy ? <Spinner /> : null}
                {t("security.verify")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
