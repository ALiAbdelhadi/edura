"use client";

import { useEffect, useState } from "react";
import { UserRoundCog } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";
import { toast } from "@repo/ui/components/sonner";

import { authClient } from "@/lib/auth/client";

export function ImpersonationBanner() {
  const t = useTranslations("adminUsers");
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void authClient.getSession().then(({ data }) => {
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
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/impersonation/stop", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message);
      }
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error((e as { message?: string })?.message || t("actionFailed"));
      setBusy(false);
    }
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
