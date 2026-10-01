import { redirect } from "next/navigation";
import type { CatalogSystem } from "@/features/onboarding/types";
import { portalForRole } from "@/lib/auth/portal";
import { ServiceError, serviceGet } from "@/lib/server/service-fetch";
import { ssrSession } from "@/lib/server/ssr-session";
import OnboardingClient, {
  type OnboardingTokenState,
  type WizardRole,
} from "./onboarding-client";

export const dynamic = "force-dynamic";

const WIZARD_ROLES = new Set<string>(["student", "teacher", "center_admin"]);

// The service answered a 4xx to a caller requirePortal-style checks already
// admitted (session gone between two reads, or a missing profile the old
// in-process call would have thrown for): the same throw to the error boundary.
function required<T>(res: { status: number; data: T | null }, path: string): T {
  if (res.data === null) throw new ServiceError(res.status, path);
  return res.data;
}

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

  const { user, onboardingComplete } = await ssrSession();
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
  if (!editMode && onboardingComplete) {
    redirect(`/${locale}${portal ?? "/dashboard"}`);
  }

  let tokenState: OnboardingTokenState = "ok";
  if (emailToken) {
    // The route already answers "mismatch" for a valid token owned by another user.
    const check = required(
      await serviceGet<{ status: "valid" | "mismatch" | "expired" | "invalid" }>(
        "/api/v1/me/onboarding-email",
        { token: emailToken },
      ),
      "/api/v1/me/onboarding-email",
    );
    tokenState = check.status === "valid" ? "ok" : check.status;
  }

  const [tree, state] = await Promise.all([
    serviceGet<CatalogSystem[]>("/api/v1/catalog/tree").then((r) => required(r, "/api/v1/catalog/tree")),
    serviceGet<unknown>("/api/v1/me/onboarding").then((r) => required(r, "/api/v1/me/onboarding")),
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
