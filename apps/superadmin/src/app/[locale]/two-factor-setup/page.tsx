"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { TwoFactorSetup } from "@/features/security/security-screen";
import { authClient } from "@/lib/auth/client";

export default function TwoFactorSetupPage() {
  const t = useTranslations();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-indigo-soft">
            <ShieldCheck className="size-6 text-indigo" aria-hidden="true" />
          </div>
          <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] text-ink">
            {t("security.setupTitle")}
          </h1>
        </div>
        <TwoFactorSetup required />
        <div className="mt-4 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              try {
                await authClient.signOut();
              } finally {
                window.location.href = "/login";
              }
            }}
          >
            {t("security.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
