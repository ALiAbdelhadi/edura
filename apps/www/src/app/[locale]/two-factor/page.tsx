"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { AuthShell } from "@/components/kit/auth-shell";
import { authClient } from "@/lib/auth/client";

/**
 * Second factor after a correct password (better-auth twoFactorRedirect).
 * TOTP code by default, single-use backup code as the recovery path.
 */
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
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
        <Input
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
          className="font-[family-name:var(--ledger-mono)] text-center text-lg tracking-[0.3em]"
          value={code}
          onChange={(e) =>
            setCode(
              mode === "totp" ? e.target.value.replace(/\D/g, "") : e.target.value.trim(),
            )
          }
        />
        <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
          <input
            type="checkbox"
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
          />
          {t("security.trustDevice")}
        </label>
        <Button type="submit" disabled={busy || code.length === 0} className="w-full">
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="size-4" aria-hidden />
          )}
          {t("security.verify")}
        </Button>
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
