import { appBaseUrl } from "@repo/server-core/http/app-url";
import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { assertViewAsTarget, startViewAs } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

/**
 * Ask for a "view as" handoff — a signed 60-second token plus the ERP URL that
 * spends it. See the VIEW AS block in services/admin/admin-users.ts for the
 * boundary this sits on, and apps/erp/src/lib/auth/view-as-plugin.ts for the
 * gates the other side applies.
 *
 * This route MINTS; it does not sign anyone in. Nothing here can create an ERP
 * session — that is the ERP's own decision, made again from scratch when the
 * token is presented. Two independent gates therefore have to agree before
 * anyone is anywhere: `assertViewAsTarget` here, and the six checks there.
 *
 * The token is returned in the RESPONSE BODY rather than baked into a link, so
 * the caller posts it as a form field. A token in a URL ends up in history, in
 * the Referer header of the very next request, and in the access log of every
 * proxy on the way — for a credential that opens a real account, that is three
 * copies too many.
 */
/**
 * WHERE THE ERP LIVES — and why this is its own variable.
 *
 * `appBaseUrl()` cannot answer this question from inside the back office. The
 * two projects share one `.env.production`, and the deploy runbook has THIS
 * project override `APP_BASE_URL` with its own host so its links point at
 * itself; `VERCEL_PROJECT_PRODUCTION_URL` is likewise this app's own domain. So
 * every generic resolver here answers "the back office", and a handoff posted
 * to the back office's own origin would 404 on a route that only exists in the
 * other app — a broken button whose cause is three files away.
 *
 * Required in production, failing closed for the same reason every other
 * cross-app secret does: a misdirected handoff token is a credential sent to
 * the wrong host. In development it falls back to the resolver, where both apps
 * are on localhost and the ports are what differ.
 */
function erpBaseUrl(): string {
  const explicit = process.env.ERP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ERP_BASE_URL is required in production on apps/superadmin (it is where a 'view as' handoff is posted; APP_BASE_URL here is this app's own host)",
    );
  }
  return appBaseUrl().replace(/\/+$/, "");
}

export const POST = withErrors(async (_req, ctx) => {
  const actor = await requireRole("super_admin");
  const { id } = await ctx.params;

  const target = await assertViewAsTarget(actor, id);
  const minted = await startViewAs(actor, target);

  return ok({
    claimUrl: `${erpBaseUrl()}/api/v1/auth/view-as/claim`,
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
    target: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
    },
  });
});
