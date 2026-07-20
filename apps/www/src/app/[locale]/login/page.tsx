"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  LogIn,
  Mail,
  GraduationCap,
  CalendarCheck,
  CreditCard,
  Users,
} from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { PasswordInput } from "@/components/kit/password-input";

function isSafeNext(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

// Demo quick-logins are a dev/staging convenience only — the accounts are
// seeded is_demo data with a known password, so never expose them in prod.
// NODE_ENV is statically inlined at build time, so the whole card is
// dead-code-eliminated from production bundles.
const SHOW_QUICK_LOGINS = process.env.NODE_ENV !== "production";

const QUICK_LOGINS = [
  {
    roleKey: "roles.admin",
    email: "admin@nile-academy.eg",
    tone: "bg-warning/15 text-warning",
  },
  {
    roleKey: "roles.teacher",
    email: "hossam.aziz@nile-academy.eg",
    tone: "bg-brand-teal/15 text-brand-teal",
  },
  {
    roleKey: "roles.student",
    email: "lina.hassan@student.nile-academy.eg",
    tone: "bg-primary/15 text-primary",
  },
  {
    roleKey: "roles.parent",
    email: "mona.hassan@email.eg",
    tone: "bg-info/15 text-info",
  },
] as const;

const ROLE_MAP: Record<string, string> = {
  center_admin: "admin",
  teacher: "teacher",
  student: "student",
  parent: "parent",
};

export default function LoginPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const next = isSafeNext(nextParam) ? nextParam : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doLogin = async (loginEmail?: string, loginPassword?: string) => {
    const em = loginEmail ?? email;
    const pw = loginPassword ?? password;
    if (!em || !pw) {
      setError(t("auth.enterEmailAndPassword"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: em,
        password: pw,
        redirect: false,
      });
      if (result?.error) {
        setError(t("auth.invalidCredentials"));
        setLoading(false);
        return;
      }
      try {
        const meRes = await fetch("/api/v1/me");
        if (meRes.ok) {
          const meJson = await meRes.json();
          const userData = meJson.data;
          const uiRole = ROLE_MAP[userData.role] ?? userData.role;
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
      window.location.href = next;
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (loginEmail: string) => {
    setEmail(loginEmail);
    setPassword("Passw0rd!");
    doLogin(loginEmail, "Passw0rd!");
  };

  return (
    <div className="flex min-h-dvh w-full bg-background">
      {/* Branding hero — decorative, desktop only. As the first flex child it
          sits at the inline-end (right in RTL, left in LTR), mirroring the
          reading direction. Pure-CSS background: no external image. */}
      <aside className="gradient-primary relative hidden w-[45%] shrink-0 flex-col justify-between overflow-hidden p-12 text-primary-foreground lg:flex xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-72 rounded-full bg-white/10 blur-3xl"
          style={{ top: "-6rem", insetInlineEnd: "-6rem" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute size-72 rounded-full bg-white/10 blur-3xl"
          style={{ bottom: "-6rem", insetInlineStart: "-6rem" }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
              <GraduationCap aria-hidden="true" className="size-6" />
            </span>
            <span className="display text-2xl font-bold tracking-tight">
              Edura
            </span>
          </div>
          <span className="mt-4 block h-1 w-12 rounded-full bg-brand-teal" />
        </div>

        <div className="relative max-w-md">
          <h2 className="display text-3xl font-bold leading-tight xl:text-4xl">
            {t("auth.heroTagline")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
            {t("auth.heroSubtitle")}
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm text-primary-foreground/90">
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <CalendarCheck aria-hidden="true" className="size-4" />
              </span>
              {t("auth.heroFeatureAttendance")}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <CreditCard aria-hidden="true" className="size-4" />
              </span>
              {t("auth.heroFeaturePayments")}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Users aria-hidden="true" className="size-4" />
              </span>
              {t("auth.heroFeatureRoles")}
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Edura
        </p>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image
              src="/edura-logo.svg"
              alt="Edura"
              width={120}
              height={90}
              priority
              className="mb-4 h-[90px] w-auto"
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("auth.signInTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("auth.signInSubtitle")}
            </p>
          </div>

          <Card className="mb-4">
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  doLogin();
                }}
                className="flex flex-col gap-4"
              >
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      className="ps-9"
                      placeholder={t("auth.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {t("auth.forgotPassword")}
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    placeholder={t("auth.passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    showLabel={t("auth.showPassword")}
                    hideLabel={t("auth.hidePassword")}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LogIn className="size-4" />
                  )}
                  {t("auth.signInTitle")}
                </Button>
              </form>
            </CardContent>
          </Card>

          {SHOW_QUICK_LOGINS && (
            <Card>
              <CardContent>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("auth.quickDemoLogin")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_LOGINS.map(({ roleKey, email: qEmail, tone }) => {
                    const label = t(roleKey);
                    return (
                      <button
                        key={roleKey}
                        type="button"
                        onClick={() => handleQuickLogin(qEmail)}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tone}`}
                        >
                          {label[0]}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  {t.rich("auth.demoPasswordHint", {
                    code: (chunks) => (
                      <code className="font-mono text-foreground">{chunks}</code>
                    ),
                  })}
                </p>
              </CardContent>
            </Card>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.noAccountPrompt")}{" "}
            <Link
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              {t("auth.signUp")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
