import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { approveSubjectRequest } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

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

export const POST = withRole("super_admin", async (user, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, bodySchema);
  return ok(await approveSubjectRequest(id, user, body));
});
