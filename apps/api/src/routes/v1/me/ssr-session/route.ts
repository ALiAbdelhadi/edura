import { getSessionUser } from "@repo/server-core/erp-auth/session";
import { getViewAsContext } from "@repo/server-core/erp-auth/view-as";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { isOnboardingComplete } from "@repo/server-core/services/catalog/onboarding";

// What a server-rendered ERP page used to read in-process: the session (with
// getSessionUser's own null rules — ambiguous cookies, inactive status, an
// expired view-as), whether onboarding is done, and the view-as banner's
// context. Signed out is a 200 with user: null, not a 401: the page decides
// where to send the visitor.
export const GET = withErrors(async () => {
  const user = await getSessionUser();
  const onboardingComplete = user ? await isOnboardingComplete(user) : false;
  const viewAs = await getViewAsContext();
  return ok({ user, onboardingComplete, viewAs });
});
