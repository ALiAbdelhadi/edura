"use client";

import { Button } from "@repo/ui/components/button";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    console.error("[error-boundary]", error.digest ?? error.message);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--paper) px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-destructive-foreground text-destructive">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="text-2xl font-bold text-(--ink)">{t("errorTitle")}</h1>
      <p className="max-w-sm text-sm text-(--ink-2)">{t("errorBody")}</p>
      <Button onClick={reset} className="mt-2">
        {t("errorRetry")}
      </Button>
    </div>
  );
}
