import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { updateGradeLevel } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nameAr: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  level: z.number().int().min(1).max(12).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const PATCH = withErrors(async (req, ctx) => {
  await requireRole("super_admin");
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateGradeLevel(id, body));
});
