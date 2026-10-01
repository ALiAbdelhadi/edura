import { withErrors } from "@repo/server-core/errors/http";
import { delegated } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { ValidationError } from "@repo/server-core/errors/classes";
import { updateMaterial, deleteMaterial } from "@repo/server-core/services/materials/materials";

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
