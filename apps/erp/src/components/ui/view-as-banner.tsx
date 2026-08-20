import { UserRoundCog } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { getSessionUser } from "@/lib/auth/session";
import { getViewAsContext } from "@/lib/auth/view-as";

/**
 * شريط المعاينة / "You are viewing as …".
 *
 * A view-as session is INDISTINGUISHABLE from a real one — every screen, every
 * route and every money path behaves exactly as it does for the real user,
 * because it is their session. That is the feature, and it is also the hazard,
 * so this bar exists to make sure nobody forgets which of those two things is
 * happening.
 *
 * A SERVER component, on purpose. The superadmin app's equivalent banner is a
 * client component that asks `authClient.getSession()` after paint; here the
 * fact comes from `auth_sessions.impersonated_by` on the server, so the bar is
 * present in the FIRST byte of HTML. A warning that arrives one render after
 * the dashboard is a warning that can be acted past.
 *
 * The stop control is a plain `<form method="post">`, not a fetch button: it
 * works with no JavaScript, before hydration, and on a page whose scripts
 * failed — the one control on the screen that must never be the thing that is
 * broken.
 *
 * COST: one session read per dashboard render for everyone, and a second
 * lookup (the admin's name) ONLY when a view-as is actually active. That
 * respects the on-demand-reads default: the rare case pays for itself.
 */
export async function ViewAsBanner() {
  const context = await getViewAsContext();
  if (!context) return null;

  const t = await getTranslations("shared.viewAs");
  // TWO different people, and the bar has to keep them apart.
  //
  // The heading names WHOSE ACCOUNT this is — the same person the sidebar
  // names — and the line under it names the super admin driving it. Both read
  // from the same variable at first, so the bar said "viewing as <the admin>"
  // while the sidebar said the teacher: two names for one screen, and the one
  // in the biggest type was the wrong one. Caught by looking at it.
  const target = await getSessionUser();
  const targetName = target?.name || target?.email || t("unnamed");
  const actor = context.actorName || context.actorEmail || t("unnamed");

  return (
    <div
      role="alert"
      // Sticky rather than merely first-in-flow: the portal shells below are
      // full-height, so the page scrolls by this bar's height — and "you are
      // not yourself right now" is the one state that must never scroll away.
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
