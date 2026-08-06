"use client";

import { Eyebrow, Sheet, ledgerMono, ledgerShellScope } from "@/components/ledger";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { CalendarCheck, CreditCard, GraduationCap, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, type ReactNode } from "react";

export function AuthShell({
  children,
  variant = "signin",
}: {
  children: ReactNode;
  variant?: "signin" | "signup";
}) {
  const t = useTranslations();
  const isSignup = variant === "signup";

  const features = [
    { icon: CalendarCheck, label: t("auth.heroFeatureAttendance") },
    { icon: CreditCard, label: t("auth.heroFeaturePayments") },
    { icon: Users, label: t("auth.heroFeatureRoles") },
  ];
  const steps = [t("auth.heroStep1"), t("auth.heroStep2"), t("auth.heroStep3")];

  return (
    <div
      className={`${ledgerMono.variable} ${ledgerShellScope} flex min-h-dvh w-full flex-col`}
      style={{ background: "var(--paper)" }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 items-center justify-center rounded-lg"
            style={{ background: "var(--indigo-soft)", color: "var(--indigo)" }}
          >
            <GraduationCap aria-hidden className="size-4" />
          </span>
          <span className="text-[15px] font-bold leading-none" style={{ color: "var(--ink)" }}>
            Edura
          </span>
        </div>
        <Suspense fallback={null}>
          <LanguageSwitcher />
        </Suspense>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div className="grid w-full max-w-4xl items-center gap-10 lg:grid-cols-2">
          <aside
            className={`hidden lg:block ${isSignup ? "lg:order-2" : ""}`}
            style={{ color: "var(--ink-2)" }}
          >
            <Eyebrow>{isSignup ? t("auth.heroSignupBadge") : "Edura"}</Eyebrow>
            <h2
              className="mt-2 text-3xl font-bold leading-tight"
              style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
            >
              {isSignup ? t("auth.heroTaglineSignup") : t("auth.heroTagline")}
            </h2>
            <p className="mt-3 max-w-[46ch] text-sm leading-relaxed">
              {isSignup ? t("auth.heroSubtitleSignup") : t("auth.heroSubtitle")}
            </p>
            <div className="mt-7 pt-6" style={{ borderTop: "1px solid var(--rule)" }}>
              {isSignup ? (
                <>
                  <Eyebrow>{t("auth.heroStepsTitle")}</Eyebrow>
                  <ol className="mt-3 flex flex-col gap-3 text-sm">
                    {steps.map((label, i) => (
                      <li key={label} className="flex items-center gap-3">
                        <span
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
                          style={{
                            background: "var(--indigo-soft)",
                            color: "var(--indigo)",
                            fontFamily: "var(--ledger-mono), ui-monospace, monospace",
                          }}
                        >
                          {i + 1}
                        </span>
                        {label}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {features.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-3">
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-md"
                        style={{ background: "var(--field)", color: "var(--ink-2)" }}
                      >
                        <Icon aria-hidden className="size-4" />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
          <div className={`mx-auto w-full max-w-sm ${isSignup ? "lg:order-1" : ""}`}>
            <Sheet className="p-6 sm:p-7">{children}</Sheet>
          </div>
        </div>
      </main>
      <footer className="shrink-0 px-6 pb-6 text-center">
        <span
          dir="ltr"
          className="text-xs"
          style={{
            color: "var(--ink-3)",
            fontFamily: "var(--ledger-mono), ui-monospace, monospace",
          }}
        >
          © {new Date().getFullYear()} Edura
        </span>
      </footer>
    </div>
  );
}
