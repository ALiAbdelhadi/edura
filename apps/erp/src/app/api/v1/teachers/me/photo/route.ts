import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { removeTeacherPhoto, setTeacherPhoto } from "@/lib/services/media/profile-images";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  const profile = await scopedDb(user, (tx) =>
    tx.teacherProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");
  return ok({ photoUrl: profile.photoUrl });
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ValidationError("Expected multipart/form-data with a file field");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("A file is required");

  return ok(await setTeacherPhoto(file, user), { status: 201 });
});

export const DELETE = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await removeTeacherPhoto(user));
});
