import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { adminTopUpWallet } from "@/lib/services/admin/center-money";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({ studentId: z.uuid(), amount: z.number().int().positive() })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminTopUpWallet(user, id, body), { status: 201 });
});
