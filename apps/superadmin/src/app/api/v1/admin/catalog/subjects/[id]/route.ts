import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { updateSubject } from "@/lib/services/catalog/catalog-admin";
import { parseJson } from "@/lib/validation/zod";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  nameAr: z.string().trim().min(1).max(200).optional(),
  nameEn: z.string().trim().min(1).max(200).optional(),
  language: z.enum(["ar", "en"]).optional(),
  isAzhari: z.boolean().optional(),
  isSecondLanguage: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export const PATCH = withRole("super_admin", async (actor, req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateSubject(id, body, actor));
});
