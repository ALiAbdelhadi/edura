import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { passwordSchema } from "@repo/server-core/validation/common";
import { claimCredentials } from "@repo/server-core/services/account/credentials";

const bodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    password: passwordSchema,
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const { email, password } = await parseJson(req, bodySchema);

    const finalEmail = await claimCredentials(session, { email, password });

    return ok({
      email: finalEmail,
      message: "Credentials set — you can now sign in with them.",
    });
  }),
  10,
  10,
);
