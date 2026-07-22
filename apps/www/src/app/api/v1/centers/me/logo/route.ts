import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import { removeCenterLogo, setCenterLogo } from "@/lib/services/media/profile-images";

export const dynamic = "force-dynamic";

/**
 * Center logo upload. The existing `PATCH /centers/me { logoUrl }` (paste a
 * URL) still works — this is additive, and gives the center an actual upload
 * path. Open to the `manager` sub-role, matching the room-photo route.
 */
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
