import { centerStaff, MANAGER } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { ValidationError } from "@/lib/errors/classes";
import { uploadRoomPhoto } from "@/lib/services/rooms/rooms";

export const dynamic = "force-dynamic";

export const POST = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { id } = await ctx.params;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError("Expected multipart/form-data with a file field");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("A file is required");

    const result = await uploadRoomPhoto(id, file, user);
    return ok(result, { status: 201 });
  },
  { allow: MANAGER },
);
