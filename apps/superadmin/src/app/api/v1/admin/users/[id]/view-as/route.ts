import { appBaseUrl } from "@repo/server-core/http/app-url";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { assertViewAsTarget, startViewAs } from "@/lib/services/admin/admin-users";

export const dynamic = "force-dynamic";

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

export const POST = withRole("super_admin", async (actor, _req, ctx) => {
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
