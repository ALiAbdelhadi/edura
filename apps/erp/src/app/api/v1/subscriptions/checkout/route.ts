import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createSubscriptionCheckout } from "@/lib/services/subscriptions/subscriptions";
import { initiateSubscriptionIntent } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

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
