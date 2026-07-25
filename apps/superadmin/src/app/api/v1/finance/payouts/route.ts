import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listPayouts, generatePayouts } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams;
  return ok(await listPayouts({ status: p.get("status") ?? undefined, beneficiaryType: p.get("type") ?? undefined }));
});

export const POST = withErrors(async () => {
  const user = await requireRole("accountant", "super_admin");
  return ok(await generatePayouts(user), { status: 201 });
});
