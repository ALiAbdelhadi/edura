"use client";

import { AuthShell } from "@/components/kit/auth-shell";
import { PasswordInput } from "@/components/kit/password-input";
import { LedgerButton } from "@/components/ledger";
import { zodResolver } from "@hookform/resolvers/zod";
import { EGYPT_PHONE_RE } from "@repo/server-core/validation/common";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import ky from "ky";
import {
  Building2,
  Clock,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
  UserPlus,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type RoleOption = "student" | "parent" | "teacher" | "center_admin";

const ROLE_OPTIONS = [
  {
    value: "student",
    labelKey: "roles.student",
    descKey: "auth.roleStudentDesc",
  },
  { value: "parent", labelKey: "roles.parent", descKey: "auth.roleParentDesc" },
  {
    value: "teacher",
    labelKey: "roles.teacher",
    descKey: "auth.roleTeacherDesc",
  },
  {
    value: "center_admin",
    labelKey: "auth.roleCenterLabel",
    descKey: "auth.roleCenterDesc",
  },
] as const satisfies readonly {
  value: RoleOption;
  labelKey: string;
  descKey: string;
}[];

type RegisterFormValues = {
  name: string;
  email: string;
  phone?: string;
  centerName?: string;
  address?: string;
  password: string;
  confirmPassword: string;
};

type ApiError = {
  code?: string;
  message?: string;
  fields?: Record<string, string[]>;
};

function readApiError(err: unknown): ApiError | undefined {
  const data = (err as { data?: unknown } | undefined)?.data;
  const parsed =
    typeof data === "string"
      ? (() => {
          try {
            return JSON.parse(data) as unknown;
          } catch {
            return undefined;
          }
        })()
      : data;
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return (parsed as { error?: ApiError }).error;
  }
  return undefined;
}

const SERVER_FIELD_TO_FORM: Record<string, keyof RegisterFormValues> = {
  adminName: "name",
  name: "name",
  email: "email",
  phone: "phone",
  password: "password",
  centerName: "centerName",
  address: "address",
};

export default function RegisterPage() {
  const t = useTranslations();
  const [role, setRole] = useState<RoleOption>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);

  const schema = z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { message: t("auth.nameRequired") }),
      email: z
        .string()
        .min(1, { message: t("auth.emailRequired") })
        .email({ message: t("auth.emailInvalid") }),
      phone: z
        .string()
        .optional()
        .refine((v) => !v?.trim() || EGYPT_PHONE_RE.test(v.trim()), {
          message: t("auth.phoneInvalid"),
        }),
      centerName: z.string().optional(),
      address: z.string().optional(),
      password: z
        .string()
        .min(1, { message: t("auth.passwordRequired") })
        .min(8, { message: t("auth.passwordMinLength") })
        .regex(/[A-Za-z]/, { message: t("auth.passwordNeedsLetter") })
        .regex(/[0-9]/, { message: t("auth.passwordNeedsDigit") }),
      confirmPassword: z
        .string()
        .min(1, { message: t("auth.confirmPasswordRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.passwordsNoMatch"),
      path: ["confirmPassword"],
    })
    .refine(
      (data) =>
        role !== "center_admin" || (data.centerName?.trim().length ?? 0) > 0,
      {
        message: t("auth.centerNameRequired"),
        path: ["centerName"],
      },
    );

  // Sign-in hands unregistered visitors over with their email in the query
  // (login page "create an account" CTA) — carry it into the form so they
  // never retype it. Anything non-email-shaped is simply ignored.
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email");
  const prefilledEmail =
    emailParam && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam) ? emailParam : "";

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: prefilledEmail,
      phone: "",
      centerName: "",
      address: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setLoading(true);
    setError(null);
    const email = values.email.trim().toLowerCase();
    try {
      const endpoint =
        role === "center_admin"
          ? "/api/v1/auth/register/center"
          : `/api/v1/auth/register/${role}`;
      const payload =
        role === "center_admin"
          ? {
              centerName: values.centerName?.trim() || values.name.trim(),
              adminName: values.name.trim(),
              email,
              password: values.password,
              phone: values.phone?.trim() || undefined,
              address: values.address?.trim() || undefined,
              locale: "ar",
            }
          : {
              name: values.name.trim(),
              email,
              password: values.password,
              phone: values.phone?.trim() || undefined,
              locale: "ar",
            };

      const created = await ky
        .post(endpoint, { json: payload })
        .json<{ data?: { user?: { status?: string } } }>();

      if (created?.data?.user?.status !== "active") {
        setPendingApproval(true);
        return;
      }

      const { error: signInError } = await authClient.signIn.email({
        email,
        password: values.password,
      });

      if (signInError) {
        window.location.assign("/login");
        return;
      }

      window.location.assign("/dashboard");
    } catch (err: unknown) {
      const apiError = readApiError(err);

      let anchored = false;
      for (const [serverField, messages] of Object.entries(
        apiError?.fields ?? {},
      )) {
        const formField = SERVER_FIELD_TO_FORM[serverField];
        if (!formField || !messages?.length) continue;
        form.setError(formField, { type: "server", message: messages[0] });
        anchored = true;
      }

      if (apiError?.code === "conflict") {
        setError(t("auth.emailOrPhoneInUse"));
        form.setError("email", {
          type: "server",
          message: t("auth.emailOrPhoneInUse"),
        });
      } else if (anchored) {
        setError(t("auth.fixFieldsBelow"));
      } else {
        setError(apiError?.message || t("auth.registrationFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  if (pendingApproval) {
    return (
      <AuthShell variant="signup">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Waiting is amber in this system — it is the one state an operator
              scans for, and it is not an error. */}
          <div
            className="flex size-11 items-center justify-center rounded-lg"
            style={{ background: "var(--amber-soft)", color: "var(--amber)" }}
          >
            <Clock className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {t("auth.pendingApprovalTitle")}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
              {t("auth.pendingApprovalBody")}
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold"
            style={{
              background: "var(--indigo)",
              color: "var(--indigo-ink)",
              border: "1px solid var(--indigo)",
            }}
          >
            {t("auth.signInTitle")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  const activeRole = ROLE_OPTIONS.find((o) => o.value === role)!;

  return (
    <AuthShell variant="signup">
      <div className="mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
        >
          {t("auth.createAccountTitle")}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {t("auth.registerSubtitle")}
        </p>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
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
            <Label>{t("auth.roleSelectLabel")}</Label>
            <div
              className="grid grid-cols-2 gap-1 rounded-lg p-1 sm:grid-cols-4"
              style={{ background: "var(--field)", border: "1px solid var(--rule)" }}
            >
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRole(opt.value)}
                    className="rounded-md px-1 py-2 text-center text-sm font-medium transition-colors"
                    style={
                      active
                        ? { background: "var(--indigo-soft)", color: "var(--indigo)", fontWeight: 600 }
                        : { color: "var(--ink-2)" }
                    }
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(activeRole.descKey)}
              {(role === "teacher" || role === "center_admin") &&
                ` — ${t("auth.approvalRequiredHint")}`}
            </p>
          </div>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.fullName")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <Input
                      className="ps-9"
                      placeholder={t("auth.fullNamePlaceholder")}
                      autoComplete="name"
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
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.phoneOptional")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <Input
                      className="ps-9"
                      placeholder={t("auth.phonePlaceholder")}
                      autoComplete="tel"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {role === "center_admin" && (
            <>
              <FormField
                control={form.control}
                name="centerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.centerName")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                        <Input
                          className="ps-9"
                          placeholder={t("auth.centerNamePlaceholder")}
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
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.addressOptional")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("auth.centerAddressPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.password")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <PasswordInput
                      className="ps-9"
                      placeholder={t("auth.passwordMinPlaceholder")}
                      autoComplete="new-password"
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
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("auth.confirmPassword")}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute inset-y-0 start-0 my-auto ms-3 size-4 text-muted-foreground" />
                    <PasswordInput
                      className="ps-9"
                      placeholder={t("auth.confirmPasswordPlaceholder")}
                      autoComplete="new-password"
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
          <LedgerButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {t("auth.createAccountTitle")}
          </LedgerButton>
          <p className="text-center text-xs text-muted-foreground">
            {t("auth.consentPrefix")}{" "}
            <Link href="/terms" className="text-primary hover:underline">
              {t("auth.consentTerms")}
            </Link>{" "}
            {t("auth.consentAnd")}{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              {t("auth.consentPrivacy")}
            </Link>
          </p>
        </form>
      </Form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("auth.haveAccountPrompt")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          {t("auth.signInTitle")}
        </Link>
      </p>
    </AuthShell>
  );
}