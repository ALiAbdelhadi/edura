import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";
import { createTempStudent } from "@/lib/services/temp-students/temp-students";

export const dynamic = "force-dynamic";

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
