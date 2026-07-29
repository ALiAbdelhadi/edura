"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { AuthCenteredShell } from "@/components/kit/auth-centered-shell";
import { LedgerButton } from "@/components/ledger";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/sonner";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";

/** Where each claimed role lands. Mirrors CLAIMABLE in services/invites. */
const LANDING: Record<string, string> = {
  student: "/onboarding",
  assistant: "/dashboard/assistant",
  center_staff: "/dashboard/staff",
};

/**
 * Claim landing — opened from the one-time invite link (Step 7, generalized).
 * 1. signIn("invite-token") with the URL token (no password step);
 * 2. set a password — plus an email, but ONLY for a walk-in student, who has
 *    none yet. An assistant/staff member was invited AT an address, so theirs
 *    is fixed and shown read-only: the invite is proof of that address, and
 *    letting them retype it would turn a claim link into an email-change door.
 * 3. continue into the portal for their role.
 */
function ClaimInner() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<"authenticating" | "credentials" | "invalid">(
    token ? "authenticating" : "invalid",
  );
  const [role, setRole] = useState<string | null>(null);
  const [fixedEmail, setFixedEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    (async () => {
      const res = await signIn("invite-token", { token, redirect: false });
      if (res?.ok) {
        const me = await fetch("/api/v1/me")
          .then((r) => r.json())
          .catch(() => null);
        const user = me?.data ?? null;
        setRole(user?.role ?? null);
        setFixedEmail(user?.email ?? null);
        // The provider refuses a credentialed account, so this should not
        // happen — check anyway rather than showing a dead password form.
        if (user?.hasPassword) router.replace(LANDING[user.role] ?? "/dashboard");
        else setPhase("credentials");
      } else {
        setPhase("invalid");
      }
    })();
  }, [token, router]);

  const saveCredentials = async () => {
    setBusy(true);
    try {
      await api.post("me/credentials", {
        json: fixedEmail ? { password } : { email: email.trim(), password },
      });
      toast.success(t("claim.credentialsSaved"));
      router.replace(LANDING[role ?? "student"] ?? "/dashboard");
    } catch (err: any) {
      toast.error(err?.message || t("claim.credentialsFailed"));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = password.length >= 8 && (!!fixedEmail || !!email.trim());

  return (
    <AuthCenteredShell>
      {phase === "authenticating" ? (
        <div className="flex items-center gap-3 py-4" style={{ color: "var(--ink-2)" }}>
          <Spinner />
          <span>{t("claim.authenticating")}</span>
        </div>
      ) : phase === "invalid" ? (
        <div className="space-y-2">
          {/* An invalid or spent token is a blocking state, so it carries the
              red — bordered, never a filled panel. */}
          <div
            className="flex size-11 items-center justify-center rounded-lg"
            style={{ background: "var(--red-soft)", color: "var(--red)" }}
          >
            <KeyRound className="size-5" aria-hidden />
          </div>
          <h1 className="pt-2 text-xl font-bold" style={{ color: "var(--ink)" }}>
            {t("claim.invalidTitle")}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {t("claim.invalidBody")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1
              className="text-xl font-bold"
              style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
            >
              {t("claim.credentialsTitle")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {fixedEmail ? t("claim.staffBody") : t("claim.credentialsBody")}
            </p>
          </div>

          <div className="space-y-3">
            {/* An invitee keeps the address they were invited at; only a
                phone-only student chooses one. */}
            {fixedEmail ? (
              <Input
                type="email"
                dir="ltr"
                aria-label={t("claim.emailPlaceholder")}
                className="font-[family-name:var(--ledger-mono)]"
                value={fixedEmail}
                readOnly
                disabled
              />
            ) : (
              <Input
                type="email"
                dir="ltr"
                aria-label={t("claim.emailPlaceholder")}
                className="font-[family-name:var(--ledger-mono)]"
                placeholder={t("claim.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            <Input
              type="password"
              dir="ltr"
              aria-label={t("claim.passwordPlaceholder")}
              placeholder={t("claim.passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <LedgerButton
              variant="primary"
              className="w-full"
              disabled={busy || !canSubmit}
              onClick={saveCredentials}
            >
              {busy ? <Spinner /> : <CheckCircle2 className="size-4" aria-hidden />}
              {t("claim.continue")}
            </LedgerButton>
          </div>
        </div>
      )}
    </AuthCenteredShell>
  );
}


export default function ClaimPage() {
  return (
    <Suspense fallback={null}>
      <ClaimInner />
    </Suspense>
  );
}
