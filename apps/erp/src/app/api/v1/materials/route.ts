import { withErrors } from "@/lib/errors/http";
import { delegated, toActingUser } from "@/lib/authz/teacher-actor";
import { requireSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import { uploadMaterial, listMaterials } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

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
