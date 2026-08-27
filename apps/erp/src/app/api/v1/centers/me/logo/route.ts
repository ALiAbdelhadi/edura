import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import {
  getCenterLogo,
  removeCenterLogo,
  setCenterLogo,
} from "@/lib/services/media/profile-images";

export const dynamic = "force-dynamic";

export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await getCenterLogo(user)),
  { allow: MANAGER },
);

export const POST = centerStaff(
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

export const DELETE = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await removeCenterLogo(user)),
  { allow: MANAGER },
);
