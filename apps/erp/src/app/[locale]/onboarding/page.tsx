import { redirect } from "next/navigation";
import { portalForRole } from "@/lib/auth/portal";
import { getSessionUser } from "@/lib/auth/session";
import { getCatalogTree } from "@/lib/services/catalog/catalog-read";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/services/catalog/onboarding";
import { verifyOnboardingToken } from "@/lib/services/onboarding/welcome-email";
import OnboardingClient, {
  type OnboardingTokenState,
  type WizardRole,
} from "./onboarding-client";

export const dynamic = "force-dynamic";

/** The three roles that have a wizard. Everyone else is sent to their portal. */
const WIZARD_ROLES = new Set<string>(["student", "teacher", "center_admin"]);

/**
 * Onboarding, decided on the SERVER.
 *
 * Every question this screen used to ask the network — who am I, may I be here,
 * have I already finished, is this link still good, what does the catalog look
 * like, what did I save last time — is answered in one server pass before any
 * HTML is sent. The screen that arrives is the wizard, filled.
 *
 * The order matters and is fixed: identity, then role, then completion, then
 * the link. Checking the token first would verify a link for a visitor who
 * turns out to be signed out.
 */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const editMode = query.edit === "1";
  const emailToken = typeof query.token === "string" ? query.token : null;

  const user = await getSessionUser();
  if (!user) {
    // Carry the whole address, token included, so signing in resumes the link
    // rather than dropping the reader on a dashboard.
    const back = emailToken
      ? `/${locale}/onboarding?token=${encodeURIComponent(emailToken)}`
      : `/${locale}/onboarding`;
    redirect(`/${locale}/login?next=${encodeURIComponent(back)}`);
  }

  const portal = portalForRole(user.role);
  if (!WIZARD_ROLES.has(user.role)) {
    redirect(`/${locale}${portal ?? "/dashboard"}`);
  }
  // `?edit=1` is how a finished user re-opens the wizard on purpose; without it
  // a finished user has no business here.
  if (!editMode && (await isOnboardingComplete(user))) {
    redirect(`/${locale}${portal ?? "/dashboard"}`);
  }

  let tokenState: OnboardingTokenState = "ok";
  if (emailToken) {
    const check = await verifyOnboardingToken(emailToken);
    tokenState =
      check.status === "valid"
        ? check.userId === user.id
          ? "ok"
          : "mismatch"
        : (check.status as OnboardingTokenState);
  }

  const [tree, state] = await Promise.all([
    getCatalogTree(),
    getOnboardingState(user),
  ]);

  return (
    <OnboardingClient
      role={user.role as WizardRole}
      tokenState={tokenState}
      tree={tree}
      state={state}
    />
  );
}
