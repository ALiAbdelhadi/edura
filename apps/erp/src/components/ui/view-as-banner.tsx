import { UserRoundCog } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getSessionUser } from "@/lib/auth/session";
import { getViewAsContext } from "@/lib/auth/view-as";
export async function ViewAsBanner() {
  const context = await getViewAsContext();
  if (!context) return null;

  const t = await getTranslations("shared.viewAs");
  const target = await getSessionUser();
  const targetName = target?.name || target?.email || t("unnamed");
  const actor = context.actorName || context.actorEmail || t("unnamed");

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b-2 border-amber bg-amber-soft px-4 py-2 sm:px-6"
    >
      <UserRoundCog className="size-4 shrink-0 text-amber" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-amber">
          {t("title", { name: targetName })}
        </p>
        <p className="text-[12px] text-amber/90">
          {t("subtitle", { actor })}
        </p>
      </div>
      <form method="post" action="/api/v1/auth/view-as/stop">
        <button
          type="submit"
          className="rounded-md border border-amber px-3 py-1.5 text-[13px] font-bold text-amber"
        >
          {t("stop")}
        </button>
      </form>
    </div>
  );
}
