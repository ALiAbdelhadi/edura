import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { approveSubjectRequest } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subjectId: z.string().uuid().optional(),
  newSubject: z
    .object({
      code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]*$/).max(64),
      nameAr: z.string().trim().min(1).max(200),
      nameEn: z.string().trim().min(1).max(200).optional(),
      isAzhari: z.boolean().optional(),
    })
    .optional(),
});

export const POST = withErrors(async (req, ctx) => {
  const user = await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await approveSubjectRequest(id, user.id, body));
});
