import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { NotFoundError, ValidationError } from "@/lib/errors/classes";
import { removeTeacherPhoto, setTeacherPhoto } from "@/lib/services/media/profile-images";
import { invalidatesPublicData } from "@/lib/cache/public-data";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  const profile = await scopedDb(user, (tx) =>
    tx.teacherProfile.findUnique({ where: { userId: user.id }, select: { photoUrl: true } }),
  );
  if (!profile) throw new NotFoundError("Teacher profile not found");
  return ok({ photoUrl: profile.photoUrl });
});

const handlePost = withErrors(async (req) => {
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

const handleDelete = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await removeTeacherPhoto(user));
});

export const POST = invalidatesPublicData(handlePost);
export const DELETE = invalidatesPublicData(handleDelete);
