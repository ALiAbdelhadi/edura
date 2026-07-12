import { withErrors } from "@/lib/errors/http";
import { getSessionUser } from "@/lib/auth/session";
import { requireRole } from "@/lib/authz/requireRole";
import { ok } from "@/lib/http/envelope";
import { ForbiddenError } from "@/lib/errors/classes";
import { uploadMaterial, listMaterials } from "@/lib/services/materials/materials";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Not authenticated");

  const url = new URL(req.url);
  const courseId = url.searchParams.get("courseId") ?? undefined;

  const materials = await listMaterials(courseId, user);
  return ok(materials);
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const formData = await req.formData();
  const material = await uploadMaterial(formData, user);
  return ok(material, { status: 201 });
});
