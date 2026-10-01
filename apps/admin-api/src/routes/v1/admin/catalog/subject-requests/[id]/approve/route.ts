import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { approveSubjectRequest } from "@repo/server-core/services/catalog/catalog-admin";
import { parseJson } from "@repo/server-core/validation/zod";
import { z } from "zod";

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
