"use client";

import { AuthShell } from "@/components/kit/auth-shell";
import { PasswordInput } from "@/components/kit/password-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Loader2, Lock, LogIn, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

function isSafeNext(value: string | null): value is string {
  return !!value && value.startsWith("/") && !value.startsWith("//");
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z.object({
    email: z
      .string()
      .min(1, { message: t("auth.emailRequired") })
      .email({ message: t("auth.emailInvalid") }),
    password: z.string().min(1, { message: t("auth.passwordRequired") }),
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
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
      <div className="mb-8 flex flex-col items-center text-center">
        <Image
          src="/edura-logo.svg"
          alt="Edura"
          width={120}
          height={90}
          priority
          className="mb-4 h-22.5 w-auto"
        />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("auth.signInTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("auth.signInSubtitle")}
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.email")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <Input
                      type="email"
                      className="ps-9"
                      placeholder={t("auth.emailPlaceholder")}
                      autoComplete="email"
                      {...field}
                    />
                  </div>
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
                  <FormLabel>{t("auth.password")}</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <PasswordInput
                      className="ps-9"
                      placeholder={t("auth.passwordPlaceholder")}
                      autoComplete="current-password"
                      showLabel={t("auth.showPassword")}
                      hideLabel={t("auth.hidePassword")}
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogIn className="size-4" />
            )}
            {t("auth.signInTitle")}
          </Button>
        </form>
      </Form>
      {SHOW_QUICK_LOGINS && (
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("auth.quickDemoLogin")}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_LOGINS.map(({ roleKey, email: qEmail, tone }) => {
              const label = t(roleKey);
              return (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => handleQuickLogin(qEmail)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.noAccountPrompt")}{" "}
        <Link
          href="/register"
          className="font-medium text-primary hover:underline"
        >
          {t("auth.signUp")}
        </Link>
      </p>
    </AuthShell>
  );
}