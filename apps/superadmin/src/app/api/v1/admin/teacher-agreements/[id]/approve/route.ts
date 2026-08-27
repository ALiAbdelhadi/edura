import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { approveAgreement } from "@/lib/services/admin/teacher-agreements-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ effectiveFrom: z.string().datetime().optional() }).strict();

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema).catch(() => ({}) as { effectiveFrom?: string });
  return ok(await approveAgreement(id, user, body.effectiveFrom));
});
