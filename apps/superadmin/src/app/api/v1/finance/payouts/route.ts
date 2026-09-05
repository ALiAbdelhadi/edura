import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listPayouts, generatePayouts } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

export const GET = withRole(["accountant", "super_admin"], async (_user, req) => {
  const p = new URL(req.url).searchParams;
  return ok(await listPayouts({ status: p.get("status") ?? undefined, beneficiaryType: p.get("type") ?? undefined }));
});

export const POST = withRole(["accountant", "super_admin"], async (user) => {
  return ok(await generatePayouts(user), { status: 201 });
});
