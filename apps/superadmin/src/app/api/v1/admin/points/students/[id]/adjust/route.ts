import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adjustStudentPoints } from "@/lib/services/points/points-admin";

export const dynamic = "force-dynamic";


const bodySchema = z.object({
  delta: z.number().int(),
  reason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().max(500).optional(),
});

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adjustStudentPoints(id, body, user.id));
});
