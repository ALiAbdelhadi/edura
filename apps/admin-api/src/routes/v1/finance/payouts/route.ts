import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { listPayouts, generatePayouts } from "@repo/server-core/backoffice/finance/payouts";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  return ok(await listPayouts({ status: p.get("status") ?? undefined, beneficiaryType: p.get("type") ?? undefined }));
});

export const POST = withRole(["accountant", "super_admin"], async (user) => {
  return ok(await generatePayouts(user), { status: 201 });
});
