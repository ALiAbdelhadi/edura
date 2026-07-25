"use client";

import { useInstallPrompt } from "@/lib/pwa/use-install-prompt";
import { Button } from "@repo/ui/components/button";
import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";

export function InstallPrompt() {
  const t = useTranslations();
  const state = useInstallPrompt();

  if (state.kind === "none") return null;
  const isIos = state.kind === "ios";

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg sm:inset-x-auto sm:end-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {isIos ? <Share className="size-4" /> : <Download className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("pwa.installTitle")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isIos ? t("pwa.iosBody") : t("pwa.installBody")}
        </p>
        <div className="mt-3 flex gap-2">
          {state.kind === "native" && (
            <Button size="sm" onClick={state.install}>
              {t("pwa.installCta")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={state.dismiss}>
            {t("pwa.dismiss")}
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={state.dismiss}
        aria-label={t("pwa.close")}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
