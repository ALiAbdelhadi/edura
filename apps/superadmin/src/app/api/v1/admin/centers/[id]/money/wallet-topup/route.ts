import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { adminTopUpWallet } from "@/lib/services/admin/center-money";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

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
