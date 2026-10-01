import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { initiateParentWalletTopUpIntent } from "@repo/server-core/services/wallet/parent-wallet-facade";

const bodySchema = z
  .object({
    amount: z.number().int().positive(),
    method: z.enum(["card", "wallet"]).default("card"),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("parent");
    const body = await parseJson(req, bodySchema);
    return ok(await initiateParentWalletTopUpIntent(body, user), { status: 201 });
  }),
  30,
  30,
);
