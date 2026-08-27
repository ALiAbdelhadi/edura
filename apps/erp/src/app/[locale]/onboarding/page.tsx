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

const WIZARD_ROLES = new Set<string>(["student", "teacher", "center_admin"]);

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
    const back = emailToken
      ? `/${locale}/onboarding?token=${encodeURIComponent(emailToken)}`
      : `/${locale}/onboarding`;
    redirect(`/${locale}/login?next=${encodeURIComponent(back)}`);
  }

  const portal = portalForRole(user.role);
  if (!WIZARD_ROLES.has(user.role)) {
    redirect(`/${locale}${portal ?? "/dashboard"}`);
  }
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
