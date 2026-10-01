import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { createAccountant } from "@repo/server-core/backoffice/admin/accountants";
import { emailSchema, passwordSchema, nameSchema, phoneSchema } from "@repo/server-core/validation/common";

const createSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const POST = withRole("super_admin", async (actor, req) => {
  const body = await parseJson(req, createSchema);
  return ok(await createAccountant(actor, body), { status: 201 });
});
