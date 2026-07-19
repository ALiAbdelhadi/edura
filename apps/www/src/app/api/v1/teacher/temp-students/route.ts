import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { delegated } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
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

export const POST = delegated(async (req, _ctx, { acting: user }) => {
  const body = await parseJson(req, bodySchema);
  return ok(await createTempStudent(body, user), { status: 201 });
});
