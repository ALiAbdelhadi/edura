import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { createSubscriptionCheckout } from "@repo/server-core/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent } from "@repo/server-core/services/payments/payment-intents";

const bodySchema = z
  .object({
    courseId: z.string().uuid(),
    studentId: z.string().uuid().optional(),
    plan: z.enum(["monthly", "per_session"]),
    sessionId: z.string().uuid().optional(),
    method: z.enum(["card", "wallet"]).default("card"),
    payFrom: z.enum(["gateway", "wallet", "parent_wallet"]).default("gateway"),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("student", "parent");
    const body = await parseJson(req, bodySchema);
    return ok(
      await createSubscriptionCheckout(body, user, initiateSubscriptionIntent),
      { status: 201 },
    );
  }),
  30,
  30,
);
