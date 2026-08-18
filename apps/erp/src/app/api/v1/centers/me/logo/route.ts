import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import {
  getCenterLogo,
  removeCenterLogo,
  setCenterLogo,
} from "@/lib/services/media/profile-images";

export const dynamic = "force-dynamic";

/**
 * Reading the logo lives HERE, beside the writes, rather than on
 * `GET /centers/me` — that route is `requireRole("center_admin")`, so a manager
 * allowed to REPLACE the logo could not read the one they were replacing, and
 * the settings card 403'd for them. The alternative was widening the whole
 * center profile to staff to expose one nullable column; this mirrors
 * `GET /teachers/me/photo` instead, and keeps every verb on this resource
 * behind exactly the same gate.
 */
export const GET = centerStaff(
  async (_req, _ctx, { acting: user }) => ok(await getCenterLogo(user)),
  { allow: MANAGER },
);

/**
 * Center logo upload — the ONLY way the column is written. `PATCH /centers/me`
 * deliberately no longer accepts a `logoUrl` string.
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
