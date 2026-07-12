import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { listPayouts, generatePayouts } from "@/lib/services/finance/payouts";

export const dynamic = "force-dynamic";

// PRD §4.3 — accountant + super_admin.
export const GET = withErrors(async (req) => {
  await requireRole("accountant", "super_admin");
  const p = new URL(req.url).searchParams;
  return ok(await listPayouts({ status: p.get("status") ?? undefined, beneficiaryType: p.get("type") ?? undefined }));
});

// Generate pending payouts from unpaid wallet balances.
export const POST = withErrors(async () => {
  await requireRole("accountant", "super_admin");
  return ok(await generatePayouts(), { status: 201 });
});
