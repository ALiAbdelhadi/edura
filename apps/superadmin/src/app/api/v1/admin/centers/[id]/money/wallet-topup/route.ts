import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminTopUpWallet } from "@/lib/services/admin/center-money";

// CREDIT ONLY, and positive-only by schema. There is no counter-side wallet
// debit anywhere in the product: money goes into a student's wallet here, and
// only their own spending or a refund takes it out.
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ studentId: z.uuid(), amount: z.number().int().positive() })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminTopUpWallet(user, id, body), { status: 201 });
});
