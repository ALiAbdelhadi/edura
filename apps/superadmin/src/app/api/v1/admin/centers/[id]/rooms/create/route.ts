import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createCenterRoom } from "@/lib/services/admin/center-control";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    name: z.string().trim().min(1).max(200),
    capacity: z.number().int().positive().nullable().optional(),
    price: z.number().int().nonnegative().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  return ok(await createCenterRoom(id, body, user), { status: 201 });
});
