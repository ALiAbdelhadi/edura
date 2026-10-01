import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { delegatedWithCenter } from "@repo/server-core/authz/teacher-actor";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { phoneSchema } from "@repo/server-core/validation/common";
import { createTempStudent } from "@repo/server-core/services/temp-students/temp-students";

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
