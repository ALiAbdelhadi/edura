"use client";

import { PageHeader } from "@/components/kit/page-header";
import { Spinner } from "@/components/kit/spinner";
import { AttendanceModeCard } from "@/features/settings/attendance-mode-card";
import { CenterProfileCard } from "@/features/settings/center-profile-card";
import { ChildrenGuardianCards } from "@/features/settings/children-guardian-cards";
import { DataRightsCard } from "@/features/settings/data-rights-card";
import { EmailCard } from "@/features/settings/email-card";
import { GuardianContactCard } from "@/features/settings/guardian-contact-card";
import { OnboardingProfileCard } from "@/features/settings/onboarding-profile-card";
import { PasswordCard } from "@/features/settings/password-card";
import { ProfileImageCard } from "@/features/settings/profile-image-card";
import { SessionsCard } from "@/features/settings/sessions-card";
import { TwoFactorCard } from "@/features/settings/two-factor-card";
import { StudentIdSettingsCard } from "@/features/student/student-id-settings-card";
import { asKey } from "@/lib/i18n/keys";
import { usePushSubscription } from "@/lib/pwa/use-push-subscription";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustom, useCustomMutation } from "@refinedev/core";
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
import { SkeletonRows } from "@repo/ui/components/ledger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/sonner";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Lock,
  Phone,
  Save,
  ShieldCheck,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

type SettingsNavItem = {
  id: string;
  label: ReactNode;
  icon: LucideIcon;
};

function SettingsSidebar({
  items,
  activeSection,
  onNavigate,
  navLabel,
}: {
  items: SettingsNavItem[];
  activeSection: string;
  onNavigate: (id: string) => void;
  navLabel: string;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pb-6">
          <div className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {navLabel}
          </div>

          <nav className="flex flex-col gap-1" aria-label={navLabel}>
            {items.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={[
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-[13px] font-medium transition-all",
                    active
                      ? "bg-ink text-paper shadow-sm"
                      : "text-ink-2 hover:bg-field hover:text-ink",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      active
                        ? "bg-paper/10 text-paper"
                        : "bg-field text-ink-3 group-hover:text-ink-2",
                    ].join(" ")}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1 truncate">{item.label}</span>

                  <ChevronRight
                    className={[
                      "size-3.5 shrink-0 transition-transform",
                      active
                        ? "translate-x-0 opacity-100"
                        : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-60",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile navigation */}
      <div className="lg:hidden">
        <div className="sticky top-16 z-30 -mx-4 overflow-hidden border-y border-rule bg-paper/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <nav
            className="flex gap-1 overflow-x-auto no-scrollbar"
            aria-label={navLabel}
          >
            {items.map((item) => {
              const active = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={[
                    "shrink-0 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-ink text-paper"
                      : "text-ink-2 hover:bg-field",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  label,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-32 lg:scroll-mt-28" // Adjusted for sticky header clearance
      aria-labelledby={`${id}-title`}
    >
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-indigo">
          <Icon className="size-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 pt-0.5">
          <h2
            id={`${id}-title`}
            className="text-[16px] font-semibold tracking-[-0.01em] text-ink"
          >
            {label}
          </h2>

          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-ink-3">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-rule bg-sheet shadow-sm">
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  action,
  last = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-5", // Better spacing for responsive layout
        !last ? "border-b border-rule" : "",
      ].join(" ")}
    >
      <div className="flex flex-1 items-start gap-4 min-w-0">
        {Icon ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-field text-ink-3">
            <Icon className="size-4" aria-hidden="true" />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 pt-0.5">
          <div className="text-[14px] font-medium text-ink">{title}</div>

          {description ? (
            <div className="mt-1.5 text-[13px] leading-5 text-ink-3">
              {description}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-start sm:justify-end sm:ps-0 ps-13">
        {action}
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success";
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        tone === "success"
          ? "bg-teal-soft text-teal"
          : "bg-field text-ink-2",
      ].join(" ")}
    >
      <span
        className={[
          "size-1.5 rounded-full",
          tone === "success" ? "bg-teal" : "bg-ink-3",
        ].join(" ")}
      />
      {children}
    </span>
  );
}

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

    if (subscribed) {
      toast.success(t("shared.pushEnabled"));
    } else if (state !== "denied") {
      toast.error(t("shared.pushEnableFailed"));
    }
  };

  const description =
    state === "denied"
      ? t("shared.pushDescDenied")
      : state === "subscribed"
        ? t("shared.pushDescEnabled")
        : t("shared.pushDescDisabled");

  return (
    <div className="flex flex-col empty:hidden">
      <SettingRow
        icon={Bell}
        title={t("shared.pushTitle")}
        description={description}
        action={
          <Button
            type="button"
            size="sm"
            variant={state === "subscribed" ? "outline" : "default"}
            disabled={isBusy || state === "denied"}
            onClick={handleToggle}
          >
            {isBusy ? <Spinner /> : null}
            {state === "subscribed"
              ? t("shared.pushDisable")
              : t("shared.pushEnable")}
          </Button>
        }
        last
      />
    </div>
  );
}

export function SettingsScreen() {
  const t = useTranslations();
  const locale = useLocale();

  const { query, result } = useCustom({
    url: "me",
    method: "get",
  });

  const { mutateAsync: updateMe } = useCustomMutation();

  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("profile");

  const me = result?.data as any;

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("shared.settingsNameRequired")),
        phone: z.string().optional(),
        locale: z.string(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      locale: "ar",
    },
  });

  useEffect(() => {
    if (!me) return;

    form.reset({
      name: me.name || "",
      phone: me.phone || "",
      locale: me.locale || "ar",
    });
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
      toast.error(
        err?.message || t("shared.settingsSaveFailed"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sections = [
      "profile",
      ...(me?.role === "student" || me?.role === "parent"
        ? ["family"]
        : []),
      "security",
      "notifications",
      "privacy",
    ];

    const elements = sections
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top -
              b.boundingClientRect.top,
          );

        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-120px 0px -60% 0px",
        threshold: 0,
      },
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [me]);

  if (query.isLoading) {
    return <SkeletonRows rows={5} className="max-w-280" />;
  }

  const hasFamilyGroup =
    me?.role === "student" || me?.role === "parent";

  const navigation: SettingsNavItem[] = [
    {
      id: "profile",
      label: t("shared.settingsGroupProfile"),
      icon: User,
    },
    ...(hasFamilyGroup
      ? [
        {
          id: "family",
          label: t("shared.settingsGroupFamily"),
          icon: Users,
        },
      ]
      : []),
    {
      id: "security",
      label: t("shared.settingsGroupSecurity"),
      icon: Lock,
    },
    {
      id: "notifications",
      label: t("nav.notifications"),
      icon: Bell,
    },
    {
      id: "privacy",
      label: t("shared.settingsGroupPrivacy"),
      icon: ShieldCheck,
    },
  ];

  const navigateToSection = (id: string) => {
    const element = document.getElementById(id);

    if (!element) return;

    setActiveSection(id);

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const displayRole = me?.role
    ? t.has(asKey(`roles.${me.role}`))
      ? t(asKey(`roles.${me.role}`))
      : me.role.replace("_", " ")
    : "";

  const displayStatus = me?.status
    ? t.has(asKey(`status.${me.status}`))
      ? t(asKey(`status.${me.status}`))
      : me.status
    : "";

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="flex w-full flex-col gap-8 pb-20">
        <PageHeader title={t("nav.settings")} />
        <section className="overflow-hidden rounded-2xl border border-rule bg-sheet shadow-sm">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-field text-xl font-bold text-ink">
                {me?.name?.slice?.(0, 1)?.toUpperCase?.() || (
                  <User className="size-6 text-ink-3" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="truncate text-[18px] font-bold tracking-tight text-ink">
                    {me?.name || "—"}
                  </h1>
                  {displayStatus ? (
                    <StatusBadge tone="success">
                      {displayStatus}
                    </StatusBadge>
                  ) : null}
                </div>
                <div className="mt-1.5 truncate text-[14px] text-ink-3">
                  {me?.email || "—"}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-3 pt-2 sm:pt-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigateToSection("profile")}
              >
                <User className="size-4" />
                {t("shared.settingsGroupProfile")}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 border-t border-rule sm:grid-cols-3 bg-paper/50">
            <div className="border-b border-rule p-5 sm:border-b-0 sm:border-e">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                {t("shared.settingsRole")}
              </div>
              <div className="mt-2 truncate text-[14px] font-medium text-ink">
                {displayRole || "—"}
              </div>
            </div>
            <div className="border-b border-rule p-5 sm:border-b-0 sm:border-e">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                {t("shared.settingsStatus")}
              </div>
              <div className="mt-2 truncate text-[14px] font-medium text-ink">
                {displayStatus || "—"}
              </div>
            </div>
            <div className="p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                {t("shared.settingsLanguage")}
              </div>
              <div className="mt-2 truncate text-[14px] font-medium text-ink">
                {me?.locale === "en" ? "English" : "العربية"}
              </div>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-stretch lg:gap-12 mt-2">
          <SettingsSidebar
            items={navigation}
            activeSection={activeSection}
            onNavigate={navigateToSection}
            navLabel={t("shared.settingsNavLabel")}
          />
          <main className="min-w-0 space-y-10 pb-12">
            <SettingsSection
              id="profile"
              icon={User}
              label={t("shared.settingsGroupProfile")}
              description={t("shared.settingsSectionProfileDesc")}
            >
              <div className="flex flex-col divide-y divide-rule">
                {me?.role === "teacher" || me?.role === "assistant" ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <AttendanceModeCard />
                  </div>
                ) : null}
                {me?.role === "teacher" ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <ProfileImageCard
                      variant="teacherPhoto"
                      name={me?.name}
                    />
                  </div>
                ) : null}
                {me?.role === "center_admin" ||
                  (me?.role === "center_staff" &&
                    me?.staffRole === "manager") ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <ProfileImageCard
                      variant="centerLogo"
                      name={me?.name}
                    />
                  </div>
                ) : null}
                {me?.role === "center_admin" ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <CenterProfileCard />
                  </div>
                ) : null}
                {me?.role === "student" ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <StudentIdSettingsCard />
                  </div>
                ) : null}
                <div className="p-5 empty:hidden flex flex-col">
                  <OnboardingProfileCard />
                </div>
                <div className="p-5 flex flex-col">
                  <div className="mb-6">
                    <div className="text-[14px] font-semibold text-ink">
                      {t("shared.settingsProfile")}
                    </div>
                    <div className="mt-1.5 text-[13px] text-ink-3">
                      {t("shared.settingsProfileFormDesc")}
                    </div>
                  </div>
                  <Form {...form}>
                    <form
                      onSubmit={form.handleSubmit(handleSave)}
                      className="space-y-6"
                    >
                      {saved ? (
                        <Alert className="relative border-rule bg-teal-soft text-teal">
                          <CheckCircle2 className="size-5" />
                          <AlertDescription className="text-teal font-medium mt-0.5">
                            {t("shared.settingsSavedAlert")}
                          </AlertDescription>
                          <button
                            type="button"
                            onClick={() => setSaved(false)}
                            aria-label={t("actions.dismiss")}
                            className="absolute inset-y-0 inset-e-0 flex items-center pe-4 text-teal transition-opacity hover:opacity-70"
                          >
                            <X className="size-4" />
                          </button>
                        </Alert>
                      ) : null}
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t("shared.settingsName")}
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="pointer-events-none absolute inset-y-0 inset-s-3.5 my-auto size-4 text-ink-3" />
                                  <Input
                                    className="ps-10"
                                    placeholder={t(
                                      "shared.settingsNamePlaceholder",
                                    )}
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
                              <FormLabel>
                                {t("shared.settingsPhone")}
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Phone className="pointer-events-none absolute inset-y-0 inset-s-3.5 my-auto size-4 text-ink-3" />
                                  <Input
                                    className="ps-10"
                                    placeholder={t(
                                      "shared.settingsPhonePlaceholder",
                                    )}
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
                            <FormItem className="md:max-w-md">
                              <FormLabel>
                                {t("shared.settingsLanguage")}
                              </FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="ar">
                                    العربية (Arabic)
                                  </SelectItem>
                                  <SelectItem value="en">
                                    English
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-5 border-t border-rule pt-6 mt-6">
                        <p className="text-[12px] leading-5 text-ink-3">
                          {t("shared.settingsProfileFormFooter")}
                        </p>
                        <Button
                          type="submit"
                          disabled={loading}
                          className="w-full sm:w-auto shrink-0"
                        >
                          {loading ? (
                            <Spinner />
                          ) : (
                            <Save className="size-4" />
                          )}
                          {t("shared.settingsSaveChanges")}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              </div>
            </SettingsSection>
            {hasFamilyGroup ? (
              <SettingsSection
                id="family"
                icon={Users}
                label={t("shared.settingsGroupFamily")}
                description={t("shared.settingsSectionFamilyDesc")}
              >
                <div className="flex flex-col gap-6 p-5 empty:hidden">
                  {me?.role === "student" ? (
                    <GuardianContactCard />
                  ) : null}
                  {me?.role === "parent" ? (
                    <ChildrenGuardianCards />
                  ) : null}
                </div>
              </SettingsSection>
            ) : null}
            <SettingsSection
              id="security"
              icon={Lock}
              label={t("shared.settingsGroupSecurity")}
              description={t("shared.settingsSectionSecurityDesc")}
            >
              <div className="flex flex-col divide-y divide-rule">
                <div className="p-5 empty:hidden flex flex-col">
                  <EmailCard
                    email={me?.email}
                    hasPassword={!!me?.hasPassword}
                    emailVerified={!!me?.emailVerified}
                    onChanged={() => query.refetch()}
                  />
                </div>
                <div className="p-5 empty:hidden flex flex-col">
                  <PasswordCard locale={locale} />
                </div>
                {me?.role === "center_admin" ||
                  me?.role === "teacher" ? (
                  <div className="p-5 empty:hidden flex flex-col">
                    <TwoFactorCard />
                  </div>
                ) : null}
                <div className="p-5 empty:hidden flex flex-col">
                  <SessionsCard />
                </div>
              </div>
            </SettingsSection>
            <SettingsSection
              id="notifications"
              icon={Bell}
              label={t("nav.notifications")}
              description={t("shared.settingsSectionNotificationsDesc")}
            >
              <PushNotificationsCard />
            </SettingsSection>
            <SettingsSection
              id="privacy"
              icon={ShieldCheck}
              label={t("shared.settingsGroupPrivacy")}
              description={t("shared.settingsSectionPrivacyDesc")}
            >
              <div className="flex flex-col divide-y divide-rule">
                <div className="p-5 empty:hidden flex flex-col">
                  <DataRightsCard />
                </div>
              </div>
            </SettingsSection>
            <div className="flex items-center justify-center pt-6 pb-4">
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <CircleCheck className="size-4" />
                {t("shared.settingsFooterNote")}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}