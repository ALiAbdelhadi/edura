"use client";

import { useEffect, useMemo, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Phone, Save, CheckCircle2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@repo/ui/components/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { toast } from "@repo/ui/components/sonner";
import { DescriptionList } from "@/components/kit/description-list";
import { PageHeader } from "@/components/kit/page-header";
import { AttendanceModeCard } from "@/features/settings/attendance-mode-card";
import { ProfileImageCard } from "@/features/settings/profile-image-card";
import { DataRightsCard } from "@/features/settings/data-rights-card";
import { SessionsCard } from "@/features/settings/sessions-card";
import { StudentIdSettingsCard } from "@/features/student/student-id-settings-card";
import { TwoFactorCard } from "@/features/settings/two-factor-card";
import { PasswordCard } from "@/features/settings/password-card";
import { Spinner } from "@/components/kit/spinner";
import {
  Figure,
  SectionHead,
  SkeletonRows,
} from "@repo/ui/components/ledger";
import { asKey } from "@/lib/i18n/keys";
import { usePushSubscription } from "@/lib/pwa/use-push-subscription";

function PushNotificationsCard() {
  const t = useTranslations();
  const { state, isBusy, subscribe, unsubscribe } = usePushSubscription();

  if (state === "unsupported") return null;

  const handleToggle = async () => {
    if (state === "subscribed") {
      await unsubscribe();
      toast.success(t("shared.pushDisabled"));
      return;
    }
    const subscribed = await subscribe();
    if (subscribed) toast.success(t("shared.pushEnabled"));
    else if (state !== "denied") toast.error(t("shared.pushEnableFailed"));
  };

  const description =
    state === "denied"
      ? t("shared.pushDescDenied")
      : state === "subscribed"
        ? t("shared.pushDescEnabled")
        : t("shared.pushDescDisabled");

  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={t("shared.pushTitle")} />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-ink-2">{description}</p>
          <Button
            type="button"
            variant={state === "subscribed" ? "outline" : "default"}
            disabled={isBusy || state === "denied"}
            onClick={handleToggle}
          >
            {isBusy && <Spinner />}
            {state === "subscribed"
              ? t("shared.pushDisable")
              : t("shared.pushEnable")}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SettingsScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const { query, result } = useCustom({ url: "me", method: "get" });
  const { mutateAsync: updateMe } = useCustomMutation();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const me = result?.data as any;

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("shared.settingsNameRequired")),
        phone: z.string().optional(),
        locale: z.string(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", locale: "ar" },
  });

  useEffect(() => {
    if (me) {
      form.reset({
        name: me.name || "",
        phone: me.phone || "",
        locale: me.locale || "ar",
      });
    }
  }, [me, form]);

  const handleSave = async (values: FormValues) => {
    setLoading(true);
    setSaved(false);
    try {
      await updateMe({
        url: "me",
        method: "patch",
        values: {
          name: values.name.trim(),
          phone: values.phone?.trim() || undefined,
          locale: values.locale,
        },
      });
      toast.success(t("shared.settingsSaved"));
      setSaved(true);
    } catch (err: any) {
      toast.error(err?.message || t("shared.settingsSaveFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (query.isLoading) {
    return <SkeletonRows rows={5} className="max-w-[600px]" />;
  }

  return (
    <div className="flex w-full max-w-[600px] flex-col gap-5">
      <PageHeader title={t("nav.settings")} />
      {me?.role === "teacher" || me?.role === "assistant" ? <AttendanceModeCard /> : null}
      {me?.role === "teacher" ? (
        <ProfileImageCard variant="teacherPhoto" name={me?.name} />
      ) : null}
      {me?.role === "center_admin" ? (
        <ProfileImageCard variant="centerLogo" name={me?.name} />
      ) : null}
      {/* The student's ID card, on the account screen it was asked for. */}
      {me?.role === "student" ? <StudentIdSettingsCard /> : null}
      <section className="flex flex-col gap-3">
        <SectionHead title={t("shared.settingsProfile")} />
        <div className="rounded-xl border border-rule bg-sheet p-4">
          <DescriptionList
            columns={1}
            className="mb-6"
            items={[
              {
                label: t("auth.email"),
                // An email is Latin inside an Arabic column: mono and
                // bidi-isolated, or it drags the row's punctuation around.
                value: me?.email ? <Figure>{me.email}</Figure> : "",
              },
              {
                label: t("shared.settingsRole"),
                value: me?.role
                  ? t.has(asKey(`roles.${me.role}`))
                    ? t(asKey(`roles.${me.role}`))
                    : me.role.replace("_", " ")
                  : "",
              },
              {
                label: t("shared.settingsStatus"),
                value: me?.status
                  ? t.has(asKey(`status.${me.status}`))
                    ? t(asKey(`status.${me.status}`))
                    : me.status
                  : "",
              },
            ]}
          />

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSave)}
              className="flex flex-col gap-4"
            >
              {saved && (
                <Alert className="relative border-rule bg-teal-soft text-teal">
                  <CheckCircle2 />
                  <AlertDescription className="text-teal">
                    {t("shared.settingsSavedAlert")}
                  </AlertDescription>
                  <button
                    type="button"
                    onClick={() => setSaved(false)}
                    // Was a hardcoded English "Dismiss" — invisible to the
                    // Arabic-first audience this product is built for.
                    aria-label={t("actions.dismiss")}
                    className="absolute inset-y-0 end-0 flex items-center pe-3 text-teal transition-opacity hover:opacity-70"
                  >
                    <X className="size-4" />
                  </button>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shared.settingsName")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-3">
                          <User className="size-4" />
                        </span>
                        <Input
                          className="ps-9"
                          placeholder={t("shared.settingsNamePlaceholder")}
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
                    <FormLabel>{t("shared.settingsPhone")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-3">
                          <Phone className="size-4" />
                        </span>
                        <Input
                          className="ps-9"
                          placeholder={t("shared.settingsPhonePlaceholder")}
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
                name="locale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("shared.settingsLanguage")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ar">العربية (Arabic)</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Button type="submit" disabled={loading}>
                  {loading ? <Spinner /> : <Save className="size-4" />}
                  {t("shared.settingsSaveChanges")}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </section>
      <PushNotificationsCard />
      {/* Guided 2FA for center owners and teachers (optional but encouraged);
          everyone gets the devices & sessions list. */}
      {me?.role === "center_admin" || me?.role === "teacher" ? <TwoFactorCard /> : null}
      {/* Changing your own password is a right EVERY role has, and the card is
          role-agnostic. It is scoped to the teacher portal only because the
          other portals are under pre-launch review in parallel and a new card
          appearing mid-walkthrough is noise for that reviewer. Widening is this
          condition, deleted. */}
      {me?.role === "teacher" || me?.role === "assistant" ? (
        <PasswordCard locale={locale} />
      ) : null}
      <SessionsCard />
      {/* Law 151/2020: export and erasure, on every role's settings screen.
          These are rights, not a feature for one portal. */}
      <DataRightsCard />
    </div>
  );
}
