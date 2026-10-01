import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { adminTopUpWallet } from "@repo/server-core/backoffice/admin/center-money";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

const bodySchema = z
  .object({ studentId: z.uuid(), amount: z.number().int().positive() })
  .strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminTopUpWallet(user, id, body), { status: 201 });
});
