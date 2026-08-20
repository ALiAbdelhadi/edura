"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  LogOut,
  Monitor,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { PasswordInput } from "@repo/ui/components/password-input";
import { toast } from "@repo/ui/components/sonner";
import { authClient } from "@/lib/auth/client";

type SessionRow = {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Exported so the admin user-detail screen labels a device the same way. */
export function deviceLabel(ua: string | null | undefined, fallback: string) {
  if (!ua) return { label: fallback, mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const mobile = /Android|iPhone|Mobile/.test(ua);
  if (!browser && !os) return { label: fallback, mobile };
  return { label: [browser, os].filter(Boolean).join(" · "), mobile };
}

function SessionsSection() {
  const t = useTranslations();
  const format = useFormatter();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data: list }, { data: current }] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ]);
      setSessions((list as SessionRow[] | null) ?? []);
      setCurrentToken(current?.session?.token ?? null);
      setFailed(false);
    } catch {
      setFailed(true);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeOne = async (token: string) => {
    setBusy(token);
    try {
      const { error } = await authClient.revokeSession({ token });
      if (error) throw new Error(error.message ?? "");
      toast.success(t("security.revokedToast"));
      await load();
    } catch {
      toast.error(t("security.revokeFailed"));
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy("__all__");
    try {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? "");
      toast.success(t("security.revokeAllDone"));
      await load();
    } catch {
      toast.error(t("security.revokeFailed"));
    } finally {
      setBusy(null);
    }
  };

  const others = (sessions ?? []).filter((s) => s.token !== currentToken);

  return (
    <section className="rounded-xl border border-rule bg-sheet p-4">
      <h2 className="text-[15px] font-bold text-ink">{t("security.sessionsTitle")}</h2>
      <p className="mt-1 text-[13px] text-ink-2">{t("security.sessionsDesc")}</p>
      {failed ? (
        <p className="mt-3 text-[13px] text-red">{t("security.loadFailed")}</p>
      ) : sessions === null ? null : (
        <ul className="mt-3 flex flex-col divide-y divide-rule">
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken;
            const { label, mobile } = deviceLabel(s.userAgent, t("security.unknownDevice"));
            const Icon = mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rule-2">
                  <Icon className="size-4.5 text-ink-2" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {label}
                    {isCurrent ? (
                      <span className="ms-2 rounded bg-teal-soft px-1.5 py-0.5 text-[11px] font-bold text-teal">
                        {t("security.thisDevice")}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12px] text-ink-3" dir="ltr">
                    {s.ipAddress || "—"} · {t("security.lastActive")}{" "}
                    {format.dateTime(new Date(s.updatedAt), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {!isCurrent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => revokeOne(s.token)}
                  >
                    <LogOut className="size-3.5" aria-hidden />
                    {t("security.revoke")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 ? (
        <div className="mt-2 border-t border-rule pt-3">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={revokeOthers}>
            <MonitorSmartphone className="size-4" aria-hidden />
            {t("security.revokeAll")}
          </Button>
        </div>
      ) : sessions !== null && !failed ? (
        <p className="mt-3 text-[12px] text-ink-3">{t("security.noOtherSessions")}</p>
      ) : null}
    </section>
  );
}

/**
 * TOTP enrollment (QR + backup codes). 2FA is REQUIRED for back-office roles:
 * the /two-factor-setup gate renders this with `required` until the account
 * has enrolled; afterwards it appears on the security page for management.
 */
export function TwoFactorSetup({ required = false }: { required?: boolean }) {
  const t = useTranslations();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<"idle" | "password" | "verify">(
    required ? "password" : "idle",
  );
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
      if (required) window.location.href = "/dashboard";
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

  const manualKey = totpUri?.split("?")[1]
    ? new URLSearchParams(totpUri.split("?")[1]).get("secret")
    : null;

  const copyKey = async () => {
    if (!manualKey) return;
    try {
      await navigator.clipboard.writeText(manualKey);
      toast.success(t("security.keyCopied"));
    } catch {
      toast.error(t("security.actionFailed"));
    }
  };

  if (enabled === null) return null;

  return (
    <section className="rounded-xl border border-rule bg-sheet p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-bold text-ink">{t("security.twoFactorTitle")}</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            {enabled ? t("security.twoFactorDescOn") : t("security.twoFactorRequired")}
          </p>
        </div>
        {!enabled && phase === "idle" ? (
          <Button type="button" onClick={() => setPhase("password")}>
            <ShieldCheck className="size-4" aria-hidden />
            {t("security.enable")}
          </Button>
        ) : null}
      </div>

      {!enabled && phase === "password" ? (
        <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-4">
          <p className="text-[13px] font-semibold text-ink">{t("security.passwordPrompt")}</p>
          <div className="flex gap-2">
            <PasswordInput
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="button"
              disabled={busy || password.length === 0}
              onClick={start}
            >
              {t("security.verify")}
            </Button>
          </div>
        </div>
      ) : null}

      {!enabled && phase === "verify" && totpUri ? (
        <div className="mt-4 flex flex-col gap-4 border-t border-rule pt-4">
          <p className="text-[13px] text-ink-2">{t("security.scanQr")}</p>
          <p className="text-[12px] text-ink-3">{t("security.scanQrHint")}</p>
          <div className="flex justify-center rounded-lg bg-white p-4">
            <QRCodeSVG value={totpUri} size={168} aria-hidden />
          </div>
          {manualKey ? (
            <div className="rounded-lg border border-rule bg-paper p-3">
              <p className="text-[13px] font-semibold text-ink">{t("security.manualKeyLabel")}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">{t("security.manualKeyDesc")}</p>
              <div className="mt-2 flex items-center gap-2">
                <code
                  dir="ltr"
                  className="flex-1 truncate rounded-md bg-sheet px-2 py-1.5 font-mono text-[13px] text-ink"
                >
                  {manualKey}
                </code>
                <Button type="button" variant="outline" size="sm" onClick={copyKey}>
                  <Copy className="size-3.5" aria-hidden />
                  {t("security.copyKey")}
                </Button>
              </div>
            </div>
          ) : null}
          {backupCodes.length > 0 ? (
            <div className="rounded-lg border border-rule bg-paper p-3">
              <p className="text-[13px] font-semibold text-ink">{t("security.backupCodes")}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">{t("security.backupCodesDesc")}</p>
              <div
                className="mt-2 grid grid-cols-2 gap-1 font-mono text-[13px] text-ink"
                dir="ltr"
              >
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={copyCodes}>
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
              className="font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="button" disabled={busy || code.length !== 6} onClick={confirm}>
              {t("security.verify")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SecurityScreen() {
  const t = useTranslations();
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-5">
      <h1 className="text-xl font-bold text-ink">{t("nav.security")}</h1>
      <TwoFactorSetup />
      <SessionsSection />
    </div>
  );
}
