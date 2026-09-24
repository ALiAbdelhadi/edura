import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateReview } from "@/lib/services/reviews/reviews";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

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
