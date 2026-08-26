import { redirect } from "next/navigation";
import { CenterStaffPortalHome } from "@/features/admin/center-staff-portal-home";
import { requirePortal } from "@/lib/auth/portal-gate";
import { ForbiddenError } from "@/lib/errors/classes";
import { localizedTitle } from "@/lib/i18n/page-metadata";
import { getStaffMe } from "@/lib/services/center/staff";

export const generateMetadata = localizedTitle("overview");

/**
 * The staff member's sub-role and centre are read HERE, on the server, and
 * handed to the screen — because this page IS the counter board, and the board
 * used to sit behind a client `fetch("center/staff/me")` and a full-screen
 * "loading…" for a value the layout above had already resolved.
 *
 * `requirePortal`, NOT `requireSession` — and the difference is not cosmetic.
 * The layout runs the same gate, but Next renders a layout and its page
 * together rather than one strictly after the other, so this page cannot rely
 * on the layout's redirect having already happened. `requireSession` THROWS on
 * a signed-out caller, and an unauthenticated hit on this route logged an
 * uncaught `AuthError` and rendered an error boundary instead of the login
 * page. `requirePortal` redirects, which is what the layout does and what
 * every other portal route does. Measured before and after with a
 * cookie-less request.
 *
 * The `catch` below is a different, narrow case: the caller IS a staff member,
 * but their centre link was revoked between the gate and this read. It does
 * what the layout does with the same error rather than rendering a portal to
 * someone who no longer has one.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await requirePortal("center_staff", locale);

  let me;
  try {
    me = await getStaffMe(user);
  } catch (err) {
    if (err instanceof ForbiddenError) redirect(`/${locale}/login`);
    throw err;
  }

  return <CenterStaffPortalHome role={me.role} centerName={me.centerName} />;
}
