import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adjustStudentPoints } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";


const bodySchema = z.object({
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().max(500).optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adjustStudentPoints(id, body, user.id));
});
