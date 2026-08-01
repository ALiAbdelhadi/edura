"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, MonitorSmartphone, Smartphone, Monitor } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";
import { SectionHead } from "@repo/ui/components/ledger";
import { Spinner } from "@/components/kit/spinner";
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

/** Tiny UA heuristic — a label, not analytics. */
export function deviceLabel(ua: string | null | undefined, fallback: string): {
  label: string;
  mobile: boolean;
} {
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

/**
 * "الأجهزة والجلسات" — lists this account's live auth_sessions rows and lets
 * the user revoke one device or every other device. Shown to ALL roles.
 */
export function SessionsCard() {
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
    <section className="flex flex-col gap-3">
      <SectionHead title={t("security.sessionsTitle")} />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="text-[13px] text-ink-2">{t("security.sessionsDesc")}</p>
        {failed ? (
          <p className="mt-3 text-[13px] text-red">{t("security.loadFailed")}</p>
        ) : sessions === null ? (
          <div className="mt-3 flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-rule">
            {sessions.map((s) => {
              const isCurrent = s.token === currentToken;
              const { label, mobile } = deviceLabel(
                s.userAgent,
                t("security.unknownDevice"),
              );
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
                        <span className="ms-2 rounded px-1.5 py-0.5 text-[11px] font-bold text-teal bg-teal-soft">
                          {t("security.thisDevice")}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] text-ink-3" dir="ltr">
                      {s.ipAddress || "—"} ·{" "}
                      {t("security.lastActive")}{" "}
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
                      {busy === s.token ? <Spinner /> : <LogOut className="size-3.5" aria-hidden />}
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
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={revokeOthers}
            >
              {busy === "__all__" ? <Spinner /> : <MonitorSmartphone className="size-4" aria-hidden />}
              {t("security.revokeAll")}
            </Button>
          </div>
        ) : sessions !== null && !failed ? (
          <p className="mt-3 text-[12px] text-ink-3">{t("security.noOtherSessions")}</p>
        ) : null}
      </div>
    </section>
  );
}
