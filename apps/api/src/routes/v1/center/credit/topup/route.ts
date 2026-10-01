import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { initiateCenterCreditTopUp } from "@repo/server-core/services/wallet/center-credit-topup";

const bodySchema = z
  .object({
    amount: z.number().int().positive(), // piasters; bounds enforced in the service
    method: z.enum(["card", "wallet"]),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  return ok(await initiateCenterCreditTopUp(body, user), { status: 201 });
});
