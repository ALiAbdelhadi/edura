"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Progress } from "@repo/ui/components/progress";
import { cn } from "@repo/ui/lib/utils";

export function WizardShell({
  title,
  prompt,
  current,
  total,
  onBack,
  children,
  footer,
}: {
  title: string;
  prompt: string;
  current: number;
  total: number;
  onBack?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
        <header className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              disabled={!onBack}
              className={cn(!onBack && "invisible")}
            >
              <ArrowRight className="size-4 ltr:rotate-180" />
              {t("onboarding.back")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("onboarding.stepOf", { current, total })}
            </span>
          </div>
          <Progress value={(current / total) * 100} aria-label={title} />
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{prompt}</p>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        {footer ? <footer className="sticky bottom-0 bg-background py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function OptionCard({
  title,
  subtitle,
  icon,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border-2 p-4 text-start transition-all",
        "min-h-16 active:scale-[0.99]",
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/40 hover:bg-muted/50",
      )}
    >
      {icon ? <span className="text-primary [&_svg]:size-7">{icon}</span> : null}
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        {subtitle ? <span className="block text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
    </button>
  );
}

export function OptionChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-full border-2 px-4 py-2 text-sm font-medium transition-all active:scale-[0.98]",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:border-primary/40",
      )}
    >
      {label}
    </button>
  );
}
