"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Loader2, Lock, Mail, Phone, User, UserPlus } from "lucide-react";
import ky from "ky";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { cn } from "@repo/ui/lib/utils";
import { PasswordInput } from "@/components/kit/password-input";

type RoleOption = "student" | "parent" | "center_admin";

const ROLE_OPTIONS = [
  { value: "student", labelKey: "roles.student", descKey: "auth.roleStudentDesc" },
  { value: "parent", labelKey: "roles.parent", descKey: "auth.roleParentDesc" },
  { value: "center_admin", labelKey: "auth.roleCenterLabel", descKey: "auth.roleCenterDesc" },
] as const satisfies readonly { value: RoleOption; labelKey: string; descKey: string }[];

type RegisterFormValues = {
  name: string;
  email: string;
  phone?: string;
  centerName?: string;
  address?: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const t = useTranslations();
  const [role, setRole] = useState<RoleOption>("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = z
    .object({
      name: z.string().trim().min(1, { message: t("auth.nameRequired") }),
      email: z
        .string()
        .min(1, { message: t("auth.emailRequired") })
        .email({ message: t("auth.emailInvalid") }),
      phone: z.string().optional(),
      centerName: z.string().optional(),
      address: z.string().optional(),
      password: z
        .string()
        .min(1, { message: t("auth.passwordRequired") })
        .min(8, { message: t("auth.passwordMinLength") }),
      confirmPassword: z.string().min(1, { message: t("auth.confirmPasswordRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("auth.passwordsNoMatch"),
      path: ["confirmPassword"],
    })
    .refine(
      (data) => role !== "center_admin" || (data.centerName?.trim().length ?? 0) > 0,
      {
        message: t("auth.centerNameRequired"),
        path: ["centerName"],
      },
    );

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
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
    try {
      if (role === "center_admin") {
        await ky
          .post("/api/v1/auth/register/center", {
            json: {
              centerName: values.centerName?.trim() || values.name.trim(),
              adminName: values.name.trim(),
              email: values.email.trim().toLowerCase(),
              password: values.password,
              phone: values.phone?.trim() || undefined,
              address: values.address?.trim() || undefined,
              locale: "ar",
            },
          })
          .json();
      } else {
        await ky
          .post(`/api/v1/auth/register/${role}`, {
            json: {
              name: values.name.trim(),
              email: values.email.trim().toLowerCase(),
              password: values.password,
              phone: values.phone?.trim() || undefined,
              locale: "ar",
            },
          })
          .json();
      }

      const result = await signIn("credentials", {
        email: values.email.trim().toLowerCase(),
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        window.location.assign("/login");
        return;
      }

      window.location.assign("/dashboard");
    } catch (err: unknown) {
      let msg = t("auth.registrationFailed");
      try {
        const body = (await (err as { response?: Response }).response?.json()) as
          | { error?: { message?: string } }
          | undefined;
        if (body?.error?.message) msg = body.error.message;
      } catch {
        /* ignore */
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
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
            {t("auth.createAccountTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.registerSubtitle")}</p>
        </div>

        <Card className="mb-4">
          <CardContent>
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

                <div className="flex flex-col gap-2">
                  <Label>{t("auth.roleSelectLabel")}</Label>
                  <div className="flex gap-2">
                    {ROLE_OPTIONS.map((opt) => {
                      const active = role === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setRole(opt.value)}
                          className={cn(
                            "flex-1 rounded-lg border-2 px-3 py-2.5 text-center transition-colors",
                            active
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card hover:bg-accent",
                          )}
                        >
                          <div
                            className={cn(
                              "text-sm font-semibold",
                              active ? "text-primary" : "text-card-foreground",
                            )}
                          >
                            {t(opt.labelKey)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {t(opt.descKey)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  {t("auth.createAccountTitle")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.haveAccountPrompt")}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t("auth.signInTitle")}
          </Link>
        </p>
      </div>
    </div>
  );
}
