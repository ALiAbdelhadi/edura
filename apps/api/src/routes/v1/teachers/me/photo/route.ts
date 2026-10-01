import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { ValidationError } from "@repo/server-core/errors/classes";
import { removeTeacherPhoto, setTeacherPhoto } from "@repo/server-core/services/media/profile-images";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";
import { getTeacherPhotoUrl } from "@repo/server-core/services/teacher/profile-photo";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await getTeacherPhotoUrl(user));
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
