"use client";

import { AuthShell } from "@/components/kit/auth-shell";
import { LedgerButton, ledgerTrackTight } from "@/components/ledger";
import { authClient } from "@/lib/auth/client";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function TwoFactorPage() {
  const t = useTranslations();
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code, trustDevice: trust })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice: trust });
      if (res.error) {
        setError(t("security.invalidCode"));
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError(t("common.genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="mb-6">
        <h1
          className={`text-2xl font-bold ${ledgerTrackTight}`}
          style={{ color: "var(--ink)" }}
        >
          {t("security.totpTitle")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("security.totpSubtitle")}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              color: "var(--red)",
              background: "var(--red-soft)",
              border: "1px solid var(--red)",
            }}
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="code" style={{ color: "var(--ink-2)" }}>
            {mode === "totp" ? t("security.codeLabel") : t("security.backupCodeLabel")}
          </Label>
          {/* Mono + tracking apply to the TYPED code (Latin digits) only — the
              placeholder is prose, and in Arabic a tracked mono placeholder is
              both the mono trap and a tracked connected script. */}
          <Input
            id="code"
            dir="ltr"
            inputMode={mode === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoFocus
            maxLength={mode === "totp" ? 6 : 32}
            placeholder={
              mode === "totp"
                ? t("security.codePlaceholder")
                : t("security.backupPlaceholder")
            }
            className="font-(family-name:--ledger-mono) text-center text-lg tracking-[0.3em] placeholder:font-sans placeholder:text-sm placeholder:tracking-normal"
            value={code}
            onChange={(e) =>
              setCode(
                mode === "totp" ? e.target.value.replace(/\D/g, "") : e.target.value.trim(),
              )
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="trust-device"
            checked={trust}
            onCheckedChange={(v) => setTrust(v === true)}
          />
          <Label
            htmlFor="trust-device"
            className="text-[13px] font-normal"
            style={{ color: "var(--ink-2)" }}
          >
            {t("security.trustDevice")}
          </Label>
        </div>
        <LedgerButton
          type="submit"
          variant="primary"
          disabled={busy || code.length === 0}
          className="w-full"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="size-4" aria-hidden />
          )}
          {t("security.verify")}
        </LedgerButton>
      </form>
      <button
        type="button"
        className="mt-4 text-sm font-semibold hover:underline"
        style={{ color: "var(--indigo)" }}
        onClick={() => {
          setMode(mode === "totp" ? "backup" : "totp");
          setCode("");
          setError(null);
        }}
      >
        {mode === "totp" ? t("security.useBackupCode") : t("security.useTotpCode")}
      </button>
    </AuthShell>
  );
}