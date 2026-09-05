import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseOptionalJson } from "@/lib/validation/zod";
import { approveAgreement } from "@/lib/services/admin/teacher-agreements-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ effectiveFrom: z.string().datetime().optional() }).strict();

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseOptionalJson(req, bodySchema);
  return ok(await approveAgreement(id, user, body.effectiveFrom));
});
