import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { updateMaterial, deleteMaterial } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

export const PATCH = withErrors(async (req, ctx) => {
  const user = await requireRole("teacher");
  const materialId = ((await ctx?.params) as { id: string }).id;
  const formData = await req.formData();
  const material = await updateMaterial(materialId, formData, user);
  return ok(material);
});

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("teacher");
  const materialId = ((await ctx?.params) as { id: string }).id;
  const result = await deleteMaterial(materialId, user);
  return ok(result);
});
