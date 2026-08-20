"use client";

import { AuthShell } from "@/components/kit/auth-shell";
import { PasswordInput } from "@/components/kit/password-input";
import { Eyebrow, LedgerButton, Num, ledgerTrackTight } from "@/components/ledger";
import { Link } from "@/i18n/navigation";
import { uiRoleForRole } from "@/lib/auth/portal";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Clock, Loader2, LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function isSafeNext(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

const SHOW_QUICK_LOGINS = process.env.NODE_ENV !== "production";

const QUICK_LOGINS = [
  { roleKey: "roles.admin", email: "admin@nile-academy.eg", tone: "amber" },
  { roleKey: "roles.teacher", email: "hossam.aziz@nile-academy.eg", tone: "teal" },
  { roleKey: "roles.student", email: "lina.hassan@student.nile-academy.eg", tone: "indigo" },
  { roleKey: "roles.parent", email: "mona.hassan@email.eg", tone: "neutral" },
] as const;

const TILE_TONE: Record<string, { color: string; background: string }> = {
  amber: { color: "var(--amber)", background: "var(--amber-soft)" },
  teal: { color: "var(--teal)", background: "var(--teal-soft)" },
  indigo: { color: "var(--indigo)", background: "var(--indigo-soft)" },
  neutral: { color: "var(--ink-2)", background: "var(--rule-2)" },
};

export default function LoginPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = isSafeNext(nextParam) ? nextParam : "/dashboard";
  // Arrived here because the session was ended FOR them. Rendered as a calm
  // notice, not the red alert: nothing they did was wrong, and the account is
  // fine — the only thing asked of them is to sign in again.
  //
  // TWO REASONS, TWO SENTENCES, because they are different facts and the notice
  // must not state the wrong one. `session_conflict` = the browser really was
  // holding more than one session. `session_mismatch` = it held exactly one, but
  // it was not the person the screen was named after — saying "more than one" to
  // that reader would be a plain untruth in a safety message.
  // See docs/reports/session-identity-mismatch.md.
  const signedOutReason = searchParams.get("reason");
  const sessionExpired = signedOutReason === "session_expired";
  const signedOutForSafety =
    signedOutReason === "session_conflict" ||
    signedOutReason === "session_mismatch" ||
    sessionExpired;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // USER_NOT_FOUND is a guidance state, not a failure — it renders as a calm
  // inline panel with a sign-up CTA (email carried over), never as the red
  // alert. Holds the email exactly as typed so the CTA prefills it.
  const [notFoundEmail, setNotFoundEmail] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .min(1, { message: t("auth.emailRequired") })
      .email({ message: t("auth.emailInvalid") }),
    password: z.string().min(1, { message: t("auth.passwordRequired") }),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setLoading(true);
    setError(null);
    setNotFoundEmail(null);
    try {
      localStorage.removeItem("edura_state");
    } catch {}
    try {
      const { data, error: signInError } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (signInError) {
        // The sign-in hook surfaces typed codes as the APIError message; any
        // unrecognized value stays the generic invalid-credentials line, so
        // nothing new is ever leaked.
        if (signInError.message === "USER_NOT_FOUND") {
          setNotFoundEmail(values.email.trim());
        } else if (signInError.message === "ACCOUNT_PENDING") {
          setError(t("auth.accountPending"));
        } else if (signInError.message === "ACCOUNT_INACTIVE") {
          setError(t("auth.accountInactive"));
        } else if (signInError.message === "RATE_LIMITED") {
          setError(t("auth.rateLimited"));
        } else {
          setError(t("auth.invalidCredentials"));
        }
        setLoading(false);
        return;
      }
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
        return;
      }
      try {
        const meRes = await fetch("/api/v1/me");
        if (meRes.ok) {
          const meJson = await meRes.json();
          const userData = meJson.data;
          const uiRole = uiRoleForRole(userData.role);
          localStorage.setItem(
            "edura_state",
            JSON.stringify({
              role: uiRole,
              screen: "dashboard",
              name: userData.name,
              email: userData.email,
            }),
          );
        }
      } catch {}
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = next;
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (loginEmail: string) => {
    form.setValue("email", loginEmail);
    form.setValue("password", "Passw0rd!");
    onSubmit({ email: loginEmail, password: "Passw0rd!" });
  };

  return (
    <AuthShell>
      <div className="mb-6">
        <h1
          className={`text-2xl font-bold ${ledgerTrackTight}`}
          style={{ color: "var(--ink)" }}
        >
          {t("auth.signInTitle")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("auth.signInSubtitle")}
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {notFoundEmail ? (
            <div
              role="status"
              className="rounded-lg px-3 py-3 text-sm"
              style={{
                background: "var(--indigo-soft)",
                border: "1px solid var(--indigo)",
              }}
            >
              <p className="font-semibold" style={{ color: "var(--indigo)" }}>
                {t("auth.notRegisteredTitle")}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
                {t("auth.notRegisteredHint")}
              </p>
              <Link
                href={`/register?email=${encodeURIComponent(notFoundEmail)}`}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold hover:opacity-90"
                style={{ background: "var(--indigo)", color: "var(--paper)" }}
              >
                <LogIn className="size-3.5" aria-hidden />
                {t("auth.notRegisteredCta")}
              </Link>
            </div>
          ) : null}
          {signedOutForSafety && !error ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              style={{
                color: "var(--ink-2)",
                background: "var(--field)",
                border: "1px solid var(--rule)",
              }}
            >
              {/* An expiry is not a safety event, so it does not wear the
                  safety mark. The shield says "something protected you"; time
                  running out protected nobody. */}
              {sessionExpired ? (
                <Clock
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--ink-3)" }}
                  aria-hidden
                />
              ) : (
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--indigo)" }}
                  aria-hidden
                />
              )}
              {sessionExpired
                ? t("auth.sessionExpiredNotice")
                : signedOutReason === "session_mismatch"
                  ? t("auth.sessionMismatchNotice")
                  : t("auth.sessionConflictNotice")}
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{
                color: "var(--red)",
                background: "var(--red-soft)",
                border: "1px solid var(--red)",
              }}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel style={{ color: "var(--ink-2)" }}>{t("auth.email")}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    dir="ltr"
                    className="font-(family-name:--ledger-mono)"
                    placeholder={t("auth.emailPlaceholder")}
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel style={{ color: "var(--ink-2)" }}>{t("auth.password")}</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "var(--indigo)" }}
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <FormControl>
                  <PasswordInput
                    placeholder={t("auth.passwordPlaceholder")}
                    autoComplete="current-password"
                    showLabel={t("auth.showPassword")}
                    hideLabel={t("auth.hidePassword")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <LedgerButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="size-4" aria-hidden />
            )}
            {t("auth.signInTitle")}
          </LedgerButton>
        </form>
      </Form>

      {SHOW_QUICK_LOGINS ? (
        <div className="mt-7">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
            <Eyebrow>{t("auth.quickDemoLogin")}</Eyebrow>
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK_LOGINS.map(({ roleKey, email: qEmail, tone }) => {
              const label = t(roleKey);
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => handleQuickLogin(qEmail)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ color: "var(--ink-2)", border: "1px solid var(--rule)" }}
                >
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={TILE_TONE[tone]}
                  >
                    {label[0]}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px]" style={{ color: "var(--ink-3)" }}>
            {t.rich("auth.demoPasswordHint", {
              code: (chunks) => <Num style={{ color: "var(--ink-2)" }}>{chunks}</Num>,
            })}
          </p>
        </div>
      ) : null}

      <p className="mt-6 text-center text-sm" style={{ color: "var(--ink-2)" }}>
        {t("auth.noAccountPrompt")}{" "}
        <Link href="/register" className="font-semibold hover:underline" style={{ color: "var(--indigo)" }}>
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthShell>
  );
}
