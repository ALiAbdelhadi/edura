import { withErrors } from "@repo/server-core/errors/http";
import { delegated, toActingUser } from "@repo/server-core/authz/teacher-actor";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { ValidationError } from "@repo/server-core/errors/classes";
import { uploadMaterial, listMaterials } from "@repo/server-core/services/materials/materials";

export const GET = withErrors(async (req) => {
  const user = await toActingUser(await requireSession());

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? undefined;

  const materials = await listMaterials(courseId, user);
  return ok(materials);
});

export const POST = delegated(async (req, _ctx, { acting: user }) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new ValidationError("Expected a multipart/form-data body");
  }
  const material = await uploadMaterial(formData, user);
  return ok(material, { status: 201 });
});
