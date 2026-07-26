import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { adminRegisterWalkIn } from "@/lib/services/admin/center-operations";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(20),
    grade: z.string().trim().max(60).optional(),
    locale: z.enum(["ar", "en"]).optional(),
    guardianEmail: z.email().optional(),
    guardianPhone: z.string().trim().min(6).max(20).optional(),
  })
  .strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await adminRegisterWalkIn(user, id, body), { status: 201 });
});
