import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { initiateParentWalletTopUpIntent } from "@/lib/services/wallet/parent-wallet";

export const dynamic = "force-dynamic";

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
