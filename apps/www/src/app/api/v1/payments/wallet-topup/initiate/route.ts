import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { initiateWalletTopUpIntent } from "@/lib/services/wallet/wallet";

export const dynamic = "force-dynamic";

// The student chooses how much to add; the amount is SERVER-VALIDATED against
// min/max/cap (assertTopupAllowed) and snapshotted onto the intent. The webhook
// settles from the intent row, never from the gateway payload.
const bodySchema = z
  .object({
    amount: z.number().int().positive(),
    method: z.enum(["card", "wallet"]).default("card"),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("student");
    const body = await parseJson(req, bodySchema);
    return ok(await initiateWalletTopUpIntent(body, user), { status: 201 });
  }),
  30,
  30,
);
