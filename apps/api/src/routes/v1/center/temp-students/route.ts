import { z } from "zod";
import { centerStaff, RECEPTION } from "@repo/server-core/authz/center-actor";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { phoneSchema } from "@repo/server-core/validation/common";
import { createTempStudent } from "@repo/server-core/services/temp-students/temp-students";

const bodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  grade: z.string().trim().max(50).optional(),
});

export const POST = centerStaff(
  async (req, _ctx, { acting: user }) => {
    const body = await parseJson(req, bodySchema);
    return ok(await createTempStudent(body, user), { status: 201 });
  },
  { allow: RECEPTION },
);
