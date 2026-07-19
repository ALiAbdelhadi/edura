import { withErrors } from "@/lib/errors/http";
import { delegated } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import { updateMaterial, deleteMaterial } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

export const PATCH = delegated(async (req, ctx, { acting: user }) => {
  const materialId = ((await ctx?.params) as { id: string }).id;
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new ValidationError("Expected a multipart/form-data body");
  }
  const material = await updateMaterial(materialId, formData, user);
  return ok(material);
});

export const DELETE = delegated(async (_req, ctx, { acting: user }) => {
  const materialId = ((await ctx?.params) as { id: string }).id;
  const result = await deleteMaterial(materialId, user);
  return ok(result);
});
