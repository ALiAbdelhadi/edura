import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { delegatedWithCenter } from "@/lib/authz/teacher-actor";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { phoneSchema } from "@/lib/validation/common";
import { createTempStudent } from "@/lib/services/temp-students/temp-students";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    grade: z.string().trim().max(60).optional(),
  })
  .strict();

export const POST = delegatedWithCenter(async (req, _ctx, { acting: user }) => {
  const body = await parseJson(req, bodySchema);
  return ok(await createTempStudent(body, user), { status: 201 });
});
