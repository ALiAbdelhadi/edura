import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { initiateLink, listLinks } from "@repo/server-core/services/parent-links/parent-links";
import { ValidationError } from "@repo/server-core/errors/classes";

const initSchema = z
  .object({
    code: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })
  .refine((d) => d.code || d.email || d.phone, {
    message: "Provide one of: code, email, phone",
  });

export const POST = withErrors(async (req) => {
  const user = await requireRole("parent", "student");
  const data = await parseJson(req, initSchema);

  if (user.role === "student" && data.code) {
    throw new ValidationError("Students cannot use a family code to link; use email or phone");
  }

  const input = data.code
    ? { code: data.code }
    : data.email
      ? { email: data.email }
      : { phone: data.phone! };

  const link = await initiateLink(input, user);
  return ok(link, { status: 201 });
});

export const GET = withErrors(async () => {
  const user = await requireRole("parent", "student");
  const links = await listLinks(user);
  return ok(links);
});
