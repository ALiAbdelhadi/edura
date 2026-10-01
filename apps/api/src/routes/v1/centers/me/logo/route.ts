import { centerStaff, MANAGER } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { ValidationError } from "@repo/server-core/errors/classes";
import {
  getCenterLogo,
  removeCenterLogo,
  setCenterLogo,
} from "@repo/server-core/services/media/profile-images";
import { invalidatesPublicData } from "@repo/server-core/cache/public-data";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await getCenterLogo(user)),
  { allow: MANAGER },
);

const handlePost = centerStaff(
  async (req, _ctx, { acting: user }) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError("Expected multipart/form-data with a file field");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("A file is required");

    return ok(await setCenterLogo(file, user), { status: 201 });
  },
  { allow: MANAGER },
);

const handleDelete = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await removeCenterLogo(user)),
  { allow: MANAGER },
);

export const POST = invalidatesPublicData(handlePost);
export const DELETE = invalidatesPublicData(handleDelete);
