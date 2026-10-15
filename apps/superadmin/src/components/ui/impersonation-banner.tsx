"use client";

import { useEffect, useState } from "react";
import { UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";

import { useAction } from "@/lib/api/use-action";
import { currentSession } from "@/lib/refine/auth-provider";

export function ImpersonationBanner() {
  const t = useTranslations("adminUsers");
  const [who, setWho] = useState<string | null>(null);
  const { run, busy } = useAction({ url: "admin/impersonation/stop" });

  useEffect(() => {
    let alive = true;
    void currentSession().then((data) => {
      if (!alive) return;
      const impersonatedBy = (data?.session as { impersonatedBy?: string | null } | undefined)
        ?.impersonatedBy;
      if (!impersonatedBy) return;
      setWho(data?.user?.name || data?.user?.email || t("unnamed"));
    });
    return () => {
      alive = false;
    };
  }, [t]);

  if (!who) return null;

  const stop = async () => {
    const res = await run({ values: {} });
    if (res.ok) window.location.href = "/dashboard";
  };

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b-2 border-amber bg-amber-soft px-4 py-2 sm:px-6"
    >
      <UserRoundCog className="size-4 shrink-0 text-amber" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] font-bold text-amber">
        {t("impersonatingAs", { name: who })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        className="border-amber text-amber"
        onClick={() => void stop()}
      >
        {t("stopImpersonating")}
      </Button>
    </div>
  );
}
