import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { updateReview } from "@repo/server-core/services/reviews/reviews";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

const patchSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(2000).optional(),
});

const handlePatch = withErrors(async (req, ctx) => {
  const user = await requireRole("student");
  const data = await parseJson(req, patchSchema);
  const review = await updateReview((await ctx.params).id, data, user);
  return ok(review);
});

export const PATCH = invalidatesPublicData(handlePatch);
