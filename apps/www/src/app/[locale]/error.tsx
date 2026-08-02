"use client";

import * as Sentry from "@sentry/nextjs";

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
  // `errorPage`, NOT `shared`. This boundary replaces the children of the
  // [locale] layout, so it renders under THAT layout's provider — which ships
  // only `baseMessages()` (the top-level keys of en.json). `shared` is mounted
  // from its own file and reaches the client only under dashboard/layout.tsx,
  // so every error outside the dashboard threw MISSING_MESSAGE here and the
  // error page failed on top of the error it was reporting. `errorPage` lives
  // in en.json, so BASE_KEYS carries it to every route by construction.
  const t = useTranslations("errorPage");
  useEffect(() => {
    // Digest only in the log — the raw message may carry internals
    // (M4 discipline). Sentry gets the full error object, where it is scrubbed
    // by beforeSend (@repo/observability) rather than by omission.
    console.error("[error-boundary]", error.digest ?? error.message);
    Sentry.captureException(error);
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
