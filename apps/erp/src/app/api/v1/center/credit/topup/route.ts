import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { initiateCenterCreditTopUp } from "@/lib/services/wallet/center-credit-topup";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    amount: z.number().int().positive(), // piasters; bounds enforced in the service
    method: z.enum(["card", "wallet"]),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

/** Initiate an ONLINE center-credit top-up (Phase 4, D4). Owner only. */
export const POST = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, bodySchema);
  return ok(await initiateCenterCreditTopUp(body, user), { status: 201 });
});
