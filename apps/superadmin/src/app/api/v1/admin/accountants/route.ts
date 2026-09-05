import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createAccountant } from "@/lib/services/admin/accountants";
import { emailSchema, passwordSchema, nameSchema, phoneSchema } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

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
