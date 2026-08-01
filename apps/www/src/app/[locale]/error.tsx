"use client";

import { Button } from "@repo/ui/components/button";
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
  const t = useTranslations("shared");
  useEffect(() => {
    // Digest only — the raw message may carry internals (M4 discipline).
    console.error("[error-boundary]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--paper)] px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-[var(--red-soft)] text-[var(--red)]">
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="text-2xl font-bold text-[var(--ink)]">{t("errorTitle")}</h1>
      <p className="max-w-sm text-sm text-[var(--ink-2)]">{t("errorBody")}</p>
      <Button onClick={reset} className="mt-2">
        {t("errorRetry")}
      </Button>
    </div>
  );
}
