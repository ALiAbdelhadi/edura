import { z } from "zod";
import { parseJson } from "@/lib/validation/zod";
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  nameSchema,
  localeSchema,
} from "@/lib/validation/common";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { ok } from "@/lib/http/envelope";
import { registerTeacher } from "@/lib/services/auth/register";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.optional(),
  locale: localeSchema,
});

// Same budget as the center door (10/10, not the 20/20 of student/parent):
// a teacher account needs super_admin approval, so a flood here costs staff
// review time, not just rows.
export const POST = withRateLimit(
  withErrors(async (req) => {
    const input = await parseJson(req, bodySchema);
    const result = await registerTeacher(input);
    return ok(result, { status: 201 });
  }),
  10,
  10,
);
