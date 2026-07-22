import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createSubscriptionCheckout } from "@/lib/services/subscriptions/subscriptions";

export const dynamic = "force-dynamic";

// No amount/price field on purpose: the charge is the server-side snapshot of
// the plan price configured by the course owner.
const bodySchema = z
  .object({
    courseId: z.string().uuid(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.string().uuid().optional(),
    // Paymob sub-method (gateway path only): card iframe vs mobile wallets.
    method: z.enum(["card", "wallet"]).default("card"),
    // Funding source: the gateway, or the student's own wallet balance.
    payFrom: z.enum(["gateway", "wallet"]).default("gateway"),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("student");
    const body = await parseJson(req, bodySchema);
    return ok(await createSubscriptionCheckout(body, user), { status: 201 });
  }),
  30,
  30,
);
