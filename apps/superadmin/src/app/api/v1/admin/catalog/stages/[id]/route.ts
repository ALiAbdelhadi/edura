import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { updateStage } from "@/lib/services/catalog/catalog-admin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nameAr: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  hasSecondLanguage: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const PATCH = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateStage(id, body, actor));
});
